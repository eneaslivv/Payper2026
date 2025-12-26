import React, { useEffect } from 'react';
import { useOrderStatus } from '../hooks/useOrderStatus';
import type { OrderStatus } from '../types/payment';

interface OrderStatusDisplayProps {
    orderId: string;
    onPaymentConfirmed?: () => void;
    showDetails?: boolean;
    className?: string;
}

// Configuración visual para cada estado
const statusConfig: Record<OrderStatus, {
    label: string;
    emoji: string;
    color: string;
    bgColor: string;
    description: string;
}> = {
    draft: {
        label: 'Borrador',
        emoji: '📝',
        color: '#6b7280',
        bgColor: '#f3f4f6',
        description: 'Pedido en preparación',
    },
    pending: {
        label: 'Pendiente de Pago',
        emoji: '⏳',
        color: '#f59e0b',
        bgColor: '#fef3c7',
        description: 'Esperando confirmación del pago...',
    },
    paid: {
        label: '¡Pago Confirmado!',
        emoji: '✅',
        color: '#10b981',
        bgColor: '#d1fae5',
        description: 'Tu pago ha sido recibido',
    },
    preparing: {
        label: 'En Preparación',
        emoji: '👨‍🍳',
        color: '#8b5cf6',
        bgColor: '#ede9fe',
        description: 'El restaurante está preparando tu pedido',
    },
    ready: {
        label: '¡Listo!',
        emoji: '🔔',
        color: '#06b6d4',
        bgColor: '#cffafe',
        description: 'Tu pedido está listo para recoger',
    },
    served: {
        label: 'Entregado',
        emoji: '🍽️',
        color: '#059669',
        bgColor: '#d1fae5',
        description: 'Pedido entregado. ¡Buen provecho!',
    },
    cancelled: {
        label: 'Cancelado',
        emoji: '❌',
        color: '#ef4444',
        bgColor: '#fee2e2',
        description: 'El pedido fue cancelado',
    },
    refunded: {
        label: 'Reembolsado',
        emoji: '💸',
        color: '#6b7280',
        bgColor: '#f3f4f6',
        description: 'El pago fue reembolsado',
    },
};

export function OrderStatusDisplay({
    orderId,
    onPaymentConfirmed,
    showDetails = true,
    className = '',
}: OrderStatusDisplayProps) {
    const { order, status, isPaid, isLoading, error, refetch } = useOrderStatus({
        orderId,
        onStatusChange: (newStatus) => {
            if (newStatus === 'paid' && onPaymentConfirmed) {
                onPaymentConfirmed();
            }
        },
    });

    // Auto-refresh mientras está pendiente
    useEffect(() => {
        if (status === 'pending') {
            const interval = setInterval(() => {
                refetch();
            }, 10000); // Cada 10 segundos

            return () => clearInterval(interval);
        }
    }, [status, refetch]);

    if (isLoading) {
        return (
            <div className={`order-status-loading ${className}`} style={{
                padding: '24px',
                textAlign: 'center',
                backgroundColor: '#f9fafb',
                borderRadius: '12px',
            }}>
                <div style={{
                    width: '40px',
                    height: '40px',
                    border: '3px solid #e5e7eb',
                    borderTopColor: '#3b82f6',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto 12px',
                }} />
                <p style={{ color: '#6b7280' }}>Cargando estado del pedido...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`order-status-error ${className}`} style={{
                padding: '24px',
                backgroundColor: '#fee2e2',
                borderRadius: '12px',
                textAlign: 'center',
            }}>
                <span style={{ fontSize: '32px' }}>⚠️</span>
                <p style={{ color: '#dc2626', marginTop: '8px' }}>{error}</p>
                <button
                    onClick={refetch}
                    style={{
                        marginTop: '12px',
                        padding: '8px 16px',
                        backgroundColor: '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                    }}
                >
                    Reintentar
                </button>
            </div>
        );
    }

    if (!order || !status) {
        return (
            <div className={`order-status-not-found ${className}`} style={{
                padding: '24px',
                backgroundColor: '#f3f4f6',
                borderRadius: '12px',
                textAlign: 'center',
            }}>
                <span style={{ fontSize: '32px' }}>🔍</span>
                <p style={{ color: '#6b7280', marginTop: '8px' }}>Pedido no encontrado</p>
            </div>
        );
    }

    const config = statusConfig[status];

    return (
        <div
            className={`order-status-display ${className}`}
            style={{
                padding: '24px',
                backgroundColor: config.bgColor,
                borderRadius: '12px',
                border: `2px solid ${config.color}`,
            }}
        >
            {/* Estado principal */}
            <div style={{ textAlign: 'center', marginBottom: showDetails ? '20px' : 0 }}>
                <span style={{ fontSize: '48px', display: 'block', marginBottom: '8px' }}>
                    {config.emoji}
                </span>
                <h3 style={{
                    color: config.color,
                    fontSize: '24px',
                    fontWeight: 'bold',
                    margin: '0 0 8px 0',
                }}>
                    {config.label}
                </h3>
                <p style={{ color: '#6b7280', margin: 0 }}>
                    {config.description}
                </p>
            </div>

            {/* Detalles del pedido */}
            {showDetails && (
                <div style={{
                    borderTop: `1px solid ${config.color}33`,
                    paddingTop: '16px',
                    marginTop: '16px',
                }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '12px',
                        fontSize: '14px',
                    }}>
                        <div>
                            <span style={{ color: '#6b7280' }}>Pedido:</span>
                            <span style={{ fontWeight: 'bold', marginLeft: '8px' }}>
                                #{order.id.slice(0, 8)}
                            </span>
                        </div>
                        <div>
                            <span style={{ color: '#6b7280' }}>Total:</span>
                            <span style={{ fontWeight: 'bold', marginLeft: '8px' }}>
                                ${order.total_amount.toLocaleString('es-AR')}
                            </span>
                        </div>
                        {order.table_number && (
                            <div>
                                <span style={{ color: '#6b7280' }}>Mesa:</span>
                                <span style={{ fontWeight: 'bold', marginLeft: '8px' }}>
                                    {order.table_number}
                                </span>
                            </div>
                        )}
                        {order.paid_at && (
                            <div>
                                <span style={{ color: '#6b7280' }}>Pagado:</span>
                                <span style={{ fontWeight: 'bold', marginLeft: '8px' }}>
                                    {new Date(order.paid_at).toLocaleTimeString('es-AR', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Indicador de auto-refresh para estado pendiente */}
            {status === 'pending' && (
                <div style={{
                    marginTop: '16px',
                    textAlign: 'center',
                    fontSize: '12px',
                    color: '#9ca3af',
                }}>
                    <span style={{
                        display: 'inline-block',
                        width: '8px',
                        height: '8px',
                        backgroundColor: '#f59e0b',
                        borderRadius: '50%',
                        marginRight: '6px',
                        animation: 'pulse 2s infinite',
                    }} />
                    Actualizando automáticamente...
                </div>
            )}

            <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
        </div>
    );
}
