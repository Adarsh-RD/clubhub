// backend/migrate-club-profile.js
require('dotenv').config();
const { poolQuery, pool } = require('./db');

async function runMigration() {
  console.log('🔄 Running migration to add banner_url and bio to clubs table...');
  try {
    console.log('Adding banner_url column if not exists...');
    await poolQuery(`ALTER TABLE clubs ADD COLUMN IF NOT EXISTS banner_url TEXT`);

    console.log('Adding bio column if not exists...');
    await poolQuery(`ALTER TABLE clubs ADD COLUMN IF NOT EXISTS bio TEXT`);

    console.log('✅ Clubs table migration successful!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await pool.end();
  }
}

runMigration();
