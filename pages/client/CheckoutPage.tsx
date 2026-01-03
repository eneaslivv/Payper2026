import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useClient } from '../../contexts/ClientContext';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/ToastSystem';

type PaymentMethodType = 'wallet' | 'mercadopago';

interface Reward {
  id: string;
  name: string;
  points: number;
  product_id?: string;
  is_active: boolean;
}

const CheckoutPage: React.FC = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { cart, isRedeemingPoints, clearCart, setHasActiveOrder, store, user, qrContext, tableLabel: qrTableLabel, orderChannel } = useClient();
  // Use QR context if available, otherwise fallback to manual input
  const initialTable = qrTableLabel || '05';

  // Theme support
  const accentColor = store?.menu_theme?.accentColor || '#36e27b';
  const walletBalance = user?.balance || 0;

  const [deliveryMode, setDeliveryMode] = useState<'local' | 'takeout'>(initialTable ? 'local' : 'takeout');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('wallet');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const { addToast } = useToast();

  // Gestión de ubicación dinámica
  const [currentTable, setCurrentTable] = useState(initialTable || '05');
  const [currentBar, setCurrentBar] = useState('01');
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [tempValue, setTempValue] = useState('');

  // Loyalty Rewards State
  const [availableRewards, setAvailableRewards] = useState<Reward[]>([]);
  const [selectedRewardId, setSelectedRewardId] = useState<string | null>(null);
  const [rewardDiscount, setRewardDiscount] = useState(0);

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!user) {
      navigate(`/m/${slug}/auth`);
    }
  }, [user, navigate, slug]);

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
  const tax = subtotal * 0.08;
  const total = subtotal + tax - discount;

  // Calculate after total is defined
  const hasEnoughBalance = walletBalance >= total;

  // Don't render if not logged in
  if (!user) {
    return null;
  }

  const handlePlaceOrder = async () => {
    if (!store?.id) return;
    setIsProcessingPayment(true);

    try {
      // 1. Construct Order Payload
      // Include node_id from QR context to link order to scanned location
      // Include session_id for full session tracking
      const sessionId = localStorage.getItem('client_session_id') || null;

      const orderPayload: any = {
        store_id: store.id,
        client_id: user?.id || null,
        table_number: deliveryMode === 'local' ? currentTable : currentBar,
        delivery_mode: deliveryMode,
        channel: orderChannel || 'qr', // Use channel from QR context
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
        // Link to venue node if QR was scanned (mesa, barra, zona)
        node_id: qrContext?.node_id || null,
        location_identifier: qrTableLabel || null,
        // Session tracking (NEW)
        session_id: sessionId
      };

      // 2. WALLET FLOW — SAFE: Order first, Redeem, then Pay
      if (paymentMethod === 'wallet') {
        if (!hasEnoughBalance) {
          addToast('Saldo insuficiente en tu wallet', 'error');
          setIsProcessingPayment(false);
          return;
        }

        // 2.1 Create order in PENDING state first
        const { data: pendingOrder, error: orderError } = await supabase
          .from('orders' as any)
          .insert(orderPayload)
          .select()
          .single();

        if (orderError) throw orderError;
        const orderId = (pendingOrder as any).id;

        // 2.2 Insert order items
        await insertOrderItems(orderId);

        // 2.3 Process reward redemption if selected (BEFORE payment)
        if (selectedRewardId) {
          const { data: redeemResult, error: redeemError } = await (supabase.rpc as any)('redeem_reward', {
            p_client_id: user?.id,
            p_reward_id: selectedRewardId,
            p_order_id: orderId
          });

          if (redeemError || !redeemResult?.success) {
            // Redemption failed - mark order as cancelled and abort
            await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId);
            addToast(redeemResult?.error || 'Error al canjear recompensa', 'error');
            setIsProcessingPayment(false);
            return;
          }
        }

        // 2.4 Process wallet payment
        const { data: walletResult, error: walletError } = await (supabase.rpc as any)('pay_with_wallet', {
          p_client_id: user?.id,
          p_amount: total
        });

        if (walletError || !walletResult?.success) {
          // Payment failed - rollback redemption if any
          if (selectedRewardId) {
            await (supabase.rpc as any)('rollback_redemption', { p_order_id: orderId });
          }
          await supabase.from('orders' as any).update({ status: 'cancelled' }).eq('id', orderId);
          addToast(walletResult?.error || 'Error al procesar pago con wallet', 'error');
          setIsProcessingPayment(false);
          return;
        }

        // 2.5 Update order to APPROVED (this triggers the loyalty earn)
        const { error: updateError } = await supabase
          .from('orders' as any)
          .update({ is_paid: true, payment_status: 'approved' })
          .eq('id', orderId);

        if (updateError) throw updateError;

        setHasActiveOrder(true);
        clearCart();
        navigate(`/m/${slug}/order/${orderId}`, { replace: true });
        return;
      }

      // 3. MERCADO PAGO FLOW (⭐ NEW)
      if (paymentMethod === 'mercadopago') {
        // 3.1 Create order in pending state
        const { data: order, error: orderError } = await supabase
          .from('orders' as any)
          .insert(orderPayload)
          .select()
          .single();

        if (orderError) throw orderError;

        // 3.2 Insert order items
        await insertOrderItems((order as any).id);

        // 3.3 Invoke create-checkout Edge Function
        const { data: checkoutData, error: checkoutError } = await supabase.functions.invoke('create-checkout', {
          body: {
            store_id: store.id,
            order_id: (order as any).id,
            items: cart.map(item => ({
              title: item.name,
              unit_price: item.price,
              quantity: item.quantity
            })),
            back_urls: {
              success: `${window.location.origin}/#/m/${slug}/order/${(order as any).id}`,
              failure: `${window.location.origin}/#/m/${slug}/checkout`,
              pending: `${window.location.origin}/#/m/${slug}/order/${(order as any).id}`
            },
            external_reference: (order as any).id
          }
        });

        if (checkoutError) {
          console.error('Checkout Error:', checkoutError);

          // Try to extract error message from the response body if it's a 400
          try {
            const body = await (checkoutError as any).context?.json();
            if (body?.error) {
              console.error('Detailed Edge Function Error:', body.error);
              addToast(body.error, 'error');
            } else {
              addToast('Error al conectar con Mercado Pago', 'error');
            }
          } catch (e) {
            addToast('Error al conectar con Mercado Pago', 'error');
          }

          setIsProcessingPayment(false);
          return;
        }

        if (checkoutData?.error) {
          console.error('MP Application Error:', checkoutData.error);
          addToast(checkoutData.error || 'Error de Mercado Pago', 'error');
          setIsProcessingPayment(false);
          return;
        }

        // 3.4 Redirect to Mercado Pago
        if (checkoutData?.checkout_url) {
          clearCart();
          window.location.href = checkoutData.checkout_url;
          return;
        }

        throw new Error('No se recibió URL de checkout');
      }

    } catch (err) {
      console.error('Order Error:', err);
      addToast('Error al procesar la orden', 'error');
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
        setCurrentTable(tempValue.padStart(2, '0'));
      } else {
        setCurrentBar(tempValue.padStart(2, '0'));
      }
      setIsEditingLocation(false);
    }
  };

  const toggleLocationEdit = () => {
    setTempValue(deliveryMode === 'local' ? currentTable : currentBar);
    setIsEditingLocation(true);
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden pb-48 bg-black font-display">
      {/* HEADER AJUSTADO A SAFE AREA TOP */}
      <header className="sticky top-0 z-50 flex items-center justify-between bg-black/95 pt-[calc(1.5rem+env(safe-area-inset-top))] px-6 pb-6 backdrop-blur-2xl border-b border-white/5">
        <button onClick={() => navigate(-1)} className="flex size-12 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-all active:scale-90 group border border-white/5">
          <span className="material-symbols-outlined text-slate-500 group-active:scale-90">arrow_back</span>
        </button>
        <h2 className="flex-1 text-center text-[10px] font-black tracking-[0.5em] uppercase pr-12 italic text-white/40">Finalizar Orden</h2>
      </header>

      <main className="flex-1 py-8">
        {/* SECCIÓN ENTREGA CON INDICADOR DINÁMICO */}
        <section className="px-6 mb-12">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-700">Modo de Entrega</h3>

            <div className="relative flex items-center">
              {isEditingLocation ? (
                <div
                  className="flex items-center gap-2 bg-white/5 p-1.5 pl-4 rounded-full border animate-in zoom-in-95 duration-300"
                  style={{ borderColor: `${accentColor}66` }}
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
                    {deliveryMode === 'local' ? `MESA ${currentTable}` : `BARRA ${currentBar}`}
                  </span>
                  <span className="material-symbols-outlined text-[14px] opacity-30 group-hover/loc:opacity-100 transition-opacity" style={{ color: accentColor }}>edit</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <button
              onClick={() => { setDeliveryMode('local'); setIsEditingLocation(false); }}
              className={`relative flex flex-col items-center justify-center h-48 rounded-[2.5rem] border-2 transition-all duration-700 overflow-hidden active:scale-95 ${deliveryMode === 'local'
                ? 'shadow-2xl'
                : 'border-white/5 bg-white/[0.01] opacity-30 grayscale'
                }`}
              style={deliveryMode === 'local' ? {
                borderColor: accentColor,
                backgroundColor: `${accentColor}0A`,
                boxShadow: `0 20px 50px ${accentColor}26`
              } : {}}
            >
              <div className="absolute top-0 right-0 w-24 h-24 blur-3xl rounded-full -mr-12 -mt-12" style={{ backgroundColor: `${accentColor}0D` }}></div>
              <span className={`material-symbols-outlined text-[44px] mb-4 transition-all duration-700 ${deliveryMode === 'local' ? 'fill-icon scale-110' : 'text-slate-700 scale-90'}`} style={deliveryMode === 'local' ? { color: accentColor } : {}}>local_cafe</span>
              <span className={`text-[11px] font-black uppercase tracking-[0.2em] italic ${deliveryMode === 'local' ? '' : 'text-slate-600'}`} style={deliveryMode === 'local' ? { color: accentColor } : {}}>Consumo Local</span>
              {deliveryMode === 'local' && <div className="absolute bottom-4 w-6 h-1 rounded-full shadow-lg" style={{ backgroundColor: accentColor, boxShadow: `0 0 10px ${accentColor}` }}></div>}
            </button>

            <button
              onClick={() => { setDeliveryMode('takeout'); setIsEditingLocation(false); }}
              className={`relative flex flex-col items-center justify-center h-48 rounded-[2.5rem] border-2 transition-all duration-700 overflow-hidden active:scale-95 ${deliveryMode === 'takeout'
                ? 'shadow-2xl'
                : 'border-white/5 bg-white/[0.01] opacity-30 grayscale'
                }`}
              style={deliveryMode === 'takeout' ? {
                borderColor: accentColor,
                backgroundColor: `${accentColor}0A`,
                boxShadow: `0 20px 50px ${accentColor}26`
              } : {}}
            >
              <span className={`material-symbols-outlined text-[44px] mb-4 transition-all duration-700 ${deliveryMode === 'takeout' ? 'fill-icon scale-110' : 'text-slate-700 scale-90'}`} style={deliveryMode === 'takeout' ? { color: accentColor } : {}}>shopping_bag</span>
              <span className={`text-[11px] font-black uppercase tracking-[0.2em] italic ${deliveryMode === 'takeout' ? '' : 'text-slate-600'}`} style={deliveryMode === 'takeout' ? { color: accentColor } : {}}>Para llevar</span>
              {deliveryMode === 'takeout' && <div className="absolute bottom-4 w-6 h-1 rounded-full shadow-lg" style={{ backgroundColor: accentColor, boxShadow: `0 0 10px ${accentColor}` }}></div>}
            </button>
          </div>
        </section>

        {/* CANJEAR RECOMPENSA - LOYALTY */}
        {availableRewards.length > 0 && (
          <section className="px-6 mb-12">
            <h3 className="mb-6 text-[10px] font-black uppercase tracking-[0.4em] text-slate-700 px-1 flex items-center gap-2">
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
                      // For now, use a fixed discount or fetch from reward metadata
                      // In production, this should come from reward.discount_value or product price
                      setRewardDiscount(5); // Placeholder - should be dynamic
                    }
                  }}
                  className={`group flex cursor-pointer items-center justify-between rounded-2xl p-5 active:scale-[0.98] transition-all duration-300 border ${selectedRewardId === reward.id
                    ? 'border-neon bg-neon/10 shadow-lg'
                    : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'
                    }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`flex size-12 items-center justify-center rounded-xl ${selectedRewardId === reward.id ? 'bg-neon text-black' : 'bg-white/5 text-slate-500'
                      }`}>
                      <span className="material-symbols-outlined text-xl">redeem</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="font-black text-sm uppercase tracking-tight text-white">{reward.name}</span>
                      <span className={`text-xs font-bold uppercase tracking-widest ${selectedRewardId === reward.id ? 'text-neon' : 'text-slate-600'
                        }`}>
                        {reward.points} puntos
                      </span>
                    </div>
                  </div>
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300 ${selectedRewardId === reward.id ? 'bg-neon text-black scale-100' : 'bg-white/5 scale-75 opacity-0'
                    }`}>
                    <span className="material-symbols-outlined text-lg font-black">check</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* MÉTODO DE PAGO REFORZADO */}
        <section className="px-6 mb-12">
          <h3 className="mb-6 text-[10px] font-black uppercase tracking-[0.4em] text-slate-700 px-1">Método de Pago</h3>
          <div className="flex flex-col gap-4">
            <div
              onClick={() => setPaymentMethod('wallet')}
              className={`group flex cursor-pointer items-center justify-between rounded-[2.8rem] bg-white/[0.02] p-6 active:scale-[0.98] transition-all duration-500 border-2 ${paymentMethod === 'wallet' ? 'shadow-2xl' : 'border-white/5 opacity-50'
                }`}
              style={paymentMethod === 'wallet' ? {
                borderColor: accentColor,
                backgroundColor: `${accentColor}08`
              } : {}}
            >
              <div className="flex items-center gap-6">
                <div
                  className={`flex size-16 items-center justify-center rounded-[1.4rem] shadow-xl`}
                  style={paymentMethod === 'wallet' ? { backgroundColor: accentColor, color: '#000' } : { backgroundColor: 'rgba(255,255,255,0.05)', color: '#475569' }}
                >
                  <span className="material-symbols-outlined text-3xl font-black">account_balance_wallet</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-black text-[15px] uppercase tracking-tight italic text-white">Mi Saldo</span>
                  <span className="text-[12px] font-black uppercase tracking-widest mt-1" style={{ color: hasEnoughBalance ? accentColor : '#ef4444' }}>
                    ${walletBalance.toFixed(2)} disponible
                  </span>
                </div>
              </div>
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-700 ${paymentMethod === 'wallet' ? 'scale-100' : 'bg-white/5 text-transparent scale-50'}`}
                style={paymentMethod === 'wallet' ? { backgroundColor: accentColor, color: '#000' } : {}}
              >
                <span className="material-symbols-outlined text-xl font-black">check</span>
              </div>
            </div>

            <div
              onClick={() => setPaymentMethod('mercadopago')}
              className={`group flex cursor-pointer items-center justify-between rounded-[2.8rem] bg-white/[0.02] p-6 active:scale-[0.98] transition-all duration-500 border-2 ${paymentMethod === 'mercadopago' ? 'border-[#009ee3] shadow-2xl bg-blue-500/[0.03]' : 'border-white/5 opacity-50'
                }`}
            >
              <div className="flex items-center gap-6">
                <div className={`flex size-16 items-center justify-center rounded-[1.4rem] ${paymentMethod === 'mercadopago' ? 'bg-[#009ee3] text-white shadow-xl' : 'bg-white/5 text-slate-700'}`}>
                  <img src="https://img.icons8.com/color/48/000000/mercado-pago.png" alt="MP" className={`w-10 h-10 transition-all ${paymentMethod === 'mercadopago' ? 'brightness-0 invert' : 'grayscale'}`} />
                </div>
                <div className="flex flex-col">
                  <span className="font-black text-[15px] uppercase tracking-tight italic text-white">Mercado Pago</span>
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">Plataforma Externa</span>
                </div>
              </div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-700 ${paymentMethod === 'mercadopago' ? 'bg-[#009ee3] text-white scale-100' : 'bg-white/5 text-transparent scale-50'}`}>
                <span className="material-symbols-outlined text-xl font-black">check</span>
              </div>
            </div>
          </div>
        </section>

        {/* RESUMEN FINAL */}
        <section className="px-6 mb-16">
          <div className="rounded-[3.5rem] bg-white/[0.02] p-10 border border-white/5 shadow-2xl">
            <div className="flex justify-between py-4">
              <p className="font-black text-slate-600 uppercase tracking-widest text-[11px]">Subtotal</p>
              <p className="font-black italic text-white text-[18px] tracking-tighter">${subtotal.toFixed(2)}</p>
            </div>
            <div className="my-6 h-px w-full bg-white/5"></div>
            <div className="flex justify-between items-end">
              <p className="text-[12px] font-black uppercase tracking-[0.5em] text-white italic">Monto a Pagar</p>
              <p className="text-[48px] font-black tabular-nums tracking-tighter italic text-white leading-none">${total.toFixed(2)}</p>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER ACTION POWER BUTTON - OPTIMIZADO PARA IPHONE */}
      <div className="fixed bottom-0 left-0 right-0 z-[60] p-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] bg-black/95 backdrop-blur-3xl border-t border-white/5 flex justify-center shadow-[0_-25px_80px_rgba(0,0,0,1)]">
        <div className="w-full max-w-md">
          <button
            onClick={handlePlaceOrder}
            disabled={isProcessingPayment}
            className={`group relative flex h-24 w-full items-center justify-between pl-12 pr-5 transition-all duration-500 active:scale-[0.97] shadow-2xl overflow-hidden disabled:opacity-50 rounded-full border border-white/20`}
            style={{
              backgroundColor: paymentMethod === 'mercadopago' ? '#009ee3' : accentColor,
              color: paymentMethod === 'mercadopago' ? '#fff' : '#000'
            }}
          >
            <div className="relative z-10 flex flex-col items-start leading-none text-left">
              <span className="text-[14px] font-black uppercase tracking-tight">
                {isProcessingPayment ? 'VERIFICANDO...' : 'CONFIRMAR'}
              </span>
              <span className="text-[14px] font-black uppercase tracking-tight opacity-50 italic">PAGO SEGURO</span>
            </div>

            <div className="flex items-center gap-6 relative z-10">
              <div className="h-12 w-[1px] bg-black/10" style={{ backgroundColor: paymentMethod === 'mercadopago' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)' }}></div>
              <div className="flex items-center gap-4">
                <span className="text-[28px] font-black italic tracking-tighter tabular-nums leading-none">${total.toFixed(2)}</span>
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center transition-all group-hover:scale-105 shadow-2xl"
                  style={{
                    backgroundColor: paymentMethod === 'mercadopago' ? '#fff' : '#000',
                    color: paymentMethod === 'mercadopago' ? '#009ee3' : accentColor
                  }}
                >
                  {isProcessingPayment ? (
                    <span className="material-symbols-outlined animate-spin text-2xl font-black">refresh</span>
                  ) : (
                    <span className="material-symbols-outlined font-black text-[32px]">arrow_forward</span>
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
