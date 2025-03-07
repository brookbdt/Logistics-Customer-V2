// Firebase Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBD_n0IhLhuwP8maVNGy4b-mcgPtCcd608",
    authDomain: "logistics-app-6f924.firebaseapp.com",
    projectId: "logistics-app-6f924",
    storageBucket: "logistics-app-6f924.firebasestorage.app",
    messagingSenderId: "586615946696",
    appId: "1:586615946696:web:edcdc687d7e96e0c0394fd"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize messaging with explicit vapidKey
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message:', payload);

    // Extract notification details
    const notificationTitle = payload.notification?.title || 'New Notification';
    const notificationOptions = {
        body: payload.notification?.body || '',
        icon: '/favicon.png',
        badge: '/favicon.png',
        data: payload.data || {},
        // Add actions for ORDER_ACCEPTED notifications
        ...(payload.data?.type === 'ORDER_ACCEPTED' && {
            actions: [
                {
                    action: 'proceed-to-payment',
                    title: 'Proceed to Payment'
                }
            ]
        })
    };

    // Show notification
    self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    // Get notification data
    const data = event.notification.data || {};
    let url = '/';

    // If user clicked on the "Proceed to Payment" action button
    if (event.action === 'proceed-to-payment' && data.orderId) {
        url = `/finalize-order/${data.orderId}`;
    }
    // If it's an ORDER_ACCEPTED notification
    else if (data.type === 'ORDER_ACCEPTED' && data.orderId) {
        url = `/finalize-order/${data.orderId}`;
    }

    // Focus on existing window or open new one
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then((clientList) => {
            // Check if there's already a window/tab open with the target URL
            for (const client of clientList) {
                if (client.url === url && 'focus' in client) {
                    return client.focus();
                }
            }

            // If no existing window found, open a new one
            return clients.openWindow(url);
        })
    );
});

// Handle push notifications directly (alternative method)
self.addEventListener('push', (event) => {
    console.log('[firebase-messaging-sw.js] Push received:', event);

    // Extract notification data
    let data = {};
    let title = 'New Notification';
    let options = {
        body: 'You have a new notification',
        icon: '/favicon.png',
        badge: '/favicon.png'
    };

    try {
        if (event.data) {
            const payload = event.data.json();
            data = payload.data || {};

            // Set notification content from payload
            if (payload.notification) {
                title = payload.notification.title || title;
                options.body = payload.notification.body || options.body;
            }

            // Add data to options
            options.data = data;

            // Add actions for ORDER_ACCEPTED notifications
            if (data.type === 'ORDER_ACCEPTED') {
                options.actions = [
                    {
                        action: 'proceed-to-payment',
                        title: 'Proceed to Payment'
                    }
                ];
            }
        }
    } catch (error) {
        console.error('Error processing push notification:', error);
    }

    // Show notification
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});