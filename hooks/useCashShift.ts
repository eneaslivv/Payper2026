import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface Zone {
    id: string;
    name: string;
    type: 'bar' | 'salon' | 'takeaway' | 'pickup';
    is_active: boolean;
}

export interface CashSession {
    id: string;
    zone_id: string;
    opened_by: string;
    opened_at: string;
    status: 'open' | 'closed';
    start_amount: number;
    zone?: Zone;
    opener?: { full_name: string };
    pending_orders_count?: number;
}

export const useCashShift = () => {
    const { profile } = useAuth();
    const [zones, setZones] = useState<Zone[]>([]);
    const [activeSessions, setActiveSessions] = useState<CashSession[]>([]);
    const [loading, setLoading] = useState(true);

    // 1. Load Zones & Active Sessions
    const refreshData = async () => {
        if (!profile?.store_id) return;
        setLoading(true);
        try {
            // Fetch Zones from venue_zones (Real Table)
            // Note: venue_zones might not have 'type' or 'is_active', so we default them if missing or use description
            const { data: zonesData } = await supabase
                .from('venue_zones' as any)
                .select('*')
                .eq('store_id', profile.store_id);

            // Map venue_zones to Zone interface
            const mappedZones: Zone[] = (zonesData || []).map((z: any) => ({
                id: z.id,
                name: z.name,
                type: 'bar', // Default since venue_zones doesn't have type yet
                is_active: true // venue_zones exists, so it's active
            }));

            setZones(mappedZones);

            // Fetch Active Sessions
            const { data: sessionsData } = await supabase
                .from('cash_sessions')
                .select(`
          *,
          zone:venue_zones(name),
          opener:profiles!opened_by(full_name)
        `)
                .eq('store_id', profile.store_id)
                .eq('status', 'open');

            // Fetch Pending Orders Counts per Active Zone
            if (sessionsData && sessionsData.length > 0) {
                const zoneIds = sessionsData.map(s => s.zone_id);
                const { data: ordersData, error: ordersError } = await supabase
                    .from('orders')
                    .select('zone_id', { count: 'exact' })
                    .in('status', ['pending', 'preparing', 'ready'])
                    .in('zone_id', zoneIds);

                // Group counts by zone_id manualy since Supabase count is aggregate
                // Actually, to get count per zone we need rpc or distinct queries. 
                // For simplicity, we'll fetch all active orders for these zones and count in JS (assuming reasonable volume for "Active" orders)
                const { data: activeOrders } = await supabase
                    .from('orders')
                    .select('zone_id')
                    .in('status', ['pending', 'preparing', 'ready'])
                    .in('zone_id', zoneIds);

                const counts: Record<string, number> = {};
                activeOrders?.forEach(o => {
                    if (o.zone_id) counts[o.zone_id] = (counts[o.zone_id] || 0) + 1;
                });

                const sessionsWithCounts = sessionsData.map(s => ({
                    ...s,
                    pending_orders_count: counts[s.zone_id] || 0
                }));
                setActiveSessions(sessionsWithCounts);
            } else {
                setActiveSessions(sessionsData || []);
            }

        } catch (error) {
            console.error('Error fetching cash shift data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refreshData();
    }, [profile?.store_id]);

    // 2. Open Session
    const openSession = async (zoneId: string, startAmount: number) => {
        if (!profile?.store_id || !profile?.id) throw new Error('No user context');

        const { error } = await supabase.from('cash_sessions').insert({
            store_id: profile.store_id,
            zone_id: zoneId,
            opened_by: profile.id,
            start_amount: startAmount,
            status: 'open'
        });

        if (error) throw error;
        await refreshData();
    };

    // 3. Close Session
    const closeSession = async (sessionId: string, realCash: number, expectedCash: number, notes?: string) => {
        if (!profile?.store_id || !profile?.id) throw new Error('No user context');

        // Transact: Update Session -> Create Closure
        const { error: sessionError } = await supabase
            .from('cash_sessions')
            .update({
                status: 'closed',
                closed_at: new Date().toISOString(),
                closed_by: profile.id
            })
            .eq('id', sessionId);

        if (sessionError) throw sessionError;

        const { error: closureError } = await supabase
            .from('cash_closures')
            .insert({
                store_id: profile.store_id,
                session_id: sessionId,
                expected_cash: expectedCash,
                real_cash: realCash,
                notes: notes
            });

        if (closureError) throw closureError;

        await refreshData();
    };

    return {
        zones,
        activeSessions,
        loading,
        refreshData,
        openSession,
        closeSession
    };
};
