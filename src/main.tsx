import * as React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from '../App';
import '../index.css';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const SENTRY_RELEASE = import.meta.env.VITE_RELEASE || import.meta.env.VITE_COMMIT_SHA;
const SENTRY_ENVIRONMENT = import.meta.env.MODE;

const TAG_ALLOWLIST = new Set([
    'store_id',
    'store_slug',
    'environment',
    'release',
    'role',
    'route',
    'tenant_unassigned'
]);

const sanitizeUrl = (url?: string) => {
    if (!url) return url;
    try {
        const parsed = new URL(url, window.location.origin);
        parsed.search = '';
        return parsed.toString();
    } catch {
        return url.split('?')[0];
    }
};

const sanitizeTags = (tags?: Record<string, unknown>): Record<string, string> | undefined => {
    if (!tags) return undefined;
    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(tags)) {
        if (TAG_ALLOWLIST.has(key) && value !== undefined && value !== null) {
            sanitized[key] = typeof value === 'string' ? value : String(value);
        }
    }
    return sanitized;
};

const initSentry = () => {
    if (!SENTRY_DSN) return;
    Sentry.init({
        dsn: SENTRY_DSN,
        environment: SENTRY_ENVIRONMENT,
        release: SENTRY_RELEASE || undefined,
        tracesSampleRate: 0,
        beforeSend(event) {
            if (event.request) {
                event.request.url = sanitizeUrl(event.request.url);
                delete event.request.headers;
                delete event.request.cookies;
                delete event.request.data;
            }

            if (event.user) {
                event.user = event.user.id ? { id: event.user.id } : undefined;
            }

            event.tags = sanitizeTags(event.tags as Record<string, unknown> | undefined);
            delete event.extra;
            return event;
        },
        beforeBreadcrumb(breadcrumb) {
            if (!breadcrumb) return breadcrumb;
            if (breadcrumb.data) {
                if (typeof breadcrumb.data.url === 'string') {
                    breadcrumb.data.url = sanitizeUrl(breadcrumb.data.url);
                }
                delete breadcrumb.data.body;
                delete breadcrumb.data.request;
                delete breadcrumb.data.response;
                delete breadcrumb.data.headers;
            }
            return breadcrumb;
        }
    });

    Sentry.setTag('environment', SENTRY_ENVIRONMENT);
    if (SENTRY_RELEASE) {
        Sentry.setTag('release', SENTRY_RELEASE);
    }
    Sentry.setTag('tenant_unassigned', 'true');
};

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error("Could not find root element to mount to");
}

const ErrorFallback: React.FC<{ error: Error }> = ({ error }) => (
    <div style={{ color: 'white', padding: 20, background: '#111', height: '100vh', fontFamily: 'monospace' }}>
        <h1>💥 CRITICAL APP CRASH</h1>
        <p>The application encountered a fatal error.</p>
        <pre style={{ color: '#f87171', background: '#333', padding: 10, overflow: 'auto' }}>
            {error?.toString()}
        </pre>
        <button onClick={() => window.location.reload()} style={{ marginTop: 20, padding: 10 }}>RELOAD</button>
    </div>
);

const ErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Sentry.ErrorBoundary
        fallback={({ error }) => <ErrorFallback error={error as Error} />}
        onError={(error, componentStack) => {
            console.error("Uncaught error:", error, componentStack);
        }}
    >
        {children}
    </Sentry.ErrorBoundary>
);

initSentry();

const root = ReactDOM.createRoot(rootElement);
root.render(
    <React.StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </React.StrictMode>
);
