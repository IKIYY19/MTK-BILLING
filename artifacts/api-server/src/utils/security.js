/**
 * Security Validator
 * Ensures production environment has secure secrets configured
 */

const crypto = require('crypto');

// Generate secure random string
function generateSecret(length = 64) {
  return crypto.randomBytes(length).toString('hex');
}

// Check if value looks like a default/placeholder
function isDefaultSecret(value) {
  if (!value) {return true;}
  const defaults = [
    'change-this',
    'change-me',
    'your-',
    'default',
    'secret',
    'password',
    'admin',
    'test',
    'example',
  ];
  return defaults.some(d => value.toLowerCase().includes(d));
}

// Validate production secrets
function validateSecrets() {
  const warnings = [];
  const isProduction = process.env.NODE_ENV === 'production';

  // JWT Secret
  if (!process.env.JWT_SECRET || isDefaultSecret(process.env.JWT_SECRET)) {
    if (isProduction) {
      warnings.push('⚠️  CRITICAL: JWT_SECRET is using a default value in production!');
    } else {
      process.env.JWT_SECRET = generateSecret(64);
      console.log('🔑 Auto-generated secure JWT_SECRET');
    }
  }

  // Encryption Key
  if (!process.env.ENCRYPTION_KEY || isDefaultSecret(process.env.ENCRYPTION_KEY)) {
    if (isProduction) {
      warnings.push('⚠️  CRITICAL: ENCRYPTION_KEY is using a default value in production!');
    } else {
      process.env.ENCRYPTION_KEY = 'dev-encryption-key-32-bytes-long!!';
      console.log('🔑 Using stable development ENCRYPTION_KEY');
    }
  }

  // Warn about production defaults
  if (warnings.length > 0) {
    console.error('\n' + '='.repeat(60));
    console.error('SECURITY WARNINGS');
    console.error('='.repeat(60));
    warnings.forEach(w => console.error(w));
    console.error('\nGenerate secure values with:');
    console.error('  openssl rand -hex 64  # For JWT_SECRET');
    console.error('  openssl rand -hex 32  # For ENCRYPTION_KEY');
    console.error('='.repeat(60) + '\n');
  }

  return warnings.length === 0;
}

module.exports = {
  generateSecret,
  isDefaultSecret,
  validateSecrets,
};
