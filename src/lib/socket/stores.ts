import { writable } from 'svelte/store';

// Define stores for socket state
export const isConnected = writable(false);
export const socketError = writable<null | { message: string, details?: string }>(null);
export const realtimeDisabled = writable(false); 