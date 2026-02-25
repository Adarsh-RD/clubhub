require('dotenv').config();
const admin = require('firebase-admin');

try {
    if (process.env.FIREBASE_PROJECT_ID && !admin.apps.length) {
        // If the private key contains literal '\n', replace them with true newlines
        const privateKey = process.env.FIREBASE_PRIVATE_KEY
            ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
            : undefined;

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: privateKey,
            }),
        });
        console.log('Firebase Admin initialized successfully');
    } else if (!process.env.FIREBASE_PROJECT_ID) {
        console.log('Firebase Admin init skipped: missing FIREBASE_PROJECT_ID in env');
    }
} catch (error) {
    console.error('Firebase Admin initialization error', error.stack);
}

module.exports = admin;
