import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { QrCode, Coffee, ShoppingBag, Loader2 } from 'lucide-react';

interface SessionSelectorProps {
    storeId: string;
    storeSlug: string;
    onSessionCreated: (sessionId: string, sessionType: string, label: string | null) => void;
    onClose?: () => void;
    accentColor?: string;
}

type ContextType = 'table' | 'bar' | 'pickup';

const SessionSelector: React.FC<SessionSelectorProps> = ({
    storeId,
    storeSlug,
    onSessionCreated,
    onClose,
    accentColor = '#36e27b'
}) => {
    const [selectedType, setSelectedType] = useState<ContextType | null>(null);
    const [tableNumber, setTableNumber] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleCreateSession = async () => {
        if (!selectedType) return;

        // Validate table number if table selected
        if (selectedType === 'table' && !tableNumber.trim()) {
            setError('Ingresa el número de mesa');
            return;
        }

        setIsCreating(true);
        setError(null);

        try {
            // Create session via RPC (without QR, manual selection)
            const { data, error: rpcError } = await (supabase.rpc as any)('create_client_session', {
                p_store_id: storeId,
                p_session_type: selectedType === 'pickup' ? 'pickup' : selectedType,
                p_table_id: null, // Manual selection doesn't have venue_node
                p_bar_id: null,
                p_location_id: null,
                p_client_id: null
            });

            if (rpcError) throw rpcError;

            const sessionId = data?.session_id;
            if (!sessionId) throw new Error('No session created');

            // Save to localStorage
            localStorage.setItem('client_session_id', sessionId);
            localStorage.setItem('client_session_type', selectedType);
            localStorage.setItem('client_session_label',
                selectedType === 'table' ? `Mesa ${tableNumber}` :
                    selectedType === 'bar' ? 'Barra' : 'Retiro'
            );

            // Callback
            onSessionCreated(
                sessionId,
                selectedType,
                selectedType === 'table' ? `Mesa ${tableNumber}` :
                    selectedType === 'bar' ? 'Barra' : 'Retiro'
            );

        } catch (e: any) {
            console.error('Session creation error:', e);
            setError('Error al crear sesión. Intenta nuevamente.');
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
            <div className="w-full max-w-sm bg-[#0a0a0a] rounded-3xl border border-white/10 shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="p-6 border-b border-white/5 text-center">
                    <div
                        className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4"
                        style={{ backgroundColor: `${accentColor}15` }}
                    >
                        <QrCode size={32} style={{ color: accentColor }} />
                    </div>
                    <h2 className="text-xl font-black text-white uppercase tracking-tight">
                        ¿Desde dónde pedís?
                    </h2>
                    <p className="text-xs text-zinc-500 mt-2">
                        Seleccioná tu ubicación para continuar
                    </p>
                </div>

                {/* Options */}
                <div className="p-6 space-y-3">

                    {/* Table Option */}
                    <button
                        onClick={() => setSelectedType('table')}
                        className={`w-full p-4 rounded-2xl border-2 flex items-center gap-4 transition-all ${selectedType === 'table'
                                ? 'border-white bg-white/5'
                                : 'border-white/10 hover:border-white/20'
                            }`}
                    >
                        <div
                            className={`w-12 h-12 rounded-xl flex items-center justify-center ${selectedType === 'table' ? 'bg-white text-black' : 'bg-white/5 text-zinc-400'
                                }`}
                        >
                            <span className="material-symbols-outlined">table_restaurant</span>
                        </div>
                        <div className="text-left flex-1">
                            <p className="text-white font-bold text-sm">Mesa</p>
                            <p className="text-zinc-500 text-xs">Consumo en el local</p>
                        </div>
                        {selectedType === 'table' && (
                            <div
                                className="w-6 h-6 rounded-full flex items-center justify-center"
                                style={{ backgroundColor: accentColor }}
                            >
                                <span className="material-symbols-outlined text-black text-sm">check</span>
                            </div>
                        )}
                    </button>

                    {/* Table Number Input (shown if table selected) */}
                    {selectedType === 'table' && (
                        <div className="pl-16 animate-in slide-in-from-top-2 duration-200">
                            <input
                                type="text"
                                placeholder="Número de mesa"
                                value={tableNumber}
                                onChange={(e) => setTableNumber(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold placeholder:text-zinc-600 focus:border-white/30 outline-none"
                                autoFocus
                            />
                        </div>
                    )}

                    {/* Bar Option */}
                    <button
                        onClick={() => setSelectedType('bar')}
                        className={`w-full p-4 rounded-2xl border-2 flex items-center gap-4 transition-all ${selectedType === 'bar'
                                ? 'border-white bg-white/5'
                                : 'border-white/10 hover:border-white/20'
                            }`}
                    >
                        <div
                            className={`w-12 h-12 rounded-xl flex items-center justify-center ${selectedType === 'bar' ? 'bg-white text-black' : 'bg-white/5 text-zinc-400'
                                }`}
                        >
                            <Coffee size={20} />
                        </div>
                        <div className="text-left flex-1">
                            <p className="text-white font-bold text-sm">Barra</p>
                            <p className="text-zinc-500 text-xs">Retiro inmediato en barra</p>
                        </div>
                        {selectedType === 'bar' && (
                            <div
                                className="w-6 h-6 rounded-full flex items-center justify-center"
                                style={{ backgroundColor: accentColor }}
                            >
                                <span className="material-symbols-outlined text-black text-sm">check</span>
                            </div>
                        )}
                    </button>

                    {/* Pickup Option */}
                    <button
                        onClick={() => setSelectedType('pickup')}
                        className={`w-full p-4 rounded-2xl border-2 flex items-center gap-4 transition-all ${selectedType === 'pickup'
                                ? 'border-white bg-white/5'
                                : 'border-white/10 hover:border-white/20'
                            }`}
                    >
                        <div
                            className={`w-12 h-12 rounded-xl flex items-center justify-center ${selectedType === 'pickup' ? 'bg-white text-black' : 'bg-white/5 text-zinc-400'
                                }`}
                        >
                            <ShoppingBag size={20} />
                        </div>
                        <div className="text-left flex-1">
                            <p className="text-white font-bold text-sm">Para Llevar</p>
                            <p className="text-zinc-500 text-xs">Retiro en mostrador</p>
                        </div>
                        {selectedType === 'pickup' && (
                            <div
                                className="w-6 h-6 rounded-full flex items-center justify-center"
                                style={{ backgroundColor: accentColor }}
                            >
                                <span className="material-symbols-outlined text-black text-sm">check</span>
                            </div>
                        )}
                    </button>
                </div>

                {/* Error */}
                {error && (
                    <div className="px-6 pb-2">
                        <p className="text-rose-500 text-xs text-center">{error}</p>
                    </div>
                )}

                {/* Footer */}
                <div className="p-6 pt-2">
                    <button
                        onClick={handleCreateSession}
                        disabled={!selectedType || isCreating}
                        className="w-full py-4 rounded-2xl font-black text-sm uppercase tracking-wider transition-all disabled:opacity-40"
                        style={{
                            backgroundColor: selectedType ? accentColor : 'rgba(255,255,255,0.05)',
                            color: selectedType ? '#000' : '#666'
                        }}
                    >
                        {isCreating ? (
                            <Loader2 size={18} className="animate-spin mx-auto" />
                        ) : (
                            'Continuar'
                        )}
                    </button>

                    {onClose && (
                        <button
                            onClick={onClose}
                            className="w-full mt-3 py-3 text-zinc-500 text-xs font-bold uppercase tracking-widest hover:text-white transition-colors"
                        >
                            Cancelar
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SessionSelector;
