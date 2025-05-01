import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
    // Get the socket port from server environment variables
    const defaultPort = 4003; // Updated to use port 4003 to match the admin app

    // Return the active socket port from server
    const socketPort = locals.socketPort || defaultPort;
    console.log(`Socket port endpoint requested: Reporting port ${socketPort}, active: ${!!locals.socketIO}`);

    return json({
        active: !!locals.socketIO,
        port: socketPort
    });
};