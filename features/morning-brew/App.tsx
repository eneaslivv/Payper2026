
import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { MenuItem, CartItem, UserProfile, OrderStatus } from './types';
import { INITIAL_USER } from './constants';

// Pages
import MenuPage from './pages/MenuPage';
import ProductPage from './pages/ProductPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import TrackingPage from './pages/TrackingPage';
import AuthPage from './pages/AuthPage';
import ProfilePage from './pages/ProfilePage';
import LoyaltyPage from './pages/LoyaltyPage';

// Components
import BottomNav from './components/BottomNav';
import ActiveOrderWidget from './components/ActiveOrderWidget';
import GuestGateModal from './components/GuestGateModal';

const App: React.FC = () => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [hasActiveOrder, setHasActiveOrder] = useState(false);
  const [orderStatus, setOrderStatus] = useState<OrderStatus>('received');
  const [showGuestGate, setShowGuestGate] = useState(false);
  const [isHubOpen, setIsHubOpen] = useState(false);

  // Simulación de estados de orden para pruebas
  useEffect(() => {
    if (!hasActiveOrder) return;
    const sequence: OrderStatus[] = ['received', 'preparing', 'ready', 'delivered'];
    let i = 0;
    const interval = setInterval(() => {
      if (i < sequence.length - 1) {
        i++;
        setOrderStatus(sequence[i]);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [hasActiveOrder]);

  const addToCart = (item: MenuItem, quantity: number, customs: string[], size: string, notes: string) => {
    if (!user) { setShowGuestGate(true); return; }
    setCart(prev => [...prev, { ...item, quantity, customizations: customs, size, notes }]);
  };

  return (
    <Router>
      <div className="relative h-[100dvh] w-full max-w-md mx-auto bg-black shadow-2xl overflow-hidden flex flex-col font-display">
        <div className="flex-1 overflow-y-auto no-scrollbar pb-24">
          <Routes>
            <Route path="/" element={<MenuPage cart={cart} user={user} hasActiveOrder={hasActiveOrder} onOpenHub={() => setIsHubOpen(true)} />} />
            <Route path="/product/:id" element={<ProductPage addToCart={addToCart} user={user} />} />
            <Route path="/cart" element={<CartPage cart={cart} removeFromCart={(id, size) => setCart(c => c.filter(i => !(i.id === id && i.size === size)))} updateQuantity={(id, d, s) => {}} isRedeemingPoints={false} setIsRedeemingPoints={() => {}} />} />
            <Route path="/checkout" element={<CheckoutPage cart={cart} isRedeemingPoints={false} clearCart={() => setCart([])} setHasActiveOrder={setHasActiveOrder} tableNumber="05" />} />
            <Route path="/tracking" element={<TrackingPage cart={cart} setHasActiveOrder={setHasActiveOrder} status={orderStatus} />} />
            <Route path="/auth" element={<AuthPage setUser={setUser} />} />
            <Route path="/profile" element={<ProfilePage user={user} setUser={setUser} addToCart={addToCart} />} />
            <Route path="/loyalty" element={<LoyaltyPage user={user} setUser={setUser} />} />
          </Routes>
        </div>
        
        <UILayout user={user} hasActiveOrder={hasActiveOrder} orderStatus={orderStatus} isHubOpen={isHubOpen} setIsHubOpen={setIsHubOpen} />
        
        <GuestGateModal isOpen={showGuestGate} onClose={() => setShowGuestGate(false)} />
      </div>
    </Router>
  );
};

const UILayout: React.FC<any> = ({ user, hasActiveOrder, orderStatus, isHubOpen, setIsHubOpen }) => {
  const location = useLocation();
  const hideNav = ['/checkout', '/tracking', '/auth', '/cart'].includes(location.pathname) || location.pathname.startsWith('/product');
  
  return (
    <>
      {hasActiveOrder && location.pathname !== '/tracking' && (
        <ActiveOrderWidget hasActiveOrder={hasActiveOrder} status={orderStatus} isHubOpen={isHubOpen} setIsHubOpen={setIsHubOpen} tableNumber="05" />
      )}
      {!hideNav && <BottomNav activePath={location.pathname} />}
    </>
  );
};

export default App;
