/**
 * Utility to get the base URL of the application.
 * Adapts to environment (localhost vs production) to ensure generated links are valid.
 */

const PRODUCTION_URL = 'https://www.payperapp.io';

export const getAppUrl = (): string => {
    // If explicitly set in environment (e.g. Vercel env var), use it
    if (import.meta.env.VITE_APP_BASE_URL) {
        return import.meta.env.VITE_APP_BASE_URL;
    }

    // If in browser context
    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;

        // Always use production URL for generated links (except for local testing)
        // This ensures QR codes and email links work on real devices
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            // For local development, use production URL so links work on phones
            return PRODUCTION_URL;
        }

        // Use current origin (works for payperapp.io, www.payperapp.io, etc)
        return window.location.origin;
    }

    // Fallback for non-browser environments
    return PRODUCTION_URL;
};
