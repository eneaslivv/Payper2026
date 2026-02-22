-- ============================================================================
-- Fix: order creation fails with "column status is of type order_status_enum
--      but expression is of type text"
-- Date: 2026-02-21
--
-- Root cause: create_order_atomic() extracted JSONB values with ->> (returns TEXT)
--   but orders.status is order_status_enum and orders.channel is order_channel_enum.
--   PostgreSQL requires explicit casts.
--
-- Also: 'pos' was not in order_channel_enum but frontend sends it as default.
--
-- Functions fixed:
--   1. create_order_atomic — status + channel casts
--   2. sync_offline_order — channel cast (status was already cast)
--   3. create_order_secure — status + channel casts
-- ============================================================================

-- 1. Add 'pos' to order_channel_enum
-- ALTER TYPE order_channel_enum ADD VALUE IF NOT EXISTS 'pos';
-- (deployed via execute_sql — ALTER TYPE ADD VALUE cannot run inside transaction)

-- 2. create_order_atomic: Key changes
--    Line: COALESCE(p_order->>'status', 'pending')::order_status_enum
--    Line: COALESCE(p_order->>'channel', 'pos')::order_channel_enum
--    Line: UPDATE SET status = ... ::order_status_enum (wallet payment path)

-- 3. sync_offline_order: Key change
--    Line: COALESCE(p_order_data->>'channel', 'pos')::order_channel_enum

-- 4. create_order_secure: Key changes
--    Line: 'pending'::order_status_enum
--    Line: p_channel::order_channel_enum

-- All deployed via Supabase MCP execute_sql on 2026-02-21
