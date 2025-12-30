import React from 'react';

interface PaymentCapabilityBadgeProps {
    canProcessPayments: boolean;
    mpNickname?: string | null;
    showDetails?: boolean;
    className?: string;
}

export function PaymentCapabilityBadge({
    canProcessPayments,
    mpNickname,
    showDetails = false,
    className = '',
}: PaymentCapabilityBadgeProps) {
    if (canProcessPayments) {
        return (
            <div
                className={`payment-badge ${className}`}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    backgroundColor: '#d1fae5',
                    color: '#059669',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: '500',
                }}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22,4 12,14.01 9,11.01" />
                </svg>
                <span>Pagos habilitados</span>
                {showDetails && mpNickname && (
                    <span style={{ opacity: 0.7 }}>• {mpNickname}</span>
                )}
            </div>
        );
    }

    if (!canProcessPayments) return null;
}
