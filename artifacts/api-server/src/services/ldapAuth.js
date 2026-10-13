const ldap = require("ldapjs");
const logger = require("../utils/logger");

function getDb() {
  if (global.dbAvailable && global.db) return global.db;
  return require("../db/memory");
}

async function getLdapConfig() {
  try {
    const db = getDb();
    const result = await db.query(
      "SELECT value FROM settings WHERE key = 'ldap_enabled'"
    );
    if (result.rows[0]?.value !== "true") return null;

    const keys = [
      "ldap_url", "ldap_bind_dn", "ldap_bind_password",
      "ldap_base_dn", "ldap_filter", "ldap_attr_username",
      "ldap_attr_name", "ldap_attr_email", "ldap_default_role",
    ];

    const values = await db.query(
      `SELECT key, value FROM settings WHERE key IN (${keys.map((_, i) => `$${i + 1}`).join(",")})`,
      keys
    );

    const config = {};
    values.rows.forEach(r => { config[r.key] = r.value; });

    return {
      url: config.ldap_url || "ldap://localhost:389",
      bindDN: config.ldap_bind_dn || "",
      bindPassword: config.ldap_bind_password || "",
      baseDN: config.ldap_base_dn || "",
      filter: config.ldap_filter || "(sAMAccountName={{username}})",
      attrUsername: config.ldap_attr_username || "sAMAccountName",
      attrName: config.ldap_attr_name || "displayName",
      attrEmail: config.ldap_attr_email || "mail",
      defaultRole: config.ldap_default_role || "staff",
    };
  } catch (e) {
    logger.error("[LDAP] Failed to load config:", e.message);
    return null;
  }
}

function bindClient(url, bindDN, bindPassword) {
  return new Promise((resolve, reject) => {
    const client = ldap.createClient({ url, connectTimeout: 5000 });

    client.on("connectError", (err) => {
      client.destroy();
      reject(new Error(`LDAP connection failed: ${err.message}`));
    });

    client.bind(bindDN, bindPassword, (err) => {
      if (err) {
        client.destroy();
        reject(new Error(`LDAP bind failed: ${err.message}`));
      }
      resolve(client);
    });
  });
}

function searchUser(client, baseDN, filter, username) {
  return new Promise((resolve, reject) => {
    const searchFilter = filter.replace(/{{username}}/g, escapeLdapFilter(username));
    const opts = { filter: searchFilter, scope: "sub", timeLimit: 5 };

    let found = null;

    client.search(baseDN, opts, (err, searchRes) => {
      if (err) {
        client.destroy();
        return reject(new Error(`LDAP search failed: ${err.message}`));
      }

      searchRes.on("searchEntry", (entry) => {
        found = entry.pojo;
      });

      searchRes.on("error", (err) => {
        client.destroy();
        reject(new Error(`LDAP search error: ${err.message}`));
      });

      searchRes.on("end", () => {
        client.destroy();
        resolve(found);
      });
    });
  });
}

function escapeLdapFilter(str) {
  return str.replace(/[*()\\\0]/g, "\\$&");
}

async function authenticateUser(username, password) {
  const config = await getLdapConfig();
  if (!config) return null;

  try {
    logger.info(`[LDAP] Authenticating: ${username}`);

    let client;
    if (config.bindDN && config.bindPassword) {
      client = await bindClient(config.url, config.bindDN, config.bindPassword);
    } else {
      client = await bindClient(config.url, "", "");
    }

    const userEntry = await searchUser(client, config.baseDN, config.filter, username);

    if (!userEntry) {
      logger.warn(`[LDAP] User not found: ${username}`);
      return null;
    }

    const userDN = userEntry.dn;
    const userClient = await bindClient(config.url, userDN, password);

    const nameAttr = userEntry[config.attrName];
    const emailAttr = userEntry[config.attrEmail];

    const userData = {
      username,
      name: typeof nameAttr === "string" ? nameAttr : (Array.isArray(nameAttr) ? nameAttr[0] : username),
      email: typeof emailAttr === "string" ? emailAttr : (Array.isArray(emailAttr) ? emailAttr[0] : ""),
      role: config.defaultRole,
    };

    userClient.destroy();
    logger.info(`[LDAP] Authenticated: ${username} — ${userData.name}`);

    return userData;
  } catch (e) {
    logger.error(`[LDAP] Auth failed for ${username}:`, e.message);
    return null;
  }
}

async function testConnection(dryRun = true) {
  const config = await getLdapConfig();
  if (!config) return { success: false, message: "LDAP not configured" };

  try {
    const client = await bindClient(config.url, config.bindDN, config.bindPassword);
    client.destroy();

    if (!dryRun) {
      const client2 = await bindClient(config.url, config.bindDN, config.bindPassword);
      const result = await searchUser(client2, config.baseDN, config.filter, "*");
      return {
        success: true,
        message: `Connected. Found ${result ? "matching users" : "base DN reachable"}.`,
      };
    }

    return { success: true, message: "LDAP connection successful" };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

async function syncLdapUser(username) {
  const config = await getLdapConfig();
  if (!config) return null;

  try {
    const client = await bindClient(config.url, config.bindDN, config.bindPassword);
    const entry = await searchUser(client, config.baseDN, config.filter, username);

    if (!entry) return null;

    return {
      username,
      name: entry[config.attrName] || username,
      email: entry[config.attrEmail] || "",
      role: config.defaultRole,
    };
  } catch (e) {
    return null;
  }
}

module.exports = { authenticateUser, testConnection, syncLdapUser, getLdapConfig };
