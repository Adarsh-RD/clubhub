require('dotenv').config({ path: __dirname + '/.env' });
const { pool } = require('./db.js');

async function fixAnnouncementImageUrlColumn() {
    try {
        console.log('Connecting to database...');
        console.log('Host being used:', process.env.DB_HOST);

        await pool.query('ALTER TABLE announcements ALTER COLUMN image_url TYPE TEXT;');

        console.log('✅ Successfully altered image_url to TEXT.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

fixAnnouncementImageUrlColumn();
