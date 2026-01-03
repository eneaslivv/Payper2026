import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface AIContextData {
    dailySales: number;
    ordersCount: number;
    avgTicket: number;
    activeTables: number;
    lowStockItems: string[]; // Names of items with low stock
    topSellingItem: string | null;
    lastUpdated: Date;
    isLoading: boolean;
}

export const useAIContext = () => {
    const { profile } = useAuth();
    const [context, setContext] = useState<AIContextData>({
        dailySales: 0,
        ordersCount: 0,
        avgTicket: 0,
        activeTables: 0,
        lowStockItems: [],
        topSellingItem: null,
        lastUpdated: new Date(),
        isLoading: true
    });

    const fetchContext = async () => {
        if (!profile?.store_id) return;

        try {
            // 1. Fetch Today's Orders (Paid/Completed)
            // Note: We need to filter by date. Timestamps are ISO.
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const { data: salesData } = await supabase
                .from('orders')
                .select('total_amount, status, created_at')
                .eq('store_id', profile.store_id)
                .gte('created_at', todayStart.toISOString())
                .in('status', ['paid', 'completed']);

            const totalRevenue = salesData?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;
            const count = salesData?.length || 0;
            const ticket = count > 0 ? totalRevenue / count : 0;

            // 2. Fetch Active Tables (Occupied Nodes)
            const { count: activeNodes } = await supabase
                .from('venue_nodes')
                .select('*', { count: 'exact', head: true })
                .eq('store_id', profile.store_id)
                .eq('status', 'occupied');

            // 3. Fetch Low Stock Items (Simple limit check)
            // This assumes we have an inventory_items table with quantity and min_quantity
            const { data: lowStock } = await supabase
                .from('inventory_items')
                .select('name, quantity, min_quantity')
                .eq('store_id', profile.store_id)
                .lt('quantity', 10) // Fallback threshold if min_quantity is null
                .limit(5);

            // Filter strictly if min_quantity exists, else use raw low count logic
            const criticalItems = lowStock?.map(i => i.name) || [];

            setContext({
                dailySales: totalRevenue,
                ordersCount: count,
                avgTicket: ticket,
                activeTables: activeNodes || 0,
                lowStockItems: criticalItems,
                topSellingItem: null, // Harder to calc on fly without tailored RPC
                lastUpdated: new Date(),
                isLoading: false
            });

        } catch (e) {
            console.error('Error fetching AI Context:', e);
            setContext(prev => ({ ...prev, isLoading: false }));
        }
    };

    useEffect(() => {
        fetchContext();

        // Optional: Realtime subscription could be added here
        // For now, fetch once on mount is enough for a chat session interact
        // or set an interval
        const interval = setInterval(fetchContext, 60000); // Update every minute
        return () => clearInterval(interval);
    }, [profile?.store_id]);

    return context;
};
