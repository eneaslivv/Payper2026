import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { setQRContext, QRContext } from '../lib/qrContext';
import { QrCode, AlertCircle, Loader2, Home } from 'lucide-react';

interface QRLinkData {
    id: string;
    store_id: string;
    target_node_id: string | null;
    code_hash: string;
    target_type: 'table' | 'bar' | 'zone' | null;
    is_active: boolean;
}

interface StoreData {
    id: string;
    slug: string;
    name: string;
}

interface VenueNodeData {
    id: string;
    type: string;
    label: string;
}

type ResolverState = 'loading' | 'error' | 'not_found' | 'inactive' | 'success';

const QRResolver: React.FC = () => {
    const { hash } = useParams<{ hash: string }>();
    const navigate = useNavigate();
    const [state, setState] = useState<ResolverState>('loading');
    const [errorMessage, setErrorMessage] = useState<string>('');

    useEffect(() => {
        if (!hash) {
            setState('not_found');
            return;
        }

        resolveQR(hash);
    }, [hash]);

    const resolveQR = async (qrHash: string) => {
        try {
            setState('loading');

            // 1. Query qr_codes by hash (NEW TABLE)
            const { data: qrCode, error: qrError } = await supabase
                .from('qr_codes' as any)
                .select('id, store_id, qr_type, table_id, bar_id, location_id, label, is_active')
                .eq('code_hash', qrHash)
                .maybeSingle();

            if (qrError) {
                console.error('QR fetch error:', qrError);
                setErrorMessage('Error al verificar el código QR');
                setState('error');
                return;
            }

            if (!qrCode) {
                // Fallback: try legacy qr_links table
                const { data: legacyQr } = await supabase
                    .from('qr_links' as any)
                    .select('id, store_id, target_node_id, code_hash, target_type, is_active')
                    .eq('code_hash', qrHash)
                    .maybeSingle();

                if (!legacyQr) {
                    setState('not_found');
                    return;
                }

                // Handle legacy QR (without session system)
                console.warn('[QRResolver] Using legacy qr_links - no session created');
                await handleLegacyQR(legacyQr as any, qrHash);
                return;
            }

            const qr = qrCode as any;

            // 2. Check if QR is active
            if (!qr.is_active) {
                setState('inactive');
                return;
            }

            // 3. Get store data (slug needed for redirect)
            const { data: store, error: storeError } = await supabase
                .from('stores')
                .select('id, slug, name')
                .eq('id', qr.store_id)
                .single();

            if (storeError || !store) {
                console.error('Store fetch error:', storeError);
                setErrorMessage('Tienda no encontrada');
                setState('error');
                return;
            }

            const storeData = store as StoreData;

            // 4. Call log_qr_scan RPC (creates session + audit log)
            const { data: scanResult, error: scanError } = await (supabase.rpc as any)('log_qr_scan', {
                p_qr_id: qr.id,
                p_source: 'camera',
                p_user_agent: navigator.userAgent,
                p_create_session: true
            });

            if (scanError) {
                console.error('Scan log error:', scanError);
                // Continue anyway - session creation is not blocking
            }

            const sessionId = scanResult?.session_id || null;
            const context = scanResult?.context || {};

            // 5. Determine channel based on qr_type
            let channel: QRContext['channel'] = 'qr';
            let nodeType: QRContext['node_type'] = null;

            if (qr.qr_type === 'table') {
                channel = 'table';
                nodeType = 'table';
            } else if (qr.qr_type === 'bar') {
                channel = 'qr';
                nodeType = 'bar';
            } else if (qr.qr_type === 'pickup') {
                channel = 'takeaway';
                nodeType = 'pickup_zone';
            }

            // 6. Save context to localStorage (includes session_id)
            const savedContext = setQRContext({
                store_id: storeData.id,
                store_slug: storeData.slug,
                qr_hash: qrHash,
                qr_id: qr.id,
                node_id: qr.table_id || qr.bar_id || null,
                node_label: qr.label,
                node_type: nodeType,
                channel: channel,
            });

            // Also save session_id separately for order creation
            if (sessionId) {
                localStorage.setItem('client_session_id', sessionId);
                console.log('[QRResolver] Session created:', sessionId);
            }

            // 7. Redirect to menu
            setState('success');
            navigate(`/m/${storeData.slug}`, { replace: true });

        } catch (e) {
            console.error('QR resolve error:', e);
            setErrorMessage('Error inesperado');
            setState('error');
        }
    };

    // Handle legacy qr_links (backward compatibility)
    const handleLegacyQR = async (link: QRLinkData, qrHash: string) => {
        const { data: store } = await supabase
            .from('stores')
            .select('id, slug, name')
            .eq('id', link.store_id)
            .single();

        if (!store) {
            setErrorMessage('Tienda no encontrada');
            setState('error');
            return;
        }

        let nodeData: VenueNodeData | null = null;
        if (link.target_node_id) {
            const { data: node } = await supabase
                .from('venue_nodes')
                .select('id, type, label')
                .eq('id', link.target_node_id)
                .single();
            if (node) nodeData = node as VenueNodeData;
        }

        let channel: QRContext['channel'] = 'qr';
        let nodeType: QRContext['node_type'] = null;
        if (nodeData?.type === 'table') {
            channel = 'table';
            nodeType = 'table';
        }

        setQRContext({
            store_id: (store as any).id,
            store_slug: (store as any).slug,
            qr_hash: qrHash,
            qr_id: link.id,
            node_id: link.target_node_id,
            node_label: nodeData?.label || null,
            node_type: nodeType,
            channel: channel,
        });

        setState('success');
        navigate(`/m/${(store as any).slug}`, { replace: true });
    };

    // Loading state
    if (state === 'loading') {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 text-center">
                <div className="w-20 h-20 rounded-full bg-[#36e27b]/10 border-4 border-[#36e27b]/30 flex items-center justify-center mb-6 animate-pulse">
                    <Loader2 size={40} className="text-[#36e27b] animate-spin" />
                </div>
                <h2 className="text-white text-xl font-bold mb-2">Cargando...</h2>
                <p className="text-zinc-500 text-sm">Verificando código QR</p>
            </div>
        );
    }

    // Not found state
    if (state === 'not_found') {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 text-center">
                <div className="w-20 h-20 rounded-full bg-rose-500/10 border-4 border-rose-500/30 flex items-center justify-center mb-6">
                    <QrCode size={40} className="text-rose-500" />
                </div>
                <h2 className="text-white text-xl font-bold mb-2">QR No Válido</h2>
                <p className="text-zinc-500 text-sm mb-6 max-w-[280px]">
                    El código QR que escaneaste no existe o ha sido eliminado.
                </p>
                <button
                    onClick={() => navigate('/')}
                    className="px-6 py-3 bg-zinc-900 text-white font-bold text-sm rounded-xl flex items-center gap-2 hover:bg-zinc-800 transition-all"
                >
                    <Home size={18} />
                    Ir al Inicio
                </button>
            </div>
        );
    }

    // Inactive QR state
    if (state === 'inactive') {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 text-center">
                <div className="w-20 h-20 rounded-full bg-amber-500/10 border-4 border-amber-500/30 flex items-center justify-center mb-6">
                    <AlertCircle size={40} className="text-amber-500" />
                </div>
                <h2 className="text-white text-xl font-bold mb-2">QR Desactivado</h2>
                <p className="text-zinc-500 text-sm mb-6 max-w-[280px]">
                    Este código QR ha sido desactivado temporalmente. Consultá con el personal.
                </p>
                <button
                    onClick={() => navigate('/')}
                    className="px-6 py-3 bg-zinc-900 text-white font-bold text-sm rounded-xl flex items-center gap-2 hover:bg-zinc-800 transition-all"
                >
                    <Home size={18} />
                    Ir al Inicio
                </button>
            </div>
        );
    }

    // Error state
    if (state === 'error') {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 text-center">
                <div className="w-20 h-20 rounded-full bg-rose-500/10 border-4 border-rose-500/30 flex items-center justify-center mb-6">
                    <AlertCircle size={40} className="text-rose-500" />
                </div>
                <h2 className="text-white text-xl font-bold mb-2">Error</h2>
                <p className="text-zinc-500 text-sm mb-6 max-w-[280px]">
                    {errorMessage || 'Ocurrió un error al procesar el código QR.'}
                </p>
                <button
                    onClick={() => hash && resolveQR(hash)}
                    className="px-6 py-3 bg-[#36e27b] text-black font-bold text-sm rounded-xl mb-3 hover:scale-105 transition-all"
                >
                    Reintentar
                </button>
                <button
                    onClick={() => navigate('/')}
                    className="px-6 py-3 bg-zinc-900 text-white font-bold text-sm rounded-xl flex items-center gap-2 hover:bg-zinc-800 transition-all"
                >
                    <Home size={18} />
                    Ir al Inicio
                </button>
            </div>
        );
    }

    // Success state (brief, redirecting)
    return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-[#36e27b]/10 border-4 border-[#36e27b]/30 flex items-center justify-center mb-6">
                <QrCode size={40} className="text-[#36e27b]" />
            </div>
            <h2 className="text-white text-xl font-bold mb-2">¡Listo!</h2>
            <p className="text-zinc-500 text-sm">Redirigiendo al menú...</p>
        </div>
    );
};

export default QRResolver;
