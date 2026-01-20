import { AuditLogEntry, AuditCategory } from '../types';

export interface RawAuditLog {
    id: string;
    created_at: string;
    store_id: string;
    user_id: string;
    table_name: string;
    operation: 'INSERT' | 'UPDATE' | 'DELETE';
    old_data: any;
    new_data: any;
    // Joins
    profiles?: {
        full_name: string;
        role: string;
        email: string; // Helpful for backup identification
    };
}

export const formatAuditLog = (log: RawAuditLog): AuditLogEntry => {
    const userName = log.profiles?.full_name || log.profiles?.email || 'Sistema / Desconocido';
    // Map internal roles to human readable
    const rawRole = log.profiles?.role || 'system';
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
        category = 'staff'; // Or 'finance' if balance is touched
        entity = 'USUARIO';
    } else if (log.table_name === 'stores') {
        category = 'system';
        entity = 'CONFIGURACIÓN';
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

    // 4. INVENTORY
    else if (log.table_name === 'inventory_items') {
        if (log.operation === 'UPDATE') {
            const oldStock = Number(log.old_data?.current_stock || 0);
            const newStock = Number(log.new_data?.current_stock || 0);

            if (oldStock !== newStock) {
                const diff = newStock - oldStock;
                action = 'AJUSTE STOCK';
                detail = `${log.new_data.name}: ${diff > 0 ? '+' : ''}${diff} ${log.new_data.unit_type}`;
                if (diff < 0) impact = 'neutral'; // Consumption
            }
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
