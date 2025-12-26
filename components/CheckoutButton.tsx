import React from 'react';
import { useCheckout } from '../hooks/useCheckout';
import type { CheckoutItem, BackUrls } from '../types/payment';

interface CheckoutButtonProps {
    storeId: string;
    items: CheckoutItem[];
    orderId?: string; // Se usa como external_reference
    backUrls?: BackUrls;
    disabled?: boolean;
    className?: string;
    children?: React.ReactNode;
}

export function CheckoutButton({
    storeId,
    items,
    orderId,
    backUrls,
    disabled = false,
    className = '',
    children,
}: CheckoutButtonProps) {
    const { processPayment, isProcessing, error } = useCheckout();

    const handleClick = async () => {
        // Generar URLs de retorno por defecto
        const defaultBackUrls: BackUrls = {
            success: `${window.location.origin}/orden/${orderId}/confirmado`,
            failure: `${window.location.origin}/orden/${orderId}/error`,
            pending: `${window.location.origin}/orden/${orderId}/pendiente`,
        };

        await processPayment({
            storeId,
            items,
            backUrls: backUrls || defaultBackUrls,
            externalReference: orderId,
        });
    };

    const total = items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);

    return (
        <div className="checkout-button-container">
            <button
                onClick={handleClick}
                disabled={disabled || isProcessing || items.length === 0}
                className={`checkout-button ${className}`}
                style={{
                    padding: '16px 32px',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    backgroundColor: isProcessing ? '#ccc' : '#009ee3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: disabled || isProcessing ? 'not-allowed' : 'pointer',
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                }}
            >
                {isProcessing ? (
                    <>
                        <span className="spinner" style={{
                            width: '20px',
                            height: '20px',
                            border: '2px solid white',
                            borderTopColor: 'transparent',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                        }} />
                        Procesando...
                    </>
                ) : (
                    children || `Pagar $${total.toLocaleString('es-AR')}`
                )}
            </button>

            {error && (
                <div style={{
                    marginTop: '12px',
                    padding: '12px',
                    backgroundColor: '#fee2e2',
                    color: '#dc2626',
                    borderRadius: '8px',
                    fontSize: '14px',
                }}>
                    {error.message}
                </div>
            )}

            <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
}
