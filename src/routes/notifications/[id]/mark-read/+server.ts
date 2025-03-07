import { json } from '@sveltejs/kit';
import { prisma } from '$lib/utils/prisma';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
    try {
        // Get session data and verify authentication
        const session =
            (await locals.getSession()) as EnhancedSessionType | null;
        if (!session || !session?.customerData.id || !session?.userData.id) {
            return json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const notificationId = parseInt(params.id);
        if (isNaN(notificationId)) {
            return json({ success: false, message: 'Invalid notification ID' }, { status: 400 });
        }

        // Get the customer ID
        const customer = await prisma.customer.findFirst({
            where: { id: session.customerData.id }
        });

        if (!customer) {
            return json({ success: false, message: 'Customer not found' }, { status: 404 });
        }

        // Verify the notification belongs to this customer
        const notification = await prisma.customerNotification.findFirst({
            where: {
                id: notificationId,
                customerId: customer.id
            }
        });

        if (!notification) {
            return json({ success: false, message: 'Notification not found' }, { status: 404 });
        }

        // Mark as read
        await prisma.customerNotification.update({
            where: { id: notificationId },
            data: { isRead: true }
        });

        return json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        return json(
            { success: false, message: 'Failed to mark notification as read' },
            { status: 500 }
        );
    }
};