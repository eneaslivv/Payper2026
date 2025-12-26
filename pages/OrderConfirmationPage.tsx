import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { OrderStatusDisplay } from '../components/OrderStatusDisplay';

export function OrderConfirmationPage() {
    const { orderId = '' } = useParams<{ orderId: string }>();
    const navigate = useNavigate();

    const handlePaymentConfirmed = () => {
        // Aquí puedes hacer algo cuando el pago se confirma
        // Por ejemplo, mostrar confetti, reproducir un sonido, etc.
        console.log('¡Pago confirmado!');
    };

    return (
        <div style={{
            maxWidth: '500px',
            margin: '0 auto',
            padding: '40px 20px',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
        }}>
            <OrderStatusDisplay
                orderId={orderId}
                onPaymentConfirmed={handlePaymentConfirmed}
                showDetails={true}
            />

            <button
                onClick={() => navigate('/')}
                style={{
                    marginTop: '24px',
                    padding: '12px 24px',
                    backgroundColor: 'transparent',
                    color: '#6b7280',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                }}
            >
                ← Volver al menú
            </button>
        </div>
    );
}
