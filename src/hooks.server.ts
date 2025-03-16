import { authHook } from "$lib/hooks/auth-hook.server";
import { redirect } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";

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

    // The session is added by the authHook
    // @ts-ignore - getSession is added by the auth hook
    const session = await event.locals.getSession?.();

    // Handle app subdomain (customer app)
    if (host?.startsWith('app.behulum.com') && url === '/' && !session) {
        throw redirect(302, '/auth');
    }

    return resolve(event);
};

// Sequence the hooks in the correct order - domain hook first, then auth, then session-dependent hooks
export const handle = sequence(domainHook, authHook, sessionHook); 