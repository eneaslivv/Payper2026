import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastSystem';
import { useAuth } from '../contexts/AuthContext';
import { Store } from '../types';
import { useMercadoPagoConnect } from '../hooks/useMercadoPagoConnect';
import { PaymentSettings } from '../components/PaymentSettings';

type SaasTab = 'dashboard' | 'tenants' | 'users' | 'plans' | 'audit' | 'metrics';

export interface ExtendedStore extends Store {
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

   const fetchData = useCallback(async () => {
      setIsLoading(true);
      try {
         // Fetch only active stores
         const { data: dbStores, error } = await (supabase
            .from('stores')
            .select('*') as any)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

         if (error) {
            console.error("DB_FETCH_ERROR:", error.message, error);
            addToast('Error de Conexión', 'error', error.message);
         } else {
            setStores(dbStores || []);
         }

         // Fetch metrics
         const { count: storeCount } = await (supabase
            .from('stores')
            .select('*', { count: 'exact', head: true }) as any)
            .eq('is_active', true);

         const { count: userCount } = await (supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true }) as any);

         // Calculate MRR (PRO = $50/month, FREE = $0)
         const { data: proStores } = await (supabase
            .from('stores')
            .select('id') as any)
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
            const storeMap = new Map((dbStores || []).map((s: any) => [s.id, s]));

            const usersWithStores = allProfiles.map((p: any) => ({
               ...p,
               store_name: (storeMap.get(p.store_id) as any)?.name || null,
               store_slug: (storeMap.get(p.store_id) as any)?.slug || null
            }));
            setGlobalUsers(usersWithStores);
         }
      } catch (e: any) {
         console.error("FETCH_EXCEPTION:", e);
      } finally {
         setIsLoading(false);
      }
   }, [addToast]);

   useEffect(() => {
      fetchData();
      const timer = setTimeout(() => setIsLoading(false), 3000);
      return () => clearTimeout(timer);
   }, [fetchData, activeTab]);

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
               redirectTo: window.location.origin + '/login',
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
         const { error } = await supabase.from('stores').update(updates).eq('id', storeId);
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
         const { error } = await supabase.from('stores').update({ is_active: false } as any).eq('id', storeId);
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
            const existingSlugs = new Set(existingStores.map((s: any) => s.slug));
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

         // INVOKE EDGE FUNCTION
         const { data: fnData, error: fnError } = await supabase.functions.invoke('invite-owner', {
            body: {
               email: cleanEmail,
               storeId: store.id,
               ownerName: newStore.ownerName.trim(),
               storeName: store.name
            }
         });

         if (fnData?.link) {
            setGeneratedLink(fnData.link);
            addToast('Nodo Lanzado', 'success', 'Copiá el Link de Acceso Maestro');
         } else {
            addToast('Nodo Creado', 'success', 'El local se creó, pero el link falló. Generalo manualmente.');
         }

         setShowNewStoreModal(false);
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
         const { error } = await supabase.from('stores').update({ plan } as any).eq('id', planModalStore.id);
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

         {/* GENERATED LINK DISPLAY */}
         {generatedLink && (
            <div className="mb-5 p-4 rounded-xl bg-accent/5 border border-accent/30">
               <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 space-y-2">
                     <p className="text-[9px] font-bold text-accent uppercase tracking-wider flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">verified_user</span>
                        Link de Acceso
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


         {/* MODAL CONFIG (EDICIÓN PREMIUM) */}
         {selectedStore && (
            <div className="fixed inset-0 z-[500] flex items-center justify-center p-6">
               <div className="absolute inset-0 bg-black/98 backdrop-blur-3xl" onClick={() => setSelectedStore(null)}></div>
               <div className="relative bg-[#0F110F] rounded-[4rem] p-16 border border-white/10 w-full max-w-6xl shadow-2xl animate-in zoom-in-95 duration-500 overflow-hidden">

                  {/* BACKGROUND GLOWS */}
                  <div className="absolute top-[-10%] left-[-10%] size-96 bg-accent/5 blur-[120px] rounded-full"></div>
                  <div className="absolute bottom-[-10%] right-[-10%] size-96 bg-neon/5 blur-[120px] rounded-full"></div>

                  <header className="relative z-10 mb-16">
                     <div className="flex justify-between items-start">
                        <div className="space-y-3">
                           <div className="flex items-center gap-3">
                              <div className="size-2 bg-accent rounded-full animate-pulse"></div>
                              <p className="text-[10px] font-black text-accent uppercase tracking-[0.5em]">Global Config Hub</p>
                           </div>
                           <h3 className="text-6xl font-black text-white italic leading-none tracking-tighter uppercase">
                              Panel de <span className="text-accent">Configuración</span>
                           </h3>
                           <p className="text-[11px] font-bold text-white/30 uppercase tracking-[0.4em]">Mando centralizado de negocio, equipo y seguridad</p>
                        </div>
                        <button onClick={() => setSelectedStore(null)} className="size-16 rounded-[2rem] bg-white/5 flex items-center justify-center text-white/20 hover:text-white hover:bg-white/10 transition-all border border-white/5 group">
                           <span className="material-symbols-outlined text-3xl group-hover:rotate-90 transition-transform duration-500">close</span>
                        </button>
                     </div>

                     {/* TABS NAVBAR */}
                     <nav className="flex gap-4 mt-12 p-2 bg-white/[0.02] border border-white/5 rounded-[2.5rem] w-fit">
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
                              className={`flex items-center gap-3 px-8 py-4 rounded-[1.8rem] text-[11px] font-black tracking-widest transition-all ${configTab === t.id ? 'bg-accent/10 text-accent border border-accent/20 shadow-lg' : 'text-white/30 hover:text-white/60'}`}
                           >
                              <span className="material-symbols-outlined text-xl">{t.icon}</span>
                              {t.label}
                           </button>
                        ))}
                     </nav>
                  </header>

                  <div className="relative z-10 flex gap-12">
                     {/* MAIN CONTENT AREA */}
                     <div className="flex-1 space-y-12">
                        {configTab === 'negocio' && (
                           <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                              <div className="flex items-center gap-4 border-b border-white/5 pb-6">
                                 <span className="material-symbols-outlined text-accent text-3xl">info</span>
                                 <h4 className="text-xl font-black text-white italic uppercase tracking-tighter">Información Operativa</h4>
                              </div>

                              <div className="grid grid-cols-2 gap-10">
                                 <div className="space-y-4">
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] ml-2">Nombre de Fantasía</label>
                                    <div className="relative group">
                                       <input
                                          defaultValue={selectedStore.name}
                                          onBlur={(e) => handleUpdateStore(selectedStore.id, { name: e.target.value })}
                                          className="w-full h-20 bg-white/[0.03] border border-white/10 rounded-[1.5rem] px-8 text-white text-sm font-bold focus:border-accent outline-none uppercase transition-all shadow-inner"
                                       />
                                       <div className="absolute right-6 top-1/2 -translate-y-1/2 text-white/10 group-focus-within:text-accent transition-colors"><span className="material-symbols-outlined">edit</span></div>
                                    </div>
                                 </div>
                                 <div className="space-y-4">
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] ml-2">Eslogan Comercial</label>
                                    <input
                                       className="w-full h-20 bg-white/[0.03] border border-white/10 rounded-[1.5rem] px-8 text-white text-sm font-bold focus:border-accent outline-none uppercase transition-all shadow-inner placeholder:text-white/5"
                                       placeholder="COFFEE EXPERIENCE UNIT"
                                    />
                                 </div>
                                 <div className="space-y-4">
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] ml-2">Dirección Física</label>
                                    <input
                                       defaultValue={selectedStore.address || ''}
                                       onBlur={(e) => handleUpdateStore(selectedStore.id, { address: e.target.value })}
                                       className="w-full h-20 bg-white/[0.03] border border-white/10 rounded-[1.5rem] px-8 text-white text-sm font-bold focus:border-accent outline-none transition-all shadow-inner"
                                       placeholder="AV. PRINCIPAL 123"
                                    />
                                 </div>
                                 <div className="space-y-4">
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] ml-2">Email de Contacto</label>
                                    <input
                                       defaultValue={selectedStore.owner_email}
                                       onBlur={(e) => handleUpdateStore(selectedStore.id, { owner_email: e.target.value })}
                                       className="w-full h-20 bg-white/[0.03] border border-white/10 rounded-[1.5rem] px-8 text-white text-sm font-bold focus:border-accent outline-none transition-all shadow-inner"
                                       placeholder="HOLA@CAFE.COM"
                                    />
                                 </div>
                              </div>
                           </div>
                        )}

                        {configTab === 'ai' && (
                           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                              {/* COL 1: CONFIGURATION */}
                              <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col gap-6">
                                 <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                                    <span className="material-symbols-outlined text-accent text-xl">auto_awesome</span>
                                    <h4 className="text-sm font-black text-white italic uppercase tracking-widest">Configuración IA</h4>
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
                              <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col justify-between relative overflow-hidden">
                                 <div className="absolute top-0 right-0 p-8 opacity-5">
                                    <span className="material-symbols-outlined text-8xl">bolt</span>
                                 </div>

                                 <div className="space-y-1 relative z-10">
                                    <span className="material-symbols-outlined text-accent text-xl mb-2">bolt</span>
                                    <h4 className="text-sm font-black text-white uppercase tracking-widest">Consumo Créditos</h4>
                                 </div>

                                 <div className="space-y-4 relative z-10 my-8">
                                    <div className="flex items-baseline gap-2">
                                       <span className="text-5xl font-black text-white tracking-tighter">0.5k</span>
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
                              <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col gap-6">
                                 <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                                    <span className="material-symbols-outlined text-neon text-xl">activity_zone</span>
                                    <h4 className="text-sm font-black text-white italic uppercase tracking-widest">Estado Sistema</h4>
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

                                 <div className="mt-auto space-y-3 pt-6 border-t border-white/5">
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
                           <div className="flex flex-col items-center justify-center p-20 border border-white/5 rounded-[3rem] bg-white/[0.01] animate-in fade-in zoom-in-95">
                              <span className="material-symbols-outlined text-6xl text-white/10 mb-6">lock</span>
                              <p className="text-white font-black italic text-xl uppercase tracking-tighter">Módulo en Desarrollo</p>
                              <p className="text-[10px] text-white/30 font-bold uppercase tracking-[0.4em] mt-2">Próximamente disponible en SQUAD v2.1</p>
                           </div>
                        )}
                     </div>

                     {/* SIDEBAR STATUS */}
                     <div className="w-96 space-y-8">
                        <div className="p-10 rounded-[3rem] bg-white/[0.02] border border-white/10 space-y-8">
                           <div className="flex items-center gap-4 pb-6 border-b border-white/5">
                              <span className="material-symbols-outlined text-neon text-3xl">analytics</span>
                              <h4 className="text-sm font-black text-white uppercase tracking-widest">Estado del Sistema</h4>
                           </div>

                           <div className="space-y-6">
                              <div className="p-6 rounded-2xl bg-black border border-white/5 flex items-center justify-between group">
                                 <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Servidores Operativos</span>
                                 <div className="size-2.5 bg-neon rounded-full shadow-[0_0_15px_rgba(74,222,128,0.5)] animate-pulse"></div>
                              </div>

                              <div className="space-y-2">
                                 <p className="text-[10px] font-black text-white/20 uppercase tracking-widest ml-2">Ultima Sincronización</p>
                                 <p className="text-white font-black italic text-sm ml-2">Hace 2 minutos <span className="text-accent">(Nodo Alpha)</span></p>
                              </div>
                           </div>
                        </div>

                        <button
                           onClick={() => setSelectedStore(null)}
                           className="w-full py-8 bg-white text-black rounded-[2.5rem] font-black text-[13px] uppercase tracking-[0.4em] hover:scale-[1.03] active:scale-95 transition-all shadow-2xl flex items-center justify-center gap-4"
                        >
                           <span className="material-symbols-outlined font-black">save_as</span>
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
               <div className="relative bg-[#0F110F] rounded-3xl p-10 border border-white/10 w-full max-w-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-500">
                  <div className="flex justify-between items-start mb-8">
                     <div className="space-y-1">
                        <h3 className="text-3xl font-black text-white uppercase italic leading-none tracking-tighter">NUEVO DESPLIEGUE</h3>
                        <p className="text-[9px] font-bold text-white/30 uppercase tracking-[0.4em]">Protocolo de Instancia</p>
                     </div>
                     <div className="size-16 rounded-2xl bg-accent text-black flex items-center justify-center shadow-accent-glow"><span className="material-symbols-outlined text-3xl font-black">rocket_launch</span></div>
                  </div>

                  <form onSubmit={handleCreateStore} className="space-y-6">
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-2">Nombre del Local</label>
                           <input value={newStore.name} onChange={e => setNewStore({ ...newStore, name: e.target.value })} className="w-full h-12 bg-white/[0.03] border border-white/10 rounded-xl px-4 text-white text-sm uppercase font-bold focus:border-accent outline-none transition-all placeholder:text-white/10" placeholder="EJ: SQUAD CENTRAL" required />
                        </div>
                        <div className="space-y-2">
                           <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-2">Nombre Propietario</label>
                           <input value={newStore.ownerName} onChange={e => setNewStore({ ...newStore, ownerName: e.target.value })} className="w-full h-12 bg-white/[0.03] border border-white/10 rounded-xl px-4 text-white text-sm font-bold focus:border-accent outline-none transition-all placeholder:text-white/10" placeholder="EJ: ENEAS WEB" />
                        </div>
                     </div>

                     <div className="space-y-2">
                        <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-2">Email de Acceso Primario (Único)</label>
                        <input value={newStore.ownerEmail} onChange={e => setNewStore({ ...newStore, ownerEmail: e.target.value })} className="w-full h-12 bg-white/[0.03] border border-white/10 rounded-xl px-4 text-white text-sm font-bold focus:border-accent outline-none shadow-inner transition-all placeholder:text-white/10" placeholder="propietario@email.com" required />
                     </div>

                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-2">Dirección</label>
                           <input value={newStore.address} onChange={e => setNewStore({ ...newStore, address: e.target.value })} className="w-full h-12 bg-white/[0.03] border border-white/10 rounded-xl px-4 text-white text-xs font-bold focus:border-accent outline-none" placeholder="Dirección física" />
                        </div>
                        <div className="space-y-2">
                           <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-2">Info Fiscal (CUIT/NIT)</label>
                           <input value={newStore.taxInfo} onChange={e => setNewStore({ ...newStore, taxInfo: e.target.value })} className="w-full h-12 bg-white/[0.03] border border-white/10 rounded-xl px-4 text-white text-xs font-bold focus:border-accent outline-none" placeholder="ID Fiscal" />
                        </div>
                     </div>

                     <div className="space-y-4">
                        <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.4em] text-center italic">Scope del Plan</p>
                        <div className="grid grid-cols-3 gap-3">
                           {['FREE', 'PRO', 'DEMO'].map(p => (
                              <button
                                 key={p}
                                 type="button"
                                 onClick={() => setNewStore({ ...newStore, plan: p })}
                                 className={`py-4 rounded-xl border font-black text-[10px] uppercase transition-all flex flex-col items-center gap-1 ${newStore.plan === p ? 'bg-accent/10 border-accent text-accent shadow-accent-soft' : 'bg-white/5 border-white/5 text-white/20 hover:border-white/10 hover:text-white/40'}`}
                              >
                                 <span className="material-symbols-outlined text-lg">
                                    {p === 'PRO' ? 'military_tech' : p === 'DEMO' ? 'timer' : 'lock_open'}
                                 </span>
                                 {p}
                              </button>
                           ))}
                        </div>
                     </div>

                     <div className="mt-10 flex gap-4">
                        <button type="button" onClick={() => setShowNewStoreModal(false)} className="flex-1 py-4 text-white/20 text-[10px] font-black uppercase tracking-widest hover:text-white transition-all italic">Cancelar</button>
                        <button
                           type="submit"
                           disabled={isSaving}
                           className="flex-[2] py-4 bg-accent text-black rounded-xl font-black text-[11px] uppercase tracking-[0.2em] shadow-accent-glow hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                        >
                           {isSaving ? 'DESPLEGANDO...' : 'LANZAR LOCAL'}
                        </button>
                     </div>
                  </form>
               </div>
            </div>
         )}

         {/* MODAL CAMBIAR PLAN */}
         {showPlanModal && planModalStore && (
            <div className="fixed inset-0 z-[500] flex items-center justify-center p-6">
               <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => { setShowPlanModal(false); setPlanModalStore(null); }}></div>
               <div className="relative bg-[#0D0F0D] rounded-2xl p-8 border border-white/10 w-full max-w-md shadow-2xl animate-in zoom-in-95">
                  <div className="flex justify-between items-start mb-6">
                     <div>
                        <h3 className="text-xl font-black text-white uppercase italic tracking-tight">Cambiar Plan</h3>
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
                           className={`py-6 rounded-xl border font-black text-[11px] uppercase transition-all flex flex-col items-center gap-2 disabled:opacity-50 ${planModalStore.plan?.toUpperCase() === plan
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
