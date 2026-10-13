/**
 * Customer Portal Authentication
 * Secure token-based auth for customer self-service portal
 */

const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../middleware/auth");
const billingData = require("../services/billingData");
const { audit } = require("../utils/audit");

const crypto = require("crypto");
const CUSTOMER_JWT_SECRET = crypto
  .createHmac("sha256", JWT_SECRET)
  .update("customer-portal-auth")
  .digest("hex");
const CUSTOMER_JWT_EXPIRES = "24h";
const notificationService = require("../services/notificationService");
router.use(audit.customerPortalAuthMiddleware);

// Generate secure PIN hash
const hashPIN = async (pin) => await bcrypt.hash(pin, 10);
const verifyPIN = async (pin, hash) => await bcrypt.compare(pin, hash);
const isValidPIN = (pin) => /^\d{4,8}$/.test(String(pin || ""));
const createCustomerToken = (customer) =>
  jwt.sign(
    {
      customerId: customer.id,
      phone: customer.phone,
      type: "customer",
    },
    CUSTOMER_JWT_SECRET,
    { expiresIn: CUSTOMER_JWT_EXPIRES },
  );

const verifyCustomerToken = (token) => {
  const decoded = jwt.verify(token, CUSTOMER_JWT_SECRET);
  if (decoded.type !== "customer" || !decoded.customerId) {
    throw new Error("Invalid customer token");
  }
  return decoded;
};

// POST /api/portal/auth/login
router.post("/login", async (req, res) => {
  try {
    const { phone, pin, username, password } = req.body;
    const phoneLogin = Boolean(phone && pin);
    const usernameLogin = Boolean(username && password);
    if (phoneLogin === usernameLogin) {
      return res.status(400).json({
        error: "Enter either your phone and PIN or your username and password",
      });
    }
    if (phoneLogin && !isValidPIN(pin)) {
      return res.status(400).json({ error: "PIN must be 4-8 digits" });
    }

    const customers = await billingData.listCustomers();
    const normalizedPhone = normalizePhone(phone);
    if (phoneLogin && !normalizedPhone) {
      return res.status(400).json({ error: "A valid phone number is required" });
    }
    const cust = customers.find((customer) => {
      if (customer.status !== "active") return false;
      return phoneLogin
        ? normalizePhone(customer.phone) === normalizedPhone
        : customer.portal_username === username;
    });

    if (!cust) {
      return res.status(401).json({ error: "Invalid login credentials" });
    }

    if (phoneLogin && !cust.portal_pin_hash) {
      const defaultPin = normalizedPhone.replace(/\D/g, "").slice(-4);
      if (pin !== defaultPin) {
        return res.status(401).json({
          error: "First-time PIN is the last four digits of your phone number",
        });
      }
      const newPinHash = await hashPIN(pin);
      await updateCustomerFields(cust.id, {
        portal_pin_hash: newPinHash,
        last_portal_login: new Date().toISOString(),
      });
    } else if (phoneLogin) {
      const valid = await verifyPIN(pin, cust.portal_pin_hash);
      if (!valid) {
        return res.status(401).json({ error: "Invalid login credentials" });
      }
      await updateCustomerFields(cust.id, {
        last_portal_login: new Date().toISOString(),
      });
    } else {
      const passwordHashes = [cust.portal_password_hash, cust.portal_pin_hash].filter(
        Boolean,
      );
      let valid = false;
      for (const hash of passwordHashes) {
        if (await bcrypt.compare(String(password), hash)) {
          valid = true;
          break;
        }
      }
      if (!valid) {
        return res.status(401).json({ error: "Invalid login credentials" });
      }
      await updateCustomerFields(cust.id, {
        last_portal_login: new Date().toISOString(),
      });
    }

    // Generate customer-specific token
    req.customer = cust;
    const token = createCustomerToken(cust);

    res.json({
      token,
      customer: {
        id: cust.id,
        name: cust.name,
        phone: cust.phone,
        email: cust.email,
        status: cust.status,
      },
    });
  } catch (error) {
    console.error("Portal login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/token-login", async (req, res) => {
  try {
    const tokenValue = req.body?.token;
    if (typeof tokenValue !== "string" || !tokenValue.trim()) {
      return res.status(400).json({ error: "Portal token is required" });
    }

    const customers = await billingData.listCustomers();
    const customer = customers.find(
      (item) =>
        item.status === "active" && item.portal_token === tokenValue.trim(),
    );
    if (!customer) {
      return res.status(401).json({ error: "Invalid or expired portal link" });
    }

    if (
      customer.portal_token_expires &&
      new Date(customer.portal_token_expires) < new Date()
    ) {
      return res.status(401).json({ error: "Portal link has expired" });
    }

    req.customer = customer;
    res.json({
      token: createCustomerToken(customer),
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        status: customer.status,
      },
    });
  } catch (error) {
    console.error("Portal token login error:", error);
    res.status(500).json({ error: "Portal login failed" });
  }
});

// GET /api/portal/auth/me
router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token" });
    }

    const decoded = jwt.verify(authHeader.split(" ")[1], CUSTOMER_JWT_SECRET);
    const customer = await billingData.getCustomerById(decoded.customerId);

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    req.customer = customer;
    const { id, name, phone, email, status, address, created_at } = customer;
    res.json({ id, name, phone, email, status, address, created_at });
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
});

// POST /api/portal/auth/change-pin
router.post("/change-pin", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token" });
    }

    const decoded = jwt.verify(authHeader.split(" ")[1], CUSTOMER_JWT_SECRET);
    const { currentPIN, newPIN } = req.body;

    if (!currentPIN || !newPIN) {
      return res
        .status(400)
        .json({ error: "Current PIN and new PIN required" });
    }

    if (!isValidPIN(newPIN)) {
      return res.status(400).json({ error: "PIN must be 4-8 digits" });
    }

    const customer = await billingData.getCustomerById(decoded.customerId);
    req.customer = customer;

    if (!customer?.portal_pin_hash) {
      return res.status(400).json({ error: "No PIN set. Please login first." });
    }

    const valid = await verifyPIN(currentPIN, customer.portal_pin_hash);
    if (!valid) {
      return res.status(401).json({ error: "Current PIN is incorrect" });
    }

    const newPinHash = await hashPIN(newPIN);
    await updateCustomerFields(decoded.customerId, {
      portal_pin_hash: newPinHash,
    });

    res.json({ message: "PIN changed successfully" });
  } catch (error) {
    console.error("Change PIN error:", error);
    res.status(500).json({ error: "Failed to change PIN" });
  }
});

const normalizePhone = (value) => String(value || "").replace(/\s/g, "");

// Read and update portal credentials through the same billing store used by customer management.
async function findCustomerByPhone(phone) {
  const normalizedPhone = normalizePhone(phone);
  const customers = await billingData.listCustomers();
  return customers.find(
    (customer) => normalizePhone(customer.phone) === normalizedPhone,
  ) || null;
}

const customerAuthFields = new Set([
  "portal_pin_hash",
  "last_portal_login",
  "pin_reset_code",
  "pin_reset_expires",
]);

async function updateCustomerFields(customerId, fields) {
  const updates = Object.entries(fields).filter(([field]) =>
    customerAuthFields.has(field),
  );
  if (updates.length === 0) return;

  if (global.dbAvailable && global.db) {
    const assignments = updates
      .map(([field], index) => `${field} = $${index + 1}`)
      .join(", ");
    await global.db.query(
      `UPDATE customers SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = $${updates.length + 1}`,
      [...updates.map(([, value]) => value), customerId],
    );
  } else {
    await billingData.updateCustomer(customerId, Object.fromEntries(updates));
  }
}

// POST /api/portal/auth/forgot-pin
router.post("/forgot-pin", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: "Phone number required" });
    }

    const customer = await findCustomerByPhone(phone);
    if (!customer) {
      return res
        .status(404)
        .json({ error: "Customer not found with this phone number" });
    }
    req.customer = customer;

    // Generate 6-digit reset code
    const resetCode = String(Math.floor(100000 + Math.random() * 900000));
    const resetExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes

    await updateCustomerFields(customer.id, {
      pin_reset_code: resetCode,
      pin_reset_expires: resetExpiry,
    });

    // Try to send reset code via SMS
    try {
      await notificationService.triggerSMS("password_reset", {
        customer,
        reset_code: resetCode,
      }).catch((e) => console.error('customerAuth.js async op failed:', e?.message || e));
    } catch (smsErr) {
      // SMS not configured - silently continue
    }

    // Try to send reset code via WhatsApp
    try {
      const wa = await notificationService.getWhatsAppService();
      await wa
        .sendMessage(
          customer.phone.replace(/^0/, "254"),
          `Your internet service password reset code is: ${resetCode}. It expires in 30 minutes.`,
        )
        .catch((e) => console.error('customerAuth.js async op failed:', e?.message || e));
    } catch (waErr) {
      // WhatsApp not configured - silently continue
    }

    res.json({
      success: true,
      message: "Reset code sent to your phone",
      // In development, return the code. In production, only send via SMS.
      resetCode: process.env.NODE_ENV === "production" ? undefined : resetCode,
      reset_code: process.env.NODE_ENV === "production" ? undefined : resetCode,
    });
  } catch (error) {
    console.error("Forgot PIN error:", error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

// POST /api/portal/auth/reset-pin
router.post("/reset-pin", async (req, res) => {
  try {
    const { phone, resetCode, newPIN } = req.body;

    if (!phone || !resetCode || !newPIN) {
      return res
        .status(400)
        .json({ error: "Phone, reset code, and new PIN required" });
    }
    if (!isValidPIN(newPIN)) {
      return res.status(400).json({ error: "PIN must be 4-8 digits" });
    }

    const customer = await findCustomerByPhone(phone);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }
    req.customer = customer;

    // Validate reset code
    if (!customer.pin_reset_code || customer.pin_reset_code !== resetCode) {
      return res.status(400).json({ error: "Invalid reset code" });
    }

    if (
      customer.pin_reset_expires &&
      new Date(customer.pin_reset_expires) < new Date()
    ) {
      return res
        .status(400)
        .json({ error: "Reset code has expired. Request a new one." });
    }

    // Hash and store new PIN
    const newPinHash = await hashPIN(newPIN);
    await updateCustomerFields(customer.id, {
      portal_pin_hash: newPinHash,
      pin_reset_code: null,
      pin_reset_expires: null,
    });

    res.json({
      success: true,
      message: "PIN reset successfully. You can now login with your new PIN.",
    });
  } catch (error) {
    console.error("Reset PIN error:", error);
    res.status(500).json({ error: "Failed to reset PIN" });
  }
});

// Middleware for customer portal auth
const authenticateCustomer = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyCustomerToken(token);
    req.customerId = decoded.customerId;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

module.exports = router;
module.exports.authenticateCustomer = authenticateCustomer;
module.exports.verifyCustomerToken = verifyCustomerToken;
