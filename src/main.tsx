import * as React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from '../App';
import '../index.css';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const SENTRY_RELEASE = import.meta.env.VITE_RELEASE || import.meta.env.VITE_COMMIT_SHA;
const SENTRY_ENVIRONMENT = import.meta.env.MODE;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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

// --- Error reporting via raw fetch (works even when app context is broken) ---
let _reportThrottle = 0;
const reportErrorToSupabase = (payload: {
    error_message: string;
    error_stack?: string;
    url?: string;
}) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    // Throttle: max 1 report per 5 seconds
    const now = Date.now();
    if (now - _reportThrottle < 5000) return;
    _reportThrottle = now;

    const body = {
        error_message: (payload.error_message || 'Unknown error').slice(0, 2000),
        error_stack: (payload.error_stack || '').slice(0, 8000),
        url: payload.url || window.location.href,
        route: window.location.hash.replace('#', '') || '/',
        user_agent: navigator.userAgent,
        metadata: {
            timestamp: new Date().toISOString(),
            online: navigator.onLine,
            release: SENTRY_RELEASE || null
        }
    };

    fetch(`${SUPABASE_URL}/rest/v1/app_error_reports`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify(body)
    }).catch(() => { /* silent — we can't do anything if this fails */ });
};

// --- Premium Error Fallback UI ---
const ErrorFallback: React.FC<{ error: Error }> = ({ error }) => {
    const [reported, setReported] = React.useState(false);
    const [showDetails, setShowDetails] = React.useState(false);

    const handleReport = () => {
        reportErrorToSupabase({
            error_message: error?.message || error?.toString() || 'Unknown crash',
            error_stack: error?.stack,
            url: window.location.href
        });
        setReported(true);
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0D0F0D 0%, #1a1d1a 50%, #0D0F0D 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
            padding: 24
        }}>
            <div style={{
                maxWidth: 480,
                width: '100%',
                textAlign: 'center'
            }}>
                {/* Logo */}
                <div style={{
                    width: 56, height: 56, borderRadius: 16,
                    background: 'rgba(168,227,75,0.1)',
                    border: '2px solid rgba(168,227,75,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 32px',
                    fontSize: 28
                }}>
                    <span style={{ filter: 'grayscale(0.3)' }}>P</span>
                </div>

                {/* Title */}
                <h1 style={{
                    color: '#fff',
                    fontSize: 24,
                    fontWeight: 900,
                    letterSpacing: '-0.02em',
                    margin: '0 0 8px',
                    textTransform: 'uppercase'
                }}>
                    Algo sali&oacute; mal
                </h1>

                <p style={{
                    color: 'rgba(255,255,255,0.4)',
                    fontSize: 13,
                    fontWeight: 600,
                    margin: '0 0 32px',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase'
                }}>
                    Estamos trabajando para solucionarlo
                </p>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 24 }}>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            background: '#A8E34B',
                            color: '#000',
                            border: 'none',
                            borderRadius: 12,
                            padding: '14px 28px',
                            fontSize: 11,
                            fontWeight: 900,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            cursor: 'pointer'
                        }}
                    >
                        Recargar aplicaci&oacute;n
                    </button>
                    <button
                        onClick={handleReport}
                        disabled={reported}
                        style={{
                            background: reported ? 'rgba(168,227,75,0.1)' : 'rgba(255,255,255,0.05)',
                            color: reported ? '#A8E34B' : 'rgba(255,255,255,0.5)',
                            border: `1px solid ${reported ? 'rgba(168,227,75,0.3)' : 'rgba(255,255,255,0.1)'}`,
                            borderRadius: 12,
                            padding: '14px 28px',
                            fontSize: 11,
                            fontWeight: 900,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            cursor: reported ? 'default' : 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        {reported ? 'Reporte enviado' : 'Reportar problema'}
                    </button>
                </div>

                {/* Collapsible Details */}
                <button
                    onClick={() => setShowDetails(!showDetails)}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'rgba(255,255,255,0.2)',
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.15em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        padding: '8px 16px',
                        marginBottom: 12
                    }}
                >
                    {showDetails ? 'Ocultar detalles' : 'Ver detalles t\u00e9cnicos'}
                </button>

                {showDetails && (
                    <div style={{
                        background: 'rgba(0,0,0,0.4)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: 12,
                        padding: 16,
                        textAlign: 'left',
                        maxHeight: 200,
                        overflow: 'auto'
                    }}>
                        <p style={{
                            color: '#f87171',
                            fontSize: 11,
                            fontFamily: 'monospace',
                            margin: 0,
                            wordBreak: 'break-word',
                            whiteSpace: 'pre-wrap'
                        }}>
                            {error?.message || error?.toString()}
                        </p>
                        {error?.stack && (
                            <pre style={{
                                color: 'rgba(255,255,255,0.2)',
                                fontSize: 9,
                                fontFamily: 'monospace',
                                margin: '12px 0 0',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word'
                            }}>
                                {error.stack.split('\n').slice(1, 8).join('\n')}
                            </pre>
                        )}
                    </div>
                )}

                {/* Timestamp */}
                <p style={{
                    color: 'rgba(255,255,255,0.1)',
                    fontSize: 9,
                    fontWeight: 600,
                    marginTop: 24,
                    letterSpacing: '0.1em'
                }}>
                    {new Date().toLocaleString('es-AR')} &middot; {window.location.hash.replace('#', '') || '/'}
                </p>
            </div>
        </div>
    );
};

const ErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Sentry.ErrorBoundary
        fallback={({ error }) => <ErrorFallback error={error as Error} />}
        onError={(error, componentStack) => {
            console.error("Uncaught error:", error, componentStack);
            // Auto-report boundary crashes
            reportErrorToSupabase({
                error_message: (error as Error)?.message || String(error),
                error_stack: (error as Error)?.stack || componentStack || undefined,
                url: window.location.href
            });
        }}
    >
        {children}
    </Sentry.ErrorBoundary>
);

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error("Could not find root element to mount to");
}

initSentry();

// Global listeners for errors that escape the boundary (async, promises)
window.addEventListener('unhandledrejection', (event) => {
    reportErrorToSupabase({
        error_message: event.reason?.message || String(event.reason),
        error_stack: event.reason?.stack,
        url: window.location.href
    });
});

window.addEventListener('error', (event) => {
    reportErrorToSupabase({
        error_message: event.message || 'Unknown error',
        error_stack: event.error?.stack,
        url: window.location.href
    });
});

const root = ReactDOM.createRoot(rootElement);
root.render(
    <React.StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </React.StrictMode>
);
