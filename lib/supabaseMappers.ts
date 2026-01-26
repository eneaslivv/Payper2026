
import { Order, OrderItem, OrderStatus, Table } from '../types';
import { Database } from '../supabaseTypes';

// Types from Supabase
type SupabaseOrder = Database['public']['Tables']['orders']['Insert'];
type SupabaseOrderItem = Database['public']['Tables']['order_items']['Insert'];

// Mappers

export const mapStatusToSupabase = (status: OrderStatus): string => {
    switch (status) {
        case 'Pendiente': return 'pending';
        case 'En Preparación': return 'preparing';
        case 'Listo': return 'ready';
        case 'Entregado': return 'served';
        case 'Cancelado': return 'cancelled';
        case 'Demorado': return 'pending';
        default: return 'pending';
    }
};

export const mapStatusFromSupabase = (status: string): OrderStatus => {
    switch (status) {
        case 'pending': return 'Pendiente';
        case 'received': return 'Pendiente'; // Map 'received' to 'Pendiente' for Admin Board
        case 'paid': return 'Pendiente'; // New paid orders should show as Pending for prep
        case 'bill_requested': return 'Pendiente'; // Handle bill requested
        case 'preparing': return 'En Preparación';
        case 'ready': return 'Listo';
        case 'served': return 'Entregado';
        case 'delivered': return 'Entregado'; // Handle both 'served' and 'delivered'
        case 'cancelled': return 'Cancelado';
        default: return 'Pendiente';
    }
};

export const mapOrderToSupabase = (order: Order, storeId: string): any => {
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
    };
};

export const mapOrderItemToSupabase = (item: OrderItem, orderId: string, storeId: string): any => {
    return {
        order_id: orderId,
        store_id: storeId,
        tenant_id: storeId, // Using store_id as tenant_id
        product_id: item.productId || null,
        quantity: item.quantity,
        unit_price: item.price_unit,
        total_price: (item.price_unit || 0) * item.quantity,
        notes: (item as any).notes || (item as any).note || null,
    };
};
