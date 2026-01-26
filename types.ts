
export type ItemType = 'ingredient' | 'sellable' | 'prepared' | 'final_product' | 'pack';
export type UnitType = 'unit' | 'gram' | 'ml' | 'kg' | 'oz' | 'liter';
export type MovementType = 'purchase' | 'manual_adjustment' | 'recipe_consumption' | 'sale' | 'waste' | 'return' | 'TRANSFER' | 'PURCHASE' | 'WASTE' | 'ADJUSTMENT';

// --- SAAS & TENANT CONTROL ---

export interface MenuLogic {
  // 1. Operación General
  operation: {
    isOpen: boolean; // Master switch
    messageClosed?: string; // "Cerrado por reformas", etc.
    estimatedWaitMinutes?: number;
  };

  // 2. Gestión de Canales (Gatekeepers)
  channels: {
    dineIn: {
      enabled: boolean; // "Mesa"
      allowOrdering: boolean; // Si false, solo ver carta
    };
    takeaway: {
      enabled: boolean; // "Para llevar"
      minTimeMinutes?: number;
    };
    delivery: {
      enabled: boolean;
      radiusKm?: number;
      minOrderAmount?: number;
    };
    staff?: {
      enabled: boolean;
      requirePin: boolean;
    };
  };

  // 3. Experiencia Cliente (Features)
  features: {
    wallet: {
      allowTopUp: boolean; // "Cargar saldo"
      allowPayment: boolean; // "Pagar con saldo"
    };
    loyalty: {
      enabled: boolean; // "Programa de puntos"
      showPoints: boolean; // Mostrar puntos en header
    };
    guestMode: {
      enabled: boolean; // Permitir entrar sin login
      allowOrdering: boolean; // Permitir pedir sin login (poco común, pero posible)
    };
  };

  // 4. Reglas de Menú
  rules: {
    hideOutofStock: boolean; // Si true, items con stock <= 0 desaparecen
    enforceStock: boolean; // Si true, bloquea add-to-cart si stock <= 0 (aunque se vea)
    showCalories: boolean;
    showAllergens: boolean;
  };

  // 5. Menús Dinámicos (New)
  dynamic_menus?: {
    enabled: boolean;
    menus: {
      id: string;
      name: string; // "Almuerzo", "Cena", "VIP", "Terraza"
      isActive: boolean;
      schedule?: {
        enabled: boolean;
        days: number[]; // 0=Sun, 1=Mon...
        start: string; // '00:00'
        end: string; // '23:59'
      };
      node_ids?: string[]; // Specific tables/nodes (if empty, applies generally if schedule matches)
      category_ids?: string[]; // Whitelist: only show these categories
    }[];
  };
}
export interface MenuTheme {
  // Marca
  storeName: string;
  logoUrl?: string;
  headerImage?: string;
  headerOverlay?: number;
  headerAlignment?: 'left' | 'center';

  // Colores
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;

  // Layout & Forma
  layoutMode: 'grid' | 'list';
  columns: 1 | 2;
  cardStyle: 'glass' | 'solid' | 'minimal' | 'border' | 'floating';
  borderRadius: 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
  fontStyle: 'modern' | 'serif' | 'mono' | 'sans';

  // Visibilidad
  showImages: boolean;
  showPrices: boolean;
  showDescription: boolean;
  showAddButton: boolean;
  showBadges: boolean;

  // Legacy support (optional)
  showQuickAdd?: boolean;
  showPromoBanner?: boolean; // New: Controls visibility for registered users
  promoBannerUrl?: string; // New: Custom image for the banner
}

export type TenantPlan = 'free' | 'trial' | 'basic' | 'pro' | 'enterprise';
export type TenantStatus = 'active' | 'suspended' | 'trial_expired';

export interface SaaSPlanDefinition {
  id: TenantPlan;
  name: string;
  monthly_price: number;
  max_staff: number;
  max_tables: number;
  max_products: number;
  ai_credits_monthly: number;
  features: TenantFeatureFlags;
}

export interface TenantFeatureFlags {
  // Infra/Beta
  offline_mode: boolean;
  beta_access: boolean;
  ai_enabled: boolean;
  // Dashboard Modules
  module_orders: boolean;
  module_tables: boolean;
  module_inventory: boolean;
  module_design: boolean;
  module_clients: boolean;
  module_finance: boolean;
  module_loyalty: boolean;
  module_staff: boolean;
  module_audit: boolean;
}

export interface Tenant {
  id: string;
  name: string;
  owner_email: string;
  plan: TenantPlan;
  status: TenantStatus;
  created_at: string;
  trial_end_date?: string;
  usage: {
    staff_count: number;
    tables_count: number;
    products_count: number;
    ai_requests_this_month: number;
    monthly_revenue: number;
  };
  feature_flags: TenantFeatureFlags;
}

export interface Store {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  address?: string;
  tax_info?: string;
  owner_email?: string;
  plan?: string;
  onboarding_status?: string;
  service_mode?: 'counter' | 'table' | 'club';
  menu_theme?: any;
  menu_logic?: MenuLogic;
  created_at: string;
  updated_at: string;
  // Mercado Pago Fields
  mp_connected?: boolean;
  mp_user_id?: string;
  mp_nickname?: string;
  mp_email?: string;
  mp_connected_at?: string;
}

// --- IA CONFIG ---
export type AIMode = 'assistant' | 'agent';
export type AIPlan = 'free' | 'pro' | 'enterprise';

export interface AIConfig {
  isEnabled: boolean;
  activeMode: AIMode;
  allowedRoles: string[];
  capabilities: {
    help: boolean;
    analysis: boolean;
    actions: boolean;
  };
  usageStats: {
    current: number;
    limit: number;
  };
  plan: AIPlan;
}

// --- INVOICE PROCESSING (AI) ---
export type InvoiceStatus = 'pending' | 'processing' | 'extracted' | 'confirmed' | 'error';

export interface Invoice {
  id: string;
  store_id: string;
  proveedor: string;
  fecha_factura: string;
  nro_factura: string;
  subtotal: number;
  iva_total: number;
  total: number;
  image_url: string;
  status: InvoiceStatus;
  raw_extraction?: any;
  created_at: string;
  confirmed_at?: string;
  items?: InvoiceItem[];
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  bonification: number;
  tax_amount: number;
  total_line: number;
  matched_inventory_id?: string;
  is_new_item: boolean;
  category_id?: string;
}
export interface Category {
  id: string;
  store_id?: string;
  name: string;
  type?: string;
  color?: string;
  icon?: string;
  position?: number;
  created_at?: string;
  is_active?: boolean;
  is_system?: boolean; // For "Abiertos", etc.
}

export interface RecipeComponent {
  ingredientId: string;
  quantity: number;
}

export interface InventoryItem {
  id: string;
  cafe_id: string;
  name: string;
  sku: string;
  item_type: ItemType;
  unit_type: UnitType;
  image_url: string;
  is_active: boolean;
  min_stock: number;
  current_stock: number;
  open_count?: number; // Number of opened packages
  category?: string; // Legacy/Display name
  category_ids?: string[]; // Relational IDs
  cost: number;
  price?: number;
  provider?: string;
  recipe?: RecipeComponent[];
  last_cost_update?: string;
  presentations: ProductPresentation[];
  closed_packages: ClosedPackageCount[];
  open_packages: OpenPackage[];
  is_menu_visible?: boolean;
  description?: string;
  is_recommended?: boolean;
  is_new?: boolean;
  is_promo?: boolean;
  sort_order?: number;
  variants?: ProductVariant[];
  // Phase 4 & Locations fields
  last_supplier_id?: string | null;
  last_purchase_price?: number | null;
  package_size?: number;
  unit_size?: number; // Legacy or Alias
  // Consolidated relationships
  addon_links?: ProductAddon[];
  combo_links?: { id: string, component_item_id: string, quantity: number }[];

  // Deprecated/Removed
  // addons prop removed in favor of addon_links
  // combo_items prop removed in favor of combo_links
}

export interface ProductPresentation {
  id: string;
  name: string;
  quantity_in_base: number;
  cost: number;
  provider?: string;
  is_default?: boolean;
}

export interface OpenPackage {
  id?: string;
  presentation_id: string;
  package_capacity: number; // Total capacity in base units (e.g., 1000 for 1L)
  remaining: number; // Remaining quantity in base units
  location?: string; // Bar/station name (for future multi-bar support)
  opened_at?: string; // ISO timestamp
  remaining_quantity: number; // Legacy field, kept for backwards compatibility
}

export interface ClosedPackageCount {
  presentation_id: string;
  count: number;
}

export interface ProductVariant {
  id: string;
  name: string;
  price_adjustment: number;
  recipe_multiplier?: number; // NEW: Multiplies ALL base recipe ingredients (e.g., 1.5 for "Grande")
  // Permite definir que esta variante consume X cantidad más/menos de un ingrediente base
  recipe_overrides?: {
    ingredient_id: string;
    consumption_type?: 'fixed' | 'multiplier'; // NEW: 'fixed' (+50ml) or 'multiplier' (x1.5)
    value?: number; // The amount to add or the multiplier factor
    quantity_delta: number; // Legacy: kept for simple fixed deltas or mapped from value
  }[];
}

export interface ProductAddon {
  id: string;
  name: string;
  price: number;
  inventory_item_id: string;
  quantity_consumed?: number; // Ej: 18 (gramos)
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  image: string;
  price: number;
  stock: number;
  stockStatus: 'Alto' | 'Bajo';
  available: boolean;
  variants: ProductVariant[];
  addons: ProductAddon[];
}

export interface InventoryLot {
  id: string;
  productId: string;
  purchaseDate: string;
  expirationDate: string;
  initialQty: number;
  currentQty: number;
}

export type AdjustmentReason = 'Pérdida' | 'Daño' | 'Robo' | 'Vencimiento' | 'Corrección Manual';

export interface StockAdjustment {
  id: string;
  productId: string;
  deltaQty: number;
  reason: AdjustmentReason;
  staffName: string;
  timestamp: string;
}

export interface AuditLogEntry {
  id: string;
  userName: string;
  userRole: string;
  category: AuditCategory;
  action: string;
  entity: string;
  detail: string;
  timestamp: string;
  impact: string;
  tenant_id?: string;
}

export type AuditCategory = 'stock' | 'orders' | 'finance' | 'staff' | 'system' | 'saas_admin';

// --- SAAS ROLES ---
export type GlobalRoleType = 'super_admin' | 'support' | 'auditor' | 'regular_user';

export interface GlobalUser {
  id: string;
  name: string;
  email: string;
  global_role: GlobalRoleType;
  associated_tenants: string[];
  status: 'active' | 'suspended';
}

export interface Order {
  id: string;
  store_id?: string; // Added for context
  customer: string;
  client_id?: string; // Linked client ID
  client_email?: string; // New field for registered users
  time: string;
  items: OrderItem[];
  status: OrderStatus;
  type: string;
  paid: boolean;
  amount: number;
  priority?: string;
  source?: string;
  activity?: OrderActivity[];
  table?: string;
  node_id?: string;
  paymentMethod?: string;
  order_number?: number;
  table_number?: string; // Consistency with DBOrder
  created_at: string;
  lastModified?: number; // Offline sync tracking
  // Payment fields for badges
  payment_provider?: string;
  payment_status?: string;
  is_paid?: boolean;
}

export type OrderStatus = 'Pendiente' | 'En Preparación' | 'Listo' | 'Entregado' | 'Cancelado' | 'Demorado';

export interface OrderItem {
  id: string;
  productId?: string;
  name: string;
  quantity: number;
  price_unit: number;
  variant?: string;
  addons?: string[];
  note?: string;
  is_manual?: boolean;
  sellable_type?: string;
  inventory_items_to_deduct: { id: string, qty: number }[];
}

export interface OrderActivity {
  id: string;
  type: string;
  user: string;
  timestamp: string;
  detail: string;
}

export type TableStatus = 'Libre' | 'Ocupada' | 'Lista para cerrar';

export interface Table {
  id: string;
  name: string;
  zone: string;
  status: TableStatus;
  type: 'table' | 'area';
  active: boolean;
  lastScan: string;
  qrCodeUrl: string;
}

export interface StoreTable {
  id: string;
  store_id: string;
  label: string;
  qr_code_url: string | null;
  is_active: boolean;
  created_at?: string;
}

export interface Reward {
  id: string;
  name: string;
  points: number;
  image: string;
  is_active: boolean;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  join_date: string;
  last_visit: string;
  total_spent: number;
  orders_count: number;
  points_balance: number;
  wallet_balance: number; // NUEVO: saldo de wallet
  status: 'active' | 'blocked';
  is_vip: boolean;
  notes: any[];
}

export interface CashRegisterSession {
  id: string;
  opened_at: string;
  closed_at?: string;
  opened_by: string;
  total_orders: number;
  total_revenue: number;
  status: 'open' | 'closed';
}

export interface CafeNode {
  id: string;
  name: string;
  location: string;
  status: 'online' | 'offline';
}

export interface CustomRole {
  id: string;
  name: string;
  description: string;
  permissions: RolePermissions;
  is_system?: boolean;
}

export interface RolePermissions {
  [key: string]: {
    view: boolean;
    create: boolean;
    edit: boolean;
    delete: boolean;
  };
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  roleId: string;
  role?: string;
  status: 'active' | 'suspended' | 'pending';
  avatar: string;
  joinDate: string;
  lastActivity?: string;
}

export interface InventoryMovement {
  id: string;
  inventory_item_id: string;
  movement_type: MovementType;
  quantity_delta: number;
  unit_type: UnitType;
  timestamp: string;
  staff_name: string;
  note: string;
}

export interface RecipeItem {
  ingredient_id: string;
  quantity_required: number;
  unit_type: UnitType;
}

export interface Recipe {
  id: string;
  final_product_id: string;
  yield_quantity: number;
  items: RecipeItem[];
}

// --- STOCK TRANSFER SYSTEM ---
export interface StorageLocation {
  id: string;
  store_id: string;
  name: string;
  type: 'warehouse' | 'point_of_sale' | 'kitchen';
  is_default: boolean;
}

export interface ItemStockLevel {
  id: string;
  inventory_item_id: string;
  location_id: string;
  quantity: number;
  location?: StorageLocation; // For frontend joins
}

export interface StockTransfer {
  id: string;
  inventory_item_id: string;
  from_location_id?: string;
  to_location_id?: string;
  quantity: number;
  user_id: string;
  notes?: string;
  created_at: string;
  from_location?: StorageLocation;
  to_location?: StorageLocation;
  user?: { email: string }; // For display
}

// --- MISSING TYPES ---
export type SectionSlug = 'dashboard' | 'orders' | 'inventory' | 'recipes' | 'finance' | 'tables' | 'clients' | 'loyalty' | 'design' | 'staff' | 'audit';
export type StaffStatus = 'active' | 'suspended' | 'pending';

export interface TableHistoryEvent {
  id: string;
  tableId: string;
  tableName: string;
  type: string;
  timestamp: string;
  details: string;
}

export type LoyaltyRuleType = 'general' | 'custom' | 'none';
export type RoundingType = 'down' | 'normal';

export interface LoyaltyConfig {
  isActive: boolean;
  baseAmount: number;
  basePoints: number;
  rounding: RoundingType;
  manualOrdersEarn: boolean;
  discountedOrdersEarn: boolean;
  combosEarn: boolean;
}

export interface ProductLoyaltyRule {
  productId: string;
  type: LoyaltyRuleType;
  multiplier?: number;
  reason?: string;
}

export interface LoyaltyAuditEntry {
  id: string;
  action: string;
  timestamp: string;
  change: string;
  user: string;
}

export interface LoyaltyTransaction {
  id: string;
  amount: number;
  type: 'earn' | 'redeem';
  timestamp: string;
  detail: string;
}

export interface ExtractedInvoiceItem {
  name: string;
  quantity: number;
  unitPrice: number;
  unit: string;
  category?: string; // Added for auto-categorization
  matchedItemId?: string;
}

export interface InvoiceAnalysis {
  provider: string;
  invoiceNumber: string;
  date: string;
  items: ExtractedInvoiceItem[];
}
