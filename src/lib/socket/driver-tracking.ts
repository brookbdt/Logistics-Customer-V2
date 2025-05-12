// driver-tracking.ts (simplified for customer app)
import { browser } from '$app/environment';
import { derived, writable } from 'svelte/store';
import { socket } from './client';


// Store for driver locations
export const driverLocations = writable<{
    [userId: string]: {
        coordinates: string;
        lastUpdated: Date;
        heading?: number;
        speed?: number;
    }
}>({});

// Store for online drivers
export const onlineDrivers = writable<{
    [userId: string]: {
        isOnline: boolean;
        lastSeen: Date;
    }
}>({});

// Derived store for active drivers with their locations
export const activeDrivers = derived(
    [onlineDrivers, driverLocations],
    ([$onlineDrivers, $driverLocations]) => {
        const result: {
            [userId: string]: {
                isOnline: boolean;
                lastSeen: Date;
                coordinates?: string;
                lastUpdated?: Date;
                heading?: number;
                speed?: number;
            }
        } = {};

        // Combine online status and location data
        Object.keys($onlineDrivers).forEach(userId => {
            result[userId] = {
                ...$onlineDrivers[userId],
                ...$driverLocations[userId]
            };
        });

        return result;
    }
);

// Debug store to track updates for issues
export const driverLocationUpdates = writable<Array<{
    timestamp: Date;
    userId: string;
    coordinates: string;
    source?: string;
}>>([]);

// Initialize socket listeners for driver tracking
let driverTrackingInitialized = false;

export function initDriverTracking() {
    if (!browser) return;
    if (driverTrackingInitialized) return;

    driverTrackingInitialized = true;
    console.log('Initializing driver tracking');

    socket.update(socketInstance => {
        if (!socketInstance) return null;

        // Listen for driver location updates
        socketInstance.on('driver:location', (data: {
            userId: string,
            coordinates: string,
            heading?: number,
            speed?: number
        }) => {
            console.log('Received driver:location update:', data);
            updateDriverLocation(data.userId, data.coordinates, data.heading, data.speed, 'driver:location');
        });

        // Also listen for locationUpdated events which may come from other endpoints
        socketInstance.on('locationUpdated', (data: {
            driverId: number,
            location: string,
            timestamp: string | Date,
            isEmployee?: boolean
        }) => {
            console.log('Received locationUpdated event:', data);
            updateDriverLocation(data.driverId.toString(), data.location, undefined, undefined, 'locationUpdated');
        });

        // Additional location update formats the server might use
        socketInstance.on('driver_location', (data: any) => {
            console.log('Received driver_location event:', data);
            if (data && data.userId && data.coordinates) {
                updateDriverLocation(data.userId.toString(), data.coordinates, data.heading, data.speed, 'driver_location');
            } else if (data && data.driverId && data.location) {
                updateDriverLocation(data.driverId.toString(), data.location, undefined, undefined, 'driver_location');
            }
        });

        socketInstance.on('driverLocation', (data: any) => {
            console.log('Received driverLocation event:', data);
            if (data && data.userId && data.coordinates) {
                updateDriverLocation(data.userId.toString(), data.coordinates, data.heading, data.speed, 'driverLocation');
            } else if (data && data.driverId && data.location) {
                updateDriverLocation(data.driverId.toString(), data.location, undefined, undefined, 'driverLocation');
            }
        });

        socketInstance.on('order_driver_location', (data: any) => {
            console.log('Received order_driver_location event:', data);
            if (data && data.driverId && data.location) {
                updateDriverLocation(data.driverId.toString(), data.location, undefined, undefined, 'order_driver_location');
            }
        });

        // Listen for driver online status updates
        socketInstance.on('driver:online', (data: { userId: string, isOnline: boolean }) => {
            updateOnlineDriver(data.userId, data.isOnline);
        });

        socketInstance.on('driver_online_status', (data: any) => {
            console.log('Received driver_online_status event:', data);
            if (data && data.userId !== undefined && data.isOnline !== undefined) {
                updateOnlineDriver(data.userId.toString(), Boolean(data.isOnline));
            } else if (data && data.driverId !== undefined && data.isOnline !== undefined) {
                updateOnlineDriver(data.driverId.toString(), Boolean(data.isOnline));
            }
        });

        // Order status updates might also contain driver location
        socketInstance.on('orderStatusUpdated', (data: any) => {
            console.log('Checking orderStatusUpdated for driver info:', data);
            if (data && data.driver && data.driver.location) {
                const driverId = data.driver.id?.toString();
                if (driverId) {
                    updateDriverLocation(driverId, data.driver.location, undefined, undefined, 'orderStatusUpdated');
                }
            }
        });

        // Request data when connected
        if (socketInstance.connected) {
            requestDriverData(socketInstance);
        }

        socketInstance.on('connect', () => {
            requestDriverData(socketInstance);
        });

        // Add reconnect handler specifically for driver tracking
        socketInstance.on('reconnect', () => {
            console.log('Socket reconnected - refreshing driver data');
            requestDriverData(socketInstance);
        });

        return socketInstance;
    });
}

// Helper function to update driver location
function updateDriverLocation(
    userId: string,
    coordinates: string,
    heading?: number,
    speed?: number,
    source?: string
) {
    // Validate coordinates format before updating
    if (!coordinates || !coordinates.includes(',')) {
        console.warn(`Invalid coordinates format: ${coordinates}. Expected "lat,lng"`);
        return;
    }

    // Add to debug tracking
    driverLocationUpdates.update(updates => {
        updates.push({
            timestamp: new Date(),
            userId,
            coordinates,
            source
        });
        // Keep only last 20 updates
        if (updates.length > 20) {
            updates = updates.slice(-20);
        }
        return updates;
    });

    driverLocations.update(locations => {
        locations[userId] = {
            coordinates,
            lastUpdated: new Date(),
            heading,
            speed
        };
        return locations;
    });

    // Also make sure driver is marked as online when we get a location update
    onlineDrivers.update(drivers => {
        drivers[userId] = {
            isOnline: true,
            lastSeen: new Date()
        };
        return drivers;
    });
}

// Helper function to update online driver status
function updateOnlineDriver(userId: string, isOnline: boolean) {
    onlineDrivers.update(drivers => {
        drivers[userId] = {
            isOnline,
            lastSeen: new Date()
        };
        return drivers;
    });
}

// Request driver data for a specific order
export function trackOrderDriver(orderId: number) {
    socket.update(socketInstance => {
        if (socketInstance?.connected) {
            console.log(`Requesting driver data for order ${orderId}`);

            // Join room for this specific order
            socketInstance.emit('join', `order_${orderId}`);

            // Also try alternate room naming formats
            socketInstance.emit('join', `order-${orderId}`);
            socketInstance.emit('join', `driver-order-${orderId}`);

            // Request driver data for this order using multiple formats for better compatibility
            socketInstance.emit('getOrderDriver', { orderId });
            socketInstance.emit('get_order_driver', { orderId });
            socketInstance.emit('trackOrderDriver', { orderId });
            socketInstance.emit('track_order_driver', { orderId });

            // Also request all online drivers which might include our driver
            socketInstance.emit('getOnlineDrivers');
            socketInstance.emit('get_online_drivers');
        } else {
            console.warn('Socket not connected, cannot track order driver');
        }
        return socketInstance;
    });
}

// Request driver data
function requestDriverData(socketInstance: any) {
    if (!socketInstance || !socketInstance.connected) return;

    // Try both naming conventions since server might use different format
    socketInstance.emit('getOnlineDrivers', {}, (onlineDriverIds: string[]) => {
        handleOnlineDriversResponse(onlineDriverIds, socketInstance);
    });

    socketInstance.emit('get_online_drivers', {}, (onlineDriverIds: string[]) => {
        handleOnlineDriversResponse(onlineDriverIds, socketInstance);
    });
}

function handleOnlineDriversResponse(onlineDriverIds: string[], socketInstance: any) {
    if (Array.isArray(onlineDriverIds) && onlineDriverIds.length > 0) {
        console.log('Received online drivers:', onlineDriverIds);

        onlineDrivers.update(drivers => {
            onlineDriverIds.forEach(id => {
                drivers[id] = {
                    isOnline: true,
                    lastSeen: new Date()
                };
            });
            return drivers;
        });

        // Request location for each online driver
        onlineDriverIds.forEach(driverId => {
            socketInstance.emit('driver:location:request', {
                driverId: parseInt(driverId)
            });

            // Also try alternate format
            socketInstance.emit('driver_location_request', {
                driverId: parseInt(driverId)
            });
        });
    }
}

// Calculate distance between two coordinates in kilometers
export function calculateDistance(coords1: string, coords2: string): number {
    try {
        const [lat1, lng1] = coords1.split(',').map(coord => parseFloat(coord.trim()));
        const [lat2, lng2] = coords2.split(',').map(coord => parseFloat(coord.trim()));

        const R = 6371; // Radius of the earth in km
        const dLat = deg2rad(lat2 - lat1);
        const dLon = deg2rad(lng2 - lng1);

        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c; // Distance in km

        return parseFloat(distance.toFixed(2));
    } catch (e) {
        console.error('Error calculating distance:', e);
        return -1;
    }
}

function deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
}

// Calculate estimated time of arrival based on distance and average speed
export function calculateETA(distanceKm: number, averageSpeedKmh: number = 30): number {
    if (distanceKm <= 0 || averageSpeedKmh <= 0) return 0;
    return Math.round(distanceKm / averageSpeedKmh * 60); // Minutes
}