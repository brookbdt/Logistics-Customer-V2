// lib/firebase/notifications.js
import { getFirebaseAdmin } from './firebaseAdmin';

async function sendPushNotification(token: string, message: { title: string; body: string }) {
    const app = getFirebaseAdmin();
    if (!app) {
        console.error('Firebase Admin not initialized');
        return;
    }

    try {
        const response = await app.messaging().send({
            token: token,
            notification: {
                title: message.title,
                body: message.body,
            },
        });
        console.log('Successfully sent message:', response);
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

export { sendPushNotification };