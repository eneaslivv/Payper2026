import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { MenuTheme, Store } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'framer-motion';

interface LoyaltyClientViewProps {
    theme: MenuTheme;
    store: Store;
    user: any; // User from auth context
    onClose?: () => void; // Optional if we want a back button
}

interface Reward {
    id: string;
    name: string;
    points: number;
    image_url?: string;
    is_active: boolean;
}

export const LoyaltyClientView: React.FC<LoyaltyClientViewProps> = ({ theme, store, user, onClose }) => {
    const { profile } = useAuth();
    const [points, setPoints] = useState<number>(0);
    const [rewards, setRewards] = useState<Reward[]>([]);
    const [loading, setLoading] = useState(true);

    // Fetch data
    useEffect(() => {
        const fetchLoyaltyData = async () => {
            if (!store.id) return;
            setLoading(true);
            try {
                // 1. Get Points (Realtime from profile)
                if (profile?.points_balance) {
                    setPoints(profile.points_balance || 0);
                } else if (user) {
                    // Fallback check DB if profile context stale
                    const { data: prof } = await supabase.from('profiles').select('points_balance').eq('id', user.id).single();
                    if (prof) setPoints(prof.points_balance || 0);
                }

                // 2. Get Rewards
                // @ts-ignore
                const { data: rewardsData } = await supabase
                    .from('loyalty_rewards' as any)
                    .select('*')
                    .eq('store_id', store.id)
                    .eq('is_active', true)
                    .order('points', { ascending: true });

                if (rewardsData) setRewards(rewardsData);

            } catch (error) {
                console.error('Error fetching loyalty:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchLoyaltyData();
    }, [store.id, user, profile]);

    // Derived theme styles
    const radiusClass = theme.borderRadius === 'full' ? 'rounded-[2rem]' : theme.borderRadius === 'none' ? 'rounded-none' : 'rounded-xl';
    const fontClass = theme.fontStyle === 'serif' ? 'font-serif' : theme.fontStyle === 'mono' ? 'font-mono' : 'font-sans';

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 opacity-50 space-y-4">
                <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: theme.accentColor, borderTopColor: 'transparent' }} />
                <p className="text-[10px] uppercase tracking-widest" style={{ color: theme.textColor }}>Cargando Club...</p>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-6">
                <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-2">
                    <span className="material-symbols-outlined text-4xl" style={{ color: theme.accentColor }}>stars</span>
                </div>
                <div>
                    <h2 className="text-2xl font-black uppercase tracking-tighter mb-2" style={{ color: theme.textColor }}>Únete al Club</h2>
                    <p className="text-sm opacity-60 leading-relaxed" style={{ color: theme.textColor }}>
                        Regístrate para acumular puntos y canjear recompensas exclusivas en {store.name}.
                    </p>
                </div>
                <div className="p-4 rounded-xl border border-white/10 w-full" style={{ backgroundColor: theme.surfaceColor }}>
                    <div className="flex justify-between text-[10px] font-bold uppercase opacity-50 mb-2">
                        <span>Beneficios</span>
                        <span>Status</span>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-sm text-green-500">check_circle</span>
                            <span className="text-xs" style={{ color: theme.textColor }}>Puntos por cada compra</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-sm text-green-500">check_circle</span>
                            <span className="text-xs" style={{ color: theme.textColor }}>Premios sorpresa</span>
                        </div>
                    </div>
                </div>
                {/* Navigation to auth handled by parent logic or link */}
                <button
                    onClick={() => window.location.hash = `/m/${store.slug}/auth`}
                    className="w-full py-4 rounded-xl font-black uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all"
                    style={{ backgroundColor: theme.accentColor, color: '#000' }}
                >
                    Crear Cuenta Gratis
                </button>
            </div>
        );
    }

    return (
        <div className={`p-4 md:p-6 pb-32 space-y-8 animate-in slide-in-from-bottom-4 duration-500 ${fontClass}`}>

            {/* DIGITAL CARD */}
            <div className="relative w-full aspect-[1.8/1] rounded-3xl overflow-hidden shadow-2xl group transition-all hover:scale-[1.01]">
                {/* Background */}
                <div
                    className="absolute inset-0 bg-gradient-to-br from-gray-900 to-black"
                    style={{
                        backgroundColor: theme.accentColor,
                        backgroundImage: `radial-gradient(circle at 100% 0%, ${theme.accentColor}40 0%, transparent 50%), radial-gradient(circle at 0% 100%, #000 0%, transparent 50%)`
                    }}
                />

                {/* Dynamic Shine */}
                <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] mix-blend-overlay" />

                <div className="relative z-10 p-6 flex flex-col justify-between h-full text-white">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="text-xs font-black uppercase tracking-[0.3em] opacity-70 mb-1">{store.name}</h3>
                            <div className="text-[10px] font-bold opacity-50 uppercase flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                Member ID: {user.id.slice(0, 8)}
                            </div>
                        </div>
                        <span className="material-symbols-outlined text-3xl opacity-80">contactless</span>
                    </div>

                    <div>
                        <div className="flex items-end gap-2 mb-1">
                            <span className="text-5xl font-black tracking-tighter leading-none shadow-black drop-shadow-md">{points}</span>
                            <span className="text-xs font-bold uppercase tracking-widest mb-1.5 opacity-80">PTS</span>
                        </div>
                        <p className="text-[9px] opacity-60 uppercase tracking-widest">Saldo Disponible</p>
                    </div>
                </div>
            </div>

            {/* REWARDS GRID */}
            <div>
                <div className="flex items-center justify-between mb-4 px-1">
                    <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2" style={{ color: theme.textColor }}>
                        <span className="material-symbols-outlined text-lg" style={{ color: theme.accentColor }}>redeem</span>
                        Catálogo de Canje
                    </h3>
                    <span className="text-[9px] font-bold opacity-40 uppercase" style={{ color: theme.textColor }}>{rewards.length} Premios</span>
                </div>

                {rewards.length === 0 ? (
                    <div className="py-12 text-center opacity-30 border-2 border-dashed border-white/10 rounded-2xl">
                        <span className="material-symbols-outlined text-3xl mb-2">loyalty</span>
                        <p className="text-[10px] uppercase font-bold tracking-widest">Sin recompensas activas</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {rewards.map(reward => {
                            const canAfford = points >= reward.points;
                            return (
                                <div
                                    key={reward.id}
                                    className={`relative p-3 rounded-2xl border flex items-center gap-3 transition-all ${canAfford ? 'opacity-100 hover:border-opacity-50' : 'opacity-50 grayscale'}`}
                                    style={{
                                        backgroundColor: theme.surfaceColor,
                                        borderColor: `${theme.textColor}10`,
                                    }}
                                >
                                    <div className="w-16 h-16 rounded-xl bg-black/20 shrink-0 overflow-hidden">
                                        {reward.image_url ? (
                                            <img src={reward.image_url} className="w-full h-full object-cover" alt={reward.name} />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <span className="material-symbols-outlined text-white/20">redeem</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-xs font-black uppercase italic tracking-tight truncate leading-tight mb-1" style={{ color: theme.textColor }}>{reward.name}</h4>
                                        <div className="flex items-center gap-1.5">
                                            <span
                                                className="text-sm font-black"
                                                style={{ color: canAfford ? theme.accentColor : theme.textColor }}
                                            >
                                                {reward.points}
                                            </span>
                                            <span className="text-[8px] font-black uppercase opacity-50" style={{ color: theme.textColor }}>PTS</span>
                                        </div>
                                    </div>
                                    <button
                                        disabled={!canAfford}
                                        className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${canAfford ? 'hover:scale-105 active:scale-95' : 'cursor-not-allowed opacity-50'}`}
                                        style={{
                                            backgroundColor: canAfford ? theme.accentColor : 'transparent',
                                            color: canAfford ? '#000' : theme.textColor,
                                            border: canAfford ? 'none' : `1px solid ${theme.textColor}20`
                                        }}
                                        onClick={async () => {
                                            if (!canAfford) return;

                                            // Optimistic UI update or loading state could go here
                                            const confirmRedeem = window.confirm(`¿Canjear ${reward.name} por ${reward.points} puntos?`);
                                            if (!confirmRedeem) return;

                                            try {
                                                const { data, error } = await supabase.rpc('redeem_points', { p_reward_id: reward.id }) as any;

                                                if (error) throw error;

                                                // Update local state
                                                if (data && data.success) {
                                                    setPoints(data.new_balance);
                                                    alert(`¡Canje Exitoso! \n\n${data.message}`);
                                                    // Optional: Refresh rewards or show a "Code" modal outcome
                                                } else {
                                                    throw new Error(data?.error || 'Error desconocido');
                                                }
                                            } catch (err: any) {
                                                console.error('Redemption error:', err);
                                                alert(`Error al canjear: ${err.message}`);
                                            }
                                        }}
                                    >
                                        {canAfford ? 'Canjear' : 'Falta'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
