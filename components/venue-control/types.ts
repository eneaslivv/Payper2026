
export enum AppMode {
  VIEW = 'VIEW',     // Modo Operativo (Pedidos en tiempo real + Mapa)
  DISPATCH = 'DISPATCH', // Modo Despacho (Kanban / Lista de pedidos)
  EDIT = 'EDIT'      // Modo Gestión (Layout + Configuración)
}

export enum TableStatus {
  FREE = 'free',
  RESERVED = 'reserved',
  OCCUPIED = 'occupied',
  BILL_REQUESTED = 'bill_requested',
  PENDING_ORDER = 'pending_order',
  PAYING = 'paying',
  CLOSED = 'closed'
}

export enum OrderStatus {
  PENDING = 'PENDING',
  PREPARING = 'PREPARING',
  READY = 'READY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED'
}

export enum NotificationType {
  CALL_WAITER = 'CALL_WAITER',
  REQUEST_CHECK = 'REQUEST_CHECK',
  DELAYED = 'DELAYED',
  NEW_ORDER = 'NEW_ORDER'
}

export interface VenueNotification {
  id: string;
  type: NotificationType;
  tableId: string;
  timestamp: Date;
  message: string;
  isRead: boolean;
}

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface OrderItem {
  id: string;
  productId?: string; // Link to real product
  name: string;
  price: number;
  quantity: number;
  status: OrderStatus;
  timestamp: Date;
}

export interface Zone {
  id: string;
  name: string;
  description: string;
  sort_order?: number; // Added from DB
}

export interface Table {
  id: string;
  name: string;
  zoneId: string;
  locationId?: string; // Link to inventory
  capacity: number;
  status: TableStatus;
  position: Position;
  size: Size;
  rotation: number;
  shape: 'circle' | 'square';
  totalAmount: number;
  orders: OrderItem[]; // Items of the active order
  activeOrderIds?: string[]; // Array of active order IDs (multi-order support)
  openedAt?: Date; // When the current session started
  reservedAt?: Date; // RESERVATION: when
  reservedFor?: string; // RESERVATION: who
  reservationNote?: string; // RESERVATION: notes
  qrId?: string;
  assignedStaff?: string;
  lastUpdate: Date;
  activeNotifications?: VenueNotification[];
}

export interface StockItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  minAlert: number;
}

export interface Bar {
  id: string;
  name: string;
  zoneId: string;
  location: string; // Visual label
  locationId?: string; // Link to inventory storage_location
  type: 'MAIN' | 'SECONDARY' | 'SERVICE';
  isActive: boolean;
  position: Position;
  size: Size;
  rotation: number;
  stock: StockItem[];
  qrIds: string[];
  metrics: {
    revenue: number;
    avgPrepTime: number;
    activeOrders: number;
    totalScans: number;
  };
}

export interface QR {
  id: string;
  name: string;
  zoneId: string;
  type: 'BAR' | 'TABLE' | 'EVENT' | 'ZONE';
  position: Position;
  barId?: string;
  targetId?: string;
  isActive: boolean;
  menuId?: string;
  scanCount: number;
  totalGeneratedRevenue: number;
  lastActivity?: Date;
}

export interface OperationalPeriod {
  id: string;
  name: string;
  startTime: Date;
  endTime?: Date;
  status: 'OPEN' | 'CLOSED';
  totalRevenue: number;
  totalOrders: number;
  responsible: string;
  stockMovements: { name: string; qty: number }[];
}

export interface StockTransferItem {
  productId: string;
  productName: string;
  quantity: number;
}

export interface StockTransfer {
  id: string;
  sourceBarId: string;
  destBarId: string;
  items: StockTransferItem[];
  timestamp: Date;
  user: string;
}

export type LogType = 'ORDER' | 'TABLE_STATE' | 'TRANSFER' | 'PAYMENT' | 'STOCK' | 'SYSTEM' | 'PERIOD';

export interface LogMovement {
  id: string;
  timestamp: Date;
  type: LogType;
  description: string;
  user: string;
  entityId: string;
}

export interface StorageLocation {
  id: string;
  store_id: string;
  name: string;
  type: 'warehouse' | 'point_of_sale' | 'kitchen';
  is_default: boolean;
}
