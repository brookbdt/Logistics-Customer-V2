import { authHook } from "$lib/hooks/auth-hook.server";
import { redirect } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { io } from 'socket.io-client';
import { PrismaClient } from "@prisma/client";
import { sendPushNotification } from '$lib/firebase/notifications';

const prisma = new PrismaClient();


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

const getAdminSocketUrl = (): string => {
    // In production, use the actual admin app URL
    if (process.env.NODE_ENV === 'production') {
        // Use the ADMIN_URL environment variable or a default production URL
        return process.env.ADMIN_URL || 'https://admin.behulum.com';
    }

    // In development, use localhost with the admin socket port
    return 'http://localhost:3005';
};

const localeHook: Handle = async ({ event, resolve }) => {
    // Make connection details available to endpoint handlers
    // The customer app doesn't run its own socket server, but it needs to know which port to connect to

    // Store the admin socket URL in locals
    const adminSocketUrl = getAdminSocketUrl();
    event.locals.adminSocketUrl = adminSocketUrl;
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
                const customerNotification = await prisma.customerNotification.create({
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

                // Send push notification to sender if FCM token exists
                try {
                    // Since fcmToken might not be directly on User, look for it in a way that avoids errors
                    // The token might be associated with the customer record rather than the User record
                    const sender = order.Sender;
                    // Use any available token or identifier that could be used for notifications
                    const senderFcmToken = sender?.fcmToken ||
                        (sender?.User && 'fcmToken' in sender.User ?
                            (sender.User as any).fcmToken : null);

                    if (senderFcmToken) {
                        console.log(`Sending push notification to sender with token: ${senderFcmToken}`);
                        await sendPushNotification(senderFcmToken, {
                            title: "Order Created Successfully",
                            body: `Your order #${order.id} has been created and is being processed.`
                        });
                        console.log(`Push notification sent to sender for order #${order.id}`);
                    } else {
                        console.log(`No FCM token found for sender of order #${order.id}`);
                    }
                } catch (pushError) {
                    console.error(`Error sending push notification to sender:`, pushError);
                }
            }

            // Send notification to receiver if receiver exists and has FCM token
            if (order.receiverCustomerId && order.Receiver) {
                try {
                    // Since fcmToken might not be directly on User, look for it in a way that avoids errors
                    const receiver = order.Receiver;
                    // Use any available token or identifier that could be used for notifications
                    const receiverFcmToken = receiver.fcmToken ||
                        (receiver.User && 'fcmToken' in receiver.User ?
                            (receiver.User as any).fcmToken : null);

                    if (receiverFcmToken) {
                        console.log(`Sending push notification to receiver with token: ${receiverFcmToken}`);
                        await sendPushNotification(receiverFcmToken, {
                            title: "New Shipment On The Way",
                            body: `A new shipment (Order #${order.id}) is on its way to you.`
                        });

                        // Create notification in database for receiver
                        await prisma.customerNotification.create({
                            data: {
                                customerId: order.receiverCustomerId,
                                title: "New Shipment On The Way",
                                content: `A new shipment (Order #${order.id}) is on its way to you.`,
                                type: "ORDER_CREATED_RECEIVER",
                                orderId: order.id,
                                metadata: JSON.stringify({
                                    order_id: order.id,
                                    order_status: order.orderStatus,
                                    timestamp: new Date().toISOString()
                                })
                            }
                        });

                        console.log(`Push notification sent to receiver for order #${order.id}`);
                    } else {
                        console.log(`No FCM token found for receiver of order #${order.id}`);
                    }
                } catch (pushError) {
                    console.error(`Error sending push notification to receiver:`, pushError);
                }
            }

            // Create warehouse notification if needed (for the appropriate warehouse handling the order)
            const warehouse = order.orderMilestone && order.orderMilestone.length > 0 ?
                order.orderMilestone.find(milestone => milestone.warehouseId !== null)?.warehouseId :
                null;

            let employeeNotification = null;

            if (warehouse) {
                employeeNotification = await prisma.employeeNotification.create({
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

                console.log(`Created employee notification for warehouse ${warehouse}:`, employeeNotification);

                // Send push notifications to warehouse employees if needed
                try {
                    // Get warehouse employees with FCM tokens
                    const warehouseEmployees = await prisma.employee.findMany({
                        where: {
                            warehouseId: warehouse,
                            fcmToken: { not: null }
                        }
                    });

                    console.log(`Found ${warehouseEmployees.length} warehouse employees with FCM tokens`);

                    // Send notifications to each employee
                    for (const employee of warehouseEmployees) {
                        if (employee.fcmToken) {
                            await sendPushNotification(employee.fcmToken, {
                                title: "New Order Assigned",
                                body: `Order #${order.id} has been assigned to your warehouse.`
                            });
                            console.log(`Push notification sent to employee ${employee.id} for order #${order.id}`);
                        }
                    }

                    // Also notify the warehouse admin for this specific warehouse
                    const warehouseAdmin = await prisma.employee.findFirst({
                        where: {
                            warehouseId: warehouse,
                            fcmToken: { not: null },
                            Role: {
                                isWarehouseAdmin: true
                            }
                        },
                        include: {
                            Role: true
                        }
                    });

                    if (warehouseAdmin?.fcmToken) {
                        await sendPushNotification(warehouseAdmin.fcmToken, {
                            title: "New Order Requires Attention",
                            body: `Order #${order.id} has been assigned to your warehouse. Please review and assign resources.`
                        });
                        console.log(`Push notification sent to warehouse admin (${warehouseAdmin.Role.name}) for order #${order.id}`);
                    }
                } catch (pushError) {
                    console.error(`Error sending push notifications to warehouse employees:`, pushError);
                }
            }

            // Always notify super admins regardless of warehouse assignment
            try {
                // Get super admins with FCM tokens
                const superAdmins = await prisma.employee.findMany({
                    where: {
                        fcmToken: { not: null },
                        Role: {
                            name: "Super Admin"
                        }
                    },
                    include: {
                        Role: true
                    }
                });

                console.log(`Found ${superAdmins.length} super admins with FCM tokens`);

                // Send notifications to each super admin
                for (const admin of superAdmins) {
                    if (admin.fcmToken) {
                        await sendPushNotification(admin.fcmToken, {
                            title: "New Order Created",
                            body: `Order #${order.id} has been created ${warehouse ? `and assigned to warehouse ${warehouse}` : 'but not yet assigned to a warehouse'}.`
                        });
                        console.log(`Push notification sent to super admin (${admin.Role.name}) ${admin.id} for order #${order.id}`);
                    }
                }
            } catch (error) {
                console.error(`Error sending push notifications to super admins:`, error);
            }

            // IMPORTANT: Now we also need to send a socket.io event to the admin app
            try {
                const socketUrl = getAdminSocketUrl();
                console.log(`Connecting to admin socket server at ${socketUrl} to emit order created event`);

                // Connect to the admin app's socket server
                const socket = io(adminSocketUrl, {
                    transports: ['polling', 'websocket'],
                    timeout: 15000, // Increased timeout
                    reconnection: true,
                    reconnectionAttempts: 3,
                    reconnectionDelay: 1000,
                    path: '/socket.io/',
                    auth: {
                        source: 'customer_app_server',
                        secret: process.env.SOCKET_INTER_APP_SECRET || 'customer-to-admin-socket-key',
                        orderId: order.id
                    },
                    extraHeaders: {
                        'Origin': 'https://app.behulum.com',
                        'X-App-Source': 'customer-app-server'
                    }
                });
                // Set up connection handlers
                socket.on('connect', () => {
                    console.log(`Customer app connected to admin socket server with ID: ${socket.id}`);

                    // Emit the order created event to the admin_orders room
                    console.log(`Emitting orderCreated event for order ${order.id} to admin_orders room`);
                    socket.emit('orderCreated', order);

                    // Emit employee notification if it exists (warehouse was assigned)
                    if (employeeNotification) {
                        console.log(`Emitting employeeNotifications for warehouse ${warehouse}`);
                        // Send as an array since the handler expects an array of notifications
                        socket.emit('employeeNotifications', [employeeNotification]);

                        // Also emit to a warehouse-specific room for targeted delivery
                        socket.emit('warehouseNotification', {
                            room: `warehouse_${warehouse}`,
                            notification: employeeNotification
                        });
                    }

                    // Also emit to admin socket server's internal event
                    console.log(`Emitting server-side orderCreated event for order ${order.id}`);
                    socket.emit('notifyOrderCreated', order.id);

                    // Disconnect after sending the event
                    setTimeout(() => {
                        console.log('Disconnecting from admin socket server after emitting event');
                        socket.disconnect();
                    }, 5000); // Increased from 1000ms to 5000ms to give more time for event processing
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

// Sequence the hooks in the correct order - domain hook first, then auth, then session-dependent hooks
export const handle = sequence(domainHook, authHook, sessionHook, localeHook); 