// migrate-add-dob-year.js — Adds dob and year columns to users table
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'postgres',
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
  const client = await pool.connect();
  try {
    // Add dob column (DATE type)
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS dob DATE;
    `);
    console.log('✅ Added dob column');

    // Add year column (e.g., "3rd Year")
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS year VARCHAR(20);
    `);
    console.log('✅ Added year column');

    console.log('🎉 Migration complete!');
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log('ℹ️  Columns already exist, skipping.');
    } else {
      console.error('❌ Migration error:', err.message);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
