require('dotenv').config();
const { getClubAdminFCMToken } = require('./db.js');
const admin = require('./firebase-admin.js');

async function testPush() {
    try {
        console.log('Fetching club admin token for club ID 1...');
        // We assume the club admin is in club 1
        const token = await getClubAdminFCMToken(1);

        if (!token) {
            console.error('No token found for club 1 admin!');
            process.exit(1);
        }

        console.log(`Found token: ${token.substring(0, 20)}...`);

        const message = {
            notification: {
                title: '🔔 Test Notification',
                body: 'This is a test notification from the backend script.',
            },
            data: {
                url: '/admin-dashboard.html',
                type: 'subscription'
            },
            token: token,
        };

        console.log('Sending message via Firebase Admin SDK...');
        const response = await admin.messaging().send(message);
        console.log('✅ Successfully sent message:', response);
        process.exit(0);
    } catch (e) {
        console.error('❌ Error sending message:', e);
        process.exit(1);
    }
}

testPush();
