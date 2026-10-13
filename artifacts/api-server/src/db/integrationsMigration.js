const db = require("./index");

const integrationsMigration = `
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name VARCHAR(100) UNIQUE NOT NULL,
  display_name VARCHAR(255),
  category VARCHAR(50) DEFAULT 'sms',
  config_data JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT false,
  last_tested TIMESTAMP,
  last_test_status VARCHAR(50),
  last_test_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE integrations DROP CONSTRAINT IF EXISTS valid_category;
ALTER TABLE integrations ADD CONSTRAINT valid_category
  CHECK (category IN ('sms', 'payment', 'messaging', 'email', 'storage', 'monitoring', 'communication'));

ALTER TABLE integrations ADD COLUMN IF NOT EXISTS last_tested TIMESTAMP;
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS last_test_status VARCHAR(50);
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS last_test_message TEXT;

INSERT INTO integrations (service_name, display_name, category, config_data) VALUES
  ('africas_talking', 'Africa''s Talking', 'sms', '{"username": "", "api_key": "", "sender_id": ""}'),
  ('mpesa', 'M-Pesa', 'payment', '{"consumer_key": "", "consumer_secret": "", "shortcode": "", "passkey": "", "environment": "", "callback_url": ""}'),
  ('airtel_money', 'Airtel Money', 'payment', '{"client_id": "", "client_secret": "", "environment": "", "country": ""}'),
  ('mtn_momo', 'MTN Mobile Money', 'payment', '{"subscription_key": "", "api_user": "", "api_key": "", "environment": "", "country": ""}'),
  ('paystack', 'Paystack', 'payment', '{"secret_key": "", "public_key": "", "currency": "", "webhook_secret": ""}'),
  ('pesalink', 'PesaLink', 'payment', '{"bank_name": "", "account_name": "", "account_number": "", "bank_code": "", "branch_code": "", "reference_prefix": "INV"}'),
  ('whatsapp', 'WhatsApp Business', 'messaging', '{"access_token": "", "phone_number_id": "", "verify_token": ""}'),
  ('sendgrid', 'SendGrid', 'email', '{"api_key": "", "from_email": "", "from_name": ""}'),
  ('twilio', 'Twilio SMS', 'sms', '{"account_sid": "", "auth_token": "", "phone_number": ""}'),
  ('stripe', 'Stripe', 'payment', '{"secret_key": "", "publishable_key": "", "webhook_secret": "", "currency": ""}'),
  ('paypal', 'PayPal', 'payment', '{"client_id": "", "client_secret": "", "environment": "", "webhook_id": ""}'),
  ('flutterwave', 'Flutterwave', 'payment', '{"secret_key": "", "public_key": "", "encryption_key": "", "environment": ""}'),
  ('slack', 'Slack Notifications', 'monitoring', '{"webhook_url": "", "channel": ""}'),
  ('discord', 'Discord Webhook', 'monitoring', '{"webhook_url": ""}'),
  ('smsleopard', 'SMSLeopard', 'sms', '{"api_key": "", "sender_id": ""}'),
  ('bulksms_kenya', 'BulkSMS Kenya', 'sms', '{"username": "", "api_key": "", "sender_id": ""}'),
  ('nexmo', 'Nexmo (Vonage)', 'sms', '{"api_key": "", "api_secret": "", "sender_id": ""}'),
  ('mailgun', 'Mailgun', 'email', '{"api_key": "", "domain": "", "from_email": "", "from_name": ""}'),
  ('aws_ses', 'AWS SES', 'email', '{"access_key_id": "", "secret_access_key": "", "region": "us-east-1", "from_email": "", "from_name": ""}'),
  ('mailchimp', 'Mailchimp', 'email', '{"api_key": "", "list_id": ""}'),
  ('telegram', 'Telegram Bot', 'communication', '{"bot_token": ""}'),
  ('google_cloud_storage', 'Google Cloud Storage', 'storage', '{"project_id": "", "key_filename": "", "bucket_name": ""}')
ON CONFLICT (service_name) DO NOTHING;
`;

async function runIntegrationsMigration() {
  console.log("Running integrations migration...");
  try {
    await db.query(integrationsMigration);
    console.log("Integrations migration done");
    return true;
  } catch (error) {
    console.error("Integrations migration error:", error.message);
    return false;
  }
}

module.exports = { runIntegrationsMigration, integrationsMigration };
