# references/agents.md

## Principio de Uso

- UN solo agente por tarea
- Nunca múltiples agentes simultáneos
- El agente domina su módulo completamente

## Agentes Disponibles

### orders-agent

**Dominio**: Pedidos, estados, transiciones, Order Board

**Responsabilidades**:
- Ciclo de vida del pedido
- Transiciones de estado válidas
- Lógica del Order Board
- Asociación mesa/cliente
- Cancelaciones y modificaciones

**Archivos clave**:
- `OrderBoard.tsx`
- `useOrders.ts`
- Tablas: `orders`, `order_items`

**Skills**: `state-machine`

---

### stock-agent

**Dominio**: Stock, movimientos, deducciones

**Responsabilidades**:
- Niveles de stock por location
- Movimientos (venta, ajuste, corrección)
- Alertas de stock bajo
- Transferencias entre locations
- Auditoría de movimientos

**Archivos clave**:
- `LogisticsView.tsx`
- `useStock.ts`
- Tablas: `stock`, `stock_movements`, `location_stock`

**Regla crítica**: Todo cambio de stock genera movimiento registrado

---

### inventory-agent

**Dominio**: Insumos, recetas, consumo

**Responsabilidades**:
- Catálogo de insumos
- Definición de recetas
- Cálculo de consumo teórico
- Relación producto ↔ insumos
- Costeo de recetas

**Archivos clave**:
- `RecipeEditor.tsx`
- `useInventory.ts`
- Tablas: `supplies`, `recipes`, `recipe_items`

**Lógica clave**: Vender "café" descuenta según receta (panceta, jamón, etc.)

---

### frontend-agent

**Dominio**: UI, componentes React, UX

**Responsabilidades**:
- Componentes visuales
- Estados de loading/error
- Responsive design
- Accesibilidad
- Consistencia visual

**Archivos clave**:
- `components/`
- `views/`
- Estilos y themes

**Skills**: `ui-consistency`

---

### security-agent

**Dominio**: RLS, permisos, autenticación

**Responsabilidades**:
- Políticas RLS
- Validación de roles
- Aislamiento multi-tenant
- Sesiones y tokens
- Onboarding seguro

**Archivos clave**:
- `AuthContext.tsx`
- Políticas en Supabase
- Tablas: `profiles`, `store_members`

**Skills**: `rls-audit`

**Regla crítica**: Toda query debe respetar `store_id`

---

### payments-agent

**Dominio**: Pagos, finanzas, turnos

**Responsabilidades**:
- Cierre de pedidos
- Control de caja
- Turnos (shifts)
- Reportes financieros
- Diferencias de caja

**Archivos clave**:
- `ShiftManager.tsx`
- `FinanceView.tsx`
- Tablas: `payments`, `shifts`

---

### core-guardian

**Dominio**: Sistema completo, validación cross-módulo

**Cuándo escalar**:
- Cambio toca más de un módulo
- Impacto en stock + pedidos + pagos
- Cambios en schema de BD
- Dudas de consistencia
- Migraciones

**Responsabilidades**:
- Validar propuestas contra reglas del sistema
- Detectar breaking changes
- Aprobar/rechazar cambios críticos
- Mantener integridad arquitectónica

**NO ejecuta cambios**, solo valida.

## Tabla de Decisión

| Síntoma | Agente |
|---------|--------|
| "El pedido no cambia de estado" | `orders-agent` |
| "No se descuenta stock" | `stock-agent` |
| "La receta no calcula bien" | `inventory-agent` |
| "El componente no renderiza" | `frontend-agent` |
| "No puedo ver datos de mi tienda" | `security-agent` |
| "La caja no cuadra" | `payments-agent` |
| "Esto afecta varios módulos" | `core-guardian` |
