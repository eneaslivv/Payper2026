
// Triggering Vercel Redeploy: 2025-12-30T01:45:00
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ToastSystem';
import {
  InventoryItem, UnitType, Category, RecipeComponent
} from '../types';
import { GoogleGenerativeAI } from "@google/generative-ai";
import InvoiceProcessor from './InvoiceProcessor';
import { useOffline } from '../contexts/OfflineContext';

type DrawerTab = 'details' | 'recipe' | 'history';
type InventoryFilter = 'all' | 'ingredient' | 'sellable' | 'recipes' | 'logistics';
type WizardMethod = 'selector' | 'manual' | 'bulk' | 'invoice';
type ManualType = 'ingredient' | 'recipe';
// Added Type for Stock Movement
interface StockMovement {
  id: number;
  qty_delta: number;
  unit_type: string;
  reason: string;
  created_at: string;
  order_id?: string;
}

const STOCK_MOVEMENT_REASON_LABELS: Record<string, string> = {
  order_paid: 'Venta',
  sale: 'Venta',
  direct_sale: 'Venta Directa',
  recipe_consumption: 'Receta',
  variant_override: 'Variante',
  open_package: 'Apertura Paquete',
  adjustment: 'Ajuste',
  restock: 'Reingreso',
  purchase: 'Compra',
  transfer: 'Transferencia',
  loss: 'Pérdida',
  waste: 'Pérdida'
};

// Auxiliary Components (Hoisted)
function TabBtn({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-2.5 rounded-lg text-[9px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${active ? 'bg-neon text-black shadow-lg shadow-neon/10' : 'text-white/40 hover:text-neon hover:bg-white/5'}`}
    >
      {children}
    </button>
  );
}

function DrawerTabBtn({ active, onClick, label, icon }: { active: boolean, onClick: () => void, label: string, icon: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center py-4 border-b-2 gap-1.5 transition-all duration-500 ${active ? 'border-neon text-neon bg-white/5' : 'border-transparent text-white/20 hover:text-white/40'}`}
    >
      <span className="material-symbols-outlined text-[18px]">{icon}</span>
      <span className="text-[10px] font-black uppercase tracking-[0.2em]">{label}</span>
    </button>
  );
}

function KpiCard({ label, value, icon, color }: { label: string, value: string, icon: string, color: string }) {
  return (
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
}

function MetricBlock({ label, value, icon, color = "text-neon" }: { label: string, value: string, icon: string, color?: string }) {
  return (
    <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2 group hover:bg-white/[0.04] transition-all">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-xs text-white/20">{icon}</span>
        <label className="text-[8px] font-black uppercase text-white/30 tracking-widest">{label}</label>
      </div>
      <p className={`text-xl font-black italic-black ${color} tracking-tighter`}>{value}</p>
    </div>
  );
}

function InputBlock({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] ml-2">{label}</label>
      {children}
    </div>
  );
}

// Location Stock Breakdown Component
function LocationStockBreakdown({ itemId, unitType, packageSize, onLocationClick, refreshKey }: { itemId: string, unitType: string, packageSize: number, onLocationClick?: (locationName: string) => void, refreshKey?: number }) {
  const [locations, setLocations] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchLocations = async () => {
      setLoading(true);
      try {
        const { data, error } = await (supabase.rpc as any)('get_item_stock_by_locations', { p_item_id: itemId });
        if (error) throw error;
        setLocations(data || []);
      } catch (err) {
        console.error('Error fetching location stock:', err);
        setLocations([]);
      } finally {
        setLoading(false);
      }
    };
    if (itemId) fetchLocations();
  }, [itemId, refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-white/30 text-[10px]">
        <span className="animate-pulse">●</span> Cargando ubicaciones...
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <div className="text-[10px] text-white/30 italic">Sin stock registrado en ubicaciones.</div>
    );
  }

  const locationTypeIcons: Record<string, string> = {
    base: 'warehouse',
    bar: 'local_bar',
    kitchen: 'restaurant',
    storage: 'inventory_2',
    custom: 'place'
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      {locations.map((loc) => {
        // Calculate open package details - using numeric values correctly
        const closedUnits = Number(loc.closed_units || 0);
        const openPackagesCount = Number(loc.open_packages_count || 0);
        const openRemainingSum = Number(loc.open_remaining_sum || 0);
        const effectiveStock = Number(loc.effective_stock || 0);

        // Calculate percentage using the actual remaining sum from RPC
        const openPackagePercentage = openPackagesCount > 0 && packageSize > 0
          ? Math.round((openRemainingSum / (openPackagesCount * packageSize)) * 100)
          : 0;

        return (
          <button
            key={loc.location_id}
            onClick={() => onLocationClick?.(loc.location_name)}
            className={`p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1 hover:bg-white/5 transition-all text-left group ${onLocationClick ? 'cursor-pointer hover:border-neon/30 hover:shadow-lg hover:shadow-neon/5' : ''}`}
          >
            <div className="flex items-center gap-2">
              <span className={`material-symbols-outlined text-sm ${onLocationClick ? 'text-neon/60 group-hover:text-neon' : 'text-neon/60'}`}>
                {locationTypeIcons[loc.location_type] || 'place'}
              </span>
              <span className={`text-[10px] font-bold truncate ${onLocationClick ? 'text-white/80 group-hover:text-white' : 'text-white/80'}`}>{loc.location_name}</span>
            </div>

            {/* Closed units */}
            <div className="flex items-baseline gap-1 pl-6">
              <span className="text-lg font-black text-neon">{closedUnits}</span>
              <span className="text-[8px] font-bold text-white/30">un cerrados</span>
            </div>

            {/* Open packages info */}
            {openPackagesCount > 0 && (
              <div className="pl-6 pt-1 border-t border-white/5 mt-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-amber-400">
                    {openPackagesCount} abierto{openPackagesCount > 1 ? 's' : ''}
                  </span>
                  <span className="text-[10px] font-black text-amber-400/80">
                    {openPackagePercentage}%
                  </span>
                </div>
                {/* Mini progress bar */}
                <div className="h-1 w-full bg-white/10 rounded-full mt-1 overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all"
                    style={{ width: `${Math.max(0, Math.min(100, openPackagePercentage))}%` }}
                  />
                </div>
                <span className="text-[8px] text-white/20 mt-0.5 block">
                  ~{openRemainingSum.toFixed(1)} {unitType} restantes
                </span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

import { StockTransferModal } from '../components/StockTransferModal';
import { StockAdjustmentModal } from '../components/StockAdjustmentModal';
import { AIStockInsight } from '../components/AIStockInsight';
import { LogisticsView } from '../components/LogisticsView';
import { EditPriceModal } from '../components/EditPriceModal';

const InventoryManagement: React.FC = () => {
  const { profile } = useAuth();
  const { pendingDeliveryOrders, orders: offlineOrders } = useOffline();
  const { addToast } = useToast();
  // Use valid tenant ID from DB query if profile is missing it
  const storeId = profile?.store_id || 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  // ARS Currency Formatter
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(value);
  };
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items; // Keep ref synced with state
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [adjustmentModal, setAdjustmentModal] = useState<{ open: boolean, type: 'WASTE' | 'ADJUSTMENT' | 'PURCHASE' }>({ open: false, type: 'WASTE' });
  const [drawerTab, setDrawerTab] = useState<'details' | 'recipe' | 'history'>('details');
  const [stockRefreshKey, setStockRefreshKey] = useState(0); // Force refresh on realtime updates

  // Lazy init for persistence
  const [filter, setFilter] = useState<InventoryFilter>(() => {
    return (localStorage.getItem('inventory_filter_v1') as InventoryFilter) || 'all';
  });

  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | 'special-open' | null>(null);

  const [activeLocationFilter, setActiveLocationFilter] = useState<string | null>(() => {
    return localStorage.getItem('inventory_location_filter_v1') || null;
  });
  const [searchTerm, setSearchTerm] = useState('');

  // History State
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);

  // Recipe Builder State
  const [isAddingRecipeItem, setIsAddingRecipeItem] = useState(false);
  const [targetMarkup, setTargetMarkup] = useState<number>(200);
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [selectedIngredientToAdd, setSelectedIngredientToAdd] = useState<InventoryItem | null>(null);
  const [addQuantity, setAddQuantity] = useState<string>('');

  // Recipes Tab State
  interface ProductRecipeDB {
    product_id: string;
    inventory_item_id: string;
    quantity_required: number;
  }
  const [productRecipes, setProductRecipes] = useState<ProductRecipeDB[]>([]);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [customRecipeName, setCustomRecipeName] = useState('');
  const [showIngredientSelector, setShowIngredientSelector] = useState(false);

  // Custom Price & Margin State
  const [customPrice, setCustomPrice] = useState<string>(''); // Allow empty string for clean input
  // Fix for Margin Input Bug
  const [marginInputValue, setMarginInputValue] = useState<string>('');
  const [isEditingMargin, setIsEditingMargin] = useState(false);

  // Update custom price default when not set
  useEffect(() => {
    if (!showRecipeModal) {
      setCustomPrice('');
      return;
    }
  }, [showRecipeModal]);

  // UI State for Recipe Ingredients with flexible units
  interface RecipeIngredientUI {
    id: string;
    qty: number; // Display numeric value
    unit: 'kg' | 'g' | 'l' | 'ml' | 'un'; // Usage unit
  }
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredientUI[]>([]);

  // AI & Wizard State
  const [showInsumoWizard, setShowInsumoWizard] = useState(false);
  const [wizardMethod, setWizardMethod] = useState<WizardMethod>('selector');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [aiGenerating, setAiGenerating] = useState(false);

  // Manual Creation State
  const [newItemForm, setNewItemForm] = useState({
    name: '',
    category_id: '',
    unit_type: 'unit' as UnitType,
    package_size: 0,
    content_unit: '',
    cost: 0,
    current_stock: 0,
    min_stock: 0,
    price: 0
  });

  const generateCategorySlug = (categoryName: string): string => {
    if (!categoryName) return '';

    return categoryName
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const getCategoryNameById = async (categoryId: string | null): Promise<string> => {
    if (!categoryId) return '';

    try {
      const { data, error } = await supabase
        .from('categories')
        .select('name')
        .eq('id', categoryId)
        .single();

      if (error) {
        console.error('Error fetching category:', error);
        return '';
      }

      return data?.name || '';
    } catch (err) {
      console.error('Exception fetching category:', err);
      return '';
    }
  };

  // Category Creation State
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);

  // Invoice Processor Modal
  const [showInvoiceProcessor, setShowInvoiceProcessor] = useState(false);

  // Open Package Modal
  const [showOpenPackageModal, setShowOpenPackageModal] = useState(false);
  const [newPackageCapacity, setNewPackageCapacity] = useState<number>(1000);

  // Edit Price Modal
  const [showEditPriceModal, setShowEditPriceModal] = useState(false);



  useEffect(() => {
    // Ejecutar inmediatamente - fetchData tiene fallback de store_id
    fetchData();
  }, []);

  // Persist filters
  useEffect(() => {
    localStorage.setItem('inventory_filter_v1', filter);
  }, [filter]);

  useEffect(() => {
    if (activeLocationFilter) {
      localStorage.setItem('inventory_location_filter_v1', activeLocationFilter);
    } else {
      localStorage.removeItem('inventory_location_filter_v1');
    }
  }, [activeLocationFilter]);

  // REALTIME: Suscripción para actualización automática de inventario
  useEffect(() => {
    const storeId = profile?.store_id || 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533';
    if (!storeId) return;
    console.log('[Realtime] Suscribiendo a cambios de inventario para store_id:', storeId);

    const channel = supabase
      .channel('inventory-realtime-v2')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'inventory_items'
        },
        (payload) => {
          console.log('[Realtime] ✅ UPDATE en inventory_items recibido:', payload);
          // Match by ID - check against current items using Ref to avoid stale closure
          const itemId = (payload.new as any).id;
          const currentItems = itemsRef.current;
          const existsInList = currentItems.some(i => i.id === itemId);

          // Always update if it's in our list OR if it matches our store_id (as fallback)
          if (existsInList || (payload.new as any).store_id === storeId) {
            console.log('[Realtime] 🔄 Updating item:', (payload.new as any).name);
            const newStock = parseFloat((payload.new as any).current_stock);
            const newClosedStock = parseFloat((payload.new as any).closed_stock || '0');
            const newOpenPackages = (payload.new as any).open_packages || [];
            const newOpenCount = parseInt((payload.new as any).open_count || '0');

            // Actualizar el estado directamente
            setItems(prev => {
              const updated = prev.map(item =>
                item.id === itemId
                  ? {
                    ...item,
                    current_stock: newStock,
                    closed_stock: newClosedStock,
                    open_packages: newOpenPackages,
                    open_count: newOpenCount,
                    cost: (payload.new as any).cost || item.cost
                  }
                  : item
              );
              // Invalidar cache para forzar refresh en próxima carga
              localStorage.removeItem(`inventory_cache_v7_${storeId}`);
              return updated;
            });

            addToast('📦 Stock actualizado: ' + (payload.new as any).name, 'success');

            // Force LocationStockBreakdown to refresh
            setStockRefreshKey(prev => prev + 1);

            // Backup: Force full refetch to ensure consistency with DB (e.g. ensure closed_stock matches locations)
            fetchData(true, true);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'stock_movements'
        },
        (payload) => {
          console.log('[Realtime] Nuevo movimiento de stock:', payload);
          // Refrescar historial si el drawer está abierto
          if (drawerTab === 'history' && selectedItem) {
            fetchStockHistory(selectedItem.id);
          }
          // Forzar refetch del inventario para sincronizar
          fetchData(true);
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Estado de conexión:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] ✅ Conectado exitosamente al canal de inventario');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] ❌ Error en el canal');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };

  }, [profile?.store_id]);

  // SYNC DRAWER: Update selectedItem when main items list changes (Realtime/Fetch)
  useEffect(() => {
    if (selectedItem) {
      const freshItem = items.find(i => i.id === selectedItem.id);
      if (freshItem) {
        // Compare using string conversion to avoid type mismatch issues
        const hasChanged =
          String(freshItem.current_stock) !== String(selectedItem.current_stock) ||
          String(freshItem.closed_stock) !== String(selectedItem.closed_stock) ||
          String(freshItem.open_count) !== String(selectedItem.open_count) ||
          JSON.stringify(freshItem.open_packages) !== JSON.stringify(selectedItem.open_packages);

        if (hasChanged) {
          console.log('[Sync] Refreshing selected item in drawer:', freshItem.name, {
            old_closed: selectedItem.closed_stock,
            new_closed: freshItem.closed_stock,
            old_current: selectedItem.current_stock,
            new_current: freshItem.current_stock
          });
          setSelectedItem(freshItem);
        }
      }
    }
  }, [items, selectedItem]);

  const fetchData = async (forceRefresh = false, silent = false) => {
    const storeId = profile?.store_id || 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533';
    if (!storeId) return;

    // CACHE STRATEGY
    const CACHE_KEY = `inventory_cache_v7_${storeId}`; // Force refresh (v7 - fix open package location)
    const CACHE_DURATION = 30 * 1000; // 30 seconds (Stock is critical)

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
            // Also restore productRecipes from cache
            if (cached.productRecipes && cached.productRecipes.length > 0) {
              setProductRecipes(cached.productRecipes);
              console.log(`[Inventory] Restored ${cached.productRecipes.length} recipes from cache`);
            }
            setLoading(false);
            return; // EXIT EARLY
          }
        }
      } catch (e) {
        console.warn('[Inventory] Cache parse error', e);
      }
    }

    console.log('[Inventory] Fetching fresh data...');
    // Only show loading spinner if not a silent background refresh
    if (!silent) {
      setLoading(true);
    }

    try {
      const baseUrl = import.meta.env.VITE_SUPABASE_URL + '/rest/v1';

      // Use supabase client to get valid session token reliably
      let { data: { session } } = await supabase.auth.getSession();
      let token = session?.access_token;

      console.log('[Inventory] Supabase Session Token:', token ? 'Found' : 'Missing');

      // FALLBACK: Try manual localStorage read if Supabase client is empty (sometimes happens on hard refresh)
      if (!token) {
        console.log('[Inventory] Session missing, trying manual localStorage read...');
        try {
          // Try standard Supabase key patterns
          const projectId = 'yjxjyxhksedwfeueduwl';
          const key = `sb-${projectId}-auth-token`;
          const stored = localStorage.getItem(key);
          if (stored) {
            const parsed = JSON.parse(stored);
            token = parsed.access_token;
            console.log('[Inventory] Recovered token from localStorage manually.');
          }
        } catch (e) {
          console.warn('[Inventory] Manual token recovery failed:', e);
        }
      }

      if (!token) {
        console.error('[Inventory] NO TOKEN FOUND. Request will be anonymous (and likely blocked by RLS).');
        // Optional: Force a sign-in redirect or warning?
        // addToast('Error de Sesión: Recarga la página', 'error');
      }

      const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers: HeadersInit = {
        'apikey': apiKey,
        'Authorization': `Bearer ${token || apiKey}`,
        'Content-Type': 'application/json'
      };

      console.log('[Inventory] Final headers Authorization:', headers.Authorization?.slice(0, 20) + '...');

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

      console.log('[Inventory] Fetching data for Store ID:', storeId);

      // 2. Fetch Fresh Data (including recipes & locations)
      const [insumos, prods, cats, openPackages, recipesData, locationsData, locationStockData] = await Promise.all([
        fetchWithTimeout(`${baseUrl}/inventory_items?store_id=eq.${storeId}`),
        fetchWithTimeout(`${baseUrl}/products?select=*,product_variants(*)&store_id=eq.${storeId}`),
        fetchWithTimeout(`${baseUrl}/categories?store_id=eq.${storeId}`),
        fetchWithTimeout(`${baseUrl}/open_packages?store_id=eq.${storeId}`),
        fetchWithTimeout(`${baseUrl}/product_recipes?select=*`),
        fetchWithTimeout(`${baseUrl}/storage_locations?store_id=eq.${storeId}`),
        fetchWithTimeout(`${baseUrl}/inventory_location_stock?store_id=eq.${storeId}`)
      ]);

      // Map Locations for quick lookup
      const locationsMap = (locationsData || []).reduce((acc: any, loc: any) => {
        acc[loc.id] = loc.name;
        return acc;
      }, {});

      // Store recipes - debug log
      console.log('[Inventory] product_recipes loaded:', recipesData?.length || 0, 'recipes');
      setProductRecipes(recipesData || []);

      // 3. Transform & Set State
      const mappedCategories = (cats || []).map((c: any) => ({
        id: c.id,
        store_id: c.store_id,
        name: c.name,
        type: c.type || 'ingredient'
      }));
      setCategories(mappedCategories);

      // Transform Insumos
      const transformedInsumos: InventoryItem[] = (insumos || [])
        .filter((i: any) => !i.name?.startsWith('[ELIMINADO]')) // Client-side safety filter
        .map((i: any) => ({
          id: i.id,
          cafe_id: i.store_id,
          name: i.name,
          sku: i.sku || 'N/A',
          item_type: 'ingredient' as const,
          unit_type: (i.unit_type || 'unit') as UnitType,
          image_url: i.image_url || i.image || 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&q=80&w=200',
          is_active: true,
          is_menu_visible: i.is_menu_visible || false, // Map from 'is_menu_visible' column in inventory_items
          min_stock: i.min_stock_alert || 0,
          current_stock: parseFloat(i.current_stock || '0'),
          closed_stock: parseFloat(i.closed_stock || '0'), // ADDED: Map closed_stock from DB (parseFloat for numeric)
          package_size: i.package_size || 1, // ADDED: Map package_size
          content_unit: i.content_unit || i.unit_type || 'un', // ADDED: Map content_unit
          cost: parseFloat(i.cost || '0'),
          category_ids: i.category_id ? [i.category_id] : [],
          presentations: [],
          closed_packages: [],
          // Use open_packages directly from inventory_items table (JSONB column)
          open_packages: i.open_packages || [],
          open_count: i.open_count || 0
        }));

      // Map product recipes to products for easy cost calculation
      const productRecipesMap = (recipesData || []).reduce((acc: any, r: any) => {
        if (!acc[r.product_id]) acc[r.product_id] = [];
        acc[r.product_id].push(r);
        return acc;
      }, {});

      // Transform Products
      const transformedProducts: InventoryItem[] = (prods || [])
        .filter((p: any) => !p.name?.startsWith('[ELIMINADO]')) // Client-side safety filter
        .map((p: any) => {
          const productRecipe = productRecipesMap[p.id] || [];
          const recipeCost = productRecipe.reduce((sum: number, r: any) => {
            const ingredient = transformedInsumos.find(i => i.id === r.inventory_item_id);
            const subtotal = (ingredient?.cost || 0) * parseFloat(r.quantity_required || '0');
            return sum + subtotal;
          }, 0);

          if (p.id.startsWith('a46c')) {
            console.log('[DEBUG] Product SKU-A46C recipe calculation:', {
              id: p.id,
              recipeLength: productRecipe.length,
              calculatedCost: recipeCost,
              ingredients: productRecipe.map(r => ({ id: r.inventory_item_id, qty: r.quantity_required }))
            });
          }

          return {
            id: p.id,
            cafe_id: p.store_id,
            name: p.name,
            sku: 'SKU-' + (p.id || '').slice(0, 4).toUpperCase(),
            item_type: 'sellable' as const,
            unit_type: 'unit' as UnitType,
            image_url: p.image || p.image_url || 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&q=80&w=200',
            is_active: p.is_available, // Correctly mapped to DB column
            is_menu_visible: p.is_visible, // Map from 'is_visible' column in products table
            min_stock: 0,
            current_stock: 0,
            cost: recipeCost, // DYNAMICALLY CALCULATED COST
            recipe: productRecipe.map((r: any) => ({
              ingredientId: r.inventory_item_id,
              quantity: parseFloat(r.quantity_required || '0')
            })),
            price: p.price || 0,
            category_ids: p.category_id ? [p.category_id] : [],
            description: p.description || '',
            presentations: [],
            closed_packages: [],
            open_packages: [],
            variants: p.product_variants || [] // Map variants from join
          };
        });


      // Map real open_packages to items (merge from separate table OR use JSONB column)
      const finalItems = [...transformedInsumos, ...transformedProducts].map(item => {
        // Find all open packages from separate table for this item
        const itemPackages = (openPackages || []).filter((pkg: any) => pkg.inventory_item_id === item.id);

        // If separate table has data, use it. Otherwise, keep the JSONB column data.
        // Find location stocks
        const itemLocationStocks = (locationStockData || []).filter((ls: any) => ls.item_id === item.id);

        return {
          ...item,
          open_count: itemPackages.length,
          open_packages: itemPackages.map((pkg: any) => ({
            id: pkg.id,
            remaining: pkg.remaining,
            package_capacity: pkg.package_capacity,
            opened_at: pkg.opened_at,
            location_id: pkg.location_id,
            location_name: locationsMap[pkg.location_id] || null // Map location name here
          })),
          location_stocks: itemLocationStocks.map((ls: any) => ({
            location_id: ls.location_id,
            location_name: locationsMap[ls.location_id] || null,
            closed_units: parseFloat(ls.closed_units || '0')
          }))
        };
      });

      // Filter out deleted items (is_active=false or name starts with [ELIMINADO])
      // BUT keep sellable items (products) even if inactive, so they appear in RECETAS
      const activeItems = finalItems.filter((item: any) =>
        (item.item_type === 'sellable' || item.is_active !== false) &&
        !item.name?.startsWith('[ELIMINADO]')
      );
      setItems(activeItems);


      // 4. Save to Cache (including productRecipes)
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        items: finalItems,
        categories: mappedCategories,
        productRecipes: recipesData || []
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

    if (newItemForm.name.trim().length < 2) {
      addToast('El nombre debe tener al menos 2 caracteres', 'error');
      return;
    }

    const storeId = profile?.store_id || 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533';
    localStorage.removeItem(`inventory_cache_v4_${storeId}`);

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

      const isSellable = newItemForm.price > 0;
      const endpoint = isSellable ? 'products' : 'inventory_items'; // Sellable = Product, Price=0 = Ingredient/Insumo

      if (isSellable && (!newItemForm.price || newItemForm.price <= 0)) {
        addToast('El precio debe ser mayor a 0 para productos vendibles', 'error');
        return;
      }

      let payload: any;

      if (isSellable) {
        const categoryName = await getCategoryNameById(newItemForm.category_id || null);
        payload = {
          name: newItemForm.name,
          store_id: storeId,
          description: '',
          base_price: newItemForm.price,
          category: categoryName || null,
          category_slug: categoryName ? generateCategorySlug(categoryName) : null,
          image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=200',
          active: true,
          is_available: true,
          is_visible: true,
          tax_rate: 0
        };
      } else {
        payload = {
          name: newItemForm.name,
          unit_type: newItemForm.unit_type,
          package_size: newItemForm.package_size || null,
          content_unit: newItemForm.content_unit || (newItemForm.unit_type === 'gram' ? 'g' : newItemForm.unit_type === 'ml' ? 'ml' : newItemForm.unit_type === 'kg' ? 'kg' : newItemForm.unit_type === 'liter' ? 'L' : 'un'),
          cost: newItemForm.cost,
          current_stock: newItemForm.current_stock,
          closed_stock: newItemForm.current_stock,
          min_stock_alert: newItemForm.min_stock,
          store_id: storeId,
          category_id: newItemForm.category_id || null,
          price: newItemForm.price || 0,
          image_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=200',
          is_menu_visible: false,
          item_type: 'ingredient'
        };
      }

      const response = await fetch(
        `https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/${endpoint}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        }
      );

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Error al crear');
      }

      addToast('✅ Ítem creado correctamente', 'success');
      setShowInsumoWizard(false);
      setNewItemForm({ name: '', category_id: '', unit_type: 'unit', package_size: 0, content_unit: '', cost: 0, current_stock: 0, min_stock: 0, price: 0 });
      fetchData(true, true); // Force refresh silently to avoid scroll jump

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
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
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

  // Recipe Builder Helpers (Restored)
  const updateIngredientQty = (id: string, qty: number) => {
    setRecipeIngredients(prev => prev.map(item => item.id === id ? { ...item, qty } : item));
  };

  const removeIngredient = (id: string) => {
    setRecipeIngredients(prev => prev.filter(item => item.id !== id));
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

      // 1. Update global Recipes state for background calculations
      const newRecipeDB = {
        product_id: selectedItem.id,
        inventory_item_id: selectedIngredientToAdd.id,
        quantity_required: qty
      };
      setProductRecipes(prev => {
        const idx = prev.findIndex(r => r.product_id === selectedItem.id && r.inventory_item_id === selectedIngredientToAdd.id);
        const updated = [...prev];
        if (idx >= 0) updated[idx] = newRecipeDB;
        else updated.push(newRecipeDB);
        return updated;
      });

      // 2. Update local selected item to reflect cost change immediately
      const newInsumoFromState = items.find(i => i.id === selectedIngredientToAdd.id);
      const insumoCost = newInsumoFromState ? newInsumoFromState.cost : (selectedIngredientToAdd.cost || 0);

      const newComp = {
        ingredientId: selectedIngredientToAdd.id,
        quantity: qty
      };
      const newRecipe = [...(selectedItem.recipe || [])];
      const idx = newRecipe.findIndex(r => r.ingredientId === selectedIngredientToAdd.id);
      if (idx >= 0) newRecipe[idx] = newComp;
      else newRecipe.push(newComp);

      // Recalculate total cost locally
      const newTotalCost = newRecipe.reduce((sum, comp) => {
        const insumo = items.find(i => i.id === comp.ingredientId);
        return sum + (insumo ? comp.quantity * insumo.cost : 0);
      }, 0);

      const updatedItem = { ...selectedItem, recipe: newRecipe, cost: newTotalCost };
      setSelectedItem(updatedItem);

      // 3. Update main items list
      setItems(prev => prev.map(i => i.id === selectedItem.id ? updatedItem : i));

    } catch (err: any) {
      console.error('Add Ingredient Error:', err);
      addToast('Error: ' + err.message, 'error');
    }
  };

  const handleDeleteIngredient = async (ingredientId: string) => {
    if (!selectedItem) return;

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
        `https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/product_recipes?product_id=eq.${selectedItem.id}&inventory_item_id=eq.${ingredientId}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': apiKey,
            'Authorization': token ? `Bearer ${token}` : `Bearer ${apiKey}`
          }
        }
      );

      if (!response.ok) throw new Error('Failed to delete ingredient');

      addToast('Ingrediente removido', 'success');

      // Update global states
      setProductRecipes(prev => prev.filter(r => !(r.product_id === selectedItem.id && r.inventory_item_id === ingredientId)));

      // Update local item
      const newRecipe = (selectedItem.recipe || []).filter(r => r.ingredientId !== ingredientId);
      const newTotalCost = newRecipe.reduce((sum, comp) => {
        const insumo = items.find(i => i.id === comp.ingredientId);
        return sum + (insumo ? comp.quantity * insumo.cost : 0);
      }, 0);

      const updatedItem = { ...selectedItem, recipe: newRecipe, cost: newTotalCost };
      setSelectedItem(updatedItem);

      // Update main list
      setItems(prev => prev.map(i => i.id === selectedItem.id ? updatedItem : i));

    } catch (err: any) {
      addToast('Error al eliminar ingrediente', 'error');
    }
  };


  const effectiveItems = useMemo(() => {
    // If no pending deliveries, return raw items
    if (pendingDeliveryOrders.length === 0) return items;

    // Calculate deductions
    const deductions: Record<string, number> = {};

    pendingDeliveryOrders.forEach(orderId => {
      const order = offlineOrders.find(o => o.id === orderId);
      if (!order) return;

      order.items.forEach(item => {
        // Only deduct if we have a recipe for this product (productId is the product)
        if (!item.productId) return;

        const recipes = productRecipes.filter(r => r.product_id === item.productId);
        recipes.forEach(r => {
          if (!deductions[r.inventory_item_id]) deductions[r.inventory_item_id] = 0;
          deductions[r.inventory_item_id] += (r.quantity_required * item.quantity);
        });
      });
    });

    // Apply deductions
    return items.map(item => {
      const deduction = deductions[item.id] || 0;
      if (deduction > 0) {
        return {
          ...item,
          current_stock: Math.max(0, item.current_stock - deduction)
        };
      }
      return item;
    });
  }, [items, pendingDeliveryOrders, offlineOrders, productRecipes]);

  const filteredItems = useMemo(() => {
    return effectiveItems.filter(item => {
      const matchesSearch = (item.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
        (item.sku || '').toLowerCase().includes((searchTerm || '').toLowerCase());

      const matchesFilter = filter === 'all' ||
        (filter === 'ingredient' && item.item_type === 'ingredient') ||
        (filter === 'sellable' && item.item_type === 'sellable');

      // Category filter
      const matchesCategory = activeCategoryFilter === null ||
        (activeCategoryFilter === 'special-open' && (item.open_packages?.length || 0) > 0) ||
        (item.category_ids && item.category_ids.includes(activeCategoryFilter as string));

      // Location filter (Enhanced Navigation)
      const matchesLocation = activeLocationFilter === null ||
        (item.open_packages?.some(pkg => (pkg.location_name || pkg.location) === activeLocationFilter)) ||
        ((item as any).location_stocks?.some((ls: any) => ls.location_name === activeLocationFilter && ls.closed_units > 0));

      return matchesSearch && matchesFilter && matchesCategory && matchesLocation;
    });
  }, [effectiveItems, searchTerm, filter, activeCategoryFilter]);

  // --- RECIPE AVAILABILITY LOGIC (moved before kpis) ---
  const getRecipeAvailability = (item: InventoryItem) => {
    // 1. Get Variants
    const variants = item.variants && item.variants.length > 0 ? item.variants : [];

    // 2. Get Base Recipe
    const baseRecipe = productRecipes.filter(r => r.product_id === item.id);

    // If no recipe and no variants, it's unavailable (or simple product without tracking)
    if (baseRecipe.length === 0 && variants.length === 0) {
      return { status: 'Unavailable', variantsStatus: [] };
    }

    const variantsStatus = [];

    // If we have distinct variants defined
    if (variants.length > 0) {
      for (const variant of variants) {
        let isResolvable = true;
        let hasCritical = false;
        const ingredientsStatus = [];

        // Using Base Recipe for all variants for now, but checking STOCK
        for (const r of baseRecipe) {
          const ingredient = items.find(i => i.id === r.inventory_item_id);
          if (!ingredient) continue;

          // Check override
          let qtyRequired = r.quantity_required;
          if (variant.recipe_overrides) {
            const override = (variant.recipe_overrides as any[]).find((o: any) => o.ingredient_id === r.inventory_item_id);
            if (override) qtyRequired += override.quantity_delta;
          }

          const hasStock = ingredient.current_stock >= qtyRequired;
          const isCritical = ingredient.current_stock <= ingredient.min_stock;

          if (!hasStock) isResolvable = false;
          if (isCritical) hasCritical = true;

          ingredientsStatus.push({
            name: ingredient.name,
            hasStock,
            isCritical
          });
        }

        variantsStatus.push({
          name: variant.name,
          isResolvable,
          hasCritical,
          ingredients: ingredientsStatus
        });
      }
    } else {
      // Single "Default" Variant Use Case
      let isResolvable = true;
      let hasCritical = false;
      const ingredientsStatus = [];

      for (const r of baseRecipe) {
        const ingredient = items.find(i => i.id === r.inventory_item_id);
        const hasStock = ingredient ? ingredient.current_stock >= r.quantity_required : false;
        const isCritical = ingredient ? ingredient.current_stock <= ingredient.min_stock : false;

        if (!hasStock) isResolvable = false;
        if (isCritical) hasCritical = true;

        ingredientsStatus.push({
          name: ingredient?.name || 'Unknown',
          hasStock,
          isCritical
        });
      }
      variantsStatus.push({
        name: 'Receta Base',
        isResolvable,
        hasCritical,
        ingredients: ingredientsStatus
      });
    }

    // Determine Overall Status
    const anyResolvable = variantsStatus.some(v => v.isResolvable);
    const anyCritical = variantsStatus.some(v => v.hasCritical);

    let status = 'No disponible';
    if (anyResolvable) {
      status = anyCritical ? 'Critical' : 'Available';
    }

    return { status, variantsStatus, criticalCount: variantsStatus.filter(v => v.hasCritical).length };
  };

  const kpis = useMemo(() => {
    const list = items.filter(i => i.item_type === 'ingredient');
    const totalVal = list.reduce((acc, item) => acc + (item.cost * item.current_stock), 0);
    const lowStockCount = list.filter(i => i.current_stock <= i.min_stock).length;

    return {
      totalValue: totalVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      lowStock: lowStockCount
    };
  }, [items]);

  // Calculate recipes at risk separately (after getRecipeAvailability is defined)
  const recipesAtRisk = useMemo(() => {
    // Don't calculate if productRecipes hasn't loaded yet (prevents race condition)
    if (!productRecipes || productRecipes.length === 0) {
      console.log('⏳ Waiting for productRecipes to load...');
      return 0;
    }

    // Detect sellable items by checking if they have recipes (since item_type may not exist)
    const atRisk = items.filter(item => {
      // Check if this item has any recipes associated with it
      const hasRecipe = productRecipes.some(pr => pr.product_id === item.id);
      if (!hasRecipe) return false;

      const availability = getRecipeAvailability(item);
      return availability.status === 'Critical';
    }).length;

    console.log('⚠️ Recipes at risk:', atRisk, '(productRecipes loaded:', productRecipes.length, ')');
    return atRisk;
  }, [items, productRecipes]);

  const handleDeleteItem = async () => {
    if (!selectedItem) return;
    const storeId = profile?.store_id || 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533';
    localStorage.removeItem(`inventory_cache_v6_${storeId}`);
    if (!confirm('¿Estás seguro de que deseas eliminar este ítem? Esta acción no se puede deshacer.')) return;

    setIsProcessing(true);
    try {
      // FIX: Determine correct table based on item type
      const table = selectedItem.item_type === 'sellable' ? 'products' : 'inventory_items';

      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', selectedItem.id);

      if (error) {
        // Check if foreign key violation (product has order history)
        const isFKError = error.message?.toLowerCase().includes('foreign key') ||
          error.message?.toLowerCase().includes('violates') ||
          error.code === '23503';

        if (isFKError) {
          // Check if there are ACTIVE orders for this product
          const activeStatuses: any[] = ['pending', 'preparing', 'ready', 'paid'];
          const { data: activeOrders } = await supabase
            .from('order_items')
            .select('id, orders!inner(status)')
            .eq('product_id', selectedItem.id)
            .in('orders.status', activeStatuses)
            .limit(1);

          if (activeOrders && activeOrders.length > 0) {
            // There are active orders, block deletion
            addToast('⚠️ No se puede eliminar: hay pedidos activos con este producto', 'error');
            return;
          }

          // No active orders, do soft delete
          const { error: softDeleteError } = await supabase
            .from(table)
            .update({
              is_active: false,
              name: `[ELIMINADO] ${selectedItem.name}`,
              updated_at: new Date().toISOString()
            })
            .eq('id', selectedItem.id);

          // Log deletion in audit
          const storeIdForLog = profile?.store_id;
          if (storeIdForLog) {
            await (supabase.from as any)('inventory_audit_logs').insert({
              store_id: storeIdForLog,
              item_id: selectedItem.id,
              action_type: 'deletion',
              quantity_delta: 0,
              package_delta: 0,
              reason: `Producto dado de baja: ${selectedItem.name}`,
              user_id: (await supabase.auth.getUser()).data.user?.id,
            });
          }

          if (softDeleteError) {
            addToast('✓ Producto dado de baja (historial conservado)', 'success');
          } else {
            addToast('✓ Producto dado de baja correctamente', 'success');
          }

          // Update local state
          setItems(prev => prev.filter(i => i.id !== selectedItem.id));
          setSelectedItem(null);
          setDrawerTab('details');
          return;
        }
        throw error;
      }

      // Update local state by filtering out the deleted item
      setItems(prev => prev.filter(i => i.id !== selectedItem.id));

      // Close drawer and reset selection
      setSelectedItem(null);
      setDrawerTab('details'); // Reset tab for next time
      addToast('Ítem eliminado correctamente', 'success');
    } catch (e: any) {
      console.error("Error deleting item:", e);
      addToast('Error al eliminar el producto', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedItem) return;

    // Validate type
    if (!file.type.startsWith('image/')) {
      addToast('Por favor, seleccioná una imagen (JPG, PNG, etc.)', 'warning');
      return;
    }

    // Validate size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      addToast('La imagen no puede superar 2MB', 'warning');
      return;
    }

    setIsUploadingImage(true);
    addToast('Subiendo imagen...', 'info');

    try {
      const storeId = profile?.store_id || 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533';
      const fileExt = file.name.split('.').pop();
      const fileName = `${selectedItem.id}-${Date.now()}.${fileExt}`;
      const filePath = `${storeId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      // Update selectedItem state to show in UI immediately
      setSelectedItem(prev => prev ? {
        ...prev,
        image_url: publicUrl, // For UI and inventory_items
        image: publicUrl     // For products
      } : null);

      addToast('Imagen subida correctamente. No olvides Actualizar para guardar.', 'success');
    } catch (err: any) {
      console.error('[ImageUpload] Error:', err);
      addToast(`Error al subir imagen: ${err.message}`, 'error');
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUpdateItem = async () => {
    if (!selectedItem) return;
    const storeId = profile?.store_id || 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533';
    localStorage.removeItem(`inventory_cache_v4_${storeId}`);
    setIsProcessing(true);

    try {
      const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const storageKey = 'sb-yjxjyxhksedwfeueduwl-auth-token';
      const storedData = localStorage.getItem(storageKey);
      let token = '';
      if (storedData) token = JSON.parse(storedData).access_token;

      const headers = {
        'Content-Type': 'application/json',
        'apikey': apiKey,
        'Authorization': `Bearer ${token || apiKey}`,
        'Prefer': 'return=minimal'
      };

      // Map UI unit values to DB enum
      // The UI uses: unit, gram, kilo, ml, liter
      // DB UnitType: 'u' | 'kg' | 'g' | 'L' | 'ml'
      const unitMap: Record<string, UnitType> = {
        'unit': 'u',
        'gram': 'g',
        'kilo': 'kg',
        'ml': 'ml',
        'liter': 'L'
      };
      let finalUnitType = unitMap[selectedItem.unit_type] || 'u';

      // CRITICAL: Sync content_unit with unit_type to ensure display consistency
      // Map unit_type to appropriate content_unit abbreviation
      const unitTypeToContentUnit: Record<string, string> = {
        'unit': 'un',
        'gram': 'g',
        'kilo': 'kg',
        'ml': 'ml',
        'liter': 'L'
      };
      const finalContentUnit = unitTypeToContentUnit[finalUnitType] || selectedItem.content_unit || 'un';

      const isProduct = selectedItem.item_type === 'sellable';
      let payload: any;

      if (isProduct) {
        const categoryName = selectedItem.category_ids?.[0]
          ? await getCategoryNameById(selectedItem.category_ids[0])
          : (selectedItem as any).category;

        payload = {
          name: selectedItem.name,
          base_price: selectedItem.price,
          category: categoryName || null,
          category_slug: categoryName ? generateCategorySlug(categoryName) : null,
          image: selectedItem.image_url || selectedItem.image
        };

        if (selectedItem.description) payload.description = selectedItem.description;
      } else {
        payload = {
          name: selectedItem.name,
          category_id: selectedItem.category_ids?.[0] || null,
          cost: selectedItem.cost,
          package_size: selectedItem.package_size || selectedItem.unit_size || 1,
          content_unit: finalContentUnit,
          unit_type: finalUnitType,
          image_url: selectedItem.image_url || selectedItem.image
        };

        if (selectedItem.description) payload.description = selectedItem.description;
        if (selectedItem.price !== undefined) payload.price = selectedItem.price;
      }

      const table = isProduct ? 'products' : 'inventory_items';
      const response = await fetch(`https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/${table}?id=eq.${selectedItem.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error('Error updating item');

      // SYNC IMAGE: If we just updated an image, try to update the matching record in the other table
      const hasImageUpdate = selectedItem.image_url || selectedItem.image;
      if (hasImageUpdate) {
        const otherTable = selectedItem.item_type === 'sellable' ? 'inventory_items' : 'products';
        const otherImageColumn = selectedItem.item_type === 'sellable' ? 'image_url' : 'image';

        // Try linking by SKU first, then by name
        const filter = selectedItem.sku
          ? `sku=eq.${selectedItem.sku}`
          : `name=eq.${encodeURIComponent(selectedItem.name)}`;

        await fetch(`https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/${otherTable}?${filter}&store_id=eq.${storeId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ [otherImageColumn]: selectedItem.image_url || selectedItem.image })
        }).catch(err => console.warn('Non-critical sync error:', err));
      }

      // Update local items state explicitly with calculated values to ensure UI reflects changes immediately
      const updatedItem = {
        ...selectedItem,
        package_size: payload.package_size,
        content_unit: payload.content_unit,
        unit_type: finalUnitType
      };

      setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, ...updatedItem } : i));

      addToast('Ítem actualizado correctamente', 'success');
      setSelectedItem(null); // Close drawer on success
    } catch (err: any) {
      console.error(err);
      addToast('Error al actualizar: ' + err.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Fetch Movements when Tab Changes
  useEffect(() => {
    if (drawerTab === 'history' && selectedItem) {
      fetchStockHistory(selectedItem.id);
    }
  }, [drawerTab, selectedItem]);

  // Sync selectedItem when items list updates (e.g. after background fetchData)
  useEffect(() => {
    if (selectedItem) {
      const updated = items.find(i => i.id === selectedItem.id);
      if (updated && (updated.cost !== selectedItem.cost || (updated.recipe || []).length !== (selectedItem.recipe || []).length)) {
        setSelectedItem(updated);
      }
    }
  }, [items]);

  const fetchStockHistory = async (itemId: string) => {
    setLoadingMovements(true);
    const { data } = await (supabase.from as any)('inventory_audit_logs')
      .select('*, qty_delta:quantity_delta, unit_type:unit')
      .eq('item_id', itemId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) {
      setStockMovements(data);
    }
    setLoadingMovements(false);
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto pb-32 bg-[#F8F9F7] dark:bg-transparent min-h-screen transition-colors duration-300">
      {/* HEADER COMPACTO */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3">

        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-white/40 font-bold text-[8px] uppercase tracking-[0.2em]">
            <span className="size-1 rounded-full bg-neon shadow-[0_0_5px_rgba(255,255,255,0.5)]"></span>
            COFFESQUAD INVENTORY SYSTEM
          </div>
          <h1 className="text-2xl font-black italic-black tracking-tighter text-text-main dark:text-white uppercase leading-none">
            Control <span className="text-white/80">Operativo</span>
          </h1>

        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              // Clear cache and force refresh
              const storeId = profile?.store_id || 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533';
              localStorage.removeItem(`inventory_cache_v6_${storeId}`);
              fetchData(true);
              addToast('Inventario actualizado', 'success');
            }}
            className="px-3 md:px-4 py-1.5 rounded-lg bg-white/5 text-white/60 font-bold text-[9px] uppercase tracking-widest border border-white/10 flex items-center gap-2 transition-all hover:text-neon hover:border-white/30 hover:bg-white/5"
          >
            <span className="material-symbols-outlined text-base">refresh</span>
            <span className="hidden sm:inline">REFRESCAR</span>
          </button>
          <button
            onClick={() => setShowInvoiceProcessor(true)}
            className="px-3 md:px-4 py-1.5 rounded-lg bg-white/5 text-white/60 font-bold text-[9px] uppercase tracking-widest border border-white/10 flex items-center gap-2 transition-all hover:text-neon hover:border-white/30 hover:bg-white/5"
          >
            <span className="material-symbols-outlined text-base">document_scanner</span>
            <span className="hidden sm:inline">ESCANEAR FACTURA</span>
          </button>
          <button onClick={() => { setShowInsumoWizard(true); setWizardMethod('selector'); }} className="px-3 md:px-4 py-1.5 rounded-lg bg-neon text-black font-bold text-[9px] uppercase tracking-widest border border-neon flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.1)]">
            <span className="material-symbols-outlined text-base">add_circle</span>
            <span className="hidden sm:inline">NUEVO REGISTRO</span>
          </button>
        </div>

      </header>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">

        <KpiCard label="Valorización Total" value={`$${kpis.totalValue}`} icon="payments" color="text-neon bg-white/5" />
        <KpiCard label="Alerta de Stock" value={`${kpis.lowStock}`} icon="warning" color={kpis.lowStock > 0 ? "text-neon bg-white/10" : "text-white/40 bg-white/5"} />
        {recipesAtRisk > 0 && (
          <div className="p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-between group hover:scale-[1.02] transition-all">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-yellow-400">warning</span>
              </div>
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-yellow-500/60">Recetas en Riesgo</p>
                <p className="text-2xl font-black italic-black text-yellow-400">{recipesAtRisk}</p>
              </div>
            </div>
          </div>
        )}
        <KpiCard label="Índice de Ítems" value={`${items.length}`} icon="inventory" color="text-neon bg-white/5" />
      </div>

      <div className="flex flex-col gap-3">
        {/* Type Filters */}
        <div className="flex overflow-x-auto no-scrollbar bg-[#141714] p-1 rounded-xl border border-white/[0.04] shadow-soft max-w-full md:max-w-fit">
          <TabBtn active={filter === 'all'} onClick={() => setFilter('all')}>GLOBAL</TabBtn>
          <TabBtn active={filter === 'ingredient'} onClick={() => setFilter('ingredient')}>INSUMOS</TabBtn>
          <TabBtn active={filter === 'sellable'} onClick={() => setFilter('sellable')}>PRODUCTOS</TabBtn>
          <TabBtn active={filter === 'recipes'} onClick={() => setFilter('recipes')}>RECETAS</TabBtn>
        </div>


        {/* Category Filters */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-full py-1">
          <button
            onClick={() => setActiveCategoryFilter(null)}
            className={`px-4 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest whitespace-nowrap transition-all border ${activeCategoryFilter === null
              ? 'border-white/60 text-neon bg-white/5'
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
                ? 'border-white/60 text-neon bg-white/5'
                : 'border-white/10 text-white/50 hover:text-white/70 hover:border-white/20'
                }`}
            >
              {cat.name}
            </button>
          ))}
          <button
            onClick={() => setActiveCategoryFilter('special-open')}
            className={`px-4 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest whitespace-nowrap flex items-center gap-1.5 transition-all border ${activeCategoryFilter === 'special-open'
              ? 'border-white/60 text-neon bg-white/5'
              : 'border-white/10 text-white/50 hover:text-white/70 hover:border-white/20'
              }`}
          >
            <span className="material-symbols-outlined text-sm">lock_open</span>
            ABIERTOS
          </button>
          <button
            onClick={() => setShowCategoryModal(true)}
            className="ml-auto px-2 py-2 rounded-lg text-white/30 hover:text-neon border border-transparent hover:border-white/20 transition-all"
            title="Crear nueva categoría"
          >
            <span className="material-symbols-outlined text-base">add_circle</span>
          </button>
        </div>

        {/* Active Location Filter Pill */}
        {activeLocationFilter && (
          <div className="flex items-center gap-2 mb-2 animate-in fade-in slide-in-from-left-4 duration-300">
            <button
              onClick={() => setActiveLocationFilter(null)}
              className="px-3 py-1.5 rounded-lg bg-neon/10 border border-neon/30 text-neon font-bold text-[9px] uppercase tracking-widest flex items-center gap-2 hover:bg-neon/20 transition-all group"
            >
              <span className="material-symbols-outlined text-sm">location_on</span>
              Ubicación: {activeLocationFilter}
              <span className="material-symbols-outlined text-sm opacity-50 group-hover:opacity-100">close</span>
            </button>
            <span className="text-[9px] text-white/30 uppercase tracking-widest">Filtrando lista</span>
          </div>
        )}
      </div>

      {/* RECIPES VIEW - Shown when filter === 'recipes' */}
      {filter === 'recipes' ? (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-tight">Libro de Recetas</h2>
              <p className="text-[10px] text-white/40 uppercase tracking-widest">Define los ingredientes de cada producto compuesto</p>
            </div>
            <button
              onClick={() => {
                setEditingProductId(null);
                setRecipeIngredients([]);
                setShowRecipeModal(true);
              }}
              className="px-4 py-2 rounded-lg bg-white/10 text-white font-bold text-[10px] uppercase tracking-widest border border-white/20 flex items-center gap-2 hover:bg-white/20 transition-all shadow-[0_0_20px_rgba(255,255,255,0.05)]"
            >
              <span className="material-symbols-outlined text-base">add</span>
              NUEVA RECETA
            </button>
          </div>

          {/* Recipe List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(() => {
              // Group recipes by product_id
              const groupedRecipes = productRecipes.reduce((acc, recipe) => {
                if (!acc[recipe.product_id]) acc[recipe.product_id] = [];
                acc[recipe.product_id].push(recipe);
                return acc;
              }, {} as Record<string, typeof productRecipes>);

              const productIds = Object.keys(groupedRecipes);

              if (productIds.length === 0) {
                return (
                  <div className="col-span-2 flex flex-col items-center justify-center p-20 text-center bg-[#141714] rounded-2xl border border-white/[0.04]">
                    <span className="material-symbols-outlined text-5xl text-white/10 mb-4">menu_book</span>
                    <h3 className="text-lg font-black text-white/40 uppercase mb-2">Sin Recetas</h3>
                    <p className="text-[10px] text-white/20 uppercase tracking-widest mb-6">Crea tu primera receta para productos compuestos</p>
                    <button
                      onClick={() => setShowRecipeModal(true)}
                      className="px-6 py-3 bg-neon text-black rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-200 transition-all shadow-[0_0_25px_rgba(255,255,255,0.1)]"
                    >
                      Crear Receta
                    </button>
                  </div>
                );
              }

              return productIds.map(productId => {
                const product = items.find(i => i.id === productId);
                const recipeItems = groupedRecipes[productId];
                const totalCost = recipeItems.reduce((sum, r) => {
                  const ingredient = items.find(i => i.id === r.inventory_item_id);
                  return sum + (ingredient?.cost || 0) * r.quantity_required;
                }, 0);

                return (
                  <div key={productId} className="bg-[#141714] rounded-2xl border border-white/[0.04] overflow-hidden">
                    {/* Product Header */}
                    <div className="p-4 border-b border-white/[0.04] flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="size-12 rounded-xl bg-white/5 flex items-center justify-center">
                          <span className="material-symbols-outlined text-white/60">restaurant</span>
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-white uppercase">{product?.name || 'Producto'}</h3>
                          <p className="text-[9px] text-white/40">{recipeItems.length} ingredientes</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[8px] text-white/30 uppercase">Costo</p>
                        <p className="text-sm font-black text-neon">${totalCost.toFixed(2)}</p>
                      </div>
                    </div>

                    {/* Ingredients */}
                    <div className="p-4 space-y-2">
                      {recipeItems.map((r) => {
                        const ingredient = items.find(i => i.id === r.inventory_item_id);
                        return (
                          <div key={`recipe-${r.inventory_item_id}-${r.quantity_required}`} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]">
                            <span className="text-[10px] font-bold text-white/70">{ingredient?.name || 'Insumo'}</span>
                            <span className="text-[10px] font-black text-neon">{r.quantity_required} {ingredient?.unit_type}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Actions */}
                    <div className="px-4 pb-4 flex gap-2">
                      <button
                        onClick={() => {
                          setEditingProductId(productId);
                          const mappedIngredients = recipeItems.map(r => {
                            const invItem = items.find(i => i.id === r.inventory_item_id);
                            let unit: any = invItem?.unit_type || 'un';
                            let qty = r.quantity_required;
                            if (unit === 'kg') { if (qty < 1) { unit = 'gram'; qty *= 1000; } }
                            else if (unit === 'liter') { if (qty < 1) { unit = 'ml'; qty *= 1000; } }
                            return { id: r.inventory_item_id, qty: Number(qty.toFixed(4)), unit };
                          });
                          setRecipeIngredients(mappedIngredients);
                          setShowRecipeModal(true);
                        }}
                        className="flex-1 py-2 rounded-lg bg-white/5 text-white/50 text-[9px] font-bold uppercase hover:text-neon hover:bg-white/5 transition-all"
                      >
                        Editar
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm('¿Eliminar esta receta?')) return;
                          const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
                          const storageKey = 'sb-yjxjyxhksedwfeueduwl-auth-token';
                          const storedData = localStorage.getItem(storageKey);
                          let token = '';
                          if (storedData) token = JSON.parse(storedData).access_token;

                          await fetch(`https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/product_recipes?product_id=eq.${productId}`, {
                            method: 'DELETE',
                            headers: { 'apikey': apiKey, 'Authorization': `Bearer ${token || apiKey}` }
                          });
                          setProductRecipes(prev => prev.filter(r => r.product_id !== productId));
                          addToast('Receta eliminada', 'success');
                        }}
                        className="py-2 px-3 rounded-lg bg-red-500/10 text-red-400/70 text-[9px] font-bold uppercase hover:bg-red-500/20 transition-all"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      ) : (
        <>
          {/* ACTIONS */}
          <div className="flex gap-3 relative z-[100]">
            <button
              onClick={() => setFilter('logistics')}
              className={`hidden md:flex items-center gap-2 px-4 py-2 border rounded-xl transition-all group ${filter === 'logistics' ? 'bg-white border-white' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
            >
              <span className={`material-symbols-outlined text-lg ${filter === 'logistics' ? 'text-black' : 'text-white/60 group-hover:text-white'}`}>store</span>
              <span className={`text-[10px] font-black uppercase tracking-widest ${filter === 'logistics' ? 'text-black' : 'text-white/60 group-hover:text-white'}`}>UBICACIONES</span>
            </button>

            {/* BUSCADOR */}
            <div className="relative group">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-neon transition-colors">search</span>
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rastrear ítem por SKU o nombre..."
                className="w-full bg-[#141714] border border-white/[0.04] rounded-2xl h-12 pl-12 pr-4 text-[10px] font-bold text-white uppercase tracking-widest outline-none focus:border-white/30 transition-all placeholder:text-white/10"
              />
            </div>
          </div>

          {/* TABLA PRINCIPAL / LOGISTICS VIEW */}
          {filter === 'logistics' ? (
            <LogisticsView preselectedLocationName={activeLocationFilter} />
          ) : (
            <div className="bg-[#141714] rounded-2xl border border-white/[0.04] shadow-2xl overflow-hidden min-h-[400px]">
              {loading ? (
                <div className="flex flex-col items-center justify-center p-20 space-y-4">
                  <div className="size-10 border-t-2 border-neon rounded-full animate-spin"></div>
                  <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Cargando Matrix...</p>
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-20 text-center animate-in fade-in zoom-in duration-700">
                  <div className="size-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 mb-8">
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
                    className="px-10 py-4 bg-neon text-black rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:scale-[1.05] active:scale-95 transition-all"
                  >
                    Cargar Primer Ítem
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-left border-collapse min-w-[800px]">

                    <thead>
                      <tr className="bg-white/[0.01] border-b border-white/[0.03]">
                        <th className="px-6 py-4 text-[8px] font-black uppercase text-text-secondary tracking-widest">Identidad Operativa</th>
                        <th className="px-6 py-4 text-[8px] font-black uppercase text-text-secondary tracking-widest">Stock Sellado</th>
                        <th className="px-6 py-4 text-[8px] font-black uppercase text-text-secondary tracking-widest">Abiertos</th>
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
                                {(() => {
                                  const cat = categories.find(c => c.id === item.category_ids?.[0]);
                                  return cat ? (
                                    <p className="text-[7px] text-white/60 font-bold uppercase tracking-widest">{cat.name}</p>
                                  ) : (
                                    <p className="text-[7px] text-text-secondary font-bold uppercase opacity-30 tracking-widest group-hover:text-white/50">SKU: {item.sku}</p>
                                  );
                                })()}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4" onClick={() => { setSelectedItem(item); setDrawerTab('details'); setIsAddingRecipeItem(false); }}>
                            {/* CELDA 1: Stock Sellado */}
                            <div className="flex flex-col">
                              {item.item_type === 'sellable' ? (
                                (() => {
                                  const { status, variantsStatus } = getRecipeAvailability(item);
                                  // If no recipe involved, maybe show -- 
                                  const hasRecipe = productRecipes.some(pr => pr.product_id === item.id);
                                  if (!hasRecipe) return <span className="text-[14px] font-black text-white/20">--</span>;

                                  if (status === 'Available') {
                                    return (
                                      <div className="flex flex-col gap-1">
                                        <span className="text-[10px] font-black text-neon uppercase bg-neon/10 px-2 py-0.5 rounded w-fit">Disponible</span>
                                        <span className="text-[7px] text-green-500/60 font-bold uppercase tracking-wide">✓ Sin riesgos</span>
                                      </div>
                                    );
                                  } else if (status === 'Critical') {
                                    // Count critical/missing ingredients
                                    const criticalIngredients: Array<{ name: string, hasStock: boolean }> = [];
                                    variantsStatus.forEach(v => {
                                      v.ingredients.forEach(ing => {
                                        if (!ing.hasStock || ing.isCritical) {
                                          if (!criticalIngredients.find(ci => ci.name === ing.name)) {
                                            criticalIngredients.push({ name: ing.name, hasStock: ing.hasStock });
                                          }
                                        }
                                      });
                                    });
                                    const count = criticalIngredients.length;

                                    return (
                                      <div className="flex flex-col gap-1">
                                        <span className="text-[10px] font-black text-yellow-400 uppercase bg-yellow-400/10 px-2 py-0.5 rounded w-fit">Disponible</span>
                                        <span className="text-[7px] text-yellow-500/80 font-bold uppercase tracking-wide">⚠️ {count} ingrediente{count > 1 ? 's' : ''} crítico{count > 1 ? 's' : ''}</span>
                                      </div>
                                    );
                                  } else {
                                    return <span className="text-[10px] font-black text-red-500 uppercase bg-red-500/10 px-2 py-0.5 rounded w-fit">No Disponible</span>;
                                  }
                                })()
                              ) : (
                                <>
                                  {/* Stock cerrado: solo el número de paquetes/unidades selladas */}
                                  <span className="font-black italic text-[14px] text-neon">
                                    {Math.floor(item.closed_stock || 0)}
                                  </span>
                                  {(item.closed_stock || 0) <= (item.min_stock || 0) && (
                                    <span className="text-[6px] font-black text-white/40 uppercase tracking-widest mt-1">CRÍTICO</span>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {/* Estado del Paquete (Calculado) - TABLE VIEW SIMPLIFIED */}
                            {(() => {
                              // Logic for Open Packages - TABLE CELL (SUMMARY ONLY)
                              const isOpenList = (item.open_packages?.length > 0 || item.open_count > 0);

                              if (isOpenList) {
                                // SUMMARY view for multiple open packages
                                const totalOpen = item.open_packages?.length || item.open_count || 0;
                                return (
                                  <div
                                    className="flex flex-col items-start justify-center gap-0.5 p-2 rounded-lg bg-white/[0.02] border border-white/5 cursor-pointer hover:bg-white/5 transition-colors group/open w-fit min-w-[100px]"
                                    onClick={(e) => { e.stopPropagation(); setSelectedItem(item); setDrawerTab('details'); }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="material-symbols-outlined text-orange-500 text-sm group-hover/open:scale-110 transition-transform">inventory_2</span>
                                      <span className="text-[10px] font-black text-white uppercase">{totalOpen} ABIERTO{totalOpen > 1 ? 'S' : ''}</span>
                                    </div>
                                    {/* Visual helper dots */}
                                    <div className="flex gap-0.5 pl-6">
                                      {Array.from({ length: Math.min(totalOpen, 5) }).map((_, i) => (
                                        <div key={`dot-${item.id}-${i}`} className="size-1.5 rounded-full bg-orange-500/50"></div>
                                      ))}
                                      {totalOpen > 5 && <span className="text-[6px] text-white/30">+</span>}
                                    </div>
                                  </div>
                                );
                              } else {
                                // NO OPEN PACKAGES -> Show 100% Sealed Indicator if Stock Exists
                                if (item.current_stock > 0) {
                                  // Smart Unit Display - Standarized
                                  // Prioritize package_size/content_unit (DB columns)
                                  let rawSize = item.package_size || item.unit_size || 1;
                                  // Fix: If content_unit is 'un' or empty, try to use unit_type if available and different
                                  let initialUnit = item.content_unit || item.unit_measure || item.unit_type || 'un';
                                  if ((!initialUnit || initialUnit === 'un' || initialUnit === 'unit') && item.unit_type && item.unit_type !== 'un' && item.unit_type !== 'unit') {
                                    initialUnit = item.unit_type;
                                  }
                                  let rawUnit = initialUnit || 'un';

                                  // Normalize unit display
                                  if (rawUnit === 'unit') rawUnit = 'un';

                                  let displaySize = rawSize;
                                  let displayUnit = rawUnit;

                                  if (['gram', 'ml', 'g'].includes(rawUnit)) {
                                    if (displaySize >= 1000) {
                                      displaySize /= 1000;
                                      displayUnit = rawUnit === 'gram' || rawUnit === 'g' ? 'KG' : 'L';
                                    }
                                  }

                                  return (
                                    <div className="flex items-center gap-2 group/sealed opacity-80">
                                      <div className="flex items-center gap-1.5 bg-green-500/10 pl-2.5 pr-3 py-1 rounded-md border border-green-500/20">
                                        <span className="material-symbols-outlined text-green-500 text-[10px]">verified</span>
                                        <span className="text-[9px] font-black text-green-500 uppercase">100%</span>
                                        <span className="w-px h-2.5 bg-green-500/20 mx-0.5"></span>
                                        <span className="text-[9px] font-bold text-green-500/90 uppercase tracking-wide">{displaySize} {displayUnit}</span>
                                      </div>
                                    </div>
                                  );
                                } else {
                                  return (
                                    <div className="flex items-center gap-2 opacity-30">
                                      <span className="w-1.5 h-1.5 rounded-full bg-white/50"></span>
                                      <span className="text-[9px] font-bold text-white uppercase">SIN STOCK</span>
                                    </div>
                                  );
                                }
                              }
                            })()}
                          </td>

                          <td className="px-6 py-4 text-center" onClick={() => { setSelectedItem(item); setDrawerTab('details'); setIsAddingRecipeItem(false); }}>
                            {(() => {
                              // Check both item.recipe AND productRecipes state
                              const hasRecipe = (item.recipe && item.recipe.length > 0) || productRecipes.some(pr => pr.product_id === item.id);
                              if (item.item_type === 'ingredient') {
                                return (
                                  <span className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase bg-neon/10 text-neon border border-neon/30 group-hover:border-neon/50 transition-all">
                                    INSUMO
                                  </span>
                                );
                              } else if (hasRecipe) {
                                return (
                                  <span className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase bg-violet-500/10 text-violet-400 border border-violet-500/30 group-hover:border-violet-500/50 transition-all">
                                    RECETA
                                  </span>
                                );
                              } else {
                                return (
                                  <span className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase bg-orange-500/10 text-orange-400 border border-orange-500/30 group-hover:border-orange-500/50 transition-all">
                                    PRODUCTO
                                  </span>
                                );
                              }
                            })()}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {/* Minimal Cute Switch */}
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                const newValue = !item.is_menu_visible;
                                // Optimistic update
                                const newItems = items.map(i => i.id === item.id ? { ...i, is_menu_visible: newValue } : i);
                                setItems(newItems);

                                try {
                                  // Update LocalStorage Cache immediately to persist state across navigations
                                  const storeId = profile?.store_id || 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533';
                                  const cacheKey = `inventory_cache_v6_${storeId}`;

                                  // Try to update existing cache to avoid reload spinner
                                  try {
                                    const cachedRaw = localStorage.getItem(cacheKey);
                                    if (cachedRaw) {
                                      const cached = JSON.parse(cachedRaw);
                                      cached.items = newItems; // Update items in cache
                                      cached.timestamp = Date.now(); // Refresh timestamp
                                      localStorage.setItem(cacheKey, JSON.stringify(cached));
                                    }
                                  } catch (e) {
                                    // If cache update fails, just clear it to force fresh fetch
                                    localStorage.removeItem(cacheKey);
                                  }

                                  const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
                                  const storageKey = 'sb-yjxjyxhksedwfeueduwl-auth-token';
                                  const storedData = localStorage.getItem(storageKey);
                                  let token = '';
                                  if (storedData) token = JSON.parse(storedData).access_token;

                                  // CONDITIONAL ENDPOINT based on type
                                  const isProduct = item.item_type === 'sellable' || item.item_type === 'product'; // Robust check
                                  const endpoint = isProduct ? 'products' : 'inventory_items';
                                  const payload = isProduct ? { is_visible: newValue } : { is_menu_visible: newValue };

                                  const response = await fetch(`https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/${endpoint}?id=eq.${item.id}`, {
                                    method: 'PATCH',
                                    headers: {
                                      'Content-Type': 'application/json',
                                      'apikey': apiKey,
                                      'Authorization': `Bearer ${token || apiKey}`,
                                      'Prefer': 'return=minimal'
                                    },
                                    body: JSON.stringify(payload)
                                  });

                                  if (!response.ok) throw new Error('API Error');

                                  addToast(newValue ? 'Item visible en menú' : 'Item oculto del menú', 'success');
                                } catch (err) {
                                  console.error(err);
                                  addToast('Error al actualizar', 'error');
                                  // Revert
                                  setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_menu_visible: !item.is_menu_visible } : i));
                                }
                              }}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black ${item.is_menu_visible ? 'bg-neon' : 'bg-white/10'}`}
                            >
                              <span className="sr-only">Toggle Menu Visibility</span>
                              <span
                                className={`${item.is_menu_visible ? 'translate-x-5 shadow-[0_0_10px_rgba(255,255,255,0.2)]' : 'translate-x-1 bg-white/40'} inline-block h-3 w-3 transform rounded-full bg-black transition duration-300 ease-in-out`}
                              />
                            </button>
                          </td>
                          <td className="px-6 py-4 text-center font-mono text-[10px] text-white/60" onClick={() => { setSelectedItem(item); setDrawerTab('details'); setIsAddingRecipeItem(false); }}>
                            ${item.cost.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button className="size-8 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center hover:bg-neon hover:text-black transition-all group-hover:border-white/30">
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
          )}
        </>
      )
      }

      {/* OVERLAY PARA CERRAR DRAWER */}
      {
        selectedItem && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[4999] transition-opacity duration-300"
            onClick={() => setSelectedItem(null)}
          />
        )
      }

      {/* DRAWER LATERAL PREMIUM */}
      <div className={`fixed inset-y-0 right-0 z-[5000] h-screen w-full max-w-[420px] bg-[#0D0F0D] border-l border-white/10 shadow-3xl transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] flex flex-col ${selectedItem ? 'translate-x-0' : 'translate-x-full opacity-0 pointer-events-none invisible'}`}>
        {selectedItem && (
          <>
            <div className="relative h-64 w-full shrink-0">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="hidden"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0D0F0D] via-transparent to-transparent z-10" />
              <img
                src={selectedItem.image_url || selectedItem.image}
                className={`w-full h-full object-cover transition-all ${isUploadingImage ? 'opacity-30 blur-sm' : ''}`}
              />

              {/* Overlay Clickable para Upload */}
              <div
                onClick={() => !isUploadingImage && fileInputRef.current?.click()}
                className="absolute inset-0 z-15 flex items-center justify-center cursor-pointer group/upload"
              >
                <div className="size-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white opacity-0 group-hover/upload:opacity-100 transition-all border border-white/20">
                  {isUploadingImage ? (
                    <div className="size-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <span className="material-symbols-outlined">add_a_photo</span>
                  )}
                </div>
              </div>

              <button onClick={() => setSelectedItem(null)} className="absolute top-4 right-4 z-20 size-8 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white/60 hover:text-white transition-all">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
              <div className="absolute bottom-4 left-6 z-20 right-6">
                <div className="flex items-center gap-2 mb-1">
                  <input
                    type="text"
                    value={selectedItem.name}
                    onChange={(e) => setSelectedItem(prev => prev ? { ...prev, name: e.target.value } : null)}
                    className="text-2xl font-light text-white uppercase tracking-tight leading-none bg-transparent border-b border-transparent hover:border-white/20 focus:border-neon outline-none transition-all w-full max-w-[250px]"
                    placeholder="Nombre del ítem"
                  />
                  {selectedItem.category_ids?.[0] && (() => {
                    const cat = categories.find(c => c.id === selectedItem.category_ids?.[0]);
                    return cat ? (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-cream/10 border border-cream/20 text-[9px] font-medium text-cream uppercase tracking-widest">
                        {cat.name}
                      </span>
                    ) : null;
                  })()}
                </div>
                <p className="text-[9px] font-medium text-white/50 uppercase tracking-[0.2em]">{selectedItem.item_type === 'sellable' ? 'Producto' : 'Insumo'} · {selectedItem.sku || 'SKU'}</p>
              </div>
            </div>

            <div className="flex border-b border-white/5 px-6 gap-6">
              <DrawerTabBtn active={drawerTab === 'details'} onClick={() => setDrawerTab('details')} label="FICHA" icon="analytics" />
              {selectedItem.item_type === 'sellable' && (
                <DrawerTabBtn active={drawerTab === 'recipe'} onClick={() => setDrawerTab('recipe')} label="RECETA" icon="biotech" />
              )}
              <DrawerTabBtn active={drawerTab === 'history'} onClick={() => setDrawerTab('history')} label="LOGS" icon="database" />
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar pb-32">
              {/* LOGIC: CALCULATE YIELD FOR SELLABLE ITEMS */}
              {(() => {
                if (selectedItem.item_type !== 'sellable' || !selectedItem.recipe?.length) return null;

                // Calculate max yield
                const yieldlimit = selectedItem.recipe.reduce((min, r) => {
                  const ing = items.find(i => i.id === r.ingredientId);
                  if (!ing || !ing.current_stock) return 0;
                  const possible = Math.floor(ing.current_stock / r.quantity);
                  return Math.min(min, possible);
                }, Infinity);

                const finalYield = yieldlimit === Infinity ? 0 : yieldlimit;

                return (
                  <div className="mx-6 mt-2 mb-0 p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between animate-in slide-in-from-top-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-white/60">inventory</span>
                      <div>
                        <p className="text-[9px] font-black text-white/80 uppercase tracking-widest">Stock Estimado</p>
                        <p className="text-[9px] text-white/40">Basado en tus insumos actuales</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-black text-white italic-black">{finalYield}</span>
                      <span className="text-[9px] font-bold text-white/40 ml-1">UNID.</span>
                    </div>
                  </div>
                );
              })()}

              {drawerTab === 'details' && (
                <div className="space-y-8 animate-in slide-in-from-right-8 duration-500">
                  <div className="space-y-4">
                    {/* Compact Category & Unit Size Row */}
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <div className="relative">
                          <select
                            value={selectedItem.category_ids?.[0] || ''}
                            onChange={(e) => {
                              const newCatId = e.target.value;
                              setSelectedItem(prev => prev ? { ...prev, category_ids: newCatId ? [newCatId] : [] } : null);
                            }}
                            className="w-full appearance-none bg-[#111] border border-white/10 rounded-lg h-9 pl-3 pr-8 text-[11px] font-bold text-white outline-none focus:border-neon/50 cursor-pointer hover:border-white/20 transition-all"
                          >
                            <option value="">Sin categoría</option>
                            {categories
                              .sort((a, b) => (a.position || 0) - (b.position || 0))
                              .map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                              ))}
                          </select>
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 material-symbols-outlined text-white/30 text-sm pointer-events-none">expand_more</span>
                        </div>
                      </div>

                      {selectedItem.item_type !== 'sellable' && (
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[7px] font-black text-neon uppercase tracking-widest whitespace-nowrap">
                            CONFIGURACIÓN DE ENVASE CERRADO
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              // Bind to package_size (DB) or fallback to unit_size
                              value={selectedItem.package_size || selectedItem.unit_size || ''}
                              onChange={(e) => setSelectedItem(prev => prev ? { ...prev, package_size: parseFloat(e.target.value) || 0, unit_size: parseFloat(e.target.value) || 0 } : null)}
                              placeholder="750"
                              className="w-16 h-9 rounded-lg bg-[#111] border border-white/10 px-2 text-center text-[11px] font-bold text-white outline-none focus:border-neon/50 hover:border-white/20 transition-all"
                            />
                            <div className="relative">
                              <select
                                // Bind to unit_type (used for stock display) and sync with content_unit
                                // Normalize DB values to dropdown values: kg→kilo, g→gram, L→liter
                                value={(() => {
                                  const dbValue = selectedItem.unit_type || 'unit';
                                  const normalize: Record<string, string> = { 'kg': 'kilo', 'g': 'gram', 'L': 'liter', 'un': 'unit' };
                                  return normalize[dbValue] || dbValue;
                                })()}
                                onChange={(e) => setSelectedItem(prev => prev ? {
                                  ...prev,
                                  unit_type: e.target.value,
                                  content_unit: e.target.value === 'gram' ? 'g' : e.target.value === 'ml' ? 'ml' : e.target.value === 'kilo' ? 'kg' : e.target.value === 'liter' ? 'L' : 'un'
                                } : null)}
                                className="appearance-none bg-[#111] border border-white/10 rounded-lg h-9 pl-2 pr-6 text-[10px] font-bold text-white outline-none cursor-pointer hover:border-white/20 transition-all"
                              >
                                <option value="unit">Unidades</option>
                                <option value="gram">Gramos</option>
                                <option value="kilo">Kilos</option>
                                <option value="ml">Mililitros</option>
                                <option value="liter">Litros</option>
                              </select>
                              <span className="absolute right-1 top-1/2 -translate-y-1/2 material-symbols-outlined text-white/30 text-[10px] pointer-events-none">expand_more</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Cost & Price Row */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em] ml-1"> Costo Unit. </label>
                        <div
                          onClick={() => setShowEditPriceModal(true)}
                          className="relative cursor-pointer group"
                        >
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 text-xs">$</span>
                          <div className="w-full bg-black border border-white/10 rounded-2xl h-12 pl-6 pr-10 font-black text-white text-lg flex items-center justify-end group-hover:border-amber-500/30 transition-all">
                            {selectedItem.cost || 0}
                          </div>
                          <button className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 group-hover:text-amber-500 transition-colors">
                            <span className="material-symbols-outlined text-base">edit</span>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em] ml-1"> Valor Stock </label>
                        <div className="h-12 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-end px-4 font-black text-white/40 text-lg">
                          ${(((selectedItem.current_stock || 0) / (selectedItem.package_size || 1)) * (selectedItem.cost || 0)).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                      </div>
                    </div>

                    {selectedItem.item_type === 'sellable' && (
                      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                        <div className="space-y-2">
                          <label className="text-[8px] font-medium uppercase text-white/40 tracking-[0.2em]">Precio Venta</label>
                          <div className="h-12 bg-black/40 border border-white/10 rounded-xl flex items-center justify-center font-light text-lg text-rose-300">
                            ${selectedItem.price?.toFixed(2) || '0.00'}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[8px] font-medium uppercase text-white/40 tracking-[0.2em]">Margen Neto</label>
                          <div className={`h-12 bg-black/40 border border-white/10 rounded-xl flex items-center justify-center font-light text-lg ${selectedItem.price && ((selectedItem.price - selectedItem.cost) / selectedItem.cost) > 0.5 ? 'text-green-400' : 'text-rose-300'
                            }`}>
                            {selectedItem.price ? `${(((selectedItem.price - selectedItem.cost) / selectedItem.cost) * 100).toFixed(0)}%` : '0%'}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ACTIONS - Contextual Mobile Header */}
                  <div className="flex items-center gap-2 p-4 border-b border-white/5 bg-white/[0.01]">
                    <button
                      onClick={() => setAdjustmentModal({ open: true, type: 'WASTE' })}
                      className="flex-1 py-3 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-red-500/20 transition-all"
                    >
                      <span className="material-symbols-outlined text-sm">delete_forever</span>
                      Pérdida
                    </button>
                    <button
                      onClick={() => setAdjustmentModal({ open: true, type: 'RESTOCK' })}
                      className="flex-1 py-3 rounded-xl bg-green-500/10 text-green-400 border border-green-500/20 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-green-500/20 transition-all"
                    >
                      <span className="material-symbols-outlined text-sm">add_box</span>
                      Re-ingreso
                    </button>
                  </div>

                  {/* METRICS & DETAILS */}
                  {drawerTab === 'details' && (
                    <div className="bg-white/[0.02] rounded-2xl p-6 border border-white/5 space-y-6">
                      {/* STOCK CERRADO - Principal */}
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[10px] font-medium text-cream/70 uppercase tracking-[0.2em] mb-2">STOCK CERRADO</p>
                          <div className="flex items-baseline gap-3">
                            <p className="text-5xl font-light text-cream tracking-tighter">
                              {Math.floor(selectedItem.closed_stock || 0)}
                            </p>
                            <p className="text-sm font-medium text-white/30">unidades</p>
                          </div>
                          {/* Clarificación de qué contiene cada unidad */}
                          {selectedItem.package_size && selectedItem.package_size > 1 && (
                            <p className="text-[11px] font-light text-white/30 mt-2">
                              1 unidad = <span className="text-cream/50 font-medium">{selectedItem.package_size}{selectedItem.unit_type === 'gram' ? 'g' : selectedItem.unit_type === 'ml' ? 'ml' : ''}</span>
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => setIsTransferModalOpen(true)}
                          className="px-5 py-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 hover:bg-rose-500/20 transition-all group"
                        >
                          <span className="material-symbols-outlined text-rose-400 text-lg group-hover:scale-110 transition-transform">swap_horiz</span>
                          <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">TRANSFERIR</span>
                        </button>
                      </div>

                      <div className="h-px bg-white/5 w-full"></div>

                      {/* STOCK TOTAL - Secundario */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-baseline">
                          <p className="text-[9px] font-medium text-white/30 uppercase tracking-widest">Stock Total (calculado)</p>
                          <div className="text-[9px] text-white/20 italic">cerrados × tamaño + abiertos</div>
                        </div>

                        <div className="flex items-baseline gap-2">
                          <p className="text-2xl font-light text-white/60 tracking-tight">
                            {selectedItem.current_stock}
                          </p>
                          <span className="text-xs font-medium text-white/30">
                            {selectedItem.unit_type === 'unit' ? 'unidades' :
                              selectedItem.unit_type === 'gram' ? 'gramos' :
                                selectedItem.unit_type === 'ml' ? 'ml' :
                                  selectedItem.unit_type === 'kilo' ? 'kilos' :
                                    selectedItem.unit_type === 'liter' ? 'litros' : 'unidades'}
                          </span>
                        </div>
                      </div>

                      {/* STOCK POR UBICACIÓN */}
                      {selectedItem.item_type === 'ingredient' && (
                        <div className="pt-4 space-y-4">
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-white/30 text-sm">location_on</span>
                            <span className="text-[9px] font-medium uppercase text-white/30 tracking-[0.2em]">Ubicaciones</span>
                            <div className="flex-1 h-px bg-white/5"></div>
                          </div>
                          <LocationStockBreakdown
                            itemId={selectedItem.id}
                            unitType={selectedItem.unit_type}
                            packageSize={selectedItem.package_size || 1}
                            refreshKey={stockRefreshKey}
                            onLocationClick={(locName) => {
                              console.log('📍 Navigating to Logistics:', locName);
                              setActiveLocationFilter(locName);
                              setFilter('logistics');
                              setSelectedItem(null);
                              addToast(`Navegando a: ${locName}`, 'info');
                            }}
                          />
                        </div>
                      )}

                      <AIStockInsight
                        currentStock={selectedItem.current_stock}
                        minStock={selectedItem.min_stock || 0}
                      />

                    </div>
                  )}

                  {/* PAQUETES ABIERTOS - Sección Detallada */}
                  {(selectedItem.open_packages?.length > 0 || selectedItem.open_count > 0) && (
                    <div className="space-y-4 mt-6">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-cream text-sm">inventory_2</span>
                        <span className="text-[9px] font-medium uppercase text-cream/60 tracking-[0.2em]">Paquetes Abiertos</span>
                        <div className="flex-1 h-px bg-white/5"></div>
                        <span className="text-xs font-bold text-cream bg-white/5 px-2 py-1 rounded-md">{selectedItem.open_packages?.length || selectedItem.open_count}</span>
                      </div>

                      <div className="space-y-3">
                        {selectedItem.open_packages?.map((pkg, idx) => {
                          const capacity = pkg.package_capacity || (selectedItem.unit_size || selectedItem.package_size || 1000);
                          const remaining = pkg.remaining ?? pkg.remaining_quantity ?? 0;
                          const percentage = capacity ? Math.round((remaining / capacity) * 100) : 0;
                          const barColor = percentage > 50 ? '#4ADE80' : percentage > 20 ? '#FBBF24' : '#EF4444';
                          const statusText = percentage > 50 ? 'Disponible' : percentage > 20 ? 'Medio' : 'Bajo';

                          // Unit Display Logic Smart (Prioritize user-edited fields for unit context)
                          let rawUnit = selectedItem.unit_measure || selectedItem.content_unit || selectedItem.unit_type || 'un';
                          let displayUnit = rawUnit;
                          let displayCapacity = capacity;
                          let displayRemaining = remaining;

                          if (['gram', 'ml', 'g'].includes(rawUnit) && capacity >= 1000) {
                            displayUnit = rawUnit === 'gram' || rawUnit === 'g' ? 'KG' : 'L';
                            displayCapacity = capacity / 1000;
                            displayRemaining = remaining / 1000;
                          }

                          return (
                            <div key={pkg.id || idx} className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
                              {/* Header con número de paquete y capacidad total */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="size-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/5">
                                    <span className="text-[10px] font-black text-white/80">#{idx + 1}</span>
                                  </div>
                                  <div className="flex flex-col">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[11px] font-black text-white tracking-wide">
                                        {displayRemaining % 1 === 0 ? displayRemaining : displayRemaining.toFixed(2)} {displayUnit}
                                      </span>
                                      <span className="text-[9px] font-bold text-white/30 uppercase">/ {displayCapacity} {displayUnit}</span>
                                    </div>
                                    <span className="text-[8px] text-white/40 font-bold uppercase tracking-wider">{statusText}</span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
                                  <span className="text-base font-black font-mono" style={{ color: barColor }}>
                                    {percentage}%
                                  </span>
                                </div>
                              </div>

                              {/* Progress Bar Enhanced */}
                              <div className="relative w-full h-3 bg-black/60 rounded-full overflow-hidden border border-white/5">
                                <div
                                  className="h-full transition-all duration-500 rounded-full relative overflow-hidden"
                                  style={{
                                    width: `${percentage}%`,
                                    backgroundColor: barColor,
                                    boxShadow: `0 0 15px ${barColor}50`
                                  }}
                                >
                                  <div className="absolute inset-0 bg-white/20 animate-pulse-slow"></div>
                                </div>
                              </div>

                              {/* Info adicional Footer */}
                              <div className="flex items-center justify-between text-[8px] pt-1 border-t border-white/5">
                                {(pkg.location_name || pkg.location) ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation(); // Prevent row click
                                      const locName = pkg.location_name || pkg.location;
                                      console.log('📍 Location Clicked (Open Pkg):', locName);
                                      setActiveLocationFilter(locName);
                                      setFilter('logistics'); // Switch to Logistics Tab
                                      setSelectedItem(null); // Close drawer
                                      addToast(`Navegando a: ${locName}`, 'info');
                                    }}
                                    className="text-white/40 flex items-center gap-1 hover:text-neon transition-colors cursor-pointer group relative z-50 text-left"
                                  >
                                    <span className="material-symbols-outlined text-[10px] group-hover:text-neon">location_on</span>
                                    <span className="underline decoration-transparent group-hover:decoration-neon/50 underline-offset-2 transition-all">
                                      {pkg.location_name || pkg.location}
                                    </span>
                                  </button>
                                ) : (
                                  <span className="text-white/20">Sin ubicación</span>
                                )}
                                {pkg.opened_at && (
                                  <span className="text-white/30 font-mono">
                                    {new Date(pkg.opened_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        }) || (
                            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 text-center">
                              <span className="text-sm font-bold text-white/40">{selectedItem.open_count} paquetes abiertos</span>
                              <p className="text-[9px] text-white/20 mt-1">Sin información detallada disponible</p>
                            </div>
                          )}
                      </div>
                    </div>
                  )}
                </div>
              )}


              {drawerTab === 'recipe' && (
                <div className="space-y-6 animate-in slide-in-from-right-8 duration-500">
                  <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/10">
                    <div>
                      <h4 className="text-[10px] font-black uppercase text-white italic leading-none">Protocolo de Insumos</h4>
                      <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-1">COSTO TEÓRICO: ${selectedItem.cost.toFixed(2)}</p>
                    </div>
                    {!isAddingRecipeItem && (
                      <button onClick={() => setIsAddingRecipeItem(true)} className="flex items-center gap-1 bg-neon text-black px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                        <span className="material-symbols-outlined text-base">link</span>
                        VINCULAR INSUMO
                      </button>
                    )}
                  </div>

                  {/* VARIANT AVAILABILITY SECTION */}
                  {(() => {
                    const availability = getRecipeAvailability(selectedItem);
                    if (availability.variantsStatus.length === 0) return null;

                    return (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em]">Disponibilidad por Variante</span>
                          <div className="flex-1 h-px bg-white/10"></div>
                        </div>
                        <div className="space-y-2">
                          {availability.variantsStatus.map((variant) => (
                            <div key={`variant-${variant.name}-${variant.ingredients.length}`} className="p-3 rounded-xl bg-white/5 border border-white/10">
                              <div className="flex items-start gap-2 mb-2">
                                <span className="text-base">{variant.isResolvable ? '✔' : '✖'}</span>
                                <div className="flex-1">
                                  <p className="text-[10px] font-black text-white uppercase">{variant.name}</p>
                                  <div className="mt-2 space-y-1">
                                    {variant.ingredients.map((ing) => (
                                      <div key={`ingredient-${variant.name}-${ing.name}-${ing.required}`} className="text-[8px] font-medium text-white/60 flex items-center gap-1.5">
                                        <span>{ing.hasStock ? (ing.isCritical ? '⚠️' : '✓') : '❌'}</span>
                                        <span>{ing.name}</span>
                                        {ing.isCritical && ing.hasStock && (
                                          <span className="text-yellow-500/60">— Crítico</span>
                                        )}
                                        {!ing.hasStock && (
                                          <span className="text-red-500/60">— Sin stock</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* UX MICROCOPY FOR RECIPES */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                      <div className="flex items-start gap-2">
                        <span className="material-symbols-outlined text-neon text-sm mt-0.5">auto_mode</span>
                        <div>
                          <p className="text-[8px] font-black text-white uppercase">Deducción Automática</p>
                          <p className="text-[8px] text-white/50 leading-tight mt-1">
                            Al vender este producto, los insumos se descontarán del stock en tiempo real.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                      <div className="flex items-start gap-2">
                        <span className="material-symbols-outlined text-orange-400 text-sm mt-0.5">scale</span>
                        <div>
                          <p className="text-[8px] font-black text-orange-400 uppercase">Consumo Exacto</p>
                          <p className="text-[8px] text-white/50 leading-tight mt-1">
                            Define la cantidad exacta (gr, ml, un) que consume cada venta.
                          </p>
                        </div>
                      </div>
                    </div>
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
                              className="w-full bg-black border border-white/10 rounded-xl h-11 pl-10 pr-4 text-[10px] font-bold text-white uppercase outline-none focus:border-white/50 transition-all placeholder:text-white/10"
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
                                  <p className="text-[7px] font-bold text-white/30 uppercase">COSTO: {formatCurrency(ing.cost)} / {ing.unit_type}</p>
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
                                <p className="text-[7px] font-bold text-white/60 uppercase">DATO: {formatCurrency(selectedIngredientToAdd.cost)} por {selectedIngredientToAdd.unit_type}</p>
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
                                className="w-full bg-black border border-white/10 rounded-xl h-12 px-4 text-xl font-black text-white outline-none focus:border-white/50 text-center"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[8px] font-black text-white/30 uppercase tracking-widest">Impacto Costo</label>
                              <div className="h-12 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center font-black text-neon text-xl font-mono">
                                {formatCurrency((parseFloat(addQuantity) || 0) * selectedIngredientToAdd.cost)}
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-3 pt-2">
                            <button onClick={() => setIsAddingRecipeItem(false)} className="flex-1 py-4 bg-white/5 text-white/40 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-white/10 transition-all">DESARTICULAR</button>
                            <button onClick={handleConfirmAddIngredient} className="flex-[2] py-4 bg-neon text-black rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:bg-gray-100 active:scale-95 transition-all">CONFIRMAR VÍNCULO</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-3">
                    {/* RECIPE COST SUMMARY */}
                    {selectedItem.recipe && selectedItem.recipe.length > 0 && (() => {
                      const totalCost = selectedItem.recipe.reduce((sum, comp) => {
                        const insumo = items.find(i => i.id === comp.ingredientId);
                        return sum + (insumo ? comp.quantity * insumo.cost : 0);
                      }, 0);
                      return (
                        <div className="p-4 rounded-2xl bg-neon/5 border border-neon/20 flex justify-between items-center">
                          <div>
                            <p className="text-[9px] font-black text-neon uppercase tracking-widest">Costo Total de Receta</p>
                            <p className="text-[8px] text-white/40 mt-0.5">Suma de todos los insumos utilizados</p>
                          </div>
                          <p className="text-xl font-black text-neon font-mono">{formatCurrency(totalCost)}</p>
                        </div>
                      );
                    })()}

                    {selectedItem.recipe?.map((comp) => {
                      const insumo = items.find(i => i.id === comp.ingredientId);
                      if (!insumo) return null;
                      const stockStatus = insumo.current_stock > comp.quantity * 10 ? 'ok' : insumo.current_stock > comp.quantity * 3 ? 'warning' : 'critical';
                      return (
                        <div key={`recipe-detail-${comp.ingredientId}-${comp.quantity}`} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex justify-between items-center group hover:bg-white/[0.04] transition-all">
                          <div className="flex items-center gap-4">
                            <img src={insumo.image_url} className="size-10 rounded-xl object-cover grayscale group-hover:grayscale-0 transition-all" />
                            <div>
                              <p className="text-[11px] font-black text-white uppercase italic tracking-tight">{insumo.name}</p>
                              <p className="text-[8px] font-bold text-white/80 uppercase mt-0.5">{comp.quantity} {insumo.unit_type} × {formatCurrency(insumo.cost)}</p>
                              {/* STOCK INDICATOR */}
                              <div className="flex items-center gap-1.5 mt-1">
                                <div className={`w-1.5 h-1.5 rounded-full ${stockStatus === 'ok' ? 'bg-neon' : stockStatus === 'warning' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                                <span className={`text-[7px] font-bold uppercase ${stockStatus === 'ok' ? 'text-neon/70' : stockStatus === 'warning' ? 'text-yellow-500/70' : 'text-red-500/70'}`}>
                                  Stock: {insumo.current_stock?.toFixed(1) || 0} {insumo.unit_type}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-5">
                            <p className="text-[12px] font-black text-white font-mono">{formatCurrency(comp.quantity * insumo.cost)}</p>
                            <button
                              onClick={() => handleDeleteIngredient(comp.ingredientId)}
                              className="size-8 rounded-xl bg-white/5 flex items-center justify-center text-white/20 hover:text-rose-500 hover:bg-rose-500/10 transition-all"
                            >
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
              {/* HISTORY TAB UI */}
              {drawerTab === 'history' && (
                <div className="space-y-6 animate-in slide-in-from-right-8 duration-500">
                  <div className="bg-[#141714] border border-white/10 rounded-2xl overflow-hidden">
                    <div className="p-4 border-b border-white/5 bg-white/[0.02]">
                      <h4 className="text-[10px] font-black uppercase text-white tracking-widest">Trazabilidad de Stock</h4>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto">
                      {loadingMovements ? (
                        <div className="p-8 text-center text-white/30 text-xs">Cargando movimientos...</div>
                      ) : stockMovements.length === 0 ? (
                        <div className="p-8 flex flex-col items-center justify-center text-center">
                          <span className="material-symbols-outlined text-white/10 text-3xl mb-2">history_toggle_off</span>
                          <p className="text-[10px] text-white/30 uppercase tracking-widest">Sin movimientos registrados</p>
                        </div>
                      ) : (
                        <table className="w-full text-left border-collapse">
                          <tbody className="divide-y divide-white/5">
                            {stockMovements.map((mov) => (
                              <tr key={mov.id} className="hover:bg-white/[0.02] transition-colors">
                                <td className="p-3">
                                  <div className="flex flex-col">
                                    <span className={`text-[10px] font-black uppercase tracking-wider ${mov.qty_delta < 0 ? 'text-red-400' : 'text-neon'}`}>
                                      {STOCK_MOVEMENT_REASON_LABELS[mov.reason] || mov.reason}
                                    </span>
                                    <span className="text-[9px] text-white/30 font-mono mt-0.5">
                                      {new Date(mov.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                                    </span>
                                  </div>
                                </td>
                                <td className="p-3 text-right">
                                  <span className={`text-[11px] font-bold font-mono ${mov.qty_delta < 0 ? 'text-neon' : 'text-neon'}`}>
                                    {mov.qty_delta > 0 ? '+' : ''}{Number(mov.qty_delta).toFixed(3)} <span className="text-[8px] text-white/40">{mov.unit_type}</span>
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Placeholder for Data */}

            </div>

            <div className="p-6 bg-black/80 border-t border-white/10 flex gap-3 backdrop-blur-xl">
              <button
                onClick={handleUpdateItem}
                disabled={isProcessing}
                className="flex-[3] py-4 rounded-2xl bg-neon text-black font-black text-[10px] uppercase tracking-widest shadow-2xl hover:scale-[1.02] transition-all disabled:opacity-50"
              >
                {isProcessing ? 'GUARDANDO...' : 'ACTUALIZAR ÍTEM'}
              </button>
              <button
                onClick={handleDeleteItem}
                className="flex-1 py-4 rounded-2xl border border-white/10 bg-white/5 text-white/20 font-black text-[9px] uppercase tracking-widest hover:text-red-500 hover:border-red-500/30 hover:bg-red-500/10 transition-all">
                BAJA
              </button>
            </div>
          </>
        )
        }
      </div >

      {/* MODAL CARGA SUMINISTRO */}
      {
        showInsumoWizard && (
          <div className="fixed inset-0 z-[5050] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowInsumoWizard(false)}></div>
            <div className="relative bg-[#0D0F0D] rounded-3xl shadow-2xl w-full max-w-md border border-white/10 animate-in zoom-in-95 duration-300 overflow-hidden">

              {/* Header */}
              <div className="p-6 border-b border-white/[0.04] flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tighter">
                    <span className="text-neon">CARGA</span>{' '}
                    <span className="text-neon">SUMINISTRO</span>
                  </h2>
                  <p className="text-white/30 text-[9px] uppercase tracking-[0.15em] mt-0.5">
                    Formulario de registro manual
                  </p>
                </div>
                <button
                  onClick={() => setShowInsumoWizard(false)}
                  className="size-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-neon transition-all"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              {/* Form */}
              <div className="p-6 space-y-5">
                {/* TIPO DE ITEM - SELECTOR PRINCIPAL */}
                <div className="space-y-3">
                  <label className="text-[8px] font-black text-white/40 uppercase tracking-widest block">
                    Tipo de Ítem
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setNewItemForm({ ...newItemForm, price: 0 })} // INSUMO: no tiene precio de venta
                      className={`p-4 rounded-2xl border-2 transition-all ${newItemForm.price === 0
                        ? 'border-neon bg-white/10 text-neon'
                        : 'border-white/10 bg-white/5 text-white/40 hover:border-white/20'
                        }`}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <span className="material-symbols-outlined text-2xl">inventory</span>
                        <div className="text-center">
                          <p className="text-[10px] font-black uppercase">INSUMO</p>
                          <p className="text-[7px] text-white/50 mt-0.5">Materia prima</p>
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => setNewItemForm({ ...newItemForm, price: 1 })} // PRODUCTO: tiene precio > 0
                      className={`p-4 rounded-2xl border-2 transition-all ${newItemForm.price > 0
                        ? 'border-neon bg-white/10 text-neon'
                        : 'border-white/10 bg-white/5 text-white/40 hover:border-white/20'
                        }`}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <span className="material-symbols-outlined text-2xl">shopping_cart</span>
                        <div className="text-center">
                          <p className="text-[10px] font-black uppercase">PRODUCTO</p>
                          <p className="text-[7px] text-white/50 mt-0.5">Para vender</p>
                        </div>
                      </div>
                    </button>
                  </div>
                  <p className="text-[8px] text-white/30 text-center">
                    {newItemForm.price === 0
                      ? '📦 Los insumos tienen stock físico y se consumen en recetas'
                      : '🛒 Los productos se venden a clientes y tienen receta configurada'
                    }
                  </p>
                </div>

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
                      className="w-full bg-black border border-white/50 rounded-xl h-12 px-4 text-sm font-bold text-white outline-none focus:border-neon placeholder:text-white/20"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] font-black text-white/40 uppercase tracking-widest block mb-2">
                      Categoría
                    </label>
                    <select
                      value={newItemForm.category_id}
                      onChange={(e) => setNewItemForm({ ...newItemForm, category_id: e.target.value })}
                      className="w-full bg-black border border-white/10 rounded-xl h-12 px-4 text-sm font-bold text-white/60 outline-none focus:border-white/50 appearance-none cursor-pointer"
                    >
                      <option value="">Seleccionar Categoría</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Unidad + Tamaño + Costo Unit. + Stock Inicial */}
                {/* Unidad + Contenido/Tamaño */}
                <div className="grid grid-cols-4 gap-3">
                  <div className={(newItemForm.unit_type as string) === 'unit' ? 'col-span-1' : 'col-span-2'}>
                    <label className="text-[8px] font-black text-white/40 uppercase tracking-widest block mb-2">
                      Tipo de Unidad
                    </label>
                    <select
                      value={newItemForm.unit_type}
                      onChange={(e) => {
                        const type = e.target.value as UnitType;
                        setNewItemForm({
                          ...newItemForm,
                          // @ts-ignore
                          unit_type: type,
                          content_unit: (type as string) === 'unit' ? (newItemForm.content_unit || 'ml') : '',
                          package_size: 0
                        });
                      }}
                      className="w-full bg-black border border-white/10 rounded-xl h-12 px-3 text-sm font-bold text-white outline-none focus:border-white/50 appearance-none cursor-pointer"
                    >
                      <option value="unit">UNIDAD (Envase)</option>
                      <option value="kg">KILOGRAMOS (Granel)</option>
                      <option value="liter">LITROS (Granel)</option>
                      <option value="gram">GRAMOS (Granel)</option>
                      <option value="ml">MILILITROS (Granel)</option>
                    </select>
                  </div>

                  {(newItemForm.unit_type as string) === 'unit' ? (
                    <>
                      <div className="col-span-2">
                        <label className="text-[8px] font-black text-white/40 uppercase tracking-widest block mb-2">
                          Contenido Neto
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={newItemForm.package_size || ''}
                            onChange={(e) => setNewItemForm({ ...newItemForm, package_size: parseFloat(e.target.value) || 0 })}
                            placeholder="Ej: 500"
                            className="flex-1 bg-black border border-white/10 rounded-xl h-12 px-4 text-sm font-bold text-white outline-none focus:border-neon transition-all placeholder:text-white/20"
                          />
                          <select
                            value={newItemForm.content_unit || 'ml'}
                            onChange={(e) => setNewItemForm({ ...newItemForm, content_unit: e.target.value })}
                            className="w-20 bg-black border border-white/10 rounded-xl h-12 px-2 text-sm font-bold text-white outline-none focus:border-neon appearance-none cursor-pointer text-center"
                          >
                            <option value="ml">ml</option>
                            <option value="liter">L</option>
                            <option value="gram">g</option>
                            <option value="kg">kg</option>
                          </select>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="col-span-2">
                      <label className="text-[8px] font-black text-white/40 uppercase tracking-widest block mb-2">
                        {['kg', 'gram'].includes(newItemForm.unit_type) ? 'Tamaño Saco/Paquete' : 'Tamaño Bidón/Botella'}
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={newItemForm.package_size || ''}
                          onChange={(e) => setNewItemForm({ ...newItemForm, package_size: parseFloat(e.target.value) || 0 })}
                          placeholder={newItemForm.unit_type === 'kg' ? 'Ej: 25' : 'Ej: 5'}
                          className="w-full bg-black border border-white/10 rounded-xl h-12 px-4 text-sm font-bold text-white outline-none focus:border-neon transition-all placeholder:text-white/20"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-white/30 uppercase">
                          {newItemForm.unit_type === 'liter' ? 'L' : newItemForm.unit_type === 'ml' ? 'ml' : newItemForm.unit_type === 'kg' ? 'kg' : 'g'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Espacio vacío para alinear si es necesario, o dejar que el grid fluya */}
                  <div className="hidden"></div>
                  <div>
                    <label className="text-[8px] font-black text-white/40 uppercase tracking-widest block mb-2">
                      Costo Unit.
                    </label>
                    <input
                      type="number"
                      value={newItemForm.cost || ''}
                      onChange={(e) => setNewItemForm({ ...newItemForm, cost: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full bg-black border border-white/10 rounded-xl h-12 px-4 text-sm font-bold text-white outline-none focus:border-white/50 placeholder:text-white/20"
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
                      className="w-full bg-black border border-white/10 rounded-xl h-12 px-4 text-sm font-bold text-white outline-none focus:border-white/50 placeholder:text-white/20"
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
                      className="w-full bg-black border border-white/10 rounded-xl h-12 px-4 text-sm font-bold text-white/40 outline-none focus:border-white/50 placeholder:text-white/20"
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
                      className="w-full bg-black border border-white/10 rounded-xl h-12 px-4 text-sm font-bold text-white outline-none focus:border-white/50 placeholder:text-white/20"
                    />
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="p-6 border-t border-white/[0.04] flex gap-4">
                <button
                  onClick={() => setShowInsumoWizard(false)}
                  className="flex-1 py-4 rounded-xl bg-transparent text-white/40 font-black text-[10px] uppercase tracking-widest hover:text-neon transition-all"
                >
                  Volver
                </button>
                <button
                  onClick={handleCreateManualItem}
                  disabled={!newItemForm.name}
                  className="flex-[2] py-4 rounded-xl bg-neon text-black font-black text-[11px] uppercase tracking-widest hover:bg-white/90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Guardar Ítem
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* MODAL GESTIÓN DE CATEGORÍAS */}
      {
        showCategoryModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[6000] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-[#141714] border border-white/10 rounded-3xl p-6 w-full max-w-lg animate-in zoom-in-95 duration-300 shadow-2xl max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-white uppercase tracking-tight">
                  Gestionar <span className="text-neon">Categorías</span>
                </h3>
                <button
                  onClick={() => { setShowCategoryModal(false); setNewCategoryName(''); }}
                  className="size-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-neon transition-all"
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
                    className="flex-1 bg-black border border-white/10 rounded-xl h-12 px-4 text-sm font-bold text-white outline-none focus:border-white/50 transition-all placeholder:text-white/20"
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
        )
      }

      {/* INVOICE PROCESSOR MODAL */}
      <InvoiceProcessor
        isOpen={showInvoiceProcessor}
        onClose={() => setShowInvoiceProcessor(false)}
      />

      {/* RECIPE MODAL - ULTRA MINIMALIST & PREMIUM */}
      {
        showRecipeModal && (
          <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-[#050605]/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-[#0A0C0A] rounded-[2rem] border border-white/5 w-full max-w-lg shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] relative overflow-hidden group">
              {/* Subtle glow effects */}
              <div className="absolute top-0 right-0 size-64 bg-white/5 blur-[80px] rounded-full pointer-events-none opacity-50"></div>

              <div className="relative p-6 space-y-6">
                {/* Header Compacto */}
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-full bg-white/10 flex items-center justify-center border border-white/20 shadow-neon-soft">
                      <span className="material-symbols-outlined text-neon text-sm">science</span>
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-white italic uppercase tracking-tighter leading-none">
                        {editingProductId ? 'Editar Fórmula' : 'Nueva Receta'}
                      </h2>
                      <p className="text-[9px] font-bold text-white/30 uppercase tracking-[0.2em] mt-0.5">
                        ```
                        Composición Maestra
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowRecipeModal(false); setEditingProductId(null); setRecipeIngredients([]); setCustomRecipeName(''); }}
                    className="size-8 rounded-xl bg-white/5 flex items-center justify-center text-white/40 hover:text-neon hover:bg-white/10 transition-all"
                  >
                    <span className="material-symbols-outlined text-lg">close</span>
                  </button>
                </div>

                {/* Product Selector with Custom Name Input */}
                <div className="relative group/select transition-all">
                  <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent group-focus-within/select:via-white/50"></div>
                  <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1.5 block ml-1">Producto Final</label>
                  <div className="relative">
                    <input
                      list="products-list"
                      type="text"
                      placeholder="Buscar o escribir nombre nuevo..."
                      value={customRecipeName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomRecipeName(val);

                        // Check if it matches an existing product
                        const matched = items.find(i => i.name.toLowerCase() === val.toLowerCase() && i.item_type === 'sellable');
                        if (matched) {
                          setEditingProductId(matched.id);
                          // Load existing recipe
                          const existing = productRecipes.filter(r => r.product_id === matched.id);
                          if (existing.length > 0) {
                            const mappedIngredients: RecipeIngredientUI[] = existing.map(r => {
                              const invItem = items.find(i => i.id === r.inventory_item_id);
                              let unit: any = invItem?.unit_type || 'un';
                              let qty = r.quantity_required;
                              if (unit === 'kg') { if (qty < 1) { unit = 'gram'; qty *= 1000; } }
                              else if (unit === 'liter') { if (qty < 1) { unit = 'ml'; qty *= 1000; } }
                              return { id: r.inventory_item_id, qty: Number(qty.toFixed(4)), unit };
                            });
                            setRecipeIngredients(mappedIngredients);
                            // Set price if editing
                            if (matched.base_price || matched.price) {
                              setCustomPrice((matched.base_price || matched.price || 0).toString());
                            }
                          } else {
                            // Is existing product but has no recipe, clear ingredients if not already editing
                            if (editingProductId !== matched.id) setRecipeIngredients([]);
                            // Also load price
                            if (matched.base_price || matched.price) {
                              setCustomPrice((matched.base_price || matched.price || 0).toString());
                            }
                          }
                        } else {
                          setEditingProductId(null); // New product mode
                          // Keep ingredients if we are just typing a new name
                        }
                      }}
                      className="w-full bg-[#111311] border border-white/5 rounded-xl h-12 pl-4 pr-10 text-sm font-bold text-white outline-none placeholder:text-white/20 focus:border-white/30 focus:bg-white/[0.03] transition-all"
                    />
                    <datalist id="products-list">
                      {items.filter(i => i.item_type === 'sellable').map(product => (
                        <option key={product.id} value={product.name} />
                      ))}
                    </datalist>

                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/20">
                      {editingProductId ? (
                        <span className="material-symbols-outlined text-green-500 text-sm" title="Producto Existente">check_circle</span>
                      ) : customRecipeName ? (
                        <span className="material-symbols-outlined text-blue-500 text-sm animate-pulse" title="Se creará nuevo producto">add_circle</span>
                      ) : (
                        <span className="material-symbols-outlined text-sm">search</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ingredients List - Open & Clean */}
                <div className="space-y-4 pt-2">
                  <div className="flex justify-between items-end border-b border-white/5 pb-2">
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Composición</label>
                    {recipeIngredients.length > 0 && (
                      <span className="text-[10px] text-white/40 font-mono">{recipeIngredients.length} componentes</span>
                    )}
                  </div>

                  <div className="space-y-0.5 min-h-[100px]">
                    {recipeIngredients.length === 0 ? (
                      <div className="py-12 flex flex-col items-center justify-center text-center gap-4 opacity-40">
                        <div className="size-16 rounded-full bg-white/5 flex items-center justify-center">
                          <span className="material-symbols-outlined text-3xl text-white/20">soup_kitchen</span>
                        </div>
                        <p className="text-xs font-bold text-white/30 uppercase tracking-widest max-w-[200px]">
                          Agrega los insumos base para esta receta
                        </p>
                      </div>
                    ) : (
                      recipeIngredients.map((r) => {
                        const ing = items.find(i => i.id === r.id);
                        if (!ing) return null;

                        const u = (r.unit || 'unit').toLowerCase();
                        const isMass = ['kg', 'g', 'gram'].includes(u);
                        const isVolume = ['l', 'ml', 'litro', 'cc'].includes(u);

                        return (
                          <div key={r.id} className="flex items-center justify-between py-3 px-2 group hover:bg-white/[0.02] rounded-lg transition-colors">
                            <div className="flex flex-col">
                              <span className="text-sm font-light text-neon">{ing.name}</span>
                              <span className="text-[10px] text-white/20 uppercase tracking-wider">{ing.unit_type}</span>
                            </div>

                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2 relative group/input">
                                <input
                                  type="number"
                                  value={r.qty}
                                  onChange={(e) => updateIngredientQty(r.id, parseFloat(e.target.value) || 0)}
                                  className="w-20 bg-transparent text-right text-lg font-bold text-white outline-none placeholder:text-white/20 focus:text-neon transition-colors border-b border-transparent focus:border-white/50 px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  placeholder="0"
                                />
                                <button
                                  onClick={() => {
                                    const currentUnit = r.unit;
                                    let nextUnit: any = currentUnit;
                                    // Cycle logic
                                    if (currentUnit === 'kg') nextUnit = 'gram';
                                    else if (currentUnit === 'gram') nextUnit = 'kg';
                                    else if (currentUnit === 'liter') nextUnit = 'ml';
                                    else if (currentUnit === 'ml') nextUnit = 'liter';
                                    else if (currentUnit === 'unit') nextUnit = 'unit';

                                    // Update ONLY the unit, keep the quantity number as is
                                    setRecipeIngredients(prev => prev.map(item => item.id === r.id ? { ...item, unit: nextUnit } : item));
                                  }}
                                  className="h-6 px-1.5 flex items-center justify-center rounded bg-white/5 hover:bg-white/10 text-[10px] font-bold text-white/50 hover:text-neon transition-colors cursor-pointer border border-white/5 uppercase"
                                  title="Cambiar unidad"
                                >
                                  {r.unit}
                                </button>
                              </div>

                              {/* Price Display */}
                              <div className="w-24 text-right">
                                <span className="text-xs font-mono text-white/50">
                                  {(() => {
                                    let q = r.qty;
                                    if (['gram', 'ml'].includes((r.unit || '').toLowerCase())) q /= 1000;
                                    return formatCurrency((ing?.cost || 0) * q);
                                  })()}
                                </span>
                              </div>

                              {/* Delete */}
                              <button
                                onClick={() => removeIngredient(r.id)}
                                className="size-8 flex items-center justify-center rounded-full hover:bg-red-500/10 text-white/10 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                              >
                                <span className="material-symbols-outlined text-base">close</span>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}

                    {/* Add Button - Custom Searchable Dropdown */}
                    <div className="pt-4 relative z-50">
                      {!showIngredientSelector ? (
                        <div
                          onClick={() => {
                            setShowIngredientSelector(true);
                            setTimeout(() => document.getElementById('ing-search-input')?.focus(), 100);
                          }}
                          className="flex items-center justify-center gap-3 w-full py-4 border border-dashed border-white/10 rounded-xl hover:border-white/30 hover:bg-white/[0.02] transition-all cursor-pointer group"
                        >
                          <span className="material-symbols-outlined text-white/30 group-hover:text-neon transition-colors">add_circle</span>
                          <span className="text-xs font-bold text-white/30 uppercase tracking-widest group-hover:text-neon transition-colors">Añadir Insumo</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 animate-in fade-in zoom-in duration-200">
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 material-symbols-outlined text-sm">search</span>
                            <input
                              id="ing-search-input"
                              autoFocus
                              className="w-full bg-[#0a0a0a] border border-white/20 rounded-lg py-3 pl-10 pr-10 text-sm text-neon placeholder:text-white/20 outline-none shadow-[0_0_15px_rgba(255,255,255,0.05)] font-light focus:border-white/40 transition-all"
                              placeholder="Buscar ingrediente..."
                              value={ingredientSearch}
                              onChange={(e) => setIngredientSearch(e.target.value)}
                              onBlur={() => {
                                setTimeout(() => {
                                  setShowIngredientSelector(false);
                                  setIngredientSearch('');
                                }, 200);
                              }}
                            />
                            <button
                              onClick={() => setShowIngredientSelector(false)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-neon"
                            >
                              <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                          </div>

                          {/* Popover Results */}
                          <div className="absolute top-14 left-0 w-full bg-[#111] border border-white/10 rounded-lg shadow-2xl max-h-60 overflow-y-auto no-scrollbar z-[100]">
                            {items.filter(i =>
                              i.item_type === 'ingredient' &&
                              !recipeIngredients.find(r => r.id === i.id) &&
                              i.name.toLowerCase().includes(ingredientSearch.toLowerCase())
                            ).length === 0 ? (
                              <div className="p-4 text-center text-xs text-white/30">No se encontraron ingredientes</div>
                            ) : (
                              items.filter(i =>
                                i.item_type === 'ingredient' &&
                                !recipeIngredients.find(r => r.id === i.id) &&
                                i.name.toLowerCase().includes(ingredientSearch.toLowerCase())
                              ).map(ing => (
                                <div
                                  key={ing.id}
                                  onMouseDown={(e) => {
                                    e.preventDefault(); // Prevent blur
                                    const item = ing;
                                    let defaultUnit: any = item?.unit_type || 'unit';
                                    let defaultQty = 1;

                                    // RESTORED AUTOMATIC CONVERSION LOGIC
                                    if (item?.unit_type === 'kg') { defaultUnit = 'gram'; defaultQty = 100; }
                                    else if (item?.unit_type === 'liter') { defaultUnit = 'ml'; defaultQty = 100; }

                                    setRecipeIngredients(prev => [...prev, { id: item.id, qty: defaultQty, unit: defaultUnit }]);
                                    setShowIngredientSelector(false);
                                    setIngredientSearch('');
                                  }}
                                  className="px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 cursor-pointer flex justify-between items-center group/opt"
                                >
                                  <span className="text-sm text-gray-300 group-hover/opt:text-neon transition-colors">{ing.name}</span>
                                  <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-white/30">{ing.unit_type}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>


                  {/* Footer Costs & Price - Ultra Minimalist Text-Based */}
                  <div className="pt-8 mt-6 grid grid-cols-1 md:grid-cols-3 gap-12 border-t border-white/[0.04]">

                    {/* Costo Total */}
                    <div className="flex flex-col gap-2">
                      <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Costo Total</span>
                      <div className="flex items-baseline">
                        <span className="text-3xl font-light text-white tracking-tighter">
                          {(() => {
                            const totalCost = recipeIngredients.reduce((sum, r) => {
                              const ing = items.find(i => i.id === r.id);
                              let qty = r.qty;
                              const isG = ['gram', 'ml'].includes((r.unit || '').toLowerCase());
                              if (isG) qty /= 1000;
                              return sum + (ing?.cost || 0) * qty;
                            }, 0);
                            return formatCurrency(totalCost);
                          })()}
                        </span>
                      </div>
                    </div>

                    {/* Precio Venta - Ghost Input - Fixed */}
                    <div className="flex flex-col gap-2">
                      <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Precio Venta</span>
                      <div className="relative group/price">
                        <div className="flex items-baseline gap-1">
                          <span className="text-xl text-white/30 font-light">$</span>
                          <input
                            type="number"
                            value={customPrice}
                            onChange={(e) => setCustomPrice(e.target.value)}
                            placeholder="0.00"
                            className="w-full bg-transparent text-3xl font-light text-white outline-none border-none focus:ring-0 p-0 m-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-white/10"
                          />
                        </div>
                        {/* Animated Underline */}
                        <div className="absolute bottom-0 left-0 w-full h-px bg-white/10 group-focus-within/price:bg-neon group-focus-within/price:h-[2px] transition-all"></div>

                        {/* Rounding Actions - Below Input */}
                        <div className="grid grid-cols-2 gap-2 pt-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const val = parseFloat(customPrice || '0');
                              if (!isNaN(val) && val > 0) {
                                const rounded = Math.floor(val / 100) * 100;
                                // Smart Rounding: If already rounded, decrement by 100
                                if (rounded === val) {
                                  setCustomPrice(Math.max(0, val - 100).toString());
                                } else {
                                  setCustomPrice(rounded.toString());
                                }
                              }
                            }}
                            className="flex items-center justify-center p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-neon transition-all border border-white/5 hover:border-white/20 active:scale-95"
                            title="Redondear Abajo"
                          >
                            <span className="material-symbols-outlined text-xl">arrow_downward</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const val = parseFloat(customPrice || '0');
                              if (!isNaN(val) && val > 0) {
                                const rounded = Math.ceil(val / 100) * 100;
                                // Smart Rounding: If already rounded, increment by 100
                                if (rounded === val) {
                                  setCustomPrice((val + 100).toString());
                                } else {
                                  setCustomPrice(rounded.toString());
                                }
                              }
                            }}
                            className="flex items-center justify-center p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-neon transition-all border border-white/5 hover:border-white/20 active:scale-95"
                            title="Redondear Arriba"
                          >
                            <span className="material-symbols-outlined text-xl">arrow_upward</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Margen - Ghost Input - Fixed */}
                    <div className="flex flex-col gap-2">
                      {(() => {
                        const totalCost = recipeIngredients.reduce((sum, r) => {
                          const ing = items.find(i => i.id === r.id);
                          let qty = r.qty;
                          if (['gram', 'ml'].includes((r.unit || '').toLowerCase())) qty /= 1000;
                          return sum + (ing?.cost || 0) * qty;
                        }, 0);
                        const priceVal = parseFloat(customPrice || '0');
                        const profit = priceVal - totalCost;
                        // CHANGED: Switch to Markup logic (Profit / Cost) instead of Margin (Profit / Price)
                        const currentMargin = totalCost > 0 ? ((profit / totalCost) * 100) : 0;

                        let marginColor = 'text-white/30';
                        if (priceVal > 0) {
                          if (currentMargin < 0) marginColor = 'text-red-500';
                          else if (currentMargin < 30) marginColor = 'text-yellow-500';
                          else marginColor = 'text-neon';
                        }

                        return (
                          <div className="flex flex-col justify-between h-full group/margin">
                            <div className="flex justify-between items-baseline">
                              <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Margen</span>
                              <span className="text-[10px] text-white/30 font-mono">Ganancia: <span className="text-neon">{formatCurrency(profit)}</span></span>
                            </div>

                            <div className="relative">
                              <div className="flex items-baseline justify-end gap-1">
                                <input
                                  type="number"
                                  className={`w-full bg-transparent text-right text-3xl font-light outline-none border-none focus:ring-0 p-0 m-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${marginColor} placeholder:text-white/10`}
                                  placeholder="0"
                                  value={isEditingMargin ? marginInputValue : (priceVal > 0 ? currentMargin.toFixed(1) : '')}
                                  onFocus={() => {
                                    setIsEditingMargin(true);
                                    // Initialize with current value
                                    setMarginInputValue(priceVal > 0 ? currentMargin.toFixed(1) : '');
                                  }}
                                  onBlur={() => {
                                    setIsEditingMargin(false);
                                  }}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setMarginInputValue(val); // Always update local state immediately
                                    const targetMargin = parseFloat(val);

                                    // Only update price if valid number
                                    if (!isNaN(targetMargin)) {
                                      // CHANGED: Formula to Markup (Cost * (1 + Margin%))
                                      const newPrice = totalCost * (1 + (targetMargin / 100));
                                      setCustomPrice(newPrice.toFixed(2));
                                    }
                                  }}
                                />
                                <span className="text-xl text-white/20 font-light">%</span>
                              </div>
                              <div className="absolute bottom-0 right-0 w-full h-px bg-white/10 group-focus-within/margin:bg-white/50 transition-all"></div>
                            </div>
                          </div>
                        )
                      })()}
                    </div>

                  </div>

                  {/* Actions - Premium Minimal */}
                  <div className="pt-12 flex items-center justify-end gap-6">
                    <button
                      onClick={() => { setShowRecipeModal(false); setEditingProductId(null); setRecipeIngredients([]); setCustomRecipeName(''); }}
                      className="text-[10px] font-bold text-white/30 hover:text-white uppercase tracking-widest transition-colors py-2 px-4"
                    >
                      Cancelar
                    </button>

                    <button
                      onClick={async () => {
                        try {
                          let finalProductId = editingProductId;
                          // Safe store ID retrieval
                          let currentStoreId = storeId;
                          if (!currentStoreId) {
                            const { data: { user } } = await supabase.auth.getUser();
                            if (user?.user_metadata?.store_id) {
                              currentStoreId = user.user_metadata.store_id;
                              // Update state if possible, but use local var for now
                            } else {
                              // Fallback: try to find a store associated with user profile
                              const { data: profile } = await supabase.from('profiles').select('store_id').eq('id', user?.id).single();
                              if (profile?.store_id) currentStoreId = profile.store_id;
                            }
                          }

                          if (!currentStoreId) {
                            addToast('Error Crítico: No se detectó ID de Tienda. Recarga la página.', 'error');
                            return;
                          }

                          if (!currentStoreId) {
                            const { data: userSession } = await supabase.auth.getUser();
                            if (userSession?.user?.user_metadata?.store_id) {
                              currentStoreId = userSession.user.user_metadata.store_id;
                            } else {
                              const { data: profile } = await supabase.from('profiles').select('store_id').eq('id', userSession?.user?.id).single();
                              if (profile?.store_id) currentStoreId = profile.store_id;
                            }
                          }

                          if (!currentStoreId) {
                            addToast('Error Crítico: No se detectó ID de Tienda. Recarga la página.', 'error');
                            return;
                          }

                          // Fetch Tenant ID logic if needed, or fallback to storeId if schema implies one-to-one
                          // Critical Fix: Explicitly fetch tenant_id from stores if possible. Using 'as any' to avoid TS errors on dynamic column.
                          // @ts-ignore
                          const { data: storeData } = await supabase.from('stores').select('*').eq('id', currentStoreId).single();
                          const tenantId = (storeData as any)?.tenant_id || (storeData as any)?.organization_id || currentStoreId;

                          // Creation Logic
                          if (!finalProductId && customRecipeName.trim()) {
                            const calculatedCost = recipeIngredients.reduce((sum, r) => {
                              const ing = items.find(i => i.id === r.id);
                              let qty = r.qty;
                              if (['gram', 'ml'].includes((r.unit || '').toLowerCase())) qty /= 1000;
                              return sum + (ing?.cost || 0) * qty;
                            }, 0);
                            const finalPrice = customPrice ? parseFloat(customPrice) : (calculatedCost * 2);

                            // Secure Save via RPC
                            const sku = `REC-${Math.floor(Math.random() * 10000)}`;

                            // @ts-ignore
                            const { data: rpcData, error: rpcError } = await supabase.rpc('create_recipe_product', {
                              p_name: customRecipeName,
                              p_base_price: finalPrice,
                              p_store_id: currentStoreId,
                              p_sku: sku
                            });

                            console.log('RPC create_recipe_product debug:', { rpcData, rpcError });

                            if (!rpcError && rpcData && (rpcData as any).success) {
                              finalProductId = (rpcData as any).data.id;
                              addToast('Producto creado via Backend', 'success');
                            } else {
                              const errorDetail = rpcError?.message || (rpcData as any)?.error || 'Unknown';
                              console.warn('RPC failed, attempting direct insert:', errorDetail);

                              // Fallback: Direct Insert (Legacy)
                              // @ts-ignore
                              const { data: newProd, error: prodError } = await supabase.from('products').insert({
                                name: customRecipeName,
                                sku: sku,
                                base_price: finalPrice,
                                category: 'Recetas',
                                is_available: true,
                                active: true,
                                store_id: currentStoreId,
                                tax_rate: 0,
                                created_at: new Date().toISOString(),
                                updated_at: new Date().toISOString()
                              }).select().single();

                              if (prodError) throw prodError;
                              if (!newProd) throw new Error('Failed to create product object');
                              finalProductId = newProd.id;
                              addToast('Producto creado via Fallback', 'success');
                            }

                            addToast('Producto creado: ' + customRecipeName, 'success');
                          }

                          if (!finalProductId) { addToast('Selecciona producto o escribe un nombre', 'error'); return; }
                          if (recipeIngredients.length === 0) { addToast('Sin ingredientes', 'error'); return; }

                          // Save Recipe Logic
                          const { error: delError } = await supabase.from('product_recipes').delete().eq('product_id', finalProductId);
                          if (delError) throw delError;

                          const rows = recipeIngredients.map(r => {
                            let quantity_required = r.qty;
                            if (r.unit === 'gram' || r.unit === 'ml') quantity_required /= 1000;
                            return { product_id: finalProductId, inventory_item_id: r.id, quantity_required };
                          });

                          const { error: insError } = await supabase.from('product_recipes').insert(rows);
                          if (insError) throw insError;

                          addToast('Receta guardada exitosamente', 'success');
                          setShowRecipeModal(false);
                          setEditingProductId(null);
                          setRecipeIngredients([]);
                          setCustomRecipeName('');
                          fetchData(true);

                        } catch (err: any) {
                          console.error(err);
                          addToast('Error: ' + (err.message || ''), 'error');
                        }
                      }}
                      className="h-10 px-8 rounded-full bg-neon text-black font-bold text-[10px] uppercase tracking-widest hover:bg-gray-200 transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.2)]"
                    >
                      <span>Guardar Receta</span>
                      <span className="material-symbols-outlined text-base">arrow_forward</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* STOCK TRANSFER MODAL */}
      {
        selectedItem && (
          <StockTransferModal
            isOpen={isTransferModalOpen}
            onClose={() => setIsTransferModalOpen(false)}
            item={selectedItem}
            onSuccess={() => fetchData(true)}
            onInitialStockClick={() => {
              setShowInsumoWizard(true);
              setWizardMethod('selector');
            }}
          />
        )
      }

      {/* STOCK ADJUSTMENT MODAL */}
      {
        selectedItem && (
          <StockAdjustmentModal
            isOpen={adjustmentModal.open}
            onClose={() => setAdjustmentModal({ ...adjustmentModal, open: false })}
            item={selectedItem}
            type={adjustmentModal.type}
            onSuccess={() => fetchData(true)}
          />
        )
      }

      {/* EDIT PRICE MODAL */}
      {
        selectedItem && (
          <EditPriceModal
            isOpen={showEditPriceModal}
            onClose={() => setShowEditPriceModal(false)}
            itemId={selectedItem.id}
            itemName={selectedItem.name}
            currentCost={selectedItem.cost || 0}
            currentPrice={selectedItem.price || 0}
            onSuccess={() => fetchData(true)}
          />
        )
      }
    </div >
  );
};

export default InventoryManagement;
