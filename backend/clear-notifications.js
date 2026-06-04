require('dotenv').config({ path: __dirname + '/.env' });
const { pool } = require('./db');

async function run() {
    try {
        // Check what's in the notifications table
        const { rows } = await pool.query('SELECT id, title, body, created_at FROM notifications ORDER BY created_at DESC');
        console.log('Current notifications:', rows);
        
        // Delete all old test notifications
        const result = await pool.query('DELETE FROM notifications');
        console.log(`Deleted ${result.rowCount} old test notification(s).`);
    } catch (e) {
        console.error('Failed:', e.message);
    } finally {
        process.exit();
    }
}
run();
