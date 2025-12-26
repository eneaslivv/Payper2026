export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            stores: {
                Row: {
                    id: string
                    name: string
                    slug: string
                    logo_url: string | null
                    address: string | null
                    tax_info: string | null
                    plan: string
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    name: string
                    slug: string
                    logo_url?: string | null
                    address?: string | null
                    tax_info?: string | null
                    plan?: string
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    name?: string
                    slug?: string
                    logo_url?: string | null
                    address?: string | null
                    tax_info?: string | null
                    plan?: string
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
            store_tables: {
                Row: {
                    id: string
                    store_id: string
                    label: string
                    qr_code_url: string | null
                    is_active: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    store_id: string
                    label: string
                    qr_code_url?: string | null
                    is_active?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    store_id?: string
                    label?: string
                    qr_code_url?: string | null
                    is_active?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "store_tables_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: false
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    }
                ]
            }
            profiles: {
                Row: {
                    id: string
                    email: string
                    full_name: string | null
                    role: "super_admin" | "store_owner" | "staff"
                    is_active: boolean
                    store_id: string | null
                    invited_at: string | null
                    accepted_at: string | null
                    status: string
                    role_id: string | null
                    created_at: string
                }
                Insert: {
                    id: string
                    email: string
                    full_name?: string | null
                    role?: "super_admin" | "store_owner" | "staff"
                    is_active?: boolean
                    store_id?: string | null
                    invited_at?: string | null
                    accepted_at?: string | null
                    status?: string
                    role_id?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    email?: string
                    full_name?: string | null
                    role?: "super_admin" | "store_owner" | "staff"
                    is_active?: boolean
                    store_id?: string | null
                    invited_at?: string | null
                    accepted_at?: string | null
                    status?: string
                    role_id?: string | null
                    created_at?: string
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
                    }
                ]
            }
            inventory_items: {
                Row: {
                    id: string
                    name: string
                    sku: string | null
                    cost: number
                    current_stock: number
                    min_stock_alert: number
                    unit_type: string
                    category_id: string | null
                    store_id: string
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    name: string
                    sku?: string | null
                    cost?: number
                    current_stock?: number
                    min_stock_alert?: number
                    unit_type: string
                    category_id?: string | null
                    store_id: string
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    name?: string
                    sku?: string | null
                    cost?: number
                    current_stock?: number
                    min_stock_alert?: number
                    unit_type?: string
                    category_id?: string | null
                    store_id?: string
                    created_at?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "inventory_items_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: false
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    }
                ]
            }
            products: {
                Row: {
                    id: string
                    name: string
                    description: string | null
                    price: number
                    image_url: string | null
                    category_id: string | null
                    store_id: string
                    available: boolean
                    is_menu_visible: boolean
                    is_recommended: boolean
                    is_new: boolean
                    is_promo: boolean
                    sort_order: number
                    created_at: string
                }
                Insert: {
                    id?: string
                    name: string
                    description?: string | null
                    price: number
                    image_url?: string | null
                    category_id?: string | null
                    store_id: string
                    available?: boolean
                    is_menu_visible?: boolean
                    is_recommended?: boolean
                    is_new?: boolean
                    is_promo?: boolean
                    sort_order?: number
                    created_at?: string
                }
                Update: {
                    id?: string
                    name?: string
                    description?: string | null
                    price?: number
                    image_url?: string | null
                    category_id?: string | null
                    store_id?: string
                    available?: boolean
                    is_menu_visible?: boolean
                    is_recommended?: boolean
                    is_new?: boolean
                    is_promo?: boolean
                    sort_order?: number
                    created_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "products_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: false
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    }
                ]
            }
            product_variants: {
                Row: {
                    id: string
                    product_id: string
                    name: string
                    price_adjustment: number
                    created_at: string
                }
                Insert: {
                    id?: string
                    product_id: string
                    name: string
                    price_adjustment?: number
                    created_at?: string
                }
                Update: {
                    id?: string
                    product_id?: string
                    name?: string
                    price_adjustment?: number
                    created_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "product_variants_product_id_fkey"
                        columns: ["product_id"]
                        isOneToOne: false
                        referencedRelation: "products"
                        referencedColumns: ["id"]
                    }
                ]
            }
            product_addons: {
                Row: {
                    id: string
                    product_id: string
                    name: string
                    price: number
                    inventory_item_id: string | null
                    quantity_consumed: number
                    created_at: string
                }
                Insert: {
                    id?: string
                    product_id: string
                    name: string
                    price: number
                    inventory_item_id?: string | null
                    quantity_consumed?: number
                    created_at?: string
                }
                Update: {
                    id?: string
                    product_id?: string
                    name?: string
                    price?: number
                    inventory_item_id?: string | null
                    quantity_consumed?: number
                    created_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "product_addons_product_id_fkey"
                        columns: ["product_id"]
                        isOneToOne: false
                        referencedRelation: "products"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "product_addons_inventory_item_id_fkey"
                        columns: ["inventory_item_id"]
                        isOneToOne: false
                        referencedRelation: "inventory_items"
                        referencedColumns: ["id"]
                    }
                ]
            }
            product_recipes: {
                Row: {
                    id: string
                    product_id: string
                    inventory_item_id: string
                    quantity_required: number
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    product_id: string
                    inventory_item_id: string
                    quantity_required?: number
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    product_id?: string
                    inventory_item_id?: string
                    quantity_required?: number
                    created_at?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "product_recipes_product_id_fkey"
                        columns: ["product_id"]
                        isOneToOne: false
                        referencedRelation: "products"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "product_recipes_inventory_item_id_fkey"
                        columns: ["inventory_item_id"]
                        isOneToOne: false
                        referencedRelation: "inventory_items"
                        referencedColumns: ["id"]
                    }
                ]
            }
            orders: {
                Row: {
                    id: string
                    customer_name: string | null
                    total_amount: number
                    status: string
                    store_id: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    customer_name?: string | null
                    total_amount: number
                    status: string
                    store_id: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    customer_name?: string | null
                    total_amount?: number
                    status?: string
                    store_id?: string
                    created_at?: string
                }
                Relationships: []
            }
            order_items: {
                Row: {
                    id: string
                    order_id: string
                    product_id: string | null
                    name: string
                    quantity: number
                    price_unit: number
                    variant_name: string | null
                    addons: Json
                    note: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    order_id: string
                    product_id?: string | null
                    name: string
                    quantity?: number
                    price_unit: number
                    variant_name?: string | null
                    addons?: Json
                    note?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    order_id?: string
                    product_id?: string | null
                    name?: string
                    quantity?: number
                    price_unit?: number
                    variant_name?: string | null
                    addons?: Json
                    note?: string | null
                    created_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "order_items_order_id_fkey"
                        columns: ["order_id"]
                        isOneToOne: false
                        referencedRelation: "orders"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "order_items_product_id_fkey"
                        columns: ["product_id"]
                        isOneToOne: false
                        referencedRelation: "products"
                        referencedColumns: ["id"]
                    }
                ]
            }
            clients: {
                Row: {
                    id: string
                    name: string | null
                    email: string | null
                    phone: string | null
                    loyalty_points: number
                    store_id: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    name?: string | null
                    email?: string | null
                    phone?: string | null
                    loyalty_points?: number
                    store_id: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    name?: string | null
                    email?: string | null
                    phone?: string | null
                    loyalty_points?: number
                    store_id?: string
                    created_at?: string
                }
                Relationships: []
            }
            cafe_roles: {
                Row: {
                    id: string
                    store_id: string
                    name: string
                    description: string | null
                    is_system: boolean
                    created_at: string
                }
                Insert: {
                    id?: string
                    store_id: string
                    name: string
                    description?: string | null
                    is_system?: boolean
                    created_at?: string
                }
                Update: {
                    id?: string
                    store_id?: string
                    name?: string
                    description?: string | null
                    is_system?: boolean
                    created_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "cafe_roles_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: false
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    }
                ]
            }
            cafe_role_permissions: {
                Row: {
                    id: string
                    role_id: string
                    section_slug: string
                    can_view: boolean
                    can_create: boolean
                    can_edit: boolean
                    can_delete: boolean
                }
                Insert: {
                    id?: string
                    role_id: string
                    section_slug: string
                    can_view?: boolean
                    can_create?: boolean
                    can_edit?: boolean
                    can_delete?: boolean
                }
                Update: {
                    id?: string
                    role_id?: string
                    section_slug?: string
                    can_view?: boolean
                    can_create?: boolean
                    can_edit?: boolean
                    can_delete?: boolean
                }
                Relationships: [
                    {
                        foreignKeyName: "cafe_role_permissions_role_id_fkey"
                        columns: ["role_id"]
                        isOneToOne: false
                        referencedRelation: "cafe_roles"
                        referencedColumns: ["id"]
                    }
                ]
            }
            audit_logs: {
                Row: {
                    id: string
                    created_at: string
                    store_id: string | null
                    user_id: string | null
                    table_name: string
                    operation: 'INSERT' | 'UPDATE' | 'DELETE'
                    old_data: Json | null
                    new_data: Json | null
                }
                Insert: {
                    id?: string
                    created_at?: string
                    store_id?: string | null
                    user_id?: string | null
                    table_name: string
                    operation: 'INSERT' | 'UPDATE' | 'DELETE'
                    old_data?: Json | null
                    new_data?: Json | null
                }
                Update: {
                    id?: string
                    created_at?: string
                    store_id?: string | null
                    user_id?: string | null
                    table_name?: string
                    operation?: 'INSERT' | 'UPDATE' | 'DELETE'
                    old_data?: Json | null
                    new_data?: Json | null
                }
                Relationships: [
                    {
                        foreignKeyName: "audit_logs_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: false
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    }
                ]
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            create_order_with_stock_deduction: {
                Args: {
                    p_store_id: string
                    p_customer_name: string
                    p_total_amount: number
                    p_status?: string
                    p_order_items?: Json
                }
                Returns: Json
            }
        }
        Enums: {
            [_ in never]: never
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}

export type Tables<
    PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"] & Database["public"]["Views"])
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
    : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] &
        Database["public"]["Views"])
    ? (Database["public"]["Tables"] &
        Database["public"]["Views"])[PublicTableNameOrOptions] extends {
            Row: infer R
        }
    ? R
    : never
    : never

export type TablesInsert<
    PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
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
    : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
    }
    ? I
    : never
    : never

export type TablesUpdate<
    PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
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
    : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
    }
    ? U
    : never
    : never

export type Enums<
    DefaultSchemaEnumNameOrOptions extends
    | keyof Database["public"]["Enums"]
    | { schema: keyof Database },
    EnumName extends DefaultSchemaEnumNameOrOptions extends {
        schema: keyof Database
    }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
}
    ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
    : DefaultSchemaEnumNameOrOptions extends keyof Database["public"]["Enums"]
    ? Database["public"]["Enums"][DefaultSchemaEnumNameOrOptions]
    : never
