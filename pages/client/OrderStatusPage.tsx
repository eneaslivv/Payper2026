import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { OrderPickupTicket } from "../../components/client/OrderPickupTicket";
import { useToast } from "../../components/ToastSystem";

export default function OrderStatusPage() {
    const { orderId, slug } = useParams();
    const { addToast } = useToast();
    const [order, setOrder] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);

    const fetchOrder = async () => {
        if (!orderId) return;
        console.log("Fetching order:", orderId);
        const { data, error } = await supabase
            .from('orders')
            .select('*, order_items(*, product:inventory_items(*))')
            .eq('id', orderId)
            .single();

        if (error) {
            console.error("Error fetching order:", error);
            setError(error.message || JSON.stringify(error) || "No pudimos encontrar tu pedido. Verifica el enlace o intenta nuevamente.");
        } else {
            setOrder(data);

            // ⚡ ACTIVE VERIFICATION: If order is pending, ask server to double check MP status
            if (data.status === 'pending' || data.payment_status === 'pending') {
                verifyPaymentStatus(orderId);
            }
        }
    };

    const verifyPaymentStatus = async (oid: string) => {
        if (isVerifying) return;
        setIsVerifying(true);
        console.log("⚡ Triggering Active Payment Verification...");

        try {
            const { data, error } = await supabase.functions.invoke('verify-payment-status', {
                body: { order_id: oid }
            });

            if (error) throw error;

            console.log("Verification Result:", data);
            if (data?.success && data?.status === 'approved') {
                addToast("¡Pago confirmado! Tu pedido está en marcha.", "success");
                // Re-fetch immediately
                const { data: refreshedOrder } = await supabase
                    .from('orders')
                    .select('*, order_items(*, product:products(*))')
                    .eq('id', oid)
                    .single();
                if (refreshedOrder) setOrder(refreshedOrder);
            }
        } catch (e) {
            console.error("Verification failed:", e);
            // Don't show error to user, just log it. Maybe it's just really pending.
        } finally {
            setIsVerifying(false);
        }
    };

    useEffect(() => {
        // 1. Carga inicial
        fetchOrder();

        // 2. Suscripción REALTIME
        console.log("Subscribing to order changes:", orderId);
        const channelName = `order-tracking-${orderId || 'general'}`;
        const subscription = supabase
            .channel(channelName)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'orders',
                filter: `id=eq.${orderId}`
            }, (payload) => {
                const newStatus = (payload.new as any)?.status;
                const newPaymentStatus = (payload.new as any)?.payment_status;
                console.log("Order updated! Status:", newStatus, "Payment:", newPaymentStatus);

                // Notificación visual y sonora 🔔
                if (newStatus) {
                    const s = newStatus.toLowerCase();
                    let type: any = "status";
                    let message = "Tu café está avanzando.";

                    if (s === 'listo' || s === 'ready') {
                        type = "success";
                        message = "¡Ya puedes pasarlo a buscar! ☕✨";
                    } else if (s === 'en preparación' || s === 'preparing' || s === 'preparando') {
                        message = "El barista ya está manos a la obra. 👨‍🍳";
                    } else if (newPaymentStatus === 'approved' && order?.payment_status !== 'approved') {
                        type = "success";
                        message = "Pago confirmado. ¡Empezamos!";
                    }

                    // Display name for the toast
                    const displayStatus = s === 'preparing' || s === 'preparando' ? 'En Preparación' :
                        s === 'ready' ? 'Listo' :
                            s === 'delivered' ? 'Entregado' : newStatus;

                    if (order?.status !== newStatus) {
                        addToast(`Estado: ${displayStatus}`, type, message);
                    }
                }

                // Re-fetch completo para no perder relaciones (items, productos)
                fetchOrder();
            })
            .subscribe((status) => {
                console.log("Realtime status for order:", status);
            });

        return () => { supabase.removeChannel(subscription); };
    }, [orderId]);

    // UI: Clean Error State
    if (error) return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center font-display">
            <div className="size-16 rounded-full bg-white/5 flex items-center justify-center mb-6 animate-pulse">
                <span className="material-symbols-outlined text-3xl text-white/40">search_off</span>
            </div>
            <h1 className="text-white text-lg font-black uppercase tracking-widest mb-2">Pedido No Encontrado</h1>
            <p className="text-zinc-500 font-medium text-xs max-w-xs leading-relaxed mb-8">
                {error}
                <br />
                <span className="text-[9px] opacity-50 font-mono mt-2 block">{JSON.stringify(error)}</span>
            </p>
            <div className="flex gap-4">
                <button
                    onClick={() => window.location.reload()}
                    className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-full transition-all"
                >
                    Reintentar
                </button>
                <button
                    onClick={() => window.history.back()}
                    className="px-6 py-3 bg-neon text-black hover:scale-105 text-[10px] font-black uppercase tracking-[0.2em] rounded-full transition-all shadow-[0_0_20px_rgba(54,226,123,0.3)]"
                >
                    Volver
                </button>
            </div>
        </div>
    );

    // UI: Loading State
    if (!order) return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center font-display">
            <div className="relative mb-8">
                <div className="size-16 rounded-full border-2 border-white/10 border-t-neon animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xl">☕</span>
                </div>
            </div>
            <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.3em] animate-pulse">Confirmando Pedido...</p>
        </div>
    );

    // Mappers (More robust to handle English/Spanish from DB)
    const mapToDeliveryStatus = (status: string) => {
        const s = (status || '').toLowerCase();
        if (s === 'received' || s === 'pendiente' || !s) return 'received';
        if (s === 'preparing' || s === 'en preparación' || s === 'preparando') return 'preparing';
        if (s === 'ready' || s === 'listo') return 'ready';
        if (s === 'delivered' || s === 'entregado' || s === 'served' || s === 'finalizado') return 'delivered';
        if (s === 'burned' || s === 'cancelado' || s === 'cancelled') return 'burned';
        return 'received'; // Base status is always received if logic fails
    };

    // Normalize Items (Relation > JSONB Fallback)
    const normalizeItems = () => {
        if (order.order_items && order.order_items.length > 0) {
            return order.order_items.map((item: any) => ({
                quantity: item.quantity,
                name: item.product?.name || 'Producto',
                product: item.product // Keep full product just in case
            }));
        }
        if (order.items && Array.isArray(order.items)) {
            return order.items.map((item: any) => ({
                quantity: item.quantity,
                name: item.name || 'Producto',
                product: { name: item.name }
            }));
        }
        return [];
    };

    const mappedOrder = {
        ...order,
        delivery_status: mapToDeliveryStatus(order.status),
        order_items: normalizeItems()
    };

    return (
        <div className="min-h-screen bg-black p-4 flex flex-col items-center justify-center">
            {/* Show a subtle "Verifying" indicator if manual check is running */}
            {isVerifying && (
                <div className="fixed top-0 left-0 right-0 h-1 bg-white/10 overflow-hidden z-[60]">
                    <div className="h-full bg-neon w-1/3 animate-[loading_1s_ease-in-out_infinite]"></div>
                </div>
            )}
            <OrderPickupTicket order={mappedOrder} storeSlug={slug} />

            {/* Manual Verify Button (Only if pending for > 5s? Or always visible small?) */}
            {/* Only show if pending and not verifying */}
            {(order.status === 'pending' || order.payment_status === 'pending') && !isVerifying && (
                <button
                    onClick={() => verifyPaymentStatus(order.id)}
                    className="mt-8 text-white/30 text-[10px] font-bold uppercase tracking-widest hover:text-white transition-colors flex items-center gap-2"
                >
                    <span className="material-symbols-outlined text-sm">sync</span>
                    Actualizar Estado
                </button>
            )}
        </div>
    );
}
