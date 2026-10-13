const crypto = require("crypto");
const { isDefaultSecret } = require("./security");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const isProductionEnv = process.env.NODE_ENV === "production";

let ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  if (isProductionEnv || process.env.NODE_ENV === "test") {
    throw new Error(
      "ENCRYPTION_KEY environment variable is required in production and test environments"
    );
  }

  ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
  process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;
  console.warn(
    "[Encryption] No ENCRYPTION_KEY set; generated random development key"
  );
}

if (isProductionEnv && isDefaultSecret(ENCRYPTION_KEY)) {
  throw new Error(
    "ENCRYPTION_KEY cannot use a default or placeholder value in production"
  );
}

if (ENCRYPTION_KEY.length < 32) {
  const msg = "ENCRYPTION_KEY must be at least 32 characters";
  if (isProductionEnv) throw new Error(msg);
  console.warn(`[Encryption] ${msg}`);
}

function getEncryptionKey() {
  return crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
}

function encrypt(text) {
  if (!text) return null;
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  } catch (e) {
    console.error("[Encryption] Encrypt failed:", e.message);
    return null;
  }
}

function decrypt(encryptedText) {
  if (!encryptedText) return null;
  try {
    const parts = encryptedText.split(":");
    if (parts.length === 2) {
      return decryptLegacyCBC(encryptedText);
    }
    if (parts.length !== 3) return null;
    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (e) {
    if (encryptedText.includes(":")) {
      try {
        return decryptLegacyCBC(encryptedText);
      } catch (_) {}
    }
    return null;
  }
}

function decryptLegacyCBC(encryptedText) {
  const parts = encryptedText.split(":");
  if (parts.length !== 2) return null;
  const [ivHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", getEncryptionKey(), iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function encryptObject(obj) {
  if (!obj) return {};
  const encrypted = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === "string" && value.length > 0) {
      encrypted[key] = encrypt(value);
    } else {
      encrypted[key] = value;
    }
  }
  return encrypted;
}

function decryptObject(obj) {
  if (!obj) return {};
  const decrypted = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === "string" && value.length > 10) {
      decrypted[key] = decrypt(value);
    } else {
      decrypted[key] = value;
    }
  }
  return decrypted;
}

module.exports = {
  encrypt,
  decrypt,
  encryptObject,
  decryptObject,
  getEncryptionKey,
};
