
import { Order, OrderItem, OrderStatus } from '../types';
import { Database } from '../supabaseTypes';

// Types from Supabase
type SupabaseOrder = Database['public']['Tables']['orders']['Insert'];
type SupabaseOrderItem = Database['public']['Tables']['order_items']['Insert'];

// Mappers

export const mapStatusToSupabase = (status: OrderStatus): string => {
    // Already in English/Lower if using typed OrderStatus
    return status.toLowerCase();
};

export const mapStatusFromSupabase = (status: string): OrderStatus => {
    const s = status.toLowerCase();
    switch (s) {
        case 'received': return 'pending'; // Map 'received' to 'pending' for consistency
        case 'paid': return 'pending'; // New paid orders should show as pending for prep
        case 'bill_requested': return 'pending';
        case 'delivered': return 'served'; // Handle both 'served' and 'delivered'
        default: return s as OrderStatus;
    }
};

export const mapOrderToSupabase = (order: Order, storeId: string): SupabaseOrder => {
    // Priority 1: Direct node_id on order (Manual creation from Admin)
    // Priority 2: QR Context (Client scan)
    let nodeId = order.node_id || null;

    if (!nodeId) {
        try {
            const qrContextStr = localStorage.getItem('qr_context');
            if (qrContextStr) {
                const qrContext = JSON.parse(qrContextStr);
                if (qrContext.node_id) {
                    nodeId = qrContext.node_id;
                }
            }
        } catch (e) {
            console.warn('[mapOrderToSupabase] Error reading QR context:', e);
        }
    }
    // Also check for session_id
    let sessionId = null;
    try {
        const clientSessionId = localStorage.getItem('client_session_id');
        if (clientSessionId) {
            sessionId = clientSessionId;
        }
    } catch (e) {
        console.warn('[mapOrderToSupabase] Error reading session ID:', e);
    }

    return {
        id: order.id,
        store_id: storeId,
        client_id: order.client_id || null,
        // customer_name column does not exist in DB
        total_amount: order.amount,
        status: mapStatusToSupabase(order.status),
        node_id: nodeId,
        session_id: sessionId,
        payment_status: order.payment_status || 'pending',
        payment_method: order.paymentMethod || null,
        payment_provider: order.payment_provider || null,
        is_paid: order.is_paid || false,
        order_number: null, // Let DB trigger handle the serial sequence
        table_number: order.table || null,
        // CRITICAL FIX: Stop writing to legacy JSONB items column
        items: []
    } as SupabaseOrder;
};

export const mapOrderItemToSupabase = (item: OrderItem, orderId: string, storeId: string): SupabaseOrderItem => {
    return {
        order_id: orderId,
        store_id: storeId,
        tenant_id: storeId, // Using store_id as tenant_id
        product_id: item.productId || null,
        quantity: item.quantity,
        unit_price: item.price_unit,
        total_price: (item.price_unit || 0) * item.quantity,
        notes: (item as any).notes || (item as any).note || null,
    } as SupabaseOrderItem;
};
