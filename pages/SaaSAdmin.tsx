import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastSystem';
import { useAuth } from '../contexts/AuthContext';
import { Store } from '../types';
import { useMercadoPagoConnect } from '../hooks/useMercadoPagoConnect';
import { PaymentSettings } from '../components/PaymentSettings';
import { getAppUrl } from '../lib/urlUtils';
import payperLogo from '../src/assets/payper-logo.png';

type SaasTab = 'dashboard' | 'tenants' | 'users' | 'plans' | 'audit' | 'metrics' | 'incidents';

export interface ExtendedStore extends Omit<Store, 'is_active'> {
   is_active?: boolean;
}

const SaasAdmin: React.FC<{ initialTab?: SaasTab }> = ({ initialTab = 'dashboard' }) => {
   const activeTab = initialTab;
   const { addToast } = useToast();
   const { user } = useAuth();

   // REAL DATA ONLY - no more mocks
   const [stores, setStores] = useState<ExtendedStore[]>([]);
   const [isLoading, setIsLoading] = useState(true);
   const [showNewStoreModal, setShowNewStoreModal] = useState(false);
   const [selectedStore, setSelectedStore] = useState<ExtendedStore | null>(null);
   const [isSaving, setIsSaving] = useState(false);
   const [generatedLink, setGeneratedLink] = useState('');

   const [newStore, setNewStore] = useState({
      name: '',
      ownerEmail: '',
      ownerName: '',
      plan: 'FREE',
      address: '',
      taxInfo: ''
   });

   // Plan change modal
   const [showPlanModal, setShowPlanModal] = useState(false);
   const [planModalStore, setPlanModalStore] = useState<ExtendedStore | null>(null);

   // Metrics
   const [metrics, setMetrics] = useState({ totalStores: 0, totalUsers: 0, mrr: 0 });

   // Global users list
   const [globalUsers, setGlobalUsers] = useState<any[]>([]);

   const [configTab, setConfigTab] = useState<'negocio' | 'staff' | 'audit' | 'ai' | 'payment'>('negocio');

   // Incidents
   const [incidents, setIncidents] = useState<any[]>([]);
   const [incidentsLoading, setIncidentsLoading] = useState(false);
   const [incidentFilter, setIncidentFilter] = useState<'all' | 'new' | 'seen' | 'resolved' | 'ignored'>('all');
   const [expandedIncident, setExpandedIncident] = useState<string | null>(null);
   const [incidentNote, setIncidentNote] = useState('');

   const fetchData = useCallback(async () => {
      setIsLoading(true);
      try {
         // Fetch only active stores
         const { data: dbStores, error } = await supabase
            .from('stores')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

         if (error) {
            console.error("DB_FETCH_ERROR:", error.message, error);
            addToast('Error de Conexión', 'error', error.message);
         } else {
            setStores(dbStores || []);
         }

         // Fetch metrics
         const { count: storeCount } = await supabase
            .from('stores')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);

         const { count: userCount } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true });

         // Calculate MRR (PRO = $50/month, FREE = $0)
         const { data: proStores } = await supabase
            .from('stores')
            .select('id')
            .eq('is_active', true)
            .eq('plan', 'PRO');

         const mrr = (proStores?.length || 0) * 50;

         setMetrics({
            totalStores: storeCount || 0,
            totalUsers: userCount || 0,
            mrr
         });

         // Fetch all global users with their store info
         const { data: allProfiles, error: profilesError } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

         if (!profilesError && allProfiles) {
            // Get all stores to map store names
            const storeMap = new Map((dbStores || []).map((s) => [s.id, s]));

            const usersWithStores = allProfiles.map((p) => ({
               ...p,
               store_name: storeMap.get(p.store_id || '')?.name || null,
               store_slug: storeMap.get(p.store_id || '')?.slug || null
            }));
            setGlobalUsers(usersWithStores);
         }
      } catch (e: any) {
         console.error("FETCH_EXCEPTION:", e);
      } finally {
         setIsLoading(false);
      }
   }, [addToast]);

   const fetchIncidents = useCallback(async () => {
      setIncidentsLoading(true);
      try {
         const { data, error } = await supabase
            .from('app_error_reports')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200);

         if (error) {
            console.error('Error fetching incidents:', error);
         } else {
            // Enrich with store names from existing stores state
            const storeMap = new Map(stores.map(s => [s.id, s.name]));
            const enriched = (data || []).map((r: any) => ({
               ...r,
               store_name: r.store_id ? storeMap.get(r.store_id) || null : null
            }));
            setIncidents(enriched);
         }
      } catch (e) {
         console.error('Fetch incidents error:', e);
      } finally {
         setIncidentsLoading(false);
      }
   }, [stores]);

   useEffect(() => {
      fetchData();
      const timer = setTimeout(() => setIsLoading(false), 3000);
      return () => clearTimeout(timer);
   }, [fetchData, activeTab]);

   useEffect(() => {
      if (activeTab === 'incidents') {
         fetchIncidents();
      }
   }, [activeTab, fetchIncidents]);

   const handleGenerateAccessLink = async (email: string, storeId?: string, storeName?: string) => {
      if (!email) return;
      setIsSaving(true);
      setGeneratedLink('');
      try {
         const { data, error: fnError } = await supabase.functions.invoke('invite-owner', {
            body: { email: email.trim().toLowerCase(), action: 'generate-link', storeId, storeName }
         });

         if (data?.link) {
            setGeneratedLink(data.link);
            addToast('Link Generado', 'success', 'Copiá el acceso generado arriba');
         } else {
            const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
               redirectTo: getAppUrl() + '/login',
            });
            if (authError) throw authError;
            addToast('Email Enviado', 'success', 'Se envió un link de recuperación a ' + email);
         }
      } catch (error: any) {
         addToast('Error', 'error', 'Fallo al procesar acceso: ' + error.message);
      } finally {
         setIsSaving(false);
      }
   };

   const handleUpdateStore = async (storeId: string, updates: Partial<ExtendedStore>) => {
      if (storeId.startsWith('t-')) {
         setStores(prev => prev.map(s => s.id === storeId ? { ...s, ...updates } : s));
         addToast('Simulado', 'success', 'Cambio local aplicado al mock');
         return;
      }
      setIsSaving(true);
      try {
         const { error } = await supabase.from('stores').update(updates as any).eq('id', storeId);
         if (error) throw error;
         setStores(prev => prev.map(s => s.id === storeId ? { ...s, ...updates } : s));
         addToast('Éxito', 'success', 'Sincronizado con la red');
      } catch (error: any) {
         addToast('Error', 'error', error.message);
      } finally {
         setIsSaving(false);
      }
   };

   const handleDeleteStore = async (storeId: string) => {
      if (!confirm('¿DESACTIVAR NODO? El local quedará oculto pero los datos se preservarán.')) return;

      if (storeId.startsWith('t-')) {
         setStores(prev => prev.filter(s => s.id !== storeId));
         addToast('Removido', 'success', 'Mock ocultado del panel');
         return;
      }

      setIsSaving(true);
      try {
         const { error } = await supabase.from('stores').update({ is_active: false }).eq('id', storeId);
         if (error) throw error;
         setStores(prev => prev.filter(s => s.id !== storeId));
         addToast('Nodo Desactivado', 'success', 'El local ha sido ocultado de la red');
      } catch (error: any) {
         addToast('Fallo', 'error', error.message);
      } finally {
         setIsSaving(false);
      }
   };

   const handleCreateStore = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newStore.name || !newStore.ownerEmail) {
         addToast('Faltan Campos', 'error', 'Nombre y Email son obligatorios');
         return;
      }
      setIsSaving(true);
      setGeneratedLink('');
      try {
         const cleanEmail = newStore.ownerEmail.trim().toLowerCase();

         // Generate clean slug from name (NO random numbers)
         const baseSlug = newStore.name.toLowerCase().trim()
            .replace(/[áéíóúñü]/g, (c) => ({ 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ñ': 'n', 'ü': 'u' }[c] || c))
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '')
            .replace(/-+/g, '-') // Collapse multiple dashes
            .replace(/^-|-$/g, ''); // Remove leading/trailing dashes

         // Check if slug already exists
         let finalSlug = baseSlug;
         const { data: existingStores } = await supabase
            .from('stores')
            .select('slug')
            .ilike('slug', `${baseSlug}%`);

         if (existingStores && existingStores.length > 0) {
            const existingSlugs = new Set(existingStores.map((s) => s.slug));
            if (existingSlugs.has(baseSlug)) {
               // Find next available number
               let counter = 2;
               while (existingSlugs.has(`${baseSlug}-${counter}`)) {
                  counter++;
               }
               finalSlug = `${baseSlug}-${counter}`;
            }
         }

         const { data: store, error: storeError } = await supabase.from('stores').insert({
            name: newStore.name.trim(),
            slug: finalSlug,
            plan: newStore.plan,
            owner_email: cleanEmail,
            address: newStore.address.trim(),
            tax_info: newStore.taxInfo.trim(),
            onboarding_status: 'PENDING'
         }).select().single();

         if (storeError) throw storeError;

         // ALWAYS generate a manual fallback link first (includes store name for display)
         const fallbackLink = `${getAppUrl()}/#/setup-owner?store=${store.id}&email=${encodeURIComponent(cleanEmail)}&storeName=${encodeURIComponent(store.name)}&ownerName=${encodeURIComponent(newStore.ownerName.trim() || '')}`;

         // Try Edge Function for a proper magic link, but don't fail if it doesn't work
         try {
            const { data: fnData, error: fnError } = await supabase.functions.invoke('invite-owner', {
               body: {
                  email: cleanEmail,
                  storeId: store.id,
                  ownerName: newStore.ownerName.trim(),
                  storeName: store.name,
                  siteUrl: getAppUrl()
               }
            });

            if (fnData?.link) {
               setGeneratedLink(fnData.link);
               addToast('Nodo Lanzado', 'success', 'Link mágico generado - Copialo!');
            } else {
               setGeneratedLink(fallbackLink);
               addToast('Nodo Creado', 'success', 'Link de acceso generado.');
            }
         } catch (fnErr) {
            console.error('[Edge Function Error]:', fnErr);
            setGeneratedLink(fallbackLink);
            addToast('Nodo Creado', 'success', 'Link manual generado (Edge Function no disponible).');
         }

         setNewStore({ name: '', ownerEmail: '', ownerName: '', plan: 'FREE', address: '', taxInfo: '' });
         fetchData();

      } catch (error: any) {
         addToast('Error Crítico', 'error', error.message);
      } finally {
         setIsSaving(false);
      }
   };

   // Impersonation: Switch to a store's dashboard
   const handleImpersonate = (store: ExtendedStore) => {
      localStorage.setItem('impersonated_store_id', store.id);
      localStorage.setItem('impersonated_store_name', store.name || '');
      addToast('Accediendo a ' + store.name, 'success', 'Modo impersonación activado');
      // Navigate to main dashboard (the app will read the impersonated store)
      window.location.href = '/';
   };

   // Plan change
   const handlePlanChange = async (plan: string) => {
      if (!planModalStore) return;
      setIsSaving(true);
      try {
         const { error } = await supabase.from('stores').update({ plan }).eq('id', planModalStore.id);
         if (error) throw error;
         setStores(prev => prev.map(s => s.id === planModalStore.id ? { ...s, plan } : s));
         setShowPlanModal(false);
         setPlanModalStore(null);
         addToast('Plan Actualizado', 'success', 'El plan cambió a ' + plan);
         fetchData(); // Refresh metrics
      } catch (error: any) {
         addToast('Error', 'error', error.message);
      } finally {
         setIsSaving(false);
      }
   };

   const updateIncidentStatus = async (id: string, status: string) => {
      const { error } = await supabase
         .from('app_error_reports')
         .update({ status })
         .eq('id', id);
      if (error) {
         addToast('Error', 'error', error.message);
      } else {
         setIncidents(prev => prev.map(i => i.id === id ? { ...i, status } : i));
         addToast('Actualizado', 'success', `Estado cambiado a ${status}`);
      }
   };

   const saveIncidentNote = async (id: string) => {
      const { error } = await supabase
         .from('app_error_reports')
         .update({ notes: incidentNote })
         .eq('id', id);
      if (error) {
         addToast('Error', 'error', error.message);
      } else {
         setIncidents(prev => prev.map(i => i.id === id ? { ...i, notes: incidentNote } : i));
         addToast('Nota guardada', 'success');
         setIncidentNote('');
      }
   };

   const filteredIncidents = incidentFilter === 'all'
      ? incidents
      : incidents.filter(i => i.status === incidentFilter);

   const newIncidentCount = incidents.filter(i => i.status === 'new').length;
   const last24h = incidents.filter(i => {
      const created = new Date(i.created_at);
      return Date.now() - created.getTime() < 86400000;
   }).length;

   if (isLoading) {
      return (
         <div className="w-full h-full flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-4 border-accent/20 border-t-accent rounded-full animate-spin"></div>
            <p className="text-[10px] uppercase font-black tracking-widest text-white/30 animate-pulse">Sincronizando Base SQUAD...</p>
         </div>
      );
   }

   return (
      <div className="p-8 max-w-7xl mx-auto space-y-8 font-display pb-32">
         {/* LOGO HEADER */}
         <div className="flex items-center justify-between">
            <img src={payperLogo} alt="Payper" className="h-10" />
            <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Admin Panel</span>
         </div>

         {/* HEADER METRICS */}
         <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="col-span-1 p-6 rounded-3xl bg-white/[0.02] border border-white/5 flex flex-col gap-2">
               <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Estado Sistema</span>
               <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10B981]"></div>
                  <span className="text-lg font-black text-white italic tracking-tighter">ONLINE</span>
               </div>
            </div>
            <div className="col-span-1 p-6 rounded-3xl bg-white/[0.02] border border-white/5 flex flex-col gap-1">
               <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Locales Activos</span>
               <span className="text-4xl font-black text-white tracking-tighter tabular-nums">{metrics.totalStores}</span>
            </div>
            <div className="col-span-1 p-6 rounded-3xl bg-white/[0.02] border border-white/5 flex flex-col gap-1">
               <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Usuarios Totales</span>
               <span className="text-4xl font-black text-white tracking-tighter tabular-nums">{metrics.totalUsers}</span>
            </div>
            <div className="col-span-1 p-6 rounded-3xl bg-gradient-to-br from-accent/10 to-transparent border border-accent/20 flex flex-col gap-1 relative overflow-hidden">
               <div className="absolute top-0 right-0 w-24 h-24 bg-accent/10 blur-3xl -mr-12 -mt-12"></div>
               <span className="text-[10px] font-black text-accent uppercase tracking-widest">MRR Estimado</span>
               <span className="text-4xl font-black text-white tracking-tighter tabular-nums">${metrics.mrr}</span>
            </div>
         </div>

         {/* MAIN CONTENT */}
         {activeTab === 'dashboard' && (
            <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
               <div className="flex items-center justify-between">
                  <div>
                     <h2 className="text-3xl font-black italic text-white uppercase tracking-tighter">Command Center</h2>
                     <p className="text-sm text-zinc-500 font-medium mt-1">Visión global del ecosistema Payper.</p>
                  </div>
                  <button onClick={() => fetchData()} className="p-2 hover:bg-white/5 rounded-full text-zinc-500 hover:text-white transition-colors">
                     <span className="material-symbols-outlined">refresh</span>
                  </button>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Col 1: Quick Actions */}
                  <div className="p-6 rounded-3xl bg-[#0A0C0A] border border-white/5 space-y-4">
                     <h3 className="text-xs font-black text-white/40 uppercase tracking-widest">Acciones Rápidas</h3>
                     <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => setShowNewStoreModal(true)} className="p-4 rounded-xl bg-accent/10 border border-accent/20 hover:bg-accent/20 transition-all text-left group">
                           <span className="material-symbols-outlined text-2xl text-accent mb-2 group-hover:scale-110 transition-transform">add_business</span>
                           <div className="text-xs font-black text-white uppercase">Nuevo Local</div>
                        </button>
                        <button onClick={() => { document.getElementById('roles-tab')?.click() }} className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-left group">
                           <span className="material-symbols-outlined text-2xl text-purple-400 mb-2 group-hover:scale-110 transition-transform">group_add</span>
                           <div className="text-xs font-black text-white uppercase">Gestionar Usuarios</div>
                        </button>
                     </div>
                  </div>

                  {/* Col 2: Recent Activity / Status */}
                  <div className="p-6 rounded-3xl bg-[#0A0C0A] border border-white/5 space-y-4">
                     <h3 className="text-xs font-black text-white/40 uppercase tracking-widest">Actividad Reciente</h3>
                     <div className="space-y-3">
                        {(globalUsers.length > 0 ? globalUsers : []).slice(0, 3).map(u => (
                           <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02]">
                              <div className="size-8 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">
                                 {u.email?.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                 <div className="text-xs font-bold text-white">Usuario Registrado</div>
                                 <div className="text-[10px] text-zinc-500">{u.email}</div>
                              </div>
                              <div className="ml-auto text-[10px] text-zinc-600">
                                 {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'Hoy'}
                              </div>
                           </div>
                        ))}
                        {globalUsers.length === 0 && (
                           <div className="text-center text-zinc-600 text-[10px] py-4">Sin actividad reciente</div>
                        )}
                     </div>
                  </div>
               </div>
            </div>
         )}
         {activeTab === 'tenants' && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
               <div className="flex items-center justify-between">
                  <div>
                     <h2 className="text-2xl font-black italic text-white uppercase tracking-tighter">Locales / Tenants</h2>
                     <p className="text-xs text-zinc-500 font-medium mt-1">Gestión centralizada de instancias.</p>
                  </div>
                  <button
                     onClick={() => setShowNewStoreModal(true)}
                     className="px-6 py-3 bg-accent text-black font-black uppercase text-xs tracking-widest rounded-xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-accent/20 flex items-center gap-2"
                  >
                     <span className="material-symbols-outlined text-lg">add_business</span>
                     Nuevo Local
                  </button>
               </div>

               {/* GENERATED LINK DISPLAY - ARRIBA */}
               {generatedLink && (
                  <div className="p-4 rounded-xl bg-accent/5 border border-accent/30">
                     <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 space-y-2">
                           <p className="text-[9px] font-bold text-accent uppercase tracking-wider flex items-center gap-1">
                              <span className="material-symbols-outlined text-sm">verified_user</span>
                              Link de Acceso Generado
                           </p>
                           <div className="p-3 bg-black/80 rounded-lg border border-white/10 font-mono text-[10px] text-white/90 break-all">
                              {generatedLink}
                           </div>
                        </div>
                        <div className="flex flex-col gap-2">
                           <button
                              onClick={() => { navigator.clipboard.writeText(generatedLink); addToast('Copiado', 'success'); }}
                              className="px-4 py-2 bg-accent text-black font-bold text-[9px] uppercase rounded-lg hover:scale-105 transition-all"
                           >
                              COPIAR
                           </button>
                           <button onClick={() => setGeneratedLink('')} className="text-[8px] text-white/30 font-bold uppercase hover:text-white transition-all text-center">Cerrar</button>
                        </div>
                     </div>
                  </div>
               )}

               <div className="rounded-3xl border border-white/5 overflow-hidden bg-[#0A0C0A]">
                  <table className="w-full text-left">
                     <thead>
                        <tr className="border-b border-white/5 bg-white/[0.02]">
                           <th className="p-4 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Local</th>
                           <th className="p-4 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Email Dueño</th>
                           <th className="p-4 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Creado</th>
                           <th className="p-4 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Estado</th>
                           <th className="p-4 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Plan</th>
                           <th className="p-4 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500 text-right">Acciones</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-white/5">
                        {stores.map(store => (
                           <tr key={store.id} className="hover:bg-white/[0.02] transition-colors group">
                              <td className="p-4">
                                 <div className="flex items-center gap-3">
                                    <div className="size-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center font-black italic text-sm">
                                       {store.name?.charAt(0)?.toUpperCase() || '?'}
                                    </div>
                                    <div>
                                       <div className="font-bold text-white text-sm">{store.name}</div>
                                       <div className="text-[9px] text-zinc-600 font-mono">{store.slug}</div>
                                    </div>
                                 </div>
                              </td>
                              <td className="p-4">
                                 <div className="text-xs text-white/70 font-medium">{store.owner_email || '—'}</div>
                              </td>
                              <td className="p-4">
                                 <div className="text-[10px] text-zinc-500">
                                    {store.created_at ? new Date(store.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                 </div>
                              </td>
                              <td className="p-4">
                                 <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${store.onboarding_status === 'COMPLETED'
                                    ? 'bg-neon/10 text-neon border border-neon/20'
                                    : store.onboarding_status === 'PENDING'
                                       ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                       : 'bg-white/5 text-zinc-500 border border-white/10'
                                    }`}>
                                    <div className={`size-1.5 rounded-full ${store.onboarding_status === 'COMPLETED' ? 'bg-neon animate-pulse' :
                                       store.onboarding_status === 'PENDING' ? 'bg-amber-500' : 'bg-zinc-500'
                                       }`}></div>
                                    {store.onboarding_status === 'COMPLETED' ? 'Activo' :
                                       store.onboarding_status === 'PENDING' ? 'Pendiente' : 'Setup'}
                                 </span>
                              </td>
                              <td className="p-4">
                                 <button
                                    onClick={() => { setPlanModalStore(store); setShowPlanModal(true); }}
                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider border transition-all hover:scale-105 ${store.plan === 'PRO' ? 'text-accent border-accent/30 hover:bg-accent/10' :
                                       store.plan === 'VIP' ? 'text-purple-400 border-purple-400/30 hover:bg-purple-400/10' :
                                          'text-zinc-500 border-zinc-500/30 hover:bg-white/5'
                                       }`}
                                 >
                                    {store.plan || 'FREE'}
                                 </button>
                              </td>
                              <td className="p-4 text-right">
                                 <div className="flex items-center justify-end gap-1.5">
                                    <button
                                       onClick={() => setSelectedStore(store)}
                                       title="Configurar Local"
                                       className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white transition-all"
                                    >
                                       <span className="material-symbols-outlined text-sm">settings</span>
                                    </button>
                                    <button
                                       onClick={() => handleGenerateAccessLink(store.owner_email || '', store.id, store.name)}
                                       title="Generar Link de Acceso"
                                       className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-zinc-400 hover:bg-accent hover:text-black transition-all"
                                    >
                                       <span className="material-symbols-outlined text-sm">key</span>
                                    </button>
                                    <button
                                       onClick={() => handleImpersonate(store)}
                                       title="Impersonar (Entrar como dueño)"
                                       className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-zinc-400 hover:bg-neon hover:text-black transition-all"
                                    >
                                       <span className="material-symbols-outlined text-sm">login</span>
                                    </button>
                                    <button
                                       onClick={() => handleDeleteStore(store.id)}
                                       title="Desactivar Local"
                                       className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-zinc-400 hover:bg-red-500/20 hover:text-red-500 transition-all"
                                    >
                                       <span className="material-symbols-outlined text-sm">delete</span>
                                    </button>
                                 </div>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
                  {stores.length === 0 && (
                     <div className="p-12 text-center text-zinc-600 text-xs uppercase tracking-widest font-bold">
                        No se encontraron locales
                     </div>
                  )}
               </div>
            </div>
         )}

         {/* GLOBAL USERS SECTION */}
         {activeTab === 'users' && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
               <div className="flex items-center justify-between">
                  <div>
                     <h2 className="text-2xl font-black italic text-white uppercase tracking-tighter">Usuarios Globales</h2>
                     <p className="text-xs text-zinc-500 font-medium mt-1">Todos los registros de la plataforma con sus locales asociados.</p>
                  </div>
                  <div className="flex items-center gap-3">
                     <div className="px-4 py-2 bg-white/5 rounded-xl text-[10px] font-black text-white/60 uppercase tracking-widest">
                        {globalUsers.length} Usuarios
                     </div>
                  </div>
               </div>

               <div className="rounded-3xl border border-white/5 overflow-hidden bg-[#0A0C0A]">
                  <table className="w-full text-left">
                     <thead>
                        <tr className="border-b border-white/5 bg-white/[0.02]">
                           <th className="p-4 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Usuario</th>
                           <th className="p-4 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Email</th>
                           <th className="p-4 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Local</th>
                           <th className="p-4 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Rol</th>
                           <th className="p-4 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Registrado</th>
                           <th className="p-4 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Estado</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-white/5">
                        {globalUsers.map(user => (
                           <tr key={user.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="p-4">
                                 <div className="flex items-center gap-3">
                                    <div className="size-9 rounded-xl bg-neon/10 text-neon flex items-center justify-center font-black italic text-xs">
                                       {user.full_name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || '?'}
                                    </div>
                                    <span className="text-sm font-bold text-white">{user.full_name || 'Sin Nombre'}</span>
                                 </div>
                              </td>
                              <td className="p-4">
                                 <span className="text-xs text-white/70 font-medium">{user.email}</span>
                              </td>
                              <td className="p-4">
                                 {user.store_name ? (
                                    <div className="flex items-center gap-2">
                                       <span className="px-2.5 py-1 rounded-lg bg-accent/10 text-accent text-[10px] font-black uppercase">
                                          {user.store_name}
                                       </span>
                                    </div>
                                 ) : (
                                    <span className="text-[10px] text-zinc-600 italic">Sin Local</span>
                                 )}
                              </td>
                              <td className="p-4">
                                 <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider ${user.role === 'super_admin' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                                    user.role === 'store_owner' ? 'bg-accent/10 text-accent border border-accent/20' :
                                       'bg-white/5 text-zinc-500 border border-white/10'
                                    }`}>
                                    {user.role === 'super_admin' ? 'Super Admin' :
                                       user.role === 'store_owner' ? 'Dueño' :
                                          user.role || 'Staff'}
                                 </span>
                              </td>
                              <td className="p-4">
                                 <span className="text-[10px] text-zinc-500">
                                    {user.created_at ? new Date(user.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                 </span>
                              </td>
                              <td className="p-4">
                                 <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${(!user.status || user.status === 'active')
                                    ? 'bg-neon/10 text-neon border border-neon/20'
                                    : user.status === 'pending'
                                       ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                       : 'bg-red-500/10 text-red-500 border border-red-500/20'
                                    }`}>
                                    <div className={`size-1.5 rounded-full ${(!user.status || user.status === 'active') ? 'bg-neon animate-pulse' :
                                       user.status === 'pending' ? 'bg-amber-500' : 'bg-red-500'
                                       }`}></div>
                                    {(!user.status || user.status === 'active') ? 'Activo' :
                                       user.status === 'pending' ? 'Pendiente' : 'Suspendido'}
                                 </span>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
                  {globalUsers.length === 0 && (
                     <div className="p-12 text-center text-zinc-600 text-xs uppercase tracking-widest font-bold">
                        No se encontraron usuarios registrados
                     </div>
                  )}
               </div>
            </div>
         )}


         {/* MODAL CONFIG (EDICIÓN PREMIUM) */}
         {selectedStore && (
            <div className="fixed inset-0 z-[500] flex items-center justify-center p-6">
               <div className="absolute inset-0 bg-black/98 backdrop-blur-3xl" onClick={() => setSelectedStore(null)}></div>
               <div className="relative bg-[#0F110F] rounded-2xl p-8 border border-white/10 w-full max-w-6xl shadow-2xl animate-in zoom-in-95 duration-500 overflow-hidden max-h-[90vh] overflow-y-auto">

                  {/* BACKGROUND GLOWS */}
                  <div className="absolute top-[-10%] left-[-10%] size-64 bg-accent/5 blur-[80px] rounded-full"></div>
                  <div className="absolute bottom-[-10%] right-[-10%] size-64 bg-neon/5 blur-[80px] rounded-full"></div>

                  <header className="relative z-10 mb-6">
                     <div className="flex justify-between items-start">
                        <div className="space-y-1.5">
                           <div className="flex items-center gap-2">
                              <div className="size-1.5 bg-accent rounded-full animate-pulse"></div>
                              <p className="text-[9px] font-black text-accent uppercase tracking-[0.3em]">Config Hub</p>
                           </div>
                           <h3 className="text-2xl font-black text-white italic leading-none tracking-tighter uppercase">
                              Panel de <span className="text-accent">Configuración</span>
                           </h3>
                           <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Negocio, equipo y seguridad</p>
                        </div>
                        <button onClick={() => setSelectedStore(null)} className="size-10 rounded-xl bg-white/5 flex items-center justify-center text-white/20 hover:text-white hover:bg-white/10 transition-all border border-white/5 group">
                           <span className="material-symbols-outlined text-xl group-hover:rotate-90 transition-transform duration-500">close</span>
                        </button>
                     </div>

                     {/* TABS NAVBAR */}
                     <nav className="flex gap-2 mt-5 p-1.5 bg-white/[0.02] border border-white/5 rounded-xl w-fit">
                        {[
                           { id: 'negocio', label: 'NEGOCIO', icon: 'storefront' },
                           { id: 'staff', label: 'STAFF & ROLES', icon: 'badge' },
                           { id: 'audit', label: 'AUDITORÍA', icon: 'analytics' },
                           { id: 'ai', label: 'SQUADAI', icon: 'auto_awesome' },
                           { id: 'payment', label: 'PASARELA', icon: 'payments' },
                        ].map(t => (
                           <button
                              key={t.id}
                              onClick={() => setConfigTab(t.id as any)}
                              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black tracking-wider transition-all ${configTab === t.id ? 'bg-accent/10 text-accent border border-accent/20 shadow-sm' : 'text-white/30 hover:text-white/60'}`}
                           >
                              <span className="material-symbols-outlined text-base">{t.icon}</span>
                              {t.label}
                           </button>
                        ))}
                     </nav>
                  </header>

                  <div className="relative z-10 flex gap-6">
                     {/* MAIN CONTENT AREA */}
                     <div className="flex-1 space-y-6">
                        {configTab === 'negocio' && (
                           <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                              <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                                 <span className="material-symbols-outlined text-accent text-xl">info</span>
                                 <h4 className="text-base font-black text-white italic uppercase tracking-tighter">Información Operativa</h4>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                 <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] ml-1">Nombre de Fantasía</label>
                                    <div className="relative group">
                                       <input
                                          defaultValue={selectedStore.name}
                                          onBlur={(e) => handleUpdateStore(selectedStore.id, { name: e.target.value })}
                                          className="w-full h-11 bg-white/[0.03] border border-white/10 rounded-xl px-4 text-white text-xs font-bold focus:border-accent outline-none uppercase transition-all"
                                       />
                                       <div className="absolute right-3 top-1/2 -translate-y-1/2 text-white/10 group-focus-within:text-accent transition-colors"><span className="material-symbols-outlined text-sm">edit</span></div>
                                    </div>
                                 </div>
                                 <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] ml-1">Eslogan Comercial</label>
                                    <input
                                       className="w-full h-11 bg-white/[0.03] border border-white/10 rounded-xl px-4 text-white text-xs font-bold focus:border-accent outline-none uppercase transition-all placeholder:text-white/5"
                                       placeholder="COFFEE EXPERIENCE UNIT"
                                    />
                                 </div>
                                 <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] ml-1">Dirección Física</label>
                                    <input
                                       defaultValue={selectedStore.address || ''}
                                       onBlur={(e) => handleUpdateStore(selectedStore.id, { address: e.target.value })}
                                       className="w-full h-11 bg-white/[0.03] border border-white/10 rounded-xl px-4 text-white text-xs font-bold focus:border-accent outline-none transition-all"
                                       placeholder="AV. PRINCIPAL 123"
                                    />
                                 </div>
                                 <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] ml-1">Email de Contacto</label>
                                    <input
                                       defaultValue={selectedStore.owner_email}
                                       onBlur={(e) => handleUpdateStore(selectedStore.id, { owner_email: e.target.value })}
                                       className="w-full h-11 bg-white/[0.03] border border-white/10 rounded-xl px-4 text-white text-xs font-bold focus:border-accent outline-none transition-all"
                                       placeholder="HOLA@CAFE.COM"
                                    />
                                 </div>
                              </div>
                           </div>
                        )}

                        {configTab === 'ai' && (
                           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                              {/* COL 1: CONFIGURATION */}
                              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col gap-4">
                                 <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                                    <span className="material-symbols-outlined text-accent text-lg">auto_awesome</span>
                                    <h4 className="text-xs font-black text-white italic uppercase tracking-widest">Configuración IA</h4>
                                 </div>

                                 {/* MODO OPERATIVO */}
                                 <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-3">
                                    <label className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">Modo Operativo</label>
                                    <div className="flex p-1 bg-white/5 rounded-lg">
                                       <button className="flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-md bg-accent text-black shadow-lg">Asistente</button>
                                       <button className="flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-md text-white/20 hover:text-white/40 transition-colors">Agente</button>
                                    </div>
                                    <p className="text-[8px] text-zinc-600 leading-relaxed font-medium">
                                       El modo agente permite realizar acciones directas sobre el stock.
                                    </p>
                                 </div>

                                 {/* CAPACITIES */}
                                 <div className="space-y-3">
                                    <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 group hover:border-accent/20 transition-all">
                                       <div>
                                          <p className="text-[10px] font-black text-white uppercase tracking-wider">Insights Predictivos</p>
                                          <p className="text-[8px] text-zinc-600">Detección de tendencias</p>
                                       </div>
                                       <div className="w-8 h-4 bg-accent rounded-full relative cursor-pointer"><div className="absolute right-0.5 top-0.5 size-3 bg-black rounded-full shadow-sm"></div></div>
                                    </div>
                                    <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 group hover:border-accent/20 transition-all">
                                       <div>
                                          <p className="text-[10px] font-black text-white uppercase tracking-wider">Soporte Táctico</p>
                                          <p className="text-[8px] text-zinc-600">Chat para operadores</p>
                                       </div>
                                       <div className="w-8 h-4 bg-accent/20 rounded-full relative cursor-pointer"><div className="absolute right-0.5 top-0.5 size-3 bg-accent rounded-full shadow-sm shadow-accent/50"></div></div>
                                    </div>
                                 </div>
                              </div>

                              {/* COL 2: CREDITS */}
                              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col justify-between relative overflow-hidden">
                                 <div className="absolute top-0 right-0 p-4 opacity-5">
                                    <span className="material-symbols-outlined text-6xl">bolt</span>
                                 </div>

                                 <div className="space-y-1 relative z-10">
                                    <span className="material-symbols-outlined text-accent text-lg mb-1">bolt</span>
                                    <h4 className="text-xs font-black text-white uppercase tracking-widest">Consumo Créditos</h4>
                                 </div>

                                 <div className="space-y-3 relative z-10 my-4">
                                    <div className="flex items-baseline gap-2">
                                       <span className="text-3xl font-black text-white tracking-tighter">0.5k</span>
                                       <span className="text-xs font-bold text-zinc-500">/ 5k</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                                       <div className="h-full w-[10%] bg-accent shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                                    </div>
                                    <p className="text-[9px] font-mono text-accent uppercase">Renovación en 12 días</p>
                                 </div>

                                 <button className="w-full py-3 bg-white text-black text-[10px] font-black uppercase tracking-[0.2em] rounded-xl hover:scale-105 transition-transform shadow-lg">
                                    Amplificar Plan
                                 </button>
                              </div>

                              {/* COL 3: SYSTEM STATUS */}
                              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col gap-4">
                                 <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                                    <span className="material-symbols-outlined text-neon text-lg">activity_zone</span>
                                    <h4 className="text-xs font-black text-white italic uppercase tracking-widest">Estado Sistema</h4>
                                 </div>

                                 <div className="p-4 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
                                    <span className="text-[9px] font-black text-white/60 uppercase tracking-widest">Servidores</span>
                                    <div className="flex items-center gap-2">
                                       <div className="size-1.5 bg-neon rounded-full animate-pulse"></div>
                                       <span className="text-[9px] font-bold text-neon uppercase">Operativos</span>
                                    </div>
                                 </div>

                                 <div className="space-y-1">
                                    <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">Última Sincronización</p>
                                    <p className="text-sm font-black text-white italic">Hace 2 minutos <span className="text-neon decoration-neon underline decoration-2 underline-offset-2">(Nodo Alpha)</span></p>
                                 </div>

                                 <div className="mt-auto space-y-2 pt-4 border-t border-white/5">
                                    <div className="flex justify-between items-end">
                                       <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Latencia</span>
                                       <span className="text-[9px] font-black text-neon uppercase">12ms - Excellent</span>
                                    </div>
                                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                       <div className="h-full w-[95%] bg-neon shadow-[0_0_10px_rgba(74,222,128,0.5)]"></div>
                                    </div>
                                 </div>
                              </div>
                           </div>
                        )}

                        {configTab === 'payment' && (
                           <PaymentSettings selectedStore={selectedStore} />
                        )}

                        {(configTab === 'staff' || configTab === 'audit') && (
                           <div className="flex flex-col items-center justify-center p-12 border border-white/5 rounded-2xl bg-white/[0.01] animate-in fade-in zoom-in-95">
                              <span className="material-symbols-outlined text-4xl text-white/10 mb-4">lock</span>
                              <p className="text-white font-black italic text-base uppercase tracking-tighter">Módulo en Desarrollo</p>
                              <p className="text-[10px] text-white/30 font-bold uppercase tracking-[0.2em] mt-1.5">Próximamente disponible en SQUAD v2.1</p>
                           </div>
                        )}
                     </div>

                     {/* SIDEBAR STATUS */}
                     <div className="w-64 space-y-4 flex-shrink-0">
                        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4">
                           <div className="flex items-center gap-2.5 pb-3 border-b border-white/5">
                              <span className="material-symbols-outlined text-neon text-xl">analytics</span>
                              <h4 className="text-xs font-black text-white uppercase tracking-widest">Estado del Sistema</h4>
                           </div>

                           <div className="space-y-3">
                              <div className="p-3 rounded-xl bg-black border border-white/5 flex items-center justify-between group">
                                 <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Servidores Operativos</span>
                                 <div className="size-2.5 bg-neon rounded-full shadow-[0_0_15px_rgba(74,222,128,0.5)] animate-pulse"></div>
                              </div>

                              <div className="space-y-1">
                                 <p className="text-[9px] font-black text-white/20 uppercase tracking-widest ml-1">Ultima Sincronización</p>
                                 <p className="text-white font-black italic text-xs ml-1">Hace 2 minutos <span className="text-accent">(Nodo Alpha)</span></p>
                              </div>
                           </div>
                        </div>

                        <button
                           onClick={() => setSelectedStore(null)}
                           className="w-full py-3.5 bg-white text-black rounded-xl font-black text-[11px] uppercase tracking-[0.2em] hover:scale-[1.02] active:scale-95 transition-all shadow-lg flex items-center justify-center gap-2.5"
                        >
                           <span className="material-symbols-outlined text-lg">save_as</span>
                           Cerrar y Sincronizar
                        </button>
                     </div>
                  </div>
               </div>
            </div>
         )}

         {/* MODAL NUEVO LOCAL (Lanzamiento) */}
         {showNewStoreModal && (
            <div className="fixed inset-0 z-[500] flex items-center justify-center p-6">
               <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setShowNewStoreModal(false)}></div>
               <div className="relative bg-[#0F110F] rounded-2xl p-7 border border-white/10 w-full max-w-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-500">
                  <div className="flex justify-between items-start mb-5">
                     <div className="space-y-1">
                        <h3 className="text-xl font-black text-white uppercase italic leading-none tracking-tighter">NUEVO DESPLIEGUE</h3>
                        <p className="text-[9px] font-bold text-white/30 uppercase tracking-[0.2em]">Protocolo de Instancia</p>
                     </div>
                     <div className="size-10 rounded-xl bg-accent text-black flex items-center justify-center shadow-accent-glow"><span className="material-symbols-outlined text-xl font-black">rocket_launch</span></div>
                  </div>

                  <form onSubmit={handleCreateStore} className="space-y-4">
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-2">Nombre del Local</label>
                           <input value={newStore.name} onChange={e => setNewStore({ ...newStore, name: e.target.value })} className="w-full h-10 bg-white/[0.03] border border-white/10 rounded-lg px-3.5 text-white text-xs uppercase font-bold focus:border-accent outline-none transition-all placeholder:text-white/10" placeholder="EJ: SQUAD CENTRAL" required />
                        </div>
                        <div className="space-y-2">
                           <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-2">Nombre Propietario</label>
                           <input value={newStore.ownerName} onChange={e => setNewStore({ ...newStore, ownerName: e.target.value })} className="w-full h-10 bg-white/[0.03] border border-white/10 rounded-lg px-3.5 text-white text-xs font-bold focus:border-accent outline-none transition-all placeholder:text-white/10" placeholder="EJ: ENEAS WEB" />
                        </div>
                     </div>

                     <div className="space-y-2">
                        <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-2">Email de Acceso Primario (Único)</label>
                        <input value={newStore.ownerEmail} onChange={e => setNewStore({ ...newStore, ownerEmail: e.target.value })} className="w-full h-10 bg-white/[0.03] border border-white/10 rounded-lg px-3.5 text-white text-xs font-bold focus:border-accent outline-none transition-all placeholder:text-white/10" placeholder="propietario@email.com" required />
                     </div>

                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-2">Dirección</label>
                           <input value={newStore.address} onChange={e => setNewStore({ ...newStore, address: e.target.value })} className="w-full h-10 bg-white/[0.03] border border-white/10 rounded-lg px-3.5 text-white text-xs font-bold focus:border-accent outline-none" placeholder="Dirección física" />
                        </div>
                        <div className="space-y-2">
                           <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-2">Info Fiscal (CUIT/NIT)</label>
                           <input value={newStore.taxInfo} onChange={e => setNewStore({ ...newStore, taxInfo: e.target.value })} className="w-full h-10 bg-white/[0.03] border border-white/10 rounded-lg px-3.5 text-white text-xs font-bold focus:border-accent outline-none" placeholder="ID Fiscal" />
                        </div>
                     </div>

                     <div className="space-y-2.5">
                        <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] text-center italic">Scope del Plan</p>
                        <div className="grid grid-cols-3 gap-3">
                           {['FREE', 'PRO', 'DEMO'].map(p => (
                              <button
                                 key={p}
                                 type="button"
                                 onClick={() => setNewStore({ ...newStore, plan: p })}
                                 className={`py-3 rounded-lg border font-black text-[10px] uppercase transition-all flex flex-col items-center gap-1 ${newStore.plan === p ? 'bg-accent/10 border-accent text-accent shadow-accent-soft' : 'bg-white/5 border-white/5 text-white/20 hover:border-white/10 hover:text-white/40'}`}
                              >
                                 <span className="material-symbols-outlined text-lg">
                                    {p === 'PRO' ? 'military_tech' : p === 'DEMO' ? 'timer' : 'lock_open'}
                                 </span>
                                 {p}
                              </button>
                           ))}
                        </div>
                     </div>

                     <div className="mt-5 flex gap-3">
                        <button type="button" onClick={() => setShowNewStoreModal(false)} className="flex-1 py-3 text-white/20 text-[10px] font-black uppercase tracking-widest hover:text-white transition-all italic">Cancelar</button>
                        <button
                           type="submit"
                           disabled={isSaving}
                           className="flex-[2] py-3 bg-accent text-black rounded-xl font-black text-[11px] uppercase tracking-[0.15em] shadow-accent-glow hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                        >
                           {isSaving ? 'DESPLEGANDO...' : 'LANZAR LOCAL'}
                        </button>
                     </div>
                  </form>
               </div>
            </div>
         )}

         {/* INCIDENTS TAB */}
         {activeTab === 'incidents' && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
               <div className="flex items-center justify-between">
                  <div>
                     <h2 className="text-2xl font-black italic text-white uppercase tracking-tighter">Incidentes</h2>
                     <p className="text-xs text-zinc-500 font-medium mt-1">Errores reportados por usuarios y crashes del sistema.</p>
                  </div>
                  <button
                     onClick={() => fetchIncidents()}
                     disabled={incidentsLoading}
                     className="p-2 hover:bg-white/5 rounded-full text-zinc-500 hover:text-white transition-colors"
                  >
                     <span className={`material-symbols-outlined ${incidentsLoading ? 'animate-spin' : ''}`}>refresh</span>
                  </button>
               </div>

               {/* KPIs */}
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-5 rounded-2xl bg-[#0A0C0A] border border-white/5 flex flex-col gap-1">
                     <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Últimas 24h</span>
                     <span className="text-3xl font-black text-white tracking-tighter tabular-nums">{last24h}</span>
                  </div>
                  <div className="p-5 rounded-2xl bg-[#0A0C0A] border border-white/5 flex flex-col gap-1">
                     <span className="text-[10px] font-black text-red-400/60 uppercase tracking-widest">Nuevos sin ver</span>
                     <span className="text-3xl font-black text-red-400 tracking-tighter tabular-nums">{newIncidentCount}</span>
                  </div>
                  <div className="p-5 rounded-2xl bg-[#0A0C0A] border border-white/5 flex flex-col gap-1">
                     <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Total registros</span>
                     <span className="text-3xl font-black text-white tracking-tighter tabular-nums">{incidents.length}</span>
                  </div>
               </div>

               {/* Filters */}
               <div className="flex items-center gap-2">
                  {(['all', 'new', 'seen', 'resolved', 'ignored'] as const).map(f => (
                     <button
                        key={f}
                        onClick={() => setIncidentFilter(f)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${incidentFilter === f
                           ? 'bg-accent/10 text-accent border border-accent/20'
                           : 'bg-white/5 text-zinc-500 border border-white/5 hover:text-white/60'
                        }`}
                     >
                        {f === 'all' ? 'Todos' : f === 'new' ? 'Nuevos' : f === 'seen' ? 'Vistos' : f === 'resolved' ? 'Resueltos' : 'Ignorados'}
                        {f === 'new' && newIncidentCount > 0 && (
                           <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[8px]">{newIncidentCount}</span>
                        )}
                     </button>
                  ))}
               </div>

               {/* Incidents Table */}
               <div className="rounded-3xl border border-white/5 overflow-hidden bg-[#0A0C0A]">
                  {incidentsLoading ? (
                     <div className="p-12 text-center">
                        <div className="w-8 h-8 border-2 border-accent/20 border-t-accent rounded-full animate-spin mx-auto mb-3"></div>
                        <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">Cargando incidentes...</p>
                     </div>
                  ) : filteredIncidents.length === 0 ? (
                     <div className="p-12 text-center text-zinc-600 text-xs uppercase tracking-widest font-bold">
                        {incidentFilter === 'all' ? 'Sin incidentes registrados' : `Sin incidentes con estado "${incidentFilter}"`}
                     </div>
                  ) : (
                     <div className="divide-y divide-white/5">
                        {filteredIncidents.map(inc => (
                           <div key={inc.id}>
                              {/* Row */}
                              <div
                                 className={`flex items-center gap-4 p-4 cursor-pointer transition-colors ${expandedIncident === inc.id ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'}`}
                                 onClick={() => setExpandedIncident(expandedIncident === inc.id ? null : inc.id)}
                              >
                                 {/* Status dot */}
                                 <div className={`size-2.5 rounded-full flex-shrink-0 ${
                                    inc.status === 'new' ? 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]' :
                                    inc.status === 'seen' ? 'bg-amber-500' :
                                    inc.status === 'resolved' ? 'bg-emerald-500' : 'bg-zinc-600'
                                 }`}></div>

                                 {/* Date */}
                                 <div className="w-32 flex-shrink-0">
                                    <div className="text-[10px] text-zinc-500 font-mono">
                                       {new Date(inc.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                                    </div>
                                    <div className="text-[9px] text-zinc-700 font-mono">
                                       {new Date(inc.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </div>
                                 </div>

                                 {/* Store */}
                                 <div className="w-28 flex-shrink-0">
                                    {inc.store_name ? (
                                       <span className="px-2 py-1 rounded-lg bg-accent/10 text-accent text-[9px] font-black uppercase">{inc.store_name}</span>
                                    ) : (
                                       <span className="text-[9px] text-zinc-700 italic">Sin tienda</span>
                                    )}
                                 </div>

                                 {/* Error message */}
                                 <div className="flex-1 min-w-0">
                                    <p className="text-xs text-white/80 font-medium truncate">{inc.error_message}</p>
                                    <p className="text-[9px] text-zinc-600 truncate">{inc.route || inc.url || '—'}</p>
                                 </div>

                                 {/* Status badge */}
                                 <span className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-wider flex-shrink-0 ${
                                    inc.status === 'new' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                    inc.status === 'seen' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                    inc.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                    'bg-zinc-500/10 text-zinc-500 border border-zinc-500/20'
                                 }`}>
                                    {inc.status}
                                 </span>

                                 {/* Expand arrow */}
                                 <span className={`material-symbols-outlined text-sm text-zinc-600 transition-transform ${expandedIncident === inc.id ? 'rotate-180' : ''}`}>
                                    expand_more
                                 </span>
                              </div>

                              {/* Expanded detail */}
                              {expandedIncident === inc.id && (
                                 <div className="px-4 pb-4 space-y-4 animate-in slide-in-from-top-2 duration-300">
                                    {/* Stack trace */}
                                    {inc.error_stack && (
                                       <div className="p-4 rounded-xl bg-black/60 border border-white/5">
                                          <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Stack Trace</p>
                                          <pre className="text-[10px] text-red-400/70 font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto leading-relaxed">
                                             {inc.error_stack}
                                          </pre>
                                       </div>
                                    )}

                                    {/* Metadata */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                       <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                                          <p className="text-[8px] text-zinc-600 uppercase tracking-widest font-bold">URL</p>
                                          <p className="text-[10px] text-white/60 font-mono break-all mt-1">{inc.url || '—'}</p>
                                       </div>
                                       <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                                          <p className="text-[8px] text-zinc-600 uppercase tracking-widest font-bold">Ruta</p>
                                          <p className="text-[10px] text-white/60 font-mono mt-1">{inc.route || '—'}</p>
                                       </div>
                                       <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                                          <p className="text-[8px] text-zinc-600 uppercase tracking-widest font-bold">User Agent</p>
                                          <p className="text-[10px] text-white/60 font-mono break-all mt-1 line-clamp-2">{inc.user_agent || '—'}</p>
                                       </div>
                                       <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                                          <p className="text-[8px] text-zinc-600 uppercase tracking-widest font-bold">Metadata</p>
                                          <p className="text-[10px] text-white/60 font-mono break-all mt-1">{inc.metadata ? JSON.stringify(inc.metadata) : '—'}</p>
                                       </div>
                                    </div>

                                    {/* Notes */}
                                    {inc.notes && (
                                       <div className="p-3 rounded-lg bg-accent/5 border border-accent/10">
                                          <p className="text-[8px] text-accent uppercase tracking-widest font-bold">Nota</p>
                                          <p className="text-xs text-white/70 mt-1">{inc.notes}</p>
                                       </div>
                                    )}

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                       {inc.status !== 'seen' && (
                                          <button
                                             onClick={(e) => { e.stopPropagation(); updateIncidentStatus(inc.id, 'seen'); }}
                                             className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] font-black uppercase tracking-wider hover:bg-amber-500/20 transition-all"
                                          >
                                             Marcar visto
                                          </button>
                                       )}
                                       {inc.status !== 'resolved' && (
                                          <button
                                             onClick={(e) => { e.stopPropagation(); updateIncidentStatus(inc.id, 'resolved'); }}
                                             className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase tracking-wider hover:bg-emerald-500/20 transition-all"
                                          >
                                             Resolver
                                          </button>
                                       )}
                                       {inc.status !== 'ignored' && (
                                          <button
                                             onClick={(e) => { e.stopPropagation(); updateIncidentStatus(inc.id, 'ignored'); }}
                                             className="px-3 py-1.5 rounded-lg bg-zinc-500/10 text-zinc-500 border border-zinc-500/20 text-[9px] font-black uppercase tracking-wider hover:bg-zinc-500/20 transition-all"
                                          >
                                             Ignorar
                                          </button>
                                       )}

                                       {/* Add note inline */}
                                       <div className="flex-1 flex items-center gap-2 ml-2">
                                          <input
                                             value={incidentNote}
                                             onChange={(e) => setIncidentNote(e.target.value)}
                                             onClick={(e) => e.stopPropagation()}
                                             placeholder="Agregar nota..."
                                             className="flex-1 h-8 bg-white/[0.03] border border-white/10 rounded-lg px-3 text-[10px] text-white/70 focus:border-accent outline-none placeholder:text-white/10"
                                          />
                                          <button
                                             onClick={(e) => { e.stopPropagation(); saveIncidentNote(inc.id); }}
                                             disabled={!incidentNote.trim()}
                                             className="px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-[9px] font-black uppercase tracking-wider hover:bg-accent/20 transition-all disabled:opacity-30"
                                          >
                                             Guardar
                                          </button>
                                       </div>
                                    </div>
                                 </div>
                              )}
                           </div>
                        ))}
                     </div>
                  )}
               </div>
            </div>
         )}

         {/* MODAL CAMBIAR PLAN */}
         {showPlanModal && planModalStore && (
            <div className="fixed inset-0 z-[500] flex items-center justify-center p-6">
               <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => { setShowPlanModal(false); setPlanModalStore(null); }}></div>
               <div className="relative bg-[#0D0F0D] rounded-2xl p-6 border border-white/10 w-full max-w-md shadow-2xl animate-in zoom-in-95">
                  <div className="flex justify-between items-start mb-4">
                     <div>
                        <h3 className="text-base font-black text-white uppercase italic tracking-tight">Cambiar Plan</h3>
                        <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">{planModalStore.name}</p>
                     </div>
                     <button onClick={() => { setShowPlanModal(false); setPlanModalStore(null); }} className="size-8 rounded-full bg-white/5 flex items-center justify-center text-white/30 hover:text-white">
                        <span className="material-symbols-outlined text-lg">close</span>
                     </button>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                     {['FREE', 'PRO', 'DEMO'].map(plan => (
                        <button
                           key={plan}
                           onClick={() => handlePlanChange(plan)}
                           disabled={isSaving}
                           className={`py-4 rounded-lg border font-black text-[11px] uppercase transition-all flex flex-col items-center gap-1.5 disabled:opacity-50 ${planModalStore.plan?.toUpperCase() === plan
                              ? 'bg-accent/20 border-accent text-accent'
                              : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20 hover:text-white/60'
                              }`}
                        >
                           <span className="material-symbols-outlined text-xl">
                              {plan === 'PRO' ? 'military_tech' : plan === 'DEMO' ? 'timer' : 'lock_open'}
                           </span>
                           {plan}
                        </button>
                     ))}
                  </div>

                  <p className="text-[9px] text-white/20 text-center mt-4 font-bold uppercase tracking-widest">
                     PRO = $50/mes • FREE = $0 • DEMO = Trial
                  </p>
               </div>
            </div>
         )}
      </div>
   );
};

export default SaasAdmin;
