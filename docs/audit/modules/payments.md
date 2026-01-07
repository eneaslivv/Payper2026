# Payments Module — Payper Platform

**Generated:** 2026-01-04  
**Type:** Read-Only Platform Audit  
**Status:** AS-IS Documentation

---

## Module Overview

The Payments module integrates Mercado Pago as the primary payment gateway, supporting:
1. **Order payments** — Standard checkout flow
2. **Wallet topups** — Adding balance to client wallets
3. **Email notifications** — Payment confirmations, rejections, refunds

---

## Architecture

### Components

**Client-Side:**
- `pages/client/CheckoutPage.tsx` — Customer checkout UI
- `hooks/useCheckout.ts` — Checkout logic (assumed)
- `hooks/useMercadoPagoConnect.ts` — Store MP OAuth connection
- `components/PaymentSettings.tsx` — Admin MP configuration

**Edge Functions (Supabase):**
- `create-topup/index.ts` — Creates MP preference for wallet topup
- `mp-webhook/index.ts` — Processes MP webhook notifications
- `verify-payment-status/index.ts` — Manual payment verification
- `send-email/index.ts` — Sends payment emails (not inspected)

**Database:**
- RPC: `verify_payment` — Updates order payment status
- RPC: `credit_wallet` — Credits wallet on topup
- RPC: `create_email_log` / `update_email_log_status` — Email tracking

---

## Payment Flows

### 1. Order Payment (Mercado Pago)

**Checkout Process:**

1. **Customer selects "Mercado Pago"** at checkout
2. **CheckoutPage.tsx** calls edge function `create-topup` (or similar order flow):
   - Passes: `store_id`, `user_id`, `amount`, `back_urls`
   - For orders: Uses `external_reference = order_id`
3. **Edge Function:**
   - Fetches `store.mp_access_token`
   - Checks token expiration → Refreshes if needed
   - Creates MP Preference:
     ```json
     {
       "items": [{"title": "...", "unit_price": amount, "quantity": 1, "currency_id": "ARS"}],
       "external_reference": "order_{{order_id}}",
       "back_urls": {success, failure, pending},
       "auto_return": "approved",
       "notification_url": "{{supabase_url}}/functions/v1/mp-webhook?store_id={{store_id}}"
     }
     ```
   - Returns `checkout_url` (init_point)
4. **Customer redirected to Mercado Pago**
5. **Customer completes payment**
6. **Mercado Pago sends webhook** to `/mp-webhook`

**Webhook Processing (`mp-webhook/index.ts`):**

1. **Receives** MP notification (topic: `payment`)
2. **Logs webhook** to `payment_webhooks` table (for auditing)
3. **Fetches payment details** from MP API: `GET /v1/payments/{id}`
4. **Identifies order** via `external_reference`
5. **Calls RPC** `verify_payment` with:
   - `p_mp_payment_id`
   - `p_order_id`
   - `p_amount`, `p_status`, `p_status_detail`
   - `p_payment_method`, `p_payer_email`
6. **RPC updates `orders` table:**
   - Sets `payment_status = 'approved'`
   - Sets `is_paid = true`
   - Sets `payment_provider = 'mercadopago'`
7. **Sends payment confirmation email** (if approved)

**Email Notifications:**

**Approved:**
- Template: `generatePaymentApprovedHtml()`
- Subject: `✓ Pago Confirm ado - Pedido #{{order_number}}`
- Includes: Order details, items, payment method, reference ID

**Rejected:**
- Template: `generatePaymentRejectedHtml()`
- Subject: `⚠️ Pago no procesado`
- Includes: Rejection reason

**Refunded:**
- Template: `generatePaymentRefundedHtml()`
- Subject: `↩ Reembolso procesado`
- Shows: Refund amount (partial or full)

**Email Idempotency:**
- Key: `payment_approved_{{payment_id}}_{{order_id}}`
- Prevents duplicate emails via `create_email_log` RPC

---

### 2. Wallet Topup Flow

**Process:**

1. **Client navigates** to `/m/:slug/wallet`
2. **Clicks "Add Funds"** → Selects amount
3. **Calls** edge function `create-topup`:
   - Passes: `store_id`, `user_id`, `amount`
4. **Edge function:**
   - Creates `wallet_transactions` record with `type = 'topup_pending'`
   - Creates MP preference with `external_reference = topup_{{transaction_id}}`
   - Returns `checkout_url`
5. **Client redirected to Mercado Pago**
6. **Payment confirmed** → Webhook received
7. **Webhook detects** `external_reference.startsWith('topup_')`
8. **Calls RPC** `credit_wallet`:
   - Updates transaction status to `topup_completed`
   - Increments `clients.wallet_balance` by amount
   - Links payment ID to transaction

**Back URLs:**
- Success: `/m/:slug/wallet?status=success&txn={{transaction_id}}`
- Failure: `/m/:slug/wallet?status=failure&txn={{transaction_id}}`
- Pending: `/m/:slug/wallet?status=pending&txn={{transaction_id}}`

---

### 3. Wallet Payment (Client Balance)

** Process:**

1. **Customer selects "Pay with Wallet"** at checkout
2. **System checks** `client.wallet_balance >= order. total_amount`
3. **If sufficient:**
   - Creates `wallet_transaction` with `type = 'payment'`
   - Decrements `client.wallet_balance`
   - Marks `order.is_paid = true`
   - Sets `order.payment_provider = 'wallet'`
4. **If insufficient:**
   - Shows error: "Saldo insuficiente"

**No MP integration** for wallet payments (local transaction only).

---

## Mercado Pago OAuth Connection

**File:** `hooks/useMercadoPagoConnect.ts`

**Flow:**

1. **Store owner** clicks "Connect Mercado Pago"
2. **Redirects to:**
   ```
   https://auth.mercadopago.com.ar/authorization
   ?client_id={{MP_APP_ID}}
   &response_type=code
   &platform_id=mp
   &state={{store_id}}
   &redirect_uri={{callback_url}}
   ```
3. **User authorizes** → MP redirects back with `code`
4. **Exchange code for token:**
   ```
   POST /oauth/token
   {
     grant_type: "authorization_code",
     client_id: "...",
     client_secret: "...",
     code: "...",
     redirect_uri: "..."
   }
   ```
5. **Save tokens** to `stores` table:
   - `mp_access_token`
   - `mp_refresh_token`
   - `mp_expires_at`
   - `mp_user_id`, `mp_email`, `mp_nickname`
6. **Set** `mp_connected = true`

**Token Refresh Logic (in `create-topup/index.ts`):**

```typescript
if (store.mp_expires_at < new Date()) {
  const refreshRes = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: MP_CLIENT_ID,
      client_secret: MP_CLIENT_SECRET,
      refresh_token: store.mp_refresh_token
    })
  });
  // Update tokens in DB
}
```

---

## Payment Status Mapping

**Mercado Pago → Payper:**

| MP Status | Order Payment Status | is_paid |
|-----------|---------------------|---------|
| `approved` | `approved` | `true` |
| `pending` | `pending` | `false` |
| `in_process` | `pending` | `false` |
| `rejected` | `rejected` | `false` |
| `cancelled` | `cancelled` | `false` |
| `refunded` | `refunded` | `true` (was paid) |

**Order Blocking:**

From `OrderBoard.tsx` (lines 108-115):
```typescript
if (provider === 'mercadopago' && !isPaid) {
  addToast("PAGO PENDIENTE", 'error', "Este pedido requiere pago de Mercado Pago");
  return; // Block status advancement
}
```

Orders with `payment_provider = 'mercadopago'` and `is_paid = false` **cannot advance** from "Pendiente".

---

## Database Tables

### `payment_webhooks`
**Purpose:** Audit log of all MP webhook calls

**Fields:**
- `id` (UUID, PK)
- `provider` (`'mercadopago'`)
- `provider_event_id` (MP payment ID)
- `topic` (e.g., `'payment'`)
- `action` (e.g., `'payment.updated'`)
- `payload` (JSONB, full webhook body)
- `headers` (JSONB)
- `store_id` (UUID)
- `processed` (boolean)
- `processed_at` (timestamp)
- `processing_result` (string)

**RLS:** UNKNOWN (not inspected)

### `wallet_transactions`
**Purpose:** Ledger of wallet movements

**Fields (inferred from `create-topup/index.ts`):**
- `id` (UUID, PK)
- `store_id` (UUID)
- `user_id` (UUID, FK to auth.users)
- `wallet_id` (UUID, FK to wallets, nullable)
- `amount` (numeric)
- `type` (`'topup_pending' | 'topup_completed' | 'payment' | 'refund'`)
- `description` (string)
- `mp_payment_id` (string, nullable)
- `created_at` (timestamp)

**RLS:** UNKNOWN

---

## Email System

**Files:**
- `mp-webhook/index.ts` — Generates HTML emails
- Edge function `send-email` (not inspected)

**Email Templates (inline in webhook):**
- `generatePaymentApprovedHtml()`
- `generatePaymentRejectedHtml()`
- `generatePaymentRefundedHtml()`

**Email LOGGING:**
- RPC: `create_email_log` — Creates log with idempotency
- RPC: `update_email_log_status` — Marks as sent/failed

**Email Provider:** 
- Resend (assumed from conversation summaries)
- Sends via edge function: `POST /functions/v1/send-email`

**Idempotency:**
- Prevents duplicate emails for same payment event
- Key format: `{{event_type}}_{{payment_id}}_{{order_id}}`

---

## Payment Methods Supported

1. **Mercado Pago** (`payment_provider = 'mercadopago'`)
   - Cards, debit, credit, QR
   - External redirect flow
   - Async confirmation via webhook

2. **Wallet** (`payment_provider = 'wallet'`)
   - Uses `clients.wallet_balance`
   - Instant confirmation
   - No external redirect

3. **Cash** (`payment_provider = 'cash'`)
   - Marked as paid on delivery
   - No pre-payment flow

---

## Key Observations

**✅ CONFIRMED:**
- Mercado Pago OAuth connection
- Webhook processing with audit logs
- Email notifications (approved, rejected, refunded)
- Wallet topup flow
- Payment status blocking in OrderBoard
- Token refresh logic

**❓ UNKNOWN:**
- Whether `wallet_transactions` table schema is complete
- Whether email sending actually works (Resend configuration)
- Refund initiation flow (admin UI not inspected)
- Test mode vs production mode handling

**⚠️ NOTES:**
- All payments logged to `payment_webhooks` for debugging
- Email failures DO NOT block payment processing
- MP token auto-refresh on expiration
- Orders with unpaid MP cannot be advanced (hardcoded business rule)
