// QR Context Helper - Manages localStorage context for QR scans
// TTL: table = 4 hours, qr/bar/generic = 30 minutes

export interface QRContext {
    store_id: string;
    store_slug: string;
    qr_hash: string;
    qr_id: string;
    node_id: string | null;
    node_label: string | null;
    node_type: 'table' | 'bar' | 'pickup_zone' | null;
    channel: 'table' | 'qr' | 'takeaway' | 'delivery';
    started_at: number;  // ms epoch
    expires_at: number;  // ms epoch
}

const STORAGE_KEY = 'qr_context';

// TTL in milliseconds
const TTL_TABLE = 4 * 60 * 60 * 1000;      // 4 hours
const TTL_OTHER = 30 * 60 * 1000;          // 30 minutes

/**
 * Calculate TTL based on channel type
 */
export function getTTL(channel: QRContext['channel']): number {
    return channel === 'table' ? TTL_TABLE : TTL_OTHER;
}

/**
 * Check if a context is expired
 */
export function isExpired(ctx: QRContext): boolean {
    return Date.now() > ctx.expires_at;
}

/**
 * Save QR context to localStorage
 */
export function setQRContext(ctx: Omit<QRContext, 'started_at' | 'expires_at'>): QRContext {
    const now = Date.now();
    const ttl = getTTL(ctx.channel);

    const fullContext: QRContext = {
        ...ctx,
        started_at: now,
        expires_at: now + ttl,
    };

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fullContext));
    } catch (e) {
        console.error('Failed to save QR context:', e);
    }

    return fullContext;
}

/**
 * Get QR context from localStorage
 * Returns null if not found or expired
 */
export function getQRContext(): QRContext | null {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return null;

        const ctx: QRContext = JSON.parse(stored);

        // Validate structure
        if (!ctx.store_id || !ctx.store_slug || !ctx.qr_hash) {
            clearQRContext();
            return null;
        }

        // Check expiration
        if (isExpired(ctx)) {
            clearQRContext();
            return null;
        }

        return ctx;
    } catch (e) {
        console.error('Failed to read QR context:', e);
        clearQRContext();
        return null;
    }
}

/**
 * Clear QR context from localStorage
 */
export function clearQRContext(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        console.error('Failed to clear QR context:', e);
    }
}

/**
 * Renew the TTL of an existing context
 */
export function renewQRContext(): QRContext | null {
    const ctx = getQRContext();
    if (!ctx) return null;

    // Re-save with fresh TTL
    return setQRContext({
        store_id: ctx.store_id,
        store_slug: ctx.store_slug,
        qr_hash: ctx.qr_hash,
        qr_id: ctx.qr_id,
        node_id: ctx.node_id,
        node_label: ctx.node_label,
        node_type: ctx.node_type,
        channel: ctx.channel,
    });
}

/**
 * Check if the current context matches a store slug
 * Useful to avoid mixed contexts
 */
export function isContextForStore(slug: string): boolean {
    const ctx = getQRContext();
    return ctx !== null && ctx.store_slug === slug;
}

/**
 * Get QR context only if it belongs to the given store (by UUID)
 * Returns null if context is for a different store - prevents cross-store attacks
 */
export function getQRContextForStore(storeId: string): QRContext | null {
    const ctx = getQRContext();
    if (!ctx) return null;
    if (ctx.store_id !== storeId) {
        console.warn('[QR Security] Context store_id mismatch:', ctx.store_id, '!==', storeId);
        return null;
    }
    return ctx;
}

/**
 * Get remaining time in context (for display)
 */
export function getRemainingTime(ctx: QRContext): { minutes: number; seconds: number } {
    const remaining = Math.max(0, ctx.expires_at - Date.now());
    return {
        minutes: Math.floor(remaining / 60000),
        seconds: Math.floor((remaining % 60000) / 1000),
    };
}
