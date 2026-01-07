/**
 * Email Templates - Payment Approved
 * Template key: payment_approved
 * Version: 1
 * Language: es
 */

export interface PaymentApprovedVars {
    store_name: string;
    store_logo_url?: string;
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

export const paymentApprovedTemplate = (vars: PaymentApprovedVars): string => {
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
      <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
        <span style="color: #333;">${item.name}</span>
        <span style="color: #888; font-size: 12px;"> x${item.qty}</span>
      </td>
      <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0; text-align: right; color: #333;">
        $${(item.price * item.qty).toLocaleString('es-AR')}
      </td>
    </tr>
  `).join('') || '';

    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pago Confirmado - ${vars.store_name}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px 40px; text-align: center;">
              ${vars.store_logo_url
            ? `<img src="${vars.store_logo_url}" alt="${vars.store_name}" style="max-height: 48px; margin-bottom: 16px;" />`
            : `<h1 style="margin: 0 0 8px 0; color: white; font-size: 24px; font-weight: 700;">${vars.store_name}</h1>`
        }
              <div style="display: inline-block; background: rgba(255,255,255,0.2); border-radius: 50px; padding: 8px 20px;">
                <span style="color: white; font-size: 14px; font-weight: 600;">✓ Pago Confirmado</span>
              </div>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 8px 0; color: #111; font-size: 22px; font-weight: 700;">
                ¡Gracias por tu compra${vars.customer_name ? `, ${vars.customer_name.split(' ')[0]}` : ''}!
              </h2>
              <p style="margin: 0 0 24px 0; color: #666; font-size: 15px; line-height: 1.5;">
                Tu pago ha sido procesado exitosamente. Aquí está el resumen de tu pedido.
              </p>
              
              <!-- Order Details Card -->
              <div style="background: #f9fafb; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 0 0 12px 0;">
                      <span style="color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Pedido</span>
                      <div style="color: #111; font-size: 18px; font-weight: 700;">#${vars.order_number}</div>
                    </td>
                    <td style="padding: 0 0 12px 0; text-align: right;">
                      <span style="color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Total</span>
                      <div style="color: #10b981; font-size: 24px; font-weight: 800;">${formattedAmount}</div>
                    </td>
                  </tr>
                  <tr>
                    <td colspan="2" style="padding: 12px 0 0 0; border-top: 1px solid #e5e7eb;">
                      <table role="presentation" style="width: 100%;">
                        <tr>
                          <td style="color: #666; font-size: 13px;">
                            <strong>Método:</strong> ${vars.payment_method}
                          </td>
                          <td style="color: #666; font-size: 13px; text-align: right;">
                            <strong>Fecha:</strong> ${formattedDate}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </div>
              
              ${vars.items && vars.items.length > 0 ? `
              <!-- Items List -->
              <div style="margin-bottom: 24px;">
                <h3 style="margin: 0 0 12px 0; color: #333; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                  Detalle del pedido
                </h3>
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  ${itemsHtml}
                </table>
              </div>
              ` : ''}
              
              <!-- Reference -->
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; text-align: center;">
                <span style="color: #166534; font-size: 12px;">
                  Referencia de pago: <strong>${vars.payment_id}</strong>
                </span>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background: #f9fafb; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px 0; color: #888; font-size: 13px;">
                Este es un comprobante automático de <strong>${vars.store_name}</strong>
              </p>
              <p style="margin: 0; color: #aaa; font-size: 11px;">
                Por favor, no responda a este email. Para consultas, contacte directamente al local.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

export const paymentApprovedSubject = (vars: PaymentApprovedVars): string => {
    return `✓ Pago Confirmado - Pedido #${vars.order_number} | ${vars.store_name}`;
};

export const paymentApprovedText = (vars: PaymentApprovedVars): string => {
    const formattedAmount = new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: vars.currency || 'ARS'
    }).format(vars.amount);

    return `
PAGO CONFIRMADO - ${vars.store_name}

¡Gracias por tu compra${vars.customer_name ? `, ${vars.customer_name}` : ''}!

Tu pago ha sido procesado exitosamente.

RESUMEN:
- Pedido: #${vars.order_number}
- Total: ${formattedAmount}
- Método: ${vars.payment_method}
- Referencia: ${vars.payment_id}

Este es un comprobante automático. Para consultas, contacte directamente al local.
  `.trim();
};
