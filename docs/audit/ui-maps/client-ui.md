# Client UI Routes — Payper Platform

**Generated:** 2026-01-04  
**Type:** Read-Only Platform Audit  
**Layout:** `ClientLayout`  
**Users:** Customers (authenticated & guest)

---

## Layout Overview

**File:** `components/client/ClientLayout.tsx`

**Access:** Public (no authentication required)

**Design:** Mobile-first, customer-facing menu

**Features:**
- Bottom navigation bar
- Active order widget
- Store theme customization
- PWA support

---

## Route Structure

**Base Path:** `/m/:slug` or `/:storeSlug`

**URL Format:**
```
{{app_url}}/#/m/{{store_slug}}
or
{{app_url}}/#/{{store_slug}}
```

---

## Route Map

### Menu Browse
- **Path:** `/m/:slug`
- **Component:** `ClientMenuPage`
- **Auth:** Not required
- **Description:** Main menu with product grid

**Features:**
- Category filtering
- Product cards with images
- Search functionality
- Add to cart quick actions

---

### Product Detail
- **Path:** `/m/:slug/product/:id`
- **Component:** `ClientProductPage`
- **Auth:** Not required
- **Description:** Product detail view

**Features:**
- Product description
- Price display
- Quantity selector
- Add to cart button
- Customization options (if supported)

---

### Cart
- **Path:** `/m/:slug/cart`
- **Component:** `ClientCartPage`
- **Auth:** Not required
- **Description:** Shopping cart

**Features:**
- Item list with quantities
- Remove items
- Adjust quantities
- Total calculation
- Proceed to checkout button

**Note:** Cart stored in localStorage (persists across sessions)

---

### Checkout
- **Path:** `/m/:slug/checkout`
- **Component:** `ClientCheckoutPage`
- **Auth:** Optional (guest checkout allowed)
- **Description:** Order finalization

**Features:**
- Customer info input (name, phone, email)
- Table selection (QR context)
- Payment method selection:
  - Mercado Pago
  - Wallet (if authenticated)
  - Cash (if enabled)
- Loyalty rewards selection
- Order notes

**Payment Flow:**
1. Select payment method
2. If MP: Redirect to Mercado Pago
3. If Wallet: Instant confirmation
4. If Cash: Mark as pending

---

### Order Tracking
- **Path:** `/m/:slug/tracking/:orderId`
- **Component:** `ClientTrackingPage`
- **Auth:** Not required
- **Description:** Real-time order status

**Features:**
- Status timeline (Received → Preparing → Ready → Delivered)
- Estimated time
- Order details
- Cancel option (if pending)

---

### Order Status (Alternative)
- **Path:** `/m/:slug/order/:orderId`
- **Component:** `ClientOrderStatusPage`
- **Auth:** Not required
- **Description:** Order confirmation/status view

*(Possibly duplicate of tracking)*

---

### Authentication

#### Login/Register
- **Path:** `/m/:slug/auth`
- **Component:** `ClientAuthPage`
- **Auth:** Public
- **Description:** Client login or signup

**Features:**
- Email/password login
- Social login (if configured)
- Guest → Account conversion
- Password reset

**Post-Auth:**
- Auto-links orders to account
- Enables wallet & loyalty

---

### Profile
- **Path:** `/m/:slug/profile`
- **Component:** `ClientProfilePage`
- **Auth:** Required
- **Description:** Customer profile

**Features:**
- Personal info edit
- Order history
- Wallet balance
- Loyalty points
- Saved addresses (if supported)

---

### Loyalty
- **Path:** `/m/:slug/loyalty`
- **Component:** `ClientLoyaltyPage`
- **Auth:** Required
- **Description:** Loyalty rewards catalog

**Features:**
- Points balance display
- Available rewards
- Redeem rewards
- Transaction history

**Redemption Flow:**
1. Select reward
2. Confirm redemption
3. Receive confirmation
4. Use at checkout or receive product

---

### Wallet
- **Path:** `/m/:slug/wallet`
- **Component:** `ClientWalletPage`
- **Auth:** Required
- **Description:** Digital wallet management

**Features:**
- Balance display
- Add funds button
- Transaction history
- Payment method for orders

**Topup Flow:**
1. Click "Add Funds"
2. Enter amount
3. Redirect to Mercado Pago
4. Payment confirmed
5. Balance updated

**Back URLs:**
- Success: `/m/:slug/wallet?status=success&txn={{id}}`
- Failure: `/m/:slug/wallet?status=failure&txn={{id}}`
- Pending: `/m/:slug/wallet?status=pending&txn={{id}}`

---

## Order Confirmation Routes

**Path Patterns:**
- `/orden/:orderId/confirmado` — Payment approved
- `/orden/:orderId/error` — Payment failed
- `/orden/:orderId/pendiente` — Payment pending

**Component:** `OrderConfirmationPage`

**Features:**
- Order summary
- Payment status
- Next steps
- Return to menu button

**Query Params (MP Redirect):**
- `collection_id` — Payment ID
- `collection_status` — Payment status
- `payment_id` — Payment reference
- `preference_id` — Checkout session

---

## QR Resolution

**Path:** `/qr/:hash`

**Component:** `QRResolver`

**Flow:**
1. QR scanned
2. Resolves `hash` to `table_id` + `store_slug`
3. Saves context to localStorage
4. Redirects to `/m/:slug`

**Context Stored:**
```typescript
{
  tableId: string,
  tableLabel: string,
  storeSlug: string,
  timestamp: number
}
```

---

## Navigation Structure (Bottom Bar)

**Items (from ClientLayout):**

1. **Home** — `/m/:slug`
   - Icon: `home`
   - Label: "Menú"

2. **Cart** — `/m/:slug/cart`
   - Icon: `shopping_cart`
   - Label: "Carrito"
   - Badge: Item count

3. **Orders** — `/m/:slug/profile` (or `/orders` if exists)
   - Icon: `receipt_long`
   - Label: "Pedidos"

4. **Profile** — `/m/:slug/profile`
   - Icon: `person`
   - Label: "Perfil"

**Active Order Widget:**
- Shown if active order exists
- Click → Navigate to `/m/:slug/tracking/:orderId`

---

## URL Aliases

### Direct Store Link
- **Path:** `/:storeSlug`
- **Component:** `MenuPage`
- **Description:** Simplified direct link to menu

**Example:**
```
{{app_url}}/#/my-cafe
```

**Resolution:**
1. Check if slug exists in `stores` table
2. If yes → Load menu
3. If no → Show 404

---

## Theme Customization

**Source:** `stores.menu_theme` (JSONB)

**Customizable:**
- Primary color
- Background color
- Font family
- Logo
- Banner image

**Applied:** Via CSS variables in `ClientLayout`

---

## PWA Features

### Install Prompt
- **Trigger:** After 2+ visits
- **Action:** Show "Add to Home Screen" prompt

### Offline Support
- **Menu:** Cached for offline viewing
- **Orders:** Queued for sync

### Standalone Mode
- **Redirect:** On app launch, redirect to last visited store
- **Storage:** `localStorage.setItem('last_store_slug', slug)`

---

## Security & Privacy

### Guest Mode
- **Allowed:** Browse, cart, checkout
- **Limited:** No wallet, no loyalty, no order history

### Authenticated Mode
- **Required For:**
  - Wallet topup
  - Loyalty rewards
  - Profile editing
  - Order history

### Data Isolation
- **Cart:** Per-device (localStorage)
- **Orders:** Per-client (linked by email)
- **Wallet/Loyalty:** Per-client account

---

## Key Observations

**✅ CONFIRMED:**
- Public access (no auth required for browsing)
- Guest checkout supported
- QR table linking
- Wallet & loyalty integration
- PWA optimized

**❓ UNKNOWN:**
- Whether social login is implemented
- Full theme customization options
- Offline order submission logic
- Whether multiple menus per store exist

**⚠️ NOTES:**
- Routes work for both authenticated and guest users
- Cart persists in localStorage
- Table assignment via QR context
- All routes prefixed with `/m/:slug`
