export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Database = {
    // Allows to automatically instantiate createClient with right options
    // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
    __InternalSupabase: {
        PostgrestVersion: "14.1"
    }
    public: {
        Tables: {
            cafe_role_permissions: {
                Row: {
                    can_create: boolean | null
                    can_delete: boolean | null
                    can_edit: boolean | null
                    can_view: boolean | null
                    created_at: string | null
                    id: string
                    role_id: string
                    section_slug: string
                }
                Insert: {
                    can_create?: boolean | null
                    can_delete?: boolean | null
                    can_edit?: boolean | null
                    can_view?: boolean | null
                    created_at?: string | null
                    id?: string
                    role_id: string
                    section_slug: string
                }
                Update: {
                    can_create?: boolean | null
                    can_delete?: boolean | null
                    can_edit?: boolean | null
                    can_view?: boolean | null
                    created_at?: string | null
                    id?: string
                    role_id?: string
                    section_slug?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "cafe_role_permissions_role_id_fkey"
                        columns: ["role_id"]
                        isOneToOne: false
                        referencedRelation: "cafe_roles"
                        referencedColumns: ["id"]
                    },
                ]
            }
            cafe_roles: {
                Row: {
                    created_at: string | null
                    description: string | null
                    id: string
                    is_system: boolean | null
                    name: string
                    store_id: string
                    updated_at: string | null
                }
                Insert: {
                    created_at?: string | null
                    description?: string | null
                    id?: string
                    is_system?: boolean | null
                    name: string
                    store_id: string
                    updated_at?: string | null
                }
                Update: {
                    created_at?: string | null
                    description?: string | null
                    id?: string
                    is_system?: boolean | null
                    name?: string
                    store_id?: string
                    updated_at?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "cafe_roles_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: false
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    },
                ]
            }
            clients: {
                Row: {
                    created_at: string
                    email: string
                    id: string
                    is_vip: boolean | null
                    join_date: string | null
                    last_visit: string | null
                    name: string
                    notes: Json | null
                    points_balance: number | null
                    status: string | null
                    total_spent: number | null
                    updated_at: string
                    wallet_balance: number | null
                }
                Insert: {
                    created_at?: string
                    email: string
                    id?: string
                    is_vip?: boolean | null
                    join_date?: string | null
                    last_visit?: string | null
                    name: string
                    notes?: Json | null
                    points_balance?: number | null
                    status?: string | null
                    total_spent?: number | null
                    updated_at?: string
                    wallet_balance?: number | null
                }
                Update: {
                    created_at?: string
                    email?: string
                    id?: string
                    is_vip?: boolean | null
                    join_date?: string | null
                    last_visit?: string | null
                    name?: string
                    notes?: Json | null
                    points_balance?: number | null
                    status?: string | null
                    total_spent?: number | null
                    updated_at?: string
                    wallet_balance?: number | null
                }
                Relationships: []
            }
            inventory_items: {
                Row: {
                    category_id: string | null
                    created_at: string
                    current_stock: number
                    id: string
                    item_type: string
                    min_stock: number
                    name: string
                    sku: string
                    store_id: string
                    unit_type: string
                    updated_at: string
                }
                Insert: {
                    category_id?: string | null
                    created_at?: string
                    current_stock?: number
                    id?: string
                    item_type: string
                    min_stock?: number
                    name: string
                    sku: string
                    store_id: string
                    unit_type: string
                    updated_at?: string
                }
                Update: {
                    category_id?: string | null
                    created_at?: string
                    current_stock?: number
                    id?: string
                    item_type?: string
                    min_stock?: number
                    name?: string
                    sku?: string
                    store_id?: string
                    unit_type?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "inventory_items_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: false
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    },
                ]
            }
            loyalty_vouchers: {
                Row: {
                    client_id: string
                    code: string
                    created_at: string
                    expires_at: string | null
                    id: string
                    is_used: boolean | null
                    points_cost: number
                    reward_id: string
                    store_id: string
                    used_at: string | null
                }
                Insert: {
                    client_id: string
                    code: string
                    created_at?: string
                    expires_at?: string | null
                    id?: string
                    is_used?: boolean | null
                    points_cost: number
                    reward_id: string
                    store_id: string
                    used_at?: string | null
                }
                Update: {
                    client_id?: string
                    code?: string
                    created_at?: string
                    expires_at?: string | null
                    id?: string
                    is_used?: boolean | null
                    points_cost?: number
                    reward_id?: string
                    store_id?: string
                    used_at?: string | null
                }
                Relationships: []
            }
            order_items: {
                Row: {
                    id: string
                    order_id: string
                    product_id: string | null
                    product_name: string | null
                    quantity: number
                    price_at_time: number
                    status: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    order_id: string
                    product_id?: string | null
                    product_name?: string | null
                    quantity?: number
                    price_at_time: number
                    status?: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    order_id?: string
                    product_id?: string | null
                    product_name?: string | null
                    quantity?: number
                    price_at_time?: number
                    status?: string
                    created_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "order_items_order_id_fkey"
                        columns: ["order_id"]
                        isOneToOne: false
                        referencedRelation: "orders"
                        referencedColumns: ["id"]
                    }
                ]
            }
            orders: {
                Row: {
                    channel: string
                    client_id: string | null
                    created_at: string
                    created_by_user_id: string | null
                    delivery_mode: string | null
                    delivery_status: string | null
                    discount_amount: number
                    id: string
                    is_paid: boolean | null
                    items: Json | null
                    location_identifier: string | null
                    node_id: string | null
                    source_location_id: string | null
                    order_number: number
                    paid_at: string | null
                    payment_id: string | null
                    payment_method: string | null
                    payment_provider: string | null
                    payment_status: string
                    pickup_code: string | null
                    placed_at: string
                    status: string
                    stock_deducted: boolean
                    store_id: string
                    subtotal: number
                    table_number: string | null
                    tax_amount: number
                    total_amount: number
                    updated_at: string
                }
                Insert: {
                    channel?: string
                    client_id?: string | null
                    created_at?: string
                    created_by_user_id?: string | null
                    delivery_mode?: string | null
                    delivery_status?: string | null
                    discount_amount?: number
                    id?: string
                    is_paid?: boolean | null
                    items?: Json | null
                    location_identifier?: string | null
                    node_id?: string | null
                    source_location_id?: string | null
                    order_number?: number
                    paid_at?: string | null
                    payment_id?: string | null
                    payment_method?: string | null
                    payment_provider?: string | null
                    payment_status?: string
                    pickup_code?: string | null
                    placed_at?: string
                    status?: string
                    stock_deducted?: boolean
                    store_id: string
                    subtotal?: number
                    table_number?: string | null
                    tax_amount?: number
                    total_amount: number
                    updated_at?: string
                }
                Update: {
                    channel?: string
                    client_id?: string | null
                    created_at?: string
                    created_by_user_id?: string | null
                    delivery_mode?: string | null
                    delivery_status?: string | null
                    discount_amount?: number
                    id?: string
                    is_paid?: boolean | null
                    items?: Json | null
                    location_identifier?: string | null
                    node_id?: string | null
                    source_location_id?: string | null
                    order_number?: number
                    paid_at?: string | null
                    payment_id?: string | null
                    payment_method?: string | null
                    payment_provider?: string | null
                    payment_status?: string
                    pickup_code?: string | null
                    placed_at?: string
                    status?: string
                    stock_deducted?: boolean
                    store_id?: string
                    subtotal?: number
                    table_number?: string | null
                    tax_amount?: number
                    total_amount?: number
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "orders_client_id_fkey"
                        columns: ["client_id"]
                        isOneToOne: false
                        referencedRelation: "clients"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "orders_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: false
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "orders_node_id_fkey"
                        columns: ["node_id"]
                        isOneToOne: false
                        referencedRelation: "venue_nodes"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "orders_source_location_id_fkey"
                        columns: ["source_location_id"]
                        isOneToOne: false
                        referencedRelation: "storage_locations"
                        referencedColumns: ["id"]
                    },
                ]
            }
            product_addons: {
                Row: {
                    created_at: string
                    id: string
                    inventory_item_id: string
                    name: string
                    price: number
                    quantity_consumed: number | null
                    updated_at: string
                }
                Insert: {
                    created_at?: string
                    id?: string
                    inventory_item_id: string
                    name: string
                    price: number
                    quantity_consumed?: number | null
                    updated_at?: string
                }
                Update: {
                    created_at?: string
                    id?: string
                    inventory_item_id?: string
                    name?: string
                    price?: number
                    quantity_consumed?: number | null
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "product_addons_inventory_item_id_fkey"
                        columns: ["inventory_item_id"]
                        isOneToOne: false
                        referencedRelation: "inventory_items"
                        referencedColumns: ["id"]
                    },
                ]
            }
            product_recipes: {
                Row: {
                    created_at: string
                    id: string
                    inventory_item_id: string
                    product_id: string
                    quantity_required: number
                    updated_at: string
                }
                Insert: {
                    created_at?: string
                    id?: string
                    inventory_item_id: string
                    product_id: string
                    quantity_required: number
                    updated_at?: string
                }
                Update: {
                    created_at?: string
                    id?: string
                    inventory_item_id?: string
                    product_id?: string
                    quantity_required?: number
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "product_recipes_inventory_item_id_fkey"
                        columns: ["inventory_item_id"]
                        isOneToOne: false
                        referencedRelation: "inventory_items"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "product_recipes_product_id_fkey"
                        columns: ["product_id"]
                        isOneToOne: false
                        referencedRelation: "products"
                        referencedColumns: ["id"]
                    },
                ]
            }
            product_variants: {
                Row: {
                    created_at: string
                    id: string
                    name: string
                    price_adjustment: number
                    product_id: string
                    updated_at: string
                }
                Insert: {
                    created_at?: string
                    id?: string
                    name: string
                    price_adjustment?: number
                    product_id: string
                    updated_at?: string
                }
                Update: {
                    created_at?: string
                    id?: string
                    name?: string
                    price_adjustment?: number
                    product_id?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "product_variants_product_id_fkey"
                        columns: ["product_id"]
                        isOneToOne: false
                        referencedRelation: "products"
                        referencedColumns: ["id"]
                    },
                ]
            }
            products: {
                Row: {
                    available: boolean | null
                    category_id: string | null
                    created_at: string
                    description: string | null
                    id: string
                    image_url: string | null
                    is_new: boolean | null
                    is_promo: boolean | null
                    is_recommended: boolean | null
                    name: string
                    price: number
                    sku: string
                    sort_order: number | null
                    status: string | null
                    store_id: string
                    updated_at: string
                }
                Insert: {
                    available?: boolean | null
                    category_id?: string | null
                    created_at?: string
                    description?: string | null
                    id?: string
                    image_url?: string | null
                    is_new?: boolean | null
                    is_promo?: boolean | null
                    is_recommended?: boolean | null
                    name: string
                    price: number
                    sku: string
                    sort_order?: number | null
                    status?: string | null
                    store_id: string
                    updated_at?: string
                }
                Update: {
                    available?: boolean | null
                    category_id?: string | null
                    created_at?: string
                    description?: string | null
                    id?: string
                    image_url?: string | null
                    is_new?: boolean | null
                    is_promo?: boolean | null
                    is_recommended?: boolean | null
                    name?: string
                    price?: number
                    sku?: string
                    sort_order?: number | null
                    status?: string | null
                    store_id?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "products_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: false
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    },
                ]
            }
            profiles: {
                Row: {
                    avatar_url: string | null
                    created_at: string
                    full_name: string | null
                    id: string
                    role: string | null
                    store_id: string | null
                    updated_at: string
                }
                Insert: {
                    avatar_url?: string | null
                    created_at?: string
                    full_name?: string | null
                    id: string
                    role?: string | null
                    store_id?: string | null
                    updated_at?: string
                }
                Update: {
                    avatar_url?: string | null
                    created_at?: string
                    full_name?: string | null
                    id?: string
                    role?: string | null
                    store_id?: string | null
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "profiles_id_fkey"
                        columns: ["id"]
                        isOneToOne: true
                        referencedRelation: "users"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "profiles_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: false
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    },
                ]
            }
            store_tables: {
                Row: {
                    created_at: string
                    id: string
                    is_active: boolean
                    label: string
                    qr_code_url: string | null
                    store_id: string
                }
                Insert: {
                    created_at?: string
                    id?: string
                    is_active?: boolean
                    label: string
                    qr_code_url?: string | null
                    store_id: string
                }
                Update: {
                    created_at?: string
                    id?: string
                    is_active?: boolean
                    label?: string
                    qr_code_url?: string | null
                    store_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "store_tables_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: false
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    },
                ]
            }
            storage_locations: {
                Row: {
                    created_at: string | null
                    id: string
                    is_default: boolean | null
                    name: string
                    store_id: string
                    type: string
                    updated_at: string | null
                }
                Insert: {
                    created_at?: string | null
                    id?: string
                    is_default?: boolean | null
                    name: string
                    store_id: string
                    type: string
                    updated_at?: string | null
                }
                Update: {
                    created_at?: string | null
                    id?: string
                    is_default?: boolean | null
                    name?: string
                    store_id?: string
                    type?: string
                    updated_at?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "storage_locations_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: false
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    },
                ]
            }
            item_stock_levels: {
                Row: {
                    id: string
                    inventory_item_id: string
                    location_id: string
                    quantity: number
                    updated_at: string | null
                }
                Insert: {
                    id?: string
                    inventory_item_id: string
                    location_id: string
                    quantity: number
                    updated_at?: string | null
                }
                Update: {
                    id?: string
                    inventory_item_id?: string
                    location_id?: string
                    quantity?: number
                    updated_at?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "item_stock_levels_inventory_item_id_fkey"
                        columns: ["inventory_item_id"]
                        isOneToOne: false
                        referencedRelation: "inventory_items"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "item_stock_levels_location_id_fkey"
                        columns: ["location_id"]
                        isOneToOne: false
                        referencedRelation: "storage_locations"
                        referencedColumns: ["id"]
                    }
                ]
            }
            stock_transfers: {
                Row: {
                    id: string
                    inventory_item_id: string
                    from_location_id: string | null
                    to_location_id: string | null
                    quantity: number
                    user_id: string | null
                    notes: string | null
                    batch_id: string | null
                    created_at: string | null
                }
                Insert: {
                    id?: string
                    inventory_item_id: string
                    from_location_id?: string | null
                    to_location_id?: string | null
                    quantity: number
                    user_id?: string | null
                    notes?: string | null
                    batch_id?: string | null
                    created_at?: string | null
                }
                Update: {
                    id?: string
                    inventory_item_id?: string
                    from_location_id?: string | null
                    to_location_id?: string | null
                    quantity?: number
                    user_id?: string | null
                    notes?: string | null
                    batch_id?: string | null
                    created_at?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "stock_transfers_inventory_item_id_fkey"
                        columns: ["inventory_item_id"]
                        isOneToOne: false
                        referencedRelation: "inventory_items"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "stock_transfers_from_location_id_fkey"
                        columns: ["from_location_id"]
                        isOneToOne: false
                        referencedRelation: "storage_locations"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "stock_transfers_to_location_id_fkey"
                        columns: ["to_location_id"]
                        isOneToOne: false
                        referencedRelation: "storage_locations"
                        referencedColumns: ["id"]
                    }
                ]
            }
            stores: {
                Row: {
                    address: string | null
                    created_at: string
                    id: string
                    logo_url: string | null
                    name: string
                    plan: string | null
                    slug: string
                    tax_info: string | null
                    updated_at: string
                }
                Insert: {
                    address?: string | null
                    created_at?: string
                    id?: string
                    logo_url?: string | null
                    name: string
                    plan?: string | null
                    slug: string
                    tax_info?: string | null
                    updated_at?: string
                }
                Update: {
                    address?: string | null
                    created_at?: string
                    id?: string
                    logo_url?: string | null
                    name?: string
                    plan?: string | null
                    slug?: string
                    tax_info?: string | null
                    updated_at?: string
                }
                Relationships: []
            }
            venue_nodes: {
                Row: {
                    id: string
                    store_id: string
                    type: string
                    label: string
                    position_x: number
                    position_y: number
                    rotation: number
                    created_at: string
                    updated_at: string
                    zone_id: string | null
                    location_id: string | null
                    status: string
                }
                Insert: {
                    id?: string
                    store_id: string
                    type: string
                    label: string
                    position_x: number
                    position_y: number
                    rotation: number
                    created_at?: string
                    updated_at?: string
                    zone_id?: string | null
                    location_id?: string | null
                    status?: string
                }
                Update: {
                    id?: string
                    store_id?: string
                    type?: string
                    label?: string
                    position_x?: number
                    position_y?: number
                    rotation?: number
                    created_at?: string
                    updated_at?: string
                    zone_id?: string | null
                    location_id?: string | null
                    status?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "venue_nodes_zone_id_fkey"
                        columns: ["zone_id"]
                        isOneToOne: false
                        referencedRelation: "venue_zones"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "venue_nodes_location_id_fkey"
                        columns: ["location_id"]
                        isOneToOne: false
                        referencedRelation: "storage_locations"
                        referencedColumns: ["id"]
                    }
                ]
            }
            venue_zones: {
                Row: {
                    id: string
                    store_id: string
                    name: string
                    description: string | null
                    sort_order: number
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    store_id: string
                    name: string
                    description?: string | null
                    sort_order?: number
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    store_id?: string
                    name?: string
                    description?: string | null
                    sort_order?: number
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            transfer_stock: {
                Args: {
                    p_item_id: string
                    p_from_location_id: string | null
                    p_to_location_id: string | null
                    p_quantity: number
                    p_user_id: string
                    p_notes: string
                }
                Returns: Json
            }
        }
        Enums: {
            app_role: "super_admin" | "store_owner" | "staff"
            global_role_enum: "super_admin" | "staff"
            inventory_movement_enum: "in" | "out" | "adjustment"
            order_channel_enum: "table" | "qr" | "takeaway" | "delivery"
            order_status_enum:
            | "draft"
            | "pending"
            | "paid"
            | "preparing"
            | "ready"
            | "served"
            | "cancelled"
            | "refunded"
            qr_target_type: "table" | "zone"
            stock_status_type: "in_stock" | "low_stock" | "out_of_stock"
            venue_node_status:
            | "free"
            | "occupied"
            | "bill_requested"
            | "closed"
            | "cleaning"
            venue_node_type: "table" | "bar" | "pickup_zone"
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}

type PublicSchema = Database["public"]

export type Tables<
    PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
            Row: infer R
        }
    ? R
    : never
    : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
            Row: infer R
        }
    ? R
    : never
    : never

export type TablesInsert<
    PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Insert: infer I
    }
    ? I
    : never
    : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
    }
    ? I
    : never
    : never

export type TablesUpdate<
    PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Update: infer U
    }
    ? U
    : never
    : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
    }
    ? U
    : never
    : never

export type Enums<
    PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
    EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
    ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
    : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
    PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
    CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
        schema: keyof Database
    }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
    ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
    : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
    public: {
        Enums: {
            app_role: ["super_admin", "store_owner", "staff"],
            global_role_enum: ["super_admin", "staff"],
            inventory_movement_enum: ["in", "out", "adjustment"],
            order_channel_enum: ["table", "qr", "takeaway", "delivery"],
            order_status_enum: [
                "draft",
                "pending",
                "paid",
                "preparing",
                "ready",
                "served",
                "cancelled",
                "refunded",
            ],
            qr_target_type: ["table", "zone"],
            stock_status_type: ["in_stock", "low_stock", "out_of_stock"],
            venue_node_status: [
                "free",
                "occupied",
                "bill_requested",
                "closed",
                "cleaning",
            ],
            venue_node_type: ["table", "bar", "pickup_zone"],
        },
    },
} as const
