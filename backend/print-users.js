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

const getClubById = async (clubId) => {
  const { rows } = await pool.query(
    `SELECT 
       c.*,
       (SELECT COUNT(*) FROM club_subscriptions WHERE club_id = c.id AND is_active = true) AS follower_count,
       (SELECT COUNT(*) FROM announcements WHERE club_id = c.id AND is_active = true) AS post_count,
       (SELECT COUNT(*) FROM users WHERE club_id = c.id) AS member_count
     FROM clubs c
     WHERE c.id=$1 AND c.is_active=true 
     LIMIT 1`,
    [clubId]
  );
  return rows[0] || null;
};

async function main() {
  const club = await getClubById(18);
  console.log('--- CLUB 18 INFO ---');
  console.log(club);
  pool.end();
}
main();
