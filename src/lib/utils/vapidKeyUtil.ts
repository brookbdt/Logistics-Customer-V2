/**
 * Utility functions for working with VAPID keys for Firebase Cloud Messaging
 */

/**
 * Validates and formats a VAPID key for use with Firebase Cloud Messaging
 * This handles edge cases like extra whitespace or encoding issues
 */
export function prepareVapidKey(key: string): string {
    if (!key) {
        throw new Error('VAPID key is missing or empty');
    }

    // Remove any whitespace or newlines
    return key.trim();
}

/**
 * Convert base64 string to Uint8Array format
 * This is used in some cases with the Web Push API
 * Firebase usually handles this internally for FCM
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
} 