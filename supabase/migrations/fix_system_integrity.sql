-- =============================================
-- SYSTEM INTEGRITY FIX & CLEANUP (CORREGIDO)
-- Corrige conflictos y maneja re-creacion de Vistas de forma segura
-- =============================================

-- 1. LOYALTY TRANSACTIONS FIX
-- El sistema antiguo tenía un constraint restringido a 'earn', 'redeem'.
-- El nuevo sistema usa 'earn', 'burn', 'adjust', 'rollback'.
-- Ampliamos el constraint para soportar ambos.
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Buscar constraints CHECK en loyalty_transactions y borrarlos
    FOR r IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.loyalty_transactions'::regclass 
        AND contype = 'c'
    LOOP
        EXECUTE 'ALTER TABLE public.loyalty_transactions DROP CONSTRAINT ' || r.conname;
    END LOOP;
END $$;

-- Agregar el nuevo constraint permisivo
ALTER TABLE public.loyalty_transactions 
ADD CONSTRAINT loyalty_transactions_type_check 
CHECK (type IN ('earn', 'redeem', 'burn', 'adjust', 'rollback'));


-- 2. ENSURE VENUE VIEW EXISTS (SAFE RECREATE)
-- ERROR FIX: "cannot drop columns from view". Hay que borrarla primero.
DROP VIEW IF EXISTS public.active_venue_states;

CREATE OR REPLACE VIEW public.active_venue_states AS
SELECT 
  vn.id as node_id,
  vn.store_id,
  vn.label,
  vn.type,
  vn.position_x,
  vn.position_y,
  vn.zone_id,
  -- Derived Status
  CASE 
    WHEN o.id IS NOT NULL THEN 'occupied'
    ELSE 'free'
  END::text as derived_status,
  -- Active Order Info
  o.id as active_order_id,
  o.status as order_status,
  o.total_amount as current_total,
  o.created_at as order_start_time
FROM public.venue_nodes vn
LEFT JOIN public.orders o ON vn.id = o.node_id AND o.status IN ('draft', 'pending', 'preparing', 'ready', 'served');

COMMENT ON VIEW public.active_venue_states IS 'Vista de Integridad del Venue Control System (Re-creada)';
