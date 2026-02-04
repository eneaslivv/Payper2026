
export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'served';

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
  isPopular?: boolean;
  isOutOfStock?: boolean;
  availableStock?: number;
  item_type?: 'product' | 'sellable';
  variants?: {
    id: string;
    name: string;
    price_adjustment: number;
    recipe_overrides?: { ingredient_id: string; quantity_delta: number }[]
  }[];
  addons?: {
    id: string;
    name: string;
    price: number;
    inventory_item_id?: string;
    quantity_consumed?: number
  }[];
  // Legacy support or mapped from addons
  customizationOptions?: {
    name: string;
    options: { label: string; price: number }[];
  }[];
}

export interface CartItem extends MenuItem {
  quantity: number;
  customizations?: string[];
  size?: string;
  variant_id?: string;
  addon_ids?: string[];
  notes?: string;
  location?: string; // Mesa o Barra
}

export interface Voucher {
  id: string;
  name: string;
  expiry: string;
  type: 'gift' | 'redemption';
}

// Fix: Added OrderHistoryItem interface as it was being imported in ProfilePage but not defined
export interface OrderHistoryItem {
  id: string;
  date: string;
  items: string;
  total: number;
  pointsEarned?: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  // Fix: Added optional phone property used in ProfilePage
  phone?: string;
  points: number;
  balance: number;
  status: 'Bronce' | 'Plata' | 'Oro';
  vouchers: Voucher[];
  avatar: string;
  onboardingCompleted: boolean;
  // Fix: Added orderHistory property used in ProfilePage
  orderHistory: OrderHistoryItem[];
}

export interface Order {
  id: string;
  userId: string;
  items: CartItem[];
  total: number;
  status: OrderStatus;
  createdAt: string;
  deliveryMode: 'local' | 'takeout';
  location: string; // Número de mesa o barra
}
