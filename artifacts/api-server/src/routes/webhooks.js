/**
 * Webhook Routes — CRUD + trigger for event-driven HTTP callbacks.
 *
 * Events:
 *   payment.received   customer.suspended  customer.activated
 *   invoice.created    router.provisioned  *
 */

const express = require("express");
const { getDb } = require("../db");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const crypto = require("crypto");

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "0.0.0.0" || host.endsWith(".localhost")) {
    return true;
  }
  const octets = host.split(".").map(Number);
  if (octets.length === 4 && octets.every((n) => Number.isInteger(n))) {
    const [a, b] = octets;
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
        (a === 100 && b >= 64 && b <= 127)) {
      return true;
    }
  }
  return host.startsWith("fc") || host.startsWith("fd") || host === "::1";
}

function validateWebhookUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return "Webhook URL must be a valid absolute URL";
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return "Webhook URL must use http or https";
  }
  if (parsed.username || parsed.password) {
    return "Webhook URL must not contain credentials";
  }
  if (isPrivateHost(parsed.hostname) && process.env.ALLOW_PRIVATE_WEBHOOKS !== "true") {
    return "Webhook URL must not target a private or loopback address";
  }
  return null;
}

function signedHeaders(webhook, body) {
  const headers = {
    "Content-Type": "application/json",
    "X-Webhook-ID": webhook.id,
  };
  if (webhook.secret) {
    headers["X-Webhook-Signature"] =
      "sha256=" +
      crypto.createHmac("sha256", webhook.secret).update(body).digest("hex");
  }
  return headers;
}

function publicWebhook(row) {
  if (!row) {return row;}
  const { secret, ...safe } = row;
  return { ...safe, has_secret: Boolean(secret) };
}

// ──────────────────────────────────────
// GET /api/webhooks — List all webhooks
// ──────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    if (!global.dbAvailable) {return res.json([]);}
    const result = await getDb().query(
      "SELECT * FROM webhooks ORDER BY created_at DESC"
    );
    res.json(result.rows.map(publicWebhook));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────
// POST /api/webhooks — Create a webhook
// ──────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { url, events, name, secret, enabled } = req.body;
    if (!url || !events || events.length === 0) {
      return res.status(400).json({ error: "URL and events are required" });
    }
    const urlError = validateWebhookUrl(url);
    if (urlError) {
      return res.status(400).json({ error: urlError });
    }
    const id = uuidv4();

    if (!global.dbAvailable) {
      return res.json({
        id,
        url,
        events,
        name: name || "",
        secret: secret || "",
        enabled: enabled !== false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    const result = await getDb().query(
      `INSERT INTO webhooks (id, url, events, name, secret, enabled)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
       [id, url, JSON.stringify(events), name || "", secret || "", enabled !== false]
     );
    res.status(201).json(publicWebhook(result.rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────
// PUT /api/webhooks/:id — Update
// ──────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const { url, events, name, secret, enabled } = req.body;
    if (url !== undefined) {
      const urlError = validateWebhookUrl(url);
      if (urlError) {
        return res.status(400).json({ error: urlError });
      }
    }

    if (!global.dbAvailable) {
      return res.json({ id: req.params.id, ...req.body, updated_at: new Date().toISOString() });
    }

    const result = await getDb().query(
      `UPDATE webhooks
          SET url     = COALESCE($1, url),
              events  = COALESCE($2, events),
              name    = COALESCE($3, name),
              secret  = COALESCE($4, secret),
              enabled = COALESCE($5, enabled),
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING *`,
      [
        url || null,
        events ? JSON.stringify(events) : null,
        name !== undefined ? name : null,
        secret !== undefined ? secret : null,
        enabled !== undefined ? enabled : null,
        req.params.id,
      ]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Webhook not found" });
    }
    res.json(publicWebhook(result.rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────
// DELETE /api/webhooks/:id
// ──────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    if (!global.dbAvailable) {return res.json({ success: true });}
    await getDb().query("DELETE FROM webhooks WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────
// POST /api/webhooks/:id/test — Fire test
// ──────────────────────────────────────
router.post("/:id/test", async (req, res) => {
  try {
    if (!global.dbAvailable) {
      return res.json({ success: true, status: 200, message: "Test payload sent (memory mode — no-op)" });
    }
    const result = await getDb().query(
      "SELECT * FROM webhooks WHERE id = $1",
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Webhook not found" });
    }
    const webhook = result.rows[0];

    const payload = {
      event: "test",
      timestamp: new Date().toISOString(),
      webhook: webhook.name || webhook.id,
      data: { message: "This is a test payload from your MikroTik billing platform" },
    };

    const body = JSON.stringify(payload);
    const headers = signedHeaders(webhook, body);

    const response = await axios.post(webhook.url, body, {
      headers,
      timeout: 10000,
    });
    res.json({ success: true, status: response.status });
  } catch (e) {
    res.json({
      success: false,
      error: e.response ? `HTTP ${e.response.status}: ${e.response.statusText}` : e.message,
    });
  }
});

module.exports = router;

// ────────────────────────────────────────────────────────────
// triggerWebhook(event, data) — fire-and-forget HTTP callbacks
// Called by other modules on important events.
// ────────────────────────────────────────────────────────────
module.exports.triggerWebhook = async (event, data) => {
  try {
    if (!global.dbAvailable) {return;}
    const result = await getDb().query(
      "SELECT * FROM webhooks WHERE enabled = true"
    );
    for (const webhook of result.rows) {
      let events = webhook.events;
      if (typeof events === "string") {
        try { events = JSON.parse(events); } catch { events = []; }
      }
      if (!events.includes(event) && !events.includes("*")) {continue;}
      if (validateWebhookUrl(webhook.url)) {
        console.error("Webhook skipped: invalid or unsafe URL", webhook.id);
        continue;
      }

      const payload = {
        event,
        timestamp: new Date().toISOString(),
        data,
      };
      const body = JSON.stringify(payload);
      const headers = signedHeaders(webhook, body);
      // Fire-and-forget — never block caller
      axios
        .post(webhook.url, body, { headers, timeout: 5000 })
        .catch((e) => {
          console.error('webhooks.js async op failed:', e?.message || e);
          require('../services/opsAlertService').webhookFailure(webhook.url, e?.message || e).catch(() => {});
        });
    }
  } catch (e) {
    console.error("Webhook trigger error:", e.message);
  }
};
