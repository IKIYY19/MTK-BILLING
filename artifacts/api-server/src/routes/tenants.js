/**
 * Tenant Management Routes
 * Super admin only: create, update, delete tenants
 * Tenant admin: view own tenant, update branding, upload logo
 */

const express = require("express");
const { getDb } = require("../db");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const {
  tenantFilter,
  requireSuperAdmin,
  DEFAULT_TENANT_ID,
} = require("../middleware/tenantContext");
const { invalidateDomainCache } = require("../middleware/domainResolver");



// Validate domain format (basic — ISP is responsible for DNS setup)
function isValidDomain(domain) {
  if (!domain) return true; // empty is fine
  return /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain);
}

// Logo upload config
// Save API key for router linking
router.put("/:id/api-key", async (req, res) => {
  try {
    const db = getDb();
    const { api_key } = req.body;
    if (!api_key) {return res.status(400).json({ error: "api_key required" });}
    await db.query(
      "UPDATE tenants SET settings = COALESCE(settings, '{}'::jsonb) || $1::jsonb, updated_at = NOW() WHERE id = $2",
      [JSON.stringify({ api_key }), req.params.id],
    );
    res.json({ success: true, api_key });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
const logosDir = path.join(__dirname, "..", "public", "logos");
if (!fs.existsSync(logosDir)) {fs.mkdirSync(logosDir, { recursive: true });}
const logoUpload = multer({
  storage: multer.diskStorage({
    destination: logosDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || ".png";
      cb(null, `tenant-${req.params.id}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ─── Super Admin: List all tenants ───
router.get("/", requireSuperAdmin, async (req, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      `SELECT t.*,
        (SELECT COUNT(*) FROM customers WHERE tenant_id = t.id) as customer_count,
        (SELECT COUNT(*) FROM mikrotik_connections WHERE tenant_id = t.id) as router_count,
        (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) as user_count
       FROM tenants t ORDER BY t.created_at DESC`,
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Get current tenant (any authenticated user) ───
router.get("/current", async (req, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId || req.user?.tenant_id || DEFAULT_TENANT_ID;
    const result = await db.query("SELECT * FROM tenants WHERE id = $1", [
      tenantId,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Public: Get tenant branding by custom domain (no auth required) ───
// Used by frontends on custom domains to load logos, colors etc.
router.get("/by-domain/:domain", async (req, res) => {
  try {
    const db = getDb();
    const domain = req.params.domain.toLowerCase().replace(/^www\./, "");
    const result = await db.query(
      `SELECT id, name, slug, company_name, logo_url,
              primary_color, secondary_color, accent_color, domain
       FROM tenants
       WHERE LOWER(domain) = $1 AND is_active = true
       LIMIT 1`,
      [domain]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No tenant found for this domain" });
    }
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Super Admin: Create tenant ───
router.post("/", requireSuperAdmin, async (req, res) => {
  try {
    const db = getDb();
    const {
      name,
      slug,
      company_name,
      email,
      phone,
      address,
      domain,
      max_customers,
      max_routers,
    } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ error: "name and slug are required" });
    }

    // Validate domain format
    if (domain && !isValidDomain(domain)) {
      return res.status(400).json({ error: "Invalid domain format. Example: billing.my-isp.co.ke" });
    }

    const existing = await db.query("SELECT id FROM tenants WHERE slug = $1", [
      slug,
    ]);
    if (existing.rows.length > 0) {
      return res
        .status(409)
        .json({ error: "A tenant with this slug already exists" });
    }

    // Validate domain uniqueness
    if (domain) {
      const domainCheck = await db.query(
        "SELECT id FROM tenants WHERE LOWER(domain) = LOWER($1)",
        [domain]
      );
      if (domainCheck.rows.length > 0) {
        return res.status(409).json({ error: "This domain is already registered to another tenant" });
      }
    }

    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO tenants (id, name, slug, company_name, email, phone, address, domain, max_customers, max_routers)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        id,
        name,
        slug,
        company_name || name,
        email,
        phone,
        address,
        domain,
        max_customers || 0,
        max_routers || 0,
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Upload logo ───
router.post("/:id/logo", logoUpload.single("logo"), async (req, res) => {
  try {
    if (!req.file)
      {return res
        .status(400)
        .json({ error: "No logo file uploaded. Use form field: logo" });}
    const db = getDb();
    const logoUrl = `/logos/${req.file.filename}`;
    await db.query(
      "UPDATE tenants SET logo_url = $1, updated_at = NOW() WHERE id = $2",
      [logoUrl, req.params.id],
    );
    res.json({ logo_url: logoUrl, message: "Logo uploaded successfully" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Update tenant (super admin or tenant admin for own tenant) ───
router.put("/:id", async (req, res) => {
  try {
    const db = getDb();
    const isSuperAdmin = req.user?.role === "admin" && !req.user?.tenant_id;
    const isOwnTenant = req.user?.tenant_id === req.params.id;
    if (!isSuperAdmin && !isOwnTenant) {
      return res
        .status(403)
        .json({ error: "You can only edit your own tenant" });
    }

    const {
      name,
      company_name,
      email,
      phone,
      address,
      logo_url,
      primary_color,
      secondary_color,
      accent_color,
      domain,
      is_active,
      max_customers,
      max_routers,
    } = req.body;

    // Validate domain format
    if (domain !== undefined && domain !== null && !isValidDomain(domain)) {
      return res.status(400).json({ error: "Invalid domain format. Example: billing.my-isp.co.ke" });
    }

    const existing = await db.query("SELECT * FROM tenants WHERE id = $1", [
      req.params.id,
    ]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Validate domain uniqueness (allow keeping the same domain)
    if (domain && domain !== existing.rows[0].domain) {
      const domainCheck = await db.query(
        "SELECT id FROM tenants WHERE LOWER(domain) = LOWER($1) AND id != $2",
        [domain, req.params.id]
      );
      if (domainCheck.rows.length > 0) {
        return res.status(409).json({ error: "This domain is already registered to another tenant" });
      }
      // Invalidate old domain in cache
      invalidateDomainCache(existing.rows[0].domain);
    }

    const result = await db.query(
      `UPDATE tenants SET
        name = COALESCE($1, name),
        company_name = COALESCE($2, company_name),
        email = COALESCE($3, email),
        phone = COALESCE($4, phone),
        address = COALESCE($5, address),
        logo_url = COALESCE($6, logo_url),
        primary_color = COALESCE($7, primary_color),
        secondary_color = COALESCE($8, secondary_color),
        accent_color = COALESCE($9, accent_color),
        domain = COALESCE($10, domain),
        is_active = COALESCE($11, is_active),
        max_customers = COALESCE($12, max_customers),
        max_routers = COALESCE($13, max_routers),
        updated_at = NOW()
       WHERE id = $14 RETURNING *`,
      [
        name,
        company_name,
        email,
        phone,
        address,
        logo_url,
        primary_color,
        secondary_color,
        accent_color,
        domain,
        is_active,
        max_customers,
        max_routers,
        req.params.id,
      ],
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Super Admin: Delete tenant ───
router.delete("/:id", requireSuperAdmin, async (req, res) => {
  try {
    const db = getDb();
    if (req.params.id === DEFAULT_TENANT_ID) {
      return res
        .status(400)
        .json({ error: "Cannot delete the default tenant" });
    }
    await db.query("DELETE FROM tenants WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Get tenant stats ───
router.get("/:id/stats", async (req, res) => {
  try {
    const db = getDb();
    const isSuperAdmin = req.user?.role === "admin" && !req.user?.tenant_id;
    const isOwnTenant = req.user?.tenant_id === req.params.id;
    if (!isSuperAdmin && !isOwnTenant) {
      return res.status(403).json({ error: "Access denied" });
    }

    const stats = await db.query(
      `SELECT
        (SELECT COUNT(*) FROM customers WHERE tenant_id = $1) as customers,
        (SELECT COUNT(*) FROM customers WHERE tenant_id = $1 AND status = 'active') as active_customers,
        (SELECT COUNT(*) FROM subscriptions WHERE tenant_id = $1 AND status = 'active') as active_subs,
        (SELECT COUNT(*) FROM mikrotik_connections WHERE tenant_id = $1) as routers,
        (SELECT COUNT(*) FROM users WHERE tenant_id = $1) as users,
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE tenant_id = $1) as total_revenue,
        (SELECT COUNT(*) FROM tickets WHERE tenant_id = $1 AND status != 'closed') as open_tickets`,
      [req.params.id],
    );
    res.json(stats.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
