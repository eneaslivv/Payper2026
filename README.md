# Payper - Sistema de Gestión Multi-Tenant para Venues Gastronómicos

![Version](https://img.shields.io/badge/version-0.1.1-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Status](https://img.shields.io/badge/status-production-success.svg)

Sistema de gestión integral para cafeterías, bares y restaurantes con soporte multi-tenant, pedidos QR, gestión de inventario inteligente, procesamiento de facturas con IA y estadísticas financieras avanzadas.

## 🚀 Deploy en Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Feneaslivv%2FPayper2026)

### Variables de Entorno Requeridas

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_RESEND_API_KEY=your_resend_key
VITE_GEMINI_API_KEY=your_gemini_key
```

---

## ✨ Características Principales

### 🏪 Multi-Tenant & Multi-Store
- Soporte para múltiples venues bajo una misma organización
- Gestión de roles (Owner, Admin, Staff, Waiter)
- Aislamiento de datos por RLS (Row Level Security)

### 📱 Pedidos QR
- Menú digital responsive con QR por mesa
- Carrito de compras con variantes y addons
- Integración con MercadoPago y Wallet interno
- Tracking de pedidos en tiempo real

### 📊 Panel Financiero Avanzado
- **Estadísticas de Caja en Vivo** (actualización cada 45s)
- **Arqueo de Caja** con desglose detallado:
  - Fondo inicial vs efectivo esperado
  - Facturación total (Efectivo + MP + Wallet)
  - Cantidad de pedidos por sesión
  - Breakdown de métodos de pago
- **Insights Operativos** por período:
  - Total de órdenes
  - Ticket promedio
  - Ingresos totales
  - Discrepancias/merma acumulada

### 📦 Inventario Inteligente (v7.0)
- **Sistema de paquetes abiertos/cerrados**
  - Consumo automático de paquetes abiertos (FIFO)
  - Apertura automática de paquetes cerrados cuando sea necesario
  - Prevención de stock negativo con constraints
- **Recetas con deducción automática**
  - Soporte para ingredientes, variantes y addons
  - Tracking de ml/gr consumidos por pedido
  - Trazabilidad completa en `stock_movements`
- **Auditoría completa**
  - Registro de cada movimiento de stock
  - Rollback automático en cancelaciones
  - Dashboard de salud de inventario

### 🤖 IA para Facturas
- Procesamiento automático de facturas con Google Gemini
- Extracción de productos, cantidades y precios
- Actualización automática de inventario

### 👥 Gestión de Clientes
- Sistema de Wallet (saldo prepago)
- Historial de pedidos
- Recargas de saldo con efectivo o MP

---

## 🛠️ Stack Tecnológico

### Frontend
- **React 18** + **Vite** - UI framework y build tool
- **TypeScript** - Type safety
- **TailwindCSS** - Styling
- **Framer Motion** - Animaciones
- **Recharts** - Gráficos financieros
- **React Router** - Navegación

### Backend
- **Supabase** - Backend as a Service
  - PostgreSQL con RLS
  - Authentication
  - Storage
  - Realtime subscriptions
  - Edge Functions

### Integraciones
- **MercadoPago** - Pagos QR
- **Google Gemini AI** - Procesamiento de facturas
- **Resend** - Emails transaccionales

---

## 📁 Estructura del Proyecto

```
coffe payper/
├── components/          # Componentes reutilizables
│   ├── venue-control/  # Componentes específicos de venues
│   └── ui/             # Componentes de UI base
├── contexts/           # React Contexts (Auth, Client, etc.)
├── hooks/              # Custom hooks (useCashShift, useAuth, etc.)
├── pages/              # Páginas principales
│   ├── OrderBoard.tsx      # Tablero de pedidos (Kanban)
│   ├── Finance.tsx         # Panel financiero
│   ├── InventoryManagement.tsx
│   ├── MenuDesign.tsx      # Editor de menú digital
│   └── ...
├── supabase/
│   └── migrations/     # Migraciones SQL
├── types.ts            # Definiciones de tipos TypeScript
└── utils/              # Utilidades y helpers
```

---

## 🚦 Inicio Rápido

### Prerequisitos
- Node.js 18+
- npm o yarn
- Cuenta de Supabase
- Cuenta de MercadoPago (opcional)

### Instalación

```bash
# Clonar repositorio
git clone https://github.com/eneaslivv/Payper2026.git
cd "coffe payper"

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Ejecutar en desarrollo
npm run dev
```

### Configuración de Supabase

1. Crear proyecto en [Supabase](https://supabase.com)
2. Aplicar migraciones desde `supabase/migrations/`
3. Configurar Storage buckets:
   - `products` (público)
   - `invoices` (privado)
4. Habilitar Authentication con Email/Password

---

## 📚 Documentación Técnica

### Sistema de Caja (Cash Management)

El sistema de caja permite gestionar múltiples cajas/zonas simultáneamente:

```typescript
// Abrir sesión de caja
const { data } = await supabase.rpc('open_cash_session', {
  p_zone_id: zoneId,
  p_initial_cash: 5000
});

// Obtener estadísticas en vivo
const { data } = await supabase.rpc('get_session_cash_summary', {
  p_store_id: storeId,
  p_start_date: startDate,
  p_end_date: endDate
});
```

**Respuesta incluye:**
- `expected_cash`: Fondo + ventas en efectivo + cargas wallet
- `order_count`: Cantidad de pedidos
- `total_revenue`: Facturación total
- `payment_breakdown`: JSONB con desglose por método

### Sistema de Stock v7.0

El sistema de stock v7.0 implementa consumo inteligente de paquetes:

```typescript
// Consumir stock automáticamente
const result = await supabase.rpc('consume_from_smart_packages', {
  p_inventory_item_id: itemId,
  p_required_qty: 50,
  p_unit: 'ml',
  p_order_id: orderId,
  p_reason: 'recipe_consumption'
});
```

**Características:**
- ✅ Consume de paquetes abiertos primero (FIFO)
- ✅ Abre paquetes cerrados automáticamente si es necesario
- ✅ Previene stock negativo con constraints
- ✅ Registra movimientos completos en `stock_movements`
- ✅ Rollback automático en cancelaciones

### Pedidos con Recetas

Cuando se paga un pedido, el trigger `finalize_order_stock` deduce automáticamente:

1. **Ventas directas** de `inventory_items`
2. **Recetas** (`product_recipes`)
3. **Variantes** con `recipe_overrides`
4. **Addons** con `quantity_consumed`

Todo usando `consume_from_smart_packages()` para garantizar consistencia.

---

## 🔒 Seguridad

### Row Level Security (RLS)

Todas las tablas críticas tienen RLS habilitado:

```sql
-- Ejemplo: inventory_items
CREATE POLICY "inventory_select" ON inventory_items FOR SELECT
  USING (store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid()));
```

### Roles y Permisos

| Rol | Permisos |
|-----|----------|
| `owner` | Acceso total al venue |
| `admin` | Gestión operativa completa |
| `staff` | Pedidos, inventario, caja |
| `waiter` | Solo pedidos y clientes |
| `customer` | Solo su wallet y pedidos |

---

## 📈 Roadmap

### v0.2.0 (Próximo)
- [ ] Sistema de productos base (`products_base`, `product_packages`)
- [ ] Múltiples presentaciones por producto
- [ ] Tracking de lotes y vencimientos
- [ ] COGS (Cost of Goods Sold) automático

### v0.3.0
- [ ] Reportes avanzados (PDF/Excel)
- [ ] Dashboard de analytics con BI
- [ ] Integración con sistemas de delivery
- [ ] App móvil nativa (Flutter)

### v0.4.0
- [ ] Sistema de reservas
- [ ] Programa de fidelización
- [ ] Integración con POS físicos
- [ ] Multi-idioma

---

## 🐛 Issues Conocidos

Ver [Issues en GitHub](https://github.com/eneaslivv/Payper2026/issues)

**Críticos resueltos:**
- ✅ Stock negativo (v7.0)
- ✅ Deducción incorrecta de recetas (v7.0)
- ✅ Imágenes de menú no visibles (v0.1.1)
- ✅ Loader infinito en "Configurando Cuenta" (v0.1.1)

---

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

---

## 📄 Licencia

Este proyecto está bajo la licencia MIT. Ver `LICENSE` para más detalles.

---

## 👨‍💻 Autor

**Eneas Livv**
- Email: livveneas@gmail.com
- GitHub: [@eneaslivv](https://github.com/eneaslivv)

---

## 🙏 Agradecimientos

- [Supabase](https://supabase.com) - Backend as a Service
- [Vercel](https://vercel.com) - Hosting
- [Google Gemini](https://ai.google.dev) - IA para facturas
- [MercadoPago](https://www.mercadopago.com.ar) - Pagos

---

## 📞 Soporte

Para soporte técnico o consultas comerciales:
- Email: livveneas@gmail.com
- Issues: [GitHub Issues](https://github.com/eneaslivv/Payper2026/issues)

---

**Hecho con ❤️ en Argentina 🇦🇷**
