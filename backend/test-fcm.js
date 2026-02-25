require('dotenv').config();
const { poolQuery, getClubAdminFCMToken } = require('./db');
const admin = require('./firebase-admin');

async function testPush() {
    console.log('Firebase App Initialized:', admin.apps.length > 0);

    try {
        const { rows } = await poolQuery(`SELECT id, email, role, club_id, fcm_token FROM users WHERE role = 'club_admin'`);
        console.log('Club Admins:', rows);

        for (const r of rows) {
            if (r.club_id) {
                const token = await getClubAdminFCMToken(r.club_id);
                console.log(`FCM Token for club ${r.club_id} (Admin: ${r.email}): ${token ? 'FOUND' : 'MISSING'}`);
            }
        }
    } catch (e) {
        console.error('DB Error:', e);
    }
    process.exit();
}
testPush();
