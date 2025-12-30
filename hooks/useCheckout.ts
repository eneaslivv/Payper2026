import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { CheckoutItem, CheckoutResponse, CheckoutError, BackUrls } from '../types/payment';

interface ProcessPaymentOptions {
    storeId: string;
    items: CheckoutItem[];
    backUrls?: BackUrls;
    externalReference?: string; // Puede ser el order_id
}

interface UseCheckoutReturn {
    processPayment: (options: ProcessPaymentOptions) => Promise<CheckoutResponse | null>;
    isProcessing: boolean;
    error: CheckoutError | null;
    clearError: () => void;
}

export function useCheckout(): UseCheckoutReturn {
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<CheckoutError | null>(null);

    const processPayment = useCallback(async ({
        storeId,
        items,
        backUrls,
        externalReference,
    }: ProcessPaymentOptions): Promise<CheckoutResponse | null> => {
        // Validaciones básicas
        if (!storeId) {
            setError({ code: 'MISSING_STORE', message: 'No se pudo identificar la tienda' });
            return null;
        }

        if (!items || items.length === 0) {
            setError({ code: 'EMPTY_CART', message: 'El carrito está vacío' });
            return null;
        }

        setIsProcessing(true);
        setError(null);

        try {
            // Llamar a la Edge Function existente
            const { data, error: fnError } = await supabase.functions.invoke('create-checkout', {
                body: {
                    store_id: storeId,
                    order_id: externalReference, // NUEVO: para payment_intent tracking
                    items,
                    back_urls: backUrls,
                    external_reference: externalReference,
                },
            });

            if (fnError) {
                throw new Error(fnError.message || 'Error al procesar el pago');
            }

            // Manejar errores del servidor
            if (data?.error) {
                const errorCode = data.code || 'UNKNOWN_ERROR';
                const errorMessage = getErrorMessage(errorCode, data.error);

                setError({ code: errorCode, message: errorMessage });
                return null;
            }

            // Éxito - redirigir a Mercado Pago
            if (data?.checkout_url) {
                // Redirigir automáticamente
                window.location.href = data.checkout_url;
                return data as CheckoutResponse;
            }

            throw new Error('No se recibió URL de pago');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Error inesperado';
            setError({ code: 'UNEXPECTED_ERROR', message });
            return null;
        } finally {
            setIsProcessing(false);
        }
    }, []);

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    return {
        processPayment,
        isProcessing,
        error,
        clearError,
    };
}

// Mensajes de error amigables
function getErrorMessage(code: string, fallback: string): string {
    const messages: Record<string, string> = {
        'MP_NOT_CONFIGURED': 'Esta tienda aún no ha configurado sus métodos de pago. Contacta al restaurante.',
        'MP_TOKEN_EXPIRED': 'La conexión de pagos expiró. El restaurante debe reconectar su cuenta.',
        'INVALID_REQUEST': 'Datos de pago inválidos. Intenta de nuevo.',
        'STORE_NOT_FOUND': 'Tienda no encontrada.',
        'MISSING_STORE': 'No se pudo identificar la tienda.',
        'EMPTY_CART': 'El carrito está vacío.',
    };
    return messages[code] || fallback;
}
