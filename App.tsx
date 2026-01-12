import React, { useState, useRef, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { HashRouter as Router, Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';

import DebugPayment from './pages/DebugPayment';
import Dashboard from './pages/Dashboard';
import InventoryManagement from './pages/InventoryManagement';
import MenuManagement from './pages/MenuManagement';
import InvoiceProcessor from './pages/InvoiceProcessor';
import MenuDesign from './pages/MenuDesign';
import Loyalty from './pages/Loyalty';
import OrderBoard from './pages/OrderBoard';
import Scanner from './pages/Scanner';
import TableManagement from './pages/TableManagement';
import OrderCreation from './pages/OrderCreation';
import Finance from './pages/Finance';
import StoreSettings from './pages/StoreSettings';
import Clients from './pages/Clients';
import SaaSAdmin from './pages/SaaSAdmin';
import StaffManagement from './pages/StaffManagement';
import JoinTeam from './pages/auth/JoinTeam';
import SetupOwner from './pages/auth/SetupOwner';
import Login from './pages/Login';
import { ClientProvider } from './contexts/ClientContext';
import ClientLayout from './components/client/ClientLayout';
import ClientMenuPage from './pages/client/MenuPage';
import ClientProductPage from './pages/client/ProductPage';
import ClientCartPage from './pages/client/CartPage';
import ClientCheckoutPage from './pages/client/CheckoutPage';
import ClientTrackingPage from './pages/client/TrackingPage';
import ClientAuthPage from './pages/client/AuthPage';
import ClientProfilePage from './pages/client/ProfilePage';
import ClientLoyaltyPage from './pages/client/LoyaltyPage';
import ClientOrderStatusPage from './pages/client/OrderStatusPage';
import QRResolver from './pages/QRResolver';
import ClientWalletPage from './pages/client/WalletPage';
import ScanOrderModal from './components/ScanOrderModal';
import { MenuPage } from './pages/MenuPage';
import { OrderConfirmationPage } from './pages/OrderConfirmationPage';
import AIChat from './components/AIChat';
import OfflineIndicator from './components/OfflineIndicator';
import { MOCK_NODES, MOCK_TENANTS } from './constants';
import { CafeNode, Tenant } from './types';
import { ToastProvider, useToast, NotificationPanel } from './components/ToastSystem';
import { OfflineProvider } from './contexts/OfflineContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PermissionGuard } from './components/PermissionGuard';
import { RoleGuard } from './components/RoleGuard';

// --- COMPONENTES UI COMUNES ---
const SidebarItem: React.FC<{ to: string, icon: string, label: string, active?: boolean, badge?: string | number, onClick?: () => void }> = ({ to, icon, label, active, badge, onClick }) => (
  <Link
    to={to}
    onClick={onClick}
    className={`relative flex items-center gap-3 px-6 py-2 transition-all duration-300 ${active
      ? 'bg-white/[0.03] text-neon'
      : 'text-[#71766F] hover:text-white'
      }`}
  >
    {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-neon rounded-r-full shadow-[0_0_10px_#4ADE80]"></div>}
    <span className={`material-symbols-outlined text-[16px] ${active ? 'fill-[1]' : 'opacity-40'}`}>{icon}</span>
    <span className={`text-[11px] tracking-tight flex-1 ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
    {badge && (
      <span className="px-1 py-0.5 rounded bg-primary text-white text-[7px] font-black italic tracking-tighter">
        {badge}
      </span>
    )}
  </Link>
);

const SidebarGroup: React.FC<{ label: string, children: React.ReactNode }> = ({ label, children }) => {
  // Filter out falsy children (hidden by permissions)
  const validChildren = React.Children.toArray(children).filter(Boolean);
  if (validChildren.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5 mt-4">
      <p className="px-6 mb-1 text-[8px] font-black uppercase tracking-[0.2em] text-white/10 select-none">{label}</p>
      {children}
    </div>
  );
};

// --- LAYOUT DEL SUPER ADMIN (SaaS HQ) ---
const SaaSLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, signOut } = useAuth();
  const location = useLocation();

  return (
    <div className="flex h-screen w-full bg-[#050605] overflow-hidden">
      {/* SIDEBAR SAAS - DISEÑO 'GOD MODE' */}
      <aside className="w-[240px] bg-[#0A0C0A] border-r border-white/5 flex flex-col z-50">
        <div className="p-6 pb-8 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-accent text-black flex items-center justify-center shadow-[0_0_20px_rgba(180,150,92,0.3)]">
              <span className="material-symbols-outlined text-2xl font-black">admin_panel_settings</span>
            </div>
            <div>
              <h1 className="text-white text-xs font-black tracking-widest uppercase leading-none">SQUAD<span className="text-accent">HQ</span></h1>
              <p className="text-[7px] text-white/40 font-bold uppercase tracking-[0.3em] mt-1">Master Control</p>
            </div>
          </div>
        </div>

        <div className="flex-1 py-6 overflow-y-auto">
          <SidebarGroup label="Plataforma">
            <SidebarItem to="/" icon="dashboard" label="Visión Global" active={location.pathname === '/'} />
            <SidebarItem to="/tenants" icon="storefront" label="Gestión Locales" active={location.pathname === '/tenants'} />
            <SidebarItem to="/users" icon="manage_accounts" label="Usuarios Globales" active={location.pathname === '/users'} />
          </SidebarGroup>

          <SidebarGroup label="Economía">
            <SidebarItem to="/plans" icon="monetization_on" label="Planes y Billing" active={location.pathname === '/plans'} />
            <SidebarItem to="/metrics" icon="monitoring" label="Métricas MRR" active={location.pathname === '/metrics'} />
          </SidebarGroup>

          <SidebarGroup label="Sistema">
            <SidebarItem to="/audit" icon="policy" label="Auditoría Master" active={location.pathname === '/audit'} />
            <SidebarItem to="/settings" icon="settings_applications" label="Config. Motor" active={location.pathname === '/settings'} />
          </SidebarGroup>
        </div>

        <div className="p-4 border-t border-white/5">
          <button
            type="button"
            onMouseDown={() => {
              console.log("Cerrando sesión HQ...");
              signOut();
            }}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-red-500/10 text-red-500 hover:bg-hover-red-soft hover:text-white transition-all group"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
            <span className="text-[10px] font-black uppercase tracking-widest">Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* MAIN SAAS AREA */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative">
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-[#0A0C0A]">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-accent animate-pulse"></span>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">CONEXIÓN SEGURA <span className="text-white">ENCRIPTADA</span></p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] font-black text-white uppercase">{user?.email || 'Admin'}</p>
              <p className="text-[8px] font-bold text-accent uppercase tracking-widest">Super Admin</p>
            </div>
            <div className="size-9 rounded-full bg-white/10 border border-white/10"></div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto bg-[#050605] relative">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"></div>
          <div className="relative z-10">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};

// --- LAYOUT DEL OPERADOR (Local) ---
const OperativeLayout: React.FC<{ children: React.ReactNode, activeNode: CafeNode, activeTenant: Tenant }> = ({ children, activeNode, activeTenant }) => {
  const { user, profile, signOut, hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { addToast, unreadCount } = useToast();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotifPanelOpen, setIsNotifPanelOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Bar Mode State
  const [isBarMode, setIsBarMode] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);

  // Store Branding State
  const [storeBranding, setStoreBranding] = useState({ name: 'PAYPER', logo_url: '' });

  useEffect(() => {
    // Initial fetch
    fetchStoreBranding();

    // Listen for updates
    const handleStoreUpdate = () => fetchStoreBranding();
    window.addEventListener('store_updated', handleStoreUpdate);
    return () => window.removeEventListener('store_updated', handleStoreUpdate);
  }, [user]);

  const fetchStoreBranding = async () => {
    // We can get store_id from profile (using useAuth() context would be better, but doing direct fetch to be safe inside Layout)
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { data: profileData } = await supabase.from('profiles').select('store_id').eq('id', session.user.id).single();
    if (!profileData?.store_id) return;

    const { data: storeData } = await supabase.from('stores').select('name, logo_url').eq('id', profileData.store_id).single();
    if (storeData) {
      setStoreBranding({
        name: storeData.name || 'PAYPER',
        logo_url: storeData.logo_url || ''
      });
    }
  };


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- GLOBAL SHORTCUTS LISTENER ---
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      // Ctrl + K to open scanner
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowScanModal(true);
        return;
      }



      switch (e.key.toUpperCase()) {
        case 'N':
          e.preventDefault();
          navigate('/create-order');
          addToast("MODO TOMA DE PEDIDO", "action", "Terminal Listo");
          break;
        case 'G':
          e.preventDefault();
          navigate('/orders');
          addToast("TABLERO DESPACHO", "info");
          break;
        case 'B':
          e.preventDefault();
          setIsBarMode(prev => !prev);
          addToast(isBarMode ? "MODO BAR DESACTIVADO" : "MODO BAR (UI SIMPLIFICADA)", "action");
          break;
        case 'L':
          if (e.shiftKey && e.altKey) {
            e.preventDefault();
            console.log("EMERGENCY LOGOUT SHORTCUT");
            signOut();
          }
          break;
      }
    };

    const handleCustomOpen = () => {
      setShowScanModal(true);
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    window.addEventListener('open-scan-modal', handleCustomOpen);

    return () => {
      window.removeEventListener('keydown', handleGlobalShortcuts);
      window.removeEventListener('open-scan-modal', handleCustomOpen);
    };
  }, [navigate, isBarMode, addToast]);

  return (
    <div className={`flex h-screen w-full bg-[#0D0F0D] overflow-hidden ${isBarMode ? 'text-lg' : ''}`}>
      <ScanOrderModal isOpen={showScanModal} onClose={() => setShowScanModal(false)} />
      <AIChat />
      <OfflineIndicator />

      {/* SIDEBAR OPERATIVA */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-[220px] bg-[#0D0F0D] border-r border-white/5 flex flex-col transition-transform duration-300 lg:static lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-5 pb-5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-neon/10 border border-neon/30 flex items-center justify-center text-neon overflow-hidden">
              {storeBranding.logo_url ? (
                <img src={storeBranding.logo_url} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <img src="/src/assets/payper-logo.png" alt="Payper" className="w-full h-full object-contain p-0.5" />
              )}
            </div>
            <div className="flex flex-col">
              <h1 className="text-white text-[13px] font-black tracking-tighter uppercase leading-none">{storeBranding.name}</h1>
              <p className="text-[#71766F] text-[6px] font-black uppercase tracking-[0.25em] mt-0.5 opacity-30 leading-none">Local Op Unit</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar pb-4">
          {hasPermission('dashboard') && (
            <SidebarItem to="/" icon="grid_view" label="Dashboard" active={location.pathname === '/'} onClick={() => setIsSidebarOpen(false)} />
          )}

          <SidebarGroup label="OPERACIONES">
            {(hasPermission('orders') || !profile?.role_id) && (
              <SidebarItem to="/orders" icon="list_alt" label="Despacho [G]" active={location.pathname === '/orders'} onClick={() => setIsSidebarOpen(false)} />
            )}
            {(hasPermission('tables') || !profile?.role_id) && (
              <SidebarItem to="/tables" icon="deck" label="Mesas y Salón" active={location.pathname === '/tables'} onClick={() => setIsSidebarOpen(false)} />
            )}
          </SidebarGroup>

          <SidebarGroup label="LOGÍSTICA">
            {(hasPermission('inventory') || !profile?.role_id) && (
              <SidebarItem to="/inventory" icon="package_2" label="Inventario" active={location.pathname === '/inventory'} onClick={() => setIsSidebarOpen(false)} />
            )}
            {(hasPermission('design') || !profile?.role_id) && (
              <SidebarItem to="/design" icon="architecture" label="Diseño Menú" active={location.pathname === '/design'} onClick={() => setIsSidebarOpen(false)} />
            )}
          </SidebarGroup>

          <SidebarGroup label="NEGOCIO">
            {(hasPermission('clients') || !profile?.role_id) && (
              <SidebarItem to="/clients" icon="group" label="Clientes" active={location.pathname === '/clients'} onClick={() => setIsSidebarOpen(false)} />
            )}
            {(hasPermission('loyalty') || !profile?.role_id) && (
              <SidebarItem to="/loyalty" icon="military_tech" label="Fidelidad" active={location.pathname === '/loyalty'} onClick={() => setIsSidebarOpen(false)} />
            )}
            {(hasPermission('finance') || !profile?.role_id) && (
              <SidebarItem to="/finance" icon="bar_chart_4_bars" label="Finanzas" active={location.pathname === '/finance'} onClick={() => setIsSidebarOpen(false)} />
            )}
          </SidebarGroup>
        </div>

        {/* MENÚ DE USUARIO */}
        <div className="p-3 border-t border-white/5 bg-[#0D0F0D] relative" ref={userMenuRef}>
          {isUserMenuOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-2 bg-[#141714] border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2 duration-200 z-[60]">
              <div className="p-3 border-b border-white/5 bg-white/[0.02]">
                <p className="text-[8px] font-black text-white/30 uppercase tracking-widest">Protocolo de Operador</p>
              </div>
              {hasPermission('staff') && (
                <Link to="/settings" onClick={() => setIsUserMenuOpen(false)} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-white/60 hover:text-white hover:bg-white/5 transition-all">
                  <span className="material-symbols-outlined text-sm">settings</span>
                  <span className="text-[10px] font-bold uppercase tracking-tight">Ajustes Local</span>
                </Link>
              )}
              <div className="h-px bg-white/5"></div>
              <button
                type="button"
                onMouseDown={() => {
                  console.log("Cerrando sesión (Op)...");
                  signOut();
                }}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-primary hover:bg-primary/10 transition-all group"
              >
                <span className="material-symbols-outlined text-sm font-black group-hover:text-primary transition-colors">logout</span>
                <span className="text-[10px] font-black uppercase tracking-widest italic">Cerrar Sesión</span>
              </button>
            </div>
          )}

          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className={`w-full p-2.5 rounded-xl flex items-center gap-2 border transition-all pointer-events-auto ${isUserMenuOpen ? 'bg-white/5 border-neon/30' : 'bg-white/[0.02] border-white/5 hover:border-white/10'}`}
          >
            <div className="size-6 rounded-lg bg-neon/20 flex items-center justify-center text-neon shrink-0"><span className="material-symbols-outlined text-sm">person</span></div>
            <div className="flex-1 text-left overflow-hidden">
              <p className="text-[9px] font-black text-white truncate uppercase italic leading-none mb-0.5">{user?.email || 'Operador'}</p>
              <p className="text-[6px] text-[#71766F] font-bold uppercase tracking-widest opacity-40 truncate leading-none">{profile?.role || 'Operador'}</p>
            </div>
            <span className={`material-symbols-outlined text-sm text-[#71766F] transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`}>expand_less</span>
          </button>
        </div>
      </aside>

      {/* MAIN OPERATIVO */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="shrink-0 flex items-center justify-between px-6 py-2.5 bg-[#0D0F0D] border-b border-white/5 z-40">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-1 rounded-lg bg-white/5 text-white"><span className="material-symbols-outlined text-xl">menu</span></button>
            <div className="flex items-center gap-2">
              <div className="size-1 rounded-full bg-neon animate-pulse"></div>
              <h2 className="text-[8px] font-black uppercase tracking-[0.3em] text-[#71766F] italic">NODE: <span className="text-neon">{activeNode.name.toUpperCase()}</span></h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5">
              <span className="text-[8px] font-bold text-white/30 uppercase tracking-widest">Atajos:</span>
              <span className="text-[9px] font-black text-neon bg-white/5 px-1.5 rounded">N</span>
              <span className="text-[9px] font-black text-neon bg-white/5 px-1.5 rounded">G</span>
            </div>

            {/* NOTIFICATION CENTER BUTTON */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setIsNotifPanelOpen(!isNotifPanelOpen)}
                className={`relative flex items-center justify-center size-8 rounded-lg border transition-all ${isNotifPanelOpen ? 'bg-white/10 border-white/20 text-white' : 'border-white/5 text-[#71766F] hover:text-white'}`}
              >
                <span className="material-symbols-outlined text-[18px]">notifications</span>
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 size-2 bg-neon rounded-full shadow-[0_0_8px_#4ADE80] animate-pulse"></span>
                )}
              </button>
              {isNotifPanelOpen && <NotificationPanel onClose={() => setIsNotifPanelOpen(false)} />}
            </div>

            <Link to="/scanner" className="flex items-center justify-center size-8 rounded-lg border border-white/5 text-[#71766F] hover:text-neon transition-all"><span className="material-symbols-outlined text-[18px]">center_focus_weak</span></Link>
            <Link to="/create-order" className="flex items-center gap-2 px-4 py-1.5 bg-neon text-black rounded-lg font-black text-[9px] uppercase tracking-[0.15em] shadow-neon-soft hover:scale-105 active:scale-95 transition-all">
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span className="hidden sm:inline italic">NUEVA MISIÓN [N]</span>
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto no-scrollbar relative bg-[#0D0F0D]">
          {children}
        </div>
      </main>

      {isSidebarOpen && <div className="fixed inset-0 bg-black/80 z-[45] lg:hidden" onClick={() => setIsSidebarOpen(false)}></div>}
    </div>
  );
};

const MainRouter: React.FC = () => {
  const { user, profile, isLoading, signOut, isAdmin, isRecovery } = useAuth();
  const [activeNode] = useState(MOCK_NODES[0]);
  const [activeTenant] = useState(MOCK_TENANTS[0]);

  useEffect(() => {
    if (!isLoading) {
      console.log("--- ROUTING DECISION ---");
      console.log("User:", user?.email);
      console.log("Is Admin:", isAdmin);
      console.log("Profile Role:", profile?.role);
    }
  }, [isLoading, user, profile, isAdmin]);

  // GLOBAL LOADING BARRIER
  // Minimalist loader
  if (isLoading) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center bg-black">
        <div className="flex items-center gap-2 animate-pulse opacity-50">
          <div className="size-2 bg-neon rounded-full" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Cargando...</span>
        </div>
      </div>
    );
  }

  // PUBLIC ROUTES - These must work regardless of auth status!
  // Check BEFORE any auth logic so logged-in users can also access client menu
  const isClientMenu = window.location.hash.includes('#/m/');
  const isOrderRoute = window.location.hash.includes('#/orden/') || window.location.hash.includes('/order/');
  const isQRRoute = window.location.hash.includes('#/qr/');

  // DEBUG: Log routing decision
  console.log('[ROUTING] Hash:', window.location.hash);
  console.log('[ROUTING] isClientMenu:', isClientMenu, 'isOrderRoute:', isOrderRoute, 'isQRRoute:', isQRRoute);

  if (isClientMenu || isOrderRoute || isQRRoute) {
    return (
      <Router>
        <Routes>
          {/* Client Menu Module */}
          <Route path="/m/:slug" element={
            <ClientProvider>
              <ClientLayout />
            </ClientProvider>
          }>
            <Route index element={<ClientMenuPage />} />
            <Route path="product/:id" element={<ClientProductPage />} />
            <Route path="cart" element={<ClientCartPage />} />
            <Route path="checkout" element={<ClientCheckoutPage />} />
            <Route path="tracking/:orderId" element={<ClientTrackingPage />} />
            <Route path="order/:orderId" element={<ClientOrderStatusPage />} />
            <Route path="auth" element={<ClientAuthPage />} />
            <Route path="profile" element={<ClientProfilePage />} />
            <Route path="loyalty" element={<ClientLoyaltyPage />} />
            <Route path="wallet" element={<ClientWalletPage />} />
          </Route>

          {/* QR Resolver Route */}
          <Route path="/qr/:hash" element={<QRResolver />} />

          {/* Order Confirmation Routes */}
          <Route path="/orden/:orderId/confirmado" element={<OrderConfirmationPage />} />
          <Route path="/orden/:orderId/error" element={<OrderConfirmationPage />} />
          <Route path="/orden/:orderId/pendiente" element={<OrderConfirmationPage />} />

          {/* Fallback for unmatched routes - show not found */}
          <Route path="*" element={
            <div className="flex flex-col h-screen w-full items-center justify-center bg-black text-white">
              <span className="material-symbols-outlined text-4xl mb-4 text-white/30">search_off</span>
              <h1 className="text-xl font-black">Página no encontrada</h1>
              <p className="text-white/50 text-sm mt-2">El menú que buscás no existe</p>
            </div>
          } />
        </Routes>
      </Router>
    );
  }

  // IF we are in recovery mode OR no user, show Login
  if (!user || isRecovery) {
    // Permitir acceso a JoinTeam y SetupOwner sin login
    if (window.location.hash.includes('#/join') || window.location.hash.includes('#/setup-owner')) {
      return (
        <Router>
          <Routes>
            <Route path="/join" element={<JoinTeam />} />
            <Route path="/setup-owner" element={<SetupOwner />} />
            <Route path="*" element={<Login />} />
          </Routes>
        </Router>
      );
    }

    // PUBLIC ROUTES (Client Menu, Direct Store Link, Order Confirmation)
    // We check if the URL matches any of our public patterns to render the Router
    const isClientMenu = window.location.hash.includes('#/m/');
    const isOrderRoute = window.location.hash.includes('#/orden/') || window.location.hash.includes('/order/');
    // Check for direct store slug (e.g. #/my-cafe) while avoiding conflicts with system routes
    const isPotentialStoreRoute = window.location.hash.match(/^#\/[^/]+$/) &&
      !['#/login', '#/join', '#/setup-owner', '#/dashboard', '#/admin', '#/debug-payment'].includes(window.location.hash);

    const isDebugRoute = window.location.hash.includes('#/debug-payment');

    if (isClientMenu || isOrderRoute || isPotentialStoreRoute || isDebugRoute) {
      return (
        <Router>
          <Routes>
            <Route path="/debug-payment" element={<DebugPayment />} />
            {/* Existing Client Module (Legacy/Structured) */}
            <Route path="/m/:slug" element={
              <ClientProvider>
                <ClientLayout />
              </ClientProvider>
            }>
              <Route index element={<ClientMenuPage />} />
              <Route path="product/:id" element={<ClientProductPage />} />
              <Route path="cart" element={<ClientCartPage />} />
              <Route path="checkout" element={<ClientCheckoutPage />} />
              <Route path="tracking/:orderId" element={<ClientTrackingPage />} />
              <Route path="auth" element={<ClientAuthPage />} />
              <Route path="profile" element={<ClientProfilePage />} />
              <Route path="loyalty" element={<ClientLoyaltyPage />} />
              <Route path="wallet" element={<ClientWalletPage />} />
              <Route path="order/:orderId" element={<ClientOrderStatusPage />} />
            </Route>

            {/* New Payment & Direct Link Routes */}
            <Route path="/:storeSlug" element={<MenuPage />} />
            <Route path="/orden/:orderId/confirmado" element={<OrderConfirmationPage />} />
            <Route path="/orden/:orderId/error" element={<OrderConfirmationPage />} />
            <Route path="/orden/:orderId/pendiente" element={<OrderConfirmationPage />} />
          </Routes>
        </Router>
      );
    }

    return <Login />;
  }

  // PROFILE INTEGRITY CHECK
  // If we have a user but no profile (and we are not loading), it means fetchProfile failed.
  // CRITICAL: We EXEMPT client-facing routes (menu, orders) from this check so customers can still use the menu!
  // NOTE: isClientMenu and isOrderRoute are already defined earlier in this function scope.
  const isPotentialStoreRoute = window.location.hash.match(/^#\/[^/]+$/) &&
    !['#/login', '#/join', '#/setup-owner', '#/dashboard', '#/admin'].includes(window.location.hash);

  // 🚨 GOD MODE: Never block the super admin
  const isGodModeUser = user?.email === 'livvadm@gmail.com' || user?.email === 'livveneas@gmail.com';

  // RECALCULATE client route check here to be absolutely sure
  const isClientRoute = window.location.hash.includes('#/m/') || window.location.hash.includes('/order/') || window.location.hash.includes('/orden/');

  // Also exempt checkout return URLs (Mercado Pago redirects often land here with specific params)
  const isCheckoutReturn = window.location.hash.includes('collection_id') || window.location.hash.includes('preference_id');

  // Skip profile check if: god mode, client route, or potential store route
  if (user && !profile && !isClientRoute && !isPotentialStoreRoute && !isGodModeUser && !isCheckoutReturn) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center bg-black gap-6 p-6 text-center">
        <div className="relative size-20">
          <div className="absolute inset-0 rounded-full border-4 border-white/5 border-t-neon animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl text-neon">manage_accounts</span>
          </div>
        </div>
        <div>
          <h1 className="text-white text-lg font-black uppercase tracking-[0.2em] mb-2">Configurando Cuenta</h1>
          <p className="text-zinc-500 text-xs max-w-xs mx-auto leading-relaxed">
            Estamos preparando tu perfil de usuario. Esto solo tomará unos segundos...
          </p>
        </div>
        <div className="flex gap-4 mt-4">
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white text-[10px] font-black uppercase tracking-widest rounded-full transition-all border border-white/5"
          >
            Recargar Página
          </button>
          <button
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
            className="px-6 py-2 text-red-500/50 hover:text-red-500 text-[10px] font-black uppercase tracking-widest rounded transition-all"
          >
            Salir
          </button>
        </div>
      </div>
    );
  }

  // Pending Approval or Inactive Check (Skip for super_admin AND GOD MODE user)
  if (profile && !profile.is_active && !isAdmin && !isGodModeUser) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center bg-black text-white p-6 text-center space-y-4">
        <span className="material-symbols-outlined text-6xl text-red-500">gpp_bad</span>
        <h1 className="text-2xl font-black uppercase">Acceso Denegado</h1>
        <p className="text-gray-400 max-w-md">Tu cuenta está pendiente de aprobación por el comando central. Contacta a un administrador.</p>
        <button onClick={signOut} className="text-neon hover:underline uppercase text-xs font-bold tracking-widest mt-4">Cerrar Sesión</button>
      </div>
    );
  }

  // --- ENTORNO SUPER ADMIN (SaaS) ---
  if (isAdmin) {
    return (
      <Router>
        <SaaSLayout>
          <Routes>
            <Route path="/" element={<SaaSAdmin initialTab="tenants" />} />
            <Route path="/tenants" element={<SaaSAdmin initialTab="tenants" />} />
            <Route path="/users" element={<SaaSAdmin initialTab="users" />} />
            <Route path="/plans" element={<SaaSAdmin initialTab="plans" />} />
            <Route path="/metrics" element={<SaaSAdmin initialTab="metrics" />} />
            <Route path="/audit" element={<SaaSAdmin initialTab="audit" />} />
            <Route path="/audit" element={<SaaSAdmin initialTab="audit" />} />
            <Route path="/join" element={<JoinTeam />} />
            {/* QR Resolver Fallback */}
            <Route path="/qr/:hash" element={<QRResolver />} />

            {/* Public Menu Routes for Testing */}
            <Route path="/m/:slug" element={
              <ClientProvider>
                <ClientLayout />
              </ClientProvider>
            }>
              <Route index element={<ClientMenuPage />} />
              <Route path="product/:id" element={<ClientProductPage />} />
              <Route path="cart" element={<ClientCartPage />} />
              <Route path="checkout" element={<ClientCheckoutPage />} />
              <Route path="tracking/:orderId" element={<ClientTrackingPage />} />
              <Route path="auth" element={<ClientAuthPage />} />
              <Route path="profile" element={<ClientProfilePage />} />
              <Route path="loyalty" element={<ClientLoyaltyPage />} />
              <Route path="wallet" element={<ClientWalletPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SaaSLayout>
      </Router>
    );
  }
  // --- SEGURIDAD: CLIENTES NO PUEDEN ENTRAR AL ADMIN ---
  if (profile?.role === 'customer') {
    const lastSlug = localStorage.getItem('last_store_slug');
    if (lastSlug) {
      console.log('🔒 Security: Client attempting to access Admin. Redirecting to:', lastSlug);
      window.location.hash = `/m/${lastSlug}`;
      window.location.reload();
      return (
        <div className="flex flex-col h-screen w-full items-center justify-center bg-black">
          <div className="size-8 rounded-full border-4 border-white/10 border-t-neon animate-spin"></div>
        </div>
      );
    }
    // Fallback if we don't know where they belong
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center bg-black text-white p-6 text-center">
        <span className="material-symbols-outlined text-6xl text-red-500 mb-4">lock</span>
        <h1 className="text-xl font-bold mb-2">Acceso Restringido</h1>
        <p className="text-zinc-500 text-sm mb-6 max-w-xs mx-auto">Esta área es exclusiva para el equipo operativo. Serás redirigido.</p>
        <button
          onClick={() => {
            signOut();
            window.location.href = '#/';
          }}
          className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase tracking-widest rounded-lg transition-all"
        >
          Ir al Inicio
        </button>
      </div>
    );
  }

  // --- ENTORNO OPERATIVO (LOCAL) ---
  return (
    <Router>
      <OfflineProvider>
        <OperativeLayout activeNode={activeNode} activeTenant={activeTenant}>
          <Routes>
            {/* QR Resolver Fallback */}
            <Route path="/qr/:hash" element={<QRResolver />} />

            {/* Public Menu Routes (Accessible when logged in) */}
            <Route path="/m/:slug" element={
              <ClientProvider>
                <ClientLayout />
              </ClientProvider>
            }>
              <Route index element={<ClientMenuPage />} />
              <Route path="product/:id" element={<ClientProductPage />} />
              <Route path="cart" element={<ClientCartPage />} />
              <Route path="checkout" element={<ClientCheckoutPage />} />
              <Route path="tracking/:orderId" element={<ClientTrackingPage />} />
              <Route path="auth" element={<ClientAuthPage />} />
              <Route path="profile" element={<ClientProfilePage />} />
              <Route path="loyalty" element={<ClientLoyaltyPage />} />
              <Route path="wallet" element={<ClientWalletPage />} />
            </Route>

            <Route path="/" element={<Dashboard />} />
            <Route path="/debug-payment" element={<DebugPayment />} />
            <Route path="/inventory" element={
              <PermissionGuard section="inventory" fallback={<Navigate to="/" replace />}>
                <InventoryManagement />
              </PermissionGuard>
            } />
            <Route path="/menus" element={
              <PermissionGuard section="inventory" fallback={<Navigate to="/" replace />}>
                <MenuManagement />
              </PermissionGuard>
            } />
            <Route path="/invoice-processor" element={
              <PermissionGuard section="inventory" fallback={<Navigate to="/" replace />}>
                <InvoiceProcessor />
              </PermissionGuard>
            } />
            <Route path="/finance" element={
              <PermissionGuard section="finance" fallback={<Navigate to="/" replace />}>
                <Finance />
              </PermissionGuard>
            } />
            <Route path="/settings" element={
              <StoreSettings />
            } />
            <Route path="/design" element={
              <PermissionGuard section="design" fallback={<Navigate to="/" replace />}>
                <MenuDesign />
              </PermissionGuard>
            } />
            <Route path="/loyalty" element={
              <PermissionGuard section="loyalty" fallback={<Navigate to="/" replace />}>
                <Loyalty />
              </PermissionGuard>
            } />
            <Route path="/orders" element={
              <PermissionGuard section="orders" fallback={<Navigate to="/" replace />}>
                <OrderBoard />
              </PermissionGuard>
            } />
            <Route path="/scanner" element={
              <PermissionGuard section="orders" fallback={<Navigate to="/" replace />}>
                <Scanner />
              </PermissionGuard>
            } />
            <Route path="/tables" element={
              <PermissionGuard section="tables" fallback={<Navigate to="/" replace />}>
                <TableManagement />
              </PermissionGuard>
            } />
            <Route path="/clients" element={
              <PermissionGuard section="clients" fallback={<Navigate to="/" replace />}>
                <Clients />
              </PermissionGuard>
            } />
            <Route path="/create-order" element={
              <PermissionGuard section="orders" fallback={<Navigate to="/" replace />}>
                <OrderCreation />
              </PermissionGuard>
            } />
            <Route path="/join" element={<JoinTeam />} />
            <Route path="/setup-owner" element={<SetupOwner />} />
            <Route path="/saas-admin" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </OperativeLayout>
      </OfflineProvider>
    </Router>
  );
};

const App: React.FC = () => {
  // PWA & Store Logic
  useEffect(() => {
    // 1. Save last visited store logic
    const hash = window.location.hash;
    if (hash.includes('/m/')) {
      const match = hash.match(/\/m\/([^/]+)/);
      if (match && match[1]) {
        localStorage.setItem('last_store_slug', match[1]);
      }
    }

    // 2. PWA Launch Redirect (iOS/Android Standalone FIX)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    if (isStandalone && (hash === '#/' || hash === '' || hash === '#/login')) {
      const storedSlug = localStorage.getItem('last_store_slug');
      if (storedSlug) {
        console.log('[PWA] Redirecting to last store:', storedSlug);
        window.location.hash = `/m/${storedSlug}`;
      }
    }
  }, []);

  return (
    <ToastProvider>
      <AuthProvider>
        <MainRouter />
        {/* DEBUG OVERLAY - REMOVE IN PRODUCTION */}
        <DebugStateInspector />
      </AuthProvider>
    </ToastProvider>
  );
};

const DebugStateInspector: React.FC = () => {
  const { user, profile, isAdmin, isLoading } = useAuth();
  const [visible, setVisible] = useState(false); // Hidden by default

  // Toggle with Shift+D
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'D') setVisible(v => !v);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-2 right-2 p-3 bg-black/90 border border-neon/50 rounded-lg z-[9999] text-[10px] font-mono text-neon pointer-events-none opacity-80">
      <h3 className="uppercase underline mb-1">Auth Debugger</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span>isLoading:</span>
        <span className={isLoading ? "text-yellow-400" : "text-green-400"}>{isLoading.toString()}</span>

        <span>User:</span>
        <span className="text-white">{user ? 'LOGGED_IN' : 'NULL'}</span>

        <span>User Email:</span>
        <span className="text-white">{user?.email || '-'}</span>

        <span>Profile:</span>
        <span className={profile ? "text-green-400" : "text-red-400"}>{profile ? 'LOADED' : 'NULL'}</span>

        <span>Profile Role:</span>
        <span className="text-white">{profile?.role || '-'}</span>

        <span>Is Admin:</span>
        <span className={isAdmin ? "text-red-500 font-bold" : "text-zinc-500"}>{isAdmin.toString()}</span>
      </div>
    </div>
  );
};

export default App;
