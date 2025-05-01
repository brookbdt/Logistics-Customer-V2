import { authHook } from "$lib/hooks/auth-hook.server";
import { redirect } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { notifyNewOrder as socketNotifyNewOrder } from "$lib/socket/server";
import { PrismaClient } from "@prisma/client";
import { io } from "socket.io-client";

// Initialize Prisma client
const prisma = new PrismaClient();

// Extend Locals type to include socket connection details
declare global {
    namespace App {
        interface Locals {
            socketPort?: number | null;
            socketIO?: any;
            notifyNewOrder(orderId: number): Promise<void>;
        }
    }
}

// Helper function to check if a route is an API route
function isApiRoute(url: string): boolean {
    // API routes in SvelteKit typically end with /+server.ts
    // So the URL patterns would be like /api/endpoint, /some-route/endpoint, etc.
    // without extensions like .html or trailing slashes

    // Check for mobile app API endpoints
    const apiEndpoints = [
        '/active-dispatch',
        '/assigned-dispatch',
        '/change-dispatch-status',
        '/change-order-milestone-status',
        '/change-order-status',
        '/chat-members',
        '/chats',
        '/courier-login',
        '/courier-verify',
        '/create-chat',
        '/dispatch',
        '/dispatch-history',
        '/edit-milestone-order',
        '/generateSignedUrl',
        '/get-employees',
        '/get-user-by-token',
        '/notifications',
        '/send-message',
        '/update-deliver-order-detail',
        '/update-fcm-token',
        '/update-location'
    ];

    // Check if the URL starts with any of the API endpoints
    return apiEndpoints.some(endpoint =>
        url === endpoint ||
        url.startsWith(`${endpoint}/`) ||
        url.match(new RegExp(`^${endpoint}\\?`))
    );
}

// Pre-auth hook to handle basic domain redirects
const domainHook: Handle = async ({ event, resolve }) => {
    const host = event.request.headers.get('host');
    const url = event.url.pathname;

    // Handle root domain redirect
    if (host === 'behulum.com') {
        throw redirect(301, 'https://www.behulum.com' + url);
    }

    // If user is on admin.behulum.com but this is the customer app, redirect to app.behulum.com
    if (host?.startsWith('admin.behulum.com')) {
        throw redirect(301, 'https://app.behulum.com' + url);
    }

    return resolve(event);
};

const localeHook: Handle = async ({ event, resolve }) => {
    // Make connection details available to endpoint handlers
    // The customer app doesn't run its own socket server, but it needs to know which port to connect to
    event.locals.socketPort = 4003; // Updated to use port 4003 to match the admin app
    event.locals.socketIO = null;

    // Add the notifyNewOrder function to locals
    event.locals.notifyNewOrder = async (orderId: number) => {
        try {
            // For customer app, we need to emit event directly to the database
            // Use Prisma client to fetch the order data
            const order = await prisma.order.findUnique({
                where: { id: orderId },
                include: {
                    orderMilestone: true,
                    OrderDispatch: true,
                    Inventory: true,
                    Sender: {
                        include: {
                            User: true
                        }
                    },
                    Receiver: {
                        include: {
                            User: true
                        }
                    }
                }
            });

            if (!order) {
                console.error(`Order not found: ${orderId}`);
                return;
            }

            console.log(`Successfully fetched order ${orderId} for notification`);

            // Create notification records - we'll rely on the admin app to push them via socket
            // Create customer notification
            if (order.senderCustomerId) {
                await prisma.customerNotification.create({
                    data: {
                        customerId: order.senderCustomerId,
                        title: "Order Status Updated",
                        content: `Your order #${order.id} has been created and is being processed.`,
                        type: "ORDER_CREATED",
                        orderId: order.id,
                        metadata: JSON.stringify({
                            order_id: order.id,
                            order_status: order.orderStatus,
                            timestamp: new Date().toISOString()
                        })
                    }
                });
            }

            // Create warehouse notification if needed (for the appropriate warehouse handling the order)
            const warehouse = order.orderMilestone?.find(m => m.warehouseId !== null)?.warehouseId;
            if (warehouse) {
                await prisma.employeeNotification.create({
                    data: {
                        warehouseId: warehouse,
                        title: "New Order Created",
                        content: `Order #${order.id} has been created and assigned to your warehouse.`,
                        type: "ORDER_CREATED",
                        orderId: order.id,
                        updatedAt: new Date(),
                        metadata: JSON.stringify({
                            order_id: order.id,
                            order_status: order.orderStatus,
                            timestamp: new Date().toISOString()
                        })
                    }
                });
            }

            console.log(`Created notification records for order ${orderId}`);

            // IMPORTANT: Now we also need to send a socket.io event to the admin app
            try {
                const socketUrl = `http://localhost:3005`;
                console.log(`Connecting to admin socket server at ${socketUrl} to emit order created event`);

                // Connect to the admin app's socket server
                const socket = io(socketUrl, {
                    transports: ['websocket'],
                    timeout: 5000,
                    reconnection: false
                });

                // Set up connection handlers
                socket.on('connect', () => {
                    console.log(`Customer app connected to admin socket server with ID: ${socket.id}`);

                    // Emit the order created event to the admin_orders room
                    console.log(`Emitting orderCreated event for order ${order.id} to admin_orders room`);
                    socket.emit('orderCreated', order);

                    // Also emit to admin socket server's internal event
                    console.log(`Emitting server-side orderCreated event for order ${order.id}`);
                    socket.emit('notifyOrderCreated', order.id);

                    // Disconnect after sending the event
                    setTimeout(() => {
                        console.log('Disconnecting from admin socket server after emitting event');
                        socket.disconnect();
                    }, 1000);
                });

                socket.on('connect_error', (error) => {
                    console.error(`Failed to connect to admin socket server: ${error.message}`);
                    socket.disconnect();
                });

                // Wait for the socket to connect or fail
                await new Promise<void>((resolve) => {
                    socket.on('connect', () => resolve());
                    socket.on('connect_error', () => resolve());

                    // Set a timeout just in case
                    setTimeout(() => resolve(), 5000);
                });
            } catch (socketError) {
                console.error(`Error emitting socket event for order ${orderId}:`, socketError);
            }

        } catch (error) {
            console.error(`Error in notifyNewOrder for order ${orderId}:`, error);
        }
    };

    return resolve(event);
};

// Post-auth hook to handle routes that need session data
const sessionHook: Handle = async ({ event, resolve }) => {
    const host = event.request.headers.get('host');
    const url = event.url.pathname;

    // Skip session checks for API routes
    if (isApiRoute(url)) {
        return resolve(event);
    }

    try {
        // The session is added by the authHook
        const session = await event.locals.getSession();

        // Handle app subdomain (customer app)
        if (host?.startsWith('app.behulum.com') && url === '/' && !session) {
            throw redirect(302, '/auth');
        }
    } catch (error) {
        // If getSession fails, we'll just continue for API routes
        // but log for non-API routes
        if (!isApiRoute(url)) {
            console.error('Session check failed:', error);
        }
    }

    return resolve(event);
};

// Sequence the hooks in the correct order - domain hook first, then auth, then session-dependent hooks
export const handle = sequence(domainHook, authHook, sessionHook, localeHook); 