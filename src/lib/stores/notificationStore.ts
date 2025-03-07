import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

// Define the notification type
export interface Notification {
    id: number;
    title: string;
    content: string;
    isRead: boolean;
    createdAt: string;
    type: string;
    orderId?: number;
    metadata?: string;
}

// Create the store
export const notifications = writable<Notification[]>([]);

// Create a derived store for unread count
export const unreadCount = derived(notifications, ($notifications) => {
    return $notifications.filter(notification => !notification.isRead).length;
});

// Function to fetch notifications from the API
export const fetchNotifications = async () => {
    // Only fetch if we're in the browser environment
    if (!browser) return;

    try {
        const response = await fetch('/notifications');

        // Handle unsuccessful responses
        if (!response.ok) {
            console.log(`Error fetching notifications: ${response.status} - ${response.statusText}`);
            // Set empty notifications array on error
            notifications.set([]);
            return;
        }

        const data = await response.json();

        if (data.success && data.notifications) {
            notifications.set(data.notifications);
        } else {
            // If there's no success flag or no notifications, set an empty array
            console.log('No notifications received or unsuccessful response');
            notifications.set([]);
        }
    } catch (error) {
        console.error('Error fetching notifications:', error);
        // Set empty notifications array on error
        notifications.set([]);
    }
};

// Function to mark a notification as read
export const markAsRead = async (id: number) => {
    // Only proceed if we're in the browser environment
    if (!browser) return;

    try {
        const response = await fetch(`/notifications/${id}/mark-read`, {
            method: 'POST'
        });

        if (response.ok) {
            // Update the local store
            notifications.update(items => {
                return items.map(item => {
                    if (item.id === id) {
                        return { ...item, isRead: true };
                    }
                    return item;
                });
            });
        }
    } catch (error) {
        console.error('Error marking notification as read:', error);
    }
};