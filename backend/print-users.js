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

async function main() {
  const { rows: users } = await pool.query('SELECT id, email, name, role, club_id FROM users');
  console.log('--- USERS IN DATABASE ---');
  console.log(users);
  
  const { rows: clubs } = await pool.query('SELECT id, club_name, club_code FROM clubs');
  console.log('--- CLUBS IN DATABASE ---');
  console.log(clubs);
  
  pool.end();
}
main();
