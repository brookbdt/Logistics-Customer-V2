import { browser } from '$app/environment';

// Get socket URL from a query parameter if present
function getSocketUrlFromQueryParam(): string | null {
    if (!browser) return null;
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('socketUrl');
}

// Simple function to check if the socket server is available
export const checkSocketServerHealth = async (url: string): Promise<boolean> => {
    if (!browser) return false;

    try {
        // Add a socket-health endpoint to the URL
        const healthUrl = new URL('/socket-health', url).toString();
        const response = await fetch(healthUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            mode: 'cors',
            // Don't send credentials to avoid CORS issues
            credentials: 'omit',
            // Set a short timeout to fail fast
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) {
            console.warn(`Socket server health check failed with status: ${response.status}`);
            return false;
        }

        const data = await response.json();
        console.log('Socket server health check successful:', data);
        return true;
    } catch (error) {
        console.warn('Socket server health check failed:', error);
        return false;
    }
};

export const getSocketUrl = (): string => {
    if (!browser) return ''

    // Check if URL has a socket URL override
    const queryParamUrl = getSocketUrlFromQueryParam()
    if (queryParamUrl) {
        console.log('Using socket URL from query parameter:', queryParamUrl)
        return queryParamUrl
    }

    // In production, use the same origin (host) as the current page
    // This works because the Socket.IO server is part of the main app server
    if (import.meta.env.PROD) {
        // For the customer app in production, we need to connect to the admin app socket
        // Get the hostname and check if it's the customer app domain
        const hostname = window.location.hostname

        if (
            hostname === 'customer.behulum.com' ||
            hostname === 'app.behulum.com'
        ) {
            // When in customer app, connect to admin app socket server
            const adminSocketUrl = 'https://admin.behulum.com'
            console.log(
                'Customer app connecting to admin socket URL:',
                adminSocketUrl
            )
            return adminSocketUrl
        }

        // Otherwise use the same origin as the current page
        const origin = window.location.origin
        console.log('Using socket URL from current origin:', origin)
        return origin
    }

    // In development, connect to the right server
    // First try environment variable override
    if (import.meta.env.VITE_USE_REMOTE_SOCKET === 'true') {
        return 'https://admin.behulum.com'
    }

    // In local development
    const hostname = window.location.hostname
    const port = window.location.port

    // If we're in the customer app (running on port 4001/4002)
    if (port === '4001' || port === '4002' || hostname.includes('customer')) {
        // Connect to admin socket server in development
        return 'http://localhost:3005'
    }

    // Default for local development (admin app)
    return `http://localhost:${import.meta.env.VITE_SOCKET_PORT || '3005'}`
}