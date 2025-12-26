
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastSystem';
import { useAuth } from '../contexts/AuthContext';

interface LoginProps {
  onLogin?: (user: any, type: any) => void;
}

type AuthView = 'login' | 'recover' | 'reset' | 'success' | 'error';

const Login: React.FC<LoginProps> = () => {
  const { addToast } = useToast();
  const { isRecovery } = useAuth();
  const [view, setView] = useState<AuthView>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [recoverEmail, setRecoverEmail] = useState('');
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  useEffect(() => {
    // Si el contexto detecta recuperación, forzamos la vista de reset/activación
    if (isRecovery) {
      setView('reset');
      return;
    }

    const checkUrl = () => {
      const hash = window.location.hash || '';
      const params = new URLSearchParams(window.location.search || hash.replace('#', '?').replace('/', ''));

      const error = params.get('error');
      const errorCode = params.get('error_code');
      const errorDesc = params.get('error_description');

      if (error || errorCode === 'otp_expired') {
        setErrorDetails(errorDesc || 'El enlace ha expirado o no es válido.');
        setView('error');
        return;
      }

      if (hash.includes('access_token=') || hash.includes('type=recovery') || params.get('type') === 'recovery') {
        setView('reset');
      }
    };

    checkUrl();
    window.addEventListener('hashchange', checkUrl);
    return () => window.removeEventListener('hashchange', checkUrl);
  }, [isRecovery]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      addToast('Faltan Datos', 'error', 'Ingresa email y contraseña');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;
      window.location.reload();
    } catch (error: any) {
      addToast('Error', 'error', error.message);
      setIsLoading(false);
    }
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmail = recoverEmail || email;
    if (!targetEmail) {
      addToast('Error', 'error', 'Ingresa tu email');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail.trim(), {
        redirectTo: window.location.origin + window.location.pathname,
      });
      if (error) throw error;
      setView('success');
    } catch (error: any) {
      addToast('Error', 'error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      addToast('Error', 'error', 'Mínimo 6 caracteres');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      addToast('Activación Exitosa', 'success', 'Cuenta configurada. Redirigiendo...');
      setTimeout(() => {
        window.history.replaceState(null, '', window.location.pathname);
        window.location.hash = '';
        window.location.reload();
      }, 1500);
    } catch (error: any) {
      addToast('Error', 'error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050605] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
      <div className="absolute top-[-10%] left-[-10%] size-[600px] bg-primary/10 rounded-full blur-[140px] pointer-events-none"></div>

      <div className="z-10 w-full max-w-[420px] space-y-8 animate-in fade-in zoom-in-95 duration-500">
        <div className="text-center group">
          <div className="inline-flex items-center justify-center size-12 rounded-2xl bg-white/5 border border-white/10 text-neon mb-4 group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined">shield_lock</span>
          </div>
          <h1 className="text-4xl italic font-black tracking-tighter text-white uppercase leading-none">
            SQUAD<span className="text-neon">ACCESS</span>
          </h1>
        </div>

        <div className="bg-[#0A0C0A] border border-white/5 rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden ring-1 ring-white/5">

          {view === 'error' && (
            <div className="text-center space-y-6 py-4 animate-in fade-in">
              <div className="size-16 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-3xl">error</span>
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black italic text-white uppercase">ENLACE VENCIDO</h3>
                <p className="text-[10px] font-bold text-white/40 uppercase leading-relaxed px-4">
                  {errorDetails || 'El enlace de acceso ya no es válido o fue utilizado.'}
                </p>
              </div>
              <div className="space-y-3">
                <button onClick={() => setView('recover')} className="w-full h-14 bg-white text-black rounded-2xl font-black text-[11px] uppercase tracking-widest hover:scale-105 transition-all">Solicitar Nuevo Enlace</button>
                <button onClick={() => { window.location.hash = ''; setView('login'); }} className="w-full h-12 text-white/30 text-[9px] font-black uppercase tracking-widest hover:text-white transition-colors">Volver al Login</button>
              </div>
            </div>
          )}

          {view === 'reset' && (
            <form onSubmit={handleUpdatePassword} className="space-y-6">
              <div className="space-y-1">
                <h2 className="text-2xl font-black italic text-white uppercase leading-tight">Activar<br /><span className="text-neon">Cuenta Nueva</span></h2>
                <p className="text-[9px] font-bold text-white/30 uppercase tracking-[0.2em] animate-pulse">Autenticación de Nodo Validada</p>
              </div>
              <div className="bg-neon/10 border border-neon/20 p-5 rounded-2xl">
                <p className="text-[10px] text-neon font-bold leading-relaxed uppercase">Bienvenido a la red SQUAD. Definí tu contraseña maestra para tomar control operativo del local.</p>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-white/30 ml-2">Definir Contraseña</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-5 text-white text-[13px] font-bold outline-none focus:border-neon transition-all shadow-inner" placeholder="Mínimo 6 caracteres" required />
              </div>
              <button type="submit" disabled={isLoading} className="w-full h-14 bg-neon text-black rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-neon-glow hover:scale-[1.02] active:scale-95 transition-all">
                {isLoading ? 'CONFIGURANDO...' : 'FINALIZAR Y ENTRAR AL DASHBOARD'}
              </button>
            </form>
          )}

          {view === 'login' && (
            <form onSubmit={handleLogin} className="space-y-6">
              <h2 className="text-xl font-black italic text-white uppercase">Validar Sistema</h2>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-white/30 ml-2">Identidad</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-5 text-white text-[11px] font-bold outline-none focus:border-neon transition-all" placeholder="usuario@email.com" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-white/30 ml-2">Código Secreto</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-5 text-white text-[11px] font-bold outline-none focus:border-neon transition-all" placeholder="••••••••" />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button type="button" onClick={() => setView('recover')} className="text-[9px] font-black text-white/20 hover:text-white uppercase tracking-widest transition-colors">¿Problemas con el código?</button>
              </div>
              <button type="submit" disabled={isLoading} className="w-full h-14 bg-white text-black rounded-2xl font-black text-[11px] uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all">
                {isLoading ? 'VERIFICANDO...' : 'AUTENTICAR'}
              </button>
            </form>
          )}

          {view === 'recover' && (
            <form onSubmit={handleRecover} className="space-y-6 animate-in slide-in-from-left-4">
              <div className="flex items-center gap-4 mb-2">
                <button type="button" onClick={() => setView('login')} className="size-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white"><span className="material-symbols-outlined">arrow_back</span></button>
                <div className="space-y-0.5">
                  <h2 className="text-xl font-black italic text-white uppercase leading-none">Recuperar</h2>
                  <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Se enviará una nueva señal</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase text-white/30 ml-2">Email del Nodo</label>
                <input type="email" value={recoverEmail} onChange={(e) => setRecoverEmail(e.target.value)} className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-5 text-white text-xs font-bold focus:border-neon outline-none" placeholder="owner@email.com" required />
              </div>
              <button type="submit" disabled={isLoading} className="w-full h-14 bg-white/10 border border-white/10 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-white/20 transition-all">
                {isLoading ? 'PROCESANDO...' : 'SOLICITAR NUEVO LINK'}
              </button>
            </form>
          )}

          {view === 'success' && (
            <div className="text-center space-y-8 py-5 animate-in zoom-in-95">
              <div className="size-16 rounded-full bg-neon/10 border border-neon/20 text-neon flex items-center justify-center mx-auto shadow-neon-soft"><span className="material-symbols-outlined text-3xl">done_all</span></div>
              <div className="space-y-2">
                <h3 className="text-xl font-black italic text-white uppercase leading-none">SEÑAL EN CAMINO</h3>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-relaxed">Revisa tu bandeja de entrada.<br />El link caduca en 60 min.</p>
              </div>
              <button onClick={() => setView('login')} className="w-full h-14 bg-white/5 border border-white/10 text-white rounded-2xl font-black text-[11px] uppercase">VOLVER AL LOGIN</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
