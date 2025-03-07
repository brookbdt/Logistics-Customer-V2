import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
    id: string;
    message: string;
    type: ToastType;
    timeout?: number;
    theme?: Record<string, string>;
}

function createToastStore() {
    const { subscribe, update } = writable<ToastMessage[]>([]);

    function push(toast: Omit<ToastMessage, 'id'> & { id?: string }) {
        const id = toast.id || Math.random().toString(36).substring(2, 9);
        const type = toast.type || 'info';
        const timeout = toast.timeout || 5000; // Default 5 seconds

        update(toasts => [
            ...toasts,
            { ...toast, id, type, timeout }
        ]);

        // Auto-remove toast after timeout
        if (timeout > 0) {
            setTimeout(() => {
                remove(id);
            }, timeout);
        }
    }

    function remove(id: string) {
        update(toasts => toasts.filter(t => t.id !== id));
    }

    function clear() {
        update(() => []);
    }

    return {
        subscribe,
        push,
        remove,
        clear,
        success: (message: string, timeout?: number) => push({ message, type: 'success', timeout }),
        error: (message: string, timeout?: number) => push({
            message,
            type: 'error',
            timeout,
            theme: {
                "--toastBackground": "#F56565",
                "--toastBarBackground": "#C53030",
            }
        }),
        warning: (message: string, timeout?: number) => push({ message, type: 'warning', timeout }),
        info: (message: string, timeout?: number) => push({ message, type: 'info', timeout })
    };
}

export const toast = createToastStore(); 