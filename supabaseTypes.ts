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
      _backup_duplicate_products_20260204: {
        Row: {
          active: boolean | null
          base_price: number | null
          category: string | null
          category_slug: string | null
          created_at: string | null
          customs_options: Json | null
          description: string | null
          id: string | null
          image: string | null
          is_available: boolean | null
          is_visible: boolean | null
          name: string | null
          sku: string | null
          store_id: string | null
          tax_rate: number | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          base_price?: number | null
          category?: string | null
          category_slug?: string | null
          created_at?: string | null
          customs_options?: Json | null
          description?: string | null
          id?: string | null
          image?: string | null
          is_available?: boolean | null
          is_visible?: boolean | null
          name?: string | null
          sku?: string | null
          store_id?: string | null
          tax_rate?: number | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          base_price?: number | null
          category?: string | null
          category_slug?: string | null
          created_at?: string | null
          customs_options?: Json | null
          description?: string | null
          id?: string | null
          image?: string | null
          is_available?: boolean | null
          is_visible?: boolean | null
          name?: string | null
          sku?: string | null
          store_id?: string | null
          tax_rate?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      _migration_backup_2026_02_03: {
        Row: {
          backup_timestamp: string | null
          status: string | null
          table_name: string | null
          total_rows: number | null
        }
        Insert: {
          backup_timestamp?: string | null
          status?: string | null
          table_name?: string | null
          total_rows?: number | null
        }
        Update: {
          backup_timestamp?: string | null
          status?: string | null
          table_name?: string | null
          total_rows?: number | null
        }
        Relationships: []
      }
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
      cash_closures: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string | null
          difference: number | null
          expected_cash: number
          id: string
          notes: string | null
          opened_at: string | null
          real_cash: number
          session_id: string
          start_amount: number | null
          store_id: string
          total_card_sales: number | null
          total_cash_sales: number | null
          total_mp_sales: number | null
          total_orders: number | null
          total_sales: number | null
          total_topups: number | null
          total_wallet_sales: number | null
          zone_name: string | null
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string | null
          difference?: number | null
          expected_cash?: number
          id?: string
          notes?: string | null
          opened_at?: string | null
          real_cash?: number
          session_id: string
          start_amount?: number | null
          store_id: string
          total_card_sales?: number | null
          total_cash_sales?: number | null
          total_mp_sales?: number | null
          total_orders?: number | null
          total_sales?: number | null
          total_topups?: number | null
          total_wallet_sales?: number | null
          zone_name?: string | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string | null
          difference?: number | null
          expected_cash?: number
          id?: string
          notes?: string | null
          opened_at?: string | null
          real_cash?: number
          session_id?: string
          start_amount?: number | null
          store_id?: string
          total_card_sales?: number | null
          total_cash_sales?: number | null
          total_mp_sales?: number | null
          total_orders?: number | null
          total_sales?: number | null
          total_topups?: number | null
          total_wallet_sales?: number | null
          zone_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_closures_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_closures_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_closures_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closing_notes: string | null
          created_at: string | null
          difference: number | null
          expected_cash: number | null
          id: string
          opened_at: string | null
          opened_by: string
          real_cash: number | null
          start_amount: number
          status: string
          store_id: string
          total_card_sales: number | null
          total_cash_sales: number | null
          total_mp_sales: number | null
          total_orders: number | null
          total_topups: number | null
          total_wallet_sales: number | null
          zone_id: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closing_notes?: string | null
          created_at?: string | null
          difference?: number | null
          expected_cash?: number | null
          id?: string
          opened_at?: string | null
          opened_by: string
          real_cash?: number | null
          start_amount?: number
          status?: string
          store_id: string
          total_card_sales?: number | null
          total_cash_sales?: number | null
          total_mp_sales?: number | null
          total_orders?: number | null
          total_topups?: number | null
          total_wallet_sales?: number | null
          zone_id: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closing_notes?: string | null
          created_at?: string | null
          difference?: number | null
          expected_cash?: number | null
          id?: string
          opened_at?: string | null
          opened_by?: string
          real_cash?: number | null
          start_amount?: number
          status?: string
          store_id?: string
          total_card_sales?: number | null
          total_cash_sales?: number | null
          total_mp_sales?: number | null
          total_orders?: number | null
          total_topups?: number | null
          total_wallet_sales?: number | null
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "venue_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string | null
          created_at: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          position: number | null
          store_id: string | null
          type: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          position?: number | null
          store_id?: string | null
          type?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          position?: number | null
          store_id?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      client_activity_log: {
        Row: {
          action_type: string
          amount: number | null
          client_id: string
          created_at: string | null
          description: string | null
          id: string
          metadata: Json | null
          performed_by: string | null
          store_id: string
        }
        Insert: {
          action_type: string
          amount?: number | null
          client_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          store_id: string
        }
        Update: {
          action_type?: string
          amount?: number | null
          client_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_activity_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_activity_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_activity_log_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      client_sessions: {
        Row: {
          bar_id: string | null
          client_id: string | null
          created_at: string | null
          end_reason: string | null
          ended_at: string | null
          expires_at: string
          id: string
          is_active: boolean | null
          last_activity_at: string | null
          location_id: string | null
          menu_id: string | null
          qr_id: string | null
          session_type: Database["public"]["Enums"]["session_type"]
          started_at: string | null
          store_id: string
          table_id: string | null
        }
        Insert: {
          bar_id?: string | null
          client_id?: string | null
          created_at?: string | null
          end_reason?: string | null
          ended_at?: string | null
          expires_at: string
          id?: string
          is_active?: boolean | null
          last_activity_at?: string | null
          location_id?: string | null
          menu_id?: string | null
          qr_id?: string | null
          session_type: Database["public"]["Enums"]["session_type"]
          started_at?: string | null
          store_id: string
          table_id?: string | null
        }
        Update: {
          bar_id?: string | null
          client_id?: string | null
          created_at?: string | null
          end_reason?: string | null
          ended_at?: string | null
          expires_at?: string
          id?: string
          is_active?: boolean | null
          last_activity_at?: string | null
          location_id?: string | null
          menu_id?: string | null
          qr_id?: string | null
          session_type?: Database["public"]["Enums"]["session_type"]
          started_at?: string | null
          store_id?: string
          table_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_sessions_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "active_venue_states"
            referencedColumns: ["node_id"]
          },
          {
            foreignKeyName: "client_sessions_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "available_nodes_for_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_sessions_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "venue_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_sessions_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_sessions_qr_id_fkey"
            columns: ["qr_id"]
            isOneToOne: false
            referencedRelation: "qr_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_sessions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_sessions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "active_venue_states"
            referencedColumns: ["node_id"]
          },
          {
            foreignKeyName: "client_sessions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "available_nodes_for_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_sessions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "venue_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          auth_user_id: string | null
          created_at: string
          customer_code: string | null
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean | null
          loyalty_points: number
          name: string | null
          nfc_uid: string | null
          phone: string | null
          store_id: string | null
          wallet_balance: number | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          customer_code?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          loyalty_points?: number
          name?: string | null
          nfc_uid?: string | null
          phone?: string | null
          store_id?: string | null
          wallet_balance?: number | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          customer_code?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          loyalty_points?: number
          name?: string | null
          nfc_uid?: string | null
          phone?: string | null
          store_id?: string | null
          wallet_balance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_wallets: {
        Row: {
          balance: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      debug_trigger_log: {
        Row: {
          created_at: string | null
          id: number
          message: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          message?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          message?: string | null
        }
        Relationships: []
      }
      dispatch_stations: {
        Row: {
          created_at: string | null
          id: string
          is_visible: boolean | null
          name: string
          sort_order: number | null
          store_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_visible?: boolean | null
          name: string
          sort_order?: number | null
          store_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_visible?: boolean | null
          name?: string
          sort_order?: number | null
          store_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_stations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          attempts: number | null
          clicked_at: string | null
          correlation_id: string | null
          created_at: string | null
          error_code: string | null
          error_message: string | null
          event_entity: string | null
          event_id: string | null
          event_type: string
          id: string
          idempotency_key: string
          max_attempts: number | null
          next_retry_at: string | null
          opened_at: string | null
          payload_core: Json
          queued_at: string | null
          recipient_email: string
          recipient_name: string | null
          recipient_type: string | null
          resend_id: string | null
          resend_response: Json | null
          sent_at: string | null
          status: string | null
          store_id: string
          template_key: string
          template_provider_id: string | null
          template_version: number | null
          trigger_source: string | null
          triggered_by: string | null
        }
        Insert: {
          attempts?: number | null
          clicked_at?: string | null
          correlation_id?: string | null
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          event_entity?: string | null
          event_id?: string | null
          event_type: string
          id?: string
          idempotency_key: string
          max_attempts?: number | null
          next_retry_at?: string | null
          opened_at?: string | null
          payload_core: Json
          queued_at?: string | null
          recipient_email: string
          recipient_name?: string | null
          recipient_type?: string | null
          resend_id?: string | null
          resend_response?: Json | null
          sent_at?: string | null
          status?: string | null
          store_id: string
          template_key: string
          template_provider_id?: string | null
          template_version?: number | null
          trigger_source?: string | null
          triggered_by?: string | null
        }
        Update: {
          attempts?: number | null
          clicked_at?: string | null
          correlation_id?: string | null
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          event_entity?: string | null
          event_id?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string
          max_attempts?: number | null
          next_retry_at?: string | null
          opened_at?: string | null
          payload_core?: Json
          queued_at?: string | null
          recipient_email?: string
          recipient_name?: string | null
          recipient_type?: string | null
          resend_id?: string | null
          resend_response?: Json | null
          sent_at?: string | null
          status?: string | null
          store_id?: string
          template_key?: string
          template_provider_id?: string | null
          template_version?: number | null
          trigger_source?: string | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      email_queue: {
        Row: {
          attempts: number | null
          created_at: string | null
          id: string
          last_error: string | null
          next_retry_at: string | null
          order_id: string
          payload: Json
          recipient: string
          status: string | null
          store_id: string
          subject: string
          updated_at: string | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          order_id: string
          payload: Json
          recipient: string
          status?: string | null
          store_id: string
          subject: string
          updated_at?: string | null
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          order_id?: string
          payload?: Json
          recipient?: string
          status?: string | null
          store_id?: string
          subject?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_queue_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "active_venue_states"
            referencedColumns: ["active_order_id"]
          },
          {
            foreignKeyName: "email_queue_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          expense_date: string
          id: string
          is_recurring: boolean | null
          name: string
          recurrence_frequency: string | null
          store_id: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          is_recurring?: boolean | null
          name: string
          recurrence_frequency?: string | null
          store_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          is_recurring?: boolean | null
          name?: string
          recurrence_frequency?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_expenses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_audit_logs: {
        Row: {
          action_type: string
          created_at: string | null
          id: string
          invoice_ref: string | null
          item_id: string
          location_from: string | null
          location_to: string | null
          new_value: Json | null
          old_value: Json | null
          order_id: string | null
          package_delta: number | null
          quantity_delta: number | null
          reason: string
          source_ui: string | null
          store_id: string
          supplier_id: string | null
          unit: string | null
          unit_cost: number | null
          user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string | null
          id?: string
          invoice_ref?: string | null
          item_id: string
          location_from?: string | null
          location_to?: string | null
          new_value?: Json | null
          old_value?: Json | null
          order_id?: string | null
          package_delta?: number | null
          quantity_delta?: number | null
          reason: string
          source_ui?: string | null
          store_id: string
          supplier_id?: string | null
          unit?: string | null
          unit_cost?: number | null
          user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string | null
          id?: string
          invoice_ref?: string | null
          item_id?: string
          location_from?: string | null
          location_to?: string | null
          new_value?: Json | null
          old_value?: Json | null
          order_id?: string | null
          package_delta?: number | null
          quantity_delta?: number | null
          reason?: string
          source_ui?: string | null
          store_id?: string
          supplier_id?: string | null
          unit?: string | null
          unit_cost?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_audit_logs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_audit_logs_location_from_fkey"
            columns: ["location_from"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_audit_logs_location_to_fkey"
            columns: ["location_to"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_audit_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "active_venue_states"
            referencedColumns: ["active_order_id"]
          },
          {
            foreignKeyName: "inventory_audit_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_audit_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_audit_logs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "inventory_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_audit_logs_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          addons: Json | null
          category_id: string | null
          closed_stock: number | null
          combo_items: Json | null
          content_unit: string | null
          cost: number
          created_at: string | null
          current_stock: number
          description: string | null
          id: string
          ideal_stock: number | null
          image_url: string | null
          is_active: boolean | null
          is_menu_visible: boolean | null
          is_new: boolean | null
          is_promo: boolean | null
          is_recommended: boolean | null
          item_type: string | null
          last_purchase_price: number | null
          last_supplier_id: string | null
          max_stock: number | null
          min_packages: number | null
          min_quantity: number | null
          min_stock: number | null
          min_stock_alert: number
          name: string
          open_count: number | null
          open_packages: Json | null
          package_size: number | null
          price: number | null
          quantity: number | null
          reorder_point: number | null
          sku: string | null
          sort_order: number | null
          stock_logic_version: string | null
          store_id: string
          unit_type: string
          updated_at: string | null
          variants: Json | null
        }
        Insert: {
          addons?: Json | null
          category_id?: string | null
          closed_stock?: number | null
          combo_items?: Json | null
          content_unit?: string | null
          cost?: number
          created_at?: string | null
          current_stock?: number
          description?: string | null
          id?: string
          ideal_stock?: number | null
          image_url?: string | null
          is_active?: boolean | null
          is_menu_visible?: boolean | null
          is_new?: boolean | null
          is_promo?: boolean | null
          is_recommended?: boolean | null
          item_type?: string | null
          last_purchase_price?: number | null
          last_supplier_id?: string | null
          max_stock?: number | null
          min_packages?: number | null
          min_quantity?: number | null
          min_stock?: number | null
          min_stock_alert?: number
          name: string
          open_count?: number | null
          open_packages?: Json | null
          package_size?: number | null
          price?: number | null
          quantity?: number | null
          reorder_point?: number | null
          sku?: string | null
          sort_order?: number | null
          stock_logic_version?: string | null
          store_id: string
          unit_type: string
          updated_at?: string | null
          variants?: Json | null
        }
        Update: {
          addons?: Json | null
          category_id?: string | null
          closed_stock?: number | null
          combo_items?: Json | null
          content_unit?: string | null
          cost?: number
          created_at?: string | null
          current_stock?: number
          description?: string | null
          id?: string
          ideal_stock?: number | null
          image_url?: string | null
          is_active?: boolean | null
          is_menu_visible?: boolean | null
          is_new?: boolean | null
          is_promo?: boolean | null
          is_recommended?: boolean | null
          item_type?: string | null
          last_purchase_price?: number | null
          last_supplier_id?: string | null
          max_stock?: number | null
          min_packages?: number | null
          min_quantity?: number | null
          min_stock?: number | null
          min_stock_alert?: number
          name?: string
          open_count?: number | null
          open_packages?: Json | null
          package_size?: number | null
          price?: number | null
          quantity?: number | null
          reorder_point?: number | null
          sku?: string | null
          sort_order?: number | null
          stock_logic_version?: string | null
          store_id?: string
          unit_type?: string
          updated_at?: string | null
          variants?: Json | null
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
      inventory_location_stock: {
        Row: {
          closed_units: number | null
          id: string
          item_id: string
          location_id: string
          open_packages: Json | null
          store_id: string
          updated_at: string | null
        }
        Insert: {
          closed_units?: number | null
          id?: string
          item_id: string
          location_id: string
          open_packages?: Json | null
          store_id: string
          updated_at?: string | null
        }
        Update: {
          closed_units?: number | null
          id?: string
          item_id?: string
          location_id?: string
          open_packages?: Json | null
          store_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_location_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_location_stock_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_location_stock_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_lots: {
        Row: {
          cost_per_base_unit: number
          created_at: string
          expires_at: string | null
          id: string
          inventory_item_id: string
          lot_code: string | null
          qty_base_units: number
          qty_base_units_remaining: number
          received_at: string
          supplier: string | null
          tenant_id: string
        }
        Insert: {
          cost_per_base_unit: number
          created_at?: string
          expires_at?: string | null
          id?: string
          inventory_item_id: string
          lot_code?: string | null
          qty_base_units: number
          qty_base_units_remaining: number
          received_at: string
          supplier?: string | null
          tenant_id: string
        }
        Update: {
          cost_per_base_unit?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          inventory_item_id?: string
          lot_code?: string | null
          qty_base_units?: number
          qty_base_units_remaining?: number
          received_at?: string
          supplier?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          lot_id: string | null
          qty_base_units: number
          reason: string | null
          ref_order_id: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["inventory_movement_enum"]
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          lot_id?: string | null
          qty_base_units: number
          reason?: string | null
          ref_order_id?: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["inventory_movement_enum"]
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          lot_id?: string | null
          qty_base_units?: number
          reason?: string | null
          ref_order_id?: string | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["inventory_movement_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_ref_order_id_fkey"
            columns: ["ref_order_id"]
            isOneToOne: false
            referencedRelation: "active_venue_states"
            referencedColumns: ["active_order_id"]
          },
          {
            foreignKeyName: "inventory_movements_ref_order_id_fkey"
            columns: ["ref_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_product_mapping: {
        Row: {
          action_taken: string | null
          created_at: string | null
          inventory_item_id: string
          product_id: string
        }
        Insert: {
          action_taken?: string | null
          created_at?: string | null
          inventory_item_id: string
          product_id: string
        }
        Update: {
          action_taken?: string | null
          created_at?: string | null
          inventory_item_id?: string
          product_id?: string
        }
        Relationships: []
      }
      inventory_suppliers: {
        Row: {
          active: boolean | null
          address: string | null
          contact_info: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          store_id: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          address?: string | null
          contact_info?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          store_id: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          address?: string | null
          contact_info?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          store_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_suppliers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          bonification: number | null
          id: string
          invoice_id: string | null
          is_new_item: boolean | null
          matched_inventory_id: string | null
          name: string | null
          quantity: number | null
          tax_amount: number | null
          total_line: number | null
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          bonification?: number | null
          id?: string
          invoice_id?: string | null
          is_new_item?: boolean | null
          matched_inventory_id?: string | null
          name?: string | null
          quantity?: number | null
          tax_amount?: number | null
          total_line?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          bonification?: number | null
          id?: string
          invoice_id?: string | null
          is_new_item?: boolean | null
          matched_inventory_id?: string | null
          name?: string | null
          quantity?: number | null
          tax_amount?: number | null
          total_line?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_matched_inventory_id_fkey"
            columns: ["matched_inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          ai_analysis: Json | null
          confirmed_at: string | null
          created_at: string | null
          fecha_factura: string | null
          id: string
          image_url: string | null
          iva_total: number | null
          nro_factura: string | null
          proveedor: string | null
          raw_extraction: Json | null
          status: string | null
          store_id: string | null
          subtotal: number | null
          total: number | null
          uploaded_by: string | null
        }
        Insert: {
          ai_analysis?: Json | null
          confirmed_at?: string | null
          created_at?: string | null
          fecha_factura?: string | null
          id?: string
          image_url?: string | null
          iva_total?: number | null
          nro_factura?: string | null
          proveedor?: string | null
          raw_extraction?: Json | null
          status?: string | null
          store_id?: string | null
          subtotal?: number | null
          total?: number | null
          uploaded_by?: string | null
        }
        Update: {
          ai_analysis?: Json | null
          confirmed_at?: string | null
          created_at?: string | null
          fecha_factura?: string | null
          id?: string
          image_url?: string | null
          iva_total?: number | null
          nro_factura?: string | null
          proveedor?: string | null
          raw_extraction?: Json | null
          status?: string | null
          store_id?: string | null
          subtotal?: number | null
          total?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company: string | null
          created_at: string | null
          email: string
          id: string
          message: string | null
          name: string
          phone: string | null
          source: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          email: string
          id?: string
          message?: string | null
          name: string
          phone?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string | null
          email?: string
          id?: string
          message?: string | null
          name?: string
          phone?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      loyalty_configs: {
        Row: {
          config: Json
          created_at: string | null
          id: string
          store_id: string
          updated_at: string | null
        }
        Insert: {
          config?: Json
          created_at?: string | null
          id?: string
          store_id: string
          updated_at?: string | null
        }
        Update: {
          config?: Json
          created_at?: string | null
          id?: string
          store_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_configs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_product_rules: {
        Row: {
          created_at: string | null
          id: string
          multiplier: number
          product_id: string
          store_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          multiplier?: number
          product_id: string
          store_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          multiplier?: number
          product_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_product_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_product_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_compat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_product_rules_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_redemptions: {
        Row: {
          cost_points: number
          cost_value: number | null
          created_at: string | null
          id: string
          is_rolled_back: boolean | null
          order_id: string | null
          product_id: string | null
          retail_value: number | null
          reward_id: string | null
          transaction_id: string
        }
        Insert: {
          cost_points: number
          cost_value?: number | null
          created_at?: string | null
          id?: string
          is_rolled_back?: boolean | null
          order_id?: string | null
          product_id?: string | null
          retail_value?: number | null
          reward_id?: string | null
          transaction_id: string
        }
        Update: {
          cost_points?: number
          cost_value?: number | null
          created_at?: string | null
          id?: string
          is_rolled_back?: boolean | null
          order_id?: string | null
          product_id?: string | null
          retail_value?: number | null
          reward_id?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "active_venue_states"
            referencedColumns: ["active_order_id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "loyalty_rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "loyalty_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_rewards: {
        Row: {
          created_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          points: number
          product_id: string | null
          store_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          points?: number
          product_id?: string | null
          store_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          points?: number
          product_id?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_rewards_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_rewards_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_compat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_rewards_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          client_id: string
          created_at: string | null
          description: string | null
          id: string
          is_rolled_back: boolean | null
          metadata: Json | null
          monetary_cost: number | null
          monetary_value: number | null
          order_id: string | null
          points: number
          staff_id: string | null
          store_id: string
          type: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_rolled_back?: boolean | null
          metadata?: Json | null
          monetary_cost?: number | null
          monetary_value?: number | null
          order_id?: string | null
          points: number
          staff_id?: string | null
          store_id: string
          type: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_rolled_back?: boolean | null
          metadata?: Json | null
          monetary_cost?: number | null
          monetary_value?: number | null
          order_id?: string | null
          points?: number
          staff_id?: string | null
          store_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "active_venue_states"
            referencedColumns: ["active_order_id"]
          },
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          price: number
          stock_status: Database["public"]["Enums"]["stock_status_type"] | null
          store_id: string
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          price: number
          stock_status?: Database["public"]["Enums"]["stock_status_type"] | null
          store_id: string
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          price?: number
          stock_status?: Database["public"]["Enums"]["stock_status_type"] | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_products: {
        Row: {
          created_at: string | null
          id: string
          is_visible: boolean | null
          menu_id: string
          price_override: number | null
          product_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_visible?: boolean | null
          menu_id: string
          price_override?: number | null
          product_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_visible?: boolean | null
          menu_id?: string
          price_override?: number | null
          product_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_products_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_compat"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_rules: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          menu_id: string
          rule_config: Json
          rule_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          menu_id: string
          rule_config?: Json
          rule_type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          menu_id?: string
          rule_config?: Json
          rule_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_rules_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
        ]
      }
      menus: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_fallback: boolean | null
          name: string
          priority: number | null
          store_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_fallback?: boolean | null
          name: string
          priority?: number | null
          store_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_fallback?: boolean | null
          name?: string
          priority?: number | null
          store_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menus_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      open_packages: {
        Row: {
          closed_at: string | null
          created_at: string
          id: string
          inventory_item_id: string
          is_active: boolean | null
          location_id: string | null
          notes: string | null
          opened_at: string
          opened_by: string | null
          package_capacity: number
          remaining: number
          store_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          id?: string
          inventory_item_id: string
          is_active?: boolean | null
          location_id?: string | null
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          package_capacity: number
          remaining: number
          store_id: string
          unit?: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          id?: string
          inventory_item_id?: string
          is_active?: boolean | null
          location_id?: string | null
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          package_capacity?: number
          remaining?: number
          store_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "open_packages_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_packages_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_packages_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_packages_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_addons: {
        Row: {
          addon_id: string
          created_at: string
          id: string
          order_item_id: string
          price: number
          tenant_id: string
        }
        Insert: {
          addon_id: string
          created_at?: string
          id?: string
          order_item_id: string
          price: number
          tenant_id: string
        }
        Update: {
          addon_id?: string
          created_at?: string
          id?: string
          order_item_id?: string
          price?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_item_addons_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "product_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_addons_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_addons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          order_id: string
          product_id: string
          quantity: number
          status: string | null
          store_id: string
          total_price: number
          unit_price: number
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          product_id: string
          quantity: number
          status?: string | null
          store_id: string
          total_price: number
          unit_price: number
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          product_id?: string
          quantity?: number
          status?: string | null
          store_id?: string
          total_price?: number
          unit_price?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "active_venue_states"
            referencedColumns: ["active_order_id"]
          },
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
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          archived_at: string | null
          channel: Database["public"]["Enums"]["order_channel_enum"]
          client_id: string | null
          created_at: string
          created_by_user_id: string | null
          delivered_at: string | null
          delivered_by: string | null
          delivery_mode: string | null
          delivery_status: string | null
          discount_amount: number
          dispatch_station: string | null
          id: string
          is_paid: boolean | null
          items: Json | null
          location_identifier: string | null
          node_id: string | null
          order_number: number
          paid_at: string | null
          payment_id: string | null
          payment_method: string | null
          payment_provider: string | null
          payment_status: string
          pickup_code: string | null
          placed_at: string
          session_id: string | null
          source_location_id: string | null
          status: Database["public"]["Enums"]["order_status_enum"]
          stock_deducted: boolean
          store_id: string
          subtotal: number
          table_number: string | null
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          channel?: Database["public"]["Enums"]["order_channel_enum"]
          client_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          delivery_mode?: string | null
          delivery_status?: string | null
          discount_amount?: number
          dispatch_station?: string | null
          id?: string
          is_paid?: boolean | null
          items?: Json | null
          location_identifier?: string | null
          node_id?: string | null
          order_number: number
          paid_at?: string | null
          payment_id?: string | null
          payment_method?: string | null
          payment_provider?: string | null
          payment_status?: string
          pickup_code?: string | null
          placed_at?: string
          session_id?: string | null
          source_location_id?: string | null
          status?: Database["public"]["Enums"]["order_status_enum"]
          stock_deducted?: boolean
          store_id: string
          subtotal?: number
          table_number?: string | null
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          channel?: Database["public"]["Enums"]["order_channel_enum"]
          client_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          delivery_mode?: string | null
          delivery_status?: string | null
          discount_amount?: number
          dispatch_station?: string | null
          id?: string
          is_paid?: boolean | null
          items?: Json | null
          location_identifier?: string | null
          node_id?: string | null
          order_number?: number
          paid_at?: string | null
          payment_id?: string | null
          payment_method?: string | null
          payment_provider?: string | null
          payment_status?: string
          pickup_code?: string | null
          placed_at?: string
          session_id?: string | null
          source_location_id?: string | null
          status?: Database["public"]["Enums"]["order_status_enum"]
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
            foreignKeyName: "orders_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "active_venue_states"
            referencedColumns: ["node_id"]
          },
          {
            foreignKeyName: "orders_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "available_nodes_for_orders"
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
            foreignKeyName: "orders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "client_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_source_location_id_fkey"
            columns: ["source_location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_intents: {
        Row: {
          amount: number
          created_at: string
          currency: string
          expires_at: string | null
          external_reference: string
          id: string
          init_point: string | null
          metadata: Json | null
          mp_preference_id: string | null
          order_id: string
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          expires_at?: string | null
          external_reference: string
          id?: string
          init_point?: string | null
          metadata?: Json | null
          mp_preference_id?: string | null
          order_id: string
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          expires_at?: string | null
          external_reference?: string
          id?: string
          init_point?: string | null
          metadata?: Json | null
          mp_preference_id?: string | null
          order_id?: string
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_intents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "active_venue_states"
            referencedColumns: ["active_order_id"]
          },
          {
            foreignKeyName: "payment_intents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount: number
          currency: string
          date_approved: string | null
          date_created: string | null
          id: string
          metadata: Json | null
          mp_payment_id: string
          order_id: string
          payer_email: string | null
          payer_id: string | null
          payment_intent_id: string | null
          payment_method: string | null
          payment_type: string | null
          status: string
          status_detail: string | null
          store_id: string
          verified_at: string | null
        }
        Insert: {
          amount: number
          currency?: string
          date_approved?: string | null
          date_created?: string | null
          id?: string
          metadata?: Json | null
          mp_payment_id: string
          order_id: string
          payer_email?: string | null
          payer_id?: string | null
          payment_intent_id?: string | null
          payment_method?: string | null
          payment_type?: string | null
          status: string
          status_detail?: string | null
          store_id: string
          verified_at?: string | null
        }
        Update: {
          amount?: number
          currency?: string
          date_approved?: string | null
          date_created?: string | null
          id?: string
          metadata?: Json | null
          mp_payment_id?: string
          order_id?: string
          payer_email?: string | null
          payer_id?: string | null
          payment_intent_id?: string | null
          payment_method?: string | null
          payment_type?: string | null
          status?: string
          status_detail?: string | null
          store_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "active_venue_states"
            referencedColumns: ["active_order_id"]
          },
          {
            foreignKeyName: "payment_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_webhooks: {
        Row: {
          action: string | null
          created_at: string
          error_message: string | null
          headers_json: Json | null
          id: string
          mp_webhook_id: string | null
          payload_json: Json
          processed: boolean | null
          processed_at: string | null
          processing_result: string | null
          provider: string
          provider_event_id: string | null
          received_at: string
          signature_valid: boolean | null
          store_id: string | null
          topic: string
        }
        Insert: {
          action?: string | null
          created_at?: string
          error_message?: string | null
          headers_json?: Json | null
          id?: string
          mp_webhook_id?: string | null
          payload_json: Json
          processed?: boolean | null
          processed_at?: string | null
          processing_result?: string | null
          provider?: string
          provider_event_id?: string | null
          received_at?: string
          signature_valid?: boolean | null
          store_id?: string | null
          topic: string
        }
        Update: {
          action?: string | null
          created_at?: string
          error_message?: string | null
          headers_json?: Json | null
          id?: string
          mp_webhook_id?: string | null
          payload_json?: Json
          processed?: boolean | null
          processed_at?: string | null
          processing_result?: string | null
          provider?: string
          provider_event_id?: string | null
          received_at?: string
          signature_valid?: boolean | null
          store_id?: string | null
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_webhooks_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_addons: {
        Row: {
          active: boolean
          created_at: string
          id: string
          inventory_item_id: string | null
          name: string
          price: number
          product_id: string | null
          quantity_consumed: number | null
          sku: string | null
          tenant_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          name: string
          price?: number
          product_id?: string | null
          quantity_consumed?: number | null
          sku?: string | null
          tenant_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          name?: string
          price?: number
          product_id?: string | null
          quantity_consumed?: number | null
          sku?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_addons_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_addons_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_addons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_addons_map: {
        Row: {
          addon_id: string
          id: string
          product_id: string
          tenant_id: string
        }
        Insert: {
          addon_id: string
          id?: string
          product_id: string
          tenant_id: string
        }
        Update: {
          addon_id?: string
          id?: string
          product_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_addons_map_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "product_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_addons_map_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_addons_map_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_compat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_addons_map_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_recipes: {
        Row: {
          created_at: string | null
          id: string
          inventory_item_id: string
          product_id: string
          quantity_required: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          inventory_item_id: string
          product_id: string
          quantity_required?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          inventory_item_id?: string
          product_id?: string
          quantity_required?: number
          updated_at?: string | null
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
          {
            foreignKeyName: "product_recipes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_compat"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          price_delta: number
          product_id: string
          recipe_multiplier: number | null
          recipe_overrides: Json | null
          sku: string | null
          tenant_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          price_delta?: number
          product_id: string
          recipe_multiplier?: number | null
          recipe_overrides?: Json | null
          sku?: string | null
          tenant_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          price_delta?: number
          product_id?: string
          recipe_multiplier?: number | null
          recipe_overrides?: Json | null
          sku?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_compat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          base_price: number
          category: string | null
          category_slug: string | null
          created_at: string
          customs_options: Json | null
          description: string | null
          id: string
          image: string | null
          is_available: boolean | null
          is_visible: boolean | null
          name: string
          sku: string | null
          store_id: string
          tax_rate: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_price?: number
          category?: string | null
          category_slug?: string | null
          created_at?: string
          customs_options?: Json | null
          description?: string | null
          id?: string
          image?: string | null
          is_available?: boolean | null
          is_visible?: boolean | null
          name: string
          sku?: string | null
          store_id: string
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_price?: number
          category?: string | null
          category_slug?: string | null
          created_at?: string
          customs_options?: Json | null
          description?: string | null
          id?: string
          image?: string | null
          is_available?: boolean | null
          is_visible?: boolean | null
          name?: string
          sku?: string | null
          store_id?: string
          tax_rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean | null
          points_balance: number | null
          role: string | null
          role_id: string | null
          store_id: string | null
          updated_at: string | null
          username: string | null
          website: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean | null
          points_balance?: number | null
          role?: string | null
          role_id?: string | null
          store_id?: string | null
          updated_at?: string | null
          username?: string | null
          website?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          points_balance?: number | null
          role?: string | null
          role_id?: string | null
          store_id?: string | null
          updated_at?: string | null
          username?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "cafe_roles"
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
      qr_codes: {
        Row: {
          bar_id: string | null
          code_hash: string
          created_at: string | null
          id: string
          is_active: boolean | null
          label: string
          last_scanned_at: string | null
          location_id: string | null
          qr_type: Database["public"]["Enums"]["qr_type"]
          regenerated_from: string | null
          scan_count: number | null
          store_id: string
          table_id: string | null
          updated_at: string | null
        }
        Insert: {
          bar_id?: string | null
          code_hash: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label: string
          last_scanned_at?: string | null
          location_id?: string | null
          qr_type: Database["public"]["Enums"]["qr_type"]
          regenerated_from?: string | null
          scan_count?: number | null
          store_id: string
          table_id?: string | null
          updated_at?: string | null
        }
        Update: {
          bar_id?: string | null
          code_hash?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string
          last_scanned_at?: string | null
          location_id?: string | null
          qr_type?: Database["public"]["Enums"]["qr_type"]
          regenerated_from?: string | null
          scan_count?: number | null
          store_id?: string
          table_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qr_codes_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "active_venue_states"
            referencedColumns: ["node_id"]
          },
          {
            foreignKeyName: "qr_codes_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "available_nodes_for_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_codes_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "venue_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_codes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_codes_regenerated_from_fkey"
            columns: ["regenerated_from"]
            isOneToOne: false
            referencedRelation: "qr_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_codes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_codes_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "active_venue_states"
            referencedColumns: ["node_id"]
          },
          {
            foreignKeyName: "qr_codes_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "available_nodes_for_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_codes_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "venue_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_links: {
        Row: {
          code_hash: string
          created_at: string | null
          hash: string | null
          id: string
          is_active: boolean | null
          node_id: string | null
          store_id: string
          target_node_id: string | null
          target_type: Database["public"]["Enums"]["qr_target_type"]
          target_zone_name: string | null
          type: string | null
        }
        Insert: {
          code_hash: string
          created_at?: string | null
          hash?: string | null
          id?: string
          is_active?: boolean | null
          node_id?: string | null
          store_id: string
          target_node_id?: string | null
          target_type: Database["public"]["Enums"]["qr_target_type"]
          target_zone_name?: string | null
          type?: string | null
        }
        Update: {
          code_hash?: string
          created_at?: string | null
          hash?: string | null
          id?: string
          is_active?: boolean | null
          node_id?: string | null
          store_id?: string
          target_node_id?: string | null
          target_type?: Database["public"]["Enums"]["qr_target_type"]
          target_zone_name?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qr_links_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "active_venue_states"
            referencedColumns: ["node_id"]
          },
          {
            foreignKeyName: "qr_links_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "available_nodes_for_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_links_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "venue_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_links_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_links_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "active_venue_states"
            referencedColumns: ["node_id"]
          },
          {
            foreignKeyName: "qr_links_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "available_nodes_for_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_links_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "venue_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_scan_logs: {
        Row: {
          client_ip: unknown
          created_at: string | null
          id: string
          qr_id: string
          resolved_context: Json
          scanned_at: string | null
          session_id: string | null
          source: Database["public"]["Enums"]["scan_source"] | null
          store_id: string
          user_agent: string | null
        }
        Insert: {
          client_ip?: unknown
          created_at?: string | null
          id?: string
          qr_id: string
          resolved_context?: Json
          scanned_at?: string | null
          session_id?: string | null
          source?: Database["public"]["Enums"]["scan_source"] | null
          store_id: string
          user_agent?: string | null
        }
        Update: {
          client_ip?: unknown
          created_at?: string | null
          id?: string
          qr_id?: string
          resolved_context?: Json
          scanned_at?: string | null
          session_id?: string | null
          source?: Database["public"]["Enums"]["scan_source"] | null
          store_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_scan_session"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "client_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_scan_logs_qr_id_fkey"
            columns: ["qr_id"]
            isOneToOne: false
            referencedRelation: "qr_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_scan_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string | null
          description: string | null
          hierarchy_level: number | null
          id: string
          name: string
          permissions: Json | null
          store_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          hierarchy_level?: number | null
          id?: string
          name: string
          permissions?: Json | null
          store_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          hierarchy_level?: number | null
          id?: string
          name?: string
          permissions?: Json | null
          store_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_audit_logs: {
        Row: {
          action: string
          actor_role: Database["public"]["Enums"]["global_role_enum"] | null
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_table: string | null
          id: number
          metadata: Json
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_role?: Database["public"]["Enums"]["global_role_enum"] | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table?: string | null
          id?: number
          metadata?: Json
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_role?: Database["public"]["Enums"]["global_role_enum"] | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table?: string | null
          id?: number
          metadata?: Json
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saas_audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_feature_flags: {
        Row: {
          created_at: string
          enabled: boolean
          feature_key: string
          id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature_key: string
          id?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature_key?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saas_feature_flags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_plans: {
        Row: {
          created_at: string
          features: Json
          id: string
          monthly_price: number
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          features?: Json
          id?: string
          monthly_price?: number
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          features?: Json
          id?: string
          monthly_price?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_members: {
        Row: {
          id: string
          role: string | null
          store_id: string
          user_id: string
        }
        Insert: {
          id?: string
          role?: string | null
          store_id: string
          user_id: string
        }
        Update: {
          id?: string
          role?: string | null
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_members_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_deduction_errors: {
        Row: {
          attempted_qty: number | null
          context: string | null
          created_at: string | null
          current_stock_before: number | null
          error_detail: string | null
          error_message: string | null
          id: number
          inventory_item_id: string | null
          order_id: string | null
          store_id: string | null
        }
        Insert: {
          attempted_qty?: number | null
          context?: string | null
          created_at?: string | null
          current_stock_before?: number | null
          error_detail?: string | null
          error_message?: string | null
          id?: number
          inventory_item_id?: string | null
          order_id?: string | null
          store_id?: string | null
        }
        Update: {
          attempted_qty?: number | null
          context?: string | null
          created_at?: string | null
          current_stock_before?: number | null
          error_detail?: string | null
          error_message?: string | null
          id?: number
          inventory_item_id?: string | null
          order_id?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_deduction_errors_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "active_venue_states"
            referencedColumns: ["active_order_id"]
          },
          {
            foreignKeyName: "stock_deduction_errors_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_deduction_errors_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          idempotency_key: string
          inventory_item_id: string
          location_id: string | null
          order_id: string | null
          qty_delta: number
          reason: string
          store_id: string
          unit_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: number
          idempotency_key: string
          inventory_item_id: string
          location_id?: string | null
          order_id?: string | null
          qty_delta: number
          reason: string
          store_id: string
          unit_type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: number
          idempotency_key?: string
          inventory_item_id?: string
          location_id?: string | null
          order_id?: string | null
          qty_delta?: number
          reason?: string
          store_id?: string
          unit_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          batch_id: string | null
          created_at: string | null
          from_location_id: string | null
          id: string
          inventory_item_id: string
          invoice_ref: string | null
          movement_type: string | null
          notes: string | null
          quantity: number
          reason: string | null
          supplier_id: string | null
          to_location_id: string | null
          unit_cost: number | null
          user_id: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string | null
          from_location_id?: string | null
          id?: string
          inventory_item_id: string
          invoice_ref?: string | null
          movement_type?: string | null
          notes?: string | null
          quantity: number
          reason?: string | null
          supplier_id?: string | null
          to_location_id?: string | null
          unit_cost?: number | null
          user_id?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string | null
          from_location_id?: string | null
          id?: string
          inventory_item_id?: string
          invoice_ref?: string | null
          movement_type?: string | null
          notes?: string | null
          quantity?: number
          reason?: string | null
          supplier_id?: string | null
          to_location_id?: string | null
          unit_cost?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_locations: {
        Row: {
          bar_id: string | null
          created_at: string | null
          id: string
          is_consumable: boolean | null
          is_default: boolean | null
          is_deletable: boolean | null
          is_point_of_sale: boolean | null
          location_type: string | null
          name: string
          store_id: string
          type: string
          updated_at: string | null
        }
        Insert: {
          bar_id?: string | null
          created_at?: string | null
          id?: string
          is_consumable?: boolean | null
          is_default?: boolean | null
          is_deletable?: boolean | null
          is_point_of_sale?: boolean | null
          location_type?: string | null
          name: string
          store_id: string
          type: string
          updated_at?: string | null
        }
        Update: {
          bar_id?: string | null
          created_at?: string | null
          id?: string
          is_consumable?: boolean | null
          is_default?: boolean | null
          is_deletable?: boolean | null
          is_point_of_sale?: boolean | null
          location_type?: string | null
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
      store_create_requests: {
        Row: {
          created_at: string | null
          id: string
          idempotency_key: string
          owner_email: string
          slug: string
          store_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          idempotency_key: string
          owner_email: string
          slug: string
          store_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          idempotency_key?: string
          owner_email?: string
          slug?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_create_requests_store_id_fkey"
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
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          qr_code_url?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          qr_code_url?: string | null
          store_id?: string
          updated_at?: string
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
      stores: {
        Row: {
          address: string | null
          business_hours: Json | null
          cover_url: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          menu_logic: Json | null
          menu_theme: Json | null
          mp_access_token: string | null
          mp_connected_at: string | null
          mp_email: string | null
          mp_expires_at: string | null
          mp_first_name: string | null
          mp_last_name: string | null
          mp_nickname: string | null
          mp_public_key: string | null
          mp_refresh_token: string | null
          mp_user_id: string | null
          name: string
          onboarding_status: string | null
          owner_email: string | null
          plan: string | null
          service_mode: string | null
          slug: string
          tax_info: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          business_hours?: Json | null
          cover_url?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          menu_logic?: Json | null
          menu_theme?: Json | null
          mp_access_token?: string | null
          mp_connected_at?: string | null
          mp_email?: string | null
          mp_expires_at?: string | null
          mp_first_name?: string | null
          mp_last_name?: string | null
          mp_nickname?: string | null
          mp_public_key?: string | null
          mp_refresh_token?: string | null
          mp_user_id?: string | null
          name: string
          onboarding_status?: string | null
          owner_email?: string | null
          plan?: string | null
          service_mode?: string | null
          slug: string
          tax_info?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          business_hours?: Json | null
          cover_url?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          menu_logic?: Json | null
          menu_theme?: Json | null
          mp_access_token?: string | null
          mp_connected_at?: string | null
          mp_email?: string | null
          mp_expires_at?: string | null
          mp_first_name?: string | null
          mp_last_name?: string | null
          mp_nickname?: string | null
          mp_public_key?: string | null
          mp_refresh_token?: string | null
          mp_user_id?: string | null
          name?: string
          onboarding_status?: string | null
          owner_email?: string | null
          plan?: string | null
          service_mode?: string | null
          slug?: string
          tax_info?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      team_invitations: {
        Row: {
          created_at: string | null
          email: string
          id: string
          role: string
          status: string | null
          store_id: string | null
          token: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          role: string
          status?: string | null
          store_id?: string | null
          token?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          role?: string
          status?: string | null
          store_id?: string | null
          token?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean
          name: string
          plan_id: string | null
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          plan_id?: string | null
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          plan_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "saas_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_nodes: {
        Row: {
          active_badges: Json | null
          created_at: string | null
          current_order_count: number | null
          dispatch_station: string | null
          height: number | null
          id: string
          label: string
          location_id: string | null
          metadata: Json | null
          position_x: number | null
          position_y: number | null
          rotation: number | null
          shape: string | null
          status: Database["public"]["Enums"]["venue_node_status"] | null
          store_id: string
          type: Database["public"]["Enums"]["venue_node_type"] | null
          updated_at: string | null
          width: number | null
          zone_id: string | null
        }
        Insert: {
          active_badges?: Json | null
          created_at?: string | null
          current_order_count?: number | null
          dispatch_station?: string | null
          height?: number | null
          id?: string
          label: string
          location_id?: string | null
          metadata?: Json | null
          position_x?: number | null
          position_y?: number | null
          rotation?: number | null
          shape?: string | null
          status?: Database["public"]["Enums"]["venue_node_status"] | null
          store_id: string
          type?: Database["public"]["Enums"]["venue_node_type"] | null
          updated_at?: string | null
          width?: number | null
          zone_id?: string | null
        }
        Update: {
          active_badges?: Json | null
          created_at?: string | null
          current_order_count?: number | null
          dispatch_station?: string | null
          height?: number | null
          id?: string
          label?: string
          location_id?: string | null
          metadata?: Json | null
          position_x?: number | null
          position_y?: number | null
          rotation?: number | null
          shape?: string | null
          status?: Database["public"]["Enums"]["venue_node_status"] | null
          store_id?: string
          type?: Database["public"]["Enums"]["venue_node_type"] | null
          updated_at?: string | null
          width?: number | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_nodes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_nodes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_nodes_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "venue_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_notifications: {
        Row: {
          attended_at: string | null
          attended_by: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string | null
          node_id: string | null
          order_id: string | null
          store_id: string
          type: string
        }
        Insert: {
          attended_at?: string | null
          attended_by?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          node_id?: string | null
          order_id?: string | null
          store_id: string
          type: string
        }
        Update: {
          attended_at?: string | null
          attended_by?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          node_id?: string | null
          order_id?: string | null
          store_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_notifications_attended_by_fkey"
            columns: ["attended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_notifications_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "active_venue_states"
            referencedColumns: ["node_id"]
          },
          {
            foreignKeyName: "venue_notifications_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "available_nodes_for_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_notifications_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "venue_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "active_venue_states"
            referencedColumns: ["active_order_id"]
          },
          {
            foreignKeyName: "venue_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_notifications_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_zones: {
        Row: {
          created_at: string
          default_dispatch_station: string | null
          description: string | null
          id: string
          name: string
          primary_location_id: string | null
          store_id: string
        }
        Insert: {
          created_at?: string
          default_dispatch_station?: string | null
          description?: string | null
          id?: string
          name: string
          primary_location_id?: string | null
          store_id: string
        }
        Update: {
          created_at?: string
          default_dispatch_station?: string | null
          description?: string | null
          id?: string
          name?: string
          primary_location_id?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_zones_primary_location_id_fkey"
            columns: ["primary_location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_zones_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_ledger: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          currency: string
          description: string | null
          entry_type: string
          id: string
          idempotency_key: string | null
          payment_method: string | null
          performed_by: string | null
          reference_id: string | null
          reference_type: string | null
          source: string | null
          store_id: string
          wallet_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          currency?: string
          description?: string | null
          entry_type: string
          id?: string
          idempotency_key?: string | null
          payment_method?: string | null
          performed_by?: string | null
          reference_id?: string | null
          reference_type?: string | null
          source?: string | null
          store_id: string
          wallet_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          currency?: string
          description?: string | null
          entry_type?: string
          id?: string
          idempotency_key?: string | null
          payment_method?: string | null
          performed_by?: string | null
          reference_id?: string | null
          reference_type?: string | null
          source?: string | null
          store_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_ledger_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_ledger_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          client_id: string | null
          created_at: string | null
          description: string | null
          id: string
          mp_payment_id: string | null
          payment_method: string | null
          processed_at: string | null
          staff_id: string | null
          status: string | null
          store_id: string | null
          type: string
          user_id: string | null
          wallet_id: string | null
        }
        Insert: {
          amount: number
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          mp_payment_id?: string | null
          payment_method?: string | null
          processed_at?: string | null
          staff_id?: string | null
          status?: string | null
          store_id?: string | null
          type: string
          user_id?: string | null
          wallet_id?: string | null
        }
        Update: {
          amount?: number
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          mp_payment_id?: string | null
          payment_method?: string | null
          processed_at?: string | null
          staff_id?: string | null
          status?: string | null
          store_id?: string | null
          type?: string
          user_id?: string | null
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["user_id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number | null
          currency: string | null
          id: string | null
          last_updated: string | null
          store_id: string | null
          user_id: string
        }
        Insert: {
          balance?: number | null
          currency?: string | null
          id?: string | null
          last_updated?: string | null
          store_id?: string | null
          user_id: string
        }
        Update: {
          balance?: number | null
          currency?: string | null
          id?: string | null
          last_updated?: string | null
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      active_venue_states: {
        Row: {
          active_order_id: string | null
          current_total: number | null
          derived_status: string | null
          label: string | null
          node_id: string | null
          order_start_time: string | null
          order_status: Database["public"]["Enums"]["order_status_enum"] | null
          position_x: number | null
          position_y: number | null
          store_id: string | null
          type: Database["public"]["Enums"]["venue_node_type"] | null
          zone_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_nodes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_nodes_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "venue_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          created_at: string | null
          id: string | null
          new_data: Json | null
          old_data: Json | null
          operation: string | null
          store_id: string | null
          table_name: string | null
          user_id: string | null
          user_name: string | null
          user_role: string | null
        }
        Relationships: []
      }
      available_nodes_for_orders: {
        Row: {
          default_dispatch_station: string | null
          dispatch_station: string | null
          effective_dispatch_station: string | null
          id: string | null
          label: string | null
          sort_priority: number | null
          store_id: string | null
          type: Database["public"]["Enums"]["venue_node_type"] | null
          zone_id: string | null
          zone_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_nodes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_nodes_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "venue_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_closures_detailed: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closed_by_name: string | null
          created_at: string | null
          default_dispatch_station: string | null
          difference: number | null
          duration_hours: number | null
          expected_cash: number | null
          id: string | null
          notes: string | null
          opened_at: string | null
          opened_by: string | null
          opened_by_name: string | null
          real_cash: number | null
          session_id: string | null
          start_amount: number | null
          store_id: string | null
          total_card_sales: number | null
          total_cash_sales: number | null
          total_mp_sales: number | null
          total_orders: number | null
          total_sales: number | null
          total_topups: number | null
          total_wallet_sales: number | null
          zone_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_closures_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_closures_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_closures_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_sessions_summary: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closed_by_name: string | null
          closing_notes: string | null
          created_at: string | null
          difference: number | null
          duration_hours: number | null
          expected_cash: number | null
          id: string | null
          opened_at: string | null
          opened_by: string | null
          opened_by_name: string | null
          real_cash: number | null
          start_amount: number | null
          status: string | null
          store_id: string | null
          total_card_sales: number | null
          total_cash_sales: number | null
          total_mp_sales: number | null
          total_orders: number | null
          total_sales: number | null
          total_topups: number | null
          total_wallet_sales: number | null
          zone_id: string | null
          zone_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "venue_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      products_compat: {
        Row: {
          available: boolean | null
          category: string | null
          category_id: string | null
          category_slug: string | null
          created_at: string | null
          description: string | null
          id: string | null
          image_url: string | null
          is_available: boolean | null
          is_visible: boolean | null
          name: string | null
          price: number | null
          sku: string | null
          store_id: string | null
          tax_rate: number | null
          updated_at: string | null
        }
        Insert: {
          available?: boolean | null
          category?: string | null
          category_id?: never
          category_slug?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          is_available?: boolean | null
          is_visible?: boolean | null
          name?: string | null
          price?: number | null
          sku?: string | null
          store_id?: string | null
          tax_rate?: number | null
          updated_at?: string | null
        }
        Update: {
          available?: boolean | null
          category?: string | null
          category_id?: never
          category_slug?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          is_available?: boolean | null
          is_visible?: boolean | null
          name?: string | null
          price?: number | null
          sku?: string | null
          store_id?: string | null
          tax_rate?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_by_dispatch_station: {
        Row: {
          card_sales: number | null
          cash_sales: number | null
          dispatch_station: string | null
          mp_sales: number | null
          sale_date: string | null
          store_id: string | null
          total_orders: number | null
          total_sales: number | null
          wallet_sales: number | null
          zone_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_add_balance:
        | {
            Args: {
              p_amount: number
              p_description?: string
              p_payment_method?: string
              p_source?: string
              p_user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              amount: number
              description?: string
              staff_id: string
              target_user_id: string
            }
            Returns: number
          }
      admin_add_balance_v2: {
        Args: {
          p_amount: number
          p_description?: string
          p_payment_method: string
          p_user_id: string
        }
        Returns: Json
      }
      admin_add_client_balance: {
        Args: {
          amount: number
          description?: string
          staff_id?: string
          target_client_id: string
        }
        Returns: number
      }
      admin_add_points: {
        Args: {
          description?: string
          points_amount: number
          staff_id?: string
          target_client_id: string
        }
        Returns: number
      }
      admin_grant_gift:
        | {
            Args: {
              gift_description?: string
              gift_name: string
              monetary_cost?: number
              monetary_value?: number
              product_id?: string
              staff_id?: string
              target_client_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              gift_description: string
              gift_name: string
              staff_id: string
              target_client_id: string
            }
            Returns: string
          }
      assign_nfc_to_client: {
        Args: { p_client_id: string; p_nfc_uid: string; p_store_id: string }
        Returns: Json
      }
      calculate_item_totals: { Args: { p_item_id: string }; Returns: undefined }
      calculate_order_points: { Args: { p_order_id: string }; Returns: number }
      calculate_total_stock: {
        Args: { p_inventory_item_id: string }
        Returns: number
      }
      can_manage_store: { Args: { p_store_id: string }; Returns: boolean }
      check_product_stock_availability: {
        Args: { p_product_id: string }
        Returns: boolean
      }
      check_rate_limit: { Args: { p_ip: string }; Returns: boolean }
      classify_and_validate_scan: {
        Args: { scanned_code: string }
        Returns: Json
      }
      close_cash_session: {
        Args: {
          p_closed_by: string
          p_notes?: string
          p_real_cash: number
          p_session_id: string
        }
        Returns: Json
      }
      complete_wallet_payment: { Args: { p_order_id: string }; Returns: Json }
      confirm_order_delivery: {
        Args: { p_order_id: string; p_staff_id: string }
        Returns: Json
      }
      consume_from_open_packages: {
        Args: {
          p_item_id: string
          p_location_id?: string
          p_order_id?: string
          p_reason?: string
          p_required_qty: number
          p_skip_logging?: boolean
          p_store_id: string
          p_unit?: string
        }
        Returns: Json
      }
      consume_from_smart_packages: {
        Args: {
          p_inventory_item_id: string
          p_order_id?: string
          p_reason?: string
          p_required_qty: number
          p_unit: string
        }
        Returns: Json
      }
      consume_from_smart_packages_safe: {
        Args: {
          p_inventory_item_id: string
          p_order_id?: string
          p_reason?: string
          p_required_qty: number
          p_unit: string
        }
        Returns: Json
      }
      create_client_session: {
        Args: {
          p_bar_id?: string
          p_client_id?: string
          p_location_id?: string
          p_qr_id?: string
          p_session_type?: Database["public"]["Enums"]["session_type"]
          p_store_id: string
          p_table_id?: string
          p_ttl_minutes?: number
        }
        Returns: Json
      }
      create_default_location: { Args: { p_store_id: string }; Returns: string }
      create_email_log: {
        Args: {
          p_event_entity: string
          p_event_id: string
          p_event_type: string
          p_idempotency_key: string
          p_payload_core: Json
          p_recipient_email: string
          p_recipient_name: string
          p_recipient_type: string
          p_store_id: string
          p_template_key: string
          p_trigger_source?: string
          p_triggered_by?: string
        }
        Returns: {
          already_exists: boolean
          log_id: string
        }[]
      }
      create_order: {
        Args: {
          p_channel?: string
          p_client_id?: string
          p_delivery_mode?: string
          p_items: Json
          p_location_identifier?: string
          p_node_id?: string
          p_store_id: string
          p_table_number?: string
        }
        Returns: Json
      }
      create_recipe_product: {
        Args: {
          p_base_price: number
          p_name: string
          p_sku: string
          p_store_id: string
        }
        Returns: Json
      }
      create_store_safe: {
        Args: {
          p_idempotency_key: string
          p_name: string
          p_owner_email: string
          p_slug: string
        }
        Returns: string
      }
      credit_wallet: {
        Args: {
          p_mp_payment_id: string
          p_status: string
          p_transaction_id: string
        }
        Returns: Json
      }
      decrease_stock_atomic_v20: {
        Args: {
          p_item_id: string
          p_location_id: string
          p_quantity: number
          p_reason: string
          p_store_id: string
        }
        Returns: undefined
      }
      deduct_order_stock_unified: {
        Args: { p_context?: string; p_order_id: string }
        Returns: Json
      }
      end_session: {
        Args: { p_reason?: string; p_session_id: string }
        Returns: Json
      }
      enqueue_payment_email: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      ensure_client_in_store: { Args: { p_store_id: string }; Returns: Json }
      evaluate_menu_rule: {
        Args: {
          p_bar_id: string
          p_current_time: string
          p_rule: Database["public"]["Tables"]["menu_rules"]["Row"]
          p_session_type: string
          p_table_id: string
          p_weekday: number
        }
        Returns: boolean
      }
      get_active_session: { Args: { p_session_id: string }; Returns: Json }
      get_client_by_nfc: {
        Args: { p_nfc_uid: string; p_store_id: string }
        Returns: Json
      }
      get_default_node_for_store: {
        Args: { p_store_id: string }
        Returns: string
      }
      get_default_node_for_zone: {
        Args: { p_zone_id: string }
        Returns: string
      }
      get_effective_stock: {
        Args: { p_item_id: string }
        Returns: {
          closed_packages: number
          effective_stock: number
          open_packages_count: number
          open_packages_percentage: number
          unit: string
        }[]
      }
      get_financial_chart_data: {
        Args: { p_end_date: string; p_start_date: string; p_store_id: string }
        Returns: Json
      }
      get_financial_metrics: { Args: { p_store_id: string }; Returns: Json }
      get_item_stock_by_locations: {
        Args: { p_item_id: string }
        Returns: {
          closed_units: number
          effective_stock: number
          location_id: string
          location_name: string
          location_type: string
          open_packages_count: number
          open_remaining_sum: number
        }[]
      }
      get_live_session_stats: { Args: { p_session_id: string }; Returns: Json }
      get_location_stock: {
        Args: { p_location_id: string }
        Returns: {
          estimated_value: number
          total_closed_units: number
          total_effective_stock: number
          total_items: number
          total_open_packages: number
        }[]
      }
      get_location_stock_details: {
        Args: { p_location_id: string }
        Returns: {
          closed_units: number
          item_cost: number
          item_image_url: string
          item_name: string
          item_package_size: number
          item_unit_type: string
          open_packages: Json
          res_id: string
          res_item_id: string
        }[]
      }
      get_menu_products: {
        Args: { p_menu_id: string }
        Returns: {
          base_price: number
          category: string
          description: string
          effective_price: number
          image_url: string
          is_available: boolean
          name: string
          position: number
          product_id: string
        }[]
      }
      get_products_with_availability: {
        Args: { p_store_id: string }
        Returns: {
          category_id: string
          description: string
          id: string
          image_url: string
          is_available: boolean
          is_visible: boolean
          name: string
          price: number
        }[]
      }
      get_public_order_status: { Args: { p_order_id: string }; Returns: Json }
      get_session_cash_summary: {
        Args: { query_session_id: string }
        Returns: Json
      }
      get_session_expected_cash: {
        Args: { query_session_id: string }
        Returns: number
      }
      get_stats_by_dispatch_station: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_dispatch_station: string
          p_store_id: string
        }
        Returns: {
          card_sales: number
          cash_sales: number
          dispatch_station: string
          mp_sales: number
          total_orders: number
          total_sales: number
          wallet_sales: number
          zone_name: string
        }[]
      }
      get_store_branding: { Args: { p_store_id: string }; Returns: Json }
      get_store_mp_status: {
        Args: { p_store_id: string }
        Returns: {
          connected_at: string
          is_connected: boolean
          mp_email: string
          mp_first_name: string
          mp_last_name: string
          mp_nickname: string
          mp_user_id: string
        }[]
      }
      get_store_stock: {
        Args: { p_store_id: string }
        Returns: {
          closed_units: number
          id: string
          item_id: string
          location_id: string
          open_packages: Json
          store_id: string
          updated_at: string
        }[]
      }
      get_top_products: {
        Args: { p_end_date: string; p_start_date: string; p_store_id: string }
        Returns: Json
      }
      get_user_store_id: { Args: never; Returns: string }
      insert_product_with_category_mapping: {
        Args: {
          p_category_id?: string
          p_description?: string
          p_image_url?: string
          p_name: string
          p_price?: number
          p_store_id: string
        }
        Returns: string
      }
      inspect_table_columns: {
        Args: { table_name: string }
        Returns: {
          column_name: string
          data_type: string
        }[]
      }
      is_super_admin: { Args: never; Returns: boolean }
      log_inventory_action: {
        Args: {
          p_action_type: string
          p_invoice_ref?: string
          p_item_id: string
          p_location_from?: string
          p_location_to?: string
          p_order_id?: string
          p_package_delta?: number
          p_quantity_delta?: number
          p_reason?: string
          p_source_ui?: string
          p_supplier_id?: string
          p_unit_cost?: number
        }
        Returns: string
      }
      log_qr_scan: {
        Args: {
          p_client_id?: string
          p_client_ip?: string
          p_create_session?: boolean
          p_qr_id: string
          p_source?: Database["public"]["Enums"]["scan_source"]
          p_user_agent?: string
        }
        Returns: Json
      }
      normalize_location_name: { Args: { p_name: string }; Returns: string }
      open_package: {
        Args: { p_item_id: string; p_location_id: string }
        Returns: Json
      }
      open_table: {
        Args: { p_node_id: string; p_store_id: string; p_user_id: string }
        Returns: Json
      }
      p2p_wallet_transfer: {
        Args: { p_amount: number; p_recipient_email: string }
        Returns: Json
      }
      pay_with_wallet: {
        Args: { p_amount: number; p_client_id: string; p_order_id?: string }
        Returns: Json
      }
      redeem_reward: {
        Args: { p_client_id: string; p_order_id: string; p_reward_id: string }
        Returns: Json
      }
      register_fixed_expense: {
        Args: {
          p_amount: number
          p_category: string
          p_date: string
          p_description: string
          p_is_recurring: boolean
          p_name: string
          p_recurrence_frequency: string
          p_store_id: string
        }
        Returns: Json
      }
      resolve_menu: {
        Args: {
          p_bar_id?: string
          p_session_type?: string
          p_store_id: string
          p_table_id?: string
        }
        Returns: string
      }
      rollback_redemption: { Args: { p_order_id: string }; Returns: Json }
      secure_log_qr_scan: {
        Args: { p_client_ip: string; p_qr_hash: string; p_user_agent: string }
        Returns: Json
      }
      sync_bar_location: {
        Args: { p_bar_id: string; p_bar_name: string; p_store_id: string }
        Returns: string
      }
      transfer_stock: {
        Args: {
          p_from_location_id: string
          p_item_id: string
          p_movement_type?: string
          p_notes: string
          p_quantity: number
          p_reason?: string
          p_to_location_id: string
          p_user_id: string
        }
        Returns: Json
      }
      update_email_log_status: {
        Args: {
          p_error_code?: string
          p_error_message?: string
          p_log_id: string
          p_resend_id?: string
          p_resend_response?: Json
          p_status: string
        }
        Returns: boolean
      }
      update_order_node: {
        Args: { p_new_node_id: string; p_order_id: string }
        Returns: Json
      }
      user_tenant_id: { Args: never; Returns: string }
      validate_order_delivery: { Args: { qr_code: string }; Returns: Json }
      verify_loyalty_balance: { Args: { p_client_id: string }; Returns: Json }
      verify_payment: {
        Args: {
          p_amount: number
          p_date_approved: string
          p_mp_payment_id: string
          p_order_id: string
          p_payer_email: string
          p_payment_method: string
          p_payment_type: string
          p_status: string
          p_status_detail: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "super_admin" | "store_owner" | "staff"
      global_role_enum: "super_admin" | "staff"
      inventory_movement_enum: "in" | "out" | "adjustment"
      order_channel_enum: "table" | "qr" | "takeaway" | "delivery"
      order_status_clean:
        | "draft"
        | "pending"
        | "paid"
        | "preparing"
        | "ready"
        | "served"
        | "cancelled"
        | "refunded"
        | "bill_requested"
        | "completed"
        | "delivered"
        | "in_progress"
      order_status_enum:
        | "draft"
        | "pending"
        | "paid"
        | "preparing"
        | "ready"
        | "served"
        | "cancelled"
        | "refunded"
        | "Pendiente"
        | "En Preparación"
        | "Listo"
        | "Entregado"
        | "Cancelado"
        | "bill_requested"
        | "completed"
        | "delivered"
        | "in_progress"
        | "Demorado"
      qr_target_type: "table" | "zone"
      qr_type: "table" | "bar" | "pickup" | "generic"
      scan_source: "camera" | "link" | "manual"
      session_type: "table" | "bar" | "pickup" | "generic"
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "store_owner", "staff"],
      global_role_enum: ["super_admin", "staff"],
      inventory_movement_enum: ["in", "out", "adjustment"],
      order_channel_enum: ["table", "qr", "takeaway", "delivery"],
      order_status_clean: [
        "draft",
        "pending",
        "paid",
        "preparing",
        "ready",
        "served",
        "cancelled",
        "refunded",
        "bill_requested",
        "completed",
        "delivered",
        "in_progress",
      ],
      order_status_enum: [
        "draft",
        "pending",
        "paid",
        "preparing",
        "ready",
        "served",
        "cancelled",
        "refunded",
        "Pendiente",
        "En Preparación",
        "Listo",
        "Entregado",
        "Cancelado",
        "bill_requested",
        "completed",
        "delivered",
        "in_progress",
        "Demorado",
      ],
      qr_target_type: ["table", "zone"],
      qr_type: ["table", "bar", "pickup", "generic"],
      scan_source: ["camera", "link", "manual"],
      session_type: ["table", "bar", "pickup", "generic"],
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
