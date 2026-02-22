-- ============================================================================
-- Fix: BUG-W1 — Drop pay_with_wallet zombie (2 params, sin ledger)
-- Date: 2026-02-18
-- Approved by: user (2026-02-18)
-- Tracked in: known-bugs.md → BUG-W1, pending-decisions.md → PD-004 (W1)
--
-- Diagnóstico:
--   Existen DOS overloads de pay_with_wallet en la DB:
--     1. pay_with_wallet(uuid, numeric)          ← ZOMBIE — UPDATE directo, sin wallet_ledger
--     2. pay_with_wallet(uuid, numeric, uuid)    ← CORRECTA — INSERT wallet_ledger + trigger
--
--   La versión zombie (oid 93810):
--     - No es llamada por ninguna función DB
--     - No es referenciada por ningún trigger
--     - No es usada por el frontend (frontend llama con p_order_id = 3 params)
--     - Hace UPDATE clients SET wallet_balance directamente, sin audit trail
--
-- Fix:
--   DROP FUNCTION pay_with_wallet(uuid, numeric)
--   La versión correcta (3 params) queda intacta.
--
-- No se modifica:
--   - pay_with_wallet(uuid, numeric, uuid DEFAULT NULL) — se mantiene
--   - wallet_ledger, clients.wallet_balance, wallets.balance — sin cambios
--   - Ninguna otra función, trigger o política RLS
--
-- Reversibilidad:
--   Recrear con el body original de la versión zombie si fuera necesario.
-- ============================================================================

BEGIN;

-- Verificar estado previo
DO $$
DECLARE
    v_zombie_exists  BOOLEAN;
    v_correct_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'pay_with_wallet'
          AND pronargs = 2
    ) INTO v_zombie_exists;

    SELECT EXISTS(
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'pay_with_wallet'
          AND pronargs = 3
    ) INTO v_correct_exists;

    IF NOT v_correct_exists THEN
        RAISE EXCEPTION 'CRITICAL: pay_with_wallet(uuid, numeric, uuid) no existe — no se puede proceder sin la versión correcta';
    END IF;

    IF NOT v_zombie_exists THEN
        RAISE NOTICE 'SKIP: pay_with_wallet(uuid, numeric) no existe (ya eliminada o nunca creada)';
    ELSE
        RAISE NOTICE 'PRE-CHECK: zombie pay_with_wallet(uuid, numeric) encontrada — procediendo a eliminar';
    END IF;

    RAISE NOTICE 'PRE-CHECK: pay_with_wallet(uuid, numeric, uuid) presente — versión con ledger activa';
END $$;

-- ============================================================================
-- THE FIX: Eliminar función zombie
-- ============================================================================

DROP FUNCTION IF EXISTS pay_with_wallet(uuid, numeric);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_zombie_exists  BOOLEAN;
    v_correct_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'pay_with_wallet'
          AND pronargs = 2
    ) INTO v_zombie_exists;

    SELECT EXISTS(
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'pay_with_wallet'
          AND pronargs = 3
    ) INTO v_correct_exists;

    IF v_zombie_exists THEN
        RAISE EXCEPTION 'CRITICAL: pay_with_wallet(uuid, numeric) sigue existiendo después del DROP';
    END IF;

    IF NOT v_correct_exists THEN
        RAISE EXCEPTION 'CRITICAL: pay_with_wallet(uuid, numeric, uuid) no existe — se eliminó la función incorrecta';
    END IF;

    RAISE NOTICE '=== BUG-W1 Fix Applied ===';
    RAISE NOTICE 'pay_with_wallet(uuid, numeric): DROPPED (zombie sin ledger)';
    RAISE NOTICE 'pay_with_wallet(uuid, numeric, uuid): EXISTS (versión con wallet_ledger — correcta)';
    RAISE NOTICE '';
    RAISE NOTICE 'Post-deploy verification:';
    RAISE NOTICE '  SELECT proname, pronargs FROM pg_proc WHERE proname = ''pay_with_wallet'';';
    RAISE NOTICE '  → Debe retornar exactamente 1 fila con pronargs = 3';
END $$;

COMMIT;
