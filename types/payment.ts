// Estado de una orden
export type OrderStatus =
    | 'draft'
    | 'pending'
    | 'paid'
    | 'preparing'
    | 'ready'
    | 'served'
    | 'cancelled'
    | 'refunded';

// Canal de la orden
export type OrderChannel = 'table' | 'qr' | 'takeaway' | 'delivery';

// Información de la tienda
export interface Store {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    address: string | null;
    menu_theme: Record<string, any> | null;
    menu_logic: Record<string, any> | null;
    // Campos de Mercado Pago (solo lectura)
    mp_user_id: string | null; // Si existe, puede procesar pagos
    mp_nickname: string | null;
    mp_email: string | null;
}

// Producto del menú
export interface Product {
    id: string;
    name: string;
    description: string | null;
    base_price: number;
    category: string | null;
    category_slug: string | null;
    is_available: boolean | null;
    active: boolean;
    store_id: string;
}

// Item del inventario (si usas inventory_items)
export interface InventoryItem {
    id: string;
    name: string;
    description: string | null;
    price: number | null;
    category_id: string | null;
    is_menu_visible: boolean | null;
    image_url: string | null;
    store_id: string;
}

// Estado de pago (separado de status de orden)
export type PaymentStatus = 'init' | 'pending' | 'approved' | 'rejected' | 'refunded' | 'cancelled';

// Orden
export interface Order {
    id: string;
    store_id: string;
    status: OrderStatus;
    payment_status: PaymentStatus; // NUEVO: estado de pago separado
    payment_provider: string | null; // NUEVO: 'mercadopago', 'cash', etc.
    channel: OrderChannel;
    total_amount: number;
    subtotal: number;
    tax_amount: number;
    discount_amount: number;
    payment_id: string | null;
    paid_at: string | null;
    table_number: string | null;
    location_identifier: string | null;
    delivery_mode: string | null;
    created_at: string;
    updated_at: string;
}

// Item para checkout
export interface CheckoutItem {
    title: string;
    quantity: number;
    unit_price: number;
    description?: string;
    currency_id?: string;
}

// Respuesta del checkout
export interface CheckoutResponse {
    preference_id: string;
    checkout_url: string;
    sandbox_url: string;
    error?: string; // Making optional to match code usage
    code?: string; // Making optional to match code usage
}

// Error de checkout
export interface CheckoutError {
    code: string;
    message: string;
}

// URLs de retorno
export interface BackUrls {
    success?: string;
    failure?: string;
    pending?: string;
}
