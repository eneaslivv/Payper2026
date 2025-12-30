import { toast } from 'sonner';
import { supabase } from './supabase';

// Definimos la respuesta esperada de la RPC de Supabase
interface ScanResponse {
    type: 'order' | 'user' | 'unknown';
    status: 'success' | 'error' | 'info';
    message: string;
    data?: {
        id?: string;
        order_number?: number;
        username?: string;
    };
}

/**
 * Handler principal para el escáner QR del staff/KDS.
 * Conecta con la RPC `classify_and_validate_scan` de Supabase.
 * 
 * @param scannedValue - El string escaneado del QR (UUID)
 * @param onUserDetected - Callback opcional cuando se detecta un usuario
 */
export const handleScanLogic = async (
    scannedValue: string,
    onUserDetected?: (userId: string) => void
) => {
    if (!scannedValue) return;

    try {
        // Invocamos la RPC con tipos genéricos para la respuesta
        const { data, error } = await supabase
            .rpc('classify_and_validate_scan', { scanned_code: scannedValue });

        if (error) throw error;

        const response = data as ScanResponse;

        if (!response) {
            toast.error("Lectura vacía del servidor");
            return;
        }

        // Lógica de UI según respuesta
        switch (response.type) {
            case 'order':
                response.status === 'success'
                    ? toast.success(`📦 ${response.message}`)
                    : toast.error(response.message);
                break;

            case 'user':
                toast.info(`👤 ${response.message}`, {
                    description: "Redirigiendo a panel de carga de saldo...",
                    duration: 4000,
                });
                // Callback para navegación externa
                if (onUserDetected && response.data?.id) {
                    onUserDetected(response.data.id);
                }
                break;

            default:
                toast.error("❌ Código QR no reconocido en el sistema");
        }

    } catch (err) {
        console.error("[Scanner] Error crítico:", err);
        toast.error("Error de conexión con la base de datos");
    }
};

/**
 * Versión simplificada que solo marca un pedido como entregado.
 * Útil si no tienes la función RPC configurada.
 * 
 * @param pickupCode - El UUID del pickup_code
 */
export const markOrderAsDelivered = async (inputCode: string, staffId: string): Promise<boolean> => {
    try {
        console.log("[markOrderAsDelivered] Resolving order for code:", inputCode);

        // 1. Resolve Order ID
        let orderId = '';
        const { data: firstCheck, error: firstError } = await supabase
            .from('orders')
            .select('id')
            .or(`id.eq.${inputCode},pickup_code.eq.${inputCode}`)
            .maybeSingle();

        if (firstError || !firstCheck) {
            console.error("[markOrderAsDelivered] Resolution error:", firstError);
            toast.error('❌ Código QR inválido o no encontrado');
            return false;
        }

        orderId = firstCheck.id;

        // 2. Call RPC - store_id se valida internamente en la función
        const { data, error } = await supabase.rpc('confirm_order_delivery', {
            p_order_id: orderId,
            p_staff_id: staffId
        });

        if (error) {
            console.error("[markOrderAsDelivered] RPC DB error:", error);
            toast.error('❌ Error de comunicación con el servidor');
            return false;
        }

        const result = data as { success: boolean, message: string };

        if (!result.success) {
            console.warn("[markOrderAsDelivered] Business logic rejected:", result.message);
            toast.error(result.message);
            return false;
        }

        toast.success(`✅ ${result.message}`);
        return true;

    } catch (err) {
        console.error("[markOrderAsDelivered] Catch error:", err);
        toast.error("Error al procesar QR");
        return false;
    }
};

export default handleScanLogic;
