import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useClient } from '../../contexts/ClientContext';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/ToastSystem';

const TOPUP_AMOUNTS = [500, 1000, 2000, 5000];

const WalletPage: React.FC = () => {
    const navigate = useNavigate();
    const { slug } = useParams<{ slug: string }>();
    const [searchParams] = useSearchParams();
    const { store, user } = useClient();
    const { addToast } = useToast();

    const [selectedAmount, setSelectedAmount] = useState<number>(1000);
    const [customAmount, setCustomAmount] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [walletBalance, setWalletBalance] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(true);

    // Theme
    const accentColor = store?.menu_theme?.accentColor || '#36e27b';

    // Handle redirect status from MP
    useEffect(() => {
        const status = searchParams.get('status');
        const txnId = searchParams.get('txn');

        if (status === 'success' && txnId) {
            addToast('¡Recarga exitosa!', 'success', 'Tu saldo ha sido actualizado');
            // Clean URL
            navigate(`/m/${slug}/wallet`, { replace: true });
            // Refresh balance
            fetchBalance();
        } else if (status === 'failure') {
            addToast('Recarga fallida', 'error', 'El pago no pudo ser procesado');
            navigate(`/m/${slug}/wallet`, { replace: true });
        }
    }, [searchParams]);

    // Fetch wallet balance for this store
    const fetchBalance = async () => {
        if (!user?.id || !store?.id) return;

        setIsLoading(true);
        const { data, error } = await (supabase.from as any)('wallets')
            .select('balance')
            .eq('user_id', user.id)
            .eq('store_id', store.id)
            .single();

        if (data) {
            setWalletBalance(data.balance || 0);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        if (user?.id && store?.id) {
            fetchBalance();
        }
    }, [user?.id, store?.id]);

    // Redirect to auth if not logged in
    useEffect(() => {
        if (!user) {
            navigate(`/m/${slug}/auth`);
        }
    }, [user, navigate, slug]);

    const handleTopUp = async () => {
        const amount = customAmount ? parseFloat(customAmount) : selectedAmount;

        if (!amount || amount <= 0) {
            addToast('Monto inválido', 'error', 'Ingresa un monto válido');
            return;
        }

        if (!store?.id || !user?.id) {
            addToast('Error', 'error', 'No se pudo identificar el local o usuario');
            return;
        }

        setIsProcessing(true);

        try {
            const { data, error } = await supabase.functions.invoke('create-topup', {
                body: {
                    store_id: store.id,
                    user_id: user.id,
                    amount,
                    back_urls: {
                        success: `${window.location.origin}/m/${slug}/wallet?status=success`,
                        failure: `${window.location.origin}/m/${slug}/wallet?status=failure`,
                        pending: `${window.location.origin}/m/${slug}/wallet?status=pending`
                    }
                }
            });

            if (error) throw error;

            if (data?.error) {
                addToast('Error', 'error', data.error);
                setIsProcessing(false);
                return;
            }

            if (data?.checkout_url) {
                window.location.href = data.checkout_url;
            } else {
                throw new Error('No se recibió URL de checkout');
            }
        } catch (err: any) {
            console.error('Topup Error:', err);
            addToast('Error', 'error', err.message || 'Error al procesar recarga');
            setIsProcessing(false);
        }
    };

    if (!user) return null;

    return (
        <div className="flex flex-col min-h-screen pb-48 bg-black">
            {/* HEADER */}
            <header className="sticky top-0 z-50 flex items-center bg-black/90 pt-[calc(1rem+env(safe-area-inset-top))] px-6 pb-4 justify-between border-b border-white/5 backdrop-blur-xl">
                <button
                    onClick={() => navigate(`/m/${slug}`)}
                    className="text-white flex size-12 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors active:scale-90"
                >
                    <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <h2 className="text-white text-base font-black tracking-tight uppercase italic pr-12">Mi Saldo</h2>
            </header>

            <main className="flex-1 p-6 flex flex-col gap-8">
                {/* BALANCE CARD */}
                <div
                    className="relative rounded-[3rem] p-10 overflow-hidden border shadow-2xl"
                    style={{
                        background: `linear-gradient(135deg, ${accentColor}15 0%, ${accentColor}05 100%)`,
                        borderColor: `${accentColor}30`
                    }}
                >
                    <div className="absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl opacity-30" style={{ backgroundColor: accentColor }}></div>

                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-2">Saldo Disponible</p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-black italic tracking-tighter text-white">
                            ${isLoading ? '...' : walletBalance.toFixed(2)}
                        </span>
                        <span className="text-sm font-bold text-white/40">ARS</span>
                    </div>

                    <div className="mt-6 flex items-center gap-3">
                        <span className="material-symbols-outlined text-lg" style={{ color: accentColor }}>account_balance_wallet</span>
                        <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">{store?.name || 'Local'}</span>
                    </div>
                </div>

                {/* TOPUP SECTION */}
                <section>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-6 px-1">Cargar Saldo</h3>

                    {/* Quick Amount Buttons */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        {TOPUP_AMOUNTS.map((amt) => (
                            <button
                                key={amt}
                                onClick={() => { setSelectedAmount(amt); setCustomAmount(''); }}
                                className={`py-6 rounded-[2rem] border-2 transition-all duration-300 active:scale-95 ${selectedAmount === amt && !customAmount
                                    ? 'shadow-2xl'
                                    : 'border-white/10 bg-white/[0.02] opacity-60'
                                    }`}
                                style={selectedAmount === amt && !customAmount ? {
                                    borderColor: accentColor,
                                    backgroundColor: `${accentColor}10`,
                                    boxShadow: `0 10px 40px ${accentColor}20`
                                } : {}}
                            >
                                <span className={`text-2xl font-black italic tracking-tighter ${selectedAmount === amt && !customAmount ? 'text-white' : 'text-white/60'
                                    }`}>
                                    ${amt}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Custom Amount */}
                    <div className="mb-8">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 mb-3 block px-1">O ingresa otro monto</label>
                        <div className="relative">
                            <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-white/40">$</span>
                            <input
                                type="number"
                                value={customAmount}
                                onChange={(e) => { setCustomAmount(e.target.value); }}
                                placeholder="0"
                                className="w-full h-20 pl-14 pr-6 rounded-[2rem] bg-white/[0.03] border border-white/10 text-white text-3xl font-black italic tracking-tighter outline-none focus:border-[#36e27b]/50 transition-colors"
                                style={{ borderColor: customAmount ? `${accentColor}50` : undefined }}
                            />
                        </div>
                    </div>
                </section>
            </main>

            {/* FLOATING ACTION */}
            <div className="fixed bottom-0 left-0 right-0 z-[60] bg-black/95 backdrop-blur-3xl border-t border-white/5 px-8 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] max-w-md mx-auto shadow-[0_-30px_60px_rgba(0,0,0,0.8)]">
                <button
                    onClick={handleTopUp}
                    disabled={isProcessing}
                    className="group relative w-full active:scale-[0.97] transition-all duration-500 text-black font-black h-20 rounded-full flex items-center justify-between pl-10 pr-4 shadow-2xl overflow-hidden border border-white/20 disabled:opacity-50"
                    style={{ backgroundColor: accentColor, boxShadow: `0 20px 50px ${accentColor}40` }}
                >
                    <div className="flex flex-col items-start leading-none relative z-10">
                        <span className="text-[12px] font-black uppercase tracking-tight">
                            {isProcessing ? 'Procesando...' : 'Cargar con'}
                        </span>
                        <span className="text-[12px] font-black uppercase tracking-tight opacity-60">Mercado Pago</span>
                    </div>

                    <div className="flex items-center gap-4 relative z-10">
                        <span className="text-2xl font-black italic tracking-tighter">
                            ${customAmount || selectedAmount}
                        </span>
                        <div
                            className="w-14 h-14 rounded-full flex items-center justify-center bg-black transition-all group-hover:scale-105 shadow-2xl"
                            style={{ color: accentColor }}
                        >
                            {isProcessing ? (
                                <span className="material-symbols-outlined animate-spin text-2xl">refresh</span>
                            ) : (
                                <span className="material-symbols-outlined font-black text-2xl">arrow_forward</span>
                            )}
                        </div>
                    </div>
                </button>
            </div>
        </div>
    );
};

export default WalletPage;
