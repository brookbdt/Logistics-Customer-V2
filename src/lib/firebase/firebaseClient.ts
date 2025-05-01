import { initializeApp, getApp, type FirebaseApp } from 'firebase/app';
import {
    getMessaging,
    getToken,
    onMessage,
    type Messaging
} from 'firebase/messaging';
import { browser } from '$app/environment';

import {
    getDatabase,
    ref,
    set,
    update,
    push,
    onValue,
    onChildAdded,
    onChildChanged,
    serverTimestamp,
    Database,
    type DatabaseReference,
    type Unsubscribe
} from 'firebase/database';

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
let realtimeDb: Database | undefined;
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
        realtimeDb = getDatabase(firebaseApp);
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


/**
 * Get the Firebase Realtime Database instance
 */
export async function getRealtimeDb(): Promise<Database | null> {
    if (!browser) return null;

    try {
        if (!realtimeDb) {
            realtimeDb = getDatabase(firebaseApp);
        }
        return realtimeDb;
    } catch (error) {
        console.error('Error getting Realtime Database:', error);
        return null;
    }
}

/**
 * Get a reference to a specific path in the Realtime Database
 */
export async function getReference(path: string): Promise<DatabaseReference | null> {
    if (!browser) return null;

    try {
        const database = await getRealtimeDb();
        if (!database) return null;

        return ref(database, path);
    } catch (error) {
        console.error('Error getting reference:', error);
        return null;
    }
}

/**
 * Set a value at the specified reference
 */
export async function setValue(
    refPath: string,
    value: any
): Promise<boolean> {
    if (!browser) return false;

    try {
        const reference = await getReference(refPath);
        if (!reference) return false;

        await set(reference, value);
        return true;
    } catch (error) {
        console.error('Error setting value:', error);
        return false;
    }
}

/**
 * Update values at the specified reference
 */
export async function updateValue(
    refPath: string,
    updates: Record<string, any>
): Promise<boolean> {
    if (!browser) return false;

    try {
        const reference = await getReference(refPath);
        if (!reference) return false;

        await update(reference, updates);
        return true;
    } catch (error) {
        console.error('Error updating value:', error);
        return false;
    }
}

/**
 * Push a value to the specified reference (creates a new child with unique key)
 */
export async function pushValue(
    refPath: string,
    value: any
): Promise<string | null> {
    if (!browser) return null;

    try {
        const reference = await getReference(refPath);
        if (!reference) return null;

        const newRef = push(reference);
        await set(newRef, value);
        return newRef.key;
    } catch (error) {
        console.error('Error pushing value:', error);
        return null;
    }
}

/**
 * Subscribe to value changes at the specified reference
 */
export async function subscribeToValue(
    refPath: string,
    callback: (snapshot: any) => void
): Promise<Unsubscribe | null> {
    if (!browser) return null;

    try {
        const reference = await getReference(refPath);
        if (!reference) return null;

        return onValue(reference, callback);
    } catch (error) {
        console.error('Error subscribing to value:', error);
        return null;
    }
}

/**
 * Subscribe to child added events at the specified reference
 */
export async function subscribeToChildAdded(
    refPath: string,
    callback: (snapshot: any) => void
): Promise<Unsubscribe | null> {
    if (!browser) return null;

    try {
        const reference = await getReference(refPath);
        if (!reference) return null;

        return onChildAdded(reference, callback);
    } catch (error) {
        console.error('Error subscribing to child added:', error);
        return null;
    }
}

/**
 * Subscribe to child changed events at the specified reference
 */
export async function subscribeToChildChanged(
    refPath: string,
    callback: (snapshot: any) => void
): Promise<Unsubscribe | null> {
    if (!browser) return null;

    try {
        const reference = await getReference(refPath);
        if (!reference) return null;

        return onChildChanged(reference, callback);
    } catch (error) {
        console.error('Error subscribing to child changed:', error);
        return null;
    }
}

/**
 * Update the timestamp at the specified reference
 */
export async function updateTimestamp(refPath: string): Promise<boolean> {
    if (!browser) return false;

    try {
        const reference = await getReference(refPath);
        if (!reference) return false;

        await update(reference, {
            lastUpdated: serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error('Error updating timestamp:', error);
        return false;
    }
}