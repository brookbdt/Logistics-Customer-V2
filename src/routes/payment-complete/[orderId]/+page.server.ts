import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { verifyChapa } from '$lib/services/payment';
import { prisma } from '$lib/utils/prisma';
// Define the EnhancedSessionType directly since the module can't be found
interface EnhancedSessionType {
    customerData: {
        id: number;
    };
    userData: {
        id?: number;
        userName?: string;
        email?: string;
        phoneNumber?: string;
    };
}
import type { Order_orderStatus, PackageType, OrderType, GoodsType, Vehicles_vehicleType } from '@prisma/client';
import { sendMail } from '$lib/utils/send-email.server';
import { WEBAPP_URL } from '$env/static/private';
// Import warehouse routing functions from the create-order server file
// since they don't seem to be in a separate utility module
// We'll need to copy those functions into this file
// import { findOptimalWarehouseRoute, geocodeCityFromCoordinates } from '$lib/utils/warehouse-routing';
// import { getPricingConfig } from '$lib/utils/pricing';

export const load: PageServerLoad = async ({ params, locals, url }) => {
    const session = await locals.getSession() as EnhancedSessionType | null;

    if (!session) {
        throw redirect(303, '/login');
    }

    const orderId = parseInt(params.orderId);

    if (isNaN(orderId)) {
        throw redirect(303, '/all-orders');
    }

    // Find the order
    const order = await prisma.order.findUnique({
        where: { id: orderId },
    });

    if (!order) {
        throw redirect(303, '/all-orders');
    }

    let paymentSuccess = false;

    // If the order has a payment reference, verify payment
    if (order.paymentRef) {
        const paymentVerification = await verifyChapa(order.paymentRef);

        if (paymentVerification.success) {
            // Payment successful, update order status
            const updatedOrder = await prisma.order.update({
                where: { id: orderId },
                data: {
                    paymentStatus: true,
                    orderStatus: 'BEING_REVIEWED' as Order_orderStatus
                }
            });

            paymentSuccess = true;

            // Check if this was a draft order by checking for metadata
            if (order.metadata) {
                try {
                    const metadata = JSON.parse(order.metadata as string);

                    if (metadata.isDraft && metadata.completeOrderData) {
                        // This was a draft order that needs to be finalized
                        console.log("Finalizing draft order with ID:", orderId);

                        await finalizeOrderAfterPayment(order, metadata.completeOrderData, session, locals);

                        return {
                            orderId,
                            paymentSuccess: true,
                            isDraft: true
                        };
                    }
                } catch (error) {
                    console.error("Error parsing order metadata:", error);
                }
            }
        }
    }

    // If we get here, either payment verification failed or
    // this was not a draft order. Redirect to order details.
    return {
        orderId,
        paymentSuccess: paymentSuccess || order.paymentStatus || false,
        isDraft: false
    };
};

// Define warehouse interface for better type checking
interface Warehouse {
    id: number;
    name: string;
    mapLocation: string;
    city: string;
}

/**
 * Helper function to find the city from coordinates
 * Simplified version to avoid dependency on external utility
 */
async function geocodeCityFromCoordinates(lat: number, lng: number, warehouses: any[]) {
    // Basic implementation that uses the nearest warehouse's city
    let nearestWarehouse = null;
    let shortestDistance = Infinity;

    for (const warehouse of warehouses) {
        if (warehouse.mapLocation && warehouse.region?.name) {
            try {
                const [warehouseLat, warehouseLng] = warehouse.mapLocation.split(',').map(Number);
                const distance = Math.sqrt(
                    Math.pow(lat - warehouseLat, 2) + Math.pow(lng - warehouseLng, 2)
                );

                if (distance < shortestDistance) {
                    shortestDistance = distance;
                    nearestWarehouse = warehouse;
                }
            } catch (error) {
                console.error(`Error parsing warehouse location: ${warehouse.mapLocation}`, error);
            }
        }
    }

    return nearestWarehouse?.region?.name || null;
}

/**
 * Helper function to find optimal warehouses for route
 */
async function findOptimalWarehouseRoute(
    senderLat: number,
    senderLng: number,
    receiverLat: number,
    receiverLng: number,
    originCity: string,
    destinationCity: string,
    warehouses: any[]
): Promise<Warehouse[]> {
    // Find sender warehouse (closest to sender coordinates)
    let nearestToSenderWarehouse: Warehouse | null = null;
    let shortestSenderDistance = Infinity;

    // Find receiver warehouse (closest to receiver coordinates)
    let nearestToReceiverWarehouse: Warehouse | null = null;
    let shortestReceiverDistance = Infinity;

    for (const warehouse of warehouses) {
        if (warehouse.mapLocation) {
            try {
                const [warehouseLat, warehouseLng] = warehouse.mapLocation.split(',').map(Number);

                // Calculate distance to sender
                const senderDistance = Math.sqrt(
                    Math.pow(senderLat - warehouseLat, 2) + Math.pow(senderLng - warehouseLng, 2)
                );

                // Calculate distance to receiver
                const receiverDistance = Math.sqrt(
                    Math.pow(receiverLat - warehouseLat, 2) + Math.pow(receiverLng - warehouseLng, 2)
                );

                // Update nearest sender warehouse if closer
                if (senderDistance < shortestSenderDistance) {
                    shortestSenderDistance = senderDistance;
                    nearestToSenderWarehouse = {
                        id: warehouse.id,
                        name: warehouse.name,
                        mapLocation: warehouse.mapLocation,
                        city: warehouse.region?.name || "Unknown"
                    };
                }

                // Update nearest receiver warehouse if closer
                if (receiverDistance < shortestReceiverDistance) {
                    shortestReceiverDistance = receiverDistance;
                    nearestToReceiverWarehouse = {
                        id: warehouse.id,
                        name: warehouse.name,
                        mapLocation: warehouse.mapLocation,
                        city: warehouse.region?.name || "Unknown"
                    };
                }
            } catch (error) {
                console.error(`Error processing warehouse location: ${warehouse.mapLocation}`, error);
            }
        }
    }

    // Return array with the nearest warehouses
    return [nearestToSenderWarehouse, nearestToReceiverWarehouse].filter((w): w is Warehouse => w !== null);
}

/**
 * Finalizes a draft order after successful payment
 * Implements the remaining functionality from createOrder action
 */
async function finalizeOrderAfterPayment(
    draftOrder: any,
    formData: any,
    session: EnhancedSessionType,
    locals: any
) {
    try {
        console.log("Starting order finalization process for draft order:", draftOrder.id);

        // STEP 1: Extract coordinates for warehouses
        let senderCoords: number[] = [];
        let receiverCoords: number[] = [];

        try {
            // Parse and validate sender coordinates
            senderCoords = draftOrder.pickUpMapLocation.split(',').map((coord: string) => {
                const num = Number(coord.trim());
                if (isNaN(num)) throw new Error(`Invalid sender coordinate: ${coord}`);
                return num;
            });

            // Parse and validate receiver coordinates
            receiverCoords = draftOrder.dropOffMapLocation.split(',').map((coord: string) => {
                const num = Number(coord.trim());
                if (isNaN(num)) throw new Error(`Invalid receiver coordinate: ${coord}`);
                return num;
            });

            console.log("Coordinates parsed successfully:", {
                sender: senderCoords,
                receiver: receiverCoords
            });
        } catch (error) {
            console.error("Coordinate validation error:", error);
            throw error;
        }

        // STEP 2: Find warehouses
        const warehouses = await prisma.warehouse.findMany({
            where: {
                warehouseStatus: "ACTIVE",
                deletedAt: null
            },
            include: {
                region: true,
            },
        });

        if (warehouses.length === 0) {
            console.error("No active warehouses found");
            throw new Error("No active warehouses found in the system");
        }

        console.log(`Found ${warehouses.length} active warehouses`);

        // STEP 3: Geocode cities from coordinates
        let originCity = draftOrder.originCity || "Addis Ababa";
        let destinationCity = draftOrder.destinationCity || "Addis Ababa";

        try {
            const geocodedOriginCity = await geocodeCityFromCoordinates(senderCoords[0], senderCoords[1], warehouses);
            const geocodedDestinationCity = await geocodeCityFromCoordinates(receiverCoords[0], receiverCoords[1], warehouses);

            if (geocodedOriginCity) {
                originCity = geocodedOriginCity;
            }

            if (geocodedDestinationCity) {
                destinationCity = geocodedDestinationCity;
            }

            console.log("Cities determined:", { originCity, destinationCity });
        } catch (error) {
            console.error("Error during geocoding:", error);
            // Continue with the original city names
        }

        // STEP 4: Find optimal warehouse route
        const optimalWarehouses = await findOptimalWarehouseRoute(
            senderCoords[0],
            senderCoords[1],
            receiverCoords[0],
            receiverCoords[1],
            originCity,
            destinationCity,
            warehouses
        );

        console.log("Optimal warehouses:", optimalWarehouses);

        // Initialize warehouse variables
        let nearToSenderWarehouse: Warehouse | null = null;
        let nearToReceiverWarehouse: Warehouse | null = null;

        // Check if we found any warehouses
        if (optimalWarehouses && optimalWarehouses.length > 0) {
            nearToSenderWarehouse = optimalWarehouses[0];

            if (optimalWarehouses.length > 1) {
                nearToReceiverWarehouse = optimalWarehouses[1];
            } else {
                // If only one warehouse was found, use it for both
                nearToReceiverWarehouse = optimalWarehouses[0];
            }
        } else {
            // FALLBACK: Use the first warehouse
            if (warehouses.length > 0) {
                const firstWarehouse = warehouses[0];
                nearToSenderWarehouse = {
                    id: firstWarehouse.id,
                    name: firstWarehouse.name,
                    mapLocation: firstWarehouse.mapLocation || "",
                    city: firstWarehouse.region?.name || "Unknown"
                };
                nearToReceiverWarehouse = nearToSenderWarehouse;
            } else {
                throw new Error("No warehouses are available in the system");
            }
        }

        // Make sure we have valid warehouses before proceeding
        if (!nearToSenderWarehouse || !nearToReceiverWarehouse) {
            throw new Error("Failed to determine valid warehouses for this order");
        }

        // STEP 5: Create order milestones
        const isInCityBool = draftOrder.isInCity;
        const orderMilestones = [];

        // Standard milestone sequence for all orders
        orderMilestones.push(
            {
                description: "Order Created",
                coordinates: draftOrder.pickUpMapLocation,
                warehouseId: nearToSenderWarehouse.id,
                isCompleted: true, // This milestone is completed when order is created
                executionOrder: 1
            },
            {
                description: "Order Accepted",
                coordinates: draftOrder.pickUpMapLocation,
                warehouseId: nearToSenderWarehouse.id,
                executionOrder: 2
            },
            {
                description: "Order Assigned",
                coordinates: draftOrder.pickUpMapLocation,
                warehouseId: nearToSenderWarehouse.id,
                executionOrder: 3
            },
            {
                description: "Items Collected",
                coordinates: draftOrder.pickUpMapLocation,
                warehouseId: nearToSenderWarehouse.id,
                executionOrder: 4
            }
        );

        // Add appropriate transit milestone based on in-city or between-cities
        if (isInCityBool) {
            orderMilestones.push({
                description: "In Transit",
                coordinates: draftOrder.pickUpMapLocation,
                warehouseId: nearToSenderWarehouse.id,
                executionOrder: 5
            });
        } else {
            orderMilestones.push({
                description: `Shipped (from ${originCity} to ${destinationCity})`,
                coordinates: nearToReceiverWarehouse.mapLocation,
                warehouseId: nearToReceiverWarehouse.id,
                executionOrder: 5
            });
        }

        // Add final milestones
        orderMilestones.push(
            {
                description: "Delivered to Customer",
                coordinates: draftOrder.dropOffMapLocation,
                warehouseId: isInCityBool ? nearToSenderWarehouse.id : nearToReceiverWarehouse.id,
                executionOrder: 6,
                isLastMilestone: true
            }
        );

        // STEP 6: Update the order with the remaining fields and milestones
        const updateData = {
            // Add warehouse IDs
            nearToSenderWarehouseId: nearToSenderWarehouse.id,
            // Add origin and destination cities if they weren't set
            originCity: originCity,
            destinationCity: destinationCity,
            // Add order milestones
            orderMilestone: {
                createMany: {
                    data: orderMilestones.map(milestone => ({
                        description: milestone.description,
                        coordinates: milestone.coordinates,
                        warehouseId: milestone.warehouseId,
                        isCompleted: milestone.isCompleted || false,
                        executionOrder: milestone.executionOrder,
                        isLastMilestone: milestone.isLastMilestone || false
                    })),
                },
            },
            // Clear the draft metadata flag
            metadata: JSON.stringify({
                wasFinalizedAfterPayment: true,
                finalizedAt: new Date().toISOString()
            })
        };

        // Update the order with all the additional information
        const updatedOrder = await prisma.order.update({
            where: { id: draftOrder.id },
            data: updateData
        });

        console.log("Order updated with ID:", updatedOrder.id);

        // STEP 7: Create notifications
        // Create customer notifications
        await prisma.customerNotification.create({
            data: {
                customerId: Number(session?.customerData.id),
                title: "Order Payment Successful",
                content: `Your payment for order #${draftOrder.id} was successful. Your order is now being processed.`,
                type: "PAYMENT_COMPLETED",
                orderId: draftOrder.id,
                metadata: JSON.stringify({
                    order_id: draftOrder.id,
                    order_status: "BEING_REVIEWED",
                    pickup_location: draftOrder.pickUpPhysicalLocation,
                    dropoff_location: draftOrder.dropOffPhysicalLocation,
                })
            }
        });

        // Create employee notifications
        await prisma.employeeNotification.create({
            data: {
                warehouseId: nearToSenderWarehouse.id,
                title: "New Paid Order",
                content: `New order #${draftOrder.id} has been assigned to ${nearToSenderWarehouse.name} and is ready for processing.`,
                type: "ORDER_CREATED",
                orderId: draftOrder.id,
                updatedAt: new Date(),
                employeeId: null, // Explicitly set to null
                metadata: JSON.stringify({
                    order_id: draftOrder.id,
                    order_status: "BEING_REVIEWED",
                    pickup_location: draftOrder.pickUpPhysicalLocation,
                    dropoff_location: draftOrder.dropOffPhysicalLocation,
                })
            }
        });

        // Notify receiver if they are a registered customer
        if (draftOrder.receiverCustomerId) {
            await prisma.customerNotification.create({
                data: {
                    customerId: Number(draftOrder.receiverCustomerId),
                    title: "New Order Coming Your Way",
                    content: `An order #${draftOrder.id} from ${session?.userData.userName} is being sent to you.`,
                    type: "ORDER_RECEIVED",
                    orderId: draftOrder.id,
                    metadata: JSON.stringify({
                        order_id: draftOrder.id,
                        order_status: "BEING_REVIEWED",
                        sender_name: session?.userData.userName,
                        sender_phone: session?.userData.phoneNumber,
                    })
                }
            });
        }

        // STEP 8: Send email notifications
        try {
            // 1. Send email to receiver if they have an email
            if (draftOrder.receiverEmail) {
                await sendMail(
                    draftOrder.receiverEmail,
                    "Order coming to you has been created and paid",
                    `An order with id ${draftOrder.id} from ${session.userData.userName}, (${session.userData.phoneNumber}) is coming to ${draftOrder.dropOffPhysicalLocation} from ${draftOrder.pickUpPhysicalLocation}`
                );
            }

            // 2. Send confirmation email to sender
            if (session.userData.email) {
                await sendMail(
                    session.userData.email,
                    "Your order payment was successful",
                    `Your payment for order with ID ${draftOrder.id} has been processed successfully. 
           
Package Details:
- Type: ${draftOrder.packageType}
- Pickup: ${draftOrder.pickUpPhysicalLocation}
- Delivery: ${draftOrder.dropOffPhysicalLocation}
- Total Cost: ETB ${draftOrder.totalCost.toFixed(2)}
           
Your order is being processed and will be picked up soon. You can track your order status in your account.`
                );
            }
        } catch (emailError) {
            // Log email errors but don't fail the request
            console.error("Error sending email notifications:", emailError);
        }

        // STEP 9: Realtime socket notification if available
        try {
            // Send realtime notification if the function is available
            if (locals.notifyNewOrder) {
                // Add a small delay to ensure the transaction is fully committed
                await new Promise(resolve => setTimeout(resolve, 500));
                await locals.notifyNewOrder(draftOrder.id);
                console.log(`Real-time notification sent for order ${draftOrder.id}`);
            }
        } catch (socketError) {
            console.error("Failed to send real-time notification:", socketError);
        }

        console.log("Order finalization completed successfully");
        return true;

    } catch (error) {
        console.error("Error finalizing order after payment:", error);
        throw error;
    }
} 