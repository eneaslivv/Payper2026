
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { Product, OrderItem, Client, Table, Order } from '../types';
import { useToast } from '../components/ToastSystem';
import { useOffline } from '../contexts/OfflineContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

type PaymentMethod = 'cash' | 'card' | 'qr' | 'wallet';

const OrderCreation: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { createOrder } = useOffline();
  const [menuProducts, setMenuProducts] = useState<any[]>([]); // Real menu items from inventory
  const { profile } = useAuth();
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [isCartOpenMobile, setIsCartOpenMobile] = useState(false);

  // Keyboard Navigation State
  const [activeIndex, setActiveIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Client & Table States
  const [clients, setClients] = useState<Client[]>([]);
  const [tables, setTables] = useState<any[]>([]); // venue_nodes
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [isScanningUser, setIsScanningUser] = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [selectedTable, setSelectedTable] = useState<any | null>(null);

  // Submission States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showOrderSuccess, setShowOrderSuccess] = useState(false);
  const [lastOrderTotal, setLastOrderTotal] = useState(0);
  const [showMultipleOrderWarning, setShowMultipleOrderWarning] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');

  // Camera Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Dynamic Categories from Menu Products
  const categories = useMemo(() => {
    const cats = Array.from(new Set(menuProducts.map(p => p.category).filter(Boolean)));
    return ['Todos', ...cats.sort()];
  }, [menuProducts]);

  // Fetch Real Data
  useEffect(() => {
    if (!profile?.store_id) return;

    const fetchData = async () => {
      // 1. Fetch Clients (using is_active instead of status)
      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select('*')
        .eq('store_id', profile.store_id)
        .eq('is_active', true)
        .limit(50);

      if (clientsData) {
        // Map to Client interface - handle both name and full_name
        const mappedClients: Client[] = clientsData.map((c: any) => ({
          ...c,
          name: c.full_name || c.name || 'Sin nombre',
          orders_count: c.orders_count || 0,
          total_spent: c.total_spent || 0,
          points_balance: c.points_balance || 0,
          wallet_balance: c.wallet_balance || 0,
          is_vip: c.is_vip || false,
          notes: c.notes || []
        }));
        setClients(mappedClients);
      }

      // 2. Fetch Venue Nodes (Tables) - all tables, not filtered by status
      const { data: nodesData } = await supabase
        .from('venue_nodes')
        .select('*')
        .eq('store_id', profile.store_id)
        .in('type', ['table', 'bar']);

      if (nodesData) {
        setTables(nodesData);
      }

      // 3. Fetch Menu Products from both products and inventory_items
      const { data: productsData } = await supabase
        .from('products')
        .select(`id, name, base_price, image_url, description, category`)
        .eq('store_id', profile.store_id)
        .eq('is_visible', true)
        // .eq('active', true) // TEMPORARILY DISABLED
        .not('name', 'ilike', '[ELIMINADO]%');

      const { data: inventoryData } = await supabase
        .from('inventory_items')
        .select(`id, name, price, image_url, description, category_id, current_stock`)
        .eq('store_id', profile.store_id)
        .eq('is_menu_visible', true)
        // .eq('is_active', true) // TEMPORARILY DISABLED
        .not('name', 'ilike', '[ELIMINADO]%'); // Double check to exclude soft-deleted
      // Removed .gt('price', 0) so manual 'Menu ON' override works even for $0 items

      console.log('[OrderCreation] Data fetch results:', { products: productsData?.length, inventory: inventoryData?.length });

      let unifiedProducts: any[] = [];

      // Process Products table items
      if (productsData) {
        unifiedProducts = [...unifiedProducts, ...productsData
          .filter((p: any) => !p.name?.startsWith('[ELIMINADO]')) // Client-side filter
          .map((p: any) => ({
            id: p.id,
            name: p.name,
            price: parseFloat(p.base_price) || 0,
            image: p.image_url || '',
            category: p.category || 'General',
            description: p.description,
            sellable_type: 'product'
          }))];
      }

      // Process Inventory Items table items
      if (inventoryData) {
        // Fetch categories for inventory items
        const categoryIds = [...new Set(inventoryData.map((item: any) => item.category_id).filter(Boolean))];
        let categoriesMap: Record<string, string> = {};

        if (categoryIds.length > 0) {
          const { data: catsData } = await supabase
            .from('categories' as any)
            .select('id, name')
            .in('id', categoryIds);
          if (catsData) {
            catsData.forEach((cat: any) => { categoriesMap[cat.id] = cat.name; });
          }
        }

        unifiedProducts = [...unifiedProducts, ...inventoryData
          .filter((item: any) => !item.name?.startsWith('[ELIMINADO]')) // Client-side filter
          .map((item: any) => ({
            id: item.id,
            name: item.name,
            price: parseFloat(item.price) || 0,
            image: item.image_url || '',
            category: categoriesMap[item.category_id] || 'General',
            description: item.description,
            sellable_type: 'inventory_item'
          }))];
      }

      setMenuProducts(unifiedProducts);
    };

    fetchData();
  }, [profile?.store_id]);

  const filteredProducts = useMemo(() => {
    return menuProducts.filter(p => {
      if (!p || !p.name) return false; // Skip invalid products
      const matchesSearch = (p.name || '').toLowerCase().includes(search.toLowerCase());
      const matchesCategory = activeCategory === 'Todos' || p.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [search, activeCategory, menuProducts]);

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
      sellable_type: (product as any).sellable_type || 'inventory_item',
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
    return clients.filter(c => {
      const name = c.name || '';
      const email = c.email || '';
      return name.toLowerCase().includes(clientSearch.toLowerCase()) ||
        email.toLowerCase().includes(clientSearch.toLowerCase());
    });
  }, [clients, clientSearch]);

  const filteredTables = useMemo(() => {
    return tables.filter(t => t && (t.label || t.name)); // Only show tables with valid labels
  }, [tables]);

  const total = cart.reduce((acc, item) => acc + (item.price_unit * item.quantity), 0);

  const handleConfirmSale = async (force = false) => {
    if (cart.length === 0 || isSubmitting) return;
    if (!profile?.store_id) {
      addToast('Error', 'error', 'No se detectó el ID del local');
      return;
    }

    const tableNum = selectedTable?.name.replace('Mesa ', '') || null;

    // CHECK ACTIVE ORDERS WARNING
    if (!force && tableNum) {
      try {
        const { data: existing } = await supabase
          .from('orders')
          .select('id')
          .eq('table_number', tableNum)
          .in('status', ['pending', 'preparing'])
          .maybeSingle();

        if (existing) {
          setShowMultipleOrderWarning(true);
          return;
        }
      } catch (err) {
        console.error('Check order error', err);
      }
    }

    setIsSubmitting(true);

    try {
      // WALLET VALIDATION
      if (paymentMethod === 'wallet') {
        if (!selectedClient) {
          addToast('ERROR', 'error', 'Debes seleccionar un cliente para pagar con saldo');
          setIsSubmitting(false);
          return;
        }
        const { data: clientData, error: walletCheckError } = await supabase
          .from('clients')
          .select('wallet_balance')
          .eq('id', selectedClient.id)
          .single();

        if (walletCheckError || !clientData) {
          addToast('ERROR', 'error', 'No se pudo verificar el saldo');
          setIsSubmitting(false);
          return;
        }

        const currentBalance = clientData.wallet_balance || 0;
        if (currentBalance < total) {
          addToast('SALDO INSUFICIENTE', 'error', `Saldo: $${currentBalance.toFixed(2)} - Requerido: $${total.toFixed(2)}`);
          setIsSubmitting(false);
          return;
        }
      }

      // 1. Prepare Order Object with Client-Side ID
      const orderId = crypto.randomUUID();
      const isPaidOnCreation = paymentMethod !== 'qr';

      const newOrder: Order = {
        id: orderId,
        store_id: profile.store_id, // Ensure store_id is set
        customer: selectedClient?.name || 'Cliente Ocasional',
        client_email: selectedClient?.email, // Add if available
        table: tableNum,
        node_id: selectedTable?.id,
        status: isPaidOnCreation ? 'En Preparación' : 'Pendiente', // Auto-advance if paid
        type: selectedTable ? 'dine-in' : 'takeaway',
        paid: isPaidOnCreation,
        items: cart.map(item => ({
          ...item,
          productId: item.productId,
          inventory_items_to_deduct: [] // Backend handles this
        })),
        amount: total,
        time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
        paymentMethod: paymentMethod,
        payment_provider: paymentMethod === 'qr' ? 'mercadopago' : paymentMethod,
        payment_status: isPaidOnCreation ? 'paid' : 'pending',
        is_paid: isPaidOnCreation,
        table_number: tableNum,
        created_at: new Date().toISOString(), // Important for sorting
        lastModified: Date.now()
      };

      // 2. Delegate to OfflineContext (Handles Local Save + Sync + order_items)
      await createOrder(newOrder);

      // 3. Post-Creation Actions (Wallet Deduction)
      // Note: If offline, this step might fail or need queueing. For now, we assume online for Wallet.
      if (paymentMethod === 'wallet' && selectedClient?.id) {
        // Wait a brief moment for trigger propagation if needed, but RPC is direct
        const { data: walletResult, error: walletError } = await supabase.rpc('pay_with_wallet' as any, {
          p_client_id: selectedClient.id,
          p_amount: total,
          p_order_id: orderId
        });

        if (walletError || !(walletResult as any)?.success) {
          console.error('Wallet deduction error:', walletError);
          addToast('AVISO', 'info', 'Pedido guardado, pero falló descuento de saldo');
        } else {
          addToast('SALDO DESCONTADO', 'success', `Nuevo saldo: $${(walletResult as any)?.new_balance?.toFixed(2)}`);
        }
      }

      const successMsg = paymentMethod === 'qr'
        ? 'Esperando confirmación de pago...'
        : 'Pedido enviado a cocina';

      addToast(`PEDIDO CONFIRMADO`, 'success', successMsg);

      setLastOrderTotal(total);
      setShowOrderSuccess(true);
      setShowMultipleOrderWarning(false);
      setIsCartOpenMobile(false);

    } catch (err: any) {
      console.error('Order creation error:', err);
      addToast('Error al crear pedido', 'error', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetOrder = () => {
    setCart([]);
    setSelectedClient(null);
    setSelectedTable(null);
    setShowOrderSuccess(false);
    setSearch('');
    if (searchInputRef.current) searchInputRef.current.focus();
  };

  // --- SHORTCUT ENGINE ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent interference with modals
      if (showOrderSuccess || showClientPicker || showTablePicker || isScanningUser) return;

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
        handleConfirmSale(false);
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
  }, [filteredProducts, activeIndex, cart, search, showOrderSuccess, showClientPicker, showTablePicker]);


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
            <span className="text-[11px] font-black uppercase italic tracking-wider">{selectedTable ? (selectedTable.label || selectedTable.name) : 'ASIGNAR MESA'}</span>
          </div>
          <span className="material-symbols-outlined text-sm opacity-40">expand_more</span>
        </button>

        {/* Quick Actions - Modo de Venta */}
        <div className="flex gap-2 pt-3">
          <button
            type="button"
            onClick={() => { setSelectedClient(null); setSelectedTable(null); }}
            className={`flex-1 py-3 rounded-xl border text-[10px] font-black uppercase tracking-wide transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2 ${!selectedClient && !selectedTable ? 'bg-neon text-black border-neon' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/30'}`}
          >
            {!selectedClient && !selectedTable && <span className="material-symbols-outlined text-sm">check</span>}
            ANÓNIMO
          </button>
          <button
            type="button"
            onClick={() => { setSelectedTable(null); }}
            className={`flex-1 py-3 rounded-xl border text-[10px] font-black uppercase tracking-wide transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2 ${!selectedTable ? 'bg-blue-500 text-white border-blue-500' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/30'}`}
          >
            {!selectedTable && <span className="material-symbols-outlined text-sm">check</span>}
            PARA LLEVAR
          </button>
        </div>

        {/* Payment Method Selector */}
        <div className="pt-4 grid grid-cols-4 gap-2">
          <button
            onClick={() => setPaymentMethod('cash')}
            className={`py-3 rounded-xl border flex flex-col items-center justify-center transition-all ${paymentMethod === 'cash' ? 'bg-green-500/20 border-green-500 text-green-400' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}
          >
            <span className="material-symbols-outlined text-lg mb-1">payments</span>
            <span className="text-[8px] font-black uppercase">Efectivo</span>
          </button>
          <button
            onClick={() => setPaymentMethod('card')}
            className={`py-3 rounded-xl border flex flex-col items-center justify-center transition-all ${paymentMethod === 'card' ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}
          >
            <span className="material-symbols-outlined text-lg mb-1">credit_card</span>
            <span className="text-[8px] font-black uppercase">Tarjeta</span>
          </button>
          <button
            onClick={() => setPaymentMethod('qr')}
            className={`py-3 rounded-xl border flex flex-col items-center justify-center transition-all ${paymentMethod === 'qr' ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}
          >
            <span className="material-symbols-outlined text-lg mb-1">qr_code_2</span>
            <span className="text-[8px] font-black uppercase">QR</span>
          </button>
          <button
            onClick={() => setPaymentMethod('wallet')}
            disabled={!selectedClient}
            className={`py-3 rounded-xl border flex flex-col items-center justify-center transition-all ${!selectedClient ? 'opacity-30 cursor-not-allowed bg-white/5 border-white/5' : paymentMethod === 'wallet' ? 'bg-purple-500/20 border-purple-500 text-purple-400' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}
          >
            <span className="material-symbols-outlined text-lg mb-1">account_balance_wallet</span>
            <span className="text-[8px] font-black uppercase">Saldo</span>
          </button>
        </div>
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
                <span className="text-[9px] font-bold text-white/30 uppercase mt-0.5">${(item.price_unit || 0).toFixed(2)}</span>
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
            {selectedClient && <span className="text-[9px] font-bold text-neon uppercase bg-neon/10 px-2 py-0.5 rounded tracking-widest">FIDELIDAD ACTIVA</span>}
          </div>
          <span className="text-4xl font-black italic-black text-neon leading-none tracking-tighter">${total.toFixed(2)}</span>
        </div>
        <button
          onClick={() => handleConfirmSale(false)}
          disabled={cart.length === 0 || isSubmitting}
          className="w-full py-5 bg-neon text-black rounded-[1.5rem] font-black text-xs uppercase tracking-[0.3em] shadow-neon-soft active:scale-95 disabled:opacity-20 flex items-center justify-center gap-3 overflow-hidden relative group"
        >
          {isSubmitting ? (
            <>
              <div className="size-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
              <span>PROCESANDO...</span>
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

          <div className="flex-1 overflow-y-auto no-scrollbar p-4 grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-3 pb-32">
            {filteredProducts.map((p, idx) => (
              <div
                key={p.id}
                onClick={() => handleAddToCart(p)}
                className={`group rounded-2xl p-2 border transition-all cursor-pointer active:scale-95 flex flex-col ${activeIndex === idx
                  ? 'bg-neon/10 border-neon ring-1 ring-neon/30'
                  : 'bg-surface-dark border-white/10 hover:border-neon/30'
                  }`}
              >
                <div className="relative aspect-[4/3] rounded-xl overflow-hidden mb-2 bg-black/30">
                  {p.image ? (
                    <img src={p.image} className="size-full object-cover transition-transform group-hover:scale-105 duration-300" alt={p.name} />
                  ) : (
                    <div className="size-full flex items-center justify-center text-white/20">
                      <span className="material-symbols-outlined text-3xl">inventory_2</span>
                    </div>
                  )}
                  <div className={`absolute top-1.5 right-1.5 transition-colors ${activeIndex === idx ? 'text-neon' : 'text-white/70'}`}>
                    <div className="size-6 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center">
                      <span className="material-symbols-outlined text-sm font-black">add</span>
                    </div>
                  </div>
                </div>
                <div className="px-1 flex-1 flex flex-col justify-between">
                  <h4 className={`text-[9px] font-bold uppercase tracking-tight leading-tight line-clamp-2 ${activeIndex === idx ? 'text-neon' : 'text-white/80'}`}>{p.name}</h4>
                  <p className="text-sm font-black text-neon mt-1">${(p.price || 0).toFixed(0)}</p>
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
      {showOrderSuccess && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-background-dark/95 backdrop-blur-xl"></div>
          <div className="relative w-full max-w-sm bg-surface-dark rounded-[3.5rem] border border-white/10 p-10 text-center shadow-[0_0_100px_rgba(74,222,128,0.1)] animate-in zoom-in-95 duration-300">
            <div className="size-24 rounded-full bg-neon/10 border border-neon/20 flex items-center justify-center text-neon mx-auto mb-8 shadow-neon-soft animate-bounce">
              <span className="material-symbols-outlined text-5xl">check_circle</span>
            </div>

            <h2 className="text-3xl font-black uppercase italic tracking-tighter text-white mb-2">Misión <span className="text-neon">Cumplida</span></h2>
            <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-6">Venta registrada con éxito</p>

            <div className="w-full bg-white/5 rounded-xl p-4 mb-6 border border-white/10">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-black uppercase text-white/50">Monto Total</span>
                <span className="text-xl font-black text-white">${lastOrderTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase text-white/50">Método de Pago</span>
                <span className="text-xs font-black uppercase text-neon flex items-center gap-1">
                  {paymentMethod === 'cash' && <span className="material-symbols-outlined text-sm">payments</span>}
                  {paymentMethod === 'card' && <span className="material-symbols-outlined text-sm">credit_card</span>}
                  {paymentMethod === 'qr' && <span className="material-symbols-outlined text-sm">qr_code_2</span>}
                  {paymentMethod === 'wallet' && <span className="material-symbols-outlined text-sm">account_balance_wallet</span>}

                  {paymentMethod === 'cash' && 'Efectivo'}
                  {paymentMethod === 'card' && 'Tarjeta'}
                  {paymentMethod === 'qr' && 'Mercado Pago'}
                  {paymentMethod === 'wallet' && 'Saldo'}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <button autoFocus onClick={() => window.location.reload()} className="w-full py-4 bg-neon text-black font-black uppercase tracking-widest rounded-xl hover:bg-neon/90 transition-all shadow-neon-soft active:scale-95">
                Nueva Operación [ENTER]
              </button>
              <button onClick={() => navigate('/orders')} className="w-full py-4 border border-white/10 text-white/40 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:text-white transition-all">VER TABLERO DESPACHO</button>
            </div>
          </div>
        </div>
      )}

      {/* MULTIPLE ORDERS WARNING */}
      {showMultipleOrderWarning && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowMultipleOrderWarning(false)}></div>
          <div className="relative w-full max-w-sm bg-[#111] border border-yellow-500/30 rounded-3xl p-8 shadow-2xl transform scale-100 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="size-16 rounded-full bg-yellow-500/10 flex items-center justify-center text-yellow-500 mb-2">
                <span className="material-symbols-outlined text-3xl">warning</span>
              </div>
              <div>
                <h3 className="text-xl font-black text-white uppercase italic tracking-tight">Mesa Ocupada</h3>
                <p className="text-sm text-zinc-400 mt-2 font-medium">Ya existe un pedido activo en la <strong>{selectedTable?.name}</strong>.</p>
                <p className="text-xs text-zinc-500 mt-1">¿Deseas crear un pedido adicional para esta misma mesa?</p>
              </div>
              <div className="w-full grid grid-cols-2 gap-3 mt-4">
                <button
                  onClick={() => setShowMultipleOrderWarning(false)}
                  className="py-3 rounded-xl border border-zinc-700 text-zinc-400 font-bold uppercase text-[10px] hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleConfirmSale(true)}
                  className="py-3 rounded-xl bg-yellow-500 text-black font-black uppercase text-[10px] hover:bg-yellow-400 shadow-[0_0_20px_rgba(234,179,8,0.2)] transition-all"
                >
                  Crear Otro
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CLIENT PICKER MODAL */}
      {showClientPicker && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowClientPicker(false)}></div>
          <div className="relative w-full max-w-lg bg-surface-dark border border-white/10 rounded-[2.5rem] p-8 shadow-2xl flex flex-col max-h-[80vh] animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black uppercase italic text-white tracking-tighter">Seleccionar <span className="text-neon">Cliente</span></h3>
              <button onClick={() => setShowClientPicker(false)} className="size-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="relative mb-4">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-white/20">search</span>
              <input
                autoFocus
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                className="w-full h-12 pl-12 pr-4 rounded-xl bg-black/20 border border-white/5 text-white/80 text-sm focus:border-neon/50 outline-none"
                placeholder="Buscar por nombre o email..."
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {filteredClients.map(client => (
                <button
                  key={client.id}
                  onClick={() => { setSelectedClient(client); setShowClientPicker(false); }}
                  className={`w-full p-4 rounded-2xl flex items-center justify-between transition-all ${selectedClient?.id === client.id ? 'bg-neon/10 border border-neon/30' : 'bg-white/5 border border-transparent hover:bg-white/10'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-white/10 flex items-center justify-center text-white/50 font-bold">
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-left">
                      <p className={`text-sm font-bold ${selectedClient?.id === client.id ? 'text-neon' : 'text-white'}`}>{client.name}</p>
                      <p className="text-[10px] text-white/40">{client.email}</p>
                    </div>
                  </div>
                  {selectedClient?.id === client.id && <span className="material-symbols-outlined text-neon">check</span>}
                </button>
              ))}
              {filteredClients.length === 0 && (
                <div className="py-10 text-center text-white/20">
                  <span className="material-symbols-outlined text-4xl mb-2">person_off</span>
                  <p className="text-xs uppercase tracking-widest">No se encontraron clientes</p>
                </div>
              )}
            </div>
            <div className="pt-4 mt-4 border-t border-white/5">
              <button
                onClick={() => { setSelectedClient(null); setShowClientPicker(false); }}
                className="w-full py-3 rounded-xl border border-white/10 text-white/40 font-bold uppercase text-xs hover:text-white hover:border-white/30 transition-all"
              >
                Continuar como Cliente General
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TABLE PICKER MODAL */}
      {showTablePicker && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowTablePicker(false)}></div>
          <div className="relative w-full max-w-4xl bg-surface-dark border border-white/10 rounded-[2.5rem] p-8 shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black uppercase italic text-white tracking-tighter">Asignar <span className="text-accent">Mesa</span></h3>
              <button onClick={() => setShowTablePicker(false)} className="size-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10"><span className="material-symbols-outlined">close</span></button>
            </div>

            <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-1">
              {filteredTables.map(table => (
                <button
                  key={table.id}
                  onClick={() => { setSelectedTable(table); setShowTablePicker(false); }}
                  className={`aspect-square rounded-2xl border flex flex-col items-center justify-center p-4 transition-all active:scale-95 ${selectedTable?.id === table.id
                    ? 'bg-neon/20 border-neon text-neon shadow-neon-soft'
                    : table.status === 'occupied'
                      ? 'bg-red-500/10 border-red-500/30 text-red-400'
                      : 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10 hover:border-neon/30'
                    }`}
                >
                  <span className="material-symbols-outlined text-3xl mb-2">{table.type === 'bar' ? 'local_bar' : 'table_restaurant'}</span>
                  <span className="text-sm font-black uppercase tracking-tight">{table.label || table.name || 'Sin nombre'}</span>
                  <span className={`text-[9px] font-bold mt-1 uppercase ${table.status === 'occupied' ? 'text-red-400' : 'text-green-400'}`}>
                    {table.status === 'occupied' ? 'Ocupada' : 'Libre'}
                  </span>
                </button>
              ))}
            </div>

            <div className="pt-4 mt-4 border-t border-white/5">
              <button
                onClick={() => { setSelectedTable(null); setShowTablePicker(false); }}
                className="w-full py-3 rounded-xl border border-white/10 text-white/40 font-bold uppercase text-xs hover:text-white hover:border-white/30 transition-all"
              >
                Sin Mesa Asignada (Para Llevar)
              </button>
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
}; // End Component

export default OrderCreation;
