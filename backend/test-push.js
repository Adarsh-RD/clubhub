require('dotenv').config();
const { poolQuery } = require('./db');
const admin = require('./firebase-admin');

async function debugPush() {
    console.log('Firebase App Initialized:', admin.apps.length > 0);

    try {
        const { rows } = await poolQuery(`SELECT email, fcm_token FROM users WHERE role = 'club_admin'`);
        console.log('Admin Users currently in DB:');

        let targetToken = null;
        let targetEmail = null;

        for (const r of rows) {
            console.log(`- ${r.email} | Token: ${r.fcm_token ? r.fcm_token.substring(0, 20) + '...' : 'NONE'}`);
            if (r.fcm_token) {
                targetToken = r.fcm_token;
                targetEmail = r.email;
            }
        }

        if (!targetToken) {
            console.log('❌ No admin has an FCM token saved in the database. The frontend is not sending it.');
            process.exit(1);
        }

        console.log(`\nAttempting to send push to ${targetEmail}...`);

        const response = await admin.messaging().send({
            token: targetToken,
            notification: {
                title: 'Test Notification',
                body: 'If you see this, Firebase is working!',
            }
        });

        console.log('✅ Successfully sent message:', response);
    } catch (e) {
        console.error('❌ Error sending push:', e.errorInfo || e);
    }
    process.exit(0);
}

debugPush();
