
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
        case 'preparing': return 'En Preparación';
        case 'ready': return 'Listo';
        case 'served': return 'Entregado';
        case 'delivered': return 'Entregado'; // Handle both 'served' and 'delivered'
        case 'cancelled': return 'Cancelado';
        default: return 'Pendiente';
    }
};

export const mapOrderToSupabase = (order: Order, storeId: string): SupabaseOrder => {
    return {
        id: order.id,
        store_id: storeId,
        // customer_name column does not exist in DB
        total_amount: order.amount,
        status: mapStatusToSupabase(order.status),
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
