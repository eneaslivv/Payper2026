-- =============================================
-- MIGRATION: Add Audit Columns to Critical Tables
-- Date: 2026-02-13
-- Issue: 3 tables missing created_at/updated_at for auditability
-- Critical for: Compliance, debugging, data integrity
-- =============================================

-- PART 1: Add audit columns to payment_transactions
-- =============================================

-- payment_transactions - CRITICAL (transactions MUST have timestamps)
ALTER TABLE public.payment_transactions
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Populate existing rows with current timestamp
UPDATE public.payment_transactions
SET created_at = NOW()
WHERE created_at IS NULL;

UPDATE public.payment_transactions
SET updated_at = NOW()
WHERE updated_at IS NULL;

-- Make NOT NULL
ALTER TABLE public.payment_transactions
ALTER COLUMN created_at SET NOT NULL,
ALTER COLUMN updated_at SET NOT NULL;

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_payment_transactions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_payment_transactions_updated_at
ON public.payment_transactions;

CREATE TRIGGER trigger_payment_transactions_updated_at
BEFORE UPDATE ON public.payment_transactions
FOR EACH ROW
EXECUTE FUNCTION update_payment_transactions_updated_at();

COMMENT ON COLUMN public.payment_transactions.created_at IS
'Timestamp when transaction was created (audit trail)';
COMMENT ON COLUMN public.payment_transactions.updated_at IS
'Timestamp when transaction was last updated (audit trail)';


-- PART 2: Add audit columns to stock_movements
-- =============================================

-- stock_movements already has created_at, add updated_at
ALTER TABLE public.stock_movements
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Populate existing rows
UPDATE public.stock_movements
SET updated_at = created_at  -- Use created_at as initial value
WHERE updated_at IS NULL;

-- Make NOT NULL
ALTER TABLE public.stock_movements
ALTER COLUMN updated_at SET NOT NULL;

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_stock_movements_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_stock_movements_updated_at
ON public.stock_movements;

CREATE TRIGGER trigger_stock_movements_updated_at
BEFORE UPDATE ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION update_stock_movements_updated_at();

COMMENT ON COLUMN public.stock_movements.updated_at IS
'Timestamp when movement was last updated (audit trail)';


-- PART 3: Add audit columns to order_events
-- =============================================

-- order_events already has created_at, add updated_at
ALTER TABLE public.order_events
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Populate existing rows
UPDATE public.order_events
SET updated_at = created_at  -- Use created_at as initial value
WHERE updated_at IS NULL;

-- Make NOT NULL
ALTER TABLE public.order_events
ALTER COLUMN updated_at SET NOT NULL;

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_order_events_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_order_events_updated_at
ON public.order_events;

CREATE TRIGGER trigger_order_events_updated_at
BEFORE UPDATE ON public.order_events
FOR EACH ROW
EXECUTE FUNCTION update_order_events_updated_at();

COMMENT ON COLUMN public.order_events.updated_at IS
'Timestamp when event was last updated (audit trail)';


-- PART 4: Optional - Add to cash_movements (good practice)
-- =============================================

-- cash_movements should also have updated_at for consistency
ALTER TABLE public.cash_movements
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Populate existing rows
UPDATE public.cash_movements
SET updated_at = created_at
WHERE updated_at IS NULL;

-- Make NOT NULL
ALTER TABLE public.cash_movements
ALTER COLUMN updated_at SET NOT NULL;

-- Create trigger
CREATE OR REPLACE FUNCTION update_cash_movements_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_cash_movements_updated_at
ON public.cash_movements;

CREATE TRIGGER trigger_cash_movements_updated_at
BEFORE UPDATE ON public.cash_movements
FOR EACH ROW
EXECUTE FUNCTION update_cash_movements_updated_at();


-- PART 5: Verification
-- =============================================

-- Verify all critical tables now have both created_at and updated_at
DO $$
DECLARE
  v_missing_columns TEXT[];
BEGIN
  SELECT ARRAY_AGG(msg)
  INTO v_missing_columns
  FROM (
    -- Check payment_transactions
    SELECT 'payment_transactions missing created_at' AS msg
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'payment_transactions' AND column_name = 'created_at'
    )
    UNION ALL
    SELECT 'payment_transactions missing updated_at'
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'payment_transactions' AND column_name = 'updated_at'
    )
    UNION ALL
    -- Check stock_movements
    SELECT 'stock_movements missing updated_at'
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'stock_movements' AND column_name = 'updated_at'
    )
    UNION ALL
    -- Check order_events
    SELECT 'order_events missing updated_at'
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'order_events' AND column_name = 'updated_at'
    )
  ) t;

  IF v_missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Missing audit columns: %', ARRAY_TO_STRING(v_missing_columns, ', ');
  ELSE
    RAISE NOTICE 'SUCCESS: All critical tables now have complete audit columns';
  END IF;
END $$;

-- Verify triggers were created
SELECT
  trigger_name,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_table IN (
  'payment_transactions',
  'stock_movements',
  'order_events',
  'cash_movements'
)
AND trigger_name LIKE '%updated_at%'
ORDER BY event_object_table;

-- Expected: 4 triggers (one per table)

-- Display audit columns for verification
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name IN (
  'payment_transactions',
  'stock_movements',
  'order_events',
  'cash_movements'
)
AND column_name IN ('created_at', 'updated_at')
ORDER BY table_name, column_name;

-- Expected: All columns present with NOT NULL and DEFAULT NOW()
