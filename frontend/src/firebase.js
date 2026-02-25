import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

// Firebase config generated from Firebase Console
const firebaseConfig = {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

export const requestForToken = async (vapidKey) => {
    try {
        // 1. Build the SW URL with query params
        const swUrl = new URL('/firebase-messaging-sw.js', window.location.origin);
        swUrl.searchParams.set("apiKey", firebaseConfig.apiKey);
        swUrl.searchParams.set("projectId", firebaseConfig.projectId);
        swUrl.searchParams.set("messagingSenderId", firebaseConfig.messagingSenderId);
        swUrl.searchParams.set("appId", firebaseConfig.appId);

        // 2. Register the SW
        const registration = await navigator.serviceWorker.register(swUrl.href);

        // 3. Request token
        const currentToken = await getToken(messaging, {
            vapidKey,
            serviceWorkerRegistration: registration
        });

        if (currentToken) {
            return currentToken;
        } else {
            console.log('No registration token available. Request permission to generate one.');
            return null;
        }
    } catch (err) {
        console.log('An error occurred while retrieving token. ', err);
        return null;
    }
};

export const onMessageListener = () =>
    new Promise((resolve) => {
        onMessage(messaging, (payload) => {
            resolve(payload);
        });
    });

export { messaging };
