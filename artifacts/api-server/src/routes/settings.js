/**
 * Settings API Routes
 * Stores application-wide settings
 */

const express = require("express");
const { getDb } = require("../db");
const router = express.Router();
const slack = require("../services/slackNotifier");



// Helper to get setting value from database
async function getSetting(key, defaultValue = "") {
  if (!getDb()) {
    // Fallback to in-memory if database not available
    return defaultValue;
  }
  try {
    const result = await getDb().query(
      "SELECT value FROM settings WHERE key = $1",
      [key],
    );
    return result.rows[0]?.value || defaultValue;
  } catch (error) {
    console.error(`Error getting setting ${key}:`, error);
    return defaultValue;
  }
}

// Helper to set setting value in database
async function setSetting(key, value) {
  if (!getDb()) {
    return false;
  }
  try {
    await getDb().query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
      [key, value],
    );
    return true;
  } catch (error) {
    console.error(`Error setting ${key}:`, error);
    return false;
  }
}

// Helper to get all settings as object
async function getAllSettings() {
  if (!getDb()) {
    // Fallback to default values
    return {
      company_name: "",
      company_logo: "",
      contact_email: "",
      contact_phone: "",
      address: "",
      city: "",
      country: "",
      timezone: "Africa/Nairobi",
      currency: "KES",
      currency_symbol: "KES",
      date_format: "DD/MM/YYYY",
      invoice_prefix: "INV-",
      invoice_start_number: "1001",
      payment_terms: "14",
      tax_rate: "16",
      primary_color: "#3b82f6",
      secondary_color: "#1e293b",
      branding_title: "",
      slack_webhook_url: "",
    };
  }

  const defaults = {
    company_name: "",
    company_logo: "",
    contact_email: "",
    contact_phone: "",
    address: "",
    city: "",
    country: "",
    timezone: "Africa/Nairobi",
    currency: "KES",
    currency_symbol: "KES",
    date_format: "DD/MM/YYYY",
    invoice_prefix: "INV-",
    invoice_start_number: "1001",
    payment_terms: "14",
    tax_rate: "16",
    primary_color: "#3b82f6",
    secondary_color: "#1e293b",
    branding_title: "",
    slack_webhook_url: "",
  };

  try {
    const result = await getDb().query("SELECT key, value FROM settings");
    const settings = { ...defaults };
    result.rows.forEach((row) => {
      settings[row.key] = row.value;
    });
    return settings;
  } catch (error) {
    console.error("Error getting all settings:", error);
    return defaults;
  }
}

// In-memory settings store (fallback when database not available)
const settingsStore = {
  company_name: "",
  company_logo: "",
  contact_email: "",
  contact_phone: "",
  address: "",
  city: "",
  country: "",
  timezone: "Africa/Nairobi",
  currency: "KES",
  currency_symbol: "KES",
  date_format: "DD/MM/YYYY",
  invoice_prefix: "INV-",
  invoice_start_number: "1001",
  payment_terms: "14",
  tax_rate: "16",
  primary_color: "#3b82f6",
  secondary_color: "#1e293b",
  branding_title: "",
  slack_webhook_url: "",
};

// WireGuard settings store
const wireguardStore = {
  enabled: false,
  server_port: "51820",
  server_private_key: "",
  server_public_key: "",
  server_address: "10.0.0.1",
  server_dns: "1.1.1.1",
  peers: [],
};

// Default permissions (can be overridden via API)
const permissionsStore = {
  admin: ["*"],
  staff: [
    "billing:read",
    "billing:write",
    "customers:read",
    "customers:write",
    "reports:read",
  ],
  technician: ["network:read", "network:write", "monitoring:read"],
  reseller: [
    "customers:read",
    "customers:write",
    "billing:read",
    "invoices:write",
  ],
  customer: ["own:read", "billing:read", "tickets:write"],
};

// Feature access by role
const featureAccessStore = {
  admin: [
    "dashboard",
    "integrations",
    "settings",
    "billing",
    "customers",
    "plans",
    "subscriptions",
    "invoices",
    "payments",
    "wallet",
    "sms",
    "whatsapp",
    "network-map",
    "monitoring",
    "agents",
    "auto-suspend",
    "reports",
    "analytics",
    "pppoe",
    "hotspot",
    "vouchers",
    "network-services",
    "ipam",
    "olt",
    "radius",
    "tickets",
    "captive-portal",
    "bandwidth",
    "resellers",
    "backups",
    "inventory",
    "users",
    "audit-logs",
  ],
  staff: [
    "dashboard",
    "billing",
    "customers",
    "plans",
    "subscriptions",
    "invoices",
    "payments",
    "wallet",
    "sms",
    "whatsapp",
    "network-map",
    "monitoring",
    "reports",
    "analytics",
    "pppoe",
    "hotspot",
    "vouchers",
    "tickets",
  ],
  reseller: [
    "dashboard",
    "billing",
    "customers",
    "plans",
    "subscriptions",
    "invoices",
    "payments",
    "wallet",
  ],
  customer: [],
};

// Payment gateway settings
const paymentGatewayStore = {
  mpesa: {
    enabled: false,
    consumer_key: "",
    consumer_secret: "",
    passkey: "",
    shortcode: "",
    environment: "",
  },
  stripe: {
    enabled: false,
    publishable_key: "",
    secret_key: "",
    webhook_secret: "",
  },
  paypal: {
    enabled: false,
    client_id: "",
    client_secret: "",
    mode: "",
  },
};

// Bank paybill settings - Kenyan banks
const bankPaybillStore = {
  enabled: false,
  banks: [],
};

// Get settings
router.get("/", async (req, res) => {
  const settings = await getAllSettings();
  res.json(settings);
});

// Update settings
router.put("/", async (req, res) => {
  const settings = req.body;

  // Configure Slack webhook URL if provided
  if (settings.slack_webhook_url !== undefined) {
    slack.configure(settings.slack_webhook_url);
  }

  if (!getDb()) {
    // Fallback to in-memory if database not available
    Object.assign(settingsStore, settings);
    res.json(settingsStore);
    return;
  }

  try {
    // Save each setting to the database
    for (const [key, value] of Object.entries(settings)) {
      await setSetting(key, value);
    }

    const updatedSettings = await getAllSettings();
    res.json(updatedSettings);
  } catch (error) {
    console.error("Error updating settings:", error);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// Set a single setting key
router.post("/", async (req, res) => {
  const { key, value } = req.body;
  if (!key) {
    return res.status(400).json({ error: "Key is required" });
  }

  try {
    await setSetting(key, value);
    res.json({ success: true, key, value });
  } catch (error) {
    console.error("Error setting value:", error);
    res.status(500).json({ error: "Failed to set value" });
  }
});

const REMOVED_FEATURES = ["topology", "router-linking", "devices", "templates", "mikrotik-api"];
// Get permissions
router.get("/permissions", (req, res) => { const cleaned = {}; for (const [role, features] of Object.entries(featureAccessStore)) { cleaned[role] = features.filter(f => !REMOVED_FEATURES.includes(f)); } res.json(cleaned);
});

// Update permissions
router.put("/permissions", (req, res) => {
  Object.assign(featureAccessStore, req.body); for (const [role, features] of Object.entries(featureAccessStore)) { featureAccessStore[role] = features.filter(f => !REMOVED_FEATURES.includes(f)); }
});

// Get payment gateway settings
router.get("/payment-gateways", (req, res) => {
  res.json(paymentGatewayStore);
});

// Update payment gateway settings
router.put("/payment-gateways", (req, res) => {
  Object.assign(paymentGatewayStore, req.body);
  res.json(paymentGatewayStore);
});

// Get bank paybill settings
router.get("/bank-paybills", (req, res) => {
  res.json(bankPaybillStore);
});

// Update bank paybill settings
router.put("/bank-paybills", (req, res) => {
  Object.assign(bankPaybillStore, req.body);
  res.json(bankPaybillStore);
});

// Get WireGuard settings
router.get("/wireguard", (req, res) => {
  res.json(wireguardStore);
});

// Update WireGuard settings
router.put("/wireguard", (req, res) => {
  Object.assign(wireguardStore, req.body);
  res.json(wireguardStore);
});

// Add WireGuard peer
router.post("/wireguard/peers", (req, res) => {
  const { name, public_key, allowed_ips, preshared_key } = req.body;
  const peer = {
    id: Date.now().toString(),
    name,
    public_key,
    allowed_ips,
    preshared_key,
    enabled: true,
    created_at: new Date().toISOString(),
  };
  wireguardStore.peers.push(peer);
  res.json(peer);
});

// Update WireGuard peer
router.put("/wireguard/peers/:id", (req, res) => {
  const { id } = req.params;
  const peerIndex = wireguardStore.peers.findIndex((p) => p.id === id);
  if (peerIndex === -1) {
    return res.status(404).json({ error: "Peer not found" });
  }
  Object.assign(wireguardStore.peers[peerIndex], req.body);
  res.json(wireguardStore.peers[peerIndex]);
});

// Delete WireGuard peer
router.delete("/wireguard/peers/:id", (req, res) => {
  const { id } = req.params;
  wireguardStore.peers = wireguardStore.peers.filter((p) => p.id !== id);
  res.json({ success: true });
});

// Generate WireGuard client config
router.post("/wireguard/config/:id", (req, res) => {
  const { id } = req.params;
  const peer = wireguardStore.peers.find((p) => p.id === id);
  if (!peer) {
    return res.status(404).json({ error: "Peer not found" });
  }

  const config = `[Interface]
PrivateKey = ${peer.private_key || "YOUR_PRIVATE_KEY"}
Address = ${peer.allowed_ips}
DNS = ${wireguardStore.server_dns}

[Peer]
PublicKey = ${wireguardStore.server_public_key}
Endpoint = ${req.body.endpoint || "YOUR_SERVER_IP:51820"}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25`;

  res.json({ config });
});

// Notification settings store
const notificationSettingsStore = [
  {
    notification_type: "invoice_due",
    enabled: true,
    email_enabled: false,
    sms_enabled: false,
    webhook_enabled: false,
    webhook_url: "",
    email_recipients: "",
    sms_recipients: "",
  },
  {
    notification_type: "invoice_overdue",
    enabled: true,
    email_enabled: false,
    sms_enabled: false,
    webhook_enabled: false,
    webhook_url: "",
    email_recipients: "",
    sms_recipients: "",
  },
  {
    notification_type: "payment_received",
    enabled: true,
    email_enabled: false,
    sms_enabled: false,
    webhook_enabled: false,
    webhook_url: "",
    email_recipients: "",
    sms_recipients: "",
  },
  {
    notification_type: "subscription_activated",
    enabled: true,
    email_enabled: false,
    sms_enabled: false,
    webhook_enabled: false,
    webhook_url: "",
    email_recipients: "",
    sms_recipients: "",
  },
  {
    notification_type: "subscription_suspended",
    enabled: true,
    email_enabled: false,
    sms_enabled: false,
    webhook_enabled: false,
    webhook_url: "",
    email_recipients: "",
    sms_recipients: "",
  },
  {
    notification_type: "low_balance",
    enabled: true,
    email_enabled: false,
    sms_enabled: false,
    webhook_enabled: false,
    webhook_url: "",
    email_recipients: "",
    sms_recipients: "",
  },
  {
    notification_type: "router_offline",
    enabled: true,
    email_enabled: false,
    sms_enabled: false,
    webhook_enabled: false,
    webhook_url: "",
    email_recipients: "",
    sms_recipients: "",
  },
];

// Get notification settings
router.get("/notifications", async (req, res) => {
  if (!getDb()) {
    res.json(notificationSettingsStore);
    return;
  }

  try {
    const result = await getDb().query(
      "SELECT * FROM notification_settings ORDER BY notification_type",
    );
    if (result.rows.length === 0) {
      // Initialize with defaults if table is empty
      for (const setting of notificationSettingsStore) {
        await getDb().query(
          `INSERT INTO notification_settings (notification_type, enabled, email_enabled, sms_enabled, webhook_enabled, webhook_url, email_recipients, sms_recipients)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            setting.notification_type,
            setting.enabled,
            setting.email_enabled,
            setting.sms_enabled,
            setting.webhook_enabled,
            setting.webhook_url,
            setting.email_recipients,
            setting.sms_recipients,
          ],
        );
      }
      const initResult = await getDb().query(
        "SELECT * FROM notification_settings ORDER BY notification_type",
      );
      res.json(initResult.rows);
    } else {
      res.json(result.rows);
    }
  } catch (error) {
    console.error("Error getting notification settings:", error);
    res.status(500).json({ error: "Failed to get notification settings" });
  }
});

// Update notification settings
router.put("/notifications", async (req, res) => {
  const settings = req.body;

  if (!getDb()) {
    // Update in-memory store
    for (const setting of settings) {
      const idx = notificationSettingsStore.findIndex(
        (s) => s.notification_type === setting.notification_type,
      );
      if (idx !== -1) {
        Object.assign(notificationSettingsStore[idx], setting);
      }
    }
    res.json(notificationSettingsStore);
    return;
  }

  try {
    for (const setting of settings) {
      await getDb().query(
        `INSERT INTO notification_settings (notification_type, enabled, email_enabled, sms_enabled, webhook_enabled, webhook_url, email_recipients, sms_recipients)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (notification_type) DO UPDATE SET
           enabled = $2, email_enabled = $3, sms_enabled = $4, webhook_enabled = $5,
           webhook_url = $6, email_recipients = $7, sms_recipients = $8, updated_at = CURRENT_TIMESTAMP`,
        [
          setting.notification_type,
          setting.enabled,
          setting.email_enabled,
          setting.sms_enabled,
          setting.webhook_enabled,
          setting.webhook_url,
          setting.email_recipients,
          setting.sms_recipients,
        ],
      );
    }
    const result = await getDb().query(
      "SELECT * FROM notification_settings ORDER BY notification_type",
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error updating notification settings:", error);
    res.status(500).json({ error: "Failed to update notification settings" });
  }
});

router.post("/ldap/test", async (req, res) => {
  try {
    const ldapAuth = require("../services/ldapAuth");
    const result = await ldapAuth.testConnection(true);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Export the stores for use in other modules
module.exports = router;
module.exports.paymentGatewayStore = paymentGatewayStore;
module.exports.bankPaybillStore = bankPaybillStore;
module.exports.settingsStore = settingsStore;
module.exports.wireguardStore = wireguardStore;
module.exports.notificationSettingsStore = notificationSettingsStore;
