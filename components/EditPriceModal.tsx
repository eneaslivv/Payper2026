import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from './ToastSystem';

interface EditPriceModalProps {
    isOpen: boolean;
    onClose: () => void;
    itemId: string;
    itemName: string;
    currentCost: number;
    currentPrice: number;
    onSuccess: () => void;
}

export const EditPriceModal: React.FC<EditPriceModalProps> = ({
    isOpen,
    onClose,
    itemId,
    itemName,
    currentCost,
    currentPrice,
    onSuccess
}) => {
    const { addToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [newCost, setNewCost] = useState(currentCost.toString());
    const [newPrice, setNewPrice] = useState(currentPrice.toString());
    const [confirmStep, setConfirmStep] = useState(false);

    // Reset state when opening
    React.useEffect(() => {
        if (isOpen) {
            setNewCost(currentCost.toString());
            setNewPrice(currentPrice.toString());
            setConfirmStep(false);
        }
    }, [isOpen, currentCost, currentPrice]);

    const hasChanges = parseFloat(newCost) !== currentCost || parseFloat(newPrice) !== currentPrice;

    const handleSave = async () => {
        if (!confirmStep) {
            setConfirmStep(true);
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase
                .from('inventory_items')
                .update({
                    cost: parseFloat(newCost) || 0,
                    price: parseFloat(newPrice) || 0,
                    updated_at: new Date().toISOString()
                })
                .eq('id', itemId);

            if (error) throw error;

            addToast('✓ Precio actualizado y registrado en auditoría', 'success');
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Price update failed:', err);
            addToast(err.message || 'Error al actualizar precio', 'error');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="w-full max-w-sm bg-[#0a0a0a] border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="p-5 border-b border-white/5 bg-gradient-to-r from-amber-500/5 to-transparent">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-amber-500">edit</span>
                            <h3 className="text-white font-black uppercase tracking-tight text-base">Editar Precio</h3>
                        </div>
                        <button onClick={onClose} className="text-white/20 hover:text-white transition-colors">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">{itemName}</p>
                </div>

                {/* Content */}
                <div className="p-5 space-y-4">
                    {/* Warning Banner */}
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-3">
                        <span className="material-symbols-outlined text-amber-500 text-lg">warning</span>
                        <p className="text-[10px] text-amber-400/80 leading-relaxed">
                            Los cambios de precio quedan <strong>auditados</strong> con tu usuario y fecha.
                        </p>
                    </div>

                    {/* Cost Field */}
                    <div className="space-y-2">
                        <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                            Costo Unitario
                            {parseFloat(newCost) !== currentCost && (
                                <span className="text-amber-500 text-[8px]">(modificado)</span>
                            )}
                        </label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-white/20">$</span>
                            <input
                                type="number"
                                value={newCost}
                                onChange={(e) => setNewCost(e.target.value)}
                                className="w-full bg-black border border-white/10 rounded-xl pl-8 pr-4 py-3 text-sm font-bold text-white outline-none focus:border-amber-500/50 transition-all"
                            />
                        </div>
                        <p className="text-[9px] text-white/20 ml-1">Actual: ${currentCost}</p>
                    </div>

                    {/* Price Field */}
                    <div className="space-y-2">
                        <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                            Precio de Venta
                            {parseFloat(newPrice) !== currentPrice && (
                                <span className="text-amber-500 text-[8px]">(modificado)</span>
                            )}
                        </label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-white/20">$</span>
                            <input
                                type="number"
                                value={newPrice}
                                onChange={(e) => setNewPrice(e.target.value)}
                                className="w-full bg-black border border-white/10 rounded-xl pl-8 pr-4 py-3 text-sm font-bold text-white outline-none focus:border-amber-500/50 transition-all"
                            />
                        </div>
                        <p className="text-[9px] text-white/20 ml-1">Actual: ${currentPrice}</p>
                    </div>

                    {/* Confirmation Step */}
                    {confirmStep && hasChanges && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 space-y-2 animate-in fade-in duration-200">
                            <p className="text-[11px] font-bold text-red-400 uppercase tracking-wider">¿Confirmar cambios?</p>
                            <div className="text-[10px] text-white/60 space-y-1">
                                {parseFloat(newCost) !== currentCost && (
                                    <p>Costo: <span className="text-white/40 line-through">${currentCost}</span> → <span className="text-amber-400">${newCost}</span></p>
                                )}
                                {parseFloat(newPrice) !== currentPrice && (
                                    <p>Precio: <span className="text-white/40 line-through">${currentPrice}</span> → <span className="text-amber-400">${newPrice}</span></p>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-5 bg-white/[0.02] border-t border-white/5 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 rounded-xl bg-white/5 text-white/50 text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading || !hasChanges}
                        className="flex-1 py-3 rounded-xl bg-amber-500 text-black text-[10px] font-black uppercase tracking-widest hover:bg-amber-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Guardando...' : confirmStep ? 'Confirmar' : 'Guardar'}
                    </button>
                </div>
            </div>
        </div>
    );
};
