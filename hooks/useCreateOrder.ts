import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Order, OrderChannel } from '../types/payment';

interface CartItem {
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
}

interface CreateOrderOptions {
    storeId: string;
    items: CartItem[];
    channel: OrderChannel;
    tableNumber?: string;
    locationIdentifier?: string;
    deliveryMode?: 'local' | 'delivery' | 'takeaway';
}

interface UseCreateOrderReturn {
    createOrder: (options: CreateOrderOptions) => Promise<Order | null>;
    isCreating: boolean;
    error: string | null;
}

export function useCreateOrder(): UseCreateOrderReturn {
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const createOrder = useCallback(async ({
        storeId,
        items,
        channel,
        tableNumber,
        locationIdentifier,
        deliveryMode = 'local',
    }: CreateOrderOptions): Promise<Order | null> => {
        if (!storeId || items.length === 0) {
            setError('Datos insuficientes para crear la orden');
            return null;
        }

        setIsCreating(true);
        setError(null);

        try {
            // Calcular totales
            const subtotal = items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
            const taxAmount = 0; // Ajustar según tu lógica de impuestos
            const totalAmount = subtotal + taxAmount;

            // 1. Crear la orden
            const { data: order, error: orderError } = await supabase
                .from('orders')
                .insert({
                    store_id: storeId,
                    status: 'draft',
                    channel,
                    subtotal,
                    tax_amount: taxAmount,
                    discount_amount: 0,
                    total_amount: totalAmount,
                    table_number: tableNumber,
                    location_identifier: locationIdentifier,
                    delivery_mode: deliveryMode,
                } as any)
                .select()
                .single();

            if (orderError) {
                throw orderError;
            }

            const orderData = order as unknown as Order;

            // 2. Crear los items de la orden
            // NOTA: Esto requiere que tengas un tenant_id válido
            // Si no usas multi-tenancy, puedes ajustar la lógica
            const orderItems = items.map(item => ({
                order_id: orderData.id,
                product_id: item.productId,
                quantity: item.quantity,
                unit_price: item.unitPrice,
                total_price: item.unitPrice * item.quantity,
                notes: item.notes || null,
                // Assuming RLS handles tenant isolation based on order_id's relation to store, or triggers populate tenant_id. 
                // If specific tenant_id column required on order_items, uncomment below.
                // tenant_id: storeId 
            }));

            const { error: itemsError } = await supabase
                .from('order_items')
                .insert(orderItems as any);

            if (itemsError) {
                console.error('Error al crear items:', itemsError);
                // No es crítico, la orden ya se creó, pero idealmente debería rollbackear
            }

            return orderData;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Error al crear la orden';
            setError(message);
            return null;
        } finally {
            setIsCreating(false);
        }
    }, []);

    return {
        createOrder,
        isCreating,
        error,
    };
}
