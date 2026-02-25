require('dotenv').config();
const { pool } = require('./db.js');

async function checkSchema() {
    try {
        const { rows } = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'announcement_likes' OR table_name = 'announcement_comments';
    `);
        console.log('Columns:', rows);
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkSchema();
