
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
        case 'preparing': return 'En Preparación';
        case 'ready': return 'Listo';
        case 'served': return 'Entregado';
        case 'cancelled': return 'Cancelado';
        default: return 'Pendiente';
    }
};

export const mapOrderToSupabase = (order: Order, storeId: string): SupabaseOrder => {
    return {
        id: order.id,
        store_id: storeId,
        customer_name: order.customer || 'Cliente General',
        total_amount: order.amount,
        status: mapStatusToSupabase(order.status),
    };
};

export const mapOrderItemToSupabase = (item: OrderItem, orderId: string): SupabaseOrderItem => {
    return {
        order_id: orderId,
        product_id: item.productId || null,
        name: item.name,
        quantity: item.quantity,
        price_unit: item.price_unit,
        variant_name: null,
        addons: [],
        note: null,
    };
};
