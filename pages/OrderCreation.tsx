
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MOCK_CLIENTS, MOCK_TABLES } from '../constants';
import { Product, OrderItem, Client, Table, Order } from '../types';
import { useToast } from '../components/ToastSystem';
import { useOffline } from '../contexts/OfflineContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const OrderCreation: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { createOrder, products } = useOffline(); // Use offline context
  const { profile } = useAuth();
  const [activeCategory, setActiveCategory] = useState('Todo');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [isCartOpenMobile, setIsCartOpenMobile] = useState(false);

  // Keyboard Navigation State
  const [activeIndex, setActiveIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Client & Table States
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [isScanningUser, setIsScanningUser] = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);

  // Submission States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastOrderTotal, setLastOrderTotal] = useState(0);

  // Camera Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const categories = ['Todo', 'Cafetería', 'Pastelería', 'Bebidas', 'Sandwiches', 'Promos'];

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = activeCategory === 'Todo' || p.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [search, activeCategory, products]);

  useEffect(() => {
    setActiveIndex(0);
  }, [search, activeCategory]);

  // Autofocus on mount
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  const handleAddToCart = (product: Product, quantity = 1) => {
    const newItem: OrderItem = {
      id: Math.random().toString(36).substr(2, 9),
      productId: product.id,
      name: product.name,
      quantity: quantity,
      price_unit: product.price,
      inventory_items_to_deduct: []
    };
    setCart(prev => [...prev, newItem]);
    addToast(`${product.name} Agregado`, 'success', `$${product.price.toFixed(2)}`);
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(i => i.id !== id));
  };

  const modifyLastItem = (delta: number) => {
    if (cart.length === 0) return;
    const lastItem = cart[cart.length - 1];
    if (lastItem.quantity + delta <= 0) {
      removeFromCart(lastItem.id);
      addToast("Ítem Removido", 'info');
    } else {
      setCart(prev => {
        const newCart = [...prev];
        newCart[newCart.length - 1].quantity += delta;
        return newCart;
      });
      addToast(delta > 0 ? "+1 Unidad" : "-1 Unidad", 'info');
    }
  };

  const filteredClients = useMemo(() => {
    return MOCK_CLIENTS.filter(c =>
      c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
      c.email.toLowerCase().includes(clientSearch.toLowerCase())
    );
  }, [clientSearch]);

  const total = cart.reduce((acc, item) => acc + (item.price_unit * item.quantity), 0);

  const handleConfirmSale = async () => {
    if (cart.length === 0 || isSubmitting) return;
    if (!profile?.store_id) {
      addToast('Error', 'error', 'No se detectó el ID del local');
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare order items for RPC
      const orderItems = cart.map(item => ({
        product_id: item.productId,
        name: item.name,
        quantity: item.quantity,
        price_unit: item.price_unit,
        variant_name: null,
        addons: [],
        note: null
      }));

      // 1. Insert Order
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          store_id: profile.store_id,
          customer_name: selectedClient ? selectedClient.name : 'Cliente General',
          total_amount: total,
          status: 'pending',
          is_paid: true, // Manual salon orders are usually paid or marked as such
          channel: 'table',
          table_number: selectedTable?.name.replace('Mesa ', '') || null
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // 2. Insert Items
      if (cart.length > 0 && orderData.id) {
        const orderItemsToInsert = cart.map(item => ({
          order_id: orderData.id,
          store_id: profile.store_id,
          tenant_id: profile.store_id,
          product_id: item.productId,
          quantity: item.quantity,
          unit_price: item.price_unit,
          total_price: item.price_unit * item.quantity,
          notes: ''
        }));

        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(orderItemsToInsert);

        if (itemsError) throw itemsError;
      }

      addToast(`PEDIDO CONFIRMADO`, 'success', `Orden #${orderData.order_number || ''} creada`);

      setLastOrderTotal(total);
      setShowSuccess(true);
      setIsCartOpenMobile(false);

    } catch (err: any) {
      console.error('Order error:', err);
      addToast('Error al crear pedido', 'error', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetOrder = () => {
    setCart([]);
    setSelectedClient(null);
    setSelectedTable(null);
    setShowSuccess(false);
    setSearch('');
    if (searchInputRef.current) searchInputRef.current.focus();
  };

  // --- SHORTCUT ENGINE ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent interference with modals
      if (showSuccess || showClientPicker || showTablePicker || isScanningUser) return;

      // Navigation in Product Grid
      if (['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) {
        e.preventDefault();
        const cols = window.innerWidth >= 1280 ? 4 : window.innerWidth >= 640 ? 3 : 2;
        let nextIndex = activeIndex;

        if (e.key === 'ArrowRight') nextIndex += 1;
        if (e.key === 'ArrowLeft') nextIndex -= 1;
        if (e.key === 'ArrowDown') nextIndex += cols;
        if (e.key === 'ArrowUp') nextIndex -= cols;

        if (nextIndex >= 0 && nextIndex < filteredProducts.length) {
          setActiveIndex(nextIndex);
        }
        return;
      }

      // Add Product
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (filteredProducts[activeIndex]) {
          handleAddToCart(filteredProducts[activeIndex], e.shiftKey ? 1 : 1);
          setSearch('');
        }
        return;
      }

      // Cart Manipulation
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        modifyLastItem(1);
        return;
      }
      if (e.key === '-') {
        e.preventDefault();
        modifyLastItem(-1);
        return;
      }
      if (e.key === 'Backspace') {
        if (search === '') {
          e.preventDefault();
          if (cart.length > 0) {
            removeFromCart(cart[cart.length - 1].id);
            addToast("Ítem Eliminado", 'error');
          }
        }
        return;
      }

      // Confirm Sale
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleConfirmSale();
        return;
      }

      // Escape to Back
      if (e.key === 'Escape') {
        if (search) {
          setSearch('');
        } else {
          navigate(-1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredProducts, activeIndex, cart, search, showSuccess, showClientPicker, showTablePicker]);


  const startScanner = async () => {
    setIsScanningUser(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
    } catch (err) {
      alert("Error al acceder a la cámara");
      setIsScanningUser(false);
    }
  };

  const stopScanner = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    setIsScanningUser(false);
  };

  const CartContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-white/5 shrink-0 space-y-3">
        <button
          onClick={() => setShowClientPicker(true)}
          className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all active:scale-95 ${selectedClient ? 'bg-neon/10 border-neon/30 text-neon shadow-neon-soft' : 'bg-white/5 border-white/5 text-white/60'}`}
        >
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-lg">{selectedClient ? 'person_check' : 'person_add'}</span>
            <span className="text-[11px] font-black uppercase italic tracking-wider">{selectedClient ? selectedClient.name : 'VINCULAR CLIENTE'}</span>
          </div>
          <span className="material-symbols-outlined text-sm opacity-40">expand_more</span>
        </button>

        <button
          onClick={() => setShowTablePicker(true)}
          className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all active:scale-95 ${selectedTable ? 'bg-accent/10 border-accent/30 text-accent shadow-soft' : 'bg-white/5 border-white/5 text-white/60'}`}
        >
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-lg">deck</span>
            <span className="text-[11px] font-black uppercase italic tracking-wider">{selectedTable ? selectedTable.name : 'ASIGNAR MESA'}</span>
          </div>
          <span className="material-symbols-outlined text-sm opacity-40">expand_more</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-3 no-scrollbar">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-10 py-10">
            <span className="material-symbols-outlined text-6xl mb-4">shopping_basket</span>
            <p className="text-[10px] font-black uppercase tracking-[0.4em]">Cesta Vacía</p>
            <p className="text-[9px] font-bold uppercase mt-2">USA (+) Y (-) PARA CANTIDAD RÁPIDA</p>
          </div>
        ) : (
          cart.map((item, idx) => (
            <div key={item.id} className={`p-4 bg-white/[0.02] rounded-2xl border flex justify-between items-center group animate-in slide-in-from-right-4 ${idx === cart.length - 1 ? 'border-neon/30 bg-neon/5' : 'border-white/5'}`}>
              <div className="flex flex-col">
                <span className="text-[11px] font-black text-white uppercase italic tracking-tight">{item.name}</span>
                <span className="text-[9px] font-bold text-white/30 uppercase mt-0.5">${item.price_unit.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm font-black text-neon italic">${(item.price_unit * item.quantity).toFixed(2)}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-white/50">{item.quantity}x</span>
                  <button onClick={() => removeFromCart(item.id)} className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-colors">
                    <span className="material-symbols-outlined text-lg font-bold">close</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-8 border-t border-white/5 bg-black/20 backdrop-blur-xl space-y-6 shrink-0">
        <div className="flex justify-between items-baseline">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] block">SUBTOTAL</span>
            <span className="text-[9px] font-bold text-neon uppercase bg-neon/10 px-2 py-0.5 rounded tracking-widest">LOYALTY ACTIVE</span>
          </div>
          <span className="text-4xl font-black italic-black text-neon leading-none tracking-tighter">${total.toFixed(2)}</span>
        </div>
        <button
          onClick={handleConfirmSale}
          disabled={cart.length === 0 || isSubmitting}
          className="w-full py-5 bg-neon text-black rounded-[1.5rem] font-black text-xs uppercase tracking-[0.3em] shadow-neon-soft active:scale-95 disabled:opacity-20 flex items-center justify-center gap-3 overflow-hidden relative group"
        >
          {isSubmitting ? (
            <>
              <div className="size-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
              <span>SINCRO...</span>
            </>
          ) : (
            <>
              <span>CONFIRMAR VENTA</span>
              <div className="hidden group-hover:flex items-center gap-1 bg-black/10 px-2 py-0.5 rounded text-[8px]">
                <span className="font-sans">CTRL</span>+<span className="font-sans">ENTER</span>
              </div>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-background-dark">
      <header className="shrink-0 flex items-center justify-between border-b border-white/5 bg-background-dark/80 backdrop-blur-md px-6 py-4 z-[40]">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl transition-all">
            <span className="material-symbols-outlined font-black text-white">arrow_back</span>
          </button>
          <div className="flex flex-col">
            <h2 className="text-base font-black italic uppercase text-white leading-none tracking-tighter">Despacho <span className="text-neon">Consola</span></h2>
            <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest mt-1">Terminal {selectedTable ? selectedTable.name : 'Alpha'} • ESC: Cancelar</p>
          </div>
        </div>
        <button
          onClick={() => setIsCartOpenMobile(true)}
          className="lg:hidden relative size-10 rounded-xl bg-neon/10 border border-neon/30 text-neon flex items-center justify-center shadow-neon-soft active:scale-95"
        >
          <span className="material-symbols-outlined text-2xl">shopping_cart</span>
          {cart.length > 0 && <span className="absolute -top-1 -right-1 size-5 bg-primary text-white text-[9px] font-black flex items-center justify-center rounded-full border-2 border-background-dark">{cart.length}</span>}
        </button>
      </header>

      <main className="flex flex-1 overflow-hidden relative">
        <div className="flex-1 flex flex-col min-w-0 bg-background-dark overflow-hidden">
          <div className="p-6 space-y-4 bg-black/20">
            <div className="relative group w-full">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-white/20 text-lg">search</span>
              <input
                ref={searchInputRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full h-12 pl-12 pr-5 rounded-2xl bg-white/[0.03] border border-white/5 text-[11px] font-bold text-white uppercase outline-none focus:ring-1 focus:ring-neon/30 transition-all placeholder:text-white/10"
                placeholder="BUSCAR PRODUCTO (Tipea para filtrar)..."
                autoComplete="off"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border ${activeCategory === cat ? 'bg-neon text-black border-neon shadow-neon-soft' : 'bg-white/5 border-white/5 text-white/40'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 pb-32">
            {filteredProducts.map((p, idx) => (
              <div
                key={p.id}
                onClick={() => handleAddToCart(p)}
                className={`group rounded-[2.2rem] p-3 border transition-all cursor-pointer active:scale-95 flex flex-col shadow-xl ${activeIndex === idx
                  ? 'bg-neon/5 border-neon ring-2 ring-neon/20 scale-[1.02]'
                  : 'bg-surface-dark border-white/5 hover:border-neon/30'
                  }`}
              >
                <div className="relative aspect-square rounded-[1.8rem] overflow-hidden mb-3">
                  <img src={p.image} className="size-full object-cover transition-transform group-hover:scale-110 duration-500" />
                  <div className={`absolute top-3 right-3 transition-colors ${activeIndex === idx ? 'text-neon' : 'text-white'}`}>
                    <div className="size-8 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center border border-white/10">
                      <span className="material-symbols-outlined text-lg font-black">add</span>
                    </div>
                  </div>
                </div>
                <div className="px-1">
                  <h4 className={`text-[10px] font-black uppercase italic tracking-tight leading-tight line-clamp-2 ${activeIndex === idx ? 'text-neon' : 'text-white'}`}>{p.name}</h4>
                  <p className="text-xs font-black text-white/50 mt-1.5 leading-none">${p.price.toFixed(1)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="hidden lg:flex w-[380px] bg-surface-dark border-l border-white/5 flex-col shadow-2xl z-20">
          <CartContent />
        </aside>

        <div className="fixed bottom-0 left-0 right-0 lg:hidden p-6 bg-background-dark/95 backdrop-blur-xl border-t border-white/5 z-[35] flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">{cart.length} ÍTEMS</span>
            <span className="text-2xl font-black italic-black text-neon leading-none">${total.toFixed(2)}</span>
          </div>
          <button onClick={() => setIsCartOpenMobile(true)} className="px-8 h-14 bg-neon text-black rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-neon-soft active:scale-95 transition-all flex items-center gap-3">
            <span>REVISAR PEDIDO</span>
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      </main>

      {/* SUCCESS OVERLAY */}
      {showSuccess && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-background-dark/95 backdrop-blur-xl"></div>
          <div className="relative w-full max-w-sm bg-surface-dark rounded-[3.5rem] border border-white/10 p-10 text-center shadow-[0_0_100px_rgba(74,222,128,0.1)] animate-in zoom-in-95 duration-300">
            <div className="size-24 rounded-full bg-neon/10 border border-neon/20 flex items-center justify-center text-neon mx-auto mb-8 shadow-neon-soft animate-bounce">
              <span className="material-symbols-outlined text-5xl font-black">check_circle</span>
            </div>
            <h2 className="text-3xl font-black italic-black text-white uppercase tracking-tighter mb-2">MISIÓN <span className="text-neon">CUMPLIDA</span></h2>
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.3em] mb-10">VENTA REGISTRADA CON ÉXITO</p>

            <div className="bg-black/20 rounded-3xl p-6 mb-10 space-y-3 border border-white/5">
              <div className="flex justify-between items-center text-[9px] font-black uppercase text-white/40 tracking-widest">
                <span>Monto Total</span>
                <span className="text-white text-sm">${lastOrderTotal.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <button autoFocus onClick={resetOrder} className="w-full py-5 bg-neon text-black rounded-2xl font-black text-xs uppercase tracking-[0.3em] shadow-neon-soft active:scale-95 transition-all">NUEVA OPERACIÓN [ENTER]</button>
              <button onClick={() => navigate('/orders')} className="w-full py-4 border border-white/10 text-white/40 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:text-white transition-all">VER TABLERO DESPACHO</button>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE CART OVERLAY */}
      <div className={`fixed inset-0 z-[100] transition-transform duration-500 lg:hidden ${isCartOpenMobile ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setIsCartOpenMobile(false)}></div>
        <div className="relative h-full w-full flex flex-col bg-surface-dark pt-10 rounded-t-[3rem] overflow-hidden shadow-2xl border-t border-white/10">
          <div className="px-6 flex justify-between items-center mb-2">
            <h3 className="text-xl font-black uppercase text-white italic-black tracking-tighter">PANEL DE <span className="text-neon">COBRO</span></h3>
            <button onClick={() => setIsCartOpenMobile(false)} className="size-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/40"><span className="material-symbols-outlined text-2xl">close</span></button>
          </div>
          <div className="flex-1 overflow-hidden">
            <CartContent />
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderCreation;
