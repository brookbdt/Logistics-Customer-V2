import { initializeApp, getApp, type FirebaseApp } from 'firebase/app';
import {
    getMessaging,
    getToken,
    onMessage,
    type Messaging
} from 'firebase/messaging';
import { browser } from '$app/environment';
import { prepareVapidKey } from '$lib/utils/vapidKeyUtil';

// Firebase configuration - make sure it matches the service worker configuration
const firebaseConfig = {
    apiKey: "AIzaSyBD_n0IhLhuwP8maVNGy4b-mcgPtCcd608",
    authDomain: "logistics-app-6f924.firebaseapp.com",
    projectId: "logistics-app-6f924",
    storageBucket: "logistics-app-6f924.firebasestorage.app",
    messagingSenderId: "586615946696",
    appId: "1:586615946696:web:edcdc687d7e96e0c0394fd"
};

// Initialize Firebase - only in browser environment
let firebaseApp: FirebaseApp;
let messaging: Messaging;

/**
 * Register Firebase Messaging Service Worker
 */
export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
    if (!browser || !('serviceWorker' in navigator)) {
        console.log('Service workers are not supported');
        return null;
    }

    try {
        // First check if there's already a service worker controlling this page
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration?.active) {
            console.log('Using existing service worker registration:', registration);
            return registration;
        }

        // If no existing service worker, register a new one
        console.log('Registering new service worker...');
        const newRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        console.log('Service worker registered successfully:', newRegistration);

        // Wait for the service worker to be ready
        await navigator.serviceWorker.ready;
        return newRegistration;
    } catch (error) {
        console.error('Service worker registration failed:', error);
        return null;
    }
};

/**
 * Initialize Firebase if in browser environment
 */
export const initializeFirebase = async (): Promise<FirebaseApp> => {
    if (!browser) {
        throw new Error('Firebase can only be initialized in the browser');
    }

    try {
        firebaseApp = getApp();
        console.log('Using existing Firebase app instance');
    } catch (e) {
        console.log('Initializing new Firebase app instance');
        firebaseApp = initializeApp(firebaseConfig);
    }

    return firebaseApp;
};

/**
 * Request notification permission and get FCM token
 */
export const requestAndGetFCMToken = async (): Promise<string | null> => {
    if (!browser) return null;

    try {
        console.log('Starting FCM token request process...');

        // Step 1: Check if notifications are supported
        if (!('Notification' in window)) {
            console.log('This browser does not support notifications');
            return null;
        }

        // Step 2: Initialize Firebase
        const app = await initializeFirebase();
        console.log('Firebase initialized successfully');

        // Step 3: Get messaging instance
        messaging = getMessaging(app);
        console.log('Firebase messaging initialized');

        // Step 4: Check notification permission
        console.log('Current notification permission status:', Notification.permission);
        if (Notification.permission !== 'granted') {
            console.log('Requesting notification permission...');
            const permission = await Notification.requestPermission();
            console.log('Notification permission response:', permission);
            if (permission !== 'granted') {
                console.log('Notification permission denied');
                return null;
            }
        }

        // Step 5: Register service worker
        console.log('Registering service worker...');
        const swRegistration = await registerServiceWorker();
        if (!swRegistration) {
            console.error('Failed to register service worker');
            return null;
        }
        console.log('Service worker registered and ready');

        // Step 6: Get VAPID key
        // Hardcode the VAPID key from your .env file since environment variables
        // aren't being properly loaded at runtime
        const vapidKey = "BJmV4ZBkvFQyL1b0SgvTjPV4iLXK5CEX9n0RMyTjKW0E76mGjfp3eoHapiYPBlbMW6iAO3G4jfHz77IKRryx8uQ";
        console.log('Using VAPID key (length):', vapidKey.length);

        // Step 7: Request FCM token
        console.log('Requesting FCM token with key:', vapidKey);
        const currentToken = await getToken(messaging, {
            vapidKey: vapidKey,
            serviceWorkerRegistration: swRegistration
        });

        // Step 8: Process result
        if (currentToken) {
            console.log('FCM token obtained successfully (first few chars):', currentToken.substring(0, 10) + '...');
            return currentToken;
        } else {
            console.log('No FCM token received');
            return null;
        }
    } catch (error) {
        console.error('Error getting FCM token:', error);
        return null;
    }
};

/**
 * Set up handler for foreground messages
 */
export const setupForegroundMessageHandler = async (
    callback: (payload: any) => void
): Promise<void> => {
    if (!browser) return;

    try {
        const app = await initializeFirebase();
        messaging = getMessaging(app);

        // Set up listener for messages received while app is in foreground
        onMessage(messaging, (payload) => {
            console.log('Message received in foreground:', payload);
            callback(payload);
        });

        console.log('Foreground message handler set up successfully');
    } catch (error) {
        console.error('Error setting up message handler:', error);
    }
};