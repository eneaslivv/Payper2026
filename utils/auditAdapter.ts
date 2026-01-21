import { AuditLogEntry, AuditCategory } from '../types';

export interface RawAuditLog {
    id: string;
    created_at: string;
    store_id: string;
    user_id: string;
    user_name: string; // From VIEW
    user_role: string; // From VIEW
    table_name: string;
    operation: 'INSERT' | 'UPDATE' | 'DELETE' | string;
    old_data: any;
    new_data: any;
}

export const formatAuditLog = (log: RawAuditLog): AuditLogEntry => {
    const userName = log.user_name || 'Sistema';
    // Map internal roles to human readable
    const rawRole = log.user_role || 'system';
    const userRole = rawRole === 'store_owner' ? 'Dueño' :
        rawRole === 'super_admin' ? 'Super Admin' :
            rawRole === 'staff' ? 'Staff' : 'Sistema';

    let category: AuditCategory = 'system';
    let action: string = log.operation;
    let entity: string = log.table_name;
    let detail: string = 'Operación registrada';
    let impact: 'critical' | 'neutral' | 'positive' = 'neutral';

    // --- CATEGORY & ENTITY MAPPING ---
    if (log.table_name === 'products' || log.table_name === 'inventory_items' || log.table_name === 'product_recipes') {
        category = 'stock';
        entity = log.table_name === 'products' ? 'PRODUCTO' :
            log.table_name === 'inventory_items' ? 'INSUMO' : 'RECETA';
    } else if (log.table_name === 'orders') {
        category = 'orders';
        entity = 'PEDIDO';
    } else if (log.table_name === 'profiles') {
        category = 'staff';
        entity = 'USUARIO';
    } else if (log.table_name === 'stores') {
        category = 'system';
        entity = 'CONFIGURACIÓN';
    } else if (log.table_name === 'wallet_transactions') {
        category = 'finance';
        entity = 'BILLETERA';
        const amount = log.new_data?.amount || 0;
        const type = log.new_data?.type || 'payment';
        action = type === 'topup' ? 'CARGA SALDO' : 'PAGO';
        detail = `${action}: $${amount}`;
        impact = type === 'topup' ? 'positive' : 'neutral';
    } else if (log.table_name === 'loyalty_transactions') {
        category = 'finance';
        entity = 'FIDELIDAD';
        const points = log.new_data?.points || 0;
        const type = log.new_data?.type || 'earn';
        action = type === 'earn' ? 'PUNTOS GANADOS' : 'CANJE';
        detail = `${points} puntos`;
        impact = type === 'earn' ? 'positive' : 'neutral';
    }

    // --- DETAILED LOGIC ---

    // 1. PRODUCTS (Prices & Stock)
    if (log.table_name === 'products') {
        if (log.operation === 'UPDATE') {
            const oldPrice = parseFloat(log.old_data?.price || '0');
            const newPrice = parseFloat(log.new_data?.price || '0');

            if (oldPrice !== newPrice) {
                action = 'CAMBIO DE PRECIO';
                detail = `${log.new_data.name}: $${oldPrice} ➔ $${newPrice}`;
                category = 'finance'; // Price change is financial
                impact = 'critical'; // Security Alert
            } else {
                action = 'EDICIÓN';
                detail = `Actualización de datos de ${log.new_data.name}`;
            }
        } else if (log.operation === 'INSERT') {
            action = 'CREACIÓN';
            detail = `Nuevo producto: ${log.new_data?.name || 'Sin nombre'}`;
            impact = 'positive';
        } else if (log.operation === 'DELETE') {
            action = 'ELIMINACIÓN';
            detail = `Producto eliminado: ${log.old_data.name}`;
            impact = 'critical';
        }
    }

    // 2. PROFILES (Balance & Status)
    else if (log.table_name === 'profiles') {
        if (log.operation === 'UPDATE') {
            const oldBalance = parseFloat(log.old_data?.balance || '0');
            const newBalance = parseFloat(log.new_data?.balance || '0');

            if (oldBalance !== newBalance) {
                action = 'CARGA DE SALDO'; // Or consumption, logic depends on direction
                const diff = newBalance - oldBalance;
                category = 'finance';
                entity = 'BILLETERA';

                if (diff > 0) {
                    action = 'CARGA DE SALDO';
                    detail = `Carga a ${log.new_data.full_name}: +$${diff}`;
                    impact = 'positive'; // Revenue/Pre-payment
                } else {
                    action = 'AJUSTE / CONSUMO';
                    detail = `Descuento a ${log.new_data.full_name}: -$${Math.abs(diff)}`;
                    impact = 'neutral';
                }

                // Suspicious large load?
                if (diff > 50000) impact = 'critical';
            } else if (log.old_data.status !== log.new_data.status) {
                action = 'CAMBIO ESTADO';
                category = 'staff';
                detail = `${log.new_data.full_name} ahora está ${log.new_data.status}`;
            }
        }
    }

    // 3. ORDERS (Status & Creation)
    else if (log.table_name === 'orders') {
        if (log.operation === 'INSERT') {
            action = 'NUEVO PEDIDO';
            detail = `Pedido #${log.new_data.id.slice(0, 4)} por $${log.new_data.total}`;
            impact = 'positive';
        } else if (log.operation === 'UPDATE') {
            if (log.new_data.status === 'cancelled') {
                action = 'CANCELACIÓN';
                detail = `Pedido #${log.new_data.id.slice(0, 4)} cancelado`;
                impact = 'critical';
            } else {
                action = 'ACTUALIZACIÓN';
                detail = `Pedido #${log.new_data.id.slice(0, 4)}: ${log.old_data.status} ➔ ${log.new_data.status}`;
            }
        }
    }

    // 4. INVENTORY (including stock movements)
    else if (log.table_name === 'inventory_items') {
        const itemName = log.new_data?.name || 'Insumo';
        const quantity = log.new_data?.quantity || log.new_data?.quantity_delta || 0;
        const reason = log.new_data?.reason || '';

        // Handle specific operation types from VIEW
        switch (log.operation) {
            case 'WASTE':
                action = 'BAJA POR MERMA';
                detail = `${itemName}: ${quantity} - ${reason}`;
                impact = 'critical';
                break;
            case 'LOSS_EXPIRED':
                action = 'VENCIMIENTO';
                detail = `${itemName}: Producto vencido`;
                impact = 'critical';
                break;
            case 'TRANSFER':
                action = 'TRANSFERENCIA';
                detail = `${itemName}: ${reason}`;
                impact = 'neutral';
                break;
            case 'RESTOCK':
            case 'INSERT':
                action = 'INGRESO STOCK';
                detail = `${itemName}: +${Math.abs(quantity)}`;
                impact = 'positive';
                break;
            case 'CONSUMPTION':
            case 'DELETE':
                action = 'CONSUMO';
                detail = `${itemName}: ${quantity}`;
                impact = 'neutral';
                break;
            case 'ADJUSTMENT':
                action = 'AJUSTE MANUAL';
                detail = `${itemName}: ${quantity} - ${reason}`;
                impact = 'neutral';
                break;
            default:
                // Fallback for UPDATE or unknown
                action = log.operation || 'MOVIMIENTO';
                detail = `${itemName}: ${reason || 'Operación registrada'}`;
        }
    }

    return {
        id: log.id,
        userName,
        userRole,
        category,
        action: action.toUpperCase(),
        entity: entity.toUpperCase(),
        detail,
        timestamp: new Date(log.created_at).toLocaleString('es-AR', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        }),
        impact
    };
};
