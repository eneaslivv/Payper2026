/**
 * Email Templates Collection — Unified Design System
 * All transactional email templates with consistent branding
 */

const PAYPER_LOGO_URL = 'https://yjxjyxhksedwfeueduwl.supabase.co/storage/v1/object/public/logos/payper/payper-logo.png';

// ============================================
// BASE LAYOUT — Shared wrapper for all emails
// ============================================
interface BaseLayoutOpts {
  storeName: string;
  storeLogoUrl?: string | null;
  accentColor?: string;
  body: string;
}

function baseEmailLayout(opts: BaseLayoutOpts): string {
  const accent = opts.accentColor || '#4ADE80';
  const storeHeader = opts.storeLogoUrl
    ? `<img src="${opts.storeLogoUrl}" alt="${opts.storeName}" style="max-height: 52px; border-radius: 8px; margin-bottom: 12px; display: block; margin-left: auto; margin-right: auto;" />`
    : '';

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color:#111111;">
  <table role="presentation" style="width:100%; border-collapse:collapse;">
    <tr>
      <td style="padding:32px 16px;">
        <table role="presentation" style="max-width:560px; margin:0 auto; background-color:#1a1a1a; border-radius:16px; overflow:hidden; border:1px solid #2a2a2a;">

          <!-- HEADER: Store branding -->
          <tr>
            <td style="padding:32px 40px 24px 40px; text-align:center; border-bottom:1px solid #2a2a2a;">
              ${storeHeader}
              <h1 style="margin:0; color:#ffffff; font-size:22px; font-weight:800; letter-spacing:-0.3px;">${opts.storeName}</h1>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:32px 40px;">
              ${opts.body}
            </td>
          </tr>

          <!-- FOOTER: Payper branding -->
          <tr>
            <td style="padding:24px 40px; text-align:center; border-top:1px solid #2a2a2a;">
              <img src="${PAYPER_LOGO_URL}" alt="Payper" style="max-height:22px; margin-bottom:8px; opacity:0.7;" />
              <p style="margin:0; color:#52525b; font-size:11px;">Powered by Payper</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

// Helper: accent badge
function badge(text: string, color: string): string {
  return `<div style="display:inline-block; background:${color}20; border:1px solid ${color}40; border-radius:50px; padding:6px 16px; margin-bottom:20px;">
    <span style="color:${color}; font-size:13px; font-weight:700;">${text}</span>
  </div>`;
}

// Helper: CTA button
function ctaButton(text: string, url: string, color: string): string {
  return `<a href="${url}" style="display:block; background:${color}; color:#000000; text-align:center; padding:14px 28px; border-radius:8px; text-decoration:none; font-weight:700; font-size:15px; margin:24px 0;">${text}</a>`;
}

// Helper: info card
function infoCard(content: string): string {
  return `<div style="background:#111111; border:1px solid #2a2a2a; border-radius:10px; padding:20px; margin:16px 0;">${content}</div>`;
}

// ============================================
// PAYMENT REJECTED
// ============================================
export interface PaymentRejectedVars {
  store_name: string;
  store_logo_url?: string | null;
  customer_name: string;
  order_number: number;
  amount: number;
  currency: string;
  rejection_reason?: string;
  retry_url?: string;
}

export function generatePaymentRejectedHtml(vars: PaymentRejectedVars): string {
  const formattedAmount = `$${vars.amount.toLocaleString('es-AR')}`;
  const accent = '#ef4444';

  const body = `
    ${badge('✗ Pago No Procesado', accent)}
    <h2 style="margin:0 0 8px 0; color:#fff; font-size:20px; font-weight:700;">
      Hubo un problema con tu pago${vars.customer_name ? `, ${vars.customer_name.split(' ')[0]}` : ''}
    </h2>
    <p style="margin:0 0 20px 0; color:#a1a1aa; font-size:14px; line-height:1.6;">
      No pudimos procesar el pago para tu pedido #${vars.order_number}.
    </p>

    <div style="background:${accent}15; border:1px solid ${accent}30; border-radius:10px; padding:16px; margin-bottom:20px;">
      <p style="margin:0; color:${accent}; font-size:13px;">
        <strong>Razón:</strong> ${vars.rejection_reason || 'El pago fue rechazado por el procesador'}
      </p>
    </div>

    ${infoCard(`
      <table style="width:100%;">
        <tr>
          <td><span style="color:#71717a; font-size:11px; text-transform:uppercase;">Pedido</span><div style="color:#fff; font-size:18px; font-weight:700;">#${vars.order_number}</div></td>
          <td style="text-align:right;"><span style="color:#71717a; font-size:11px; text-transform:uppercase;">Monto</span><div style="color:${accent}; font-size:22px; font-weight:800;">${formattedAmount}</div></td>
        </tr>
      </table>
    `)}

    ${vars.retry_url ? ctaButton('Intentar nuevamente', vars.retry_url, '#4ADE80') : ''}
  `;

  return baseEmailLayout({ storeName: vars.store_name, storeLogoUrl: vars.store_logo_url, accentColor: accent, body });
}

export function getPaymentRejectedSubject(vars: PaymentRejectedVars): string {
  return `Pago no procesado - Pedido #${vars.order_number} | ${vars.store_name}`;
}

// ============================================
// PAYMENT REFUNDED
// ============================================
export interface PaymentRefundedVars {
  store_name: string;
  store_logo_url?: string | null;
  customer_name: string;
  order_number: number;
  refund_amount: number;
  original_amount: number;
  currency: string;
  is_partial: boolean;
  refund_reason?: string;
}

export function generatePaymentRefundedHtml(vars: PaymentRefundedVars): string {
  const formattedRefund = `$${vars.refund_amount.toLocaleString('es-AR')}`;
  const formattedOriginal = `$${vars.original_amount.toLocaleString('es-AR')}`;
  const accent = '#3b82f6';

  const body = `
    ${badge(`↩ Reembolso ${vars.is_partial ? 'Parcial' : 'Completo'}`, accent)}
    <h2 style="margin:0 0 8px 0; color:#fff; font-size:20px; font-weight:700;">
      Hemos procesado tu reembolso${vars.customer_name ? `, ${vars.customer_name.split(' ')[0]}` : ''}
    </h2>
    <p style="margin:0 0 20px 0; color:#a1a1aa; font-size:14px; line-height:1.6;">
      ${vars.is_partial ? 'Se ha realizado un reembolso parcial' : 'Se ha realizado el reembolso completo'} de tu pedido #${vars.order_number}.
    </p>

    ${infoCard(`
      <table style="width:100%;">
        <tr>
          <td><span style="color:#71717a; font-size:11px; text-transform:uppercase;">Monto Reembolsado</span><div style="color:${accent}; font-size:24px; font-weight:800;">${formattedRefund}</div></td>
          ${vars.is_partial ? `<td style="text-align:right;"><span style="color:#71717a; font-size:11px;">Original: ${formattedOriginal}</span></td>` : ''}
        </tr>
      </table>
    `)}

    <p style="color:#71717a; font-size:12px; line-height:1.5;">
      El reembolso puede demorar entre 5 y 10 días hábiles en reflejarse según tu banco.
    </p>
  `;

  return baseEmailLayout({ storeName: vars.store_name, storeLogoUrl: vars.store_logo_url, accentColor: accent, body });
}

export function getPaymentRefundedSubject(vars: PaymentRefundedVars): string {
  return `Reembolso procesado - Pedido #${vars.order_number} | ${vars.store_name}`;
}

// ============================================
// USER / MEMBER INVITATION
// ============================================
export interface InviteUserVars {
  store_name: string;
  store_logo_url?: string | null;
  inviter_name?: string;
  member_name?: string;
  invited_role: string;
  accept_url: string;
  expires_in_days: number;
}

const ROLE_MAP: Record<string, string> = {
  'admin': 'Administrador', 'manager': 'Gerente', 'staff': 'Staff',
  'cashier': 'Cajero', 'kitchen': 'Cocina', 'waiter': 'Mesero', 'owner': 'Propietario'
};

export function generateInviteUserHtml(vars: InviteUserVars): string {
  const roleName = ROLE_MAP[vars.invited_role] || vars.invited_role;
  const accent = '#8b5cf6';
  const greeting = vars.member_name ? `Hola <b style="color:#fff;">${vars.member_name}</b>,` : '¡Te han invitado!';

  const body = `
    ${badge('Invitación al Equipo', accent)}
    <p style="margin:0 0 8px 0; color:#a1a1aa; font-size:15px; line-height:1.6;">${greeting}</p>
    <p style="margin:0 0 20px 0; color:#a1a1aa; font-size:14px; line-height:1.6;">
      ${vars.inviter_name ? `<b style="color:#fff;">${vars.inviter_name}</b> te invitó a` : 'Has sido invitado a'} formar parte del equipo de <b style="color:#fff;">${vars.store_name}</b> como <b style="color:${accent};">${roleName}</b>.
    </p>

    ${infoCard(`
      <p style="margin:0; color:#4ADE80; font-size:12px; text-transform:uppercase; font-weight:bold;">Tu acceso está listo</p>
    `)}

    ${ctaButton('ACEPTAR INVITACIÓN', vars.accept_url, '#4ADE80')}

    <p style="color:#52525b; font-size:11px; text-align:center;">
      Enlace válido por ${vars.expires_in_days} días. Si no esperabas esta invitación, puedes ignorar este correo.
    </p>
  `;

  return baseEmailLayout({ storeName: vars.store_name, storeLogoUrl: vars.store_logo_url, accentColor: accent, body });
}

export function getInviteUserSubject(vars: InviteUserVars): string {
  return `Invitación al Equipo - ${vars.store_name}`;
}

// ============================================
// OWNER INVITATION
// ============================================
export interface InviteOwnerVars {
  store_name: string;
  store_logo_url?: string | null;
  owner_name?: string;
  accept_url: string;
}

export function generateInviteOwnerHtml(vars: InviteOwnerVars): string {
  const accent = '#4ADE80';

  const body = `
    ${badge('Activación de Cuenta', accent)}
    <h2 style="margin:0 0 8px 0; color:#fff; font-size:20px; font-weight:700;">
      ¡Bienvenido a bordo${vars.owner_name ? `, ${vars.owner_name.split(' ')[0]}` : ''}!
    </h2>
    <p style="margin:0 0 20px 0; color:#a1a1aa; font-size:14px; line-height:1.6;">
      Tu cuenta de propietario para <b style="color:#fff;">${vars.store_name}</b> está lista. Activa tu cuenta para comenzar a gestionar tu negocio.
    </p>

    ${infoCard(`
      <h3 style="margin:0 0 8px 0; font-size:14px; color:#fff;">Primeros pasos:</h3>
      <ul style="margin:0; padding-left:20px; color:#a1a1aa; font-size:13px;">
        <li style="margin-bottom:6px;">Configura tu menú y productos</li>
        <li style="margin-bottom:6px;">Personaliza la apariencia de tu local</li>
        <li>Invita a tu equipo</li>
      </ul>
    `)}

    ${ctaButton('ACTIVAR CUENTA', vars.accept_url, accent)}

    <p style="color:#52525b; font-size:11px; text-align:center;">
      Enlace válido por 24 horas. Si no esperabas esta invitación, puedes ignorar este correo.
    </p>
  `;

  return baseEmailLayout({ storeName: vars.store_name, storeLogoUrl: vars.store_logo_url, accentColor: accent, body });
}

export function getInviteOwnerSubject(vars: InviteOwnerVars): string {
  return `Activa tu cuenta - ${vars.store_name} | Payper`;
}

// ============================================
// ORDER CONFIRMATION
// ============================================
export interface OrderConfirmationVars {
  store_name: string;
  store_logo_url?: string | null;
  customer_name: string;
  order_number: number;
  items: Array<{ name: string; qty: number; price: number }>;
  subtotal: number;
  total: number;
  delivery_mode: 'dine_in' | 'takeaway' | 'delivery';
  table_number?: string;
  pickup_code?: string;
  estimated_time?: string;
}

export function generateOrderConfirmationHtml(vars: OrderConfirmationVars): string {
  const formattedTotal = `$${vars.total.toLocaleString('es-AR')}`;
  const accent = '#f59e0b';
  const deliveryModeText: Record<string, string> = {
    'dine_in': 'Para consumir en el local',
    'takeaway': 'Para llevar',
    'delivery': 'Delivery'
  };

  const itemsHtml = vars.items.map(item => `
    <tr>
      <td style="padding:8px 0; border-bottom:1px solid #2a2a2a;">
        <span style="color:#e4e4e7;">${item.name}</span>
        <span style="color:#71717a; font-size:12px;"> x${item.qty}</span>
      </td>
      <td style="padding:8px 0; border-bottom:1px solid #2a2a2a; text-align:right; color:#e4e4e7;">
        $${(item.price * item.qty).toLocaleString('es-AR')}
      </td>
    </tr>
  `).join('');

  const body = `
    ${badge('Pedido Confirmado', accent)}
    <h2 style="margin:0 0 8px 0; color:#fff; font-size:20px; font-weight:700;">
      ¡Gracias por tu pedido${vars.customer_name ? `, ${vars.customer_name.split(' ')[0]}` : ''}!
    </h2>
    <p style="margin:0 0 20px 0; color:#a1a1aa; font-size:14px; line-height:1.6;">
      Tu pedido #${vars.order_number} está siendo preparado. ${deliveryModeText[vars.delivery_mode] || ''}.
    </p>

    ${vars.pickup_code ? `
    <div style="background:${accent}15; border:2px dashed ${accent}50; border-radius:10px; padding:20px; text-align:center; margin-bottom:16px;">
      <span style="color:${accent}; font-size:11px; text-transform:uppercase; font-weight:700;">Código de Retiro</span>
      <div style="color:${accent}; font-size:32px; font-weight:900; letter-spacing:4px;">${vars.pickup_code}</div>
    </div>` : ''}

    ${vars.table_number ? `
    <div style="background:${accent}15; border-radius:10px; padding:14px; text-align:center; margin-bottom:16px;">
      <span style="color:${accent}; font-size:14px;">Mesa: <strong>${vars.table_number}</strong></span>
    </div>` : ''}

    ${infoCard(`
      <h3 style="margin:0 0 10px 0; color:#71717a; font-size:12px; font-weight:600; text-transform:uppercase;">Tu Pedido</h3>
      <table style="width:100%; border-collapse:collapse;">${itemsHtml}</table>
      <table style="width:100%; margin-top:12px;"><tr>
        <td style="color:#fff; font-weight:700;">Total</td>
        <td style="text-align:right; color:${accent}; font-size:22px; font-weight:800;">${formattedTotal}</td>
      </tr></table>
    `)}
  `;

  return baseEmailLayout({ storeName: vars.store_name, storeLogoUrl: vars.store_logo_url, accentColor: accent, body });
}

export function getOrderConfirmationSubject(vars: OrderConfirmationVars): string {
  return `Pedido #${vars.order_number} confirmado | ${vars.store_name}`;
}

// ============================================
// PAYMENT APPROVED
// ============================================
export interface PaymentApprovedVars {
  store_name: string;
  store_logo_url?: string | null;
  customer_name: string;
  order_number: number;
  order_id: string;
  payment_id: string;
  amount: number;
  currency: string;
  payment_method: string;
  date_approved: string;
  items?: Array<{ name: string; qty: number; price: number }>;
}

export function generatePaymentApprovedHtml(vars: PaymentApprovedVars): string {
  const accent = '#4ADE80';
  const formattedAmount = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: vars.currency || 'ARS'
  }).format(vars.amount);

  const formattedDate = new Date(vars.date_approved).toLocaleString('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  const itemsHtml = vars.items?.map(item => `
    <tr>
      <td style="padding:8px 0; border-bottom:1px solid #2a2a2a;">
        <span style="color:#e4e4e7;">${item.name}</span>
        <span style="color:#71717a; font-size:12px;"> x${item.qty}</span>
      </td>
      <td style="padding:8px 0; border-bottom:1px solid #2a2a2a; text-align:right; color:#e4e4e7;">
        $${(item.price * item.qty).toLocaleString('es-AR')}
      </td>
    </tr>
  `).join('') || '';

  const body = `
    ${badge('✓ Pago Confirmado', accent)}
    <h2 style="margin:0 0 8px 0; color:#fff; font-size:20px; font-weight:700;">
      ¡Gracias por tu compra${vars.customer_name ? `, ${vars.customer_name.split(' ')[0]}` : ''}!
    </h2>
    <p style="margin:0 0 20px 0; color:#a1a1aa; font-size:14px; line-height:1.6;">
      Tu pago ha sido procesado exitosamente.
    </p>

    ${infoCard(`
      <table role="presentation" style="width:100%; border-collapse:collapse;">
        <tr>
          <td>
            <span style="color:#71717a; font-size:11px; text-transform:uppercase;">Pedido</span>
            <div style="color:#fff; font-size:18px; font-weight:700;">#${vars.order_number}</div>
          </td>
          <td style="text-align:right;">
            <span style="color:#71717a; font-size:11px; text-transform:uppercase;">Total</span>
            <div style="color:${accent}; font-size:22px; font-weight:800;">${formattedAmount}</div>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="padding:12px 0 0 0; border-top:1px solid #2a2a2a;">
            <table style="width:100%;">
              <tr>
                <td style="color:#71717a; font-size:12px;"><strong style="color:#a1a1aa;">Método:</strong> ${vars.payment_method}</td>
                <td style="color:#71717a; font-size:12px; text-align:right;"><strong style="color:#a1a1aa;">Fecha:</strong> ${formattedDate}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `)}

    ${vars.items && vars.items.length > 0 ? `
    ${infoCard(`
      <h3 style="margin:0 0 10px 0; color:#71717a; font-size:12px; font-weight:600; text-transform:uppercase;">Detalle del pedido</h3>
      <table style="width:100%; border-collapse:collapse;">${itemsHtml}</table>
    `)}` : ''}

    <div style="background:${accent}15; border:1px solid ${accent}30; border-radius:8px; padding:12px; text-align:center;">
      <span style="color:${accent}; font-size:11px;">Referencia: <strong>${vars.payment_id}</strong></span>
    </div>
  `;

  return baseEmailLayout({ storeName: vars.store_name, storeLogoUrl: vars.store_logo_url, accentColor: accent, body });
}

export function getPaymentApprovedSubject(vars: PaymentApprovedVars): string {
  return `Pago Confirmado - Pedido #${vars.order_number} | ${vars.store_name}`;
}

export function getPaymentApprovedText(vars: PaymentApprovedVars): string {
  const formattedAmount = new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: vars.currency || 'ARS'
  }).format(vars.amount);

  return `PAGO CONFIRMADO - ${vars.store_name}\n\n¡Gracias por tu compra${vars.customer_name ? `, ${vars.customer_name}` : ''}!\n\nPedido: #${vars.order_number}\nTotal: ${formattedAmount}\nMétodo: ${vars.payment_method}\nReferencia: ${vars.payment_id}`.trim();
}

// ============================================
// WELCOME CLIENT (New Registration)
// ============================================
export interface WelcomeClientVars {
  store_name: string;
  store_logo_url?: string | null;
  customer_name: string;
  login_url: string;
}

export function generateWelcomeClientHtml(vars: WelcomeClientVars): string {
  const accent = '#4ADE80';

  const body = `
    ${badge('Bienvenido', accent)}
    <h2 style="margin:0 0 8px 0; color:#fff; font-size:20px; font-weight:700;">
      ¡Hola ${vars.customer_name.split(' ')[0]}!
    </h2>
    <p style="margin:0 0 20px 0; color:#a1a1aa; font-size:14px; line-height:1.6;">
      Gracias por registrarte en <b style="color:#fff;">${vars.store_name}</b>. Ahora podrás realizar pedidos, acumular puntos y disfrutar de la mejor experiencia.
    </p>

    ${ctaButton('IR A LA CARTA DIGITAL', vars.login_url, accent)}

    ${infoCard(`
      <p style="margin:0; color:#a1a1aa; font-size:13px;">
        <strong style="color:#fff;">¿Sabías que?</strong> Acumulas puntos con cada compra que puedes canjear por productos gratis.
      </p>
    `)}
  `;

  return baseEmailLayout({ storeName: vars.store_name, storeLogoUrl: vars.store_logo_url, accentColor: accent, body });
}

export function getWelcomeClientSubject(vars: WelcomeClientVars): string {
  return `¡Bienvenido a ${vars.store_name}!`;
}

// ============================================
// WELCOME OWNER (New Account)
// ============================================
export interface WelcomeOwnerVars {
  store_name?: string;
  store_logo_url?: string | null;
  owner_name: string;
  dashboard_url: string;
}

export function generateWelcomeOwnerHtml(vars: WelcomeOwnerVars): string {
  const accent = '#4ADE80';
  const storeName = vars.store_name || 'Payper';

  const body = `
    ${badge('Tu cuenta está lista', accent)}
    <h2 style="margin:0 0 8px 0; color:#fff; font-size:20px; font-weight:700;">
      ¡Bienvenido a bordo, ${vars.owner_name.split(' ')[0]}!
    </h2>
    <p style="margin:0 0 20px 0; color:#a1a1aa; font-size:14px; line-height:1.6;">
      Has dado el primer paso para transformar la gestión de tu negocio. Tu cuenta de Payper está lista.
    </p>

    ${infoCard(`
      <h3 style="margin:0 0 8px 0; font-size:14px; color:#fff;">Primeros pasos recomendados:</h3>
      <ul style="margin:0; padding-left:20px; color:#a1a1aa; font-size:13px;">
        <li style="margin-bottom:6px;">Configura tu menú y productos</li>
        <li style="margin-bottom:6px;">Personaliza la apariencia de tu local</li>
        <li>Invita a tu staff</li>
      </ul>
    `)}

    ${ctaButton('IR AL PANEL DE CONTROL', vars.dashboard_url, accent)}
  `;

  return baseEmailLayout({ storeName, storeLogoUrl: vars.store_logo_url, accentColor: accent, body });
}

export function getWelcomeOwnerSubject(vars: WelcomeOwnerVars): string {
  return `Bienvenido a Payper - Tu cuenta está lista`;
}

// ============================================
// PAYMENT CONFIRMATION (for email queue / process-email-queue)
// ============================================
export interface PaymentQueueVars {
  store_name: string;
  store_logo_url?: string | null;
  customer_name: string;
  order_number: number;
  total_amount: number;
}

export function generatePaymentQueueHtml(vars: PaymentQueueVars): string {
  const accent = '#4ADE80';
  const formattedTotal = `$${Number(vars.total_amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

  const body = `
    ${badge('✓ Pedido Confirmado', accent)}
    <h2 style="margin:0 0 8px 0; color:#fff; font-size:20px; font-weight:700;">
      Hola${vars.customer_name ? ` ${vars.customer_name}` : ''},
    </h2>
    <p style="margin:0 0 20px 0; color:#a1a1aa; font-size:14px; line-height:1.6;">
      Tu pedido <b style="color:${accent};">#${vars.order_number}</b> ha sido confirmado.
    </p>

    ${infoCard(`
      <p style="margin:0; text-align:center;">
        <span style="color:#71717a; font-size:11px; text-transform:uppercase; display:block; margin-bottom:4px;">Total</span>
        <span style="color:${accent}; font-size:26px; font-weight:800;">${formattedTotal}</span>
      </p>
    `)}

    <p style="color:#52525b; font-size:12px; text-align:center; margin-top:16px;">Gracias por tu compra.</p>
  `;

  return baseEmailLayout({ storeName: vars.store_name, storeLogoUrl: vars.store_logo_url, accentColor: accent, body });
}
