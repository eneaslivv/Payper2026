# references/system-overview.md

## Qué es Payper

SaaS Multi-Tenant para bares, cafeterías y venues gastronómicos.
Versión: 0.1.1 | Estado: Pre-Production

## Objetivo Central

Garantizar consistencia entre:
- Lo que se vende
- Lo que se consume
- Lo que se cobra
- Lo que queda en stock
- Quién lo hizo
- Cuándo ocurrió

## Arquitectura

### Multi-Tenancy

- Cada tienda = tenant aislado
- Todas las tablas incluyen `store_id`
- Todas las consultas protegidas por RLS
- Ningún JOIN cruza tiendas

### Stack Técnico

- **Database**: Supabase (PostgreSQL + RLS)
- **Frontend**: React + TypeScript
- **Offline**: Sync con conflict resolution
- **Realtime**: Supabase subscriptions

## Módulos Principales

### 1. Pedidos (Orders)
- Estados: `draft` → `enviado` → `en_preparacion` → `listo` → `entregado`
- Order Board para operación en tiempo real
- Asociación a mesas y clientes

### 2. Inventario (Stock)
- Insumos con unidades (ml, gr, unidad)
- Stock actual y mínimo por location
- Movimientos auditados

### 3. Recetas
- Productos compuestos (ej: cóctel = vodka + jugo + hielo)
- Consumo se descuenta al vender, NO al crear
- Cálculo de costo teórico

### 4. Productos
- Precio base + variantes + addons
- Categorías y disponibilidad
- Menú digital configurable

### 5. Finanzas
- Ingresos diarios/mensuales
- Control por turno (shift)
- NO es contabilidad fiscal

### 6. Staff & Permisos
- Roles: Super Admin, Store Owner, Manager, Staff, Viewer
- RBAC por acción
- Permisos evaluados en frontend Y backend

## Flujo Crítico: Pedido Completo

1. Crear pedido (draft)
2. Validar stock disponible
3. Persistir ítems
4. Enviar a preparación
5. Marcar como entregado → **AQUÍ se descuenta stock**
6. Impactar finanzas
7. Actualizar board

## Componentes Clave (Código)

- `OfflineContext.tsx` - Manejo de sync offline
- `OrderBoard.tsx` - Vista central operativa
- `LogisticsView.tsx` - Gestión de inventario
- `VenueItem.tsx` - Items del menú
