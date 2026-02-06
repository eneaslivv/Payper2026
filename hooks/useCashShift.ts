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
    zone_name?: string;
    opener?: { full_name: string };
    dispatch_station_id?: string | null;
    dispatch_station_name?: string | null;
    live_order_count?: number;
    events_summary?: {
        total_sales?: number;
        total_cancellations?: number;
        total_withdrawals?: number;
        total_adjustments?: number;
        event_count?: number;
    };
    duration_hours?: number;
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

            // Fetch Active Sessions (RPC)
            const { data: sessionsData, error: sessionsError } = await supabase
                .rpc('get_active_cash_sessions' as any, { p_store_id: profile.store_id });

            if (sessionsError) {
                console.warn('Error fetching active cash sessions:', sessionsError);
                setActiveSessions([]);
            } else {
                const mappedSessions: CashSession[] = (sessionsData || []).map((s: any) => ({
                    id: s.id,
                    zone_id: s.zone_id,
                    opened_by: s.opened_by,
                    opened_at: s.opened_at,
                    status: 'open',
                    start_amount: Number(s.start_amount || 0),
                    zone_name: s.zone_name || undefined,
                    opener: { full_name: s.opened_by || 'Staff' },
                    dispatch_station_id: s.dispatch_station_id || null,
                    dispatch_station_name: s.dispatch_station_name || null,
                    live_order_count: s.live_order_count || 0,
                    events_summary: s.events_summary || {},
                    duration_hours: s.duration_hours || 0
                }));

                setActiveSessions(mappedSessions);
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
    const openSession = async (zoneId: string, startAmount: number, dispatchStationId?: string | null) => {
        if (!profile?.store_id || !profile?.id) throw new Error('No user context');

        const { data, error } = await supabase.rpc('open_cash_session' as any, {
            p_store_id: profile.store_id,
            p_zone_id: zoneId,
            p_opened_by: profile.id,
            p_start_amount: startAmount,
            p_dispatch_station_id: dispatchStationId || null
        });

        if (error || !data?.success) throw error || new Error('No se pudo abrir la caja');
        await refreshData();
    };

    // 3. Close Session (Robust)
    const closeSession = async (sessionId: string, realCash: number, expectedCash: number, notes?: string) => {
        if (!profile?.store_id || !profile?.id) throw new Error('No hay contexto de usuario para cerrar caja');
        if (!sessionId) throw new Error('ID de sesión inválido');

        // Force numeric types
        const safeReal = Number(realCash) || 0;
        void expectedCash;

        const { data, error } = await supabase.rpc('close_cash_session' as any, {
            p_session_id: sessionId,
            p_real_cash: safeReal,
            p_closed_by: profile.id,
            p_notes: notes || null
        });

        if (error || !data?.success) {
            console.error('Error cerrando sesión:', error || data);
            throw error || new Error('No se pudo cerrar la caja');
        }

        await refreshData();
        return data;
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
