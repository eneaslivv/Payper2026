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

    const fetchOrder = async () => {
        if (!orderId) return;
        console.log("Fetching order:", orderId);
        const { data, error } = await supabase
            .from('orders')
            .select('*, order_items(*, product:products(*))')
            .eq('id', orderId)
            .single();

        if (error) {
            console.error("Error fetching order:", error);
            setError("No pudimos encontrar tu pedido. Verifica el enlace o intenta nuevamente.");
        } else {
            setOrder(data);
        }
    };

    useEffect(() => {
        // 1. Carga inicial
        fetchOrder();

        // 2. Suscripción REALTIME
        console.log("Subscribing to order changes:", orderId);
        const subscription = supabase
            .channel(`order-tracking-${orderId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'orders',
                filter: `id=eq.${orderId}`
            }, (payload) => {
                const newStatus = (payload.new as any)?.status;
                console.log("Order updated! New status:", newStatus);

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
                    }

                    // Display name for the toast
                    const displayStatus = s === 'preparing' || s === 'preparando' ? 'En Preparación' :
                        s === 'ready' ? 'Listo' :
                            s === 'delivered' ? 'Entregado' : newStatus;

                    addToast(`Estado: ${displayStatus}`, type, message);
                }

                // Re-fetch completo para no perder relaciones (items, productos)
                fetchOrder();
            })
            .subscribe((status) => {
                console.log("Realtime status for order:", status);
            });

        return () => { supabase.removeChannel(subscription); };
    }, [orderId]);

    if (error) return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
            <span className="material-symbols-outlined text-4xl text-gray-400 mb-2">sentiment_dissatisfied</span>
            <p className="text-gray-600 font-medium mb-4">{error}</p>
            <button
                onClick={() => window.location.reload()}
                className="px-6 py-2 bg-black text-white text-xs font-bold uppercase rounded hover:bg-zinc-800 transition"
            >
                Reintentar
            </button>
        </div>
    );

    if (!order) return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="text-center">
                <div className="text-4xl mb-4 animate-bounce">☕</div>
                <p className="text-gray-500 font-medium">Cargando tu café...</p>
            </div>
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
        <div className="min-h-screen bg-gray-50 p-4 flex flex-col items-center justify-center">
            <OrderPickupTicket order={mappedOrder} storeSlug={slug} />
        </div>
    );
}
