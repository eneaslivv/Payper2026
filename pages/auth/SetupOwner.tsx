import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/ToastSystem';
import payperLogo from '../../src/assets/payper-logo.png';

const SetupOwner: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { addToast } = useToast();

    const [loading, setLoading] = useState(true);
    const [storeName, setStoreName] = useState('');
    const [ownerName, setOwnerName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [setupComplete, setSetupComplete] = useState(false);

    useEffect(() => {
        // Read store info from URL params as fallback
        const urlStoreName = searchParams.get('storeName');
        const urlOwnerName = searchParams.get('ownerName');
        if (urlStoreName) setStoreName(decodeURIComponent(urlStoreName));
        if (urlOwnerName) setOwnerName(decodeURIComponent(urlOwnerName));

        checkSession();
    }, [searchParams]);

    const [isWrongUser, setIsWrongUser] = useState(false);

    const checkSession = async () => {
        try {
            // Check if user came from a recovery/invite link
            const { data: { session } } = await supabase.auth.getSession();

            if (session?.user) {
                const metadata = session.user.user_metadata;

                // CRITICAL SECURITY CHECK: Block SuperAdmin/existing staff from this page
                const userRole = metadata?.role;
                if (userRole === 'super_admin' || userRole === 'staff') {
                    console.warn('[SetupOwner] BLOCKED: User already has role:', userRole);
                    setIsWrongUser(true);
                    setLoading(false);
                    return; // Don't proceed - wrong user type
                }

                // Only proceed if user is a new store_owner
                if (userRole === 'store_owner') {
                    setOwnerName(metadata?.full_name || '');

                    if (metadata?.store_id) {
                        const { data: store } = await supabase
                            .from('stores')
                            .select('name')
                            .eq('id', metadata.store_id)
                            .single();
                        setStoreName(store?.name || 'tu local');
                    }
                } else {
                    // Unknown role or no role - redirect to login
                    addToast('Sesión no válida', 'error', 'Por favor usa el link de invitación');
                    navigate('/login');
                    return;
                }
            } else {
                // No session - check if there's an access_token in the URL (from Supabase email link)
                const access_token = searchParams.get('access_token');
                const refresh_token = searchParams.get('refresh_token');

                if (access_token && refresh_token) {
                    const { data, error } = await supabase.auth.setSession({
                        access_token,
                        refresh_token
                    });

                    if (error) throw error;

                    if (data.user) {
                        const metadata = data.user.user_metadata;

                        // Security check for token-based session too
                        const userRole = metadata?.role;
                        if (userRole === 'super_admin' || userRole === 'staff') {
                            setIsWrongUser(true);
                            setLoading(false);
                            return;
                        }

                        setOwnerName(metadata?.full_name || '');

                        if (metadata?.store_id) {
                            const { data: store } = await supabase
                                .from('stores')
                                .select('name')
                                .eq('id', metadata.store_id)
                                .single();
                            setStoreName(store?.name || 'tu local');
                        }
                    }
                } else {
                    addToast('Sesión no válida', 'error', 'Por favor usa el link de invitación');
                    navigate('/login');
                    return;
                }
            }
        } catch (e: any) {
            console.error('SetupOwner error:', e);
            addToast('Error', 'error', e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleLogoutAndRedirect = async () => {
        await supabase.auth.signOut();
        addToast('Sesión cerrada', 'success', 'Ahora podés usar el link de invitación');
        // Reload page to clear session
        window.location.reload();
    };

    const handleSetPassword = async () => {
        if (!password || password.length < 6) {
            addToast('Error', 'error', 'La contraseña debe tener al menos 6 caracteres');
            return;
        }
        if (password !== confirmPassword) {
            addToast('Error', 'error', 'Las contraseñas no coinciden');
            return;
        }

        setIsSaving(true);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;

            // Update store onboarding_status to COMPLETED
            const { data: { session } } = await supabase.auth.getSession();
            const storeId = session?.user?.user_metadata?.store_id;
            if (storeId) {
                const { error: storeUpdateError } = await (supabase
                    .from('stores') as any)
                    .update({ onboarding_status: 'COMPLETED' })
                    .eq('id', storeId);

                if (storeUpdateError) {
                    console.warn('[SetupOwner] Failed to update onboarding_status:', storeUpdateError);
                } else {
                    console.log('[SetupOwner] Store onboarding_status set to COMPLETED');
                }
            }

            setSetupComplete(true);
            addToast('¡Cuenta configurada!', 'success', 'Redirigiendo al dashboard...');

            setTimeout(() => {
                navigate('/');
            }, 2000);
        } catch (e: any) {
            addToast('Error', 'error', e.message);
        } finally {
            setIsSaving(false);
        }
    };

    // SECURITY: Block wrong user types
    if (isWrongUser) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-6">
                <div className="relative bg-[#0D0F0D] border border-red-500/30 rounded-[3rem] p-12 w-full max-w-lg shadow-2xl">
                    <div className="text-center space-y-6">
                        <div className="size-20 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto">
                            <span className="material-symbols-outlined text-4xl text-red-500">shield_lock</span>
                        </div>
                        <div className="space-y-2">
                            <h1 className="text-2xl font-black text-white uppercase tracking-tight">
                                Sesión Incorrecta
                            </h1>
                            <p className="text-white/40 text-sm leading-relaxed">
                                Ya tenés una sesión activa como <span className="text-red-400 font-bold">SuperAdmin</span> o <span className="text-red-400 font-bold">Staff</span>.
                            </p>
                            <p className="text-white/30 text-xs mt-4">
                                Para configurar un nuevo local, cerrá esta sesión y abrí el link de invitación en una pestaña privada.
                            </p>
                        </div>
                        <div className="space-y-3 pt-4">
                            <button
                                onClick={handleLogoutAndRedirect}
                                className="w-full py-4 bg-red-500/20 border border-red-500/30 text-red-400 rounded-2xl font-bold text-[11px] uppercase tracking-widest hover:bg-red-500/30 transition-all flex items-center justify-center gap-2"
                            >
                                <span className="material-symbols-outlined text-lg">logout</span>
                                Cerrar Sesión Actual
                            </button>
                            <button
                                onClick={() => navigate('/')}
                                className="w-full py-3 text-white/30 font-bold text-[10px] uppercase tracking-widest hover:text-white/50 transition-all"
                            >
                                Volver al Dashboard
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="size-12 border-2 border-accent/20 border-t-accent rounded-full animate-spin mx-auto"></div>
                    <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Verificando sesión...</p>
                </div>
            </div>
        );
    }

    if (setupComplete) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-6">
                <div className="text-center space-y-6 animate-in zoom-in-95">
                    <div className="size-24 bg-accent/20 rounded-full flex items-center justify-center mx-auto">
                        <span className="material-symbols-outlined text-5xl text-accent">check_circle</span>
                    </div>
                    <h1 className="text-3xl font-black text-white uppercase italic tracking-tight">¡Bienvenido!</h1>
                    <p className="text-white/40 text-sm">Configuración completada. Preparando tu dashboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-6">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] size-[600px] bg-accent/5 rounded-full blur-[150px]"></div>
                <div className="absolute bottom-[-20%] right-[-10%] size-[600px] bg-neon/5 rounded-full blur-[150px]"></div>
            </div>

            <div className="relative bg-[#0D0F0D] border border-white/10 rounded-[3rem] p-12 w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-500">
                {/* Header */}
                <div className="text-center space-y-4 mb-10">
                    <div className="mx-auto">
                        <img src={payperLogo} alt="Payper" className="h-12 mx-auto" />
                    </div>
                    <div className="space-y-2">
                        <h1 className="text-3xl font-black text-white uppercase italic tracking-tight leading-none">
                            Activar <span className="text-accent">Cuenta</span>
                        </h1>
                        <p className="text-[11px] text-white/40 font-bold uppercase tracking-widest">
                            Se te ha asignado la gestión de
                        </p>
                        <p className="text-xl font-black text-neon uppercase italic">
                            {storeName || searchParams.get('storeName') || 'Tu Local'}
                        </p>
                    </div>
                </div>

                {/* Form */}
                <div className="space-y-6">
                    {ownerName && (
                        <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                            <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest mb-1">Operador</p>
                            <p className="text-white font-bold uppercase">{ownerName}</p>
                        </div>
                    )}

                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-2">
                            Crea tu Contraseña de Acceso
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full h-14 bg-white/[0.03] border border-white/10 rounded-2xl px-6 text-white font-bold outline-none focus:border-accent transition-all"
                            placeholder="••••••••"
                        />
                    </div>

                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-2">
                            Confirmar Contraseña
                        </label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            className="w-full h-14 bg-white/[0.03] border border-white/10 rounded-2xl px-6 text-white font-bold outline-none focus:border-accent transition-all"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        onClick={handleSetPassword}
                        disabled={isSaving || !password || !confirmPassword}
                        className="w-full py-5 bg-accent text-black rounded-2xl font-black text-[12px] uppercase tracking-widest shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                    >
                        {isSaving ? (
                            <>
                                <div className="size-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                                <span>Configurando...</span>
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined">rocket_launch</span>
                                <span>Activar Cuenta y Entrar</span>
                            </>
                        )}
                    </button>
                </div>

                {/* Footer */}
                <div className="mt-8 pt-6 border-t border-white/5 text-center">
                    <p className="text-[8px] text-white/20 font-bold uppercase tracking-[0.3em]">
                        Activación Segura • Payper
                    </p>
                </div>
            </div>
        </div>
    );
};

export default SetupOwner;
