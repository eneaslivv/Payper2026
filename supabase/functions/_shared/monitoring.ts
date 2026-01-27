import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as Sentry from "https://deno.land/x/sentry@7.94.0/mod.ts";

const SENTRY_DSN = Deno.env.get("SENTRY_DSN") || '';
const SENTRY_ENVIRONMENT = Deno.env.get("SENTRY_ENV") || Deno.env.get("ENVIRONMENT") || 'unknown';
const SENTRY_RELEASE = Deno.env.get("SENTRY_RELEASE") || Deno.env.get("RELEASE") || '';

const TAG_ALLOWLIST = new Set([
    'store_id',
    'store_slug',
    'environment',
    'release',
    'role',
    'route',
    'tenant_unassigned',
    'function'
]);

let initialized = false;

const sanitizeUrl = (url: string) => {
    try {
        const parsed = new URL(url);
        parsed.search = '';
        return parsed.toString();
    } catch {
        return url.split('?')[0];
    }
};

const sanitizeTags = (tags?: Record<string, unknown>) => {
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
    if (!SENTRY_DSN || initialized) return;
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
            event.tags = sanitizeTags(event.tags);
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
    initialized = true;
    Sentry.setTag('environment', SENTRY_ENVIRONMENT);
    if (SENTRY_RELEASE) {
        Sentry.setTag('release', SENTRY_RELEASE);
    }
    Sentry.setTag('tenant_unassigned', 'true');
};

const resolveAuthContext = async (req: Request) => {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
        return { userId: null, storeId: null, role: null };
    }

    const token = authHeader.slice('Bearer '.length);
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
        return { userId: null, storeId: null, role: null };
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { userId: null, storeId: null, role: null };
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('store_id, role')
        .eq('id', user.id)
        .maybeSingle();

    return {
        userId: user.id,
        storeId: profile?.store_id ?? null,
        role: profile?.role ?? null
    };
};

export const initMonitoring = (functionName: string) => {
    if (!SENTRY_DSN) return;
    initSentry();
    Sentry.setTag('function', functionName);
};

export const captureException = async (error: unknown, req: Request, functionName: string) => {
    if (!SENTRY_DSN) return;
    initSentry();

    const authContext = await resolveAuthContext(req);
    const safeUrl = sanitizeUrl(req.url);

    Sentry.withScope((scope) => {
        scope.setTag('function', functionName);
        scope.setTag('environment', SENTRY_ENVIRONMENT);
        if (SENTRY_RELEASE) {
            scope.setTag('release', SENTRY_RELEASE);
        }

        if (authContext.storeId) {
            scope.setTag('store_id', authContext.storeId);
            scope.setTag('tenant_unassigned', 'false');
        } else {
            scope.setTag('tenant_unassigned', 'true');
        }

        if (authContext.role) {
            scope.setTag('role', authContext.role);
        }

        if (authContext.userId) {
            scope.setUser({ id: authContext.userId });
        }

        scope.setContext('request', {
            method: req.method,
            url: safeUrl
        });

        Sentry.captureException(error);
    });
};
