const db = require('./index');

async function addCustomerColumns() {
  try {
    console.log('Adding customer portal columns...');
    
    try {
      await db.query('ALTER TABLE customers ADD COLUMN IF NOT EXISTS wifi_password VARCHAR(255)');
      console.log('✓ Added wifi_password column');
    } catch (err) {
      console.log('wifi_password column:', err.message);
    }
    
    try {
      await db.query('ALTER TABLE customers ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP');
      console.log('✓ Added password_changed_at column');
    } catch (err) {
      console.log('password_changed_at column:', err.message);
    }
    
    try {
      await db.query('ALTER TABLE customers ADD COLUMN IF NOT EXISTS portal_token VARCHAR(255)');
      console.log('✓ Added portal_token column');
    } catch (err) {
      console.log('portal_token column:', err.message);
    }
    
    try {
      await db.query('ALTER TABLE customers ADD COLUMN IF NOT EXISTS portal_token_expires TIMESTAMP');
      console.log('✓ Added portal_token_expires column');
    } catch (err) {
      console.log('portal_token_expires column:', err.message);
    }
    
    try {
      await db.query('CREATE INDEX IF NOT EXISTS idx_customers_portal_token ON customers(portal_token)');
      console.log('✓ Created portal_token index');
    } catch (err) {
      console.log('portal_token index:', err.message);
    }
    
    console.log('All columns added successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error adding columns:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

addCustomerColumns();
