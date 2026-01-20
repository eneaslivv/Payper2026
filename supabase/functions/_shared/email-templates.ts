/**
 * Email Templates Collection
 * All transactional email templates in one file
 */

// ============================================
// PAYMENT REJECTED
// ============================================
interface PaymentRejectedVars {
  store_name: string;
  customer_name: string;
  order_number: number;
  amount: number;
  currency: string;
  rejection_reason?: string;
  retry_url?: string;
}

export function generatePaymentRejectedHtml(vars: PaymentRejectedVars): string {
  const formattedAmount = `$${vars.amount.toLocaleString('es-AR')}`;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0 0 8px 0; color: white; font-size: 24px; font-weight: 700;">${vars.store_name}</h1>
              <div style="display: inline-block; background: rgba(255,255,255,0.2); border-radius: 50px; padding: 8px 20px;">
                <span style="color: white; font-size: 14px; font-weight: 600;">✗ Pago No Procesado</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 8px 0; color: #111; font-size: 22px;">
                Hubo un problema con tu pago${vars.customer_name ? `, ${vars.customer_name.split(' ')[0]}` : ''}
              </h2>
              <p style="margin: 0 0 24px 0; color: #666; font-size: 15px; line-height: 1.5;">
                No pudimos procesar el pago para tu pedido #${vars.order_number}.
              </p>
              
              <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <p style="margin: 0; color: #991b1b; font-size: 14px;">
                  <strong>Razón:</strong> ${vars.rejection_reason || 'El pago fue rechazado por el procesador'}
                </p>
              </div>

              <div style="background: #f9fafb; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
                <table style="width: 100%;">
                  <tr>
                    <td><span style="color: #888; font-size: 11px; text-transform: uppercase;">Pedido</span><div style="color: #111; font-size: 18px; font-weight: 700;">#${vars.order_number}</div></td>
                    <td style="text-align: right;"><span style="color: #888; font-size: 11px; text-transform: uppercase;">Monto</span><div style="color: #ef4444; font-size: 24px; font-weight: 800;">${formattedAmount}</div></td>
                  </tr>
                </table>
              </div>

              ${vars.retry_url ? `
              <a href="${vars.retry_url}" style="display: block; background: #10b981; color: white; text-align: center; padding: 16px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                Intentar nuevamente
              </a>
              ` : ''}
            </td>
          </tr>
          <tr>
            <td style="background: #f9fafb; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #888; font-size: 13px;">Notificación automática de <strong>${vars.store_name}</strong></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export function getPaymentRejectedSubject(vars: PaymentRejectedVars): string {
  return `⚠️ Pago no procesado - Pedido #${vars.order_number} | ${vars.store_name}`;
}

// ============================================
// PAYMENT REFUNDED
// ============================================
interface PaymentRefundedVars {
  store_name: string;
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

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0 0 8px 0; color: white; font-size: 24px; font-weight: 700;">${vars.store_name}</h1>
              <div style="display: inline-block; background: rgba(255,255,255,0.2); border-radius: 50px; padding: 8px 20px;">
                <span style="color: white; font-size: 14px; font-weight: 600;">↩ Reembolso ${vars.is_partial ? 'Parcial' : 'Completo'}</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 8px 0; color: #111; font-size: 22px;">
                Hemos procesado tu reembolso${vars.customer_name ? `, ${vars.customer_name.split(' ')[0]}` : ''}
              </h2>
              <p style="margin: 0 0 24px 0; color: #666; font-size: 15px; line-height: 1.5;">
                ${vars.is_partial ? 'Se ha realizado un reembolso parcial' : 'Se ha realizado el reembolso completo'} de tu pedido #${vars.order_number}.
              </p>
              
              <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
                <table style="width: 100%;">
                  <tr>
                    <td><span style="color: #1e40af; font-size: 12px; text-transform: uppercase;">Monto Reembolsado</span><div style="color: #1d4ed8; font-size: 28px; font-weight: 800;">${formattedRefund}</div></td>
                    ${vars.is_partial ? `<td style="text-align: right;"><span style="color: #888; font-size: 12px;">Original: ${formattedOriginal}</span></td>` : ''}
                  </tr>
                </table>
              </div>

              <p style="color: #666; font-size: 13px; line-height: 1.5;">
                El reembolso puede demorar entre 5 y 10 días hábiles en reflejarse según tu banco.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background: #f9fafb; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #888; font-size: 13px;">Notificación de <strong>${vars.store_name}</strong></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export function getPaymentRefundedSubject(vars: PaymentRefundedVars): string {
  return `↩ Reembolso procesado - Pedido #${vars.order_number} | ${vars.store_name}`;
}

// ============================================
// USER INVITATION
// ============================================
interface InviteUserVars {
  store_name: string;
  inviter_name: string;
  invited_role: string;
  accept_url: string;
  expires_in_days: number;
}

export function generateInviteUserHtml(vars: InviteUserVars): string {
  const roleMap: Record<string, string> = {
    'admin': 'Administrador',
    'manager': 'Gerente',
    'staff': 'Staff',
    'cashier': 'Cajero',
    'kitchen': 'Cocina',
    'waiter': 'Mesero'
  };
  const roleName = roleMap[vars.invited_role] || vars.invited_role;

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0 0 8px 0; color: white; font-size: 24px; font-weight: 700;">${vars.store_name}</h1>
              <div style="display: inline-block; background: rgba(255,255,255,0.2); border-radius: 50px; padding: 8px 20px;">
                <span style="color: white; font-size: 14px; font-weight: 600;">📨 Invitación al Equipo</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 8px 0; color: #111; font-size: 22px;">
                ¡Te han invitado a unirte!
              </h2>
              <p style="margin: 0 0 24px 0; color: #666; font-size: 15px; line-height: 1.5;">
                <strong>${vars.inviter_name}</strong> te invitó a formar parte del equipo de <strong>${vars.store_name}</strong> como <strong>${roleName}</strong>.
              </p>
              
              <a href="${vars.accept_url}" style="display: block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-align: center; padding: 18px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 16px; margin-bottom: 24px;">
                Aceptar Invitación
              </a>

              <p style="color: #888; font-size: 12px; text-align: center;">
                Esta invitación expira en ${vars.expires_in_days} días.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background: #f9fafb; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #888; font-size: 12px;">Si no esperabas esta invitación, puedes ignorar este email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export function getInviteUserSubject(vars: InviteUserVars): string {
  return `📨 ${vars.inviter_name} te invitó a ${vars.store_name}`;
}

// ============================================
// ORDER CONFIRMATION
// ============================================
interface OrderConfirmationVars {
  store_name: string;
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
  const deliveryModeText: Record<string, string> = {
    'dine_in': 'Para consumir en el local',
    'takeaway': 'Para llevar',
    'delivery': 'Delivery'
  };

  const itemsHtml = vars.items.map(item => `
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
        <span style="color: #333;">${item.name}</span>
        <span style="color: #888; font-size: 12px;"> x${item.qty}</span>
      </td>
      <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0; text-align: right; color: #333;">
        $${(item.price * item.qty).toLocaleString('es-AR')}
      </td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0 0 8px 0; color: white; font-size: 24px; font-weight: 700;">${vars.store_name}</h1>
              <div style="display: inline-block; background: rgba(255,255,255,0.2); border-radius: 50px; padding: 8px 20px;">
                <span style="color: white; font-size: 14px; font-weight: 600;">🧾 Pedido Confirmado</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 8px 0; color: #111; font-size: 22px;">
                ¡Gracias por tu pedido${vars.customer_name ? `, ${vars.customer_name.split(' ')[0]}` : ''}!
              </h2>
              <p style="margin: 0 0 24px 0; color: #666; font-size: 15px; line-height: 1.5;">
                Tu pedido #${vars.order_number} está siendo preparado. ${deliveryModeText[vars.delivery_mode] || ''}.
              </p>

              ${vars.pickup_code ? `
              <div style="background: #fef3c7; border: 2px dashed #f59e0b; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
                <span style="color: #92400e; font-size: 12px; text-transform: uppercase;">Código de Retiro</span>
                <div style="color: #d97706; font-size: 32px; font-weight: 900; letter-spacing: 4px;">${vars.pickup_code}</div>
              </div>
              ` : ''}
              
              ${vars.table_number ? `
              <div style="background: #fef3c7; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 24px;">
                <span style="color: #92400e; font-size: 14px;">Mesa: <strong>${vars.table_number}</strong></span>
              </div>
              ` : ''}

              <div style="margin-bottom: 24px;">
                <h3 style="margin: 0 0 12px 0; color: #333; font-size: 14px; font-weight: 600; text-transform: uppercase;">Tu Pedido</h3>
                <table style="width: 100%; border-collapse: collapse;">${itemsHtml}</table>
              </div>

              <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
                <table style="width: 100%;"><tr>
                  <td style="color: #333; font-weight: 700;">Total</td>
                  <td style="text-align: right; color: #f59e0b; font-size: 24px; font-weight: 800;">${formattedTotal}</td>
                </tr></table>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background: #f9fafb; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #888; font-size: 13px;">Confirmación de <strong>${vars.store_name}</strong></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export function getOrderConfirmationSubject(vars: OrderConfirmationVars): string {
  return `🧾 Pedido #${vars.order_number} confirmado | ${vars.store_name}`;
}

// ============================================
// WELCOME CLIENT (New Registration)
// ============================================
interface WelcomeClientVars {
  store_name: string;
  customer_name: string;
  login_url: string;
}

export function generateWelcomeClientHtml(vars: WelcomeClientVars): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Banner Image (Placeholder for Store/Payper Branding) -->
          <tr>
             <td style="background: linear-gradient(135deg, #000000 0%, #1a1a1a 100%); padding: 40px; text-align: center;">
                 <h1 style="color: white; font-size: 28px; margin: 0; font-weight: 800; letter-spacing: -0.5px;">Payper</h1>
                 <p style="color: #888; margin: 5px 0 0 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;">The Future of Payments</p>
             </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px 0; color: #111; font-size: 24px; font-weight: 700;">
                ¡Bienvenido a ${vars.store_name}, ${vars.customer_name.split(' ')[0]}!
              </h2>
              <p style="margin: 0 0 24px 0; color: #666; font-size: 16px; line-height: 1.6;">
                Gracias por registrarte. Ahora podrás realizar pedidos, acumular puntos y disfrutar de la mejor experiencia en nuestro local.
              </p>
              
              <a href="${vars.login_url}" style="display: block; background: #000000; color: white; text-align: center; padding: 18px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px; margin-bottom: 32px;">
                Ir a la Carta Digital
              </a>

              <div style="border-top: 1px solid #f0f0f0; padding-top: 24px;">
                <p style="margin: 0; color: #888; font-size: 14px;"><strong>¿Sabías que?</strong> Acumulas puntos con cada compra que puedes canjear por productos gratis.</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background: #f9fafb; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #888; font-size: 12px;">Enviado por <strong>Payper</strong> para ${vars.store_name}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export function getWelcomeClientSubject(vars: WelcomeClientVars): string {
  return `👋 ¡Bienvenido a ${vars.store_name}!`;
}

// ============================================
// WELCOME OWNER (New Account)
// ============================================
interface WelcomeOwnerVars {
  owner_name: string;
  dashboard_url: string;
}

export function generateWelcomeOwnerHtml(vars: WelcomeOwnerVars): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Payper Branding -->
          <tr>
             <td style="background: #000000; padding: 40px; text-align: center;">
                 <h1 style="color: white; font-size: 32px; margin: 0; font-weight: 800;">Payper</h1>
                 <p style="color: #666; margin: 8px 0 0 0; font-size: 13px; text-transform: uppercase;">Business Suite</p>
             </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px 0; color: #111; font-size: 24px; font-weight: 700;">
                ¡Bienvenido a bordo, ${vars.owner_name.split(' ')[0]}!
              </h2>
              <p style="margin: 0 0 24px 0; color: #666; font-size: 16px; line-height: 1.6;">
                Has dado el primer paso para transformar la gestión de tu negocio. Tu cuenta de Payper está lista.
              </p>
              
              <div style="background: #f9fafb; border-left: 4px solid #000; padding: 20px; margin-bottom: 24px;">
                <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #111;">Primeros pasos recomendados:</h3>
                <ul style="margin: 0; padding-left: 20px; color: #666; font-size: 14px;">
                  <li style="margin-bottom: 8px;">Configura tu menú y productos.</li>
                  <li style="margin-bottom: 8px;">Personaliza la apariencia de tu local.</li>
                  <li>Invita a tu staff.</li>
                </ul>
              </div>

              <a href="${vars.dashboard_url}" style="display: block; background: #000000; color: white; text-align: center; padding: 18px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px; margin-bottom: 32px;">
                Ir al Panel de Control
              </a>
            </td>
          </tr>
          <tr>
            <td style="background: #f9fafb; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #888; font-size: 12px;">© 2026 Payper Inc.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export function getWelcomeOwnerSubject(vars: WelcomeOwnerVars): string {
  return `🚀 Bienvenido a Payper - Tu cuenta está lista`;
}
