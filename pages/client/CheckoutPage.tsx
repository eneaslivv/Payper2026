import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLayoutEffect } from 'react';
import { useClient } from '../../contexts/ClientContext';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/ToastSystem';
import { Reward } from '../../types';

type PaymentMethodType = 'wallet' | 'mercadopago' | 'table_credit';

const CheckoutPage: React.FC = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { cart, isRedeemingPoints, clearCart, setHasActiveOrder, store, user, qrContext, tableLabel: qrTableLabel, orderChannel, reservationContext, refreshReservationCredit } = useClient();
  // Use QR context if available, otherwise it's generic
  const initialTable = qrTableLabel || '';

  // Theme support
  const theme = store?.menu_theme || {};
  const accentColor = theme.accentColor || '#36e27b';
  const backgroundColor = theme.backgroundColor || '#000000';
  const textColor = theme.textColor || '#FFFFFF';
  const surfaceColor = theme.surfaceColor || '#141714';

  const walletBalance = user?.balance || 0;
  const tableCredit = reservationContext?.remaining_credit || 0;
  const hasTableCredit = tableCredit > 0;

  const [deliveryMode, setDeliveryMode] = useState<'local' | 'takeout'>(initialTable ? 'local' : 'takeout');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>(hasTableCredit ? 'table_credit' : 'wallet');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const { addToast } = useToast();

  // Gestión de ubicación dinámica
  const [currentTable, setCurrentTable] = useState(initialTable);
  const [currentBar, setCurrentBar] = useState('');
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [tempValue, setTempValue] = useState('');

  // Resolved station & location from venue_node (for dispatch board + stock deduction)
  const [resolvedStation, setResolvedStation] = useState<string | null>(null);
  const [resolvedLocationId, setResolvedLocationId] = useState<string | null>(null);

  // Loyalty Rewards State
  const [availableRewards, setAvailableRewards] = useState<Reward[]>([]);
  const [selectedRewardId, setSelectedRewardId] = useState<string | null>(null);
  const [rewardDiscount, setRewardDiscount] = useState(0);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    const raf = window.requestAnimationFrame(() => window.scrollTo(0, 0));
    const timeout = window.setTimeout(() => window.scrollTo(0, 0), 50);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
    };
  }, []);

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!user) {
      navigate(`/m/${slug}/auth`);
    }
  }, [user, navigate, slug]);

  // Resolve dispatch_station + location from venue_node (so order appears in dispatch board & stock deducts from correct location)
  useEffect(() => {
    const resolveNodeStation = async () => {
      const nodeId = qrContext?.store_id === store?.id ? qrContext?.node_id : null;
      if (!nodeId) return;

      // 1. Get dispatch_station and location_id from the venue_node
      const { data: nodeData } = await (supabase.from('venue_nodes' as any) as any)
        .select('dispatch_station, location_id')
        .eq('id', nodeId)
        .single();

      if (nodeData?.dispatch_station) {
        setResolvedStation(nodeData.dispatch_station);
        console.log(`[Checkout] Resolved station from node: ${nodeData.dispatch_station}`);
      }
      if (nodeData?.location_id) {
        setResolvedLocationId(nodeData.location_id);
        console.log(`[Checkout] Resolved location from node: ${nodeData.location_id}`);
      }

      // 2. Fallback: if node has station but no location, resolve from dispatch_stations table
      if (nodeData?.dispatch_station && !nodeData?.location_id) {
        const { data: stationData } = await (supabase.from('dispatch_stations' as any) as any)
          .select('storage_location_id')
          .eq('store_id', store!.id)
          .eq('name', nodeData.dispatch_station)
          .single();
        if (stationData?.storage_location_id) {
          setResolvedLocationId(stationData.storage_location_id);
          console.log(`[Checkout] Resolved location from dispatch_station: ${stationData.storage_location_id}`);
        }
      }
    };
    resolveNodeStation();
  }, [qrContext, store?.id]);

  // Fetch available rewards
  useEffect(() => {
    const fetchRewards = async () => {
      if (!store?.id || !user?.points) return;
      const { data } = await (supabase.from('loyalty_rewards' as any) as any)
        .select('*')
        .eq('store_id', store.id)
        .eq('is_active', true)
        .lte('points', user.points);
      setAvailableRewards(data || []);
    };
    fetchRewards();
  }, [store?.id, user?.points]);

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  // Discount now comes from selected reward, not hardcoded
  const discount = rewardDiscount;
  const tax = 0; // Removed 8% tax as per user request
  const total = subtotal + tax - discount;

  // Calculate after total is defined
  const hasEnoughBalance = walletBalance >= total;

  // Don't render if not logged in
  if (!user) {
    return null;
  }

  const isUUID = (v: any): boolean => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

  const handlePlaceOrder = async () => {
    if (!store?.id) return;
    setIsProcessingPayment(true);

    try {
      // 1. Construct Order Payload
      // Include node_id from QR context to link order to scanned location
      // Include session_id for full session tracking
      const rawSessionId = localStorage.getItem('client_session_id') || null;
      const sessionId = isUUID(rawSessionId) ? rawSessionId : null;

      // Security: Only use QR node_id if context belongs to THIS store
      const safeQrContext = qrContext?.store_id === store.id ? qrContext : null;
      if (qrContext && !safeQrContext) {
        console.warn('[Checkout Security] QR context store mismatch, ignoring node_id');
      }

      const orderPayload: any = {
        store_id: store.id,
        client_id: user?.id || null,
        table_number: deliveryMode === 'local' ? currentTable : currentBar,
        delivery_mode: deliveryMode,
        channel: orderChannel || 'qr',
        payment_method: paymentMethod,
        payment_provider: paymentMethod === 'mercadopago' ? 'mercadopago' : 'wallet',
        items: cart.map(item => ({
          ...item,
          variant_id: item.variant_id,
          addon_ids: item.addon_ids
        })),
        total_amount: total,
        status: 'pending',
        delivery_status: 'pending',
        payment_status: 'pending',
        is_paid: false,
        node_id: safeQrContext?.node_id || null,
        location_identifier: safeQrContext ? qrTableLabel : null,
        session_id: sessionId
      };

      // 1.5 TABLE CREDIT FLOW — Reservation credit payment
      if (paymentMethod === 'table_credit') {
        if (!reservationContext) {
          addToast('No hay crédito de mesa disponible', 'error');
          setIsProcessingPayment(false);
          return;
        }

        const creditToUse = Math.min(tableCredit, total);
        const orderId = crypto.randomUUID();

        if (selectedRewardId) {
          const { data: redeemResult, error: redeemError } = await (supabase.rpc as any)('redeem_reward', {
            p_client_id: user?.id,
            p_reward_id: selectedRewardId,
            p_order_id: orderId
          });
          if (redeemError || !redeemResult?.success) {
            addToast(redeemResult?.error || 'Error al canjear recompensa', 'error');
            setIsProcessingPayment(false);
            return;
          }
        }

        const itemsPayload = cart.map(item => ({
          product_id: item.id,
          variant_id: isUUID(item.variant_id) ? item.variant_id : null,
          quantity: item.quantity,
          unit_price: item.price,
          notes: (item as any).notes || null,
          addon_ids: item.addon_ids?.filter(isUUID) || [],
          addon_prices: item.addons?.filter((a: any) => item.addon_ids?.includes(a.id)).map((a: any) => ({ id: a.id, price: a.price })) || [],
          modifier_ids: (item as any).modifier_ids || []
        }));

        const { data: rpcResult, error: rpcError } = await (supabase.rpc as any)('create_order_atomic', {
          p_order: {
            id: orderId,
            store_id: store.id,
            client_id: user?.id || null,
            total_amount: total,
            status: 'paid',
            payment_method: 'table_credit',
            payment_provider: 'table_credit',
            payment_status: 'approved',
            is_paid: true,
            table_number: reservationContext.table_label || (deliveryMode === 'local' ? currentTable : currentBar),
            node_id: safeQrContext?.node_id || reservationContext.node_id || null,
            channel: orderChannel || 'table',
            delivery_mode: 'local',
            delivery_status: 'pending',
            session_id: sessionId,
            dispatch_station: resolvedStation || null,
            source_location_id: resolvedLocationId || null
          },
          p_items: itemsPayload
        });

        if (rpcError) {
          console.error('[CheckoutPage] create_order_atomic error:', rpcError);
          addToast('Error al procesar pedido', 'error');
          setIsProcessingPayment(false);
          return;
        }

        const result = rpcResult as any;
        if (!result?.success) {
          console.error('[TableCredit] create_order_atomic returned failure:', JSON.stringify(result));
          addToast(result?.error || result?.message || 'Error al crear pedido', 'error');
          setIsProcessingPayment(false);
          return;
        }

        // Consume reservation credit
        const { error: creditError } = await (supabase.rpc as any)('consume_reservation_credit', {
          p_reservation_id: reservationContext.reservation_id,
          p_order_id: orderId,
          p_amount: creditToUse
        });

        if (creditError) {
          console.error('[CheckoutPage] consume_reservation_credit error:', creditError);
          addToast('Pedido creado. Error al descontar crédito.', 'info');
        }

        await refreshReservationCredit();
        setHasActiveOrder(true);
        clearCart();
        navigate(`/m/${slug}/order/${orderId}`, { replace: true });
        return;
      }

      // 2. WALLET FLOW — P0 FIX: Atomic order + wallet deduction in one transaction
      if (paymentMethod === 'wallet') {
        if (!hasEnoughBalance) {
          addToast('Saldo insuficiente en tu wallet', 'error');
          setIsProcessingPayment(false);
          return;
        }

        const orderId = crypto.randomUUID();

        // 2.1 Process reward redemption BEFORE atomic order (needs separate tx for rollback)
        if (selectedRewardId) {
          const { data: redeemResult, error: redeemError } = await (supabase.rpc as any)('redeem_reward', {
            p_client_id: user?.id,
            p_reward_id: selectedRewardId,
            p_order_id: orderId
          });

          if (redeemError || !redeemResult?.success) {
            addToast(redeemResult?.error || 'Error al canjear recompensa', 'error');
            setIsProcessingPayment(false);
            return;
          }
        }

        // 2.2 Atomic order creation + wallet deduction via RPC
        const itemsPayload = cart.map(item => ({
          product_id: item.id,
          variant_id: isUUID(item.variant_id) ? item.variant_id : null,
          quantity: item.quantity,
          unit_price: item.price,
          notes: (item as any).notes || null,
          addon_ids: item.addon_ids?.filter(isUUID) || [],
          addon_prices: item.addons?.filter((a: any) => item.addon_ids?.includes(a.id)).map((a: any) => ({ id: a.id, price: a.price })) || [],
          modifier_ids: (item as any).modifier_ids || []
        }));

        const { data: rpcResult, error: rpcError } = await (supabase.rpc as any)('create_order_atomic', {
          p_order: {
            id: orderId,
            store_id: store.id,
            client_id: user?.id || null,
            total_amount: total,
            status: 'paid',
            payment_method: 'wallet',
            payment_provider: 'wallet',
            payment_status: 'approved',
            is_paid: true,
            table_number: deliveryMode === 'local' ? currentTable : currentBar,
            node_id: safeQrContext?.node_id || null,
            channel: orderChannel || 'qr',
            delivery_mode: deliveryMode,
            delivery_status: 'pending',
            session_id: sessionId,
            dispatch_station: resolvedStation || null,
            source_location_id: resolvedLocationId || null
          },
          p_items: itemsPayload
        });

        if (rpcError) {
          console.error('[CheckoutPage] create_order_atomic error:', rpcError);
          // Rollback redemption if any
          if (selectedRewardId) {
            await (supabase.rpc as any)('rollback_redemption', { p_order_id: orderId });
          }
          addToast('Error al procesar pago con wallet', 'error');
          setIsProcessingPayment(false);
          return;
        }

        const result = rpcResult as any;
        if (!result?.success) {
          console.error('[Wallet] create_order_atomic returned failure:', JSON.stringify(result));
          if (selectedRewardId) {
            await (supabase.rpc as any)('rollback_redemption', { p_order_id: orderId });
          }
          addToast(result?.error || result?.message || 'Error al procesar pago', 'error');
          setIsProcessingPayment(false);
          return;
        }

        console.log('[CheckoutPage] Atomic wallet payment completed successfully', result);
        setHasActiveOrder(true);
        clearCart();
        navigate(`/m/${slug}/order/${orderId}`, { replace: true });
        return;
      }

      // 3. MERCADO PAGO FLOW — P0 FIX: Use atomic RPC for order creation
      if (paymentMethod === 'mercadopago') {
        const mpOrderId = crypto.randomUUID();

        // 3.1 Create order atomically via RPC (pending state, no wallet)
        const mpItemsPayload = cart.map(item => ({
          product_id: item.id,
          variant_id: isUUID(item.variant_id) ? item.variant_id : null,
          quantity: item.quantity,
          unit_price: item.price,
          notes: (item as any).notes || null,
          addon_ids: item.addon_ids?.filter(isUUID) || [],
          addon_prices: item.addons?.filter((a: any) => item.addon_ids?.includes(a.id)).map((a: any) => ({ id: a.id, price: a.price })) || [],
          modifier_ids: (item as any).modifier_ids || []
        }));

        console.log('[MP] Creating order with items:', JSON.stringify(mpItemsPayload));
        const { data: mpRpcResult, error: mpRpcError } = await (supabase.rpc as any)('create_order_atomic', {
          p_order: {
            id: mpOrderId,
            store_id: store.id,
            client_id: user?.id || null,
            total_amount: total,
            status: 'pending',
            payment_method: 'mercadopago',
            payment_provider: 'mercadopago',
            payment_status: 'pending',
            is_paid: false,
            table_number: deliveryMode === 'local' ? currentTable : currentBar,
            node_id: safeQrContext?.node_id || null,
            channel: orderChannel || 'qr',
            delivery_mode: deliveryMode,
            delivery_status: 'pending',
            session_id: sessionId,
            dispatch_station: resolvedStation || null,
            source_location_id: resolvedLocationId || null
          },
          p_items: mpItemsPayload
        });

        if (mpRpcError) {
          console.error('[MP] create_order_atomic RPC error:', mpRpcError);
          throw mpRpcError;
        }
        const mpResult = mpRpcResult as any;
        if (!mpResult?.success) {
          console.error('[MP] create_order_atomic returned failure:', JSON.stringify(mpResult));
          throw new Error(mpResult?.error || mpResult?.message || 'Failed to create order');
        }

        // 3.2 Invoke create-checkout Edge Function
        let checkoutData: any = null;
        let checkoutError: any = null;

        try {
          const result = await supabase.functions.invoke('create-checkout', {
            body: {
              store_id: store.id,
              order_id: mpOrderId,
              items: cart.map(item => ({
                title: item.name,
                unit_price: item.price,
                quantity: item.quantity
              })),
              back_urls: {
                success: `${window.location.origin}/#/m/${slug}/order/${mpOrderId}`,
                failure: `${window.location.origin}/#/m/${slug}/checkout`,
                pending: `${window.location.origin}/#/m/${slug}/order/${mpOrderId}`
              },
              external_reference: mpOrderId
            }
          });
          checkoutData = result.data;
          checkoutError = result.error;
        } catch (invokeErr: any) {
          // functions.invoke can throw on network/CORS errors
          console.error('[MP] functions.invoke threw:', invokeErr);
          checkoutError = invokeErr;
        }

        if (checkoutError) {
          console.error('[MP] Checkout Error:', checkoutError);
          try {
            const body = await (checkoutError as any).context?.json();
            addToast(body?.error || 'Error al conectar con Mercado Pago', 'error');
          } catch {
            addToast('Error al conectar con Mercado Pago', 'error');
          }
          setIsProcessingPayment(false);
          return;
        }

        // Parse response — handle string, Blob, and object responses
        if (typeof checkoutData === 'string') {
          try { checkoutData = JSON.parse(checkoutData); } catch { /* keep as-is */ }
        } else if (checkoutData instanceof Blob) {
          try {
            const text = await checkoutData.text();
            checkoutData = JSON.parse(text);
          } catch { /* keep as-is */ }
        }

        console.log('[MP] Checkout response:', typeof checkoutData, checkoutData);

        if (checkoutData?.error) {
          console.error('[MP] Application Error:', checkoutData.error);
          addToast(checkoutData.error || 'Error de Mercado Pago', 'error');
          setIsProcessingPayment(false);
          return;
        }

        // 3.4 Redirect to Mercado Pago
        const checkoutUrl = checkoutData?.checkout_url || checkoutData?.sandbox_url || checkoutData?.init_point;
        if (checkoutUrl) {
          clearCart();
          // FIX: Save pending MP order to localStorage before redirect
          // Hash fragments (#/...) can be lost during MP redirect on mobile
          // This allows the app to recover and navigate to the order on return
          try {
            localStorage.setItem('mp_pending_order', JSON.stringify({
              orderId: mpOrderId,
              slug,
              timestamp: Date.now()
            }));
          } catch { /* localStorage might not be available */ }
          window.location.href = checkoutUrl;
          return;
        }

        // No URL found — log everything for debugging
        console.error('[MP] No checkout_url found. Response type:', typeof checkoutData, 'Keys:', checkoutData ? Object.keys(checkoutData) : 'null');
        throw new Error('No se recibió URL de pago de Mercado Pago');
      }

    } catch (err: any) {
      console.error('Order Error:', err, 'Details:', JSON.stringify(err));
      const msg = err?.message || err?.error || err?.details || 'Error desconocido';
      addToast(`Error al procesar la orden: ${msg}`, 'error');
      setIsProcessingPayment(false);
    }
  };

  // Helper function to insert order items
  const insertOrderItems = async (orderId: string) => {
    for (const item of cart) {
      const { data: orderItemData, error: itemsError } = await supabase
        .from('order_items' as any)
        .insert({
          order_id: orderId,
          store_id: store!.id,
          tenant_id: store!.id,
          product_id: item.id,
          variant_id: item.variant_id || null,
          quantity: item.quantity,
          unit_price: item.price,
          total_price: item.price * item.quantity,
          notes: item.notes || ''
        })
        .select()
        .single();

      if (itemsError) {
        console.error('Error inserting item:', itemsError);
        continue;
      }

      if (item.addon_ids && item.addon_ids.length > 0 && (orderItemData as any)?.id) {
        const addonInserts = item.addon_ids.map(addonId => {
          const addonMeta = item.addons?.find(a => a.id === addonId);
          return {
            order_item_id: (orderItemData as any).id,
            addon_id: addonId,
            tenant_id: store!.id,
            price: addonMeta?.price || 0
          };
        });

        const { error: addonsError } = await (supabase
          .from('order_item_addons' as any) as any)
          .insert(addonInserts);

        if (addonsError) console.error('Error inserting addons:', addonsError);
      }
    }
  };

  const saveLocation = () => {
    if (tempValue.trim()) {
      if (deliveryMode === 'local') {
        setCurrentTable(tempValue.trim());
      } else {
        setCurrentBar(tempValue.trim());
      }
      setIsEditingLocation(false);
    }
  };

  const toggleLocationEdit = () => {
    setTempValue(deliveryMode === 'local' ? currentTable : currentBar);
    setIsEditingLocation(true);
  };

  const locationLabel = qrTableLabel
    ? qrTableLabel
    : (deliveryMode === 'local'
      ? (currentTable ? `MESA ${currentTable}` : 'QR LIBRE')
      : (currentBar ? `BARRA ${currentBar}` : 'QR LIBRE'));

  return (
    <div
      className="relative flex min-h-screen w-full flex-col overflow-x-hidden pb-32 font-display transition-colors duration-500"
      style={{ backgroundColor, color: textColor }}
    >
      {/* HEADER AJUSTADO A SAFE AREA TOP */}
      <div
        className="sticky top-0 z-50 flex items-center justify-between pt-[calc(1.5rem+env(safe-area-inset-top))] px-6 pb-6 backdrop-blur-2xl border-b transition-colors duration-500"
        style={{ backgroundColor: `${backgroundColor}F2`, borderColor: `${textColor}0D` }}
      >
        <button
          onClick={() => navigate(-1)}
          className="flex size-12 items-center justify-center rounded-full transition-all active:scale-90 group border"
          style={{ backgroundColor: `${textColor}0D`, borderColor: `${textColor}0D` }}
        >
          <span className="material-symbols-outlined group-active:scale-90" style={{ color: `${textColor}80` }}>arrow_back</span>
        </button>
        <h2 className="flex-1 text-center text-[10px] font-black tracking-[0.5em] uppercase pr-12 italic opacity-40" style={{ color: textColor }}>Finalizar Orden</h2>
      </div>

      <main className="flex-1 py-5">
        {/* SECCIÓN ENTREGA CON INDICADOR DINÁMICO */}
        <section className="px-6 mb-8">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em]" style={{ color: `${textColor}99` }}>Modo de Entrega</h3>

            <div className="relative flex items-center">
              {isEditingLocation ? (
                <div
                  className="flex items-center gap-2 p-1.5 pl-4 rounded-full border animate-in zoom-in-95 duration-300"
                  style={{ borderColor: `${accentColor}66`, backgroundColor: `${textColor}0D` }}
                >
                  <input
                    autoFocus
                    type="number"
                    value={tempValue}
                    onChange={(e) => setTempValue(e.target.value)}
                    onBlur={saveLocation}
                    onKeyDown={(e) => e.key === 'Enter' && saveLocation()}
                    className="bg-transparent border-none p-0 w-12 font-black italic text-xs focus:ring-0 text-center"
                    style={{ color: accentColor }}
                  />
                  <button
                    onClick={saveLocation}
                    className="w-8 h-8 rounded-full flex items-center justify-center shadow-2xl"
                    style={{ backgroundColor: accentColor, color: '#000', boxShadow: `0 0 15px ${accentColor}66` }}
                  >
                    <span className="material-symbols-outlined text-sm font-black">check</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={toggleLocationEdit}
                  className="flex items-center gap-3 px-5 py-2.5 rounded-full border active:scale-95 transition-all group/loc"
                  style={{ backgroundColor: `${accentColor}1A`, borderColor: `${accentColor}33` }}
                >
                  <span className="w-2 h-2 rounded-full animate-pulse shadow-lg" style={{ backgroundColor: accentColor, boxShadow: `0 0 8px ${accentColor}` }}></span>
                  <span className="text-[10px] font-black uppercase tracking-widest italic leading-none" style={{ color: accentColor }}>
                    {locationLabel}
                  </span>
                  <span className="material-symbols-outlined text-[14px] opacity-30 group-hover/loc:opacity-100 transition-opacity" style={{ color: accentColor }}>edit</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setDeliveryMode('local'); setIsEditingLocation(false); }}
              className={`relative flex flex-col items-center justify-center h-28 rounded-2xl border transition-all duration-500 overflow-hidden active:scale-[0.97] ${deliveryMode === 'local'
                ? 'shadow-lg'
                : 'opacity-40 grayscale'
                }`}
              style={deliveryMode === 'local' ? {
                borderColor: accentColor,
                backgroundColor: `${accentColor}0A`,
                boxShadow: `0 8px 24px ${accentColor}1A`
              } : {
                borderColor: `${textColor}0D`,
                backgroundColor: `${textColor}05`
              }}
            >
              <span className={`material-symbols-outlined text-[28px] mb-2 transition-all duration-500 ${deliveryMode === 'local' ? 'fill-icon' : ''}`} style={{ color: deliveryMode === 'local' ? accentColor : `${textColor}60` }}>local_cafe</span>
              <span className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: deliveryMode === 'local' ? accentColor : `${textColor}60` }}>Consumo Local</span>
              {deliveryMode === 'local' && <div className="absolute bottom-2.5 w-5 h-0.5 rounded-full" style={{ backgroundColor: accentColor, boxShadow: `0 0 8px ${accentColor}` }}></div>}
            </button>

            <button
              onClick={() => { setDeliveryMode('takeout'); setIsEditingLocation(false); }}
              className={`relative flex flex-col items-center justify-center h-28 rounded-2xl border transition-all duration-500 overflow-hidden active:scale-[0.97] ${deliveryMode === 'takeout'
                ? 'shadow-lg'
                : 'opacity-40 grayscale'
                }`}
              style={deliveryMode === 'takeout' ? {
                borderColor: accentColor,
                backgroundColor: `${accentColor}0A`,
                boxShadow: `0 8px 24px ${accentColor}1A`
              } : {
                borderColor: `${textColor}0D`,
                backgroundColor: `${textColor}05`
              }}
            >
              <span className={`material-symbols-outlined text-[28px] mb-2 transition-all duration-500 ${deliveryMode === 'takeout' ? 'fill-icon' : ''}`} style={{ color: deliveryMode === 'takeout' ? accentColor : `${textColor}60` }}>shopping_bag</span>
              <span className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: deliveryMode === 'takeout' ? accentColor : `${textColor}60` }}>Para llevar</span>
              {deliveryMode === 'takeout' && <div className="absolute bottom-2.5 w-5 h-0.5 rounded-full" style={{ backgroundColor: accentColor, boxShadow: `0 0 8px ${accentColor}` }}></div>}
            </button>
          </div>
        </section>

        {/* CANJEAR RECOMPENSA - LOYALTY */}
        {availableRewards.length > 0 && (
          <section className="px-6 mb-8">
            <h3 className="mb-4 text-[10px] font-black uppercase tracking-[0.4em] px-1 flex items-center gap-2" style={{ color: `${textColor}99` }}>
              <span className="material-symbols-outlined text-sm" style={{ color: accentColor }}>redeem</span>
              Canjear Puntos ({user?.points || 0} disponibles)
            </h3>
            <div className="flex flex-col gap-3">
              {availableRewards.map((reward) => (
                <div
                  key={reward.id}
                  onClick={() => {
                    if (selectedRewardId === reward.id) {
                      setSelectedRewardId(null);
                      setRewardDiscount(0);
                    } else {
                      setSelectedRewardId(reward.id);
                      setRewardDiscount(5); // Placeholder - should be dynamic
                    }
                  }}
                  className={`group flex cursor-pointer items-center justify-between rounded-2xl p-5 active:scale-[0.98] transition-all duration-300 border ${selectedRewardId === reward.id
                    ? 'shadow-lg'
                    : ''
                    }`}
                  style={{
                    borderColor: selectedRewardId === reward.id ? accentColor : `${textColor}1A`,
                    backgroundColor: selectedRewardId === reward.id ? `${accentColor}1A` : `${textColor}05`
                  }}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex size-12 items-center justify-center rounded-xl`}
                      style={{ backgroundColor: selectedRewardId === reward.id ? accentColor : `${textColor}0D`, color: selectedRewardId === reward.id ? '#000000' : `${textColor}80` }}
                    >
                      <span className="material-symbols-outlined text-xl">redeem</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="font-black text-sm uppercase tracking-tight" style={{ color: textColor }}>{reward.name}</span>
                      <span className="text-xs font-bold uppercase tracking-widest" style={{ color: selectedRewardId === reward.id ? accentColor : `${textColor}99` }}>
                        {reward.points} puntos
                      </span>
                    </div>
                  </div>
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300 ${selectedRewardId === reward.id ? 'scale-100' : 'scale-75 opacity-0'}`}
                    style={{ backgroundColor: selectedRewardId === reward.id ? accentColor : `${textColor}0D`, color: selectedRewardId === reward.id ? '#000000' : 'transparent' }}
                  >
                    <span className="material-symbols-outlined text-lg font-black">check</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* MÉTODO DE PAGO REFORZADO */}
        <section className="px-6 mb-10">
          <h3 className="mb-4 text-[10px] font-black uppercase tracking-[0.4em] px-1" style={{ color: `${textColor}99` }}>Método de Pago</h3>
          <div className="flex flex-col gap-2.5">
            {/* TABLE CREDIT OPTION */}
            {hasTableCredit && (
              <div
                onClick={() => setPaymentMethod('table_credit')}
                className={`group flex cursor-pointer items-center justify-between rounded-2xl px-4 py-3.5 active:scale-[0.98] transition-all duration-400 border ${paymentMethod === 'table_credit' ? 'shadow-lg' : 'opacity-50'}`}
                style={{
                  backgroundColor: paymentMethod === 'table_credit' ? 'rgba(99,102,241,0.05)' : `${textColor}05`,
                  borderColor: paymentMethod === 'table_credit' ? '#818cf8' : `${textColor}0D`
                }}
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className="flex size-10 items-center justify-center rounded-xl"
                    style={paymentMethod === 'table_credit' ? { backgroundColor: '#818cf8', color: '#fff' } : { backgroundColor: `${textColor}0D`, color: `${textColor}80` }}
                  >
                    <span className="material-symbols-outlined text-xl">payments</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-black text-[13px] uppercase tracking-tight" style={{ color: textColor }}>Crédito de Mesa</span>
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: tableCredit >= total ? '#818cf8' : '#f59e0b' }}>
                      ${tableCredit.toFixed(2)} disponible
                      {tableCredit < total && ` · Falta $${(total - tableCredit).toFixed(2)}`}
                    </span>
                  </div>
                </div>
                <div
                  className={`flex size-7 items-center justify-center rounded-full transition-all duration-500 ${paymentMethod === 'table_credit' ? 'scale-100' : 'scale-50'}`}
                  style={paymentMethod === 'table_credit' ? { backgroundColor: '#818cf8', color: '#fff' } : { backgroundColor: `${textColor}0D`, color: 'transparent' }}
                >
                  <span className="material-symbols-outlined text-base font-black">check</span>
                </div>
              </div>
            )}

            <div
              onClick={() => setPaymentMethod('wallet')}
              className={`group flex cursor-pointer items-center justify-between rounded-2xl px-4 py-3.5 active:scale-[0.98] transition-all duration-400 border ${paymentMethod === 'wallet' ? 'shadow-lg' : 'opacity-50'
                }`}
              style={{
                backgroundColor: paymentMethod === 'wallet' ? `${accentColor}08` : `${textColor}05`,
                borderColor: paymentMethod === 'wallet' ? accentColor : `${textColor}0D`
              }}
            >
              <div className="flex items-center gap-3.5">
                <div
                  className="flex size-10 items-center justify-center rounded-xl"
                  style={paymentMethod === 'wallet' ? { backgroundColor: accentColor, color: '#000' } : { backgroundColor: `${textColor}0D`, color: `${textColor}80` }}
                >
                  <span className="material-symbols-outlined text-xl">account_balance_wallet</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-black text-[13px] uppercase tracking-tight" style={{ color: textColor }}>Mi Saldo</span>
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: hasEnoughBalance ? accentColor : '#ef4444' }}>
                    ${walletBalance.toFixed(2)} disponible
                  </span>
                </div>
              </div>
              <div
                className={`flex size-7 items-center justify-center rounded-full transition-all duration-500 ${paymentMethod === 'wallet' ? 'scale-100' : 'scale-50'}`}
                style={paymentMethod === 'wallet' ? { backgroundColor: accentColor, color: '#000' } : { backgroundColor: `${textColor}0D`, color: 'transparent' }}
              >
                <span className="material-symbols-outlined text-base font-black">check</span>
              </div>
            </div>

            <div
              onClick={() => setPaymentMethod('mercadopago')}
              className={`group flex cursor-pointer items-center justify-between rounded-2xl px-4 py-3.5 active:scale-[0.98] transition-all duration-400 border ${paymentMethod === 'mercadopago' ? 'shadow-lg' : 'opacity-50'
                }`}
              style={{
                backgroundColor: paymentMethod === 'mercadopago' ? 'rgba(0,158,227,0.03)' : `${textColor}05`,
                borderColor: paymentMethod === 'mercadopago' ? '#009ee3' : `${textColor}0D`
              }}
            >
              <div className="flex items-center gap-3.5">
                <div className={`flex size-10 items-center justify-center rounded-xl ${paymentMethod === 'mercadopago' ? 'bg-[#009ee3] text-white' : ''}`} style={{ backgroundColor: paymentMethod === 'mercadopago' ? undefined : `${textColor}0D` }}>
                  <img src="https://img.icons8.com/color/48/000000/mercado-pago.png" alt="MP" className={`w-7 h-7 transition-all ${paymentMethod === 'mercadopago' ? 'brightness-0 invert' : 'grayscale'}`} />
                </div>
                <div className="flex flex-col">
                  <span className="font-black text-[13px] uppercase tracking-tight" style={{ color: textColor }}>Mercado Pago</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: `${textColor}99` }}>Plataforma Externa</span>
                </div>
              </div>
              <div className={`flex size-7 items-center justify-center rounded-full transition-all duration-500 ${paymentMethod === 'mercadopago' ? 'scale-100' : 'scale-50'}`} style={{ backgroundColor: paymentMethod === 'mercadopago' ? '#009ee3' : `${textColor}0D`, color: paymentMethod === 'mercadopago' ? '#fff' : 'transparent' }}>
                <span className="material-symbols-outlined text-base font-black">check</span>
              </div>
            </div>
          </div>
        </section>

        {/* RESUMEN FINAL */}
        <section className="px-6 mb-10">
          <div
            className="rounded-2xl p-6 border shadow-lg"
            style={{ backgroundColor: `${surfaceColor}40`, borderColor: `${textColor}0D` }}
          >
            <div className="flex justify-between py-2">
              <p className="font-black uppercase tracking-widest text-[10px]" style={{ color: `${textColor}99` }}>Subtotal</p>
              <p className="font-black text-[15px] tracking-tight" style={{ color: textColor }}>${subtotal.toFixed(2)}</p>
            </div>
            {paymentMethod === 'table_credit' && (
              <>
                <div className="flex justify-between py-2">
                  <p className="font-black uppercase tracking-widest text-[10px] text-indigo-400/80">Crédito Mesa</p>
                  <p className="font-black text-[15px] tracking-tight text-indigo-400">-${Math.min(tableCredit, total).toFixed(2)}</p>
                </div>
                {total > tableCredit && (
                  <div className="flex justify-between py-1.5">
                    <p className="font-black uppercase tracking-widest text-[10px] text-amber-400/80">Restante</p>
                    <p className="font-black text-[14px] tracking-tight text-amber-400">${(total - tableCredit).toFixed(2)}</p>
                  </div>
                )}
              </>
            )}
            <div className="my-4 h-px w-full" style={{ backgroundColor: `${textColor}0D` }}></div>
            <div className="flex justify-between items-end">
              <p className="text-[10px] font-black uppercase tracking-[0.4em]" style={{ color: textColor }}>Total</p>
              <p className="text-[32px] font-black tabular-nums tracking-tighter leading-none" style={{ color: textColor }}>
                ${paymentMethod === 'table_credit' ? Math.max(0, total - tableCredit).toFixed(2) : total.toFixed(2)}
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER ACTION POWER BUTTON - OPTIMIZADO PARA IPHONE */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[60] px-5 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] backdrop-blur-3xl border-t flex justify-center shadow-[0_-15px_40px_rgba(0,0,0,0.15)]"
        style={{ backgroundColor: `${backgroundColor}F2`, borderColor: `${textColor}0D` }}
      >
        <div className="w-full max-w-md">
          <button
            onClick={handlePlaceOrder}
            disabled={isProcessingPayment}
            className={`group relative flex h-16 w-full items-center justify-between pl-8 pr-3 transition-all duration-500 active:scale-[0.97] shadow-lg overflow-hidden disabled:opacity-50 rounded-2xl border border-white/10`}
            style={{
              backgroundColor: paymentMethod === 'mercadopago' ? '#009ee3' : paymentMethod === 'table_credit' ? '#818cf8' : accentColor,
              color: paymentMethod === 'mercadopago' ? '#fff' : paymentMethod === 'table_credit' ? '#fff' : '#000'
            }}
          >
            <div className="relative z-10 flex flex-col items-start leading-none text-left">
              <span className="text-[12px] font-black uppercase tracking-tight">
                {isProcessingPayment ? 'Verificando...' : 'Confirmar Pago'}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-50">Seguro</span>
            </div>

            <div className="flex items-center gap-4 relative z-10">
              <div className="h-8 w-[1px]" style={{ backgroundColor: paymentMethod === 'mercadopago' || paymentMethod === 'table_credit' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' }}></div>
              <div className="flex items-center gap-3">
                <span className="text-[20px] font-black tracking-tighter tabular-nums leading-none">${total.toFixed(2)}</span>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-all group-hover:scale-105"
                  style={{
                    backgroundColor: paymentMethod === 'mercadopago' ? '#fff' : paymentMethod === 'table_credit' ? '#fff' : '#000',
                    color: paymentMethod === 'mercadopago' ? '#009ee3' : paymentMethod === 'table_credit' ? '#818cf8' : accentColor
                  }}
                >
                  {isProcessingPayment ? (
                    <span className="material-symbols-outlined animate-spin text-lg font-black">refresh</span>
                  ) : (
                    <span className="material-symbols-outlined font-black text-xl">arrow_forward</span>
                  )}
                </div>
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
