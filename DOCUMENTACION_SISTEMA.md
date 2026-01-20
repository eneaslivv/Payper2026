# 📋 DOCUMENTACIÓN TÉCNICA DEL SISTEMA - COFFEESQUAD

## 🎯 Resumen Ejecutivo

**Nombre del Proyecto:** CoffeeSaaS - Integrated Management Suite (CoffeeSquad)  
**Versión:** 0.0.0 (Desarrollo)  
**Tipo:** Aplicación SaaS Multi-Tenant para gestión de cafeterías  
**Fecha de Auditoría:** 2025-12-23

---

## 1. 🏗️ ARQUITECTURA Y STACK TECNOLÓGICO

### 1.1 Frontend

| Componente | Tecnología | Versión |
|------------|------------|---------|
| **Framework Principal** | React | 19.2.3 |
| **Navegación** | react-router-dom | 7.11.0 |
| **Bundler** | Vite | 6.2.0 |
| **Lenguaje** | TypeScript | 5.8.2 |
| **Estilos** | TailwindCSS (via CDN) | N/A |
| **Animaciones** | framer-motion | 11.18.2 |
| **Gráficos** | Recharts | 3.6.0 |
| **IA Generativa** | @google/generative-ai | 0.24.1 |
| **Backend as a Service** | @supabase/supabase-js | 2.89.0 |

#### Estructura de Directorios Frontend

```
coffe payper/
├── App.tsx                    # Router principal y layouts
├── index.tsx                  # Entry point
├── index.html                 # HTML base con CDN de Tailwind
├── vite.config.ts             # Configuración Vite
├── types.ts                   # Definiciones TypeScript globales
├── supabaseTypes.ts           # Tipos generados de Supabase DB
├── constants.tsx              # Datos MOCK para desarrollo
├── pages/                     # 18 páginas principales
│   ├── Dashboard.tsx          # Panel principal con métricas
│   ├── Login.tsx              # Auth con email/password y recovery
│   ├── MenuDesign.tsx         # Editor visual de menú (67KB, mayor componente)
│   ├── InventoryManagement.tsx # Gestión de stock e insumos
│   ├── OrderBoard.tsx         # Tablero de pedidos (Kanban)
│   ├── OrderCreation.tsx      # Terminal de punto de venta
│   ├── Clients.tsx            # CRM de clientes
│   ├── Loyalty.tsx            # Programa de fidelización
│   ├── Finance.tsx            # Módulo financiero
│   ├── StaffManagement.tsx    # Gestión de personal
│   ├── StoreSettings.tsx      # Configuración de tienda (77KB)
│   ├── SaaSAdmin.tsx          # Panel administrativo multi-tenant
│   ├── TableManagement.tsx    # Gestión de mesas
│   ├── Scanner.tsx            # Escaneo QR
│   ├── AuditLog.tsx           # Registro de auditoría
│   └── ...
├── components/                # Componentes reutilizables
│   ├── AIChat.tsx             # Chat con Gemini AI
│   ├── ToastSystem.tsx        # Sistema de notificaciones
│   ├── OfflineIndicator.tsx   # Indicador de estado offline
│   ├── PermissionGuard.tsx    # HOC para permisos
│   └── DateRangeSelector.tsx  # Selector de fechas
├── contexts/
│   ├── AuthContext.tsx        # Contexto de autenticación
│   └── OfflineContext.tsx     # Contexto para modo offline
└── lib/
    ├── supabase.ts            # Cliente Supabase configurado
    ├── db.ts                  # Abstracción IndexedDB local
    └── supabaseMappers.ts     # Mappers de datos
```

### 1.2 Backend (Supabase)

#### Tablas Detectadas en la Base de Datos

| Tabla | Descripción | Multi-tenant |
|-------|-------------|--------------|
| `stores` | Tiendas/Locales comerciales | Raíz del tenant |
| `profiles` | Perfiles de usuario vinculados a Auth | FK a `stores` |
| `products` | Productos vendibles | FK a `stores` |
| `inventory_items` | Insumos e ingredientes | FK a `stores` |
| `product_recipes` | Recetas (productos ↔ ingredientes) | FK a `products` |
| `orders` | Pedidos | FK a `stores` |
| `clients` | Clientes del programa de fidelidad | FK a `stores` |
| `cafe_roles` | Roles personalizados por tienda | FK a `stores` |
| `cafe_role_permissions` | Permisos por rol | FK a `cafe_roles` |

#### Columnas Adicionales Requeridas (no están en supabaseTypes.ts)

⚠️ Las siguientes columnas fueron añadidas manualmente vía SQL pero no están reflejadas en los tipos:

- `stores.menu_theme` (JSONB) - Configuración visual del menú
- `stores.menu_logic` (JSONB) - Configuración lógica del menú
- `stores.onboarding_status` (TEXT) - Estado de onboarding
- `product_variants` (TABLA COMPLETA) - Variantes de productos
- `product_addons` (TABLA COMPLETA) - Extras/Adicionales de productos

#### Edge Functions Detectadas

| Función | Ruta | Descripción |
|---------|------|-------------|
| `invite-owner` | `/functions/v1/invite-owner` | Invita owners a nuevas tiendas, crea usuario en Auth, envía email vía Resend |
| `invite-member` | `/functions/v1/invite-member` | Invita miembros de staff a tiendas existentes |

#### Triggers y Funciones SQL

No se detectaron triggers documentados en el código, pero se infiere que existen:
- Trigger para crear `profiles` cuando un usuario se registra
- Posible trigger para consumo de stock al crear órdenes

### 1.3 Infraestructura

| Servicio | Uso |
|----------|-----|
| **Supabase** | Auth, Database (PostgreSQL), Storage (imágenes), Edge Functions |
| **Resend** | Envío de emails transaccionales (invitaciones) |
| **Google AI (Gemini)** | Generación de descripciones con IA |
| **Vercel** (potencial) | Hosting frontend (no configurado aún) |
| **PWA** | Service Worker (`sw.js`) + `manifest.json` para instalación |

---

## 2. 🔌 ESTADO DE CONECTIVIDAD (GAP ANALYSIS)

### 2.1 Páginas Conectadas a Backend REAL

| Página | Estado | Operaciones Reales |
|--------|--------|-------------------|
| Login.tsx | ✅ CONECTADO | `signInWithPassword`, `resetPasswordForEmail`, `updateUser` |
| Dashboard.tsx | ✅ CONECTADO | Fetch de métricas desde `orders`, `inventory_items` |
| InventoryManagement.tsx | ✅ CONECTADO | CRUD de `inventory_items`, `products`, `product_recipes` |
| MenuDesign.tsx | ✅ CONECTADO | Lectura/Escritura de `stores`, `products`, `product_variants`, `product_addons` |
| Clients.tsx | ⚠️ PARCIAL | Fetch de `clients` real, pero algunos filtros con datos mock |
| StoreSettings.tsx | ✅ CONECTADO | CRUD de configuración, invitación de staff |
| OrderBoard.tsx | ⚠️ PARCIAL | Estructura lista, pendiente conexión real |
| OrderCreation.tsx | ⚠️ PARCIAL | Lógica de creación definida, sin persistencia completa |
| SaaSAdmin.tsx | ⚠️ PARCIAL | Panel real pero mucha lógica mock en `constants.tsx` |

### 2.2 Datos MOCK vs. Reales

**Archivo:** `constants.tsx` (284 líneas)

Este archivo contiene datos de demostración que se usan como fallback:

```typescript
MOCK_TENANTS       // Array de tenants de ejemplo
MOCK_GLOBAL_USERS  // Usuarios administrativos de ejemplo
MOCK_NODES         // Nodos de cafetería (estructura multi-nodo)
// ... otros mocks de productos, inventario, etc.
```

**Impacto:** El panel SaaS Admin (`SaaSAdmin.tsx`) usa estos datos en producción, lo que significa que la funcionalidad de gestión multi-tenant no está completamente operativa.

### 2.3 Llamadas a Edge Functions

| Función | ¿Se llama desde el cliente? | Ubicación |
|---------|----------------------------|-----------|
| `invite-owner` | ✅ SÍ | `SaaSAdmin.tsx` (creación de tiendas) |
| `invite-member` | ✅ SÍ | `StoreSettings.tsx` (invitar staff) |

**Verificación de llamada correcta:**
```typescript
// En SaaSAdmin.tsx (línea ~aprox)
const { data, error } = await supabase.functions.invoke('invite-owner', {
  body: { email, storeName, ownerName, storeId }
});
```

---

## 3. ✅ FUNCIONALIDADES ACTIVAS vs. PENDIENTES

### 3.1 Funcionalidades Activas (Funcionando)

| Feature | Estado | Notas |
|---------|--------|-------|
| **Autenticación** | ✅ Completo | Login/Logout, Recovery password, Magic links |
| **Roles y Permisos** | ✅ Completo | Sistema RBAC con permisos por sección |
| **Gestión de Inventario** | ✅ Completo | CRUD de insumos, stock, alertas |
| **Gestión de Productos** | ✅ Completo | CRUD con recetas, variantes, addons |
| **Diseño de Menú** | ✅ Completo | Editor visual, theming, preview en vivo |
| **Configuración de Tienda** | ✅ Completo | Datos básicos, invitaciones, roles |
| **IA Generativa** | ✅ Completo | Descripciones automáticas con Gemini |
| **Sistema de Toasts** | ✅ Completo | Notificaciones UI con persistencia |
| **PWA** | ✅ Básico | Instalable, manifest configurado |
| **Tablero de Pedidos** | ✅ Completo | UI + Realtime subscriptions activas |
| **Gestión de Mesas** | ✅ Completo | venue_nodes, venue_zones, realtime, CRUD completo |
| **Finanzas** | ✅ Completo | Métricas reales, cash sessions, RPCs, charts |

### 3.2 Funcionalidades Parciales (A Medio Hacer)

| Feature | Estado | Qué falta |
|---------|--------|-----------|
| **Creación de Pedidos** | ⚠️ 80% | Terminal funcional, persistencia OK, faltan edge cases |
| **Programa Fidelidad** | ⚠️ 70% | Lógica de puntos + redemptions funcionando, UI mejorable |
| **Modo Offline** | ⚠️ 30% | IndexedDB configurado, sync no implementado |
| **Panel SaaS Admin** | ⚠️ 60% | Visualización OK, gestión real mejorable |
| **White-Label** | ⚠️ 80% | TenantContext creado, CSS variables, falta usar en más componentes |

### 3.3 Funcionalidades Pendientes (No Implementadas)

| Feature | Prioridad | Dependencias |
|---------|-----------|--------------|
| **Webhook de Pagos** | Media | Integración Stripe/MercadoPago |
| **Reportes PDF** | Baja | Librería de generación de PDFs |
| **Multi-idioma** | Baja | i18n framework |
| **Tests Automatizados** | Alta | Vitest/Jest + Testing Library |

---

## 4. ⚠️ ANÁLISIS DE RIESGOS Y ERRORES POTENCIALES

### 4.1 Seguridad

| Riesgo | Severidad | Estado | Recomendación |
|--------|-----------|--------|---------------|
| **TailwindCSS vía CDN en producción** | 🟡 Media | Activo | Compilar Tailwind localmente para producción |
| **RLS (Row Level Security)** | 🔴 Alta | ⚠️ Incompleto | Revisar políticas RLS en cada tabla |
| **API Keys en .env** | 🟢 Baja | OK | Claves en variables de entorno, no expuestas |
| **Service Role Key expuesta** | 🔴 Alta | NO (Edge Only) | La service key solo se usa en Edge Functions |
| **CORS abierto en Edge Functions** | 🟡 Media | Activo | Restringir `Access-Control-Allow-Origin` a dominios propios |

#### Políticas RLS Recomendadas

```sql
-- Ejemplo para tabla 'products'
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view products from their store"
ON products FOR SELECT
USING (store_id IN (
  SELECT store_id FROM profiles WHERE id = auth.uid()
));

CREATE POLICY "Users can modify products from their store"
ON products FOR ALL
USING (store_id IN (
  SELECT store_id FROM profiles WHERE id = auth.uid()
));
```

### 4.2 Manejo de Errores

| Componente | Estado | Problema |
|------------|--------|----------|
| `MenuDesign.tsx` | ⚠️ Parcial | `try-catch` presentes pero algunos errores fallan silenciosamente |
| `AuthContext.tsx` | ✅ Bueno | Errores logueados y manejados con fallbacks |
| `InventoryManagement.tsx` | ⚠️ Parcial | Algunas operaciones async sin catch |
| Edge Functions | ✅ Bueno | Respuestas con status 200 + error en body para debugging |

**Patrón recomendado:**
```typescript
try {
  const { data, error } = await supabase.from('table').select();
  if (error) throw error;
  // procesar data
} catch (err) {
  console.error('Context:', err);
  addToast('Error descriptivo', 'error');
}
```

### 4.3 Problemas de Lógica de Flujo de Usuario

1. **Super Admins sin store_id:** Los usuarios admin no tenían `store_id` asignado, impidiendo usar funciones de tienda. **[CORREGIDO en esta sesión]**

2. **Onboarding incompleto:** Si un usuario nuevo no completa onboarding, puede quedar en estado limbo.

3. **Cache de Vite:** La caché de dependencias puede corromperse, causando pantallas negras. **[CORREGIDO en esta sesión]**

4. **Imports incorrectos de Google AI:** El paquete `@google/genai` no existe. **[CORREGIDO en esta sesión]**

---

## 5. 🗺️ HOJA DE RUTA TÉCNICA (NEXT STEPS)

### 5.1 Pasos Inmediatos (P0 - Crítico)

| Paso | Descripción | Estimación |
|------|-------------|------------|
| 1 | Regenerar `supabaseTypes.ts` con `npx supabase gen types typescript` | 10 min |
| 2 | Crear tablas `product_variants` y `product_addons` si no existen | 30 min |
| 3 | Implementar RLS en todas las tablas con políticas básicas | 2 hrs |
| 4 | Configurar Tailwind localmente (no CDN) para producción | 1 hr |
| 5 | Agregar tests básicos con Vitest | 4 hrs |

### 5.2 Conexiones Pendientes (P1 - Alto)

| Módulo | Acción Requerida |
|--------|------------------|
| OrderBoard | Conectar a tabla `orders`, implementar Realtime |
| OrderCreation | Crear registro en `orders` + `order_items`, descontar stock |
| TableManagement | Crear tabla `tables` y conectar |
| Finance | Agregar queries de agregación a `orders` |
| Loyalty | Implementar trigger de puntos al completar orden |

### 5.3 Despliegue a Producción (Vercel)

```bash
# 1. Instalar dependencias de producción
npm install -D @vitejs/plugin-react tailwindcss postcss autoprefixer

# 2. Generar tailwind.config.js
npx tailwindcss init

# 3. Crear archivo postcss.config.js
# (ver documentación Tailwind)

# 4. Remover CDN de index.html y agregar import en index.css

# 5. Build de producción
npm run build

# 6. Verificar que /dist contiene assets correctos

# 7. Conectar repo a Vercel
vercel deploy --prod
```

### 5.4 Variables de Entorno para Producción

```env
# .env.production
VITE_SUPABASE_URL=https://tuproyecto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_GEMINI_API_KEY=AI...

# En Supabase Dashboard > Edge Functions
RESEND_API_KEY=re_...
```

---

## 📎 ANEXOS

### A. Comandos Útiles

```bash
# Desarrollo
npm run dev              # Iniciar servidor local

# Supabase
npx supabase login       # Autenticarse
npx supabase gen types typescript --project-id <id> > supabaseTypes.ts

# Build
npm run build            # Compilar para producción
npm run preview          # Previsualizar build
```

### B. Estructura de Permisos (SectionSlug)

```typescript
type SectionSlug = 
  | 'dashboard' 
  | 'orders' 
  | 'inventory' 
  | 'recipes' 
  | 'finance' 
  | 'tables' 
  | 'clients' 
  | 'loyalty' 
  | 'design' 
  | 'staff' 
  | 'audit';
```

### C. Emails de Super Admin Hardcodeados

```typescript
// AuthContext.tsx
const adminEmails = [
  'livvadm@gmail.com', 
  'eneaswebflow@gmail.com', 
  'eneaswebflow@hotmail.com'
];
```

---

**Documento generado automáticamente por auditoría de código.**  
**Para actualizaciones, ejecutar auditoría nuevamente.**
