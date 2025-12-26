
import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ToastSystem';
import { Reward, ProductLoyaltyRule, LoyaltyConfig, Product } from '../types';
import { GoogleGenerativeAI } from "@google/generative-ai";

const Loyalty: React.FC = () => {
   const { profile } = useAuth();
   const { addToast } = useToast();
   const [loading, setLoading] = useState(true);
   const [activeSubTab, setActiveSubTab] = useState<'config' | 'products' | 'rewards' | 'audit'>('rewards');
   const [config, setConfig] = useState<LoyaltyConfig>({
      isActive: false, // Default to inactive for new stores
      baseAmount: 100,
      basePoints: 1,
      rounding: 'down',
      manualOrdersEarn: false,
      discountedOrdersEarn: true,
      combosEarn: true
   });

   // Reglas de Acumulación
   const [products, setProducts] = useState<Product[]>([]);
   const [productRules, setProductRules] = useState<ProductLoyaltyRule[]>([]);
   const [editingRule, setEditingRule] = useState<ProductLoyaltyRule | null>(null);

   // Recompensas (Canje)
   const [rewards, setRewards] = useState<Reward[]>([]);
   const [showRewardModal, setShowRewardModal] = useState(false);
   const [newReward, setNewReward] = useState<{ productId: string, points: number }>({ productId: '', points: 0 });

   const [searchTerm, setSearchTerm] = useState('');
   const [isGeneratingStrategy, setIsGeneratingStrategy] = useState(false);
   const [isSaving, setIsSaving] = useState(false);
   const [aiStrategy, setAiStrategy] = useState<string | null>(null);

   useEffect(() => {
      fetchData();
   }, []);

   const fetchData = async (forceRefresh = false) => {
      // Usar storeId del perfil o fallback para desarrollo
      const storeId = profile?.store_id || 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533';

      if (!storeId) {
         setLoading(false);
         return;
      }

      // CACHE STRATEGY
      const CACHE_KEY = `loyalty_cache_${storeId}`;
      const CACHE_DURATION = 5 * 60 * 1000; // 5 mins

      if (!forceRefresh) {
         try {
            const cachedRaw = localStorage.getItem(CACHE_KEY);
            if (cachedRaw) {
               const cached = JSON.parse(cachedRaw);
               const age = Date.now() - cached.timestamp;
               if (age < CACHE_DURATION) {
                  // console.log(`[Loyalty] Using cached data (${(age/1000).toFixed(0)}s old)`);
                  setProducts(cached.products || []);
                  setConfig(cached.config || { isActive: false, baseAmount: 100, basePoints: 1, rounding: 'down', manualOrdersEarn: false, discountedOrdersEarn: true, combosEarn: true });
                  setRewards(cached.rewards || []);
                  setProductRules(cached.productRules || []);
                  setLoading(false);
                  return; // EXIT EARLY
               }
            }
         } catch (e) {
            console.warn('[Loyalty] Cache parse error', e);
         }
      }

      setLoading(true);
      try {
         const baseUrl = import.meta.env.VITE_SUPABASE_URL + '/rest/v1';
         const token = localStorage.getItem('access_token');
         // FIX: If token is stored as JSON string in legacy format, parse it. 
         // Better to rely on helper, but sticking to pattern used in InventoryManagement for consistency.
         let authToken = '';
         const storageKey = 'sb-yjxjyxhksedwfeueduwl-auth-token';
         const storedData = localStorage.getItem(storageKey);
         if (storedData) {
            try {
               const parsed = JSON.parse(storedData);
               authToken = parsed.access_token || '';
            } catch (e) { }
         }
         if (!authToken) authToken = token || ''; // fallback

         const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
         const headers: HeadersInit = {
            'apikey': apiKey,
            'Authorization': `Bearer ${authToken || apiKey}`,
            'Content-Type': 'application/json'
         };

         const fetchWithTimeout = async (url: string) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
            try {
               const response = await fetch(url, { headers, signal: controller.signal });
               clearTimeout(timeoutId);
               return response.ok ? await response.json() : [];
            } catch (e) {
               clearTimeout(timeoutId);
               console.warn('[Loyalty] Fetch timeout or error:', e);
               return [];
            }
         };

         // PARALLEL FETCHING
         console.log('[Loyalty] Fetching fresh data for store:', storeId);

         // PARALLEL FETCHING
         console.log('[Loyalty] Fetching fresh data for store:', storeId);

         const [pData, iData, cDataRaw, rData, ruleData] = await Promise.all([
            fetchWithTimeout(`${baseUrl}/products?store_id=eq.${storeId}`),
            fetchWithTimeout(`${baseUrl}/inventory_items?store_id=eq.${storeId}`),
            fetchWithTimeout(`${baseUrl}/loyalty_configs?store_id=eq.${storeId}&select=config`),
            fetchWithTimeout(`${baseUrl}/loyalty_rewards?store_id=eq.${storeId}`),
            fetchWithTimeout(`${baseUrl}/loyalty_product_rules?store_id=eq.${storeId}`)
         ]);

         // 1. Products & Inventory Items (Merged)
         const rawProducts = pData || [];
         const rawInventory = iData || [];

         // Map Inventory Items to Product shape
         const inventoryAsProducts = rawInventory.map((i: any) => ({
            id: i.id,
            name: i.name,
            image_url: i.image_url,
            store_id: i.store_id
         }));

         // Merge and remove duplicates by ID
         const allProductsMap = new Map();
         rawProducts.forEach((p: any) => allProductsMap.set(p.id, p));
         inventoryAsProducts.forEach((p: any) => {
            if (!allProductsMap.has(p.id)) {
               allProductsMap.set(p.id, p);
            }
         });
         const combinedProducts = Array.from(allProductsMap.values());

         setProducts(combinedProducts);

         // 2. Config
         let newConfig = { isActive: false, baseAmount: 100, basePoints: 1, rounding: 'down', manualOrdersEarn: false, discountedOrdersEarn: true, combosEarn: true };
         if (cDataRaw && cDataRaw.length > 0 && cDataRaw[0].config) {
            newConfig = cDataRaw[0].config;
         }
         setConfig(newConfig as any);

         // 3. Rewards
         const mappedRewards = (rData || []).map((r: any) => ({
            id: r.id,
            name: r.name,
            image: r.image_url || '',
            points: Number(r.points),
            is_active: r.is_active,
            product_id: r.product_id
         }));
         setRewards(mappedRewards);

         // 4. Rules
         const mappedRules = (ruleData || []).map((r: any) => ({
            productId: r.product_id,
            type: 'custom',
            multiplier: Number(r.multiplier)
         }));
         setProductRules(mappedRules);

         // SAVE TO CACHE
         localStorage.setItem(CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            products: combinedProducts,
            config: newConfig,
            rewards: mappedRewards,
            productRules: mappedRules
         }));

         console.log('[Loyalty] Data refreshed and cached.');

      } catch (err: any) {
         console.error('[Loyalty] Error:', err);
         addToast('Error al cargar lealtad: ' + err.message, 'error');
      } finally {
         setLoading(false);
      }
   };

   const handleSave = async () => {
      if (!profile?.store_id) return;
      setIsSaving(true);
      try {
         // 1. Save Config
         try {
            const { error: configError } = await (supabase.from('loyalty_configs' as any) as any).upsert({
               store_id: profile.store_id,
               config: config
            });
            if (configError) throw configError;
         } catch (e) {
            console.warn('Config save failed:', e);
            addToast('No se pudo guardar la configuración global. ¿Ejecutaste el SQL?', 'warning');
         }

         // 2. Save Rewards (Delete and re-insert)
         try {
            await (supabase.from('loyalty_rewards' as any) as any).delete().eq('store_id', profile.store_id);
            if (rewards.length > 0) {
               await (supabase.from('loyalty_rewards' as any) as any).insert(
                  rewards.map(r => ({
                     store_id: profile.store_id,
                     product_id: (r as any).product_id || null,
                     name: r.name,
                     points: r.points,
                     is_active: r.is_active,
                     image_url: r.image
                  }))
               );
            }
         } catch (e) {
            console.warn('Rewards save failed:', e);
            addToast('No se pudieron guardar las recompensas.', 'warning');
         }

         // 3. Save Product Rules
         try {
            await (supabase.from('loyalty_product_rules' as any) as any).delete().eq('store_id', profile.store_id);
            if (productRules.length > 0) {
               await (supabase.from('loyalty_product_rules' as any) as any).insert(
                  productRules.map(r => ({
                     store_id: profile.store_id,
                     product_id: r.productId,
                     multiplier: r.multiplier
                  }))
               );
            }
         } catch (e) {
            console.warn('Rules save failed:', e);
            addToast('No se pudieron guardar las reglas de puntos.', 'warning');
         }

         addToast('Ajustes de lealtad procesados', 'success');
         await fetchData();
      } catch (err: any) {
         console.error('Save error:', err);
         addToast('Error al procesar ajustes de lealtad', 'error');
      } finally {
         setIsSaving(false);
      }
   };

   // Simulator State
   const [simProduct, setSimProduct] = useState<string>('');
   const [simAmount, setSimAmount] = useState<number>(500);

   useEffect(() => {
      if (products.length > 0 && !simProduct) {
         setSimProduct(products[0].id);
      }
   }, [products]);

   const calculatedPoints = useMemo(() => {
      const rule = productRules.find(r => r.productId === simProduct) || { type: 'general', multiplier: 1 };
      if (rule.type === 'none') return 0;
      const basePoints = (simAmount / config.baseAmount) * config.basePoints;
      const finalPoints = basePoints * (rule.multiplier || 1);
      return config.rounding === 'down' ? Math.floor(finalPoints) : Math.round(finalPoints);
   }, [simProduct, simAmount, productRules, config]);

   const filteredProducts = useMemo(() => {
      return products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
   }, [products, searchTerm]);

   const handleUpdateRule = (rule: ProductLoyaltyRule) => {
      setProductRules(prev => {
         const exists = prev.find(r => r.productId === rule.productId);
         if (exists) return prev.map(r => r.productId === rule.productId ? rule : r);
         return [...prev, rule];
      });
      setEditingRule(null);
   };

   const handleAddReward = () => {
      const product = products.find(p => p.id === newReward.productId);
      if (product && newReward.points > 0) {
         const reward: Reward = {
            id: `rew-${Date.now()}`,
            name: product.name,
            image: product.image_url || '',
            points: newReward.points,
            is_active: true,
            product_id: product.id
         } as any;
         setRewards([...rewards, reward]);
         setShowRewardModal(false);
         setNewReward({ productId: '', points: 0 });
      }
   };

   const toggleRewardStatus = (id: string) => {
      setRewards(prev => prev.map(r => r.id === id ? { ...r, is_active: !r.is_active } : r));
   };

   const deleteReward = (id: string) => {
      setRewards(prev => prev.filter(r => r.id !== id));
   };

   const handleAIStrategy = async () => {
      setIsGeneratingStrategy(true);
      try {
         const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
         if (!apiKey) {
            setAiStrategy("Configuración de IA no detectada. Solicite activación al soporte.");
            return;
         }
         const ai = new GoogleGenerativeAI(apiKey);
         const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
         const prompt = `Analiza reglas: $100=1pt, Flat White x1.5. Sugiere 2 nuevas recompensas tácticas para retener clientes un 20% más. Sé agresivo y directo.`;
         const result = await model.generateContent(prompt);
         const response = await result.response;
         setAiStrategy(response.text() || "Comando no disponible.");
      } catch (e) {
         console.error("AI Error:", e);
         setAiStrategy("Error de sincronización con SquadAI.");
      } finally {
         setIsGeneratingStrategy(false);
      }
   };

   return (
      <div className="p-4 md:p-8 space-y-8 max-w-[1400px] mx-auto animate-in fade-in duration-500 pb-32">
         <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
            <div className="space-y-0.5">
               <div className="flex items-center gap-1.5 text-neon/60 font-bold text-[8px] uppercase tracking-[0.3em]">
                  <span className="size-1 rounded-full bg-neon shadow-neon-soft"></span>
                  RETENTION ENGINE ALPHA
               </div>
               <h1 className="text-3xl font-black italic-black tracking-tighter text-white uppercase leading-none">
                  Motor de <span className="text-neon">Lealtad</span>
               </h1>
            </div>

            <div className="flex bg-[#141714] p-1 rounded-xl border border-white/5 shadow-2xl overflow-x-auto no-scrollbar">
               <SubTabBtn active={activeSubTab === 'rewards'} onClick={() => setActiveSubTab('rewards')} icon="redeem">Catálogo Canje</SubTabBtn>
               <SubTabBtn active={activeSubTab === 'products'} onClick={() => setActiveSubTab('products')} icon="format_list_bulleted">Reglas Acumulación</SubTabBtn>
               <SubTabBtn active={activeSubTab === 'config'} onClick={() => setActiveSubTab('config')} icon="settings_suggest">Ajustes</SubTabBtn>
               <SubTabBtn active={activeSubTab === 'audit'} onClick={() => setActiveSubTab('audit')} icon="history">Auditoría</SubTabBtn>
            </div>

            <button
               onClick={handleSave}
               disabled={isSaving}
               className="px-6 py-2.5 bg-white text-black rounded-xl font-black text-[9px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl flex items-center gap-2"
            >
               <span className="material-symbols-outlined text-base">{isSaving ? 'sync' : 'save'}</span>
               {isSaving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
         </header>

         {aiStrategy && (
            <div className="p-6 rounded-3xl bg-neon/5 border border-neon/20 shadow-neon-soft animate-in slide-in-from-top-4">
               <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2.5">
                     <span className="material-symbols-outlined text-neon text-lg animate-pulse">auto_awesome</span>
                     <h4 className="text-[9px] font-black uppercase text-neon tracking-[0.2em] italic">SquadAI strategic prompt</h4>
                  </div>
                  <button onClick={() => setAiStrategy(null)} className="text-neon/30 hover:text-neon"><span className="material-symbols-outlined text-sm">close</span></button>
               </div>
               <p className="text-[11px] font-bold text-white/90 leading-relaxed italic">{aiStrategy}</p>
            </div>
         )}

         <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            <div className="xl:col-span-8 space-y-6">

               {/* CATALOGO DE CANJE (REWARDS) */}
               {activeSubTab === 'rewards' && (
                  <div className="space-y-6 animate-in slide-in-from-left-4">
                     <div className="flex justify-between items-center">
                        <h3 className="text-lg font-black italic-black uppercase text-white tracking-tighter">Productos <span className="text-neon">Disponibles</span></h3>
                        <button
                           onClick={() => setShowRewardModal(true)}
                           disabled={products.length === 0}
                           className="px-5 py-2.5 bg-neon text-black rounded-xl font-black text-[9px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-neon-soft flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                           <span className="material-symbols-outlined text-base">add_circle</span>
                           Nueva Recompensa
                        </button>
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {loading ? (
                           <div className="col-span-full py-20 flex flex-col items-center justify-center text-center opacity-20">
                              <div className="size-8 border-t-2 border-neon rounded-full animate-spin mb-4"></div>
                              <p className="text-[10px] font-black uppercase tracking-[0.3em]">Sincronizando Nodo...</p>
                           </div>
                        ) : rewards.length === 0 ? (
                           <div className="col-span-full py-20 border-2 border-dashed border-white/5 rounded-[2.5rem] flex flex-col items-center justify-center text-center opacity-30">
                              <span className="material-symbols-outlined text-5xl mb-4 text-white/20">loyalty</span>
                              <h4 className="text-sm font-black text-white uppercase italic tracking-widest mb-2">Canje Vacío</h4>
                              <p className="text-[9px] font-bold text-text-secondary uppercase tracking-[0.2em] max-w-[200px]">Vincula productos de tu inventario para activar recompensas.</p>
                           </div>
                        ) : (
                           rewards.map(reward => (
                              <div key={reward.id} className={`p-4 rounded-2xl border transition-all flex items-center gap-4 group ${reward.is_active ? 'bg-[#141714] border-white/5 hover:border-neon/30' : 'bg-black/40 border-white/5 opacity-50'}`}>
                                 <div className="size-16 rounded-xl bg-white/5 border border-white/5 overflow-hidden shrink-0">
                                    {reward.image ? (
                                       <img src={reward.image} className="size-full object-cover" />
                                    ) : (
                                       <div className="size-full flex items-center justify-center text-white/20"><span className="material-symbols-outlined">redeem</span></div>
                                    )}
                                 </div>
                                 <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start mb-1">
                                       <h4 className="text-[11px] font-black uppercase text-white italic truncate pr-2">{reward.name}</h4>
                                       <Toggle active={reward.is_active} onToggle={() => toggleRewardStatus(reward.id)} />
                                    </div>
                                    <div className="flex items-baseline gap-1.5">
                                       <span className="text-xl font-black text-neon italic-black leading-none">{reward.points}</span>
                                       <span className="text-[8px] font-bold text-neon/50 uppercase tracking-widest">PTS</span>
                                    </div>
                                 </div>
                                 <button onClick={() => deleteReward(reward.id)} className="size-8 rounded-lg bg-white/5 text-white/20 hover:text-primary hover:bg-primary/10 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100">
                                    <span className="material-symbols-outlined text-sm">delete</span>
                                 </button>
                              </div>
                           ))
                        )}
                     </div>
                  </div>
               )}

               {activeSubTab === 'config' && (
                  <div className="bg-[#141714] p-8 rounded-3xl border border-white/5 space-y-8 animate-in slide-in-from-left-4">
                     <div className="flex items-center justify-between border-b border-white/5 pb-6">
                        <div className="flex items-center gap-4">
                           <div className={`size-12 rounded-2xl flex items-center justify-center border transition-all ${config.isActive ? 'bg-neon/10 text-neon border-neon/20' : 'bg-white/5 text-white/20 border-white/5'}`}>
                              <span className="material-symbols-outlined text-2xl">verified</span>
                           </div>
                           <div>
                              <h3 className="text-sm font-black uppercase tracking-widest text-white leading-none mb-1.5">Estado del Programa</h3>
                              <p className="text-[9px] font-bold text-text-secondary uppercase opacity-40">{config.isActive ? 'Activo y emitiendo puntos tácticos.' : 'Sistema en modo pausa.'}</p>
                           </div>
                        </div>
                        <Toggle active={config.isActive} onToggle={() => setConfig({ ...config, isActive: !config.isActive })} />
                     </div>

                     <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${!config.isActive && 'opacity-20 pointer-events-none'}`}>
                        <div className="p-6 bg-white/[0.02] rounded-3xl border border-white/5 space-y-6">
                           <h4 className="text-[9px] font-black uppercase tracking-widest text-text-secondary italic">Conversión Base</h4>
                           <div className="flex items-center gap-4">
                              <div className="flex-1 space-y-1.5">
                                 <label className="text-[7px] font-black uppercase text-text-secondary opacity-60 ml-1">Monto ($)</label>
                                 <input type="number" value={config.baseAmount} onChange={e => setConfig({ ...config, baseAmount: parseInt(e.target.value) || 0 })} className="w-full h-10 px-4 rounded-xl bg-black/40 border border-white/10 text-sm font-black text-white outline-none focus:ring-1 focus:ring-neon/20" />
                              </div>
                              <span className="material-symbols-outlined text-white/10 pt-4">arrow_forward</span>
                              <div className="flex-1 space-y-1.5">
                                 <label className="text-[7px] font-black uppercase text-text-secondary opacity-60 ml-1">Puntos</label>
                                 <input type="number" value={config.basePoints} onChange={e => setConfig({ ...config, basePoints: parseInt(e.target.value) || 0 })} className="w-full h-10 px-4 rounded-xl bg-black/40 border border-white/10 text-sm font-black text-neon outline-none focus:ring-1 focus:ring-neon/20" />
                              </div>
                           </div>
                        </div>
                        <div className="p-6 bg-white/[0.02] rounded-3xl border border-white/5 space-y-6">
                           <h4 className="text-[9px] font-black uppercase tracking-widest text-text-secondary italic">Modo Redondeo</h4>
                           <div className="flex bg-black/40 p-1 rounded-xl h-10">
                              <button onClick={() => setConfig({ ...config, rounding: 'down' })} className={`flex-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${config.rounding === 'down' ? 'bg-white/10 text-white' : 'text-white/20'}`}>Suelo (1.9=1)</button>
                              <button onClick={() => setConfig({ ...config, rounding: 'normal' })} className={`flex-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${config.rounding === 'normal' ? 'bg-white/10 text-white' : 'text-white/20'}`}>Cercano (1.9=2)</button>
                           </div>
                        </div>
                     </div>
                  </div>
               )}

               {activeSubTab === 'products' && (
                  <div className="bg-[#141714] rounded-3xl border border-white/5 overflow-hidden animate-in slide-in-from-right-4">
                     <div className="p-6 border-b border-white/5 flex justify-between items-center">
                        <h3 className="text-lg font-black italic-black uppercase text-white tracking-tighter">Matriz <span className="text-neon">Insumos</span></h3>
                        <div className="relative group">
                           <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-white/20 text-sm">search</span>
                           <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="h-9 w-48 pl-9 pr-3 rounded-lg bg-black/40 border border-white/10 text-[9px] font-bold text-white uppercase outline-none focus:ring-1 focus:ring-neon/20" placeholder="BUSCAR..." />
                        </div>
                     </div>
                     <div className="overflow-x-auto">
                        {loading ? (
                           <div className="py-20 text-center opacity-20 italic">
                              <p className="text-[10px] font-black uppercase tracking-[0.2em]">Cargando Productos...</p>
                           </div>
                        ) : products.length === 0 ? (
                           <div className="py-20 flex flex-col items-center justify-center text-center opacity-20 border-t border-white/5">
                              <span className="material-symbols-outlined text-4xl mb-4">inventory_2</span>
                              <p className="text-[10px] font-black uppercase tracking-widest px-10 leading-relaxed">Sin productos detectados para aplicar reglas de acumulación.</p>
                           </div>
                        ) : (
                           <table className="w-full text-left">
                              <tbody className="divide-y divide-white/[0.02]">
                                 {filteredProducts.map(p => {
                                    const rule = productRules.find(r => r.productId === p.id) || { type: 'general', multiplier: 1 };
                                    return (
                                       <tr key={p.id} className="hover:bg-white/[0.01] transition-all group">
                                          <td className="px-6 py-4">
                                             <div className="flex items-center gap-3">
                                                <img src={p.image_url || 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&q=80&w=200'} className="size-8 rounded-lg object-cover grayscale group-hover:grayscale-0 transition-all border border-white/5" />
                                                <div>
                                                   <p className="text-[10px] font-black text-white uppercase italic leading-none">{p.name}</p>
                                                   <p className="text-[7px] text-text-secondary font-bold uppercase opacity-30 mt-1">PRODUCTO</p>
                                                </div>
                                             </div>
                                          </td>
                                          <td className="px-6 py-4 text-center">
                                             <span className="text-[12px] font-black text-neon italic tracking-tighter">x{rule.multiplier || 1}</span>
                                          </td>
                                          <td className="px-6 py-4 text-right">
                                             <button onClick={() => setEditingRule(rule as ProductLoyaltyRule || { productId: p.id, type: 'general', multiplier: 1 })} className="size-8 rounded-lg bg-white/5 flex items-center justify-center text-text-secondary hover:text-neon transition-colors"><span className="material-symbols-outlined text-base">edit</span></button>
                                          </td>
                                       </tr>
                                    );
                                 })}
                              </tbody>
                           </table>
                        )}
                     </div>
                  </div>
               )}

               {activeSubTab === 'audit' && (
                  <div className="bg-[#141714] rounded-3xl border border-white/5 p-6 space-y-4 animate-in fade-in">
                     <h3 className="text-xs font-black uppercase text-white/30 tracking-[0.2em] mb-4">LOG ECONOMÍA INTERNA</h3>
                     <div className="py-12 flex flex-col items-center justify-center text-center opacity-20 italic">
                        <span className="material-symbols-outlined text-4xl mb-4">history</span>
                        <p className="text-[9px] font-black uppercase tracking-widest">Sin actividad auditada disponible.</p>
                     </div>
                  </div>
               )}
            </div>

            {/* SIMULADOR LATERAL */}
            <aside className="xl:col-span-4 space-y-6">
               <div className="bg-[#141714] p-6 rounded-3xl border border-white/5 shadow-2xl space-y-6">
                  <div className="flex items-center gap-3 mb-2">
                     <span className="material-symbols-outlined text-neon text-lg">calculate</span>
                     <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white italic">Puntos Simulator</h3>
                  </div>
                  <div className="space-y-4">
                     <div className="space-y-1.5">
                        <label className="text-[7px] font-black uppercase text-text-secondary ml-1">Producto</label>
                        <select value={simProduct} onChange={e => setSimProduct(e.target.value)} className="w-full h-9 px-3 rounded-lg bg-black/40 border border-white/10 text-[10px] font-bold text-white uppercase outline-none">
                           {products.length > 0 ? (
                              products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
                           ) : (
                              <option value="">Sin productos</option>
                           )}
                        </select>
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-[7px] font-black uppercase text-text-secondary ml-1">Monto ($)</label>
                        <input type="number" value={simAmount} onChange={e => setSimAmount(parseFloat(e.target.value) || 0)} className="w-full h-11 px-4 rounded-xl bg-black/40 border border-white/10 text-xl font-black text-white outline-none" />
                     </div>
                     <div className="py-6 rounded-2xl bg-neon/10 border border-neon/20 flex flex-col items-center justify-center shadow-inner">
                        <p className="text-[8px] font-black uppercase text-neon tracking-widest mb-1">Gana</p>
                        <h4 className="text-5xl font-black italic-black text-white leading-none tracking-tighter">{calculatedPoints}</h4>
                        <p className="text-[8px] font-bold text-neon/40 uppercase mt-2">PUNTOS</p>
                     </div>
                  </div>
               </div>

               <button onClick={handleAIStrategy} disabled={isGeneratingStrategy} className="w-full py-4 bg-neon text-black rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-neon-soft active:scale-95 transition-all flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-base">{isGeneratingStrategy ? 'sync' : 'auto_awesome'}</span>
                  {isGeneratingStrategy ? 'PROCESANDO...' : 'SQUADAI OPTIMIZE'}
               </button>
            </aside>
         </div>

         {/* MODAL: ALTA DE RECOMPENSA */}
         {showRewardModal && (
            <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
               <div className="absolute inset-0 bg-black/95" onClick={() => setShowRewardModal(false)}></div>
               <div className="relative bg-[#0D0F0D] rounded-3xl shadow-2xl w-full max-w-sm p-8 border border-white/10 animate-in zoom-in-95">
                  <h3 className="text-xl font-black italic-black uppercase text-white tracking-tighter mb-6">Nueva <span className="text-neon">Recompensa</span></h3>
                  <div className="space-y-5">
                     <div className="space-y-1.5">
                        <label className="text-[8px] font-black uppercase text-text-secondary tracking-widest ml-1">Producto a Canjear</label>
                        <select
                           value={newReward.productId}
                           onChange={e => setNewReward({ ...newReward, productId: e.target.value })}
                           className="w-full h-10 px-4 rounded-xl bg-black/40 border border-white/10 text-[10px] font-bold text-white uppercase outline-none focus:ring-1 focus:ring-neon/20"
                        >
                           <option value="">Seleccionar Item...</option>
                           {products.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                           ))}
                        </select>
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-[8px] font-black uppercase text-text-secondary tracking-widest ml-1">Costo en Puntos</label>
                        <input
                           type="number"
                           value={newReward.points}
                           onChange={e => setNewReward({ ...newReward, points: parseInt(e.target.value) || 0 })}
                           className="w-full h-10 px-4 rounded-xl bg-black/40 border border-white/10 text-[12px] font-black text-white outline-none focus:ring-1 focus:ring-neon/20"
                           placeholder="0"
                        />
                     </div>
                     <div className="pt-4 flex gap-3">
                        <button onClick={() => setShowRewardModal(false)} className="flex-1 py-3 text-[9px] font-black uppercase text-white/30 hover:text-white transition-colors">Cancelar</button>
                        <button onClick={handleAddReward} className="flex-[2] py-3 bg-neon text-black rounded-xl font-black uppercase text-[9px] tracking-widest shadow-xl active:scale-95 transition-all">Crear Regla</button>
                     </div>
                  </div>
               </div>
            </div>
         )}

         {/* MODAL: EDITOR DE REGLA (ACUMULACIÓN) */}
         {editingRule && (
            <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
               <div className="absolute inset-0 bg-black/95" onClick={() => setEditingRule(null)}></div>
               <div className="relative bg-[#0D0F0D] rounded-3xl shadow-2xl w-full max-w-sm p-8 border border-white/10 animate-in zoom-in-95">
                  <h3 className="text-xl font-black italic-black uppercase text-white tracking-tighter mb-6">Regla <span className="text-neon">Individual</span></h3>
                  <div className="space-y-6">
                     <div className="space-y-2">
                        <label className="text-[8px] font-black uppercase text-text-secondary tracking-widest">Multiplicador Táctico</label>
                        <div className="grid grid-cols-4 gap-2">
                           {[0.5, 1, 1.5, 2].map(m => (
                              <button key={m} onClick={() => setEditingRule({ ...editingRule, multiplier: m })} className={`py-2.5 rounded-xl text-[10px] font-black border transition-all ${editingRule.multiplier === m ? 'bg-neon text-black border-neon' : 'bg-white/5 text-white/20 border-white/5'}`}>x{m}</button>
                           ))}
                        </div>
                     </div>
                     <button onClick={() => handleUpdateRule(editingRule)} className="w-full py-4 bg-primary text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all">APLICAR PROTOCOLO</button>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
};

const SubTabBtn: React.FC<{ active: boolean, onClick: () => void, icon: string, children: React.ReactNode }> = ({ active, onClick, icon, children }) => (
   <button onClick={onClick} className={`px-6 py-2.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2.5 whitespace-nowrap ${active ? 'bg-white/10 text-white shadow-sm' : 'text-white/20 hover:text-white'}`}>
      <span className="material-symbols-outlined text-base">{icon}</span>
      {children}
   </button>
);

const Toggle: React.FC<{ active: boolean, onToggle: () => void }> = ({ active, onToggle }) => (
   <button onClick={onToggle} className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all ${active ? 'bg-neon shadow-neon-soft' : 'bg-white/10'}`}>
      <span className={`h-4 w-4 transform rounded-full bg-white transition ${active ? 'translate-x-5' : 'translate-x-0'}`} />
   </button>
);

export default Loyalty;
