import { authHook } from "$lib/hooks/auth-hook.server";
import { redirect } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";

// Add a new hook to handle subdomain routing
const subdomainHook: Handle = async ({ event, resolve }) => {
    const host = event.request.headers.get('host');
    const url = event.url.pathname;
    const session = await event.locals.getSession();

    // Handle app subdomain (customer app)
    if (host?.startsWith('app.behulum.com') && url === '/' && !session) {
        throw redirect(302, '/auth');
    }

    // Handle root domain
    if (host === 'behulum.com') {
        throw redirect(301, 'https://www.behulum.com' + url);
    }

    // If user is on admin.behulum.com but this is the customer app, redirect to app.behulum.com
    if (host?.startsWith('admin.behulum.com')) {
        throw redirect(301, 'https://app.behulum.com' + url);
    }

    return resolve(event);
};

export const handle = sequence(subdomainHook, authHook);