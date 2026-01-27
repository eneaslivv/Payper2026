import { useEffect, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { OrderPickupTicket } from "../../components/client/OrderPickupTicket";
import { useToast } from "../../components/ToastSystem";
import { useAuth } from "../../contexts/AuthContext";
import { useClient } from "../../contexts/ClientContext";

export default function OrderStatusPage() {
    const { orderId, slug } = useParams();
    const location = useLocation();
    const { addToast } = useToast();
    const { isLoading: authLoading } = useAuth();
    // Use Client Context for theme
    const { store, disconnectTable, tableLabel } = useClient();

    const [order, setOrder] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);

    // Determine theme colors
    const accentColor = store?.menu_theme?.accentColor || '#36e27b';
    const backgroundColor = store?.menu_theme?.backgroundColor || '#000000';
    const textColor = store?.menu_theme?.textColor || '#FFFFFF';

    // Extract MP params from URL (payment_id, status, external_reference)
    const getMPParams = () => {
        const searchParams = new URLSearchParams(location.search);
        // Also check hash for SPA routing
        const hashSearch = window.location.hash.split('?')[1];
        const hashParams = hashSearch ? new URLSearchParams(hashSearch) : null;

        return {
            payment_id: searchParams.get('payment_id') || hashParams?.get('payment_id'),
            status: searchParams.get('status') || hashParams?.get('status'),
            external_reference: searchParams.get('external_reference') || hashParams?.get('external_reference')
        };
    };

    const fetchOrder = async () => {
        if (!orderId) return;

        console.log("[OrderStatusPage] Fetching order securely:", orderId);

        // USE SECURE RPC (Bypasses RLS if ID matches)
        // Cast to any to bypass missing type definition for new RPC
        const { data: rpcData, error } = await (supabase.rpc as any)('get_public_order_status', { p_order_id: orderId });

        if (error || !rpcData?.success) {
            console.error("Error fetching order:", error || rpcData?.error);
            setError(rpcData?.error || error?.message || "No pudimos encontrar tu pedido.");
        } else {
            // Normalize RPC data structure to match expected state
            const orderData = rpcData.data;
            setOrder(orderData);

            // ⚡ ACTIVE VERIFICATION: If order is pending, ask server to double check MP status
            if (orderData.status === 'pending' || orderData.payment_status === 'pending') {
                const mpParams = getMPParams();
                verifyPaymentStatus(orderId, mpParams.payment_id || undefined);
            }
        }
    };

    const verifyPaymentStatus = async (oid: string, paymentId?: string) => {
        if (isVerifying) return;
        setIsVerifying(true);
        console.log("⚡ [OrderStatusPage] Triggering Active Payment Verification for:", oid, "payment_id:", paymentId);

        try {
            let data;
            let res;

            // Try Vercel API first (works in production)
            const vercelApiUrl = '/api/verify-payment';
            console.log("[OrderStatusPage] Attempting Vercel API:", vercelApiUrl);

            // Include payment_id if available (from MP redirect)
            const requestBody = {
                order_id: oid,
                ...(paymentId && { payment_id: paymentId })
            };
            console.log("[OrderStatusPage] Request body:", JSON.stringify(requestBody));

            res = await fetch(vercelApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            // If Vercel API fails (404 in local dev), try Supabase Edge Function
            if (!res.ok && res.status === 404) {
                console.log("[OrderStatusPage] Vercel API not available, trying Supabase Edge Function...");
                const edgeFunctionRes = await supabase.functions.invoke('verify-payment-status', {
                    body: requestBody
                });

                if (edgeFunctionRes.error) {
                    throw new Error(edgeFunctionRes.error.message || 'Edge function failed');
                }
                data = edgeFunctionRes.data;
            } else {
                data = await res.json();
                console.log("[OrderStatusPage] API Response:", res.status, JSON.stringify(data));
                if (!res.ok) throw new Error(data.error || 'Verification failed');
            }

            console.log("[OrderStatusPage] Verification Result:", data);

            if (data?.success && data?.status === 'approved') {
                addToast("¡Pago confirmado! Tu pedido está en marcha.", "success");
                // Re-fetch immediately
                fetchOrder();
            } else if (data?.status === 'pending') {
                console.log("[OrderStatusPage] Payment still pending in MP");
                addToast("Tu pago se está procesando...", "info");
            }
        } catch (e) {
            console.error("[OrderStatusPage] Verification failed:", e);
            // Don't show error to user, just log it. Maybe it's just really pending.
        } finally {
            setIsVerifying(false);
        }
    };

    useEffect(() => {
        if (!orderId) return;

        // 1. Carga inicial
        fetchOrder();

        // 2. Suscripción REALTIME (Works only if Authenticated + RLS allowed)
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
                console.log("Order updated (Realtime)! Status:", newStatus, "Payment:", newPaymentStatus);

                // Notificación visual y sonora 🔔
                if (newStatus) {
                    const s = newStatus.toLowerCase();
                    let type: any = "status";
                    let message = "Tu café está avanzando.";

                    if (s === 'cancelled' || s === 'cancelado' || s === 'burned') {
                        type = "error";
                        message = "Tu pedido ha sido cancelado.";
                    } else if (s === 'listo' || s === 'ready') {
                        type = "success";
                        message = "¡Ya puedes pasarlo a buscar! ☕✨";
                    } else if (s === 'en preparación' || s === 'preparing' || s === 'preparando') {
                        message = "El barista ya está manos a la obra. 👨‍🍳";
                    } else if (newPaymentStatus === 'approved') {
                        type = "success";
                        message = "Pago confirmado. ¡Empezamos!";
                    }

                    const displayStatus = s === 'preparing' || s === 'preparando' ? 'En Preparación' :
                        s === 'ready' ? 'Listo' :
                            s === 'delivered' ? 'Entregado' :
                                s === 'cancelled' || s === 'cancelado' || s === 'burned' ? 'Cancelado' : newStatus;

                    addToast(`Estado: ${displayStatus}`, type, message);
                }

                // Re-fetch completo
                fetchOrder();
            })
            .subscribe((status) => {
                console.log("Realtime status for order:", status);
            });

        // 3. Polling Fallback (Critical for Guests blocked by RLS)
        // Check status every 4 seconds to ensure updates even if Realtime fails
        const pollInterval = setInterval(() => {
            fetchOrder();
        }, 4000);

        return () => {
            clearInterval(pollInterval);
            supabase.removeChannel(subscription);
        };
    }, [orderId]);

    // UI: Clean Error State
    if (error) return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center font-display transition-colors duration-500" style={{ backgroundColor, color: textColor }}>
            <div className="size-16 rounded-full flex items-center justify-center mb-6 animate-pulse" style={{ backgroundColor: `${textColor}0D` }}>
                <span className="material-symbols-outlined text-3xl" style={{ color: `${textColor}66` }}>search_off</span>
            </div>
            <h1 className="text-lg font-black uppercase tracking-widest mb-2" style={{ color: textColor }}>Pedido No Encontrado</h1>
            <p className="font-medium text-xs max-w-xs leading-relaxed mb-8" style={{ color: `${textColor}80` }}>
                {error}
                <br />
                <span className="text-[9px] opacity-50 font-mono mt-2 block">{JSON.stringify(error)}</span>
            </p>
            <div className="flex gap-4">
                <button
                    onClick={() => window.location.reload()}
                    className="px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] rounded-full transition-all"
                    style={{ backgroundColor: `${textColor}1A`, color: textColor }}
                >
                    Reintentar
                </button>
                <button
                    onClick={() => window.history.back()}
                    className="px-6 py-3 hover:scale-105 text-[10px] font-black uppercase tracking-[0.2em] rounded-full transition-all"
                    style={{ backgroundColor: accentColor, color: '#000', boxShadow: `0 0 20px ${accentColor}4D` }}
                >
                    Volver
                </button>
            </div>
        </div>
    );

    // UI: Loading State
    if (!order) return (
        <div className="min-h-screen flex flex-col items-center justify-center font-display transition-colors duration-500" style={{ backgroundColor, color: textColor }}>
            <div className="relative mb-8">
                <div className="size-16 rounded-full border-2 animate-spin" style={{ borderColor: `${textColor}1A`, borderTopColor: accentColor }}></div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xl">☕</span>
                </div>
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] animate-pulse" style={{ color: `${textColor}66` }}>Confirmando Pedido...</p>
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
            return order.order_items.map((item: any) => {
                let productName = item.product?.name || 'Producto';
                const isDeleted = productName.startsWith('[ELIMINADO]') || item.product?.is_active === false;
                if (isDeleted) {
                    productName = productName.replace('[ELIMINADO] ', '') + ' (eliminado)';
                }
                return {
                    quantity: item.quantity,
                    name: productName,
                    product: item.product,
                    isDeleted
                };
            });
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
        // ALWAYS map from status for intermediate states (received, preparing, ready)
        // But if delivery_status is 'delivered', use that to show final state
        delivery_status: order.delivery_status === 'delivered'
            ? 'delivered'
            : mapToDeliveryStatus(order.status),
        order_items: normalizeItems()
    };

    return (
        <div className="min-h-screen p-4 flex flex-col items-center justify-center transition-colors duration-500" style={{ backgroundColor }}>
            {/* Show a subtle "Verifying" indicator if manual check is running */}
            {isVerifying && (
                <div className="fixed top-0 left-0 right-0 h-1 overflow-hidden z-[60]" style={{ backgroundColor: `${textColor}1A` }}>
                    <div className="h-full w-1/3 animate-[loading_1s_ease-in-out_infinite]" style={{ backgroundColor: accentColor }}></div>
                </div>
            )}
            <OrderPickupTicket
                order={mappedOrder}
                storeSlug={slug}
                theme={store?.menu_theme}
                allowDisconnect={!!tableLabel}
                tableLabel={tableLabel}
                onDisconnect={disconnectTable}
            />

            {/* Manual Verify Button (Only if pending for > 5s? Or always visible small?) */}
            {/* Only show if pending and not verifying */}
            {(order.status === 'pending' || order.payment_status === 'pending') && !isVerifying && (
                <button
                    onClick={() => verifyPaymentStatus(order.id)}
                    className="mt-8 text-[10px] font-bold uppercase tracking-widest hover:opacity-100 opacity-30 transition-all flex items-center gap-2"
                    style={{ color: textColor }}
                >
                    <span className="material-symbols-outlined text-sm">sync</span>
                    Actualizar Estado
                </button>
            )}
        </div>
    );
}
