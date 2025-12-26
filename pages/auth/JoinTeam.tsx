import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/ToastSystem';
import { useAuth } from '../../contexts/AuthContext';

const JoinTeam = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const navigate = useNavigate();
    const { addToast } = useToast();
    const { user } = useAuth();

    const [invitation, setInvitation] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [storeName, setStoreName] = useState('');
    const [roleName, setRoleName] = useState('');

    // Registration form state
    const [showRegister, setShowRegister] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);

    useEffect(() => {
        // If user is already logged in, redirect to dashboard
        if (user) {
            addToast('Ya tienes una sesión activa', 'info');
            navigate('/');
            return;
        }

        if (!token) {
            setLoading(false);
            return;
        }
        checkInvitation();
    }, [token, user]);

    const checkInvitation = async () => {
        try {
            // Fetch invitation
            const { data, error } = await supabase
                .from('team_invitations' as any)
                .select('*')
                .eq('token', token)
                .single();

            if (error || !data) throw new Error('Invitación inválida o expirada');
            if ((data as any).status !== 'pending') throw new Error('Esta invitación ya fue usada');

            setInvitation(data);

            // Fetch store name
            const { data: storeData } = await supabase
                .from('stores')
                .select('name')
                .eq('id', (data as any).store_id)
                .single();

            setStoreName(storeData?.name || 'la tienda');

            // Fetch role name from cafe_roles
            const { data: roleData } = await supabase
                .from('cafe_roles')
                .select('name')
                .eq('id', (data as any).role)
                .single();

            setRoleName(roleData?.name || 'Operador');

        } catch (e: any) {
            console.error(e);
            addToast(e.message, 'error');
            navigate('/');
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async () => {
        if (!password || password.length < 6) {
            addToast('La contraseña debe tener al menos 6 caracteres', 'error');
            return;
        }
        if (password !== confirmPassword) {
            addToast('Las contraseñas no coinciden', 'error');
            return;
        }

        setIsRegistering(true);
        try {
            // Register user with Supabase Auth
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: invitation.email,
                password,
                options: {
                    data: {
                        full_name: fullName || invitation.email.split('@')[0],
                        store_id: invitation.store_id,
                        role_id: invitation.role
                    }
                }
            });

            // Check if user was created despite email errors
            if (authError && !authError.message.includes('confirmation')) {
                throw authError;
            }

            // Create profile for the new user
            if (authData?.user) {
                const { error: profileError } = await supabase
                    .from('profiles')
                    .upsert({
                        id: authData.user.id,
                        email: invitation.email,
                        full_name: fullName || invitation.email.split('@')[0],
                        role: 'staff',
                        role_id: invitation.role,
                        store_id: invitation.store_id,
                        status: 'active',
                        is_active: true
                    });

                if (profileError) console.error('Profile creation error:', profileError);

                // Update invitation status
                await supabase
                    .from('team_invitations' as any)
                    .update({ status: 'accepted' })
                    .eq('token', token);

                addToast('¡Cuenta creada exitosamente! Redirigiendo...', 'success');

                // Redirect
                setTimeout(() => {
                    navigate('/dashboard');
                }, 1500);
            } else {
                // User created but needs email confirmation
                addToast('Cuenta creada. Por favor revisa tu email para confirmar o intenta iniciar sesión.', 'warning');

                // Mark invitation as accepted anyway
                await supabase
                    .from('team_invitations' as any)
                    .update({ status: 'accepted' })
                    .eq('token', token);

                setTimeout(() => {
                    navigate('/login');
                }, 2000);
            }

        } catch (e: any) {
            console.error('Registration error:', e);

            // If error is about email confirmation, it's actually a "success" - user needs to confirm
            if (e.message?.includes('confirm') || e.message?.includes('email')) {
                addToast('Revisa tu correo para confirmar tu cuenta', 'warning');

                // Mark invitation as accepted
                await supabase
                    .from('team_invitations' as any)
                    .update({ status: 'accepted' })
                    .eq('token', token);

                setTimeout(() => {
                    navigate('/login');
                }, 2500);
            } else {
                addToast(e.message || 'Error al registrar', 'error');
            }
        } finally {
            setIsRegistering(false);
        }
    };

    if (loading) return (
        <div className="min-h-screen bg-black flex items-center justify-center text-white font-bold tracking-widest animate-pulse">
            VERIFICANDO ACCESO...
        </div>
    );

    if (!invitation) return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 text-center p-6">
            <span className="material-symbols-outlined text-4xl text-red-500">error_outline</span>
            <p className="text-red-500 font-bold uppercase tracking-widest">Invitación Inválida o Expirada</p>
            <button onClick={() => navigate('/')} className="text-white underline text-xs uppercase tracking-widest">Volver al Inicio</button>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#0D0F0D] flex items-center justify-center p-6 animate-in fade-in duration-700">
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1497294815431-9365093b7331?auto=format&fit=crop&q=80')] bg-cover opacity-20 mix-blend-overlay"></div>
            <div className="absolute inset-0 bg-gradient-to-t from-[#0D0F0D] via-[#0D0F0D]/90 to-transparent"></div>

            <div className="relative max-w-md w-full bg-[#111311] border border-white/10 rounded-3xl p-8 text-center space-y-6 shadow-2xl backdrop-blur-xl">
                <div className="size-16 mx-auto bg-neon/10 rounded-2xl flex items-center justify-center text-neon border border-neon/20 shadow-neon-soft">
                    <span className="material-symbols-outlined text-3xl">storefront</span>
                </div>

                <div className="space-y-2">
                    <h1 className="text-2xl font-black italic uppercase tracking-tighter text-white">
                        {showRegister ? 'Crear Tu Cuenta' : 'Únete al Equipo'}
                    </h1>
                    <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">Te han invitado a colaborar en</p>
                        <p className="text-lg font-black text-neon uppercase tracking-tighter leading-none">{storeName}</p>
                    </div>
                </div>

                <div className="bg-white/[0.03] rounded-2xl p-4 border border-white/5 space-y-1">
                    <p className="text-[9px] text-white/40 uppercase font-black tracking-[0.2em]">Rol Asignado</p>
                    <p className="text-xl font-black text-white uppercase italic tracking-tight">{roleName}</p>
                </div>

                {!showRegister ? (
                    <div className="pt-2 space-y-4">
                        <p className="text-[10px] text-white/40 font-medium px-4 leading-relaxed">
                            Al continuar, crearás tu cuenta para acceder al panel de operaciones.
                        </p>
                        <button
                            onClick={() => setShowRegister(true)}
                            className="w-full py-4 rounded-xl bg-neon text-black font-black text-[11px] uppercase tracking-[0.2em] hover:scale-[1.02] active:scale-95 transition-all shadow-neon-soft flex items-center justify-center gap-2 group"
                        >
                            Continuar
                            <span className="material-symbols-outlined text-base group-hover:translate-x-1 transition-transform">arrow_forward</span>
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4 text-left">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-white/30 tracking-widest ml-2">Email (fijo)</label>
                            <div className="w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white/50 text-xs font-bold flex items-center">
                                {invitation.email}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-white/30 tracking-widest ml-2">Nombre Completo</label>
                            <input
                                type="text"
                                value={fullName}
                                onChange={e => setFullName(e.target.value)}
                                placeholder="Tu nombre"
                                className="w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold outline-none focus:border-neon/40 transition-colors"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-white/30 tracking-widest ml-2">Contraseña</label>
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Mínimo 6 caracteres"
                                className="w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold outline-none focus:border-neon/40 transition-colors"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-white/30 tracking-widest ml-2">Confirmar Contraseña</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                placeholder="Repetir contraseña"
                                className="w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold outline-none focus:border-neon/40 transition-colors"
                            />
                        </div>

                        <div className="pt-4 flex gap-3">
                            <button
                                onClick={() => setShowRegister(false)}
                                className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-all"
                            >
                                Atrás
                            </button>
                            <button
                                onClick={handleRegister}
                                disabled={isRegistering}
                                className="flex-[2] py-3 rounded-xl bg-neon text-black font-black text-[11px] uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-neon-soft disabled:opacity-50"
                            >
                                {isRegistering ? 'Creando cuenta...' : 'Crear Cuenta'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default JoinTeam;
