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

async function seed() {
    try {
        console.log('Inserting default clubs...');
        await pool.query(`
      INSERT INTO clubs (club_name, club_code, description, category, is_active) 
      VALUES 
        ('Coding Club', 'CODE', 'For programming enthusiasts', 'Technical', true), 
        ('Sports Club', 'SPORT', 'For all sports activities', 'Sports', true), 
        ('Cultural Club', 'CULT', 'Dance, music, and arts', 'Cultural', true) 
      ON CONFLICT DO NOTHING;
    `);

        console.log('✅ Clubs inserted successfully.');
        process.exit(0);
    } catch (e) {
        console.error('❌ SQL Error:', e.message);
        process.exit(1);
    }
}

seed();
