/**
 * Email Templates - Payment Approved
 * Re-exports from unified template system for backwards compatibility
 */

export type { PaymentApprovedVars } from '../email-templates.ts';
import { generatePaymentApprovedHtml, getPaymentApprovedSubject, getPaymentApprovedText } from '../email-templates.ts';
import type { PaymentApprovedVars } from '../email-templates.ts';

export const paymentApprovedTemplate = (vars: PaymentApprovedVars): string => generatePaymentApprovedHtml(vars);
export const paymentApprovedSubject = (vars: PaymentApprovedVars): string => getPaymentApprovedSubject(vars);
export const paymentApprovedText = (vars: PaymentApprovedVars): string => getPaymentApprovedText(vars);
