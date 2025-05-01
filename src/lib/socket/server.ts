// Socket.io server configuration for admin app
import { Server } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import type { PrismaClient } from '@prisma/client';
import type { Socket } from 'socket.io';

// Event types for type safety
export interface LocationUpdate {
    orderId: number;
    driverId: number; // Either employeeId or vendorDriverId
    isEmployee: boolean;
    location: string; // Format: "latitude,longitude"
    timestamp: Date;
}

export interface OrderStatusUpdate {
    orderId: number;
    status: string;
    updatedBy: number;
    isEmployee: boolean;
    timestamp: Date;
}

export interface NotificationPayload {
    userId?: number;
    employeeId?: number;
    title: string;
    content: string;
    type: string;
    orderId?: number;
    taskId?: number;
    ticketId?: number;
}

// Initialize Socket.io server
export function initSocketServer(server: HTTPServer, prisma: any) {
    const io = new Server(server, {
        cors: {
            origin: process.env.NODE_ENV === 'production'
                ? [process.env.ADMIN_URL || '', process.env.CUSTOMER_URL || '', process.env.DRIVER_URL || '']
                : '*',
            methods: ['GET', 'POST']
        }
    });

    io.on('connection', (socket: Socket) => {
        console.log('Client connected:', socket.id);

        socket.on('connect', () => {
            console.log('Socket connected with ID:', socket.id);
            console.log('Client handshake details:', socket.handshake.address, socket.handshake.headers.origin);
        });
        // Handle room subscription
        socket.on('join', (rooms: string | string[]) => {
            if (Array.isArray(rooms)) {
                rooms.forEach(room => socket.join(room));
            } else {
                socket.join(rooms);
            }
            console.log(`Socket ${socket.id} joined rooms:`, rooms);
        });

        // Get active orders - for initial data load
        socket.on('getActiveOrders', async () => {
            try {
                // Fetch active orders (not completed or cancelled)
                const activeOrders = await prisma.order.findMany({
                    where: {
                        orderStatus: {
                            not: 'COMPLETED'
                        }
                    },
                    orderBy: {
                        createdAt: 'desc'
                    },
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
                    },
                    take: 20 // Limit to most recent 20 orders for performance
                });

                // Send orders directly to the requesting client
                socket.emit('activeOrdersData', activeOrders);
            } catch (error) {
                console.error('Error fetching active orders:', error);
                socket.emit('error', {
                    message: 'Failed to fetch active orders',
                    details: error instanceof Error ? error.message : String(error)
                });
            }
        });

        // Get warehouse-specific orders
        socket.on('getWarehouseOrders', async (warehouseId: number) => {
            try {
                // Fetch incoming orders for this warehouse
                const incomingOrders = await prisma.order.findMany({
                    where: {
                        AND: [
                            {
                                orderStatus: {
                                    not: 'COMPLETED'
                                }
                            },
                            {
                                Inventory: {
                                    OR: [
                                        {
                                            inventoryStatus: 'INCOMING',
                                            wareHouseId: warehouseId
                                        },
                                        {
                                            inventoryStatus: 'OUTGOING',
                                            nextWarehouseId: warehouseId
                                        }
                                    ]
                                }
                            }
                        ]
                    },
                    include: {
                        orderMilestone: true,
                        OrderDispatch: true,
                        Inventory: {
                            include: {
                                NextWarehouse: true,
                                Warehouse: true
                            }
                        },
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

                // Send warehouse orders to the requesting client
                socket.emit('warehouseOrdersData', {
                    warehouseId,
                    orders: incomingOrders
                });
            } catch (error) {
                console.error(`Error fetching warehouse orders for warehouse ${warehouseId}:`, error);
                socket.emit('error', {
                    message: `Failed to fetch orders for warehouse ${warehouseId}`,
                    details: error instanceof Error ? error.message : String(error)
                });
            }
        });

        // Handle order status updates
        socket.on('updateOrderStatus', async (data: OrderStatusUpdate) => {
            try {
                // Update order in database
                const updatedOrder = await prisma.order.update({
                    where: { id: data.orderId },
                    data: {
                        orderStatus: data.status as any,
                        updateAt: new Date()
                    },
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

                // Create order milestone
                await prisma.orderMilestone.create({
                    data: {
                        orderId: data.orderId,
                        description: `Order status changed to ${data.status}`,
                        isCompleted: true,
                        executionOrder: 0
                    }
                });

                // Broadcast to relevant rooms
                io.to(`order_${data.orderId}`).emit('orderStatusUpdated', updatedOrder);

                // Also broadcast to admin room
                io.to('admin_orders').emit('orderStatusUpdated', updatedOrder);

                // If this order is associated with a warehouse, notify the warehouse room too
                if (updatedOrder.Inventory?.wareHouseId) {
                    io.to(`warehouse_${updatedOrder.Inventory.wareHouseId}`).emit('orderStatusUpdated', updatedOrder);
                }

                // Create notifications for customers
                if (updatedOrder.Sender?.User?.id) {
                    const customerNotification = await prisma.customerNotification.create({
                        data: {
                            customerId: updatedOrder.Sender.id,
                            title: 'Order Status Update',
                            content: `Your order #${data.orderId} has been updated to ${data.status}`,
                            type: 'ORDER_STATUS',
                            orderId: data.orderId
                        }
                    });

                    io.to(`user_${updatedOrder.Sender.User.id}`).emit('newNotification', customerNotification);
                }
            } catch (error) {
                console.error('Error updating order status:', error);
                socket.emit('error', {
                    message: 'Failed to update order status',
                    details: error instanceof Error ? error.message : String(error)
                });
            }
        });

        // Handle driver location updates
        socket.on('updateDriverLocation', async (data: LocationUpdate) => {
            try {
                // First check if tracker exists
                const existingTracker = await prisma.tracker.findUnique({
                    where: { orderId: data.orderId }
                });

                if (existingTracker) {
                    // Update existing tracker
                    await prisma.tracker.update({
                        where: { orderId: data.orderId },
                        data: {
                            mapLocation: data.location,
                            updateAt: new Date()
                        }
                    });
                } else {
                    // Create new tracker
                    await prisma.tracker.create({
                        data: {
                            orderId: data.orderId,
                            mapLocation: data.location,
                            updateAt: new Date()
                        }
                    });
                }

                // Broadcast to relevant rooms
                io.to(`order_${data.orderId}`).emit('locationUpdated', {
                    orderId: data.orderId,
                    location: data.location,
                    driverId: data.driverId,
                    isEmployee: data.isEmployee,
                    timestamp: new Date()
                });

                // Also broadcast to admin tracking room
                io.to('admin_tracking').emit('locationUpdated', {
                    orderId: data.orderId,
                    location: data.location,
                    driverId: data.driverId,
                    isEmployee: data.isEmployee,
                    timestamp: new Date()
                });

                // Find order to determine warehouse
                const order = await prisma.order.findUnique({
                    where: { id: data.orderId },
                    include: { Inventory: true }
                });

                // If order belongs to a warehouse, notify the warehouse room
                if (order?.Inventory?.wareHouseId) {
                    io.to(`warehouse_${order.Inventory.wareHouseId}`).emit('locationUpdated', {
                        orderId: data.orderId,
                        location: data.location,
                        driverId: data.driverId,
                        isEmployee: data.isEmployee,
                        timestamp: new Date()
                    });
                }
            } catch (error) {
                console.error('Error updating driver location:', error);
                socket.emit('error', {
                    message: 'Failed to update driver location',
                    details: error instanceof Error ? error.message : String(error)
                });
            }
        });

        // Handle driver status (online/offline)
        socket.on('updateDriverStatus', async (data: { driverId: number, isEmployee: boolean, isOnline: boolean }) => {
            try {
                // Update driver status in room tracking
                io.to('admin_drivers').emit('driverStatusUpdated', {
                    driverId: data.driverId,
                    isEmployee: data.isEmployee,
                    isOnline: data.isOnline,
                    timestamp: new Date()
                });
            } catch (error) {
                console.error('Error updating driver status:', error);
                socket.emit('error', {
                    message: 'Failed to update driver status',
                    details: error instanceof Error ? error.message : String(error)
                });
            }
        });

        // Handle notifications
        socket.on('sendNotification', async (data: NotificationPayload) => {
            try {
                if (data.employeeId) {
                    // Employee notification
                    const notification = await prisma.employeeNotification.create({
                        data: {
                            employeeId: data.employeeId,
                            title: data.title,
                            content: data.content,
                            type: data.type,
                            orderId: data.orderId,
                            taskId: data.taskId,
                            ticketId: data.ticketId,
                            warehouseId: 1, // Default warehouse ID - should be changed based on your logic
                            updatedAt: new Date()
                        }
                    });

                    io.to(`employee_${data.employeeId}`).emit('newNotification', notification);
                    io.to('admin_notifications').emit('newNotification', notification);
                } else if (data.userId) {
                    // Customer notification
                    const customer = await prisma.customer.findFirst({
                        where: { userId: data.userId }
                    });

                    if (customer) {
                        const notification = await prisma.customerNotification.create({
                            data: {
                                customerId: customer.id,
                                title: data.title,
                                content: data.content,
                                type: data.type,
                                orderId: data.orderId
                            }
                        });

                        io.to(`user_${data.userId}`).emit('newNotification', notification);
                        io.to('admin_notifications').emit('newNotification', notification);
                    }
                }
            } catch (error) {
                console.error('Error sending notification:', error);
                socket.emit('error', {
                    message: 'Failed to send notification',
                    details: error instanceof Error ? error.message : String(error)
                });
            }
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
        });
    });

    return io;
}

/**
 * Emit an order created event to all connected clients in the admin_orders room
 * This should be called after an order is successfully created
 */
export function emitOrderCreated(io: any, order: any) {
    if (!io) {
        console.error("Socket.io server not initialized, cannot emit order created event");
        return;
    }

    try {
        console.log(`Emitting orderCreated event for order ${order.id} to admin_orders room`);

        // Broadcast to admin room
        io.to('admin_orders').emit('orderCreated', order);

        // Also notify warehouse-specific rooms if applicable
        if (order.Inventory?.wareHouseId) {
            io.to(`warehouse_${order.Inventory.wareHouseId}`).emit('orderCreated', order);
        }

        // Notify the customer's room
        if (order.senderCustomerId) {
            io.to(`user_${order.senderCustomerId}`).emit('orderCreated', order);
        }

        // Notify the receiver's room if it's another customer
        if (order.receiverCustomerId) {
            io.to(`user_${order.receiverCustomerId}`).emit('orderCreated', order);
        }
    } catch (error) {
        console.error('Error emitting order created event:', error);
    }
}

/**
 * Function to update multiple clients about a new order
 * This can be called from API routes
 */
export async function notifyNewOrder(io: any, prisma: any, orderId: number) {
    if (!io || !prisma) {
        console.error("Required dependencies not available");
        return;
    }

    try {
        // Fetch the complete order data with relations
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

        if (order) {
            emitOrderCreated(io, order);
        }
    } catch (error) {
        console.error(`Error notifying about new order ${orderId}:`, error);
    }
} 