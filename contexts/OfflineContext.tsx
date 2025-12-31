import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { dbOps, DBOrder, SyncEvent } from '../lib/db';
import { Order, OrderStatus, Product } from '../types';
import { useToast } from '../components/ToastSystem';
import { MOCK_ORDERS, MOCK_PRODUCTS } from '../constants';
import { supabase } from '../lib/supabase';
import { mapOrderToSupabase, mapOrderItemToSupabase, mapStatusToSupabase, mapStatusFromSupabase } from '../lib/supabaseMappers';
import { useAuth } from './AuthContext';

interface OfflineContextType {
  isOnline: boolean;
  isSyncing: boolean;
  orders: DBOrder[];
  products: Product[];
  pendingSyncCount: number;
  pendingDeliveryOrders: string[];
  createOrder: (order: Order) => Promise<void>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  refreshOrders: () => Promise<void>;
  triggerSync: () => Promise<void>;
  syncOrder: (orderId: string) => Promise<void>;
  confirmOrderDelivery: (orderId: string, staffId: string) => Promise<{ success: boolean, message: string }>;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export const OfflineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [orders, setOrders] = useState<DBOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [pendingDeliveryOrders, setPendingDeliveryOrders] = useState<string[]>([]);
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
            .select(`
              id, 
              store_id, 
              status, 
              total_amount, 
              created_at, 
              payment_status, 
              payment_method,
              payment_provider,
              is_paid,
              order_number, 
              table_number, 
              client:clients(name, email), 
              items, 
              order_items(
                id, 
                quantity, 
                unit_price, 
                product_id, 
                product:inventory_items(name)
              )
            `)
            .order('created_at', { ascending: false })
            .range(0, 49);


          console.log('[OfflineContext] Fetched remote orders:', remoteOrders?.length, remoteOrders, 'Error:', error);

          if (!error && remoteOrders) {
            // Merge strategy: Server is truth for 'synced' orders. Keep local 'pending' sync orders.
            const mappedRemote: DBOrder[] = remoteOrders.map((ro: any) => ({
              id: ro.id,
              customer: ro.client?.name || 'Cliente',
              client_email: ro.client?.email,
              table: ro.table_number,
              status: ro.status ? mapStatusFromSupabase(ro.status) : 'Pendiente',
              type: ro.table_number ? 'dine-in' : 'takeaway',
              paid: ro.is_paid || ro.payment_status === 'approved' || ro.payment_status === 'paid',
              items: (ro.order_items && ro.order_items.length > 0)
                ? ro.order_items.map((i: any) => ({
                  id: i.id || 'unknown',
                  name: i.product?.name || 'Ítem',
                  quantity: i.quantity,
                  price_unit: i.unit_price || 0,
                  productId: i.product_id,
                  inventory_items_to_deduct: []
                }))
                : (Array.isArray(ro.items) ? ro.items.map((i: any) => ({
                  id: i.id || 'unknown',
                  name: i.name || 'Ítem',
                  quantity: i.quantity,
                  price_unit: i.price_unit || i.price || 0,
                  productId: i.id,
                  inventory_items_to_deduct: []
                })) : []),
              amount: ro.total_amount || 0,
              time: new Date(ro.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              paymentMethod: ro.payment_method,
              payment_provider: ro.payment_provider,
              payment_status: ro.payment_status,
              is_paid: ro.is_paid,
              order_number: ro.order_number,
              created_at: ro.created_at,
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

    // Set up Realtime subscription for orders
    if (storeId) {
      console.log('[OfflineContext] Setting up Realtime for store:', storeId);

      const channel = supabase
        .channel('orders-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `store_id=eq.${storeId}`
          },
          async (payload) => {
            console.log('[Realtime] Order change detected:', payload);

            if (payload.eventType === 'INSERT') {
              // New order arrived
              const newOrder = payload.new as any;

              // Fetch full order with items
              const { data: fullOrder } = await supabase
                .from('orders')
                .select(`
                  id, 
                  store_id, 
                  status, 
                  total_amount, 
                  created_at, 
                  order_number, 
                  table_number, 
                  client:clients(name, email),
                  items,
                  order_items(
                    id, 
                    quantity, 
                    unit_price, 
                    product_id, 
                    product:inventory_items(name)
                  )
                `)
                .eq('id', newOrder.id)
                .maybeSingle();

              if (fullOrder) {
                const orderData = fullOrder as any;
                const mappedOrder: DBOrder = {
                  id: orderData.id,
                  customer: orderData.client?.name || 'Cliente',
                  client_email: orderData.client?.email,
                  table: orderData.table_number,
                  status: orderData.status ? mapStatusFromSupabase(orderData.status) : 'Pendiente',
                  type: orderData.table_number ? 'dine-in' : 'takeaway',
                  paid: orderData.payment_status === 'paid',
                  items: (orderData.order_items && orderData.order_items.length > 0)
                    ? orderData.order_items.map((i: any) => ({
                      id: i.id || 'unknown',
                      name: i.product?.name || 'Ítem',
                      quantity: i.quantity,
                      price_unit: i.unit_price || 0,
                      productId: i.product_id,
                      inventory_items_to_deduct: []
                    }))
                    : (Array.isArray(orderData.items) ? orderData.items.map((i: any) => ({
                      id: i.id || 'unknown',
                      name: i.name || 'Ítem',
                      quantity: i.quantity,
                      price_unit: i.price_unit || i.price || 0,
                      productId: i.id,
                      inventory_items_to_deduct: []
                    })) : []),
                  amount: orderData.total_amount || 0,
                  time: new Date(orderData.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  paymentMethod: orderData.payment_method || 'cash',
                  order_number: orderData.order_number,
                  created_at: orderData.created_at,
                  syncStatus: 'synced',
                  lastModified: new Date(orderData.created_at).getTime()
                };

                // Add to orders at the beginning
                setOrders(prev => [mappedOrder, ...prev]);

                // Save to IndexedDB
                await dbOps.saveOrder(mappedOrder);

                // Show notification
                addToast(
                  `🔔 Nuevo Pedido${orderData.order_number ? ` #${orderData.order_number}` : ''}`,
                  'info',
                  `${orderData.table_number ? `Mesa ${orderData.table_number}` : 'Para llevar'} - $${orderData.total_amount}`
                );
              }
            } else if (payload.eventType === 'UPDATE') {
              // Order updated (e.g., status changed)
              const updatedOrder = payload.new as any;

              setOrders(prev => prev.map(order => {
                if (order.id === updatedOrder.id) {
                  return {
                    ...order,
                    status: updatedOrder.status ? mapStatusFromSupabase(updatedOrder.status) : order.status,
                    syncStatus: 'synced'
                  };
                }
                return order;
              }));

              // Update in IndexedDB
              const existingOrder = await dbOps.getOrder(updatedOrder.id);
              if (existingOrder) {
                const updated = {
                  ...existingOrder,
                  status: updatedOrder.status ? mapStatusFromSupabase(updatedOrder.status) : existingOrder.status,
                  syncStatus: 'synced' as const
                };
                await dbOps.saveOrder(updated);
              }
            }
          }
        )
        .subscribe();

      return () => {
        console.log('[OfflineContext] Cleaning up Realtime subscription');
        supabase.removeChannel(channel);
      };
    }
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

    // Update pending deliveries
    const deliveryEvents = queue.filter(e => e.type === 'CONFIRM_DELIVERY');
    const ids = deliveryEvents.map(e => (e.payload as any).orderId);
    setPendingDeliveryOrders(ids);
  };

  const refreshOrders = async () => {
    const localOrders = await dbOps.getAllOrders();
    setOrders(localOrders.reverse());
  };

  const syncOrder = async (orderId: string) => {
    if (!isOnline) return;

    try {
      const { data: remoteOrder, error } = await supabase
        .from('orders')
        .select('*, client:clients(name, email), items, order_items(id, quantity, unit_price, product_id, product:inventory_items(name))')
        .eq('id', orderId)
        .single();

      if (error || !remoteOrder) throw error;

      const mappedOrder: DBOrder = {
        id: remoteOrder.id,
        customer: (remoteOrder as any).client?.name || 'Cliente',
        client_email: (remoteOrder as any).client?.email,
        table: remoteOrder.table_number,
        status: mapStatusFromSupabase(remoteOrder.status),
        type: remoteOrder.table_number ? 'dine-in' : 'takeaway',
        paid: remoteOrder.payment_status === 'paid',
        items: (remoteOrder.order_items && remoteOrder.order_items.length > 0)
          ? remoteOrder.order_items.map((i: any) => ({
            id: i.id || 'unknown',
            name: i.product?.name || 'Ítem',
            quantity: i.quantity,
            price_unit: i.unit_price || 0,
            productId: i.product_id,
            inventory_items_to_deduct: []
          }))
          : (Array.isArray(remoteOrder.items) ? (remoteOrder.items as any[]).map((i: any) => ({
            id: i.id || 'unknown',
            name: i.name || 'Ítem',
            quantity: i.quantity,
            price_unit: i.price_unit || i.price || 0,
            productId: i.id,
            inventory_items_to_deduct: []
          })) : []),
        amount: remoteOrder.total_amount || 0,
        time: new Date(remoteOrder.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        paymentMethod: remoteOrder.payment_method || 'cash',
        order_number: remoteOrder.order_number,
        created_at: remoteOrder.created_at,
        syncStatus: 'synced',
        lastModified: new Date(remoteOrder.created_at).getTime()
      };

      await dbOps.saveOrder(mappedOrder);

      setOrders(prev => {
        const exists = prev.findIndex(o => o.id === mappedOrder.id);
        if (exists >= 0) {
          const newArr = [...prev];
          newArr[exists] = mappedOrder;
          return newArr;
        }
        return [mappedOrder, ...prev];
      });

      console.log(`[OfflineContext] Synced order #${orderId} from remote`);
    } catch (err) {
      console.error(`[OfflineContext] Failed to sync order ${orderId}`, err);
    }
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
          const itemsPayload = newOrder.items.map(item => mapOrderItemToSupabase(item, newOrder.id, storeId || ''));
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

  const confirmOrderDelivery = async (orderId: string, staffId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return { success: false, message: 'Pedido no encontrado' };

    // Optimistic Update
    const updatedOrder: DBOrder = {
      ...order,
      status: 'Entregado',
      syncStatus: 'pending',
      lastModified: Date.now()
    };
    await dbOps.saveOrder(updatedOrder);
    setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));

    if (isOnline) {
      try {
        // @ts-ignore
        const { data, error } = await supabase.rpc('confirm_order_delivery', {
          p_order_id: orderId,
          p_staff_id: staffId
        });

        if (error) throw error;

        const result = data as { success: boolean, message: string };
        if (result.success) {
          const syncedOrder: DBOrder = { ...updatedOrder, syncStatus: 'synced' };
          await dbOps.saveOrder(syncedOrder);
          setOrders(prev => prev.map(o => o.id === orderId ? syncedOrder : o));
        } else {
          // Revert if domain logic rejected it
          await dbOps.saveOrder(order);
          setOrders(prev => prev.map(o => o.id === orderId ? order : o));
        }
        return result;
      } catch (err) {
        console.error("Delivery confirm failed", err);
        const event: SyncEvent = {
          id: `evt-del-${Date.now()}`,
          type: 'CONFIRM_DELIVERY',
          payload: { orderId, staffId, storeId }, // Include storeId in payload
          timestamp: Date.now()
        };
        await dbOps.addToSyncQueue(event);
        updatePendingCount();
        return { success: true, message: 'Cambio guardado localmente (se sincronizará al volver online)' };
      }
    } else {
      const event: SyncEvent = {
        id: `evt-del-${Date.now()}`,
        type: 'CONFIRM_DELIVERY',
        payload: { orderId, staffId, storeId }, // Include storeId in payload
        timestamp: Date.now()
      };
      await dbOps.addToSyncQueue(event);
      updatePendingCount();
      return { success: true, message: 'Guardado offline' };
    }
  };

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
            const itemsPayload = order.items.map(item => mapOrderItemToSupabase(item, order.id, storeId || ''));
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
        } else if (event.type === 'CONFIRM_DELIVERY') {
          const { orderId, staffId, storeId: eventStoreId } = event.payload;
          // @ts-ignore
          const { data, error } = await supabase.rpc('confirm_order_delivery', {
            p_order_id: orderId,
            p_staff_id: staffId
          });
          if (error) throw error;
          const result = data as { success: boolean, message: string };
          if (result.success) {
            const currentOrders = await dbOps.getAllOrders();
            const order = currentOrders.find(o => o.id === orderId);
            if (order) await dbOps.saveOrder({ ...order, syncStatus: 'synced' });
          }
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
      pendingDeliveryOrders,
      createOrder,
      updateOrderStatus,
      refreshOrders,
      triggerSync,
      syncOrder,
      confirmOrderDelivery
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
