import { authHook } from "$lib/hooks/auth-hook.server";
import { redirect } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";


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

// Sequence the hooks in the correct order - domain hook first, then auth, then session-dependent hooks
export const handle = sequence(domainHook, authHook, sessionHook); 