import { json } from '@sveltejs/kit';
import { prisma } from '$lib/utils/prisma';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {

    try {
        // Get session data and verify authentication
        const session =
            (await locals.getSession()) as EnhancedSessionType | null;
        if (!session) {
            return json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }
        console.log("session", session);

        // Get the customer ID
        const customer = await prisma.customer.findFirst({
            where: { userId: session.userData.id }
        });

        if (!customer) {
            return json({ success: false, message: 'Customer not found' }, { status: 404 });
        }
        console.log("customer", customer);

        // Fetch notifications for the customer
        const notifications = await prisma.customerNotification.findMany({
            where: { customerId: customer.id },
            orderBy: { createdAt: 'desc' },
            include: {
                Order: {
                    select: {
                        id: true,
                        orderStatus: true,
                        pickUpPhysicalLocation: true,
                        dropOffPhysicalLocation: true
                    }
                }
            }
        });

        //  console.log("notifications", notifications);


        return json({ success: true, notifications });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        return json(
            { success: false, message: 'Failed to fetch notifications' },
            { status: 500 }
        );
    }
};