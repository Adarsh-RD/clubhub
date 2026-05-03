require('dotenv').config({ path: __dirname + '/.env' });
const { pool } = require('./db');

async function run() {
    try {
        console.log('Adding reset_token columns to users table...');
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255),
            ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP WITH TIME ZONE;
        `);
        console.log('Successfully added reset_token columns.');
    } catch (e) {
        console.error('Failed:', e);
    } finally {
        process.exit();
    }
}
run();
