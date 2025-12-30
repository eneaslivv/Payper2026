/**
 * Utility to get the base URL of the application.
 * Adapts to environment (localhost vs production) to ensure generated links are valid.
 */
export const getAppUrl = (): string => {
    // If explicitly set in environment (e.g. Vercel env var), use it
    if (import.meta.env.VITE_APP_BASE_URL) {
        return import.meta.env.VITE_APP_BASE_URL;
    }

    // If in browser context
    if (typeof window !== 'undefined') {
        const origin = window.location.origin;

        // If running locally, you might still want to generate production links for QR codes
        // that need to be scanned by phones (which can't access localhost).
        // However, for testing the flow locally, localhost is fine.
        // Uncomment the below if you WANT local dev to generate prod links.
        /*
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
           return 'https://payper2026.vercel.app'; // Production URL fallback
        }
        */

        return origin;
    }

    // Fallback for non-browser environments (though this app is client-side)
    return 'https://payper2026.vercel.app';
};
