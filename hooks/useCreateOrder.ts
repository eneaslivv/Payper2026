import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getQRContext } from '../lib/qrContext';
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
    sourceLocationId?: string;  // NEW: Inventory storage location (for bar-specific stock)
    nodeId?: string | null;
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
        sourceLocationId,  // NEW
        nodeId,
    }: CreateOrderOptions): Promise<Order | null> => {
        if (!storeId || items.length === 0) {
            setError('Datos insuficientes para crear la orden');
            return null;
        }

        setIsCreating(true);
        setError(null);

        try {
            const qrContext = getQRContext();
            let resolvedNodeId = nodeId
                ?? (qrContext?.store_id === storeId ? qrContext?.node_id : null);

            if (!resolvedNodeId && storeId) {
                const { data: defaultNodeId, error: defaultNodeError } = await supabase
                    .rpc('get_default_node_for_store' as any, { p_store_id: storeId });

                if (!defaultNodeError && defaultNodeId) {
                    resolvedNodeId = defaultNodeId as string;
                } else if (defaultNodeError) {
                    console.warn('[useCreateOrder] Failed to resolve default node:', defaultNodeError);
                }
            }

            // USAR RPC para validar precios desde DB (no confiar en frontend)
            const rpcItems = items.map(item => ({
                product_id: item.productId,
                quantity: item.quantity,
                notes: item.notes || null,
            }));

            const { data, error: rpcError } = await supabase.rpc('create_order' as any, {
                p_store_id: storeId,
                p_items: rpcItems,
                p_channel: channel,
                p_table_number: tableNumber || null,
                p_location_identifier: locationIdentifier || null,
                p_delivery_mode: deliveryMode,
                p_source_location_id: sourceLocationId || null,  // NEW
                p_node_id: resolvedNodeId || null,
            });

            if (rpcError) throw rpcError;

            const result = data as { success: boolean; order_id: string; error?: string } | null;

            if (!result?.success) {
                throw new Error(result?.error || 'Error al crear orden');
            }

            const orderId = result.order_id;

            // Fetch full order data
            const { data: orderData, error: fetchError } = await supabase
                .from('orders')
                .select('*')
                .eq('id', orderId)
                .single();

            if (fetchError) throw fetchError;

            return orderData as unknown as Order;
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
