const db = require('./index');

async function addReviewsTable() {
  try {
    console.log('Creating reviews table...');
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        service_quality VARCHAR(50) NOT NULL,
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Created reviews table');
    
    await db.query('CREATE INDEX IF NOT EXISTS idx_reviews_customer_id ON reviews(customer_id)');
    console.log('✓ Created customer_id index');
    
    await db.query('CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating)');
    console.log('✓ Created rating index');
    
    await db.query('CREATE INDEX IF NOT EXISTS idx_reviews_service_quality ON reviews(service_quality)');
    console.log('✓ Created service_quality index');
    
    console.log('Reviews table created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error creating reviews table:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

addReviewsTable();
