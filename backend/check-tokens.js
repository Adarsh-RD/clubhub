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

async function check() {
    try {
        const { rows } = await pool.query("SELECT email, role, length(fcm_token) as token_len FROM users");
        console.log("Users and token status:");
        console.table(rows);
        process.exit(0);
    } catch (e) {
        console.error('SQL Error:', e.message);
        process.exit(1);
    }
}

check();
