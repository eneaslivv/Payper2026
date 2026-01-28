Last updated: 2026-01-28
Reason: These migrations were replaced by the unified system

Obsolete Stock Deduction Migrations

The following migrations contain stock deduction logic that was replaced on 2026-01-27 by the unified system.

Do not execute:

- fix_stock_deduction_trigger.sql
  - Creates: deduct_stock_for_order()
  - Creates: trigger_deduct_stock_on_payment
  - Problem: Deducts stock on payment (legacy logic)

- move_stock_deduction_to_delivered.sql
  - Creates: finalize_order_stock() (legacy version)
  - Problem: Deducts on delivered status with obsolete logic

- 20260110043000_ensure_stock_trigger.sql
  - Creates: trigger_finalize_stock_wrapper()
  - Creates: trigger_deduct_stock_on_insert_paid
  - Problem: Deducts on INSERT (causes double deduction)

- fix_delivery_and_stock_v4.sql
  - Creates: legacy finalize_order_stock variants
  - Problem: Pre-unification logic

- order_creation_function.sql
  - Creates: create_order_with_stock_deduction()
  - Problem: Legacy RPC that deducts stock manually

Use instead: Unified system (2026-01-27)

- 20260127_phase1_safe.sql — Base infrastructure
- 20260127_phase2_safe.sql — Unified trigger + function

Active components:

- Trigger: trg_deduct_stock_unified
- Function: deduct_order_stock_unified()
- Condition: Deducts when status changes to 'served'

What happens if you run an obsolete migration?

Risk: Double stock deduction.

Example:
1. Unified system deducts on 'served' status
2. Obsolete trigger deducts on payment
Result: Stock is deducted twice

Cleanup already performed

Date: 2026-01-28
Removed:
- 1 obsolete trigger
- 6 obsolete functions

Reason: Audit detected conflicts and regression risk

Verification:

-- View active stock triggers on orders
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'orders'::regclass
AND tgname LIKE '%stock%';

-- Expected: only trg_deduct_stock_unified

General rule

If a migration:
- Creates triggers named like *deduct*stock* or *finalize*stock*
- Is dated before 2026-01-27
- Is not part of the unified system

Then: do not execute.

If you already executed an obsolete migration

1) Run cleanup:
DROP TRIGGER IF EXISTS trg_deduct_stock_on_insert ON orders;
DROP TRIGGER IF EXISTS trigger_deduct_stock_on_payment ON orders;
DROP FUNCTION IF EXISTS handle_stock_on_insert();
DROP FUNCTION IF EXISTS deduct_order_stock(uuid);
DROP FUNCTION IF EXISTS deduct_order_stock(uuid, uuid);

2) Verify correct trigger is active:
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgname = 'trg_deduct_stock_unified';

-- Expected: ENABLED

3) Test by creating an order and verifying stock deducts once

Last review: Core Guardian + Stock Agent
Approved by: Eneas
