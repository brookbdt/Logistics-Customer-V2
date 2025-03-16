import { json, redirect } from '@sveltejs/kit';
import { prisma } from '$lib/utils/prisma';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        // Get session data and verify authentication
        const session =
            (await locals.getSession()) as EnhancedSessionType | null;

        if (!session) {
            return json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }


        const body = await request.json();
        const { token } = body;

        if (!token) {
            return json({ success: false, message: 'Token is required' }, { status: 400 });
        }

        // Verify user exists and is a customer
        const customer = await prisma.customer.findUnique({
            where: { id: session.userData.id },

        });

        if (!customer) {
            return json({ success: false, message: 'Customer not found' }, { status: 404 });
        }

        if (!customer) {
            return json({ success: false, message: 'User is not a customer' }, { status: 400 });
        }

        // Update the FCM token for the customer
        await prisma.customer.update({
            where: { id: customer.id },
            data: { fcmToken: token }
        });

        return json({ success: true, message: 'FCM token updated successfully' });
    } catch (error) {
        console.error('Error updating FCM token:', error);
        return json(
            { success: false, message: 'Failed to update FCM token' },
            { status: 500 }
        );
    }
};