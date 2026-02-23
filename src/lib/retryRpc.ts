/**
 * RETRY RPC WRAPPER - Fix Riesgo #1
 *
 * Retries automáticos con exponential backoff para:
 * - LOCK_TIMEOUT (55P03) — hora pico, locks concurrentes
 * - Network errors (Failed to fetch) — caída de WiFi momentánea
 *
 * Uso:
 * ```typescript
 * const { data, error } = await retryRpc(() =>
 *   supabase.rpc('adjust_inventory', { ... })
 * );
 * ```
 */

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number; // ms
  maxDelay?: number; // ms
  onRetry?: (attempt: number, error: any) => void;
  rpcName?: string; // Nombre del RPC para telemetría
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 200,
  maxDelay: 2000,
  onRetry: () => {},
};

/**
 * Retry wrapper para RPCs de Supabase con lock handling + telemetría
 *
 * @param rpcCall - Función que ejecuta el RPC
 * @param options - Opciones de retry
 * @returns Result del RPC con data/error
 */
export async function retryRpc<T>(
  rpcCall: () => Promise<{ data: T | null; error: any }>,
  options: RetryOptions = {}
): Promise<{ data: T | null; error: any }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();

  for (let attempt = 0; attempt < opts.maxRetries; attempt++) {
    const { data, error } = await rpcCall();

    // ✅ Success
    if (!error) {
      const duration = Date.now() - startTime;

      // Telemetría: Log métricas de retry
      if (attempt > 0) {
        console.log(`[retryRpc] ✅ Success after ${attempt + 1} attempts (${duration}ms)`);

        // Enviar a analytics (ahora habilitado)
        logRetryMetrics({
          rpc_name: opts.rpcName || 'unknown',
          attempts: attempt + 1,
          final_status: 'success',
          duration_ms: duration,
          error_code: null
        });
      }
      return { data, error: null };
    }

    // 🔒 LOCK_TIMEOUT → retry con backoff
    const isLockTimeout =
      error.code === '55P03' || // PostgreSQL lock_not_available
      error.code === 'PGRST301' || // PostgREST timeout
      error.message?.toLowerCase().includes('lock_timeout') ||
      error.message?.toLowerCase().includes('lock not available') ||
      error.error === 'LOCK_TIMEOUT'; // Custom RPC error

    // 🌐 Network errors → retry con backoff (WiFi drops, DNS failures)
    const errorMsg = error.message?.toLowerCase() || '';
    const isNetworkError =
      errorMsg.includes('failed to fetch') ||
      errorMsg.includes('networkerror') ||
      errorMsg.includes('network request failed') ||
      errorMsg.includes('econnrefused') ||
      errorMsg.includes('enotfound') ||
      errorMsg.includes('timeout') ||
      errorMsg.includes('aborted') ||
      (error.name === 'TypeError' && errorMsg.includes('fetch'));

    const isRetryable = isLockTimeout || isNetworkError;

    if (isRetryable && attempt < opts.maxRetries - 1) {
      const delay = Math.min(
        opts.baseDelay * Math.pow(2, attempt),
        opts.maxDelay
      );

      const reason = isLockTimeout ? 'LOCK_TIMEOUT' : 'NETWORK_ERROR';
      console.warn(
        `[retryRpc] ${reason} detected, retry ${attempt + 1}/${opts.maxRetries} in ${delay}ms`
      );

      opts.onRetry(attempt + 1, error);

      await sleep(delay);
      continue; // Retry
    }

    // ❌ Otro error O max retries alcanzado → fail
    if (attempt === opts.maxRetries - 1) {
      const duration = Date.now() - startTime;
      const errorCode = error.code || error.error || 'UNKNOWN';

      console.error(
        `[retryRpc] ❌ Failed after ${opts.maxRetries} attempts (${duration}ms):`,
        errorCode
      );

      // Telemetría: Log failure metrics
      logRetryMetrics({
        rpc_name: opts.rpcName || 'unknown',
        attempts: opts.maxRetries,
        final_status: 'failed',
        duration_ms: duration,
        error_code: errorCode
      });
    }

    return { data: null, error };
  }

  // Should never reach here
  return {
    data: null,
    error: { message: 'Max retries exceeded', code: 'MAX_RETRIES' },
  };
}

/**
 * Función helper para logging de métricas
 * Ahora conectado a tabla retry_metrics en Supabase
 */
async function logRetryMetrics(metrics: {
  rpc_name: string;
  attempts: number;
  final_status: 'success' | 'failed';
  duration_ms: number;
  error_code: string | null;
}) {
  try {
    // Lazy import para evitar circular dependency
    const { supabase } = await import('../../lib/supabase');

    // Enviar a Supabase analytics table (non-blocking)
    supabase.rpc('log_retry_metric', {
      p_rpc_name: metrics.rpc_name,
      p_attempts: metrics.attempts,
      p_final_status: metrics.final_status,
      p_duration_ms: metrics.duration_ms,
      p_error_code: metrics.error_code
    }).then(({ error }) => {
      if (error) {
        // Silent fail - no queremos que telemetría rompa la app
        console.debug('[retryRpc] Failed to log metric:', error.message);
      }
    });
  } catch (err) {
    // Silent fail - telemetría es best-effort
    console.debug('[retryRpc] Telemetry error:', err);
  }
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry específico para stock operations (adjust, transfer, consume)
 * Muestra toast de "reintentando..." automáticamente
 */
export async function retryStockRpc<T>(
  rpcCall: () => Promise<{ data: T | null; error: any }>,
  addToast?: (message: string, type: 'info' | 'error') => void,
  rpcName?: string
): Promise<{ data: T | null; error: any }> {
  return retryRpc(rpcCall, {
    maxRetries: 3,
    baseDelay: 300,
    maxDelay: 2000,
    rpcName: rpcName || 'stock_operation',
    onRetry: (attempt, error) => {
      if (addToast) {
        const isNetwork = error?.message?.toLowerCase()?.includes('fetch') || error?.name === 'TypeError';
        addToast(
          isNetwork
            ? `Sin conexión, reintentando (${attempt}/3)...`
            : `Stock ocupado, reintentando (${attempt}/3)...`,
          'info'
        );
      }
    },
  });
}

/**
 * Retry específico para offline sync
 * Más tolerante (5 retries) porque offline puede tener más latencia
 */
export async function retryOfflineSync<T>(
  rpcCall: () => Promise<{ data: T | null; error: any }>
): Promise<{ data: T | null; error: any }> {
  return retryRpc(rpcCall, {
    maxRetries: 5,
    baseDelay: 500,
    maxDelay: 5000,
  });
}
