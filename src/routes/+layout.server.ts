import { redirect } from "@sveltejs/kit";

export async function load(event) {
  const session =
    (await event.locals.getSession()) as EnhancedSessionType | null;

  // Debug the current path
  console.log("Current path:", event.url.pathname);

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

  const isPublicRoute = event.url.pathname.startsWith('/(public)') ||
    event.url.pathname === '/' ||
    event.url.pathname === '/services' ||
    event.url.pathname === '/about' ||
    event.url.pathname === '/contact' ||
    event.url.pathname === '/privacy' ||
    event.url.pathname === '/terms-of-service' ||
    event.url.pathname === '/privacy-policy' ||
    event.url.pathname === '/terms' ||
    event.url.pathname === '/faq' ||
    event.url.pathname === '/blog' ||
    event.url.pathname === '/blog/1';

  console.log({ isPublicRoute });
  console.log({ event: event.url.pathname });

  // Check if we're on the root path explicitly
  const isRootPath = event.url.pathname === '/';
  console.log({ isRootPath });

  if (
    session === null &&
    !isPublicRoute &&
    !isApiRoute(event.url.pathname) &&
    !isRootPath && // Add explicit check for root path
    event.url.pathname !== "/auth" &&
    event.url.pathname !== "/auth/signup" &&
    event.url.pathname !== "/auth/signup-error"
  ) {
    throw redirect(308, "/auth");
  }

  if (session !== null && (event.url.pathname === '/' || event.url.pathname === '')) {
    throw redirect(302, '/all-orders');
  }

  return {
    session: session,
  };
}
