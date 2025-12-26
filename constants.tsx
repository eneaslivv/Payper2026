
import { InventoryItem, Order, Table, Reward, Client, CustomRole, StaffMember, AuditLogEntry, CashRegisterSession, CafeNode, InventoryMovement, Product, InventoryLot, StockAdjustment, Recipe, AIConfig, SaaSPlanDefinition, Tenant, GlobalUser, ProductLoyaltyRule, LoyaltyAuditEntry, TenantFeatureFlags, Category } from './types';

const FULL_FEATURES: TenantFeatureFlags = {
  offline_mode: true,
  beta_access: true,
  ai_enabled: true,
  module_orders: true,
  module_tables: true,
  module_inventory: true,
  module_design: true,
  module_clients: true,
  module_finance: true,
  module_loyalty: true,
  module_staff: true,
  module_audit: true
};

const BASIC_FEATURES: TenantFeatureFlags = {
  offline_mode: false,
  beta_access: false,
  ai_enabled: true,
  module_orders: true,
  module_tables: true,
  module_inventory: true,
  module_design: true,
  module_clients: true,
  module_finance: false,
  module_loyalty: false,
  module_staff: true,
  module_audit: false
};

export const SAAS_PLANS: SaaSPlanDefinition[] = [
  {
    id: 'free',
    name: 'Plan Free',
    monthly_price: 0,
    max_staff: 2,
    max_tables: 5,
    max_products: 20,
    ai_credits_monthly: 50,
    features: { ...BASIC_FEATURES, ai_enabled: false }
  },
  {
    id: 'pro',
    name: 'SQUAD Pro',
    monthly_price: 49,
    max_staff: 15,
    max_tables: 40,
    max_products: 200,
    ai_credits_monthly: 2000,
    features: { ...FULL_FEATURES, beta_access: false }
  },
  {
    id: 'enterprise',
    name: 'Enterprise Matrix',
    monthly_price: 199,
    max_staff: 100,
    max_tables: 500,
    max_products: 2000,
    ai_credits_monthly: 10000,
    features: FULL_FEATURES
  }
];

export const MOCK_TENANTS: Tenant[] = [
  {
    id: 't-alpha',
    name: 'Palermo Central Coffee',
    owner_email: 'palermo@coffee.com',
    plan: 'pro',
    status: 'active',
    created_at: '2023-05-15',
    usage: { staff_count: 8, tables_count: 22, products_count: 85, ai_requests_this_month: 450, monthly_revenue: 12500 },
    feature_flags: FULL_FEATURES
  },
  {
    id: 't-beta',
    name: 'Little Bakery Soho',
    owner_email: 'bakery@soho.com',
    plan: 'free',
    status: 'active',
    created_at: '2023-11-01',
    usage: { staff_count: 2, tables_count: 4, products_count: 15, ai_requests_this_month: 12, monthly_revenue: 3400 },
    feature_flags: BASIC_FEATURES
  },
  {
    id: 't-gamma',
    name: 'CyberCoffee Gamma',
    owner_email: 'admin@gamma.com',
    plan: 'enterprise',
    status: 'suspended',
    created_at: '2023-01-10',
    usage: { staff_count: 45, tables_count: 120, products_count: 350, ai_requests_this_month: 2300, monthly_revenue: 45000 },
    feature_flags: FULL_FEATURES
  }
];

export const MOCK_GLOBAL_USERS: GlobalUser[] = [
  { id: 'gu-1', name: 'SuperAdmin Carlos', email: 'carlos@coffeesquad.ai', global_role: 'super_admin', associated_tenants: ['t-alpha', 't-beta', 't-gamma'], status: 'active' },
  { id: 'gu-2', name: 'Support Elena', email: 'elena@coffeesquad.ai', global_role: 'support', associated_tenants: ['t-alpha'], status: 'active' }
];

export const DEFAULT_AI_CONFIG: AIConfig = {
  isEnabled: true,
  activeMode: 'assistant',
  allowedRoles: ['role-admin'],
  capabilities: { help: true, analysis: true, actions: false },
  usageStats: { current: 450, limit: 5000 },
  plan: 'pro'
};

export const MOCK_NODES: CafeNode[] = [
  { id: 'node-alpha', name: 'Nodo Alpha', location: 'Palermo Soho, CABA', status: 'online' },
  { id: 'node-beta', name: 'Nodo Beta', location: 'Recoleta, CABA', status: 'online' },
  { id: 'node-gamma', name: 'Nodo Gamma', location: 'Nordelta, Tigre', status: 'offline' },
];

export const MOCK_ROLES: CustomRole[] = [
  {
    id: 'role-admin',
    name: 'Administrador Senior',
    description: 'Acceso total a todos los nodos del sistema.',
    permissions: {
      dashboard: { view: true, create: true, edit: true, delete: true },
      orders: { view: true, create: true, edit: true, delete: true },
      inventory: { view: true, create: true, edit: true, delete: true },
      recipes: { view: true, create: true, edit: true, delete: true },
      finance: { view: true, create: true, edit: true, delete: true },
      tables: { view: true, create: true, edit: true, delete: true },
      clients: { view: true, create: true, edit: true, delete: true },
      loyalty: { view: true, create: true, edit: true, delete: true },
      design: { view: true, create: true, edit: true, delete: true },
      staff: { view: true, create: true, edit: true, delete: true },
      audit: { view: true, create: true, edit: true, delete: true },
    },
    is_system: true
  }
];

export const MOCK_STAFF: StaffMember[] = [
  { id: 'u1', name: 'Carlos Admin', email: 'carlos@cafe.com', roleId: 'role-admin', role: 'owner', status: 'active', avatar: '', joinDate: '2023-01-10', lastActivity: 'Ahora' }
];

export const MOCK_CATEGORIES: Category[] = [
  { id: 'cat-coffee', name: 'Granos', color: '#B4965C', is_active: true, created_at: '2023-01-01' },
  { id: 'cat-dairy', name: 'Lácteos', color: '#FFFFFF', is_active: true, created_at: '2023-01-01' },
  { id: 'cat-coffee-bar', name: 'Cafetería', color: '#4ADE80', is_active: true, created_at: '2023-01-01' },
  { id: 'cat-alcohol', name: 'Alcohol', color: '#A855F7', is_active: true, created_at: '2023-01-01' },
  { id: 'cat-bakery', name: 'Pastelería', color: '#F472B6', is_active: true, created_at: '2023-01-01' }
];

export const MOCK_INVENTORY: InventoryItem[] = [
  { 
    id: 'i1', cafe_id: 'c1', name: 'Café en Grano Especialidad', sku: 'RAW-001', 
    item_type: 'ingredient', unit_type: 'gram', 
    image_url: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&q=80&w=200', 
    is_active: true, min_stock: 5000, current_stock: 12500, cost: 0.04, category: 'Granos', category_ids: ['cat-coffee'],
    presentations: [
      { id: 'pres-1', name: 'Bolsa 1kg', quantity_in_base: 1000, cost: 40, is_default: true },
      { id: 'pres-2', name: 'Bolsa 250g', quantity_in_base: 250, cost: 12 }
    ],
    closed_packages: [{ presentation_id: 'pres-1', count: 12 }],
    open_packages: [{ presentation_id: 'pres-1', remaining_quantity: 500 }]
  },
  { 
    id: 'i2', cafe_id: 'c1', name: 'Leche Entera', sku: 'RAW-002', 
    item_type: 'ingredient', unit_type: 'ml', 
    image_url: 'https://images.unsplash.com/photo-1563636619-e910ef44755d?auto=format&fit=crop&q=80&w=200', 
    is_active: true, min_stock: 5000, current_stock: 15450, cost: 0.0012, category: 'Lácteos', category_ids: ['cat-dairy'],
    presentations: [
      { id: 'pres-3', name: 'Cartón 1L', quantity_in_base: 1000, cost: 1.20, is_default: true },
      { id: 'pres-4', name: 'Pack 12L', quantity_in_base: 12000, cost: 13.50 }
    ],
    closed_packages: [{ presentation_id: 'pres-3', count: 15 }],
    open_packages: [{ presentation_id: 'pres-3', remaining_quantity: 450 }]
  },
  { 
    id: 'p1', cafe_id: 'c1', name: 'Flat White Standard', sku: 'FIN-001', 
    item_type: 'sellable', unit_type: 'unit', 
    image_url: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&q=80&w=200', 
    is_active: true, min_stock: 0, current_stock: 100, cost: 1.25, price: 4.50, category: 'Cafetería', category_ids: ['cat-coffee-bar'],
    recipe: [
      { ingredientId: 'i1', quantity: 18 },
      { ingredientId: 'i2', quantity: 200 }
    ],
    presentations: [], closed_packages: [], open_packages: []
  }
];

export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'p1',
    name: 'Flat White Standard',
    sku: 'FIN-001',
    category: 'Cafetería',
    image: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&q=80&w=200',
    price: 4.50,
    stock: 100,
    stockStatus: 'Alto',
    available: true,
    variants: [
      { id: 'v1', name: 'Grande', price_adjustment: 1.5 },
      { id: 'v2', name: 'Chico', price_adjustment: 0 }
    ],
    addons: [
      { id: 'a1', name: 'Extra Shot', price: 1.0, inventory_item_id: 'i1' }
    ]
  }
];

export const MOCK_LOTS: InventoryLot[] = [
  { id: 'L1', productId: 'p1', purchaseDate: '2023-11-01', expirationDate: '2023-12-01', initialQty: 50, currentQty: 30 }
];

export const MOCK_ADJUSTMENTS: StockAdjustment[] = [
  { id: 'ADJ1', productId: 'p1', deltaQty: -2, reason: 'Daño', staffName: 'Carlos Admin', timestamp: '2023-11-20 15:30' }
];

export const MOCK_RECIPES: Recipe[] = [
  {
    id: 'rec1',
    final_product_id: 'p1',
    yield_quantity: 1,
    items: [
      { ingredient_id: 'i1', quantity_required: 18, unit_type: 'gram' },
      { ingredient_id: 'i2', quantity_required: 200, unit_type: 'ml' }
    ]
  }
];

export const MOCK_MOVEMENTS: InventoryMovement[] = [
  { id: 'm1', inventory_item_id: 'i1', movement_type: 'purchase', quantity_delta: 5000, unit_type: 'gram', timestamp: '2023-11-20 10:00', staff_name: 'Carlos Admin', note: 'Compra mensual proveedor' }
];

export const MOCK_ORDERS: Order[] = [
  { 
    id: '592', 
    customer: 'Ana Maria R.', 
    time: 'hace 8 min', 
    items: [{ id: 'oi1', name: 'Flat White', quantity: 1, price_unit: 4.5, inventory_items_to_deduct: [] }], 
    status: 'Listo', 
    type: 'Mesa', 
    paid: true, 
    amount: 12.50,
    source: 'POS Manual',
    activity: [{ id: 'a1', type: 'creado', user: 'Carlos Admin', timestamp: '18:10', detail: 'Pedido iniciado desde consola' }]
  }
];

export const MOCK_TABLES: Table[] = [
  { id: '1', name: 'Mesa 01', zone: 'Salón Principal', status: 'Libre', type: 'table', active: true, lastScan: '30 min', qrCodeUrl: '...' }
];

export const MOCK_REWARDS: Reward[] = [
  { id: 'r1', name: 'Café Americano', points: 450, image: '', is_active: true }
];

export const MOCK_CLIENTS: Client[] = [
  { id: 'cli-1', name: 'Ana Maria R.', email: 'ana.mar@gmail.com', join_date: '2023-08-12', last_visit: 'Hace 8 min', total_spent: 450.50, orders_count: 24, points_balance: 1250, status: 'active', is_vip: true, notes: [] }
];

export const MOCK_AUDIT_LOG: AuditLogEntry[] = [
  { id: 'log1', userName: 'Carlos Admin', userRole: 'owner', category: 'stock', action: 'Compra', entity: 'Café', detail: 'Ingreso de 5kg', timestamp: '2023-11-20 09:00', impact: 'positive' }
];

export const MOCK_FINANCE_STATS = {
  orderSources: [{ name: 'Mesa (QR)', value: 65 }, { name: 'Takeaway', value: 25 }, { name: 'Delivery', value: 10 }]
};

export const MOCK_CASH_SESSIONS: CashRegisterSession[] = [
  { id: 's1', opened_at: '2023-11-20 08:00', opened_by: 'Carlos Admin', total_orders: 12, total_revenue: 4500, status: 'open' }
];

// --- MISSING MOCK DATA FOR LOYALTY ---
export const MOCK_PRODUCT_LOYALTY: ProductLoyaltyRule[] = [
  { productId: 'p1', type: 'custom', multiplier: 1.5, reason: 'Promo Invierno' }
];

export const MOCK_LOYALTY_AUDIT: LoyaltyAuditEntry[] = [
  { id: 'la1', action: 'Cambio de Regla', timestamp: '2023-11-21 14:00', change: 'Multiplicador Flat White 1.0 -> 1.5', user: 'Carlos Admin' }
];
