import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { dbOps, DBOrder, SyncEvent } from '../lib/db';
import { Order, OrderStatus, Product, SupabaseOrder, SupabaseProduct } from '../types';
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
  clearSyncQueue: () => Promise<void>;
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

  const resolveDefaultNodeId = async (currentNodeId: string | null, storeIdValue?: string | null) => {
    if (currentNodeId || !storeIdValue) return currentNodeId;

    try {
      const { data, error } = await supabase
        .rpc('get_default_node_for_store' as any, { p_store_id: storeIdValue });

      if (error) {
        console.warn('[OfflineContext] Failed to resolve default node:', error);
        return currentNodeId;
      }

      return (data as string) || currentNodeId;
    } catch (err) {
      console.warn('[OfflineContext] Failed to resolve default node:', err);
      return currentNodeId;
    }
  };

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      // 1. Load Orders (Hybrid Strategy: Local + Optimized Remote Fetch)
      // First, get what we have locally (instant)
      let localOrders = await dbOps.getAllOrders();

      // CRITICAL: Filter local orders by store_id to prevent data leak between accounts
      // Only keep orders that match current store OR (for migration) have no store_id but we can't be sure...
      // Safer: Only show matching store_id. Remote fetch will restore valid orders with correct ID.
      // CRITICAL: Filter local orders by store_id to prevent data leak between accounts
      if (storeId) {
        const validOrders: DBOrder[] = [];
        for (const o of localOrders) {
          // Strict check: Must match store_id. If missing or different, it's leaked/stale data.
          if (o.store_id === storeId) {
            validOrders.push(o);
          } else {
            // CLEANUP: Proactively delete data from other stores to fix "disaster" state
            console.warn(`[OfflineContext] Cleaning up leaked order from other store: ${o.id} (store: ${o.store_id} vs current: ${storeId})`);
            await dbOps.deleteOrder(o.id).catch(e => console.error("Failed to cleanup order", e));
          }
        }
        localOrders = validOrders;
        setOrders(localOrders.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()));
      } else {
        // If no storeId (not logged in or loading), DO NOT show unrelated orders from local DB
        setOrders([]);
      }

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
              archived_at,
              dispatch_station,
              node_id,
              node:venue_nodes(dispatch_station),
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
            .is('archived_at', null)
            .order('created_at', { ascending: false }) as any;
          // Eliminado .range(0, 49) para asegurar que NINGÚN pedido activo quede fuera de vista


          console.log('[OfflineContext] Fetched remote orders:', remoteOrders?.length, remoteOrders, 'Error:', error);

          if (!error && remoteOrders) {
            // Merge strategy: Server is truth for 'synced' orders. Keep local 'pending' sync orders.
            const mappedRemote: DBOrder[] = (remoteOrders as any as SupabaseOrder[]).map((ro) => ({
              id: ro.id,
              store_id: ro.store_id, // CRITICAL: Persist store_id
              customer: (ro as any).client?.name || ro.customer_name || 'Cliente',
              client_email: (ro as any).client?.email,
              table: ro.table_number,
              status: ro.status ? mapStatusFromSupabase(ro.status as any) : 'pending',
              type: ro.table_number ? 'dine-in' : 'takeaway',
              paid: ro.is_paid || ro.payment_status === 'approved' || ro.payment_status === 'paid',
              items: ((ro as any).order_items && (ro as any).order_items.length > 0)
                ? ((ro as any).order_items as any[]).map((i) => ({
                  id: i.id || 'unknown',
                  name: i.product?.name || 'Ítem',
                  quantity: i.quantity,
                  price_unit: i.unit_price || 0,
                  productId: i.product_id,
                  inventory_items_to_deduct: []
                }))
                : (Array.isArray(ro.items) ? (ro.items as any[]).map((i) => ({
                  id: i.id || 'unknown',
                  name: i.name || 'Ítem',
                  quantity: i.quantity,
                  price_unit: i.price_unit || i.price || 0,
                  productId: i.productId || i.id,
                  inventory_items_to_deduct: []
                })) : []),
              amount: ro.total_amount || 0,
              time: new Date(ro.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              paymentMethod: ro.payment_method || undefined,
              payment_provider: ro.payment_provider || undefined,
              payment_status: ro.payment_status || undefined,
              is_paid: ro.is_paid,
              order_number: ro.order_number,
              table_number: ro.table_number || undefined,
              archived_at: ro.archived_at || undefined,
              node_id: (ro as any).node_id || undefined,
              dispatch_station: ro.dispatch_station || (ro as any).node?.dispatch_station || undefined,
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
            const mapped: Product[] = (remoteProducts as any as SupabaseProduct[]).map((rp) => ({
              id: rp.id,
              name: rp.name,
              price: rp.price,
              sku: rp.sku || 'GEN-' + rp.id.substring(0, 8),
              category: rp.category || 'General',
              image: rp.image_url || rp.image || '',
              stock: rp.stock || 100,
              stockStatus: rp.stock < 10 ? 'Bajo' : 'Alto',
              available: rp.available,
              variants: rp.variants || [],
              addons: rp.addons || []
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
    if (navigator.onLine) {
      setTimeout(() => triggerSync(), 2000); // Small delay to let loadData finish
    }

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
              // New order arrived - show immediately with available data as optimistic update
              const newOrder = payload.new as any as SupabaseOrder;

              // Create immediate partial order to show right away
                const immediateOrder: DBOrder = {
                  id: newOrder.id,
                  store_id: newOrder.store_id,
                  customer: (newOrder as any).customer_name || 'Nuevo Pedido...',
                  table: newOrder.table_number || undefined,
                  status: newOrder.status ? mapStatusFromSupabase(newOrder.status as any) : 'pending',
                  type: (newOrder.table_number || newOrder.node_id) ? 'dine-in' : 'takeaway',
                  paid: newOrder.is_paid || (newOrder as any).payment_status === 'approved' || (newOrder as any).payment_status === 'paid',
                  items: Array.isArray(newOrder.items) ? (newOrder.items as any[]).map((i) => ({
                    id: i.id || i.product_id || 'unknown',
                    name: i.name || 'Ítem',
                    quantity: i.quantity || 1,
                    price_unit: i.price_unit || i.price || 0,
                    productId: i.id || i.product_id,
                    inventory_items_to_deduct: []
                  })) : [],
                  amount: newOrder.total_amount || 0,
                  time: new Date(newOrder.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  paymentMethod: (newOrder as any).payment_method || undefined,
                  payment_provider: newOrder.payment_provider || undefined,
                  payment_status: newOrder.payment_status || undefined,
                  is_paid: newOrder.is_paid,
                  order_number: newOrder.order_number,
                  table_number: newOrder.table_number || undefined,
                  node_id: newOrder.node_id || undefined,
                  dispatch_station: newOrder.dispatch_station || undefined,
                  created_at: newOrder.created_at,
                  syncStatus: 'synced',
                  lastModified: new Date(newOrder.created_at).getTime()
                };

              // Add immediately for instant visibility
              setOrders(prev => {
                // Avoid duplicates
                if (prev.some(o => o.id === immediateOrder.id)) return prev;
                return [immediateOrder, ...prev];
              });

              // Then fetch full order with items in background
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
                  payment_status,
                  payment_method,
                  payment_provider,
                  is_paid,
                  dispatch_station,
                  node_id,
                  node:venue_nodes(dispatch_station),
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
                  store_id: orderData.store_id,
                  customer: orderData.client?.name || 'Cliente',
                  client_email: orderData.client?.email,
                  table: orderData.table_number,
                  status: orderData.status ? mapStatusFromSupabase(orderData.status) : 'pending',
                  type: orderData.table_number ? 'dine-in' : 'takeaway',
                  paid: orderData.is_paid || orderData.payment_status === 'approved' || orderData.payment_status === 'paid',
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
                  payment_provider: orderData.payment_provider,
                  payment_status: orderData.payment_status,
                  is_paid: orderData.is_paid,
                  order_number: orderData.order_number,
                  table_number: orderData.table_number,
                  node_id: orderData.node_id,
                  dispatch_station: orderData.dispatch_station || orderData.node?.dispatch_station,
                  created_at: orderData.created_at,
                  syncStatus: 'synced',
                  lastModified: new Date(orderData.created_at).getTime()
                };

                // Update with full data
                setOrders(prev => prev.map(o => o.id === mappedOrder.id ? mappedOrder : o));

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
              // Order updated (e.g., status changed, payment confirmed)
              const updatedOrder = payload.new as any;
              const oldOrder = payload.old as any;

              // Check if payment status just changed to paid - fetch full order to ensure items are visible
              const paymentJustConfirmed = (
                (updatedOrder.is_paid === true && oldOrder?.is_paid !== true) ||
                (updatedOrder.payment_status === 'paid' && oldOrder?.payment_status !== 'paid') ||
                (updatedOrder.payment_status === 'approved' && oldOrder?.payment_status !== 'approved')
              );

              if (paymentJustConfirmed) {
                // Fetch complete order data to ensure everything is visible
                const { data: fullOrder } = await supabase
                  .from('orders')
                  .select(`
                    id, store_id, status, total_amount, created_at, order_number, table_number,
                    payment_status, payment_method, payment_provider, is_paid, dispatch_station,
                    node_id, node:venue_nodes(dispatch_station),
                    client:clients(name, email), items,
                    order_items(id, quantity, unit_price, product_id, product:inventory_items(name))
                  `)
                  .eq('id', updatedOrder.id)
                  .maybeSingle();

                if (fullOrder) {
                  const orderData = fullOrder as any;
                  const mappedOrder: DBOrder = {
                    id: orderData.id,
                    store_id: orderData.store_id,
                    customer: orderData.client?.name || 'Cliente',
                    client_email: orderData.client?.email,
                    table: orderData.table_number,
                    status: orderData.status ? mapStatusFromSupabase(orderData.status) : 'pending',
                    type: orderData.table_number ? 'dine-in' : 'takeaway',
                    paid: true,
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
                    payment_provider: orderData.payment_provider,
                    payment_status: orderData.payment_status,
                    is_paid: orderData.is_paid,
                    order_number: orderData.order_number,
                    table_number: orderData.table_number,
                    node_id: orderData.node_id,
                    dispatch_station: orderData.dispatch_station || orderData.node?.dispatch_station,
                    created_at: orderData.created_at,
                    syncStatus: 'synced',
                    lastModified: Date.now()
                  };

                  setOrders(prev => prev.map(order => order.id === mappedOrder.id ? mappedOrder : order));
                  await dbOps.saveOrder(mappedOrder);
                }
              } else {
                // Normal status update - use payload data directly
                setOrders(prev => prev.map(order => {
                  if (order.id === updatedOrder.id) {
                    return {
                      ...order,
                      status: updatedOrder.status ? mapStatusFromSupabase(updatedOrder.status) : order.status,
                      payment_status: updatedOrder.payment_status || order.payment_status,
                      is_paid: updatedOrder.is_paid !== undefined ? updatedOrder.is_paid : order.is_paid,
                      paid: (updatedOrder.is_paid === true) || (updatedOrder.payment_status === 'approved') || (updatedOrder.payment_status === 'paid') || order.paid,
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
                    payment_status: updatedOrder.payment_status || existingOrder.payment_status,
                    is_paid: updatedOrder.is_paid !== undefined ? updatedOrder.is_paid : existingOrder.is_paid,
                    syncStatus: 'synced' as const
                  };
                  await dbOps.saveOrder(updated);
                }
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
        .select('*, node:venue_nodes(dispatch_station), client:clients(name, email), items, order_items(id, quantity, unit_price, product_id, product:inventory_items(name))')
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
        lastModified: new Date(remoteOrder.created_at).getTime(),
        store_id: remoteOrder.store_id,
        node_id: remoteOrder.node_id,
        dispatch_station: remoteOrder.dispatch_station || (remoteOrder as any).node?.dispatch_station
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
      lastModified: Date.now(),
      store_id: storeId // Ensure store_id is attached locally
    };

    // 1. Save locally immediately (Optimistic UI)
    await dbOps.saveOrder(newOrder);
    setOrders(prev => [newOrder, ...prev]);

    // 2. Attempt Sync if Online
    if (isOnline) {
      try {
        // Prepare order data for Supabase
        const orderData = mapOrderToSupabase(newOrder, storeId || '');
        const resolvedNodeId = await resolveDefaultNodeId(orderData.node_id || null, storeId || orderData.store_id || null);

        if (resolvedNodeId) {
          orderData.node_id = resolvedNodeId;
        }

        // If order has node_id, fetch dispatch_station AND location_id from venue_nodes
        if (orderData.node_id) {
          const { data: nodeData } = await supabase
            .from('venue_nodes')
            .select('dispatch_station, location_id')
            .eq('id', orderData.node_id)
            .single();

          const nData = nodeData as any;
          if (nData?.dispatch_station) {
            orderData.dispatch_station = nData.dispatch_station;
            console.log(`[createOrder] Auto-assigned station from node: ${nData.dispatch_station}`);
          }
          if (nData?.location_id) {
            orderData.source_location_id = nData.location_id;
            console.log(`[createOrder] Auto-assigned source_location_id: ${nData.location_id}`);
          }
        }

        const { error } = await supabase.from('orders').insert(orderData);
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
          .update({ status: mapStatusToSupabase(status) as any })
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
    const cleanupLocalOrder = async () => {
      setOrders(prev => prev.filter(o => o.id !== orderId));
      await dbOps.deleteOrder(orderId).catch(e => console.error('Failed to cleanup local order', e));

      const queue = await dbOps.getSyncQueue();
      const relatedEvents = queue.filter(event =>
        event?.payload?.orderId === orderId
      );
      await Promise.all(relatedEvents.map(event => dbOps.removeSyncEvent(event.id)));
      updatePendingCount();
    };
    if (!order) {
      if (isOnline) {
        try {
          console.log('[confirmOrderDelivery] Order not in local cache, calling RPC directly:', { orderId, staffId });
          // @ts-ignore
          const { data, error } = await supabase.rpc('confirm_order_delivery', {
            p_order_id: orderId,
            p_staff_id: staffId
          });

          if (error) throw error;
          const result = data as { success: boolean, message: string };

          if (result.success) {
            await syncOrder(orderId);
          } else if (result.message?.toLowerCase().includes('pedido no encontrado')) {
            await cleanupLocalOrder();
          }

          return result;
        } catch (err: any) {
          if (err?.message?.toLowerCase().includes('pedido no encontrado')) {
            await cleanupLocalOrder();
            return { success: false, message: 'Pedido no encontrado. Limpiado localmente.' };
          }
          console.error('[confirmOrderDelivery] RPC failed without local order:', err?.message || err);
          const event: SyncEvent = {
            id: `evt-del-${Date.now()}`,
            type: 'CONFIRM_DELIVERY',
            payload: { orderId, staffId, storeId },
            timestamp: Date.now()
          };
          await dbOps.addToSyncQueue(event);
          updatePendingCount();
          return { success: true, message: 'Guardado localmente (se sincronizará al volver online)' };
        }
      }

      const event: SyncEvent = {
        id: `evt-del-${Date.now()}`,
        type: 'CONFIRM_DELIVERY',
        payload: { orderId, staffId, storeId },
        timestamp: Date.now()
      };
      await dbOps.addToSyncQueue(event);
      updatePendingCount();
      return { success: true, message: 'Guardado offline' };
    }

    // Optimistic Update
    const updatedOrder: DBOrder = {
      ...order,
      status: 'served',
      syncStatus: 'pending',
      lastModified: Date.now()
    };
    await dbOps.saveOrder(updatedOrder);
    setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));

    if (isOnline) {
      try {
        console.log('[confirmOrderDelivery] Calling RPC with:', { orderId, staffId });
        // @ts-ignore
        const { data, error } = await supabase.rpc('confirm_order_delivery', {
          p_order_id: orderId,
          p_staff_id: staffId
        });

        console.log('[confirmOrderDelivery] RPC Response:', { data, error });

        if (error) {
          console.error('[confirmOrderDelivery] RPC Error:', error.message, error.code, error.details);
          throw error;
        }

        const result = data as { success: boolean, message: string };
        if (result.success) {
          const syncedOrder: DBOrder = { ...updatedOrder, syncStatus: 'synced' };
          await dbOps.saveOrder(syncedOrder);
          setOrders(prev => prev.map(o => o.id === orderId ? syncedOrder : o));
        } else {
          // Revert if domain logic rejected it
          console.warn('[confirmOrderDelivery] Domain rejection:', result.message);
          if (result.message?.toLowerCase().includes('pedido no encontrado')) {
            await cleanupLocalOrder();
          } else {
            await dbOps.saveOrder(order);
            setOrders(prev => prev.map(o => o.id === orderId ? order : o));
          }
        }
        return result;
      } catch (err: any) {
        if (err?.message?.toLowerCase().includes('pedido no encontrado')) {
          await cleanupLocalOrder();
          return { success: false, message: 'Pedido no encontrado. Limpiado localmente.' };
        }
        console.error("[confirmOrderDelivery] CATCH ERROR:", err?.message || err, err?.code, err?.details);
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

    const MAX_RETRIES = 5; // Aggressive purge for stuck items
    let processedCount = 0;
    let failedCount = 0;

    for (const event of queue) {
      const retryCount = event.retryCount || 0;

      // START FIX: Auto-purge events that are truly stuck to stop the annoying warning
      if (retryCount >= MAX_RETRIES) {
        console.warn(`[Sync] PURGING stuck event ${event.id} - exceeded max retries (${MAX_RETRIES})`);
        await dbOps.removeSyncEvent(event.id); // DELETE IT
        continue;
      }
      // END FIX

      try {
        if (event.type === 'CREATE_ORDER') {
          const order = event.payload as DBOrder;
          const storeIdForOrder = storeId || order.store_id || '';

          // Use new RPC for offline sync with stock conflict detection
          const orderData = mapOrderToSupabase(order, storeIdForOrder);
          const resolvedNodeId = await resolveDefaultNodeId(orderData.node_id || null, storeIdForOrder || null);

          if (resolvedNodeId) {
            orderData.node_id = resolvedNodeId;
          }

          // Prepare items for sync
          const itemsForSync = order.items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            name: item.name,
            price_unit: item.price_unit
          }));

          // Call new sync_offline_order RPC with retry logic
          const { retryOfflineSync } = await import('../src/lib/retryRpc');
          const { data: syncResult, error: rpcError } = await retryOfflineSync(() =>
            supabase.rpc('sync_offline_order', {
              p_order_data: {
                id: order.id,
                store_id: storeIdForOrder,
                client_id: orderData.client_id,
                status: orderData.status,
                channel: orderData.channel,
                total_amount: orderData.total_amount,
                subtotal: orderData.subtotal,
                items: itemsForSync,
                payment_method: orderData.payment_method,
                is_paid: orderData.is_paid,
                created_at: orderData.created_at,
                node_id: orderData.node_id,
                table_number: orderData.table_number
              },
              p_allow_negative_stock: false
            })
          ) as { data: any, error: any };

          if (rpcError) throw rpcError;

          const result = syncResult as { success: boolean, error?: string, conflicts?: any[], message?: string };

          if (!result.success && result.error === 'INSUFFICIENT_STOCK') {
            // Stock conflict detected - notify user and pause sync for this order
            console.warn(`[Sync] Stock conflict for order ${order.id}:`, result.conflicts);

            addToast(
              'Conflicto de Stock Detectado',
              'error',
              `Orden ${order.order_number || order.id.slice(0, 8)} tiene stock insuficiente. Revisar manualmente.`
            );

            // Mark event as needing manual intervention
            await dbOps.updateSyncEvent({
              ...event,
              retryCount: MAX_RETRIES, // Will be purged on next sync
              lastError: `STOCK_CONFLICT: ${JSON.stringify(result.conflicts)}`
            });

            failedCount++;
            continue;
          }

          if (!result.success) {
            throw new Error(result.message || 'Sync failed');
          }

          // Success
          await dbOps.saveOrder({ ...order, syncStatus: 'synced' });

        } else if (event.type === 'UPDATE_STATUS') {
          const { orderId, status } = event.payload;
          const { error } = await supabase.from('orders')
            .update({ status: mapStatusToSupabase(status) as any })
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

        // Remove from queue on success
        await dbOps.removeSyncEvent(event.id);
        processedCount++;
      } catch (err: any) {
        console.error(`[Sync] Failed for event ${event.id} (retry ${retryCount + 1}/${MAX_RETRIES})`, err);

        // Update event with retry count and error for next attempt
        await dbOps.updateSyncEvent({
          ...event,
          retryCount: retryCount + 1,
          lastError: err.message || 'Unknown error'
        });
        failedCount++;
      }
    }

    await refreshOrders();
    updatePendingCount();
    setIsSyncing(false);

    if (processedCount > 0) {
      addToast(`${processedCount} CAMBIOS SINCRONIZADOS`, "success", "La nube está al día");
    }
    if (failedCount > 0 && processedCount === 0) {
      addToast(`${failedCount} cambios fallaron`, "error", "Se reintentará automáticamente");
    }

    // Schedule retry for failed events with exponential backoff
    // ONLY if failure wasn't a "Hard Error" (e.g., RLS, UUID Validation, etc.)
    if (failedCount > 0 && navigator.onLine) {
      // Check if last errors were recomputable (network/timeout) vs persistent (validation/auth)
      const lastEvents = queue.slice(-failedCount);
      const hasHardError = lastEvents.some(e => {
        const msg = (e as any).lastError?.toLowerCase() || '';
        return msg.includes('uuid') || msg.includes('permission') || msg.includes('violates') || msg.includes('not found');
      });

      if (hasHardError) {
        console.error('[Sync] Loop prevention: Detected persistent hard error. Stopping auto-retry.');
        addToast('Sincronización pausada', 'error', 'Detectamos un error persistente. Revisa los datos o contacta a soporte.');
        setIsSyncing(false);
        return;
      }

      const retryDelay = Math.min(5000 * Math.pow(2, Math.min(failedCount - 1, 4)), 60000); // Max 60s
      console.log(`[Sync] Scheduling retry in ${retryDelay}ms for ${failedCount} failed events`);
      setTimeout(() => {
        if (navigator.onLine) triggerSync();
      }, retryDelay);
    }
  }, [addToast, refreshOrders, updatePendingCount]);

  // Clear sync queue function
  const clearSyncQueue = async () => {
    console.log('[Sync] Clearing entire sync queue...');
    await dbOps.clearSyncQueue();
    updatePendingCount();
    addToast('Cola de sincronización limpiada', 'success');
  };

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
      confirmOrderDelivery,
      clearSyncQueue
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
