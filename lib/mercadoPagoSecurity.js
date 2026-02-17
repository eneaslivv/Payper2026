// Mercado Pago Security Utilities
import crypto from 'crypto';

/**
 * Validates Mercado Pago webhook signature
 * @param {string} payload - Raw request body as string
 * @param {string} signature - X-Signature header value
 * @param {string} secret - MP webhook secret (or access token as fallback)
 * @returns {boolean} - True if signature is valid
 */
export function validateMPSignature(payload, signature, secret) {
  if (!payload || !signature || !secret) {
    console.warn('[MP_SECURITY] Missing required parameters for signature validation');
    return false;
  }

  try {
    // Parse signature header - MP sends multiple signatures separated by comma
    // Format: "v1=hash,ts=timestamp" or just "hash"
    let signatureHash = signature;
    
    if (signature.includes('=')) {
      const parts = signature.split(',');
      for (const part of parts) {
        const [key, value] = part.trim().split('=');
        if (key === 'v1' || key === 'signature') {
          signatureHash = value;
          break;
        }
      }
    }

    // Remove any whitespace or prefix
    signatureHash = signatureHash.replace(/^(sha256=|v1=)/i, '').trim();

    // Compute expected signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');

    // Compare signatures using constant-time comparison
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signatureHash, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );

    if (!isValid) {
      console.warn('[MP_SECURITY] Signature validation failed');
      console.log('[MP_SECURITY] Expected:', expectedSignature.substring(0, 10) + '...');
      console.log('[MP_SECURITY] Received:', signatureHash.substring(0, 10) + '...');
    } else {
      console.log('[MP_SECURITY] Signature validation successful');
    }

    return isValid;

  } catch (error) {
    console.error('[MP_SECURITY] Error validating signature:', error.message);
    return false;
  }
}

/**
 * Validates Mercado Pago request source by IP range
 * Note: MP uses dynamic IPs, so this is optional additional security
 * @param {string} clientIP - Request IP address
 * @returns {boolean} - True if IP seems legitimate
 */
export function validateMPIPRange(clientIP) {
  if (!clientIP) return false;

  // MP doesn't provide fixed IP ranges, but we can check for obvious non-MP IPs
  const suspiciousRanges = [
    '127.0.0.1',    // localhost
    '10.',          // private range
    '172.16.',      // private range
    '172.17.',      // private range
    '172.18.',      // private range
    '172.19.',      // private range
    '172.20.',      // private range
    '172.21.',      // private range
    '172.22.',      // private range
    '172.23.',      // private range
    '172.24.',      // private range
    '172.25.',      // private range
    '172.26.',      // private range
    '172.27.',      // private range
    '172.28.',      // private range
    '172.29.',      // private range
    '172.30.',      // private range
    '172.31.',      // private range
    '192.168.'      // private range
  ];

  for (const range of suspiciousRanges) {
    if (clientIP.startsWith(range)) {
      console.warn(`[MP_SECURITY] Suspicious IP detected: ${clientIP}`);
      return false;
    }
  }

  return true;
}

/**
 * Validates webhook event structure
 * @param {Object} event - Parsed webhook payload
 * @returns {boolean} - True if event structure is valid
 */
export function validateMPWebhookStructure(event) {
  if (!event || typeof event !== 'object') {
    return false;
  }

  // Required fields according to MP docs
  const requiredFields = ['action', 'api_version', 'data', 'date_created', 'id', 'type', 'user_id'];
  
  for (const field of requiredFields) {
    if (!(field in event)) {
      console.warn(`[MP_SECURITY] Missing required field: ${field}`);
      return false;
    }
  }

  // Validate field types
  if (typeof event.action !== 'string' || 
      typeof event.api_version !== 'string' || 
      typeof event.data !== 'object' ||
      typeof event.type !== 'string') {
    console.warn('[MP_SECURITY] Invalid field types in webhook');
    return false;
  }

  // Validate known action types
  const validActions = [
    'payment.created',
    'payment.updated', 
    'application.deauthorized',
    'application.authorized'
  ];

  if (!validActions.includes(event.action)) {
    console.warn(`[MP_SECURITY] Unknown action type: ${event.action}`);
    // Don't reject - MP might add new actions
  }

  return true;
}

/**
 * Extracts and validates payment ID from webhook
 * @param {Object} event - Webhook event
 * @returns {string|null} - Payment ID if valid, null otherwise  
 */
export function extractPaymentId(event) {
  if (!event?.data?.id) {
    return null;
  }

  const paymentId = event.data.id.toString();
  
  // MP payment IDs are numeric strings
  if (!/^\d+$/.test(paymentId)) {
    console.warn(`[MP_SECURITY] Invalid payment ID format: ${paymentId}`);
    return null;
  }

  return paymentId;
}

/**
 * Security middleware for MP webhooks
 * @param {Object} req - Request object
 * @param {string} secret - MP webhook secret
 * @returns {Object} - Validation result
 */
export function validateMPWebhook(req, secret) {
  const result = {
    isValid: false,
    errors: [],
    warnings: [],
    paymentId: null
  };

  try {
    // 1. Validate signature
    const signature = req.headers['x-signature'] || req.headers['x-signature-v1'];
    if (!signature) {
      result.errors.push('Missing X-Signature header');
      return result;
    }

    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (!validateMPSignature(body, signature, secret)) {
      result.errors.push('Invalid signature');
      return result;
    }

    // 2. Validate webhook structure  
    const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!validateMPWebhookStructure(event)) {
      result.errors.push('Invalid webhook structure');
      return result;
    }

    // 3. Extract payment ID
    const paymentId = extractPaymentId(event);
    if (!paymentId) {
      result.errors.push('Invalid or missing payment ID');
      return result;
    }

    // 4. Optional: Validate IP (warning only)
    const clientIP = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.connection.remoteAddress;
    if (!validateMPIPRange(clientIP)) {
      result.warnings.push(`Suspicious source IP: ${clientIP}`);
    }

    result.isValid = true;
    result.paymentId = paymentId;
    result.event = event;

  } catch (error) {
    result.errors.push(`Validation error: ${error.message}`);
  }

  return result;
}

export default {
  validateMPSignature,
  validateMPIPRange,
  validateMPWebhookStructure,
  extractPaymentId,
  validateMPWebhook
};