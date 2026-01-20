import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MenuTheme } from '../types';
import { supabase } from '../lib/supabase';

interface WalletTransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    userBalance: number;
    theme: MenuTheme;
    onSuccess?: () => void;
}

export const WalletTransferModal: React.FC<WalletTransferModalProps> = ({
    isOpen,
    onClose,
    userBalance,
    theme,
    onSuccess
}) => {
    const [email, setEmail] = useState('');
    const [amount, setAmount] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');

    const accentColor = theme.accentColor || '#4ADE80';
    const bgColor = theme.backgroundColor || '#0D0F0D';
    const textColor = theme.textColor || '#FFFFFF';

    const handleTransfer = async () => {
        setErrorMessage('');

        // Validation
        if (!email.includes('@')) {
            setErrorMessage('Ingresa un email válido');
            return;
        }

        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            setErrorMessage('Monto inválido');
            return;
        }

        if (amountNum > userBalance) {
            setErrorMessage('Saldo insuficiente');
            return;
        }

        setStatus('loading');

        try {
            const { error } = await supabase.rpc('p2p_wallet_transfer', {
                p_recipient_email: email,
                p_amount: amountNum
            });

            if (error) throw error;

            setStatus('success');
            if (onSuccess) onSuccess();

            // Auto close after 2 seconds
            setTimeout(() => {
                onClose();
                setStatus('idle');
                setEmail('');
                setAmount('');
            }, 2000);

        } catch (err: any) {
            console.error('Transfer Error:', err);
            // Handle specific error messages from RPC if needed
            setErrorMessage(err.message || 'Error al procesar la transferencia');
            setStatus('error');
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ y: '100%', opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: '100%', opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="relative w-full max-w-sm overflow-hidden shadow-2xl z-10"
                        style={{
                            backgroundColor: bgColor,
                            color: textColor,
                            borderRadius: '2rem',
                            border: `1px solid ${textColor}1A`
                        }}
                    >
                        <div className="p-8">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-black uppercase italic tracking-tighter leading-none">
                                    Transferir <span style={{ color: accentColor }}>Saldo</span>
                                </h2>
                                <button
                                    onClick={onClose}
                                    className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                            </div>

                            {status === 'success' ? (
                                <div className="flex flex-col items-center py-8">
                                    <div className="w-16 h-16 rounded-full bg-[#4ADE80]/20 flex items-center justify-center mb-4 text-[#4ADE80]">
                                        <span className="material-symbols-outlined text-3xl">check</span>
                                    </div>
                                    <h3 className="font-bold text-lg mb-2">¡Transferencia Exitosa!</h3>
                                    <p className="text-sm opacity-60 text-center">
                                        Hemos enviado ${amount} a {email}
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Balance Display */}
                                    <div className="flex justify-between items-center p-3 rounded-xl bg-white/5 border border-white/5">
                                        <span className="text-xs font-bold uppercase tracking-wider opacity-60">Tu Disponible</span>
                                        <span className="font-mono font-bold" style={{ color: accentColor }}>
                                            ${userBalance.toFixed(2)}
                                        </span>
                                    </div>

                                    {/* Inputs */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Email del Destinatario</label>
                                        <div className="relative">
                                            <input
                                                type="email"
                                                value={email}
                                                onChange={e => setEmail(e.target.value)}
                                                placeholder="amigo@ejemplo.com"
                                                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-white/30 outline-none transition-all pl-10"
                                            />
                                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-lg">alternate_email</span>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Monto a Enviar</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                value={amount}
                                                onChange={e => setAmount(e.target.value)}
                                                placeholder="0.00"
                                                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-lg font-mono font-bold focus:border-white/30 outline-none transition-all pl-10"
                                            />
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold opacity-50">$</span>
                                        </div>
                                    </div>

                                    {/* Error Message */}
                                    {errorMessage && (
                                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium flex items-center gap-2">
                                            <span className="material-symbols-outlined text-sm">error</span>
                                            {errorMessage}
                                        </div>
                                    )}

                                    {/* Action Button */}
                                    <button
                                        onClick={handleTransfer}
                                        disabled={status === 'loading'}
                                        className="w-full py-4 mt-4 rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-lg hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        style={{ backgroundColor: accentColor, color: '#000000' }}
                                    >
                                        {status === 'loading' ? (
                                            <>
                                                <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                                Enviando...
                                            </>
                                        ) : (
                                            <>
                                                Confirmar Transferencia
                                                <span className="material-symbols-outlined text-sm font-bold">send</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
