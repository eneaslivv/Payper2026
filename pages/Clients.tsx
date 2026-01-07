
import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Client, LoyaltyTransaction } from '../types';

interface TimelineEvent {
  type: 'order' | 'wallet' | 'loyalty' | 'note' | 'login';
  label: string;
  detail: string;
  timestamp: string;
  icon?: string;
}

const Clients: React.FC = () => {
  const { profile } = useAuth();
  const [clients, setClients] = useState<Client[]>([]); // Start empty, no mocks
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'blocked'>('all');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);

  useEffect(() => {
    if (profile?.store_id) {
      fetchClients();

      // SUSCRIPCIÓN REALTIME - Nuevos clientes aparecen mágicamente 🪄
      const channel = supabase
        .channel('new-clients-alert')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'clients', filter: `store_id=eq.${profile.store_id}` },
          (payload) => {
            console.log("[Clients] Nuevo cliente detectado!", payload.new);
            const newClient = payload.new as any;
            setClients((prev) => [{
              id: newClient.id,
              name: newClient.name || 'Sin Nombre',
              email: newClient.email || 'No Email',
              join_date: new Date(newClient.created_at).toLocaleDateString(),
              last_visit: '-',
              total_spent: 0,
              orders_count: 0,
              points_balance: newClient.loyalty_points || 0,
              status: 'active' as const,
              is_vip: false,
              notes: []
            }, ...prev]);
          }
        )
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [profile?.store_id]);

  const fetchClients = async () => {
    try {
      console.log('[Clients] Fetching clients for Store ID:', profile?.store_id);

      // Get current session to verify auth
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[Clients] Current session user:', session?.user?.email);

      // 1. Fetch all clients for this store
      const { data: clientsData, error: clientsError } = await (supabase as any)
        .from('clients')
        .select('*')
        .eq('store_id', profile?.store_id as string);

      console.log('[Clients] Raw query result:', { count: clientsData?.length, error: clientsError });

      if (clientsError) throw clientsError;

      // 2. Fetch all orders for this store to aggregate metrics
      // Use client_id to match orders to clients
      let ordersData: any[] = [];
      try {
        const { data, error: ordersError } = await supabase
          .from('orders')
          .select('client_id, total_amount, created_at')
          .eq('store_id', profile?.store_id as string);

        if (!ordersError && data) {
          ordersData = data;
        }
      } catch (orderErr) {
        console.warn('[Clients] Orders fetch failed (non-blocking):', orderErr);
      }

      // Map DB to UI Type with real metrics
      const realClients: Client[] = (clientsData || []).map((c: any) => {
        // Match orders by client_id instead of name
        const clientOrders = ordersData.filter(o => o.client_id === c.id);

        const totalSpent = clientOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
        const ordersCount = clientOrders.length;
        const lastOrder = clientOrders.length > 0
          ? clientOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
          : null;

        return {
          id: c.id,
          name: c.name || c.full_name || 'Sin Nombre',
          email: c.email || 'No Email',
          join_date: new Date(c.created_at).toLocaleDateString(),
          last_visit: lastOrder ? new Date(lastOrder.created_at).toLocaleDateString() : '-',
          total_spent: totalSpent,
          orders_count: ordersCount,
          points_balance: c.loyalty_points || 0,
          wallet_balance: c.wallet_balance || 0, // Saldo de wallet
          status: 'active', // Defaulting to active unless blocked field exists
          is_vip: totalSpent > 1000, // Dynamic VIP status based on LTV
          notes: []
        };
      });

      console.log('[Clients] Mapped clients:', realClients.length);
      setClients(realClients);
    } catch (e) {
      console.error("[Clients] Error fetching clients:", e);
    }
  };

  // Invitation State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteTab, setInviteTab] = useState<'email' | 'link'>('email');
  const [inviteEmail, setInviteEmail] = useState('');
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [inviteSentSuccess, setInviteSentSuccess] = useState(false);
  const [isLinkCopied, setIsLinkCopied] = useState(false);

  // Wallet Modal State
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletClient, setWalletClient] = useState<Client | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletAmount, setWalletAmount] = useState('');
  const [walletDescription, setWalletDescription] = useState('');
  const [isLoadingWallet, setIsLoadingWallet] = useState(false);
  const [walletTransactions, setWalletTransactions] = useState<any[]>([]);
  const [walletSource, setWalletSource] = useState<'cash' | 'digital' | 'system'>('cash');
  const [walletPaymentMethod, setWalletPaymentMethod] = useState('cash');

  // Points Modal State
  const [showPointsModal, setShowPointsModal] = useState(false);
  const [pointsClient, setPointsClient] = useState<Client | null>(null);
  const [pointsAmount, setPointsAmount] = useState('');
  const [pointsDescription, setPointsDescription] = useState('');
  const [isLoadingPoints, setIsLoadingPoints] = useState(false);

  // Gift Modal State
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [giftClient, setGiftClient] = useState<Client | null>(null);
  const [giftName, setGiftName] = useState('');
  const [giftDescription, setGiftDescription] = useState('');
  const [isLoadingGift, setIsLoadingGift] = useState(false);

  const inviteLink = "https://payper.app/join/node-alpha-001";

  const selectedClient = useMemo(() =>
    clients.find(c => c.id === selectedClientId),
    [clients, selectedClientId]);

  // Timeline Fetching
  useEffect(() => {
    const fetchTimeline = async () => {
      if (!selectedClientId) {
        setTimelineEvents([]);
        return;
      }

      setIsTimelineLoading(true);
      try {
        const events: TimelineEvent[] = [];

        // 1. Fetch Orders
        const { data: orders } = await (supabase as any)
          .from('orders')
          .select('id, created_at, total_amount, status, payment_method, order_number')
          .eq('client_id', selectedClientId)
          .order('created_at', { ascending: false })
          .limit(10);

        if (orders) {
          orders.forEach(o => {
            events.push({
              type: 'order',
              label: o.status === 'Entregado' ? 'PEDIDO ENTREGADO' : 'PEDIDO REALIZADO',
              detail: `Ord #${o.order_number || o.id.slice(0, 4)} — $${o.total_amount.toFixed(2)} (${o.payment_method})`,
              timestamp: o.created_at,
              icon: 'shopping_bag'
            });
          });
        }

        // 2. Fetch Wallet Transactions
        const { data: walletTx } = await (supabase as any)
          .from('wallet_transactions')
          .select('*')
          .eq('wallet_id', selectedClientId)
          .order('created_at', { ascending: false })
          .limit(10);

        if (walletTx) {
          walletTx.forEach(tx => {
            events.push({
              type: 'wallet',
              label: tx.amount >= 0 ? 'CARGA DE SALDO' : 'PAGO CON WALLET',
              detail: `${tx.description || 'Movimiento de saldo'} — ${tx.amount >= 0 ? '+' : ''}$${Math.abs(tx.amount).toFixed(2)}`,
              timestamp: tx.created_at,
              icon: 'account_balance_wallet'
            });
          });
        }

        // 3. Fetch Loyalty Transactions (NEW - from ledger)
        const { data: loyaltyTx } = await (supabase as any)
          .from('loyalty_transactions')
          .select('*')
          .eq('client_id', selectedClientId)
          .eq('is_rolled_back', false)
          .order('created_at', { ascending: false })
          .limit(15);

        if (loyaltyTx) {
          loyaltyTx.forEach((tx: any) => {
            let label = 'ACTIVIDAD DE PUNTOS';
            let icon = 'stars';

            if (tx.type === 'earn') {
              label = 'PUNTOS GANADOS';
              icon = 'add_circle';
            } else if (tx.type === 'burn') {
              label = 'PUNTOS CANJEADOS';
              icon = 'redeem';
            } else if (tx.type === 'gift') {
              label = 'REGALO OTORGADO';
              icon = 'card_giftcard';
            } else if (tx.type === 'adjustment') {
              label = tx.points >= 0 ? 'AJUSTE DE PUNTOS (+)' : 'AJUSTE DE PUNTOS (-)';
              icon = 'tune';
            } else if (tx.type === 'rollback') {
              label = 'REEMBOLSO DE PUNTOS';
              icon = 'undo';
            }

            events.push({
              type: 'loyalty',
              label,
              detail: `${tx.description || tx.type} — ${tx.points >= 0 ? '+' : ''}${tx.points} pts`,
              timestamp: tx.created_at,
              icon
            });
          });
        }

        // 4. Notes (from Client object)
        const currentClient = clients.find(c => c.id === selectedClientId);
        if (currentClient && currentClient.notes) {
          currentClient.notes.forEach(n => {
            events.push({
              type: 'note',
              label: 'NOTA INTERNA',
              detail: `"${n.content}" — ${n.staff_name}`,
              timestamp: n.timestamp,
              icon: 'edit_note'
            });
          });
        }

        // 4. Sort all by timestamp descending
        events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        setTimelineEvents(events);
      } catch (err) {
        console.error("Error fetching timeline:", err);
      } finally {
        setIsTimelineLoading(false);
      }
    };

    fetchTimeline();
  }, [selectedClientId, clients]);

  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.email.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [clients, search, statusFilter]);

  const toggleBlockStatus = (id: string) => {
    setClients(prev => prev.map(c =>
      c.id === id ? { ...c, status: c.status === 'active' ? 'blocked' : 'active' } : c
    ));
  };

  const handleSendInvite = () => {
    if (!inviteEmail) return;
    setIsSendingInvite(true);
    // Simulación de envío
    setTimeout(() => {
      setIsSendingInvite(false);
      setInviteSentSuccess(true);
      setTimeout(() => {
        setInviteSentSuccess(false);
        setInviteEmail('');
        setShowInviteModal(false);
      }, 2000);
    }, 1500);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setIsLinkCopied(true);
    setTimeout(() => setIsLinkCopied(false), 2000);
  };

  // Wallet Functions
  const openWalletModal = async (client: Client) => {
    setWalletClient(client);
    setShowWalletModal(true);
    setIsLoadingWallet(true);
    setWalletAmount('');
    setWalletDescription('');

    try {
      // El balance ya está en clients.wallet_balance, no necesitamos query separada
      setWalletBalance(client.wallet_balance || 0);

      // Fetch recent transactions
      const { data: txData } = await supabase
        .from('wallet_transactions')
        .select('*, staff:staff_id(full_name)')
        .eq('wallet_id', client.id)
        .order('created_at', { ascending: false })
        .limit(10);

      setWalletTransactions(txData || []);
    } catch (e) {
      console.error('Error fetching wallet:', e);
    } finally {
      setIsLoadingWallet(false);
    }
  };

  const handleAddBalance = async () => {
    if (!walletClient || !walletAmount || parseFloat(walletAmount) <= 0) return;

    setIsLoadingWallet(true);
    try {
      const { data, error } = await (supabase.rpc as any)('admin_add_balance', {
        p_user_id: walletClient.id,
        p_amount: parseFloat(walletAmount),
        p_description: walletDescription || 'Carga de saldo desde panel admin',
        p_source: walletSource,
        p_payment_method: walletPaymentMethod
      });

      if (error) throw error;

      const newBalance = data.new_balance;
      setWalletBalance(newBalance);

      // Actualizar el cliente en la lista local
      setClients(prev => prev.map(c =>
        c.id === walletClient.id ? { ...c, wallet_balance: newBalance } : c
      ));
      setWalletClient({ ...walletClient, wallet_balance: newBalance });
      setWalletAmount('');
      setWalletDescription('');

      // Refresh transactions (from wallet_ledger now)
      const { data: txData } = await (supabase as any)
        .from('wallet_ledger')
        .select('*, performer:profiles!performed_by(full_name)')
        .eq('wallet_id', (walletClient as any).wallet_id || walletClient.id) // Fallback if wallet_id isn't directly the client_id
        .order('created_at', { ascending: false })
        .limit(10);

      setWalletTransactions(txData || []);
    } catch (e: any) {
      console.error('Error adding balance:', e);
      alert('Error al agregar saldo: ' + e.message);
    } finally {
      setIsLoadingWallet(false);
    }
  };

  // Points Functions
  const openPointsModal = (client: Client) => {
    setPointsClient(client);
    setShowPointsModal(true);
    setPointsAmount('');
    setPointsDescription('');
  };

  const handleAddPoints = async () => {
    if (!pointsClient || !pointsAmount || parseInt(pointsAmount) <= 0) return;

    setIsLoadingPoints(true);
    try {
      const { data, error } = await (supabase.rpc as any)('admin_add_points', {
        target_client_id: pointsClient.id,
        points_amount: parseInt(pointsAmount),
        staff_id: profile?.id,
        description: pointsDescription || 'Puntos agregados manualmente'
      });

      if (error) throw error;

      // Update local state
      setClients(prev => prev.map(c =>
        c.id === pointsClient.id ? { ...c, points_balance: data } : c
      ));

      setShowPointsModal(false);
      setPointsAmount('');
      setPointsDescription('');
    } catch (e: any) {
      console.error('Error adding points:', e);
      alert('Error al agregar puntos: ' + e.message);
    } finally {
      setIsLoadingPoints(false);
    }
  };

  // Gift Functions
  const openGiftModal = (client: Client) => {
    setGiftClient(client);
    setShowGiftModal(true);
    setGiftName('');
    setGiftDescription('');
  };

  const handleGrantGift = async () => {
    if (!giftClient || !giftName) return;

    setIsLoadingGift(true);
    try {
      const { data, error } = await (supabase.rpc as any)('admin_grant_gift', {
        target_client_id: giftClient.id,
        gift_name: giftName,
        gift_description: giftDescription || 'Regalo otorgado',
        staff_id: profile?.id
      });

      if (error) throw error;

      setShowGiftModal(false);
      setGiftName('');
      setGiftDescription('');
      alert('¡Regalo otorgado exitosamente!');
    } catch (e: any) {
      console.error('Error granting gift:', e);
      alert('Error al otorgar regalo: ' + e.message);
    } finally {
      setIsLoadingGift(false);
    }
  };

  return (
    <div className="p-6 md:p-10 space-y-10 max-w-[1400px] mx-auto animate-in fade-in duration-700 pb-32">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-neon/60 font-bold text-[10px] uppercase tracking-[0.3em]">
            <span className="size-1 rounded-full bg-neon shadow-neon-soft"></span>
            Customer Relations Hub
          </div>
          <h1 className="text-4xl italic-black tracking-tighter text-text-main dark:text-white uppercase leading-none">
            Directorio de <span className="text-neon/80">Clientes</span>
          </h1>
          <p className="text-text-secondary text-xs font-semibold opacity-50 uppercase tracking-widest mt-2">Expedientes de usuarios y trazabilidad de consumo</p>
        </div>

        <button
          onClick={() => setShowInviteModal(true)}
          className="group px-6 py-3 rounded-xl bg-neon text-black font-black text-[10px] uppercase tracking-widest shadow-neon-soft transition-all hover:scale-105 active:scale-95 flex items-center gap-3"
        >
          <span className="material-symbols-outlined text-lg group-hover:rotate-12 transition-transform">person_add</span>
          Invitar Miembro
        </button>
      </header>

      {/* Filtros Tácticos */}
      <div className="flex flex-col xl:flex-row justify-between gap-6 items-center">
        <div className="flex bg-white dark:bg-surface-dark p-1 rounded-xl border border-black/[0.04] dark:border-white/[0.04] shadow-soft w-full xl:w-auto overflow-x-auto no-scrollbar">
          <FilterTab active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>Todos</FilterTab>
          <FilterTab active={statusFilter === 'active'} onClick={() => setStatusFilter('active')}>Activos</FilterTab>
          <FilterTab active={statusFilter === 'blocked'} onClick={() => setStatusFilter('blocked')}>Bloqueados</FilterTab>
        </div>
        <div className="relative w-full max-w-md group">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary opacity-50 group-focus-within:text-neon transition-colors text-lg">search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 pl-11 pr-5 rounded-xl border border-black/[0.04] dark:border-white/[0.04] bg-white dark:bg-surface-dark outline-none focus:ring-2 focus:ring-neon/10 text-[11px] font-bold placeholder:text-text-secondary/50 shadow-soft transition-all uppercase tracking-widest"
            placeholder="Buscar por Nombre o Email..."
          />
        </div>
      </div>

      {/* Listado Principal */}
      <div className="bg-white dark:bg-surface-dark rounded-2xl subtle-border shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-black/[0.01] dark:bg-white/[0.01] border-b border-black/[0.02] dark:border-white/[0.02]">
                <th className="px-8 py-5 text-[9px] font-bold uppercase text-text-secondary tracking-widest">Identidad</th>
                <th className="px-8 py-5 text-[9px] font-bold uppercase text-text-secondary tracking-widest">Registro</th>
                <th className="px-8 py-5 text-[9px] font-bold uppercase text-text-secondary tracking-widest text-center">Frecuencia</th>
                <th className="px-8 py-5 text-[9px] font-bold uppercase text-text-secondary tracking-widest text-center">LTV (Gasto)</th>
                <th className="px-8 py-5 text-[9px] font-bold uppercase text-text-secondary tracking-widest text-center">Estatus</th>
                <th className="px-8 py-5 text-[9px] font-bold uppercase text-text-secondary tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.02] dark:divide-white/[0.02]">
              {filteredClients.map(client => (
                <tr
                  key={client.id}
                  onClick={() => setSelectedClientId(client.id)}
                  className="hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition-colors cursor-pointer group"
                >
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="size-10 rounded-xl bg-neon/10 text-neon flex items-center justify-center font-black text-sm border border-neon/5 italic uppercase">
                        {client.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-[12px] font-bold dark:text-white uppercase italic tracking-tight">{client.name}</p>
                          {client.is_vip && <span className="text-[8px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-md font-bold uppercase tracking-widest">VIP</span>}
                        </div>
                        <p className="text-[10px] text-text-secondary font-semibold opacity-40 uppercase tracking-tighter">{client.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-[11px] font-bold dark:text-white/60">{client.join_date}</td>
                  <td className="px-8 py-5 text-center text-[11px] font-bold dark:text-white">{client.orders_count} ord.</td>
                  <td className="px-8 py-5 text-center text-[11px] font-black text-neon">${client.total_spent.toFixed(2)}</td>
                  <td className="px-8 py-5 text-center">
                    <span className={`px-2 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-widest border ${client.status === 'active' ? 'bg-neon/5 text-neon border-neon/10' : 'bg-primary/5 text-primary border-primary/10'}`}>
                      {client.status === 'active' ? 'Activo' : 'Bloqueado'}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); openWalletModal(client); }}
                        className="size-8 rounded-lg bg-accent/10 text-accent hover:bg-accent hover:text-black transition-all flex items-center justify-center"
                        title="Gestionar Saldo"
                      >
                        <span className="material-symbols-outlined text-sm">account_balance_wallet</span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); openPointsModal(client); }}
                        className="size-8 rounded-lg bg-neon/10 text-neon hover:bg-neon hover:text-black transition-all flex items-center justify-center"
                        title="Agregar Puntos"
                      >
                        <span className="material-symbols-outlined text-sm">stars</span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); openGiftModal(client); }}
                        className="size-8 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all flex items-center justify-center"
                        title="Otorgar Regalo"
                      >
                        <span className="material-symbols-outlined text-sm">redeem</span>
                      </button>
                      <button className="text-text-secondary hover:text-neon transition-colors">
                        <span className="material-symbols-outlined text-lg">arrow_forward</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expediente del Cliente (Drawer Lateral) */}
      <div className={`fixed inset-y-0 right-0 z-[150] w-full max-w-[550px] bg-white dark:bg-surface-dark border-l border-black/[0.04] dark:border-white/[0.04] shadow-2xl transition-transform duration-500 ease-out flex flex-col ${selectedClientId ? 'translate-x-0' : 'translate-x-full'}`}>
        {selectedClient && (
          <>
            <div className="p-8 flex justify-between items-start border-b border-black/[0.02] dark:border-white/[0.02]">
              <div className="flex gap-5 items-center">
                <div className="size-16 rounded-2xl bg-neon/10 text-neon flex items-center justify-center font-black text-2xl italic border border-neon/5 shadow-neon-soft">
                  {selectedClient.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-2xl font-black italic-black dark:text-white uppercase tracking-tighter leading-none">{selectedClient.name}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase border ${selectedClient.status === 'active' ? 'bg-neon/5 text-neon border-neon/10' : 'bg-primary/5 text-primary border-primary/10'}`}>{selectedClient.status}</span>
                    <span className="text-[10px] text-text-secondary font-bold uppercase opacity-40">ID: {selectedClient.id}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedClientId(null)} className="size-10 rounded-xl bg-black/[0.03] dark:bg-white/[0.03] flex items-center justify-center text-text-secondary hover:text-primary transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-10 no-scrollbar pb-40">
              {/* Resumen Operativo */}
              <div className="grid grid-cols-2 gap-4">
                <MetricBlock label="Total Gastado" value={`$${selectedClient.total_spent.toFixed(2)}`} icon="payments" color="text-neon" />
                <MetricBlock label="Puntos de Inteligencia" value={selectedClient.points_balance.toString()} icon="loyalty" color="text-accent" />
                <MetricBlock label="Última Incursión" value={selectedClient.last_visit} icon="schedule" />
                <MetricBlock label="Ticket Promedio" value={`$${(selectedClient.total_spent / selectedClient.orders_count).toFixed(2)}`} icon="calculate" />
              </div>

              {/* Acciones de Fidelidad */}
              <div className="bg-black/[0.01] dark:bg-white/[0.01] p-6 rounded-3xl border border-black/[0.03] dark:border-white/[0.03] space-y-6">
                <div className="flex justify-between items-center border-b border-black/[0.02] dark:border-white/[0.02] pb-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest dark:text-white italic">Protocolo de Fidelización</h4>
                  <button className="text-[9px] font-bold text-accent uppercase flex items-center gap-1"><span className="material-symbols-outlined text-sm">history</span> Ver Transacciones</button>
                </div>
                <div className="flex gap-3">
                  <button className="flex-1 py-3 rounded-xl bg-white dark:bg-white/5 border border-black/[0.05] dark:border-white/[0.05] text-[10px] font-bold uppercase text-text-main dark:text-white hover:border-neon transition-all">Sumar Puntos</button>
                  <button className="flex-1 py-3 rounded-xl bg-white dark:bg-white/5 border border-black/[0.05] dark:border-white/[0.05] text-[10px] font-bold uppercase text-text-main dark:text-white hover:border-accent transition-all">Otorgar Regalo</button>
                </div>
              </div>

              {/* Historial de Actividad (Mock) */}
              <div className="space-y-6">
                <h4 className="text-[10px] font-black uppercase tracking-widest dark:text-white italic border-b border-black/[0.02] pb-4">Timeline Inmutable</h4>
                <div className="space-y-6 relative before:absolute before:inset-y-0 before:left-3 before:w-px before:bg-black/[0.05] dark:before:bg-white/[0.05]">
                  {isTimelineLoading ? (
                    <p className="text-[10px] text-text-secondary pl-8">Cargando historial...</p>
                  ) : timelineEvents.length > 0 ? (
                    timelineEvents.map((event, idx) => (
                      <ActivityItem
                        key={`${event.type}-${idx}`}
                        label={event.label}
                        time={new Date(event.timestamp).toLocaleString()}
                        detail={event.detail}
                        isNote={event.type === 'note'}
                        icon={event.icon}
                      />
                    ))
                  ) : (
                    <p className="text-[10px] text-text-secondary pl-8">No hay actividad reciente.</p>
                  )}
                </div>
              </div>

              {/* Notas del Staff */}
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase text-text-secondary ml-1 opacity-60">Observaciones del Comando (Interno)</label>
                <textarea className="w-full h-32 p-5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.05] border border-black/[0.05] dark:border-white/[0.05] text-[11px] font-bold outline-none focus:ring-2 focus:ring-neon/10 transition-all" placeholder="Añadir contexto sobre este cliente..."></textarea>
              </div>
            </div>

            {/* Acciones Críticas (Fijo al final) */}
            <div className="absolute bottom-0 left-0 right-0 p-8 bg-white dark:bg-surface-dark border-t border-black/[0.05] flex gap-4 backdrop-blur-md">
              <button
                onClick={() => toggleBlockStatus(selectedClient.id)}
                className={`flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${selectedClient.status === 'active' ? 'bg-primary/10 text-primary hover:bg-primary hover:text-white' : 'bg-neon/10 text-neon hover:bg-neon hover:text-black'}`}
              >
                {selectedClient.status === 'active' ? 'Bloquear Objetivo' : 'Desbloquear Objetivo'}
              </button>
              <button className="flex-1 py-4 rounded-2xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.05] text-[10px] font-black uppercase tracking-widest text-text-secondary hover:text-primary">Eliminar Registro</button>
            </div>
          </>
        )}
      </div>

      {/* Backdrop for Drawer */}
      {selectedClientId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[140]" onClick={() => setSelectedClientId(null)}></div>
      )}

      {/* MODAL: INVITAR MIEMBRO */}
      {showInviteModal && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-sm" onClick={() => setShowInviteModal(false)}></div>
          <div className="relative bg-[#0D0F0D] border border-white/10 w-full max-w-md p-8 rounded-[2rem] shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-start mb-6">
              <div className="space-y-1">
                <h3 className="text-2xl font-black uppercase text-white italic-black tracking-tighter">INVITAR <span className="text-neon">MIEMBRO</span></h3>
                <p className="text-[9px] font-bold text-text-secondary uppercase tracking-widest opacity-60">Reclutamiento de Clientes</p>
              </div>
              <button onClick={() => setShowInviteModal(false)} className="size-8 rounded-full bg-white/5 flex items-center justify-center text-white/30 hover:text-white">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="flex bg-white/5 p-1 rounded-xl mb-8">
              <button
                onClick={() => setInviteTab('email')}
                className={`flex-1 py-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${inviteTab === 'email' ? 'bg-neon text-black shadow-neon-soft' : 'text-white/40 hover:text-white'}`}
              >
                Protocolo Email
              </button>
              <button
                onClick={() => setInviteTab('link')}
                className={`flex-1 py-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${inviteTab === 'link' ? 'bg-neon text-black shadow-neon-soft' : 'text-white/40 hover:text-white'}`}
              >
                Enlace Público
              </button>
            </div>

            {inviteTab === 'email' && (
              <div className="space-y-6">
                {inviteSentSuccess ? (
                  <div className="py-10 flex flex-col items-center justify-center text-center animate-in fade-in">
                    <div className="size-16 rounded-full bg-neon/10 border border-neon/30 text-neon flex items-center justify-center mb-4">
                      <span className="material-symbols-outlined text-3xl">mark_email_read</span>
                    </div>
                    <h4 className="text-lg font-black text-white uppercase italic">Invitación Enviada</h4>
                    <p className="text-[9px] font-bold text-text-secondary uppercase mt-2 max-w-[200px]">El usuario recibirá instrucciones de acceso en breve.</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase text-text-secondary tracking-widest ml-1">Email del Destinatario</label>
                      <input
                        autoFocus
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        className="w-full h-12 px-5 rounded-2xl bg-white/[0.03] border border-white/10 text-[11px] font-bold text-white uppercase outline-none focus:ring-1 focus:ring-neon/30 placeholder:text-white/10 transition-all"
                        placeholder="CLIENTE@EMAIL.COM"
                      />
                    </div>
                    <button
                      onClick={handleSendInvite}
                      disabled={!inviteEmail || isSendingInvite}
                      className="w-full py-4 bg-white text-black rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                    >
                      {isSendingInvite ? (
                        <>
                          <div className="size-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                          <span>Enviando...</span>
                        </>
                      ) : (
                        <>
                          <span>Enviar Invitación</span>
                          <span className="material-symbols-outlined text-sm">send</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            )}

            {inviteTab === 'link' && (
              <div className="space-y-6 animate-in slide-in-from-right-2">
                <div className="p-6 bg-white/[0.03] border border-dashed border-white/10 rounded-2xl text-center space-y-4">
                  <div className="size-12 mx-auto bg-white/5 rounded-xl flex items-center justify-center text-white/20">
                    <span className="material-symbols-outlined text-2xl">qr_code_2</span>
                  </div>
                  <p className="text-[9px] font-bold text-text-secondary uppercase leading-relaxed max-w-[240px] mx-auto">Comparte este enlace único para que los clientes se registren directamente en este nodo.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase text-text-secondary tracking-widest ml-1">Enlace de Reclutamiento</label>
                  <div className="flex gap-2">
                    <div className="flex-1 h-12 px-5 rounded-2xl bg-black/40 border border-white/10 flex items-center text-[10px] font-mono text-neon truncate">
                      {inviteLink}
                    </div>
                    <button
                      onClick={handleCopyLink}
                      className={`size-12 rounded-2xl flex items-center justify-center border transition-all ${isLinkCopied ? 'bg-neon border-neon text-black' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                    >
                      <span className="material-symbols-outlined text-lg">{isLinkCopied ? 'check' : 'content_copy'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: WALLET / SALDO */}
      {showWalletModal && walletClient && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-sm" onClick={() => setShowWalletModal(false)}></div>
          <div className="relative bg-[#0D0F0D] border border-white/10 w-full max-w-lg p-8 rounded-[2rem] shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-start mb-6">
              <div className="space-y-1">
                <h3 className="text-2xl font-black uppercase text-white italic-black tracking-tighter">GESTIÓN DE <span className="text-accent">SALDO</span></h3>
                <p className="text-[9px] font-bold text-text-secondary uppercase tracking-widest opacity-60">{walletClient.name} — {walletClient.email}</p>
              </div>
              <button onClick={() => setShowWalletModal(false)} className="size-8 rounded-full bg-white/5 flex items-center justify-center text-white/30 hover:text-white">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Current Balance */}
            <div className="bg-accent/10 border border-accent/20 rounded-2xl p-6 mb-6 text-center">
              <p className="text-[9px] font-black uppercase text-accent/60 tracking-widest mb-1">Saldo Actual</p>
              <p className="text-4xl font-black italic text-accent">${walletBalance.toFixed(2)}</p>
            </div>

            {/* Add Balance Form */}
            <div className="space-y-4 mb-6">
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-text-secondary tracking-widest ml-1">Monto a Cargar ($)</label>
                <input
                  type="number"
                  value={walletAmount}
                  onChange={e => setWalletAmount(e.target.value)}
                  min="0.01"
                  step="0.01"
                  className="w-full h-14 px-6 rounded-2xl bg-white/[0.03] border border-white/10 text-xl font-black text-accent text-center outline-none focus:ring-1 focus:ring-accent/30 placeholder:text-white/10 transition-all"
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-text-secondary tracking-widest ml-1">Origen y Método</label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={walletSource}
                    onChange={(e) => setWalletSource(e.target.value as any)}
                    className="h-12 px-4 rounded-xl bg-white/[0.03] border border-white/10 text-[10px] font-bold text-white uppercase outline-none focus:ring-1 focus:ring-accent/30"
                  >
                    <option value="cash">Efectivo (Local)</option>
                    <option value="digital">Digital (App)</option>
                    <option value="system">Sistema (Ajuste)</option>
                  </select>
                  <select
                    value={walletPaymentMethod}
                    onChange={(e) => setWalletPaymentMethod(e.target.value)}
                    className="h-12 px-4 rounded-xl bg-white/[0.03] border border-white/10 text-[10px] font-bold text-white uppercase outline-none focus:ring-1 focus:ring-accent/30"
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Tarjeta</option>
                    <option value="qr">QR</option>
                    <option value="transfer">Transferencia</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-text-secondary tracking-widest ml-1">Motivo / Referencia (Opcional)</label>
                <input
                  type="text"
                  value={walletDescription}
                  onChange={e => setWalletDescription(e.target.value)}
                  className="w-full h-12 px-5 rounded-2xl bg-white/[0.03] border border-white/10 text-[11px] font-bold text-white uppercase outline-none focus:ring-1 focus:ring-accent/30 placeholder:text-white/10 transition-all"
                  placeholder="Ej: Carga efectivo caja 1"
                />
              </div>
            </div>

            <button
              onClick={handleAddBalance}
              disabled={isLoadingWallet || !walletAmount || parseFloat(walletAmount) <= 0}
              className="w-full py-4 bg-accent text-black rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 mb-6"
            >
              {isLoadingWallet ? (
                <>
                  <div className="size-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg">add_circle</span>
                  <span>Confirmar Carga de ${walletAmount || '0.00'}</span>
                </>
              )}
            </button>

            {/* Recent Transactions */}
            {walletTransactions.length > 0 && (
              <div className="space-y-3">
                <p className="text-[9px] font-black uppercase text-text-secondary tracking-widest">Últimas Transacciones</p>
                <div className="max-h-40 overflow-y-auto space-y-2 no-scrollbar">
                  {walletTransactions.map((tx: any) => (
                    <div key={tx.id} className="flex justify-between items-center p-3 bg-white/[0.02] rounded-xl border border-white/5">
                      <div>
                        <p className="text-[10px] font-bold text-white uppercase">{tx.description || tx.type}</p>
                        <p className="text-[8px] text-white/30">{new Date(tx.created_at).toLocaleString()}</p>
                      </div>
                      <span className={`text-sm font-black ${tx.amount >= 0 ? 'text-neon' : 'text-primary'}`}>
                        {tx.amount >= 0 ? '+' : ''}{tx.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* POINTS MODAL */}
      {showPointsModal && pointsClient && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-[#141714] border border-white/10 rounded-3xl w-full max-w-md p-8 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-lg font-black text-white uppercase italic tracking-tight">Agregar Puntos</h3>
                <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">{pointsClient.name}</p>
              </div>
              <button onClick={() => setShowPointsModal(false)} className="size-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-[9px] font-black uppercase text-white/30 tracking-widest mb-2 block">Cantidad de Puntos</label>
                <input
                  type="number"
                  value={pointsAmount}
                  onChange={(e) => setPointsAmount(e.target.value)}
                  placeholder="100"
                  className="w-full h-14 px-5 rounded-xl bg-white/5 border border-white/10 text-white font-bold text-lg placeholder:text-white/20 outline-none focus:border-neon/50 transition-colors"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-white/30 tracking-widest mb-2 block">Descripción (Opcional)</label>
                <input
                  type="text"
                  value={pointsDescription}
                  onChange={(e) => setPointsDescription(e.target.value)}
                  placeholder="Bonificación especial..."
                  className="w-full h-12 px-5 rounded-xl bg-white/5 border border-white/10 text-white font-medium text-sm placeholder:text-white/20 outline-none focus:border-neon/50 transition-colors"
                />
              </div>
            </div>

            <button
              onClick={handleAddPoints}
              disabled={isLoadingPoints || !pointsAmount || parseInt(pointsAmount) <= 0}
              className="w-full py-4 bg-neon text-black rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
            >
              {isLoadingPoints ? (
                <>
                  <div className="size-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg">stars</span>
                  <span>Confirmar +{pointsAmount || '0'} Puntos</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* GIFT MODAL */}
      {showGiftModal && giftClient && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-[#141714] border border-white/10 rounded-3xl w-full max-w-md p-8 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-lg font-black text-white uppercase italic tracking-tight">Otorgar Regalo</h3>
                <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">{giftClient.name}</p>
              </div>
              <button onClick={() => setShowGiftModal(false)} className="size-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-[9px] font-black uppercase text-white/30 tracking-widest mb-2 block">Nombre del Regalo</label>
                <input
                  type="text"
                  value={giftName}
                  onChange={(e) => setGiftName(e.target.value)}
                  placeholder="Café Gratis, Postre de Cortesía..."
                  className="w-full h-14 px-5 rounded-xl bg-white/5 border border-white/10 text-white font-bold text-lg placeholder:text-white/20 outline-none focus:border-primary/50 transition-colors"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-white/30 tracking-widest mb-2 block">Descripción (Opcional)</label>
                <input
                  type="text"
                  value={giftDescription}
                  onChange={(e) => setGiftDescription(e.target.value)}
                  placeholder="Por su lealtad como cliente..."
                  className="w-full h-12 px-5 rounded-xl bg-white/5 border border-white/10 text-white font-medium text-sm placeholder:text-white/20 outline-none focus:border-primary/50 transition-colors"
                />
              </div>
            </div>

            <button
              onClick={handleGrantGift}
              disabled={isLoadingGift || !giftName}
              className="w-full py-4 bg-primary text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
            >
              {isLoadingGift ? (
                <>
                  <div className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg">redeem</span>
                  <span>Confirmar Regalo</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const FilterTab: React.FC<{ active: boolean, onClick: () => void, children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-6 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${active ? 'bg-primary dark:bg-neon/10 text-white dark:text-neon border border-primary dark:border-neon/20 shadow-soft' : 'text-text-secondary hover:text-primary'}`}
  >
    {children}
  </button>
);

const MetricBlock: React.FC<{ label: string, value: string, icon: string, color?: string }> = ({ label, value, icon, color }) => (
  <div className="p-5 rounded-3xl bg-black/[0.01] dark:bg-white/[0.01] border border-black/[0.03] dark:border-white/[0.03]">
    <div className="flex items-center gap-2 opacity-40 mb-2">
      <span className="material-symbols-outlined text-[14px]">{icon}</span>
      <span className="text-[8px] font-black uppercase tracking-widest">{label}</span>
    </div>
    <p className={`text-lg font-black italic tracking-tighter ${color || 'dark:text-white'}`}>{value}</p>
  </div>
);

const ActivityItem: React.FC<{ label: string, time: string, detail: string, isNote?: boolean, icon?: string }> = ({ label, time, detail, isNote, icon }) => (
  <div className="relative pl-10 group">
    <div className={`absolute left-0 top-0 size-6 rounded-full flex items-center justify-center border border-white dark:border-surface-dark z-10 ${isNote ? 'bg-accent/20 text-accent' : 'bg-black/5 text-text-secondary'}`}>
      <span className="material-symbols-outlined text-[10px]">{icon || (isNote ? 'edit_note' : 'fiber_manual_record')}</span>
    </div>
    <div className="flex justify-between items-baseline mb-1">
      <p className={`text-[10px] font-black uppercase tracking-tighter italic ${isNote ? 'text-accent' : 'dark:text-white'}`}>{label}</p>
      <p className="text-[8px] font-bold text-text-secondary uppercase opacity-40">{time}</p>
    </div>
    <p className="text-[10px] text-text-secondary font-medium opacity-60 leading-tight uppercase tracking-tight">{detail}</p>
  </div>
);

export default Clients;
