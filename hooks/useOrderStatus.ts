import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Order, OrderStatus } from '../types/payment';

interface UseOrderStatusOptions {
    orderId: string;
    onStatusChange?: (newStatus: OrderStatus, order: Order) => void;
}

interface UseOrderStatusReturn {
    order: Order | null;
    status: OrderStatus | null;
    isPaid: boolean;
    isLoading: boolean;
    error: string | null;
    refetch: () => void;
}

export function useOrderStatus({
    orderId,
    onStatusChange
}: UseOrderStatusOptions): UseOrderStatusReturn {
    const [order, setOrder] = useState<Order | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Obtener datos iniciales de la orden
    const fetchOrder = useCallback(async () => {
        if (!orderId) return;

        try {
            const { data, error: fetchError } = await supabase
                .from('orders')
                .select(`
          id,
          store_id,
          status,
          channel,
          total_amount,
          subtotal,
          tax_amount,
          discount_amount,
          payment_id,
          paid_at,
          table_number,
          location_identifier,
          delivery_mode,
          created_at,
          updated_at
        `)
                .eq('id', orderId)
                .maybeSingle();

            if (fetchError) {
                throw fetchError;
            }

            if (data) {
                setOrder(data as Order);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al cargar la orden');
        } finally {
            setIsLoading(false);
        }
    }, [orderId]);

    useEffect(() => {
        fetchOrder();
    }, [fetchOrder]);

    // Suscribirse a actualizaciones en tiempo real
    useEffect(() => {
        if (!orderId) return;

        console.log('[useOrderStatus] Suscribiendo a orden:', orderId);

        const channel = supabase
            .channel(`order-status-${orderId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'orders',
                    filter: `id=eq.${orderId}`,
                },
                (payload) => {
                    console.log('[useOrderStatus] Actualización recibida:', payload);
                    const newOrder = payload.new as Order;

                    setOrder((prevOrder) => {
                        // Disparar callback si el estado cambió
                        if (prevOrder && prevOrder.status !== newOrder.status) {
                            console.log('[useOrderStatus] Estado cambió:', prevOrder.status, '->', newOrder.status);
                            onStatusChange?.(newOrder.status, newOrder);
                        }
                        return newOrder;
                    });
                }
            )
            .subscribe((status) => {
                console.log('[useOrderStatus] Estado de suscripción:', status);
            });

        return () => {
            console.log('[useOrderStatus] Desuscribiendo del canal');
            supabase.removeChannel(channel);
        };
    }, [orderId, onStatusChange]);

    const refetch = useCallback(() => {
        setIsLoading(true);
        fetchOrder();
    }, [fetchOrder]);

    // Estados que indican que el pedido está pagado
    const paidStatuses: OrderStatus[] = ['paid', 'preparing', 'ready', 'served'];

    return {
        order,
        status: order?.status ?? null,
        isPaid: order ? paidStatuses.includes(order.status) : false,
        isLoading,
        error,
        refetch,
    };
}
