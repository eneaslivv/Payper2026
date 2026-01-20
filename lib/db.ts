
import { Order } from '../types';

const DB_NAME = 'CoffeeSquadDB';
const DB_VERSION = 3; // Incremented to add new stores

export interface DBOrder extends Order {
  syncStatus: 'synced' | 'pending';
  lastModified: number;
  store_id?: string;
  dispatch_station?: string;
  source_location_id?: string;
  delivery_status?: string;
}

export interface SyncEvent {
  id: string;
  type: 'CREATE_ORDER' | 'UPDATE_STATUS' | 'CANCEL_ORDER' | 'CONFIRM_DELIVERY' | 'UPDATE_VENUE_NODE';
  payload: any;
  timestamp: number;
  retryCount?: number;
  lastError?: string;
}

export interface CachedVenueNode {
  id: string;
  store_id: string;
  label: string;
  type: 'table' | 'bar' | 'qr';
  position_x: number;
  position_y: number;
  zone_id: string;
  location_id?: string;
  dispatch_station?: string;
  status: string;
  metadata?: any;
  lastModified: number;
}

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Store for Orders
      if (!db.objectStoreNames.contains('orders')) {
        const orderStore = db.createObjectStore('orders', { keyPath: 'id' });
        orderStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        orderStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Store for Sync Queue
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', { keyPath: 'id' });
      }

      // Store for Products
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' });
      }

      // Store for Clients
      if (!db.objectStoreNames.contains('clients')) {
        db.createObjectStore('clients', { keyPath: 'id' });
      }

      // NEW: Store for Venue Nodes (tables, bars, QRs)
      if (!db.objectStoreNames.contains('venue_nodes')) {
        const venueStore = db.createObjectStore('venue_nodes', { keyPath: 'id' });
        venueStore.createIndex('store_id', 'store_id', { unique: false });
        venueStore.createIndex('zone_id', 'zone_id', { unique: false });
      }

      // NEW: Store for Venue Zones
      if (!db.objectStoreNames.contains('venue_zones')) {
        const zoneStore = db.createObjectStore('venue_zones', { keyPath: 'id' });
        zoneStore.createIndex('store_id', 'store_id', { unique: false });
      }

      // NEW: Store for Storage Locations
      if (!db.objectStoreNames.contains('storage_locations')) {
        const locStore = db.createObjectStore('storage_locations', { keyPath: 'id' });
        locStore.createIndex('store_id', 'store_id', { unique: false });
      }

      // NEW: Store for Inventory Items
      if (!db.objectStoreNames.contains('inventory_items')) {
        const invStore = db.createObjectStore('inventory_items', { keyPath: 'id' });
        invStore.createIndex('store_id', 'store_id', { unique: false });
      }
    };
  });
};

export const dbOps = {
  async getAllOrders(): Promise<DBOrder[]> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('orders', 'readonly');
      const store = transaction.objectStore('orders');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async saveOrder(order: DBOrder): Promise<void> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('orders', 'readwrite');
      const store = transaction.objectStore('orders');
      const request = store.put(order);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async getOrder(id: string): Promise<DBOrder | undefined> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('orders', 'readonly');
      const store = transaction.objectStore('orders');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async deleteOrder(id: string): Promise<void> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('orders', 'readwrite');
      const store = transaction.objectStore('orders');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async addToSyncQueue(event: SyncEvent): Promise<void> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('sync_queue', 'readwrite');
      const store = transaction.objectStore('sync_queue');
      const request = store.put(event);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async getSyncQueue(): Promise<SyncEvent[]> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('sync_queue', 'readonly');
      const store = transaction.objectStore('sync_queue');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result.sort((a, b) => a.timestamp - b.timestamp));
      request.onerror = () => reject(request.error);
    });
  },

  async removeSyncEvent(id: string): Promise<void> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('sync_queue', 'readwrite');
      const store = transaction.objectStore('sync_queue');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async clearSyncQueue(): Promise<void> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('sync_queue', 'readwrite');
      const store = transaction.objectStore('sync_queue');
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async saveProducts(products: any[]): Promise<void> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('products', 'readwrite');
      const store = transaction.objectStore('products');
      products.forEach(p => store.put(p));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async getAllProducts(): Promise<any[]> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('products', 'readonly');
      const store = transaction.objectStore('products');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async saveClients(clients: any[]): Promise<void> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('clients', 'readwrite');
      const store = transaction.objectStore('clients');
      clients.forEach(c => store.put(c));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async getAllClients(): Promise<any[]> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('clients', 'readonly');
      const store = transaction.objectStore('clients');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  // --- VENUE NODES ---
  async saveVenueNodes(nodes: CachedVenueNode[]): Promise<void> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('venue_nodes', 'readwrite');
      const store = transaction.objectStore('venue_nodes');
      nodes.forEach(n => store.put(n));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async getVenueNodesByStore(storeId: string): Promise<CachedVenueNode[]> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('venue_nodes', 'readonly');
      const store = transaction.objectStore('venue_nodes');
      const index = store.index('store_id');
      const request = index.getAll(storeId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  // --- VENUE ZONES ---
  async saveVenueZones(zones: any[]): Promise<void> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('venue_zones', 'readwrite');
      const store = transaction.objectStore('venue_zones');
      zones.forEach(z => store.put(z));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async getVenueZonesByStore(storeId: string): Promise<any[]> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('venue_zones', 'readonly');
      const store = transaction.objectStore('venue_zones');
      const index = store.index('store_id');
      const request = index.getAll(storeId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  // --- STORAGE LOCATIONS ---
  async saveStorageLocations(locations: any[]): Promise<void> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('storage_locations', 'readwrite');
      const store = transaction.objectStore('storage_locations');
      locations.forEach(l => store.put(l));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async getStorageLocationsByStore(storeId: string): Promise<any[]> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('storage_locations', 'readonly');
      const store = transaction.objectStore('storage_locations');
      const index = store.index('store_id');
      const request = index.getAll(storeId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  // --- INVENTORY ITEMS ---
  async saveInventoryItems(items: any[]): Promise<void> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('inventory_items', 'readwrite');
      const store = transaction.objectStore('inventory_items');
      items.forEach(i => store.put(i));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async getInventoryItemsByStore(storeId: string): Promise<any[]> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('inventory_items', 'readonly');
      const store = transaction.objectStore('inventory_items');
      const index = store.index('store_id');
      const request = index.getAll(storeId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  // --- SYNC QUEUE UPDATES (for retry logic) ---
  async updateSyncEvent(event: SyncEvent): Promise<void> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('sync_queue', 'readwrite');
      const store = transaction.objectStore('sync_queue');
      const request = store.put(event);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
};


