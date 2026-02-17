import { supabase } from './supabase';
import { Order, OrderItem } from '../types';

export interface StockPrediction {
    productName: string;
    predictedHighDemandDay: string; // e.g., "Friday"
    averageDailySales: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface OrderAnalysis {
    peakHours: { hour: number; count: number; revenue: number }[];
    starProducts: { name: string; quantity: number; revenue: number }[];
    tablePerformance: { tableName: string; revenue: number; orderCount: number }[];
    stockPredictions: StockPrediction[];
    totalRevenue: number;
    totalOrders: number;
    averageTicket: number;
}

export async function generateInsights(store_id: string): Promise<OrderAnalysis> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Fetch Orders with Items for the last 30 days
    // Use canonical revenue filter (matches is_revenue_order() in DB)
    const NON_REVENUE_STATUSES = ['draft', 'pending', 'cancelled', 'refunded', 'rejected'];
    const { data: orders, error } = await supabase
        .from('orders')
        .select(`
    *,
    items: order_items(*)
        `)
        .eq('store_id', store_id)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .not('status', 'in', `(${NON_REVENUE_STATUSES.join(',')})`)
        .limit(2000);

    if (error) {
        console.error('Error fetching insights data:', error);
        throw error;
    }

    const safeOrders = (orders || []) as any[];

    // Initialize structures
    const hoursMap = new Map<number, { count: number; revenue: number }>();
    const productMap = new Map<string, { quantity: number; revenue: number }>();
    const tableMap = new Map<string, { count: number; revenue: number }>();

    // Stock Prediction Structures
    // Map<ProductName, Map<DayIndex, Quantity>>
    const productDayMap = new Map<string, Map<number, number>>();

    let totalRevenue = 0;
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    // 2. Process Data
    safeOrders.forEach(order => {
        const date = new Date(order.created_at);
        const dayIndex = date.getDay();
        const hour = date.getHours();

        // Peak Hours
        const currentHour = hoursMap.get(hour) || { count: 0, revenue: 0 };
        hoursMap.set(hour, {
            count: currentHour.count + 1,
            revenue: currentHour.revenue + (order.total_amount || 0)
        });

        // Totals
        totalRevenue += (order.total_amount || 0);

        // Table Performance
        if (order.table_id || order.table) {
            const tableName = order.table || order.table_id || 'Unknown';
            const currentTable = tableMap.get(tableName) || { count: 0, revenue: 0 };
            tableMap.set(tableName, {
                count: currentTable.count + 1,
                revenue: currentTable.revenue + (order.total_amount || 0)
            });
        }

        // Star Products & Prediction Data
        if (order.items && Array.isArray(order.items)) {
            order.items.forEach((item: any) => {
                const name = item.name;
                const qty = item.quantity || 1;
                const price = item.price || item.unit_price || 0;
                const revenue = qty * price;

                // Star Prod Update
                const currentProd = productMap.get(name) || { quantity: 0, revenue: 0 };
                productMap.set(name, {
                    quantity: currentProd.quantity + qty,
                    revenue: currentProd.revenue + revenue
                });

                // Prediction Update
                if (!productDayMap.has(name)) {
                    productDayMap.set(name, new Map<number, number>());
                }
                const dayMap = productDayMap.get(name)!;
                dayMap.set(dayIndex, (dayMap.get(dayIndex) || 0) + qty);
            });
        }
    });

    // 3. Format Output
    const peakHours = Array.from(hoursMap.entries())
        .map(([hour, data]) => ({ hour, ...data }))
        .sort((a, b) => b.count - a.count);

    const starProducts = Array.from(productMap.entries())
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10);

    const tablePerformance = Array.from(tableMap.entries())
        .map(([tableName, data]) => ({ tableName, orderCount: data.count, revenue: data.revenue }))
        .sort((a, b) => b.revenue - a.revenue);

    // Calculate Predictions
    const stockPredictions: StockPrediction[] = [];

    // Only predict for top 5 products to avoid noise
    const topProductNames = starProducts.slice(0, 5).map(p => p.name);

    topProductNames.forEach(prodName => {
        const dayMap = productDayMap.get(prodName);
        if (!dayMap) return;

        let maxDay = 0;
        let maxQty = 0;
        let totalQty = 0;

        dayMap.forEach((qty, dayIndex) => {
            totalQty += qty;
            if (qty > maxQty) {
                maxQty = qty;
                maxDay = dayIndex;
            }
        });

        // Simple heuristic: If maxDay has > 25% more sales than average, it's a high demand day
        const avgDaily = totalQty / 7; // Average over week
        const riskLevel = maxQty > avgDaily * 1.5 ? 'HIGH' : maxQty > avgDaily * 1.2 ? 'MEDIUM' : 'LOW';

        stockPredictions.push({
            productName: prodName,
            predictedHighDemandDay: days[maxDay],
            averageDailySales: avgDaily,
            riskLevel
        });
    });

    return {
        peakHours,
        starProducts,
        tablePerformance,
        stockPredictions,
        totalRevenue,
        totalOrders: safeOrders.length,
        averageTicket: safeOrders.length > 0 ? totalRevenue / safeOrders.length : 0
    };
}
