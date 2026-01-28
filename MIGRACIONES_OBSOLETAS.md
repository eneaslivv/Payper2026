# MIGRACIONES OBSOLETAS - NO EJECUTAR

Ultima actualizacion: 2026-01-28
Razon: Estas migraciones fueron reemplazadas por el sistema unificado

Stock Deduction (Obsoletas)

Las siguientes migraciones contienen logica de deduccion de stock que fue reemplazada el 2026-01-27 por el sistema unificado.

No ejecutar:

- fix_stock_deduction_trigger.sql
  - Crea: deduct_stock_for_order()
  - Crea: trigger_deduct_stock_on_payment
  - Problema: Deduce stock al pagar (logica vieja)

- move_stock_deduction_to_delivered.sql
  - Crea: finalize_order_stock() (version vieja)
  - Problema: Deduce al marcar 'Entregado' con logica obsoleta

- 20260110043000_ensure_stock_trigger.sql
  - Crea: trigger_finalize_stock_wrapper()
  - Crea: trigger_deduct_stock_on_insert_paid
  - Problema: Deduce en INSERT (causa doble deduccion)

- fix_delivery_and_stock_v4.sql
  - Crea: Versiones viejas de finalize_order_stock
  - Problema: Logica pre-unificacion

- order_creation_function.sql
  - Crea: create_order_with_stock_deduction()
  - Problema: RPC viejo que deduce stock manualmente

Usar en su lugar

Sistema Unificado (2026-01-27):

- 20260127_phase1_safe.sql - Infraestructura base
- 20260127_phase2_safe.sql - Trigger + funcion unificada

Componentes activos:

- Trigger correcto: trg_deduct_stock_unified
- Funcion correcta: deduct_order_stock_unified()
- Condicion: Deduce cuando status cambia a 'served'

Que pasa si ejecuto una obsoleta?

Riesgo: Doble deduccion de stock

Ejemplo:
1. Sistema unificado deduce al marcar 'served'
2. Trigger obsoleto deduce al pagar
Resultado: Stock se deduce 2 veces

Cleanup realizado

Fecha: 2026-01-28
Elementos eliminados:
- 1 trigger obsoleto
- 6 funciones obsoletas

Razon: Auditoria detecto conflictos y riesgo de regresion

Verificacion:

-- Ver triggers activos en orders
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'orders'::regclass
AND tgname LIKE '%stock%';

-- Esperado: Solo trg_deduct_stock_unified

Regla general

Si una migracion:
- Crea triggers con nombres: *deduct*stock* o *finalize*stock*
- Tiene fecha anterior a 2026-01-27
- No es parte del sistema unificado

Entonces: No ejecutar

Si ya ejecutaste una obsoleta

1) Ejecuta el cleanup:
DROP TRIGGER IF EXISTS trg_deduct_stock_on_insert ON orders;
DROP TRIGGER IF EXISTS trigger_deduct_stock_on_payment ON orders;
DROP FUNCTION IF EXISTS handle_stock_on_insert();
DROP FUNCTION IF EXISTS deduct_order_stock(uuid);
DROP FUNCTION IF EXISTS deduct_order_stock(uuid, uuid);

2) Verifica que el trigger correcto este activo:
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgname = 'trg_deduct_stock_unified';

-- Debe retornar: ENABLED

3) Testea creando una orden y verificando que stock se deduce solo 1 vez

Ultima revision: Core Guardian + Stock Agent
Aprobado por: Eneas
