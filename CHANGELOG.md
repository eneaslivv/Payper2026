# Changelog

Todos los cambios notables en este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [0.1.1] - 2026-02-03

### 🎉 Destacados
- **Sistema de Stock v7.0** - Consumo inteligente de paquetes con prevención de stock negativo
- **Estadísticas Avanzadas de Caja** - Desglose completo por método de pago y sesión
- **Mejoras en Cierre de Turno** - Opción para archivar pedidos activos

### ✨ Agregado

#### Panel Financiero
- Estadísticas de caja en vivo con actualización automática cada 45 segundos
- Resumen global de efectivo total en todas las cajas abiertas
- Desglose detallado por sesión:
  - Cantidad de pedidos realizados
  - Facturación total (todos los métodos de pago)
  - Breakdown de pagos (Efectivo, MercadoPago, Wallet)
- Componente `OperationalInsights` para resumen de período:
  - Total de órdenes
  - Ticket promedio
  - Ingresos totales
  - Discrepancias/merma acumulada
- Modal de cierre de caja mejorado con estadísticas completas

#### Sistema de Inventario (v7.0)
- Función `consume_from_smart_packages()` para consumo inteligente:
  - Consume de paquetes abiertos primero (FIFO)
  - Abre paquetes cerrados automáticamente cuando sea necesario
  - Validación previa de stock disponible
  - Registro completo en `stock_movements`
- Función `calculate_total_stock()` para cálculo preciso de stock total
- Función `rollback_stock_consumption()` para cancelaciones
- Constraints de base de datos para prevenir stock negativo:
  - `CHECK (current_stock >= 0)`
  - `CHECK (closed_stock >= 0)`
- Índices de performance para queries de stock
- Columna `stock_logic_version` para versionado del sistema

#### Tablero de Pedidos
- Opción para archivar pedidos activos al cerrar turno
- Checkbox "Archivar también pedidos activos" con advertencia visual
- Contador de pedidos activos vs completados en modal de cierre
- Botón dinámico que cambia de "Limpiar Tablero" a "Limpiar TODO"

#### Base de Datos
- RPC `get_session_cash_summary` actualizado con:
  - `order_count` por sesión
  - `total_revenue` por sesión
  - `payment_breakdown` (JSONB) con desglose de métodos
- Trigger `finalize_order_stock` actualizado a v7:
  - Usa `consume_from_smart_packages` para toda deducción
  - Soporte completo para recetas, variantes y addons
  - Manejo robusto de errores sin bloquear ventas

### 🔧 Modificado

#### Navegación
- `OrderBoard.tsx` ahora navega a `/finance?tab=caja` al ir a Arqueo de Caja
- `Finance.tsx` sincroniza pestaña activa con query parameter `?tab=`

#### Triggers de Stock
- Eliminados triggers v6 (`trg_finalize_stock_v6_update`, `trg_finalize_stock_v6_insert`)
- Creados triggers v7 con lógica mejorada
- Actualizado enum de `stock_movements.reason` con valores: `'sale'`, `'open_package'`

#### UI/UX
- Tarjetas de zona en Finance ahora muestran estadísticas avanzadas
- Modal de cierre de turno rediseñado con más información
- Mejoras visuales en indicadores de estado de pedidos

### 🐛 Corregido

#### Stock Negativo (CRÍTICO)
- ✅ Corregidos 2 items con stock negativo:
  - "holis": -10 kilos → 0 kilos
  - "Jamon cocido Tradicional Campo Austral": -3 kilos → 0 kilos
- ✅ Agregados constraints para prevenir futuros casos
- ✅ Sistema ahora valida stock antes de deducir

#### Cierre de Turno
- ✅ Botón "Limpiar Tablero" ahora archiva correctamente todos los pedidos
- ✅ Pedidos en estado "Proceso" y "Listo" ahora se pueden archivar
- ✅ Advertencia clara cuando hay pedidos activos

#### Deducción de Stock
- ✅ Trigger ahora respeta `open_packages` antes de deducir
- ✅ Apertura automática de paquetes cerrados cuando sea necesario
- ✅ Registro completo de movimientos en `stock_movements`
- ✅ Rollback automático en cancelaciones de pedidos

### 🗃️ Base de Datos

#### Migraciones Aplicadas
- `migration_v7_smart_packages.sql` - Sistema de consumo inteligente
- Backup de datos pre-migración en:
  - `inventory_items_backup_v7`
  - `trigger_backup_v7`

#### Nuevas Funciones
- `calculate_total_stock(p_inventory_item_id UUID) RETURNS NUMERIC`
- `consume_from_smart_packages(...) RETURNS JSONB`
- `rollback_stock_consumption(p_order_id UUID) RETURNS JSONB`

#### Índices Agregados
- `idx_open_packages_item_active` - Búsqueda de paquetes disponibles
- `idx_open_packages_opened_at` - Orden FIFO
- `idx_stock_movements_order` - Trazabilidad por orden
- `idx_inventory_items_active` - Filtros por tienda

### 📊 Métricas de Mejora

| Métrica | Antes | Después | Mejora |
|---------|-------|---------|--------|
| Items con stock negativo | 2 | 0 | ✅ 100% |
| Validación pre-consumo | ❌ No | ✅ Sí | ✅ Nueva feature |
| Apertura automática paquetes | ❌ No | ✅ Sí | ✅ Nueva feature |
| Trazabilidad movimientos | ⚠️ Parcial | ✅ Completa | ✅ Mejorada |
| Constraints de seguridad | ❌ No | ✅ Sí | ✅ Nueva protección |

### 🔐 Seguridad
- Constraints de base de datos para prevenir stock negativo
- Validación de stock disponible antes de procesar ventas
- Registro completo de auditoría en `stock_movements`

### ⚠️ Breaking Changes
- Ninguno - La migración v7.0 es compatible con código existente

### 📝 Notas de Migración
- Backup automático realizado antes de aplicar v7.0
- Rollback disponible si es necesario (ver documentación)
- Se recomienda monitorear `stock_deduction_errors` las primeras 24h

---

## [0.1.0] - 2026-01-29

### ✨ Agregado

#### Menú Digital
- Sistema de menú digital con QR por mesa
- Editor de menú con drag & drop
- Soporte para categorías, variantes y addons
- Imágenes de productos con upload a Supabase Storage

#### Gestión de Pedidos
- Tablero Kanban de pedidos (Pendiente → Proceso → Listo → Entregado)
- Vista de lista con filtros avanzados
- Notificaciones en tiempo real de nuevos pedidos
- Asignación de pedidos a estaciones de trabajo
- Badges de estado de pago (Efectivo, MercadoPago, Wallet, Pendiente)

#### Sistema de Pagos
- Integración con MercadoPago (QR dinámico)
- Sistema de Wallet interno (saldo prepago)
- Recargas de saldo con efectivo o MercadoPago
- Tracking de estado de pagos en tiempo real

#### Gestión de Clientes
- Registro de clientes con email y teléfono
- Historial de pedidos por cliente
- Sistema de Wallet con recargas
- Vista de clientes por local

#### Inventario
- CRUD completo de productos de inventario
- Sistema de paquetes abiertos/cerrados
- Tracking de stock en tiempo real
- Procesamiento de facturas con IA (Google Gemini)
- Categorización automática de productos

#### Panel Financiero
- Dashboard de ventas con gráficos (Recharts)
- Filtros por fecha y período
- KPIs principales (ingresos, pedidos, ticket promedio)
- Sistema de caja con múltiples zonas
- Apertura/cierre de turnos de caja

#### Autenticación y Roles
- Sistema de roles (Owner, Admin, Staff, Waiter, Customer)
- Row Level Security (RLS) en Supabase
- Auto-heal de perfiles incompletos
- Protección de rutas por rol

### 🔧 Modificado
- Migración de Create React App a Vite
- Actualización a React 18
- Refactor completo de contextos (Auth, Client)

### 🐛 Corregido
- Loader infinito en "Configurando Cuenta"
- Imágenes de menú no visibles en publicación
- Conflictos de slugs en menús
- Errores de RLS en `order_items`

### 🗃️ Base de Datos
- Schema completo con 30+ tablas
- RLS policies en todas las tablas críticas
- Triggers para deducción automática de stock
- Índices de performance

---

## [0.0.1] - 2025-12-15

### ✨ Agregado
- Proyecto inicial
- Configuración de Supabase
- Estructura base de React

---

## Tipos de Cambios

- `✨ Agregado` - Nuevas características
- `🔧 Modificado` - Cambios en funcionalidad existente
- `🐛 Corregido` - Corrección de bugs
- `🗃️ Base de Datos` - Cambios en schema o migraciones
- `🔐 Seguridad` - Mejoras de seguridad
- `⚠️ Breaking Changes` - Cambios que rompen compatibilidad
- `📝 Notas` - Información adicional importante

---

**Formato de versiones:** `MAJOR.MINOR.PATCH`
- **MAJOR**: Cambios incompatibles en la API
- **MINOR**: Nuevas funcionalidades compatibles
- **PATCH**: Correcciones de bugs compatibles
