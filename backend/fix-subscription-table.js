require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }
});

async function fix() {
    try {
        console.log('Adding subscribed_at column to club_subscriptions...');
        await pool.query('ALTER TABLE club_subscriptions ADD COLUMN IF NOT EXISTS subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
        console.log('✅ Column added successfully');
        process.exit(0);
    } catch (e) {
        console.error('❌ SQL Error:', e.message);
        process.exit(1);
    }
}

fix();
