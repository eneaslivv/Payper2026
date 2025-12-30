import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MenuTheme } from '../types';

interface AuthPromptModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRegister: () => void;
    theme: MenuTheme;
}

export const AuthPromptModal: React.FC<AuthPromptModalProps> = ({
    isOpen,
    onClose,
    onRegister,
    theme
}) => {
    const [view, setView] = useState<'prompt' | 'benefits'>('prompt');

    if (!isOpen) return null;

    const accentColor = theme.accentColor || '#4ADE80';
    const bgColor = theme.backgroundColor || '#0D0F0D';
    const surfaceColor = theme.surfaceColor || '#141714';
    const textColor = theme.textColor || '#FFFFFF';

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
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="relative w-full max-w-sm overflow-hidden shadow-2xl z-10"
                        style={{
                            backgroundColor: bgColor,
                            color: textColor,
                            borderRadius: '2rem',
                            border: `1px solid ${textColor}1A`
                        }}
                    >
                        <AnimatePresence mode="wait">
                            {view === 'prompt' ? (
                                <PromptView
                                    key="prompt"
                                    onRegister={onRegister}
                                    onLearnMore={() => setView('benefits')}
                                    theme={{ accentColor, surfaceColor, textColor }}
                                />
                            ) : (
                                <BenefitsView
                                    key="benefits"
                                    onRegister={onRegister}
                                    onBack={() => setView('prompt')}
                                    onExplore={onClose}
                                    theme={{ accentColor, surfaceColor, textColor }}
                                />
                            )}
                        </AnimatePresence>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

// --- SUB-COMPONENTS ---

const PromptView: React.FC<{
    onRegister: () => void;
    onLearnMore: () => void;
    theme: { accentColor: string, surfaceColor: string, textColor: string }
}> = ({ onRegister, onLearnMore, theme }) => (
    <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="p-8 flex flex-col items-center text-center pb-12"
    >
        {/* Avatar/Icon Placeholder */}
        <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/5 flex items-center justify-center mb-6 shadow-lg">
            <span className="material-symbols-outlined text-4xl" style={{ color: theme.accentColor }}>person</span>
        </div>

        <h2 className="text-2xl font-black uppercase italic tracking-tighter mb-4 leading-none">
            Crea tu perfil<br />para pedir
        </h2>

        <p className="text-sm opacity-60 font-medium mb-8 leading-relaxed max-w-[260px]">
            Pide desde la mesa, paga sin esperas y acumula granos para cafés gratis.
        </p>

        <div className="w-full space-y-3">
            <button
                onClick={onRegister}
                className="w-full py-4 rounded-full font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-lg shadow-green-900/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                style={{ backgroundColor: theme.accentColor, color: '#000000' }}
            >
                Crear Perfil (1 min)
                <span className="material-symbols-outlined text-sm font-bold">bolt</span>
            </button>

            <button
                onClick={onLearnMore}
                className="w-full py-4 rounded-full font-bold uppercase tracking-widest text-[10px] border border-white/10 hover:bg-white/5 transition-all"
                style={{ backgroundColor: 'transparent', color: theme.textColor }}
            >
                Ver cómo funciona
            </button>
        </div>

        <div className="mt-8 flex items-center gap-3 opacity-30">
            <span className="material-symbols-outlined text-xs">verified_user</span>
            <span className="text-[8px] font-black uppercase tracking-[0.2em]">Seguro • Rápido • Simple</span>
        </div>
    </motion.div>
);

const BenefitsView: React.FC<{
    onRegister: () => void;
    onBack: () => void;
    onExplore: () => void;
    theme: { accentColor: string, surfaceColor: string, textColor: string }
}> = ({ onRegister, onBack, onExplore, theme }) => (
    <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        className="p-6 flex flex-col h-full min-h-[500px]"
    >
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
            <button
                onClick={onBack}
                className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
            >
                <span className="material-symbols-outlined text-lg">arrow_back</span>
            </button>
            <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: theme.accentColor }}>
                Beneficios Club
            </span>
            <div className="w-10" /> {/* Spacer for centering */}
        </div>

        {/* Benefits List */}
        <div className="flex-1 space-y-4 mb-8">
            <BenefitItem
                icon="qr_code_scanner"
                title="Escaneá tu mesa"
                desc="Accedé al menú digital interactivo al instante."
                theme={theme}
            />
            <BenefitItem
                icon="loyalty"
                title="Sumá Granos"
                desc="Cada compra te acerca a tu próximo café gratis."
                theme={theme}
            />
            <BenefitItem
                icon="auto_awesome"
                title="Experiencia VIP"
                desc="Pagá desde la app y recibí notificaciones en tiempo real."
                theme={theme}
            />
        </div>

        {/* Footer Actions */}
        <div className="space-y-4 text-center">
            <button
                onClick={onRegister}
                className="w-full py-4 rounded-full font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
                style={{ backgroundColor: theme.accentColor, color: '#000000' }}
            >
                Crear Perfil (1 min)
                <span className="material-symbols-outlined text-sm font-bold">bolt</span>
            </button>

            <button
                onClick={onExplore}
                className="text-[10px] font-black uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity"
            >
                Explorar Menú Primero
            </button>
        </div>

        <div className="mt-8 flex items-center justify-center gap-3 opacity-30">
            <span className="material-symbols-outlined text-xs">verified_user</span>
            <span className="text-[8px] font-black uppercase tracking-[0.2em]">Seguro • Rápido • Simple</span>
        </div>
    </motion.div>
);

const BenefitItem: React.FC<{ icon: string, title: string, desc: string, theme: any }> = ({ icon, title, desc, theme }) => (
    <div className="flex items-start gap-4 p-4 rounded-2xl border border-white/5 bg-white/[0.02]">
        <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined" style={{ color: theme.accentColor }}>{icon}</span>
        </div>
        <div>
            <h3 className="font-black italic uppercase text-sm mb-1 text-white">{title}</h3>
            <p className="text-xs text-white/50 leading-relaxed font-medium">{desc}</p>
        </div>
    </div>
);
