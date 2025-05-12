// Client-side Socket.io implementation for admin app
import { io, Socket } from 'socket.io-client';
import { writable, derived } from 'svelte/store';
import type { Readable } from 'svelte/store';
import { realtimeDisabled } from './stores';
import { browser } from '$app/environment';
import { getSocketUrl } from './config';

type Driver = {
    id: number;
    isEmployee: boolean;
    isOnline: boolean;
    lastSeen: Date;
    location?: string;
    orderId?: number;
};

type Order = any; // Using any type for flexibility with order data structure

type Notification = {
    id: number;
    title: string;
    content: string;
    createdAt: Date;
    isRead: boolean;
    type: string;
};

// Add socket event logging
export const socketEvents = writable<Array<{
    timestamp: Date;
    event: string;
    data?: any;
}>>([]);

// Error handling
export const socketError = writable<{ message: string, details?: string } | null>(null);

// Define our stores
export const socket = writable<Socket | null>(null);
export const isConnected = writable(false);
export const activeOrders = writable<Order[]>([]);
export const warehouseOrders = writable<{ [warehouseId: number]: Order[] }>({});
export const activeDrivers = writable<Driver[]>([]);
export const notifications = writable<Notification[]>([]);
export const unreadNotificationCount = derived(
    notifications,
    ($notifications) => $notifications.filter(n => !n.isRead).length
);

// Payment verification events
export const paymentEvents = writable<{
    [orderId: string]: {
        orderId: number;
        paymentMethod: string;
        verifiedAt: string;
        orderStatus: string;
    }
}>({});

// Function to log socket events
export function logSocketEvent(event: string, data?: any) {
    console.log(`Socket event: ${event}`, data);
    socketEvents.update(events => {
        events.push({
            timestamp: new Date(),
            event,
            data
        });

        // Keep the last 100 events only
        if (events.length > 100) {
            events = events.slice(-100);
        }

        return events;
    });
}

// Connection management
let socketInstance: Socket | null = null;
let connectionAttempts = 0;
let currentSocketUrl: string | null = null;
const MAX_CONNECTION_ATTEMPTS = 5;
const RETRY_DELAY = 2000; // 2 seconds between retries
const FALLBACK_PORTS = [4003, 4002, 4001, 4004, 4005]; // Updated to prioritize port 4003
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_RECONNECT_ATTEMPTS = 5;
/**
 * Get the active socket port from the server
 */
async function getActiveSocketPort(): Promise<number | null> {
    try {
        console.log('Requesting active socket port from server...');
        const response = await fetch('/socket-port');
        if (response.ok) {
            const data = await response.json();
            if (data.active && data.port) {
                console.log(`Server reported active socket port: ${data.port}`);
                return data.port;
            }
            console.log('Server reported no active socket server:', data);
        } else {
            console.log('Failed to get socket port, status:', response.status);
        }
        return null;
    } catch (error) {
        console.error('Failed to get active socket port:', error);
        return null;
    }
}


/**
 * Initialize socket connection
 */
export async function initSocket(): Promise<Socket | null> {
    // Only run in browser
    if (!browser) return null;

    // Reset disabled flag when trying to reconnect
    realtimeDisabled.set(false);

    // Get the socket URL
    const socketUrl = getSocketUrl();
    console.log(`Determined socket URL: ${socketUrl}`);

    // Already trying to connect
    if (socketInstance && !socketInstance.connected) {
        console.log('Already attempting to connect');
        return socketInstance;
    }

    // Close existing connection if any
    if (socketInstance) {
        console.log('Closing existing socket connection');
        socketInstance.disconnect();
        socketInstance.close();
        socketInstance = null;
    }

    // Clear any existing reconnect timer
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    // Reset reconnect attempts when manually initiating a connection
    reconnectAttempts = 0;

    try {
        console.log(`Trying to connect to Socket.io server at ${socketUrl}`);

        // Initialize with polling first for reliability - more compatible with proxies
        socketInstance = io(socketUrl, {
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: 3,
            reconnectionDelay: 1000,
            timeout: 10000,
            transports: ['polling', 'websocket'], // Allow both transports for better compatibility
            forceNew: true,
            withCredentials: false,
            path: '/socket.io/',
            extraHeaders: {}
        });

        // Set up event handlers
        socketInstance.on('connect', () => {
            console.log(`Successfully connected to socket server with ID: ${socketInstance?.id}`);
            isConnected.set(true);
            socketError.set(null);
            reconnectAttempts = 0; // Reset reconnect attempts on successful connection

            // Log connection event
            logSocketEvent('connect');

            // Setup message handlers once connected
            setupMessageHandlers(socketInstance!);
        });

        socketInstance.on('disconnect', (reason) => {
            console.log('Disconnected from socket server:', reason);
            isConnected.set(false);

            // Log disconnect event
            logSocketEvent('disconnect', { reason });

            // If the disconnect was intentional, don't auto-reconnect
            if (reason === 'io client disconnect') {
                return;
            }

            // Otherwise, schedule a reconnect
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                const delay = Math.min(1000 * (reconnectAttempts + 1), 10000);
                console.log(`Scheduling reconnect attempt in ${delay}ms`);
                reconnectTimer = setTimeout(() => {
                    reconnectAttempts++;
                    console.log(`Reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
                    initSocket();
                }, delay);
            } else {
                console.error('Max reconnect attempts reached');
                realtimeDisabled.set(true);
                socketError.set({
                    message: 'Real-time updates are disabled after failed connection attempts',
                    details: 'The application will continue to work without real-time updates.'
                });
            }
        });

        socketInstance.on('connect_error', (error) => {
            console.error('Connection error:', error);
            isConnected.set(false);
            socketError.set({
                message: 'Failed to connect to real-time server',
                details: error.message || 'Unknown error'
            });

            // Log connect error event
            logSocketEvent('connect_error', { message: error.message });

            // If this is our last attempt, disable realtime
            if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS - 1) {
                realtimeDisabled.set(true);
            }
        });

        // Listen for welcome message
        socketInstance.on('welcome', (data) => {
            console.log('Received welcome message from socket server:', data);
            logSocketEvent('welcome', data);
        });

        // Set up the socket in the store
        socket.set(socketInstance);
        return socketInstance;
    } catch (error) {
        console.error('Error during socket initialization:', error);
        socketError.set({
            message: 'Failed to initialize real-time connection',
            details: error instanceof Error ? error.message : String(error)
        });
        return null;
    }
}

/**
 * Subscribe to specific payment updates for an order
 */
export function subscribeToPaymentUpdates(orderId: number): void {
    if (!socketInstance) return;

    console.log(`Subscribing to payment updates for order ${orderId}`);

    // Join the order-specific room
    socketInstance.emit('join', `order_${orderId}`);

    // Request any existing payment status
    // This event doesn't exist on the server yet, but could be added in the future
    socketInstance.emit('getPaymentStatus', { orderId });
}


/**
 * Subscribe to specific order updates with improved reconnection handling
 */
export function subscribeToOrder(orderId: number): void {
    if (!socketInstance) {
        console.warn('Socket not initialized, initializing now...');
        initSocket().then(socket => {
            if (socket) {
                socket.emit('join', `order_${orderId}`);
                // Also try alternate room formats
                socket.emit('join', `order-${orderId}`);
                socket.emit('join', `driver-order-${orderId}`);
                console.log(`Subscribed to order ${orderId}`);

                // Request any initial data
                socket.emit('getOrder', { orderId });
                socket.emit('get_order', { orderId });

                // Also try to get driver data
                socket.emit('getOrderDriver', { orderId });
                socket.emit('get_order_driver', { orderId });
            }
        });
        return;
    }

    socketInstance.emit('join', `order_${orderId}`);
    // Also try alternate room formats
    socketInstance.emit('join', `order-${orderId}`);
    socketInstance.emit('join', `driver-order-${orderId}`);
    console.log(`Subscribed to order ${orderId}`);

    // Request any initial data
    socketInstance.emit('getOrder', { orderId });
    socketInstance.emit('get_order', { orderId });

    // Also try to get driver data
    socketInstance.emit('getOrderDriver', { orderId });
    socketInstance.emit('get_order_driver', { orderId });
}

/**
 * Subscribe to specific employee updates
 */
export function subscribeToEmployee(employeeId: number): void {
    if (!socketInstance) return;
    socketInstance.emit('join', `employee_${employeeId}`);
}

/**
 * Subscribe to specific warehouse updates
 */
export function subscribeToWarehouse(warehouseId: number): void {
    if (!socketInstance) return;
    socketInstance.emit('join', `warehouse_${warehouseId}`);

    // Request orders for this warehouse
    socketInstance.emit('getWarehouseOrders', warehouseId);
}

/**
 * Update a driver's location
 */
export function updateDriverLocation(data: {
    orderId: number,
    driverId: number,
    isEmployee: boolean,
    location: string
}): void {
    if (!socketInstance) return;

    console.log('Updating driver location:', data);

    // Send in the admin app format
    socketInstance.emit('updateDriverLocation', {
        ...data,
        timestamp: new Date().toISOString()
    });

    // Also send in the driver app format for backwards compatibility
    socketInstance.emit('driver:location', {
        userId: data.driverId.toString(),
        coordinates: data.location,
        timestamp: new Date().toISOString()
    });
}
/**
 * Update order status
 */
export function updateOrderStatus(data: {
    orderId: number,
    status: string,
    updatedBy: number,
    isEmployee: boolean
}): void {
    if (!socketInstance) return;
    socketInstance.emit('updateOrderStatus', {
        ...data,
        timestamp: new Date()
    });
}

/**
 * Send notification
 */
export function sendNotification(data: {
    userId?: number,
    employeeId?: number,
    title: string,
    content: string,
    type: string,
    orderId?: number,
    taskId?: number,
    ticketId?: number
}): void {
    if (!socketInstance) return;
    socketInstance.emit('sendNotification', data);
}

/**
 * Mark notification as read
 */
export function markNotificationAsRead(notificationId: number): void {
    notifications.update(list =>
        list.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
    );
}

/**
 * Set up message handlers with event logging
 */
function setupMessageHandlers(socket: Socket): void {
    // Add event logging to all socket events
    const events = ['error', 'orderCreated', 'orderStatusUpdated', 'activeOrdersData',
        'warehouseOrdersData', 'locationUpdated', 'driverStatusUpdated',
        'newNotification', 'customerNotifications'];

    events.forEach(eventName => {
        const originalListener = socket.listeners(eventName)[0];
        if (originalListener) {
            socket.off(eventName, originalListener);
            socket.on(eventName, (data: any) => {
                logSocketEvent(eventName, data);
                originalListener(data);
            });
        }
    });

    // Handle error messages
    socket.on('error', (data: { message: string, details?: string }) => {
        console.error('Socket error:', data);
        socketError.set(data);
    });

    // Handle active orders data
    socket.on('activeOrdersData', (data: Order[]) => {
        console.log('Received active orders data:', data.length);
        activeOrders.set(data);
    });

    // New order created
    socket.on('orderCreated', (data: Order) => {
        console.log('Received order created event:', data.id);
        // Update activeOrders store with the new order
        activeOrders.update(orders => {
            // Check if the order already exists
            const exists = orders.some(o => o.id === data.id);
            if (exists) return orders;

            // Add the new order to the beginning of the list
            return [data, ...orders];
        });

        // Create a toast notification about the new order
        if (typeof window !== 'undefined') {
            // Could trigger a custom event for toast notification
            const event = new CustomEvent('new-order', { detail: data });
            window.dispatchEvent(event);
        }
    });

    // Order status updates
    socket.on('orderStatusUpdated', (data: Order) => {
        // Update order status for customer orders
        // Show appropriate notifications based on new status
        console.log('Received order status update:', data.id, data.orderStatus);

        // Update the order in our active orders store
        activeOrders.update(orders => {
            return orders.map(order =>
                order.id === data.id ? { ...order, orderStatus: data.orderStatus } : order
            );
        });
    });

    // Handle warehouse orders data
    socket.on('warehouseOrdersData', (data: { warehouseId: number, orders: Order[] }) => {
        console.log(`Received warehouse orders for warehouse ${data.warehouseId}:`, data.orders.length);
        warehouseOrders.update(stores => ({
            ...stores,
            [data.warehouseId]: data.orders
        }));
    });

    // Payment verification event
    socket.on('paymentVerified', (data: {
        orderId: number;
        orderMilestoneId: number;
        paymentMethod: string;
        paymentStatus: boolean;
        verifiedAt: string;
        orderStatus: string;
        milestoneCompleted: boolean;
        isLastMilestone: boolean;
    }) => {
        console.log('Received payment verification event:', data);

        // Update the payment events store
        paymentEvents.update(events => {
            const orderId = data.orderId.toString();
            events[orderId] = {
                orderId: data.orderId,
                paymentMethod: data.paymentMethod,
                verifiedAt: data.verifiedAt,
                orderStatus: data.orderStatus
            };
            return events;
        });

        // Also update the order status in active orders
        activeOrders.update(orders => {
            const index = orders.findIndex(o => o.id === data.orderId);
            if (index >= 0) {
                // Create updated order object
                const updatedOrder = {
                    ...orders[index],
                    orderStatus: data.orderStatus,
                    paymentStatus: true,
                    paymentMethod: data.paymentMethod,
                    paymentDate: data.verifiedAt
                };

                // Replace the order in the array
                return [
                    ...orders.slice(0, index),
                    updatedOrder,
                    ...orders.slice(index + 1)
                ];
            }
            return orders;
        });

        // Update warehouse orders if applicable
        warehouseOrders.update(stores => {
            // Make a copy of the stores object
            const updatedStores = { ...stores };

            // Look through each warehouse's orders
            Object.keys(updatedStores).forEach(warehouseId => {
                const warehouseIdNum = parseInt(warehouseId);
                if (isNaN(warehouseIdNum)) return;

                const orders = updatedStores[warehouseIdNum];
                if (!orders || !Array.isArray(orders)) return;

                const index = orders.findIndex((o: Order) => o.id === data.orderId);

                if (index >= 0) {
                    // Update the order in this warehouse
                    const updatedOrder = {
                        ...orders[index],
                        orderStatus: data.orderStatus,
                        paymentStatus: true,
                        paymentMethod: data.paymentMethod,
                        paymentDate: data.verifiedAt
                    };

                    // Replace the order in the array
                    updatedStores[warehouseIdNum] = [
                        ...orders.slice(0, index),
                        updatedOrder,
                        ...orders.slice(index + 1)
                    ];
                }
            });

            return updatedStores;
        });

        // Dispatch a custom event that components can listen for
        if (browser) {
            const event = new CustomEvent('paymentVerified', {
                detail: data
            });
            window.dispatchEvent(event);
        }
    });

    // Driver location updates
    socket.on('locationUpdated', (data: {
        orderId: number,
        location: string,
        driverId: number,
        isEmployee: boolean,
        timestamp: Date
    }) => {
        activeDrivers.update(drivers => {
            const index = drivers.findIndex(d =>
                d.id === data.driverId && d.isEmployee === data.isEmployee
            );

            if (index >= 0) {
                // Update existing driver
                return [
                    ...drivers.slice(0, index),
                    {
                        ...drivers[index],
                        location: data.location,
                        lastSeen: data.timestamp,
                        orderId: data.orderId
                    },
                    ...drivers.slice(index + 1)
                ];
            } else {
                // Add new driver
                return [...drivers, {
                    id: data.driverId,
                    isEmployee: data.isEmployee,
                    isOnline: true,
                    lastSeen: data.timestamp,
                    location: data.location,
                    orderId: data.orderId
                }];
            }
        });
    });

    // Driver status updates
    socket.on('driverStatusUpdated', (data: {
        driverId: number,
        isEmployee: boolean,
        isOnline: boolean,
        timestamp: Date
    }) => {
        activeDrivers.update(drivers => {
            const index = drivers.findIndex(d =>
                d.id === data.driverId && d.isEmployee === data.isEmployee
            );

            if (index >= 0) {
                // Update existing driver
                return [
                    ...drivers.slice(0, index),
                    {
                        ...drivers[index],
                        isOnline: data.isOnline,
                        lastSeen: data.timestamp
                    },
                    ...drivers.slice(index + 1)
                ];
            } else {
                // Add new driver
                return [...drivers, {
                    id: data.driverId,
                    isEmployee: data.isEmployee,
                    isOnline: data.isOnline,
                    lastSeen: data.timestamp
                }];
            }
        });
    });

    // New notifications
    socket.on('newNotification', (data: Notification) => {
        notifications.update(list => {
            // Check if notification already exists to avoid duplicates
            const exists = list.some(n => n.id === data.id);
            if (exists) return list;

            // Add new notification at the beginning of the list
            return [data, ...list];
        });
    });


    // Handle initial employee notifications
    socket.on('customerNotifications', (data: Notification[]) => {
        console.log(`Received ${data.length} customer notifications`);

        notifications.update(list => {
            // Merge notifications without duplicates
            const existingIds = new Set(list.map(n => n.id));
            const newNotifications = data.filter(n => !existingIds.has(n.id));

            // Add new notifications to the list and re-sort by creation date
            const mergedList = [...list, ...newNotifications].sort((a, b) => {
                const dateA = new Date(a.createdAt).getTime();
                const dateB = new Date(b.createdAt).getTime();
                return dateB - dateA; // Newest first
            });

            return mergedList;
        });
    });
} 