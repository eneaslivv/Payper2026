import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../hooks/useStore';
import { useProducts } from '../hooks/useProducts';
import { useCreateOrder } from '../hooks/useCreateOrder';
import { useCheckout } from '../hooks/useCheckout';
import { PaymentCapabilityBadge } from '../components/PaymentCapabilityBadge';
import { CheckoutButton } from '../components/CheckoutButton';
import type { Product, CheckoutItem } from '../types/payment';

interface CartItem {
    product: Product;
    quantity: number;
}

export function MenuPage() {
    const { storeSlug = '' } = useParams<{ storeSlug: string }>();
    const navigate = useNavigate();

    // Obtener datos de la tienda
    const { store, isLoading: storeLoading, error: storeError, canProcessPayments } = useStore({
        slug: storeSlug
    });

    // Obtener productos
    const { products, isLoading: productsLoading, error: productsError } = useProducts({
        storeId: store?.id || '',
        source: 'products', // o 'inventory_items'
    });

    // Estado del carrito
    const [cart, setCart] = useState<CartItem[]>([]);
    const [tableNumber, setTableNumber] = useState('');

    // Hooks de orden y checkout
    const { createOrder, isCreating } = useCreateOrder();
    const { processPayment, isProcessing } = useCheckout();

    // Calcular total
    const cartTotal = useMemo(() => {
        return cart.reduce((sum, item) => sum + (item.product.base_price * item.quantity), 0);
    }, [cart]);

    // Agregar al carrito
    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(item => item.product.id === product.id);
            if (existing) {
                return prev.map(item =>
                    item.product.id === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            return [...prev, { product, quantity: 1 }];
        });
    };

    // Quitar del carrito
    const removeFromCart = (productId: string) => {
        setCart(prev => prev.filter(item => item.product.id !== productId));
    };

    // Actualizar cantidad
    const updateQuantity = (productId: string, quantity: number) => {
        if (quantity <= 0) {
            removeFromCart(productId);
            return;
        }
        setCart(prev =>
            prev.map(item =>
                item.product.id === productId ? { ...item, quantity } : item
            )
        );
    };

    // Procesar checkout
    const handleCheckout = async () => {
        if (!store || cart.length === 0) return;

        // 1. Crear la orden primero
        const order = await createOrder({
            storeId: store.id,
            items: cart.map(item => ({
                productId: item.product.id,
                name: item.product.name,
                quantity: item.quantity,
                unitPrice: item.product.base_price,
            })),
            channel: tableNumber ? 'table' : 'qr',
            tableNumber: tableNumber || undefined,
        });

        if (!order) {
            alert('Error al crear la orden');
            return;
        }

        // 2. Procesar el pago
        const checkoutItems: CheckoutItem[] = cart.map(item => ({
            title: item.product.name,
            quantity: item.quantity,
            unit_price: item.product.base_price,
            description: item.product.description || undefined,
        }));

        await processPayment({
            storeId: store.id,
            items: checkoutItems,
            externalReference: order.id,
            backUrls: {
                success: `${window.location.origin}/orden/${order.id}/confirmado`,
                failure: `${window.location.origin}/orden/${order.id}/error`,
                pending: `${window.location.origin}/orden/${order.id}/pendiente`,
            },
        });
    };

    // Loading state
    if (storeLoading || productsLoading) {
        return (
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <div style={{
                    width: '40px',
                    height: '40px',
                    border: '3px solid #e5e7eb',
                    borderTopColor: '#3b82f6',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto',
                }} />
                <p style={{ marginTop: '16px', color: '#6b7280' }}>Cargando menú...</p>
            </div>
        );
    }

    // Error state
    if (storeError || productsError) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: '#dc2626' }}>
                <h2>Error</h2>
                <p>{storeError || productsError}</p>
            </div>
        );
    }

    // Store not found
    if (!store) {
        return (
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <h2>Restaurante no encontrado</h2>
                <p>El link que seguiste no es válido.</p>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
            {/* Header */}
            <header style={{ textAlign: 'center', marginBottom: '32px' }}>
                {store.logo_url && (
                    <img
                        src={store.logo_url}
                        alt={store.name}
                        style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover' }}
                    />
                )}
                <h1 style={{ margin: '16px 0 8px' }}>{store.name}</h1>
                <PaymentCapabilityBadge
                    canProcessPayments={canProcessPayments}
                    mpNickname={store.mp_nickname}
                />
            </header>

            {/* Mesa (opcional) */}
            <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                    Número de mesa (opcional)
                </label>
                <input
                    type="text"
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.target.value)}
                    placeholder="Ej: 5"
                    style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '16px',
                    }}
                />
            </div>

            {/* Productos */}
            <section>
                <h2 style={{ marginBottom: '16px' }}>Menú</h2>
                <div style={{ display: 'grid', gap: '16px' }}>
                    {(products as Product[]).map((product) => (
                        <div
                            key={product.id}
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '16px',
                                border: '1px solid #e5e7eb',
                                borderRadius: '12px',
                            }}
                        >
                            <div>
                                <h3 style={{ margin: '0 0 4px' }}>{product.name}</h3>
                                {product.description && (
                                    <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
                                        {product.description}
                                    </p>
                                )}
                                <p style={{ margin: '8px 0 0', fontWeight: 'bold', color: '#059669' }}>
                                    ${product.base_price.toLocaleString('es-AR')}
                                </p>
                            </div>
                            <button
                                onClick={() => addToCart(product)}
                                style={{
                                    padding: '8px 16px',
                                    backgroundColor: '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                }}
                            >
                                + Agregar
                            </button>
                        </div>
                    ))}
                </div>
            </section>

            {/* Carrito */}
            {cart.length > 0 && (
                <section style={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    backgroundColor: 'white',
                    borderTop: '1px solid #e5e7eb',
                    padding: '20px',
                    boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}>
                    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                        {/* Items del carrito */}
                        <div style={{ marginBottom: '16px', maxHeight: '200px', overflowY: 'auto' }}>
                            {cart.map((item) => (
                                <div
                                    key={item.product.id}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '8px 0',
                                        borderBottom: '1px solid #f3f4f6',
                                    }}
                                >
                                    <span>{item.product.name}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <button
                                            onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                                            style={{
                                                width: '28px',
                                                height: '28px',
                                                borderRadius: '50%',
                                                border: '1px solid #e5e7eb',
                                                backgroundColor: 'white',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            -
                                        </button>
                                        <span style={{ minWidth: '24px', textAlign: 'center' }}>
                                            {item.quantity}
                                        </span>
                                        <button
                                            onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                                            style={{
                                                width: '28px',
                                                height: '28px',
                                                borderRadius: '50%',
                                                border: '1px solid #e5e7eb',
                                                backgroundColor: 'white',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            +
                                        </button>
                                        <span style={{ minWidth: '80px', textAlign: 'right', fontWeight: '500' }}>
                                            ${(item.product.base_price * item.quantity).toLocaleString('es-AR')}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Total y botón de pago */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            paddingTop: '16px',
                            borderTop: '2px solid #e5e7eb',
                        }}>
                            <div>
                                <span style={{ color: '#6b7280' }}>Total:</span>
                                <span style={{ fontSize: '24px', fontWeight: 'bold', marginLeft: '8px' }}>
                                    ${cartTotal.toLocaleString('es-AR')}
                                </span>
                            </div>

                            {canProcessPayments ? (
                                <button
                                    onClick={handleCheckout}
                                    disabled={isCreating || isProcessing}
                                    style={{
                                        padding: '16px 32px',
                                        backgroundColor: '#009ee3',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '8px',
                                        fontSize: '16px',
                                        fontWeight: 'bold',
                                        cursor: isCreating || isProcessing ? 'not-allowed' : 'pointer',
                                        opacity: isCreating || isProcessing ? 0.7 : 1,
                                    }}
                                >
                                    {isCreating || isProcessing ? 'Procesando...' : 'Pagar con Mercado Pago'}
                                </button>
                            ) : (
                                <div style={{
                                    padding: '12px 24px',
                                    backgroundColor: '#fef3c7',
                                    color: '#d97706',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                }}>
                                    💵 Pago en efectivo únicamente
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            )}

            <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
}
