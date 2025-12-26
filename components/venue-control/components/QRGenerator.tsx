import React, { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../components/ToastSystem';
import { Loader2, Copy, Check, X, Download } from 'lucide-react';

interface QRGeneratorProps {
    nodeId: string;
    storeId: string;
    nodeName: string;
    onClose: () => void;
}

const QRGenerator: React.FC<QRGeneratorProps> = ({ nodeId, storeId, nodeName, onClose }) => {
    const { addToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [qrHash, setQrHash] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        fetchOrCreateQR();
    }, [nodeId]);

    const fetchOrCreateQR = async () => {
        try {
            setLoading(true);

            // 1. Check if exists
            const { data: existing, error: fetchError } = await supabase
                .from('qr_links' as any)
                .select('hash')
                .eq('store_id', storeId)
                .eq('target_node_id', nodeId) // Changed from node_id to target_node_id based on prompt schema
                .single();

            if (existing) {
                setQrHash(existing.hash);
            } else {
                // 2. Generate and Insert
                // Unique hash: store + node + timestamp + random
                const rawString = `${storeId}-${nodeId}-${Date.now()}`;
                const newHash = btoa(rawString).replace(/[^a-zA-Z0-9]/g, '').substring(0, 12);

                const { error: insertError } = await supabase
                    .from('qr_links' as any)
                    .insert({
                        store_id: storeId,
                        target_node_id: nodeId, // Changed to match schema
                        hash: newHash,
                        target_type: 'table',
                        is_active: true
                    });

                if (insertError) throw insertError;
                setQrHash(newHash);
            }
        } catch (e: any) {
            console.error('QR Error:', e);
            addToast('Error QR', 'error', 'No se pudo generar el código QR');
        } finally {
            setLoading(false);
        }
    };

    const qrUrl = qrHash ? `https://coffeesquad.app/menu?t=${qrHash}` : '';

    const handleCopy = () => {
        if (!qrUrl) return;
        navigator.clipboard.writeText(qrUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        addToast('Enlace Copiado', 'success', 'URL del menú al portapapeles');
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300 p-4">
            <div className="relative bg-[#0a0a0a] rounded-[32px] p-8 w-full max-w-[360px] shadow-[0_20px_60px_rgba(0,0,0,0.9)] flex flex-col items-center gap-6 border border-white/5 ring-1 ring-white/5 overflow-hidden">

                {/* Glow Effect */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-[#36e27b]/20 blur-[60px] rounded-full pointer-events-none"></div>

                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2.5 text-zinc-500 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all active:scale-95 z-20"
                >
                    <X size={18} strokeWidth={2.5} />
                </button>

                <div className="text-center space-y-1.5 z-10">
                    <h2 className="text-xl font-black text-white uppercase tracking-tight">QR Mesa {nodeName}</h2>
                    <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Escanea para ver menú</p>
                </div>

                <div className="p-4 bg-white rounded-2xl shadow-[0_0_40px_rgba(54,226,123,0.15)] z-10 transition-transform hover:scale-105 duration-500">
                    {loading ? (
                        <div className="w-[180px] h-[180px] flex items-center justify-center">
                            <Loader2 className="animate-spin text-zinc-900" size={32} />
                        </div>
                    ) : qrHash ? (
                        <div className="w-[180px] h-[180px]">
                            <QRCode
                                value={qrUrl}
                                size={180}
                                viewBox={`0 0 256 256`}
                                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                            />
                        </div>
                    ) : (
                        <div className="w-[180px] h-[180px] flex items-center justify-center text-red-500 font-bold text-[10px] uppercase text-center px-4 leading-tight">
                            Error al generar código<br />Intenta nuevamente
                        </div>
                    )}
                </div>

                {qrHash && (
                    <div className="w-full space-y-3 z-10">
                        <div
                            onClick={handleCopy}
                            className="w-full px-4 py-3.5 bg-zinc-900/50 border border-zinc-800 rounded-xl flex items-center justify-between cursor-pointer hover:bg-zinc-900 hover:border-zinc-700 transition-all group"
                        >
                            <span className="text-[10px] text-zinc-500 font-mono font-medium truncate max-w-[200px] bg-transparent outline-none select-all">{qrUrl}</span>
                            {copied ? <Check size={14} className="text-[#36e27b]" strokeWidth={3} /> : <Copy size={14} className="text-zinc-600 group-hover:text-white transition-colors" />}
                        </div>

                        <button
                            className="w-full py-4 bg-[#36e27b] hover:bg-[#2fd16d] text-black font-black uppercase tracking-widest text-[11px] rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-[0_10px_20px_rgba(54,226,123,0.2)] hover:shadow-[0_10px_30px_rgba(54,226,123,0.3)]"
                            onClick={() => onClose()}
                        >
                            <Check size={16} strokeWidth={3} /> Listo
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default QRGenerator;
