import React, { useEffect, useState } from 'react';
import { ExtendedStore } from '../pages/SaaSAdmin';
import { useMercadoPagoConnect } from '../hooks/useMercadoPagoConnect';

export const PaymentSettings: React.FC<{ selectedStore: ExtendedStore }> = ({ selectedStore }) => {
    const { connect, disconnect, status, isLoading, handleCallback } = useMercadoPagoConnect(selectedStore.id);
    const [showToken, setShowToken] = useState(false);
    const [showClientId, setShowClientId] = useState(false);
    const [sandboxMode, setSandboxMode] = useState(false);

    // Handle OAuth Callback
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');

        if (code && state === selectedStore.id) {
            window.history.replaceState({}, document.title, window.location.pathname);
            handleCallback(code).then((res) => {
                if (res.success) alert('¡Tienda vinculada con éxito!');
                else alert('Error al vincular: ' + res.error);
            });
        }
    }, []);

    // Helper to mask credentials
    const maskString = (str: string | null | undefined, visible: boolean) => {
        if (!str) return '••••••••••••••••••••••••••••••';
        if (visible) return str;
        return '•'.repeat(Math.min(str.length, 30));
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* MAIN PANEL (2/3) */}
            <div className="lg:col-span-2 p-8 rounded-[2.5rem] bg-black border border-zinc-800 shadow-2xl relative overflow-hidden">
                {/* Background Decoration */}
                <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none">
                    <span className="material-symbols-outlined text-9xl text-white">account_balance_wallet</span>
                </div>

                {/* Header */}
                <div className="flex items-center gap-4 mb-10 border-b border-zinc-800 pb-6 relative z-10">
                    <span className="material-symbols-outlined text-[#009EE3] text-2xl">account_balance_wallet</span>
                    <h4 className="text-sm font-black text-white italic uppercase tracking-[0.2em]">Integración de Cobros</h4>
                </div>

                {/* CONNECTION CARD */}
                {isLoading ? (
                    <div className="p-10 border border-zinc-800 rounded-3xl bg-zinc-900/30 flex flex-col items-center justify-center gap-4 min-h-[200px]">
                        <div className="size-8 border-2 border-[#009EE3] border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-[10px] font-black w-full text-center text-zinc-500 uppercase tracking-widest animate-pulse">Conectando...</p>
                    </div>
                ) : status?.is_connected ? (
                    <div className="space-y-8 relative z-10">
                        {/* ACTIVE STATE */}
                        <div className="bg-[#009EE3]/5 border border-[#009EE3]/20 p-8 rounded-3xl relative overflow-hidden group hover:border-[#009EE3]/40 transition-colors">
                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                                <div className="flex items-center gap-6">
                                    <div className="size-20 rounded-2xl bg-[#009EE3] flex items-center justify-center shadow-[0_0_30px_rgba(0,158,227,0.3)] shrink-0">
                                        <span className="font-black text-white text-2xl italic tracking-tighter">MP</span>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-2xl font-black text-white italic uppercase tracking-tight">Mercado Pago</h3>
                                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-black text-emerald-500 uppercase tracking-widest">Activo</span>
                                        </div>
                                        {/* CUENTA CONECTADA - NUEVO */}
                                        {status.mp_nickname && (
                                            <div className="flex items-center gap-2 bg-zinc-800/50 px-3 py-2 rounded-lg w-fit">
                                                <span className="material-symbols-outlined text-sm text-[#009EE3]">account_circle</span>
                                                <span className="text-xs font-bold text-white">{status.mp_nickname}</span>
                                                {status.mp_email && (
                                                    <span className="text-[10px] text-zinc-400">({status.mp_email})</span>
                                                )}
                                            </div>
                                        )}
                                        <p className="text-[10px] text-zinc-400 font-medium max-w-sm leading-relaxed">
                                            Pasarela principal para pagos QR en mesa y ventas online.
                                            Sincronización automática con el centro de finanzas.
                                        </p>
                                        <div className="flex items-center gap-2 pt-1">
                                            <div className="size-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_#34D399]"></div>
                                            <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Webhooks en línea (Canal Seguro)</span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={disconnect}
                                    className="px-6 py-3 rounded-xl border border-zinc-700 hover:border-red-500/50 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap"
                                >
                                    Desconectar
                                </button>
                            </div>
                        </div>

                        {/* CREDENTIALS */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Access Token */}
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest pl-1">App Access Token</label>
                                <div className="relative group">
                                    <input
                                        type={showToken ? "text" : "password"}
                                        value={status.mp_access_token || ''} // Using data from query if available, typically hidden securely but requested to show
                                        readOnly
                                        disabled
                                        className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-4 text-xs font-mono text-zinc-300 focus:outline-none group-hover:border-zinc-700 transition-colors"
                                    />
                                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 gap-2">
                                        <button
                                            onClick={() => setShowToken(!showToken)}
                                            className="p-2 hover:bg-white/5 rounded-lg text-zinc-500 hover:text-white transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-lg">{showToken ? 'visibility_off' : 'visibility'}</span>
                                        </button>
                                        <button
                                            className="p-2 hover:bg-white/5 rounded-lg text-zinc-500 hover:text-white transition-colors"
                                            onClick={() => navigator.clipboard.writeText(status.mp_access_token || '')}
                                        >
                                            <span className="material-symbols-outlined text-lg">content_copy</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Client ID */}
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest pl-1">Public Client ID</label>
                                <div className="relative group">
                                    <input
                                        type={showClientId ? "text" : "password"}
                                        value={status.mp_public_key || ''}
                                        readOnly
                                        disabled
                                        className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-4 text-xs font-mono text-zinc-300 focus:outline-none group-hover:border-zinc-700 transition-colors"
                                    />
                                    <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                                        <button
                                            onClick={() => setShowClientId(!showClientId)}
                                            className="p-2 hover:bg-white/5 rounded-lg text-zinc-500 hover:text-white transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-lg">{showClientId ? 'visibility_off' : 'visibility'}</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* SANDBOX TOGGLE */}
                        <div className="p-6 rounded-2xl bg-[#F59E0B]/5 border border-[#F59E0B]/20 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="size-10 rounded-lg bg-[#F59E0B]/10 flex items-center justify-center border border-[#F59E0B]/20">
                                    <span className="material-symbols-outlined text-[#F59E0B]">developer_mode</span>
                                </div>
                                <div>
                                    <h4 className="text-xs font-black text-[#F59E0B] uppercase tracking-wider">Entorno de Pruebas (Sandbox)</h4>
                                    <p className="text-[9px] text-[#F59E0B]/60 font-medium mt-1">Habilita esta opción para realizar testeos de flujos sin afectar la caja real del nodo.</p>
                                </div>
                            </div>
                            <div
                                onClick={() => setSandboxMode(!sandboxMode)}
                                className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors duration-300 ${sandboxMode ? 'bg-[#F59E0B]' : 'bg-zinc-800'}`}
                            >
                                <div className={`size-4 rounded-full bg-white shadow-sm transition-transform duration-300 ${sandboxMode ? 'translate-x-6' : 'translate-x-0'}`}></div>
                            </div>
                        </div>

                    </div>
                ) : (
                    // DISCONNECTED STATE
                    <div className="p-8 rounded-3xl bg-zinc-900/30 border border-zinc-800 flex flex-col items-center text-center gap-6 relative overflow-hidden min-h-[400px] justify-center">
                        <div className="size-24 rounded-3xl bg-[#009EE3]/10 flex items-center justify-center border border-[#009EE3]/20 shadow-[0_0_40px_rgba(0,158,227,0.1)] mb-4">
                            <span className="material-symbols-outlined text-5xl text-[#009EE3]">link_off</span>
                        </div>
                        <div className="space-y-3 max-w-md relative z-10">
                            <h3 className="text-2xl font-black text-white uppercase italic tracking-tight">No Conectado</h3>
                            <p className="text-xs text-zinc-500 leading-relaxed font-medium">
                                Conecta tu cuenta de Mercado Pago para habilitar pagos QR y online. Los fondos se acreditarán instantáneamente.
                            </p>
                        </div>
                        <button
                            onClick={connect}
                            className="px-10 py-5 bg-[#009EE3] text-white rounded-xl font-black text-xs uppercase tracking-[0.2em] shadow-[0_0_30px_rgba(0,158,227,0.3)] hover:scale-105 hover:shadow-[0_0_50px_rgba(0,158,227,0.5)] active:scale-95 transition-all flex items-center gap-3 mt-4"
                        >
                            <span className="material-symbols-outlined">account_balance_wallet</span>
                            Vincular Cuenta
                        </button>
                    </div>
                )}
            </div>

            {/* SYSTEM STATUS PANEL (1/3) */}
            <div className="p-8 rounded-[2.5rem] bg-black border border-zinc-800 shadow-2xl flex flex-col relative overflow-hidden min-h-[500px]">
                {/* Header */}
                <div className="flex items-center gap-3 border-b border-zinc-800 pb-6 mb-8">
                    <div className="p-2 rounded-lg bg-emerald-500/10">
                        <span className="material-symbols-outlined text-emerald-500 text-lg">activity_zone</span>
                    </div>
                    <span className="text-xs font-black text-white uppercase tracking-[0.2em]">Estado del Sistema</span>
                </div>

                <div className="flex-1 space-y-8">
                    {/* Status Check */}
                    <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 flex items-center justify-between group hover:border-zinc-700 transition-colors">
                        <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Servidores Operativos</span>
                        <div className="size-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_#10B981]"></div>
                    </div>

                    {/* Sync Info */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[9px] font-black text-zinc-600 uppercase tracking-widest">
                            <span className="material-symbols-outlined text-sm">sync</span>
                            Última Sincronización
                        </div>
                        <h2 className="text-xl font-black text-white italic">
                            Hace 2 minutos
                            <span className="text-emerald-500 block text-xs mt-1 not-italic font-bold">(Nodo Alpha)</span>
                        </h2>
                    </div>

                    {/* Latency */}
                    <div className="p-6 rounded-2xl bg-zinc-900/30 border border-zinc-800 space-y-4">
                        <div className="flex justify-between items-end">
                            <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-wider">Nivel de Latencia</span>
                            <span className="text-[9px] font-black text-emerald-500 uppercase">12ms - Excellent</span>
                        </div>
                        <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                            <div className="h-full w-[85%] bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] rounded-full"></div>
                        </div>
                    </div>
                </div>

                {/* Footer Action */}
                <div className="mt-8 pt-8 border-t border-zinc-800">
                    <button className="w-full py-5 bg-white text-black rounded-2xl font-black text-[10px] uppercase tracking-[0.25em] shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 group">
                        <span className="material-symbols-outlined text-lg group-hover:rotate-180 transition-transform duration-500">settings_backup_restore</span>
                        Actualizar Configuración
                    </button>
                    <p className="text-[8px] text-zinc-700 font-black uppercase tracking-widest text-center mt-4 opacity-50">Restaurar valores por defecto</p>
                </div>
            </div>
        </div>
    );
};
