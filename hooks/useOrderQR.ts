import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Úsalo así en tu componente visual: const { pickupCode, status } = useOrderQR(orderId);
export const useOrderQR = (orderId: string) => {
    const [pickupCode, setPickupCode] = useState<string>('');
    const [status, setStatus] = useState<'pending' | 'delivered' | 'burned'>('pending');

    useEffect(() => {
        if (!orderId) return;

        // 1. Carga inicial
        const fetchOrder = async () => {
            const { data } = await supabase
                .from('orders')
                .select('pickup_code, delivery_status')
                .eq('id', orderId)
                .single();

            if (data) {
                setPickupCode((data as any).pickup_code);
                setStatus((data as any).delivery_status);
            }
        };

        fetchOrder();

        // 2. Realtime: Si el staff lo escanea, se actualiza solo en la pantalla del cliente
        const channel = supabase
            .channel(`order_qr_${orderId}`)
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
                (payload) => {
                    setStatus((payload.new as any).delivery_status);
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [orderId]);

    return { pickupCode, status };
};

export default useOrderQR;
