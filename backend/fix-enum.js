require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "postgres",
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        await pool.query("ALTER TYPE registration_status ADD VALUE 'waitlisted'");
        console.log('Enum updated successfully');
    } catch (e) {
        if (e.message.includes('already exists')) {
            console.log('Enum already updated');
        } else {
            console.error('Error adding to enum:', e);
        }
    } finally {
        process.exit(0);
    }
}
run();
