import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
    // Return the manifest JSON with the correct content type
    return json({
        "short_name": "Logistics App",
        "name": "Logistics Customer App",
        "start_url": "/",
        "icons": [
            {
                "src": "/favicon.png",
                "type": "image/png",
                "sizes": "192x192",
                "purpose": "any maskable"
            },
            {
                "src": "/favicon.png",
                "type": "image/png",
                "sizes": "512x512",
                "purpose": "any maskable"
            }
        ],
        "background_color": "#ffffff",
        "display": "standalone",
        "scope": "/",
        "theme_color": "#38bcfd",
        "orientation": "portrait",
        "description": "Customer application for logistics services",
        "gcm_sender_id": "586615946696"
    }, {
        headers: {
            'Content-Type': 'application/manifest+json'
        }
    });
}; 