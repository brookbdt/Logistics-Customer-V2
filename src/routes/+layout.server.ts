import { redirect } from "@sveltejs/kit";

export async function load(event) {
  const session =
    (await event.locals.getSession()) as EnhancedSessionType | null;

  // Debug the current path
  console.log("Current path:", event.url.pathname);

  const isPublicRoute = event.url.pathname.startsWith('/(public)') ||
    event.url.pathname === '/' ||
    event.url.pathname === '/services' ||
    event.url.pathname === '/about' ||
    event.url.pathname === '/contact' ||
    event.url.pathname === '/privacy' ||
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
