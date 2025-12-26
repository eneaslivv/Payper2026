import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { dbOps, DBOrder, SyncEvent } from '../lib/db';
import { Order, OrderStatus, Product } from '../types';
import { useToast } from '../components/ToastSystem';
import { MOCK_ORDERS, MOCK_PRODUCTS } from '../constants';
import { supabase } from '../lib/supabase';
import { mapOrderToSupabase, mapOrderItemToSupabase, mapStatusToSupabase } from '../lib/supabaseMappers';
import { useAuth } from './AuthContext';

interface OfflineContextType {
  isOnline: boolean;
  isSyncing: boolean;
  orders: DBOrder[];
  products: Product[];
  pendingSyncCount: number;
  createOrder: (order: Order) => Promise<void>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  refreshOrders: () => Promise<void>;
  triggerSync: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export const OfflineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [orders, setOrders] = useState<DBOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const { addToast } = useToast();
  const { profile } = useAuth();

  // Get store_id from profile
  const storeId = profile?.store_id;

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      // 1. Load Orders (Hybrid Strategy: Local + Optimized Remote Fetch)
      // First, get what we have locally (instant)
      let localOrders = await dbOps.getAllOrders();
      setOrders(localOrders.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()));

      // Then, if online, fetch ACTIVE orders from server (Optimized)
      if (navigator.onLine && storeId) {
        try {
          const { data: remoteOrders, error } = await supabase
            .from('orders')
            .select('id, store_id, status, total_amount, created_at, payment_status, payment_method, customer_name, table_number, items:order_items(id, name, quantity, price, product_id)')
            .eq('store_id', storeId)
            // Optimization: Only fetch active orders for the board
            .in('status', ['pending', 'preparing', 'ready', 'delivered'])
            .order('created_at', { ascending: false })
            .range(0, 49); // Pagination: Cap at 50 for performance

          if (!error && remoteOrders) {
            // Merge strategy: Server is truth for 'synced' orders. Keep local 'pending' sync orders.
            const mappedRemote: DBOrder[] = remoteOrders.map((ro: any) => ({
              id: ro.id,
              customer: ro.customer_name || 'Cliente',
              table: ro.table_number,
              status: (ro.status && ['Pendiente', 'En Preparación', 'Listo', 'Entregado', 'Cancelado'].includes(ro.status)) ? ro.status as OrderStatus : 'Pendiente',
              type: ro.table_number ? 'dine-in' : 'takeaway',
              paid: ro.payment_status === 'paid',
              items: ro.items?.map((i: any) => ({
                id: i.id || 'unknown',
                name: i.name,
                quantity: i.quantity,
                price: i.price || 0,
                price_unit: (i.price / i.quantity) || 0,
                productId: i.product_id
              })) || [],
              total: ro.total_amount || 0,
              amount: ro.total_amount || 0,
              time: new Date(ro.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              paymentMethod: ro.payment_method,
              syncStatus: 'synced',
              lastModified: new Date(ro.created_at).getTime()
            }));

            // Combine: Remote orders replace local ones with same ID. Local unsynced orders stay.
            const merged = [...mappedRemote];
            const localUnsynced = localOrders.filter(lo => lo.syncStatus === 'pending');

            // Add unsynced if not present (or overwrite remote if local is newer? usually local pending wins)
            localUnsynced.forEach(lu => {
              const idx = merged.findIndex(m => m.id === lu.id);
              if (idx >= 0) {
                merged[idx] = lu;
              } else {
                merged.push(lu);
              }
            });

            // Sort again
            merged.sort((a, b) => b.lastModified - a.lastModified);

            setOrders(merged);
            // Background: update IndexedDB with latest truth
            await Promise.all(mappedRemote.map(o => dbOps.saveOrder(o)));
          }
        } catch (err) {
          console.error("Error fetching remote orders", err);
        }
      }

      // 2. Load Products
      let localProducts = await dbOps.getAllProducts();

      // If online and have store_id, Try to fetch latest products from Supabase
      if (navigator.onLine && storeId) {
        try {
          // Fetch products for this store
          const { data: remoteProducts, error } = await supabase
            .from('products')
            .select('*')
            .eq('store_id', storeId);

          if (!error && remoteProducts && remoteProducts.length > 0) {
            // Map Supabase 'products' rows back to 'Product' type
            const mapped: Product[] = remoteProducts.map(rp => ({
              id: rp.id,
              name: rp.name,
              price: rp.price,
              sku: 'GEN-' + rp.id.substring(0, 8),
              category: 'General', // default or fetch category
              image: rp.image_url || '',
              stock: 100, // mock
              stockStatus: 'Alto',
              available: rp.available,
              variants: [],
              addons: []
            }));
            localProducts = mapped;
            await dbOps.saveProducts(localProducts);
          }
        } catch (err) {
          console.error("Error fetching products", err);
        }
      }

      if (localProducts.length === 0) {
        // Fallback to constants if nothing anywhere
        setProducts(MOCK_PRODUCTS);
      } else {
        setProducts(localProducts);
      }

      updatePendingCount();
    };
    loadData();
  }, [isOnline, storeId]);

  // Network Listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      addToast("CONEXIÓN RESTAURADA", "success", "Iniciando sincronización...");
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
      addToast("MODO OFFLINE ACTIVO", "info", "Operando en local. Sin interrupciones.");
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const updatePendingCount = async () => {
    const queue = await dbOps.getSyncQueue();
    setPendingSyncCount(queue.length);
  };

  const refreshOrders = async () => {
    const localOrders = await dbOps.getAllOrders();
    setOrders(localOrders.reverse());
  };

  // --- ACTIONS ---

  const createOrder = async (order: Order) => {
    const newOrder: DBOrder = {
      ...order,
      syncStatus: 'pending', // Default to pending until confirmed
      lastModified: Date.now()
    };

    // 1. Save locally immediately (Optimistic UI)
    await dbOps.saveOrder(newOrder);
    setOrders(prev => [newOrder, ...prev]);

    // 2. Attempt Sync if Online
    if (isOnline) {
      try {
        const { error } = await supabase.from('orders').insert(mapOrderToSupabase(newOrder, storeId || ''));
        if (error) throw error;

        // Sync Items
        if (newOrder.items.length > 0) {
          const itemsPayload = newOrder.items.map(item => mapOrderItemToSupabase(item, newOrder.id));
          // Filter out items without productId if necessary, or let it fail
          const validItems = itemsPayload.filter(i => i.product_id);
          if (validItems.length > 0) {
            const { error: itemsErr } = await supabase.from('order_items').insert(validItems);
            if (itemsErr) throw itemsErr;
          }
        }

        // Update local to synced
        const syncedOrder: DBOrder = { ...newOrder, syncStatus: 'synced' };
        await dbOps.saveOrder(syncedOrder);
        setOrders(prev => prev.map(o => o.id === newOrder.id ? syncedOrder : o));

      } catch (err) {
        console.error("Online sync failed, queuing", err);
        // Add to queue
        const event: SyncEvent = {
          id: `evt-${Date.now()}-${Math.random()}`,
          type: 'CREATE_ORDER',
          payload: newOrder,
          timestamp: Date.now()
        };
        await dbOps.addToSyncQueue(event);
        updatePendingCount();
      }
    } else {
      // Offline: just queue
      const event: SyncEvent = {
        id: `evt-${Date.now()}-${Math.random()}`,
        type: 'CREATE_ORDER',
        payload: newOrder,
        timestamp: Date.now()
      };
      await dbOps.addToSyncQueue(event);
      updatePendingCount();
    }
  };

  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const updatedOrder: DBOrder = {
      ...order,
      status,
      syncStatus: 'pending',
      lastModified: Date.now()
    };

    // 1. Save locally
    await dbOps.saveOrder(updatedOrder);
    setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));

    if (isOnline) {
      try {
        const { error } = await supabase.from('orders')
          .update({ status: mapStatusToSupabase(status) })
          .eq('id', orderId);

        if (error) throw error;

        // Success
        const syncedOrder: DBOrder = { ...updatedOrder, syncStatus: 'synced' };
        await dbOps.saveOrder(syncedOrder);
        setOrders(prev => prev.map(o => o.id === orderId ? syncedOrder : o));
      } catch (err) {
        console.error("Update status failed", err);
        const event: SyncEvent = {
          id: `evt-${Date.now()}-${Math.random()}`,
          type: 'UPDATE_STATUS',
          payload: { orderId, status },
          timestamp: Date.now()
        };
        await dbOps.addToSyncQueue(event);
        updatePendingCount();
      }
    } else {
      const event: SyncEvent = {
        id: `evt-${Date.now()}-${Math.random()}`,
        type: 'UPDATE_STATUS',
        payload: { orderId, status },
        timestamp: Date.now()
      };
      await dbOps.addToSyncQueue(event);
      updatePendingCount();
    }
  };

  // --- SYNC ENGINE ---

  const triggerSync = useCallback(async () => {
    if (!navigator.onLine) return;

    setIsSyncing(true);
    const queue = await dbOps.getSyncQueue();

    if (queue.length === 0) {
      setIsSyncing(false);
      return;
    }

    let processedCount = 0;
    for (const event of queue) {
      try {
        if (event.type === 'CREATE_ORDER') {
          const order = event.payload as DBOrder;
          const { error } = await supabase.from('orders').insert(mapOrderToSupabase(order, storeId || ''));
          if (error && error.code !== '23505') throw error; // 23505 = duplicate key, maybe already synced?

          // Items
          if (order.items.length > 0) {
            const itemsPayload = order.items.map(item => mapOrderItemToSupabase(item, order.id));
            const validItems = itemsPayload.filter(i => i.product_id);
            if (validItems.length > 0) {
              // Ignore duplicates just in case
              const { error: itemsErr } = await supabase.from('order_items').upsert(validItems, { onConflict: 'id' });
              // Note: we don't have IDs for items? mapOrderItemToSupabase removed ID.
              // upsert without ID? default insert.
              // Use insert.
              const { error: itemsErr2 } = await supabase.from('order_items').insert(validItems);
              if (itemsErr2) console.warn("Items sync warning", itemsErr2);
            }
          }

          await dbOps.saveOrder({ ...order, syncStatus: 'synced' });

        } else if (event.type === 'UPDATE_STATUS') {
          const { orderId, status } = event.payload;
          const { error } = await supabase.from('orders')
            .update({ status: mapStatusToSupabase(status) })
            .eq('id', orderId);
          if (error) throw error;

          const currentOrders = await dbOps.getAllOrders();
          const order = currentOrders.find(o => o.id === orderId);
          if (order) await dbOps.saveOrder({ ...order, syncStatus: 'synced' });
        }

        // Remove from queue
        await dbOps.removeSyncEvent(event.id);
        processedCount++;
      } catch (err) {
        console.error("Sync failed for event", event.id, err);
      }
    }

    await refreshOrders();
    updatePendingCount();
    setIsSyncing(false);

    if (processedCount > 0) {
      addToast(`${processedCount} CAMBIOS SINCRONIZADOS`, "success", "La nube está al día");
    }
  }, [addToast]);

  return (
    <OfflineContext.Provider value={{
      isOnline,
      isSyncing,
      orders,
      products,
      pendingSyncCount,
      createOrder,
      updateOrderStatus,
      refreshOrders,
      triggerSync
    }}>
      {children}
    </OfflineContext.Provider>
  );
};

export const useOffline = () => {
  const context = useContext(OfflineContext);
  if (!context) throw new Error('useOffline must be used within an OfflineProvider');
  return context;
};
