
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ToastSystem';
import {
  InventoryItem, UnitType, Category, RecipeComponent
} from '../types';
import { GoogleGenerativeAI } from "@google/generative-ai";
import InvoiceProcessor from './InvoiceProcessor';

type DrawerTab = 'details' | 'recipe' | 'history';
type InventoryFilter = 'all' | 'ingredient' | 'sellable';
type WizardMethod = 'selector' | 'manual' | 'bulk' | 'invoice';
type ManualType = 'ingredient' | 'recipe';

const InventoryManagement: React.FC = () => {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('details');
  const [filter, setFilter] = useState<InventoryFilter>('all');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | 'special-open' | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Recipe Builder State
  const [isAddingRecipeItem, setIsAddingRecipeItem] = useState(false);
  const [targetMarkup, setTargetMarkup] = useState<number>(200);
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [selectedIngredientToAdd, setSelectedIngredientToAdd] = useState<InventoryItem | null>(null);
  const [addQuantity, setAddQuantity] = useState<string>('');

  // AI & Wizard State
  const [showInsumoWizard, setShowInsumoWizard] = useState(false);
  const [wizardMethod, setWizardMethod] = useState<WizardMethod>('selector');
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

  // Manual Creation State
  const [newItemForm, setNewItemForm] = useState({
    name: '',
    category_id: '',
    unit_type: 'unit' as UnitType,
    cost: 0,
    current_stock: 0,
    min_stock: 0,
    price: 0
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Category Creation State
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);

  // Invoice Processor Modal
  const [showInvoiceProcessor, setShowInvoiceProcessor] = useState(false);

  useEffect(() => {
    // Ejecutar inmediatamente - fetchData tiene fallback de store_id
    fetchData();
  }, []);

  const fetchData = async (forceRefresh = false) => {
    const storeId = profile?.store_id || 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533';
    if (!storeId) return;

    // CACHE STRATEGY
    const CACHE_KEY = `inventory_cache_${storeId}`;
    const CACHE_DURATION = 5 * 60 * 1000; // 5 mins

    // 1. Check Cache
    if (!forceRefresh) {
      try {
        const cachedRaw = localStorage.getItem(CACHE_KEY);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          const age = Date.now() - cached.timestamp;
          if (age < CACHE_DURATION) {
            console.log(`[Inventory] Using cached data (${(age / 1000).toFixed(0)}s old)`);
            setCategories(cached.categories || []);
            setItems(cached.items || []);
            setLoading(false);
            return; // EXIT EARLY
          }
        }
      } catch (e) {
        console.warn('[Inventory] Cache parse error', e);
      }
    }

    console.log('[Inventory] Fetching fresh data...');
    setLoading(true);

    try {
      const baseUrl = import.meta.env.VITE_SUPABASE_URL + '/rest/v1';
      const storageKey = 'sb-yjxjyxhksedwfeueduwl-auth-token';
      const storedData = localStorage.getItem(storageKey);
      let token = '';

      if (storedData) {
        try {
          const parsed = JSON.parse(storedData);
          token = parsed.access_token || '';
        } catch (e) {
          // ignore
        }
      }

      const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers: HeadersInit = {
        'apikey': apiKey,
        'Authorization': `Bearer ${token || apiKey}`,
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
          console.warn('[Inventory] Fetch timeout or error:', e);
          return [];
        }
      };

      // 2. Fetch Fresh Data
      const [insumos, prods, cats] = await Promise.all([
        fetchWithTimeout(`${baseUrl}/inventory_items?store_id=eq.${storeId}`),
        fetchWithTimeout(`${baseUrl}/products?store_id=eq.${storeId}`),
        fetchWithTimeout(`${baseUrl}/categories?store_id=eq.${storeId}`)
      ]);

      // 3. Transform & Set State
      const mappedCategories = (cats || []).map((c: any) => ({
        id: c.id,
        store_id: c.store_id,
        name: c.name,
        type: c.type || 'ingredient'
      }));
      setCategories(mappedCategories);

      // Transform Insumos
      const transformedInsumos: InventoryItem[] = (insumos || []).map((i: any) => ({
        id: i.id,
        cafe_id: i.store_id,
        name: i.name,
        sku: i.sku || 'N/A',
        item_type: 'ingredient' as const,
        unit_type: (i.unit_type || 'unit') as UnitType,
        image_url: i.image_url || 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&q=80&w=200',
        is_active: true,
        min_stock: i.min_stock_alert || 0,
        current_stock: i.current_stock || 0,
        cost: i.cost || 0,
        category_ids: i.category_id ? [i.category_id] : [],
        presentations: [],
        closed_packages: [],
        open_packages: []
      }));

      // Transform Products
      const transformedProducts: InventoryItem[] = (prods || []).map((p: any) => ({
        id: p.id,
        cafe_id: p.store_id,
        name: p.name,
        sku: 'SKU-' + (p.id || '').slice(0, 4).toUpperCase(),
        item_type: 'sellable' as const,
        unit_type: 'unit' as UnitType,
        image_url: p.image_url || 'https://images.unsplash.com/photo-1580828343064-fde4fc206bc6?auto=format&fit=crop&q=80&w=200',
        is_active: p.available,
        min_stock: 0,
        current_stock: 0,
        cost: 0,
        price: p.price || 0,
        category_ids: p.category_id ? [p.category_id] : [],
        description: p.description || '',
        presentations: [],
        closed_packages: [],
        open_packages: []
      }));

      const finalItems = [...transformedInsumos, ...transformedProducts];
      setItems(finalItems);

      // 4. Save to Cache
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        items: finalItems,
        categories: mappedCategories
      }));

      console.log('[Inventory] Data refreshed and cached.');
    } catch (err: any) {
      console.error('[Inventory] Error:', err);
      addToast('Error al cargar datos', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      addToast('Ingresa un nombre para la categoría', 'error');
      return;
    }

    const storeId = profile?.store_id || 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533';
    setCreatingCategory(true);

    try {
      const storageKey = 'sb-yjxjyxhksedwfeueduwl-auth-token';
      const storedData = localStorage.getItem(storageKey);
      let token = '';

      if (storedData) {
        try {
          const parsed = JSON.parse(storedData);
          token = parsed.access_token || '';
        } catch (e) {
          console.error('[Inventory] Error parsing token:', e);
        }
      }

      const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      // Get next position
      const maxPosition = categories.reduce((max, c) => Math.max(max, c.position || 0), 0);

      const response = await fetch(
        'https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/categories',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': apiKey,
            'Authorization': token ? `Bearer ${token}` : `Bearer ${apiKey}`,
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            store_id: storeId,
            name: newCategoryName.trim(),
            type: 'ingredient',
            position: maxPosition + 1
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          setCategories(prev => [...prev, {
            id: data[0].id,
            store_id: data[0].store_id,
            name: data[0].name,
            type: data[0].type || 'ingredient',
            position: data[0].position || maxPosition + 1
          }]);
        }
        addToast('✅ Categoría creada', 'success');
        setNewCategoryName('');
      } else {
        const errData = await response.json();
        addToast('Error: ' + (errData.message || 'No se pudo crear'), 'error');
      }
    } catch (err: any) {
      addToast('Error: ' + (err.message || 'Desconocido'), 'error');
    } finally {
      setCreatingCategory(false);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm('¿Eliminar esta categoría?')) return;

    try {
      const storageKey = 'sb-yjxjyxhksedwfeueduwl-auth-token';
      const storedData = localStorage.getItem(storageKey);
      let token = '';
      if (storedData) {
        try {
          const parsed = JSON.parse(storedData);
          token = parsed.access_token || '';
        } catch (e) { }
      }

      const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(
        `https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/categories?id=eq.${categoryId}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': apiKey,
            'Authorization': token ? `Bearer ${token}` : `Bearer ${apiKey}`
          }
        }
      );

      if (response.ok) {
        setCategories(prev => prev.filter(c => c.id !== categoryId));
        addToast('Categoría eliminada', 'success');
      } else {
        addToast('Error al eliminar', 'error');
      }
    } catch (err: any) {
      addToast('Error: ' + err.message, 'error');
    }
  };

  const handleMoveCategory = async (categoryId: string, direction: 'up' | 'down') => {
    const sorted = [...categories].sort((a, b) => (a.position || 0) - (b.position || 0));
    const idx = sorted.findIndex(c => c.id === categoryId);

    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === sorted.length - 1) return;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const currentCat = sorted[idx];
    const swapCat = sorted[swapIdx];

    // Swap positions
    const currentPos = currentCat.position || idx;
    const swapPos = swapCat.position || swapIdx;

    try {
      const storageKey = 'sb-yjxjyxhksedwfeueduwl-auth-token';
      const storedData = localStorage.getItem(storageKey);
      let token = '';
      if (storedData) {
        try {
          const parsed = JSON.parse(storedData);
          token = parsed.access_token || '';
        } catch (e) { }
      }

      const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers = {
        'Content-Type': 'application/json',
        'apikey': apiKey,
        'Authorization': token ? `Bearer ${token}` : `Bearer ${apiKey}`
      };

      // Update both categories
      await Promise.all([
        fetch(`https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/categories?id=eq.${currentCat.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ position: swapPos })
        }),
        fetch(`https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/categories?id=eq.${swapCat.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ position: currentPos })
        })
      ]);

      // Update local state
      setCategories(prev => prev.map(c => {
        if (c.id === currentCat.id) return { ...c, position: swapPos };
        if (c.id === swapCat.id) return { ...c, position: currentPos };
        return c;
      }));

    } catch (err: any) {
      addToast('Error al mover: ' + err.message, 'error');
    }
  };

  const handleCreateManualItem = async () => {
    if (!newItemForm.name) {
      addToast('Ingresa un nombre para el ítem', 'error');
      return;
    }

    const storeId = profile?.store_id || 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533';

    try {
      const storageKey = 'sb-yjxjyxhksedwfeueduwl-auth-token';
      const storedData = localStorage.getItem(storageKey);
      let token = '';
      if (storedData) {
        try {
          const parsed = JSON.parse(storedData);
          token = parsed.access_token || '';
        } catch (e) { }
      }

      const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers = {
        'Content-Type': 'application/json',
        'apikey': apiKey,
        'Authorization': token ? `Bearer ${token}` : `Bearer ${apiKey}`,
        'Prefer': 'return=representation'
      };

      const response = await fetch(
        'https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name: newItemForm.name,
            unit_type: newItemForm.unit_type,
            cost: newItemForm.cost,
            current_stock: newItemForm.current_stock,
            min_stock_alert: newItemForm.min_stock,
            store_id: storeId,
            category_id: newItemForm.category_id || null
          })
        }
      );

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Error al crear');
      }

      addToast('✅ Ítem creado correctamente', 'success');
      setShowInsumoWizard(false);
      setNewItemForm({ name: '', category_id: '', unit_type: 'unit', cost: 0, current_stock: 0, min_stock: 0, price: 0 });
      fetchData();

    } catch (err: any) {
      console.error('Create item error:', err);
      addToast('Error: ' + err.message, 'error');
    }
  };

  const generateAIGourmetDescription = async () => {
    if (!selectedItem || aiGenerating) return;
    setAiGenerating(true);
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
      if (!apiKey) {
        addToast("Configuración de IA no detectada.", "info");
        return;
      }
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const ingredientsList = selectedItem.recipe?.map(r => {
        const ing = items.find(i => i.id === r.ingredientId);
        return ing?.name;
      }).join(', ') || 'ingredientes premium';

      const prompt = `Escribe una descripción gourmet corta (máx 150 caracteres) para un producto de cafetería/restaurante llamado "${selectedItem.name}". Utiliza estos ingredientes: ${ingredientsList}. Sé tentador y profesional.`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const description = response.text() || '';

      // Update in DB if it's a product
      if (selectedItem.item_type === 'sellable') {
        const { error } = await supabase
          .from('products')
          .update({ description })
          .eq('id', selectedItem.id);

        if (error) throw error;
        setSelectedItem({ ...selectedItem, description });
        addToast('Descripción AI generada', 'success');
      }
    } catch (err: any) {
      addToast('Error AI: ' + err.message, 'error');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleConfirmAddIngredient = async () => {
    if (!selectedItem || !selectedIngredientToAdd || !addQuantity) return;
    const qty = parseFloat(addQuantity);

    try {
      const storageKey = 'sb-yjxjyxhksedwfeueduwl-auth-token';
      const storedData = localStorage.getItem(storageKey);
      let token = '';
      if (storedData) {
        try {
          const parsed = JSON.parse(storedData);
          token = parsed.access_token || '';
        } catch (e) { }
      }

      const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers = {
        'Content-Type': 'application/json',
        'apikey': apiKey,
        'Authorization': token ? `Bearer ${token}` : `Bearer ${apiKey}`,
        'Prefer': 'resolution=merge-duplicates'
      };

      const response = await fetch(
        'https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/product_recipes?on_conflict=product_id,inventory_item_id',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            product_id: selectedItem.id,
            inventory_item_id: selectedIngredientToAdd.id,
            quantity_required: qty
          })
        }
      );

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Error al vincular ingrediente');
      }

      addToast('Receta actualizada', 'success');
      setIsAddingRecipeItem(false);
      // Removed fetchData() to avoid full reload, just accept local update logic below
      // fetchData(); 

      // Update local selected item to reflect cost change immediately
      const newComp = { ingredientId: selectedIngredientToAdd.id, quantity: qty };
      const newRecipe = [...(selectedItem.recipe || [])];
      const idx = newRecipe.findIndex(r => r.ingredientId === selectedIngredientToAdd.id);
      if (idx >= 0) newRecipe[idx] = newComp;
      else newRecipe.push(newComp);

      setSelectedItem({ ...selectedItem, recipe: newRecipe });
    } catch (err: any) {
      console.error('Add Ingredient Error:', err);
      addToast('Error: ' + err.message, 'error');
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesFilter = filter === 'all' ||
        (filter === 'ingredient' && item.item_type === 'ingredient') ||
        (filter === 'sellable' && item.item_type === 'sellable');

      // Category filter
      const matchesCategory = activeCategoryFilter === null ||
        (activeCategoryFilter === 'special-open' && (item.open_packages?.length || 0) > 0) ||
        (item.category_ids && item.category_ids.includes(activeCategoryFilter as string));

      return matchesSearch && matchesFilter && matchesCategory;
    });
  }, [items, searchTerm, filter, activeCategoryFilter]);

  const kpis = useMemo(() => {
    const list = items.filter(i => i.item_type === 'ingredient');
    const totalVal = list.reduce((acc, item) => acc + (item.cost * item.current_stock), 0);
    const lowStockCount = list.filter(i => i.current_stock <= i.min_stock).length;
    return {
      totalValue: totalVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      lowStock: lowStockCount
    };
  }, [items]);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto animate-in fade-in duration-500 pb-32 relative">
      {/* HEADER COMPACTO */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-neon/60 font-bold text-[8px] uppercase tracking-[0.2em]">
            <span className="size-1 rounded-full bg-neon shadow-[0_0_5px_#4ADE80]"></span>
            COFFESQUAD INVENTORY SYSTEM
          </div>
          <h1 className="text-2xl font-black italic-black tracking-tighter text-text-main dark:text-white uppercase leading-none">
            Control <span className="text-neon/80">Operativo</span>
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowInvoiceProcessor(true)}
            className="px-4 py-1.5 rounded-lg bg-white/5 text-white/60 font-bold text-[9px] uppercase tracking-widest border border-white/10 flex items-center gap-2 transition-all hover:text-neon hover:border-neon/30 hover:bg-neon/5"
          >
            <span className="material-symbols-outlined text-base">document_scanner</span>
            ESCANEAR FACTURA
          </button>
          <button onClick={() => { setShowInsumoWizard(true); setWizardMethod('selector'); }} className="px-4 py-1.5 rounded-lg bg-primary dark:bg-neon/10 text-white dark:text-neon font-bold text-[9px] uppercase tracking-widest border border-primary dark:border-neon/20 flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-neon/5">
            <span className="material-symbols-outlined text-base">add_circle</span>
            NUEVO REGISTRO
          </button>
        </div>
      </header>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard label="Valorización Total" value={`$${kpis.totalValue}`} icon="payments" color="text-neon bg-neon/5" />
        <KpiCard label="Alerta de Stock" value={`${kpis.lowStock}`} icon="warning" color={kpis.lowStock > 0 ? "text-primary bg-primary/5" : "text-neon bg-neon/5"} />
        <KpiCard label="Índice de Ítems" value={`${items.length}`} icon="inventory" color="text-white bg-white/5" />
      </div>

      <div className="flex flex-col gap-3">
        {/* Type Filters */}
        <div className="flex bg-[#141714] p-1 rounded-xl border border-white/[0.04] shadow-soft max-w-fit">
          <TabBtn active={filter === 'all'} onClick={() => setFilter('all')}>VISTA GLOBAL</TabBtn>
          <TabBtn active={filter === 'ingredient'} onClick={() => setFilter('ingredient')}>INSUMOS</TabBtn>
          <TabBtn active={filter === 'sellable'} onClick={() => setFilter('sellable')}>PRODUCTOS</TabBtn>
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-full py-1">
          <button
            onClick={() => setActiveCategoryFilter(null)}
            className={`px-4 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest whitespace-nowrap transition-all border ${activeCategoryFilter === null
              ? 'border-neon/60 text-neon bg-neon/5'
              : 'border-white/10 text-white/50 hover:text-white/70 hover:border-white/20'
              }`}
          >
            TODAS
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategoryFilter(cat.id)}
              className={`px-4 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest whitespace-nowrap transition-all border ${activeCategoryFilter === cat.id
                ? 'border-neon/60 text-neon bg-neon/5'
                : 'border-white/10 text-white/50 hover:text-white/70 hover:border-white/20'
                }`}
            >
              {cat.name}
            </button>
          ))}
          <button
            onClick={() => setActiveCategoryFilter('special-open')}
            className={`px-4 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest whitespace-nowrap flex items-center gap-1.5 transition-all border ${activeCategoryFilter === 'special-open'
              ? 'border-neon/60 text-neon bg-neon/5'
              : 'border-white/10 text-white/50 hover:text-white/70 hover:border-white/20'
              }`}
          >
            <span className="material-symbols-outlined text-sm">lock_open</span>
            ABIERTOS
          </button>
          <button
            onClick={() => setShowCategoryModal(true)}
            className="ml-auto px-2 py-2 rounded-lg text-white/30 hover:text-neon border border-transparent hover:border-neon/20 transition-all"
            title="Crear nueva categoría"
          >
            <span className="material-symbols-outlined text-base">add_circle</span>
          </button>
        </div>
      </div>

      {/* BUSCADOR */}
      <div className="relative group">
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-neon transition-colors">search</span>
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Rastrear ítem por SKU o nombre..."
          className="w-full bg-[#141714] border border-white/[0.04] rounded-2xl h-12 pl-12 pr-4 text-[10px] font-bold text-white uppercase tracking-widest outline-none focus:border-neon/30 transition-all placeholder:text-white/10"
        />
      </div>

      {/* TABLA PRINCIPAL */}
      <div className="bg-[#141714] rounded-2xl border border-white/[0.04] shadow-2xl overflow-hidden min-h-[400px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-20 space-y-4">
            <div className="size-10 border-t-2 border-neon rounded-full animate-spin"></div>
            <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Cargando Matrix...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-20 text-center animate-in fade-in zoom-in duration-700">
            <div className="size-24 rounded-full bg-neon/5 border border-neon/10 flex items-center justify-center text-neon/40 mb-8">
              <span className="material-symbols-outlined text-5xl">inventory_2</span>
            </div>
            <h3 className="text-2xl font-black text-white uppercase italic-black tracking-tighter mb-4">
              Nodo <span className="text-neon">sin Datos</span>
            </h3>
            <p className="text-[#71766F] text-[11px] font-bold uppercase tracking-[0.2em] max-w-sm mb-10 leading-relaxed opacity-60">
              Inicia la carga de suministros o productos para activar el panel de control.
            </p>
            <button
              onClick={() => { setShowInsumoWizard(true); setWizardMethod('selector'); }}
              className="px-10 py-4 bg-neon text-black rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-neon/20 hover:scale-[1.05] active:scale-95 transition-all"
            >
              Cargar Primer Ítem
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/[0.01] border-b border-white/[0.03]">
                  <th className="px-6 py-4 text-[8px] font-black uppercase text-text-secondary tracking-widest">Identidad Operativa</th>
                  <th className="px-6 py-4 text-[8px] font-black uppercase text-text-secondary tracking-widest">Stock Neto</th>
                  <th className="px-6 py-4 text-[8px] font-black uppercase text-text-secondary tracking-widest text-center">Clase</th>
                  <th className="px-6 py-4 text-[8px] font-black uppercase text-text-secondary tracking-widest text-center">Menú</th>
                  <th className="px-6 py-4 text-[8px] font-black uppercase text-text-secondary tracking-widest text-center">Costo Est.</th>
                  <th className="px-6 py-4 text-[8px] font-black uppercase text-text-secondary tracking-widest text-right">Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {filteredItems.map(item => (
                  <tr
                    key={item.id}
                    className="hover:bg-white/[0.01] transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4" onClick={() => { setSelectedItem(item); setDrawerTab('details'); setIsAddingRecipeItem(false); }}>
                      <div className="flex items-center gap-4">
                        <div className="size-10 rounded-xl overflow-hidden bg-black/40 border border-white/5 relative">
                          <img src={item.image_url} className="size-full object-cover group-hover:scale-110 transition-transform duration-500" />
                        </div>
                        <div>
                          <p className="text-[11px] font-black dark:text-white uppercase italic tracking-tight leading-none mb-1">{item.name}</p>
                          <p className="text-[7px] text-text-secondary font-bold uppercase opacity-30 tracking-widest group-hover:text-neon/50">SKU: {item.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4" onClick={() => { setSelectedItem(item); setDrawerTab('details'); setIsAddingRecipeItem(false); }}>
                      <div className="flex flex-col">
                        <span className={`font-black italic text-[14px] ${item.item_type === 'ingredient' && item.current_stock <= item.min_stock ? 'text-primary' : 'text-white'}`}>
                          {item.item_type === 'sellable' ? '--' : item.current_stock.toLocaleString()}
                          <span className="text-[8px] uppercase opacity-30 ml-1">{item.unit_type}</span>
                        </span>
                        {item.item_type === 'ingredient' && (
                          <span className="text-[7px] font-bold text-neon/60 uppercase tracking-wider flex items-center gap-1">
                            <span className="material-symbols-outlined text-[9px]">inventory_2</span>
                            {item.open_count || 0} ABIERTOS
                          </span>
                        )}
                        {item.item_type === 'ingredient' && item.current_stock <= item.min_stock && (
                          <span className="text-[6px] font-black text-primary uppercase tracking-widest">CRÍTICO: BAJO MÍNIMO</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center" onClick={() => { setSelectedItem(item); setDrawerTab('details'); setIsAddingRecipeItem(false); }}>
                      <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase border-shimmer ${item.item_type === 'ingredient' ? 'bg-neon/5 text-neon border-neon/20' : 'bg-white/5 text-white/50 border-white/10'}`}>
                        {item.item_type === 'ingredient' ? 'INSUMO' : 'PRODUCTO'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {/* Minimal Cute Switch */}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const newValue = !item.is_menu_visible;
                          // Optimistic update
                          setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_menu_visible: newValue } : i));

                          try {
                            const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
                            const storageKey = 'sb-yjxjyxhksedwfeueduwl-auth-token';
                            const storedData = localStorage.getItem(storageKey);
                            let token = '';
                            if (storedData) token = JSON.parse(storedData).access_token;

                            await fetch(`https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?id=eq.${item.id}`, {
                              method: 'PATCH',
                              headers: {
                                'Content-Type': 'application/json',
                                'apikey': apiKey,
                                'Authorization': `Bearer ${token || apiKey}`,
                                'Prefer': 'return=minimal'
                              },
                              body: JSON.stringify({ is_menu_visible: newValue })
                            });
                            addToast(newValue ? 'Item visible en menú' : 'Item oculto del menú', 'success');
                          } catch (err) {
                            console.error(err);
                            addToast('Error al actualizar', 'error');
                            // Revert
                            setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_menu_visible: !newValue } : i));
                          }
                        }}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-neon focus-visible:ring-offset-2 focus-visible:ring-offset-black ${item.is_menu_visible ? 'bg-neon' : 'bg-white/10'}`}
                      >
                        <span className="sr-only">Toggle Menu Visibility</span>
                        <span
                          className={`${item.is_menu_visible ? 'translate-x-5 shadow-[0_0_10px_#4ADE80]' : 'translate-x-1 bg-white/40'} inline-block h-3 w-3 transform rounded-full bg-white transition duration-300 ease-in-out`}
                        />
                      </button>
                    </td>
                    <td className="px-6 py-4 text-center font-mono text-[10px] text-white/60" onClick={() => { setSelectedItem(item); setDrawerTab('details'); setIsAddingRecipeItem(false); }}>
                      ${item.cost.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="size-8 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center hover:bg-neon hover:text-black transition-all group-hover:border-neon/30">
                        <span className="material-symbols-outlined text-lg">bolt</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DRAWER LATERAL PREMIUM */}
      <div className={`fixed inset-y-0 right-0 z-[200] h-screen w-full max-w-[420px] bg-[#0D0F0D] border-l border-white/10 shadow-3xl transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] flex flex-col ${selectedItem ? 'translate-x-0' : 'translate-x-full opacity-0'}`}>
        {selectedItem && (
          <>
            <div className="p-6 flex justify-between items-center border-b border-white/5 bg-gradient-to-r from-neon/5 to-transparent">
              <div className="flex items-center gap-4">
                <div className="size-14 rounded-2xl bg-black border border-white/10 overflow-hidden shadow-2xl relative">
                  <img src={selectedItem.image_url} className="size-full object-cover" />
                  <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl"></div>
                </div>
                <div>
                  <h3 className="text-xl font-black italic-black text-white uppercase tracking-tighter leading-none mb-1">{selectedItem.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-neon animate-pulse"></span>
                    <p className="text-[8px] font-black text-neon uppercase tracking-[0.2em]">SISTEMA DE ASIGNACIÓN BOM</p>
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedItem(null)} className="size-10 rounded-2xl bg-white/5 flex items-center justify-center text-text-secondary hover:text-white transition-all hover:bg-white/10">
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="flex border-b border-white/5 bg-black/40 px-2">
              <DrawerTabBtn active={drawerTab === 'details'} onClick={() => setDrawerTab('details')} label="FICHA" icon="analytics" />
              <DrawerTabBtn active={drawerTab === 'recipe'} onClick={() => setDrawerTab('recipe')} label="RECETA" icon="biotech" />
              <DrawerTabBtn active={drawerTab === 'history'} onClick={() => setDrawerTab('history')} label="LOGS" icon="database" />
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar pb-32">
              {drawerTab === 'details' && (
                <div className="space-y-8 animate-in slide-in-from-right-8 duration-500">
                  <div className="grid grid-cols-2 gap-4">
                    <MetricBlock label="VALOR ACTUAL" value={`$${selectedItem.cost.toFixed(2)}`} icon="payments" color="text-neon" />
                    <MetricBlock label="GANANCIA" value={selectedItem.price ? `$${(selectedItem.price - selectedItem.cost).toFixed(2)}` : '--'} icon="trending_up" color="text-green-400" />
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <label className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em]">Descripción Gourmet AI</label>
                      <button
                        onClick={generateAIGourmetDescription}
                        disabled={aiGenerating}
                        className="text-[8px] font-black text-neon uppercase flex items-center gap-1 hover:brightness-125 disabled:opacity-30"
                      >
                        <span className="material-symbols-outlined text-xs">{aiGenerating ? 'sync' : 'auto_awesome'}</span>
                        {aiGenerating ? 'GENERANDO...' : 'RE-GENERAR'}
                      </button>
                    </div>
                    <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-1 h-full bg-neon/20 group-hover:bg-neon transition-all"></div>
                      <p className="text-[11px] text-white/70 leading-relaxed font-medium">
                        {selectedItem.description || "Sin descripción generada. Haz click arriba para que la IA cree una descripción tentadora para este producto."}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[8px] font-black uppercase text-white/40 tracking-[0.2em]">Precio Venta</label>
                      <div className="h-12 bg-black border border-white/10 rounded-2xl flex items-center justify-center font-black text-lg text-white">
                        ${selectedItem.price?.toFixed(2) || '0.00'}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black uppercase text-white/40 tracking-[0.2em]">Margen Neto</label>
                      <div className="h-12 bg-black border border-white/10 rounded-2xl flex items-center justify-center font-black text-lg text-green-500">
                        {selectedItem.price ? `${(((selectedItem.price - selectedItem.cost) / selectedItem.cost) * 100).toFixed(0)}%` : '0%'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {drawerTab === 'recipe' && (
                <div className="space-y-6 animate-in slide-in-from-right-8 duration-500">
                  <div className="flex justify-between items-center bg-neon/5 p-4 rounded-2xl border border-neon/10">
                    <div>
                      <h4 className="text-[10px] font-black uppercase text-white italic leading-none">Protocolo de Insumos</h4>
                      <p className="text-[8px] font-bold text-neon uppercase tracking-widest mt-1">COSTO TEÓRICO: ${selectedItem.cost.toFixed(2)}</p>
                    </div>
                    {!isAddingRecipeItem && (
                      <button onClick={() => setIsAddingRecipeItem(true)} className="flex items-center gap-1 bg-neon text-black px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl shadow-neon/20">
                        <span className="material-symbols-outlined text-base">link</span>
                        VINCULAR
                      </button>
                    )}
                  </div>

                  {isAddingRecipeItem && (
                    <div className="bg-[#141714] border border-white/10 rounded-2xl p-5 space-y-4 shadow-3xl animate-in fade-in slide-in-from-top-4 relative">
                      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-neon to-transparent opacity-50"></div>

                      {!selectedIngredientToAdd ? (
                        <div className="space-y-3">
                          <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Buscar Insumo del Stock</label>
                          <div className="relative">
                            <input
                              autoFocus
                              value={ingredientSearch}
                              onChange={(e) => setIngredientSearch(e.target.value)}
                              placeholder="ESCRIBE PARA FILTRAR..."
                              className="w-full bg-black border border-white/10 rounded-xl h-11 pl-10 pr-4 text-[10px] font-bold text-white uppercase outline-none focus:border-neon/50 transition-all placeholder:text-white/10"
                            />
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-white/20 text-lg">search</span>
                          </div>
                          <div className="max-h-60 overflow-y-auto no-scrollbar space-y-1 p-1">
                            {items.filter(i => i.item_type === 'ingredient' && i.name.toLowerCase().includes(ingredientSearch.toLowerCase())).map(ing => (
                              <button
                                key={ing.id}
                                onClick={() => setSelectedIngredientToAdd(ing)}
                                className="w-full p-3 rounded-xl hover:bg-white/5 flex items-center gap-4 transition-all text-left group"
                              >
                                <img src={ing.image_url} className="size-8 rounded-lg object-cover opacity-50 group-hover:opacity-100 transition-opacity" />
                                <div className="flex-1">
                                  <p className="text-[10px] font-bold text-white uppercase group-hover:text-neon">{ing.name}</p>
                                  <p className="text-[7px] font-bold text-white/30 uppercase">COSTO: ${ing.cost.toFixed(2)} / {ing.unit_type}</p>
                                </div>
                                <span className="material-symbols-outlined text-white/10 group-hover:text-neon">add_circle</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <img src={selectedIngredientToAdd.image_url} className="size-10 rounded-xl object-cover bg-black" />
                              <div>
                                <p className="text-[11px] font-black text-white uppercase italic">{selectedIngredientToAdd.name}</p>
                                <p className="text-[7px] font-bold text-neon/60 uppercase">DATO: $ {selectedIngredientToAdd.cost.toFixed(2)} por {selectedIngredientToAdd.unit_type}</p>
                              </div>
                            </div>
                            <button onClick={() => setSelectedIngredientToAdd(null)} className="text-[8px] font-black text-white/20 hover:text-white uppercase tracking-widest border-b border-white/10 pb-0.5 transition-all">Cambiar</button>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-[8px] font-black text-white/30 uppercase tracking-widest">Cantidad ({selectedIngredientToAdd.unit_type})</label>
                              <input
                                type="number"
                                value={addQuantity}
                                onChange={e => setAddQuantity(e.target.value)}
                                className="w-full bg-black border border-white/10 rounded-xl h-12 px-4 text-xl font-black text-white outline-none focus:border-neon/50 text-center"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[8px] font-black text-white/30 uppercase tracking-widest">Impacto Costo</label>
                              <div className="h-12 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center font-black text-neon text-xl font-mono">
                                ${((parseFloat(addQuantity) || 0) * selectedIngredientToAdd.cost).toFixed(2)}
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-3 pt-2">
                            <button onClick={() => setIsAddingRecipeItem(false)} className="flex-1 py-4 bg-white/5 text-white/40 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-white/10 transition-all">DESARTICULAR</button>
                            <button onClick={handleConfirmAddIngredient} className="flex-[2] py-4 bg-neon text-black rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-neon/10 hover:brightness-110 active:scale-95 transition-all">CONFIRMAR VÍNCULO</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-3">
                    {selectedItem.recipe?.map((comp, idx) => {
                      const insumo = items.find(i => i.id === comp.ingredientId);
                      if (!insumo) return null;
                      return (
                        <div key={idx} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex justify-between items-center group hover:bg-white/[0.04] transition-all">
                          <div className="flex items-center gap-4">
                            <img src={insumo.image_url} className="size-10 rounded-xl object-cover grayscale group-hover:grayscale-0 transition-all" />
                            <div>
                              <p className="text-[11px] font-black text-white uppercase italic tracking-tight">{insumo.name}</p>
                              <p className="text-[8px] font-bold text-neon/80 uppercase mt-0.5">{comp.quantity} {insumo.unit_type} • x ${insumo.cost.toFixed(2)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-5">
                            <p className="text-[12px] font-black text-white font-mono">$ {(comp.quantity * insumo.cost).toFixed(2)}</p>
                            <button className="size-8 rounded-xl bg-white/5 flex items-center justify-center text-white/20 hover:text-primary transition-all">
                              <span className="material-symbols-outlined text-lg">delete</span>
                            </button>
                          </div>
                        </div>
                      )
                    })}
                    {(!selectedItem.recipe || selectedItem.recipe.length === 0) && (
                      <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-3xl space-y-4">
                        <span className="material-symbols-outlined text-white/10 text-4xl">inventory</span>
                        <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] text-center max-w-[200px]">SIN MATERIA PRIMA VINCULADA</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 bg-black/80 border-t border-white/10 flex gap-3 backdrop-blur-xl">
              <button className="flex-[3] py-4 rounded-2xl bg-white text-black font-black text-[10px] uppercase tracking-widest shadow-2xl hover:scale-[1.02] transition-all">ACTUALIZAR ÍTEM</button>
              <button className="flex-1 py-4 rounded-2xl border border-white/10 bg-white/5 text-white/20 font-black text-[9px] uppercase tracking-widest hover:text-primary hover:border-primary/30 transition-all">BAJA</button>
            </div>
          </>
        )}
      </div>

      {/* MODAL CARGA SUMINISTRO */}
      {showInsumoWizard && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowInsumoWizard(false)}></div>
          <div className="relative bg-[#0D0F0D] rounded-3xl shadow-2xl w-full max-w-md border border-white/10 animate-in zoom-in-95 duration-300 overflow-hidden">

            {/* Header */}
            <div className="p-6 border-b border-white/[0.04] flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tighter">
                  <span className="text-white">CARGA</span>{' '}
                  <span className="text-neon">SUMINISTRO</span>
                </h2>
                <p className="text-white/30 text-[9px] uppercase tracking-[0.15em] mt-0.5">
                  Formulario de registro manual
                </p>
              </div>
              <button
                onClick={() => setShowInsumoWizard(false)}
                className="size-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Form */}
            <div className="p-6 space-y-5">
              {/* Nombre del Ítem + Categoría */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[8px] font-black text-white/40 uppercase tracking-widest block mb-2">
                    Nombre del Ítem
                  </label>
                  <input
                    type="text"
                    value={newItemForm.name}
                    onChange={(e) => setNewItemForm({ ...newItemForm, name: e.target.value })}
                    placeholder="Ej: CAFÉ GRANO COLOMBIA"
                    className="w-full bg-black border border-neon/50 rounded-xl h-12 px-4 text-sm font-bold text-white outline-none focus:border-neon placeholder:text-white/20"
                  />
                </div>
                <div>
                  <label className="text-[8px] font-black text-white/40 uppercase tracking-widest block mb-2">
                    Categoría
                  </label>
                  <select
                    value={newItemForm.category_id}
                    onChange={(e) => setNewItemForm({ ...newItemForm, category_id: e.target.value })}
                    className="w-full bg-black border border-white/10 rounded-xl h-12 px-4 text-sm font-bold text-white/60 outline-none focus:border-neon/50 appearance-none cursor-pointer"
                  >
                    <option value="">Seleccionar Categoría</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Unidad + Costo Unit. + Stock Inicial */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-[8px] font-black text-white/40 uppercase tracking-widest block mb-2">
                    Unidad
                  </label>
                  <select
                    value={newItemForm.unit_type}
                    onChange={(e) => setNewItemForm({ ...newItemForm, unit_type: e.target.value as UnitType })}
                    className="w-full bg-black border border-white/10 rounded-xl h-12 px-3 text-sm font-bold text-white outline-none focus:border-neon/50 appearance-none cursor-pointer"
                  >
                    <option value="unit">UNIDAD</option>
                    <option value="gram">GRAMOS</option>
                    <option value="kg">KG</option>
                    <option value="ml">ML</option>
                    <option value="liter">LITROS</option>
                  </select>
                </div>
                <div>
                  <label className="text-[8px] font-black text-white/40 uppercase tracking-widest block mb-2">
                    Costo Unit.
                  </label>
                  <input
                    type="number"
                    value={newItemForm.cost || ''}
                    onChange={(e) => setNewItemForm({ ...newItemForm, cost: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full bg-black border border-white/10 rounded-xl h-12 px-4 text-sm font-bold text-white outline-none focus:border-neon/50 placeholder:text-white/20"
                  />
                </div>
                <div>
                  <label className="text-[8px] font-black text-white/40 uppercase tracking-widest block mb-2">
                    Stock Inicial
                  </label>
                  <input
                    type="number"
                    value={newItemForm.current_stock || ''}
                    onChange={(e) => setNewItemForm({ ...newItemForm, current_stock: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full bg-black border border-white/10 rounded-xl h-12 px-4 text-sm font-bold text-white outline-none focus:border-neon/50 placeholder:text-white/20"
                  />
                </div>
              </div>

              {/* Proveedor + Alerta Mínimo */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[8px] font-black text-white/40 uppercase tracking-widest block mb-2">
                    Proveedor
                  </label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    className="w-full bg-black border border-white/10 rounded-xl h-12 px-4 text-sm font-bold text-white/40 outline-none focus:border-neon/50 placeholder:text-white/20"
                  />
                </div>
                <div>
                  <label className="text-[8px] font-black text-white/40 uppercase tracking-widest block mb-2">
                    Alerta Mínimo
                  </label>
                  <input
                    type="number"
                    value={newItemForm.min_stock || ''}
                    onChange={(e) => setNewItemForm({ ...newItemForm, min_stock: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full bg-black border border-white/10 rounded-xl h-12 px-4 text-sm font-bold text-white outline-none focus:border-neon/50 placeholder:text-white/20"
                  />
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-6 border-t border-white/[0.04] flex gap-4">
              <button
                onClick={() => setShowInsumoWizard(false)}
                className="flex-1 py-4 rounded-xl bg-transparent text-white/40 font-black text-[10px] uppercase tracking-widest hover:text-white transition-all"
              >
                Volver
              </button>
              <button
                onClick={handleCreateManualItem}
                disabled={!newItemForm.name}
                className="flex-[2] py-4 rounded-xl bg-white text-black font-black text-[11px] uppercase tracking-widest hover:bg-white/90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Guardar Ítem
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GESTIÓN DE CATEGORÍAS */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-[#141714] border border-white/10 rounded-3xl p-6 w-full max-w-lg animate-in zoom-in-95 duration-300 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black text-white uppercase tracking-tight">
                Gestionar <span className="text-neon">Categorías</span>
              </h3>
              <button
                onClick={() => { setShowCategoryModal(false); setNewCategoryName(''); }}
                className="size-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Lista de categorías existentes */}
            <div className="flex-1 overflow-y-auto mb-4 space-y-2 min-h-[200px]">
              {categories.length === 0 ? (
                <div className="text-center py-8 text-white/20 text-xs">
                  No hay categorías creadas
                </div>
              ) : (
                categories
                  .sort((a, b) => (a.position || 0) - (b.position || 0))
                  .map((cat, idx) => (
                    <div
                      key={cat.id}
                      className="flex items-center gap-3 p-3 bg-black/30 rounded-xl border border-white/5 group hover:border-white/10 transition-all"
                    >
                      {/* Drag handle */}
                      <div className="flex flex-col gap-0.5 cursor-grab text-white/20 hover:text-white/40">
                        <button
                          onClick={() => handleMoveCategory(cat.id, 'up')}
                          disabled={idx === 0}
                          className="p-1 hover:bg-white/10 rounded disabled:opacity-20 disabled:cursor-not-allowed"
                        >
                          <span className="material-symbols-outlined text-sm">keyboard_arrow_up</span>
                        </button>
                        <button
                          onClick={() => handleMoveCategory(cat.id, 'down')}
                          disabled={idx === categories.length - 1}
                          className="p-1 hover:bg-white/10 rounded disabled:opacity-20 disabled:cursor-not-allowed"
                        >
                          <span className="material-symbols-outlined text-sm">keyboard_arrow_down</span>
                        </button>
                      </div>

                      {/* Category info */}
                      <div className="flex-1">
                        <p className="text-white font-bold text-sm">{cat.name}</p>
                        <p className="text-white/30 text-[9px] uppercase tracking-wider">
                          Posición: {idx + 1}
                        </p>
                      </div>

                      {/* Delete button */}
                      <button
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="size-8 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                        title="Eliminar categoría"
                      >
                        <span className="material-symbols-outlined text-base">delete</span>
                      </button>
                    </div>
                  ))
              )}
            </div>

            {/* Crear nueva categoría */}
            <div className="border-t border-white/10 pt-4">
              <label className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-2 block">
                Nueva Categoría
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Nombre de la categoría..."
                  className="flex-1 bg-black border border-white/10 rounded-xl h-12 px-4 text-sm font-bold text-white outline-none focus:border-neon/50 transition-all placeholder:text-white/20"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateCategory()}
                />
                <button
                  onClick={handleCreateCategory}
                  disabled={creatingCategory || !newCategoryName.trim()}
                  className="px-6 h-12 rounded-xl bg-neon text-black font-black text-[10px] uppercase tracking-widest shadow-lg shadow-neon/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
                >
                  {creatingCategory ? (
                    <span className="material-symbols-outlined text-base animate-spin">sync</span>
                  ) : (
                    <span className="material-symbols-outlined text-base">add</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* INVOICE PROCESSOR MODAL */}
      <InvoiceProcessor
        isOpen={showInvoiceProcessor}
        onClose={() => setShowInvoiceProcessor(false)}
      />
    </div>
  );
};

// Componentes Auxiliares con Estética Reforzada
const TabBtn: React.FC<{ active: boolean, onClick: () => void, children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-6 py-2.5 rounded-lg text-[9px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${active ? 'bg-neon text-black shadow-lg shadow-neon/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
  >
    {children}
  </button>
);

const DrawerTabBtn: React.FC<{ active: boolean, onClick: () => void, label: string, icon: string }> = ({ active, onClick, label, icon }) => (
  <button
    onClick={onClick}
    className={`flex-1 flex flex-col items-center py-4 border-b-2 gap-1.5 transition-all duration-500 ${active ? 'border-neon text-neon bg-neon/5' : 'border-transparent text-white/20 hover:text-white/40'}`}
  >
    <span className="material-symbols-outlined text-[18px]">{icon}</span>
    <span className="text-[10px] font-black uppercase tracking-[0.2em]">{label}</span>
  </button>
);

const KpiCard: React.FC<{ label: string, value: string, icon: string, color: string }> = ({ label, value, icon, color }) => (
  <div className="bg-[#141714] border border-white/[0.04] p-5 rounded-2xl flex items-center justify-between group hover:border-white/10 transition-all">
    <div className="space-y-1">
      <p className="text-[10px] font-black text-text-secondary uppercase tracking-[0.1em]">{label}</p>
      <p className="text-2xl font-black italic-black text-white tracking-tighter">{value}</p>
    </div>
    <div className={`size-12 rounded-2xl flex items-center justify-center ${color} shadow-inner`}>
      <span className="material-symbols-outlined text-2xl">{icon}</span>
    </div>
  </div>
);

const MetricBlock: React.FC<{ label: string, value: string, icon: string, color?: string }> = ({ label, value, icon, color = "text-white" }) => (
  <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2 group hover:bg-white/[0.04] transition-all">
    <div className="flex items-center gap-2">
      <span className="material-symbols-outlined text-xs text-white/20">{icon}</span>
      <label className="text-[8px] font-black uppercase text-white/30 tracking-widest">{label}</label>
    </div>
    <p className={`text-xl font-black italic-black ${color} tracking-tighter`}>{value}</p>
  </div>
);

const InputBlock: React.FC<{ label: string, children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-2">
    <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] ml-2">{label}</label>
    {children}
  </div>
);

export default InventoryManagement;
