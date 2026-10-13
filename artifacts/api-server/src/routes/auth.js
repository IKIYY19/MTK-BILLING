const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { authenticator } = require("otplib");
const QRCode = require("qrcode");
const { JWT_SECRET } = require("../middleware/auth");
const JWT_EXPIRES = process.env.JWT_EXPIRES || "7d";
const logger = require("../utils/logger");
const { authLimiter } = require("../middleware/rateLimiter");
const { audit } = require("../utils/audit");
const { OAuth2Client } = require("google-auth-library");
const ldapAuth = require("../services/ldapAuth");

router.use(audit.authRequestMiddleware);

// Lazy db getter - avoids requiring pg at module load time
const getDb = () => (global.dbAvailable ? global.db : require("../db/memory"));
const publicRegistrationEnabled =
  process.env.ALLOW_PUBLIC_REGISTRATION === "true";

// ─── REGISTER ───
router.post("/register", authLimiter, async (req, res) => {
  try {
    if (!publicRegistrationEnabled) {
      return res.status(403).json({
        error: "Public registration is disabled. Contact your ISP administrator.",
      });
    }

    if (!req.tenantId) {
      return res.status(400).json({
        error: "Registration is only available through your ISP's configured domain.",
      });
    }

    const db = getDb();
    const { email, password, name } = req.body;
    if (!email || !password || !name)
      {return res
        .status(400)
        .json({ error: "email, password, and name required" });}

    const userRole = "staff";

    const existing = await db.query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);
    if (existing.rows.length > 0)
      {return res.status(409).json({ error: "Email already exists" });}

    const hash = await bcrypt.hash(password, 10);
    const tid = req.tenantId;
    const result = await db.query(
      `INSERT INTO users (id, email, password_hash, name, role, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, email, name, role, tenant_id, created_at`,
      [uuidv4(), email, hash, name, userRole, tid],
    );

    const token = jwt.sign(
      {
        id: result.rows[0].id,
        email: result.rows[0].email,
        role: result.rows[0].role,
        tenant_id: result.rows[0].tenant_id,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES },
    );

    logger.info("User registered", {
      email,
      userId: result.rows[0].id,
      role: userRole,
    });
    audit.userCreated(
      result.rows[0],
      { id: "system", name: "Self-registration", role: "system" },
      req,
    );

    res.status(201).json({ user: result.rows[0], token });
  } catch (e) {
    logger.error("Registration error", {
      error: e.message,
      email: req.body.email,
    });
    res.status(500).json({ error: e.message || String(e) });
  }
});

// ─── LOGIN ───
router.post("/login", authLimiter, async (req, res) => {
  try {
    const db = getDb();
    const { email, password } = req.body;
    if (!email || !password)
      {return res.status(400).json({ error: "email and password required" });}

    const user = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (user.rows.length === 0) {
      const ldapUser = await ldapAuth.authenticateUser(email, password);
      if (ldapUser) {
        const defaultTenant = await db.query("SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1").catch(() => ({ rows: [] }));
        const tenantId = defaultTenant.rows[0]?.id || null;
        const newId = uuidv4();
        const hash = await bcrypt.hash(password, 10);
        await db.query(
          `INSERT INTO users (id, email, password_hash, name, role, tenant_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
           ON CONFLICT (email) DO UPDATE SET name = $4, role = $5`,
          [newId, email, hash, ldapUser.name || email, ldapUser.role, tenantId]
        );
        const newUser = await db.query("SELECT * FROM users WHERE email = $1", [email]);

        const ldapToken = jwt.sign(
          { id: newUser.rows[0].id, email: newUser.rows[0].email, role: newUser.rows[0].role, tenant_id: tenantId },
          JWT_SECRET, { expiresIn: JWT_EXPIRES },
        );
        await audit.userLogin(newUser.rows[0], req);
        logger.info("LDAP user logged in", { email, role: newUser.rows[0].role, ip: req.ip });
        return res.json({ token: ldapToken, user: { id: newUser.rows[0].id, email, name: newUser.rows[0].name, role: newUser.rows[0].role }, ldap: true });
      }

      await audit.userLoginFailed(email, req);
      logger.warn("Login failed - user not found", { email, ip: req.ip });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.rows[0].password_hash);
    if (!valid) {
      const ldapUser = await ldapAuth.authenticateUser(email, password);
      if (ldapUser) {
        const token = jwt.sign(
          { id: user.rows[0].id, email: user.rows[0].email, role: user.rows[0].role, tenant_id: user.rows[0].tenant_id },
          JWT_SECRET, { expiresIn: JWT_EXPIRES },
        );
        await audit.userLogin(user.rows[0], req);
        logger.info("LDAP fallback login", { email, role: user.rows[0].role, ip: req.ip });
        return res.json({ token, user: { id: user.rows[0].id, email, name: user.rows[0].name, role: user.rows[0].role }, ldap: true });
      }

      await audit.userLoginFailed(email, req);
      logger.warn("Login failed - invalid password", {
        email,
        userId: user.rows[0].id,
        ip: req.ip,
      });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check 2FA
    if (user.rows[0].two_factor_enabled) {
      const { two_factor_code } = req.body;
      if (!two_factor_code) {
        await audit.userLoginChallenge(user.rows[0], req);
        return res.status(200).json({
          requires_2fa: true,
          temp_token: jwt.sign(
            { id: user.rows[0].id, step: "2fa" },
            JWT_SECRET,
            { expiresIn: "5m" },
          ),
        });
      }

      const isValid = authenticator.verify({
        token: two_factor_code,
        secret: user.rows[0].two_factor_secret,
      });

      if (!isValid) {
        await audit.userLoginFailed(email, req);
        return res.status(401).json({ error: "Invalid 2FA code" });
      }
    }

    await db.query(
      "UPDATE users SET last_login_at = CURRENT_TIMESTAMP, is_online = true WHERE id = $1",
      [user.rows[0].id],
    );

    const token = jwt.sign(
      {
        id: user.rows[0].id,
        email: user.rows[0].email,
        role: user.rows[0].role,
        tenant_id: user.rows[0].tenant_id,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES },
    );

    logger.info("User logged in", {
      email,
      userId: user.rows[0].id,
      role: user.rows[0].role,
      ip: req.ip,
    });
    audit.userLogin(
      {
        id: user.rows[0].id,
        email: user.rows[0].email,
        name: user.rows[0].name,
        role: user.rows[0].role,
      },
      req,
    );

    res.json({
      user: {
        id: user.rows[0].id,
        email: user.rows[0].email,
        name: user.rows[0].name,
        role: user.rows[0].role,
      },
      token,
    });
  } catch (e) {
    await audit.userLoginError(req);
    logger.error("Login error", { error: e.message, email: req.body.email });
    res.status(500).json({ error: e.message });
  }
});

// ─── LOGOUT ───
router.post("/logout", async (req, res) => {
  try {
    const db = getDb();
    const authHeader = req.headers.authorization;
    let loggedOutUser = null;

    if (authHeader?.startsWith("Bearer ")) {
      try {
        const decoded = jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
        loggedOutUser = decoded;

        // Set user as offline
        await db.query("UPDATE users SET is_online = false WHERE id = $1", [
          decoded.id,
        ]);

        logger.info("User logged out", {
          userId: decoded.id,
          email: decoded.email,
        });
      } catch (e) {
        // Token might be expired, but still try to proceed
        logger.warn("Logout with invalid token", { error: e.message });
      }
    }

    if (loggedOutUser) {
      await audit.userLogout(loggedOutUser, req);
    }
    res.json({ success: true });
  } catch (e) {
    logger.error("Logout error", { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ─── GET ME ───
router.get("/me", async (req, res) => {
  try {
    const db = getDb();
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer "))
      {return res.status(401).json({ error: "No token" });}

    const decoded = jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
    const user = await db.query(
      "SELECT id, email, name, role, created_at, last_login_at FROM users WHERE id = $1",
      [decoded.id],
    );
    if (user.rows.length === 0)
      {return res.status(404).json({ error: "User not found" });}
    res.json(user.rows[0]);
  } catch (e) {
    res.status(401).json({ error: "Invalid token" });
  }
});

// ─── HEARTBEAT (update user activity) ───
router.post("/heartbeat", async (req, res) => {
  try {
    const db = getDb();
    const authHeader = req.headers.authorization;

    console.log("Heartbeat request received");
    console.log("Auth header:", authHeader ? "Present" : "Missing");

    if (!authHeader?.startsWith("Bearer ")) {
      console.log("Heartbeat failed: No valid auth header");
      return res.status(401).json({ error: "Unauthorized" });
    }

    const decoded = jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
    console.log("Heartbeat for user ID:", decoded.id, "Email:", decoded.email);

    const now = new Date();

    const result = await db.query(
      `UPDATE users
       SET last_seen = $1, is_online = true
       WHERE id = $2
       RETURNING id, email, is_online, last_seen`,
      [now.toISOString(), decoded.id],
    );

    console.log("Heartbeat update result:", result.rows[0]);

    res.json({ success: true, last_seen: now.toISOString() });
  } catch (e) {
    console.error("Heartbeat error:", e.message);
    console.error("Heartbeat error stack:", e.stack);
    res.status(500).json({ error: "Failed to update activity" });
  }
});

// ─── Auth middleware (defined before 2FA routes reference it)
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer "))
      {return res.status(401).json({ error: "Authentication required" });}
    const decoded = jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

// ─── 2FA SETUP ─── Generate secret and QR code
router.post("/2fa/setup", authenticate, async (req, res) => {
  try {
    const secret = authenticator.generateSecret();
    const db = getDb();

    await db.query("UPDATE users SET two_factor_secret = $1 WHERE id = $2", [
      secret,
      req.user.id,
    ]);

    const otpauth = authenticator.keyuri(
      req.user.email,
      "MikroTik Billing",
      secret,
    );
    const qrCode = await QRCode.toDataURL(otpauth);

    res.json({ secret, qrCode });
  } catch (e) {
    logger.error("2FA setup error", { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ─── 2FA ENABLE ─── Verify setup code and enable 2FA
router.post("/2fa/enable", authenticate, async (req, res) => {
  try {
    const { code } = req.body;
    const db = getDb();
    const result = await db.query(
      "SELECT two_factor_secret FROM users WHERE id = $1",
      [req.user.id],
    );
    const secret = result.rows[0]?.two_factor_secret;
    console.log(
      "[2FA ENABLE] Secret from DB:",
      secret ? secret.substring(0, 10) + "..." : "MISSING",
    );
    console.log("[2FA ENABLE] Code received:", code);

    if (!secret) {return res.status(400).json({ error: "Setup 2FA first" });}

    const isValid = authenticator.verify({ token: code, secret });
    console.log("[2FA ENABLE] Verify result:", isValid);
    if (!isValid) {return res.status(400).json({ error: "Invalid code" });}

    await db.query("UPDATE users SET two_factor_enabled = true WHERE id = $1", [
      req.user.id,
    ]);
    res.json({ success: true });
  } catch (e) {
    logger.error("2FA enable error", { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ─── 2FA DISABLE ─── Requires current code
router.post("/2fa/disable", authenticate, async (req, res) => {
  try {
    const { code } = req.body;
    const db = getDb();
    const result = await db.query(
      "SELECT two_factor_secret FROM users WHERE id = $1",
      [req.user.id],
    );
    const secret = result.rows[0]?.two_factor_secret;

    const isValid = authenticator.verify({ token: code, secret });
    if (!isValid) {return res.status(400).json({ error: "Invalid code" });}

    await db.query(
      "UPDATE users SET two_factor_enabled = false, two_factor_secret = NULL WHERE id = $1",
      [req.user.id],
    );
    res.json({ success: true });
  } catch (e) {
    logger.error("2FA disable error", { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ─── 2FA STATUS ───
router.get("/2fa/status", authenticate, async (req, res) => {
  try {
    const result = await getDb().query(
      "SELECT two_factor_enabled FROM users WHERE id = $1",
      [req.user.id],
    );
    res.json({ enabled: result.rows[0]?.two_factor_enabled || false });
  } catch (e) {
    logger.error("2FA status error", { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ─── GOOGLE OAUTH ───
router.post("/google", authLimiter, async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential)
      {return res.status(400).json({ error: "Missing credential" });}

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId)
      {return res.status(500).json({ error: "Google OAuth not configured" });}

    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    if (!email)
      {return res.status(400).json({ error: "Email not provided by Google" });}

    const db = getDb();
    let user = await db.query("SELECT * FROM users WHERE email = $1", [email]);

    if (user.rows.length === 0) {
      // Create new user
      const id = uuidv4();
      await db.query(
        `INSERT INTO users (id, email, name, role, google_id, avatar_url, password_hash)
         VALUES ($1, $2, $3, 'staff', $4, $5, '')`,
        [id, email, name || email.split("@")[0], googleId, picture || ""],
      );
      user = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    } else {
      // Update google_id and avatar_url for existing user if not set
      if (!user.rows[0].google_id) {
        await db.query(
          "UPDATE users SET google_id = $1, avatar_url = $2 WHERE id = $3",
          [googleId, picture || "", user.rows[0].id],
        );
        user = await db.query("SELECT * FROM users WHERE id = $1", [
          user.rows[0].id,
        ]);
      }
    }

    // Update last login
    await db.query(
      "UPDATE users SET last_login_at = CURRENT_TIMESTAMP, is_online = true WHERE id = $1",
      [user.rows[0].id],
    );

    const token = jwt.sign(
      {
        id: user.rows[0].id,
        email: user.rows[0].email,
        role: user.rows[0].role,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES },
    );

    logger.info("Google OAuth login", {
      email,
      userId: user.rows[0].id,
      isNew: !user.rows[0].google_id,
    });

    res.json({
      user: {
        id: user.rows[0].id,
        email: user.rows[0].email,
        name: user.rows[0].name,
        role: user.rows[0].role,
        picture: user.rows[0].avatar_url,
      },
      token,
    });
  } catch (e) {
    logger.error("Google OAuth error", { error: e.message });
    res.status(500).json({ error: "OAuth failed" });
  }
});

module.exports = router;
module.exports.JWT_SECRET = JWT_SECRET;
module.exports.authenticate = authenticate;
