
import { Table, TableStatus, Bar, OrderStatus, StockItem, QR, Zone } from './types';

export const INITIAL_ZONES: Zone[] = [
  { id: 'z1', name: 'SALÓN PRINCIPAL', description: 'Área central del venue' },
  { id: 'z2', name: 'TERRAZA', description: 'Zona exterior' },
  { id: 'z3', name: 'VIP LOUNGE', description: 'Exclusivo nivel superior' }
];

const INITIAL_STOCK: StockItem[] = [
  { id: 's1', name: 'Gin Tonic 47', category: 'Destilados', quantity: 24, unit: 'bot', minAlert: 5 },
  { id: 's2', name: 'Fernet Branca', category: 'Destilados', quantity: 12, unit: 'bot', minAlert: 3 },
  { id: 's3', name: 'Cerveza - IPA 500ml', category: 'Cervezas', quantity: 120, unit: 'un', minAlert: 40 },
  { id: 's4', name: 'Coca Cola 250ml', category: 'Gaseosas', quantity: 4, unit: 'un', minAlert: 10 }
];

export const INITIAL_TABLES: Table[] = [
  {
    id: 't1',
    name: 'M-01',
    zoneId: 'z1',
    capacity: 4,
    status: TableStatus.OCCUPIED,
    shape: 'circle',
    size: { w: 80, h: 80 },
    rotation: 0,
    position: { x: 120, y: 380 },
    totalAmount: 4500,
    orders: [
      { id: 'o1', name: 'Fernet Branca', price: 1200, quantity: 2, status: OrderStatus.PREPARING, timestamp: new Date() },
      { id: 'o2', name: 'Hamburguesa Triple', price: 2100, quantity: 1, status: OrderStatus.PENDING, timestamp: new Date() }
    ],
    qrId: 'qr-1',
    lastUpdate: new Date()
  },
  {
    id: 't2',
    name: 'M-02',
    zoneId: 'z1',
    capacity: 4,
    status: TableStatus.FREE,
    shape: 'square',
    size: { w: 80, h: 80 },
    rotation: 45,
    position: { x: 280, y: 380 },
    totalAmount: 0,
    orders: [],
    qrId: 'qr-2',
    lastUpdate: new Date()
  }
];

export const INITIAL_BARS: Bar[] = [
  {
    id: 'b1',
    name: 'BAR PRINCIPAL',
    zoneId: 'z1',
    location: 'Nivel 1',
    type: 'MAIN',
    isActive: true,
    position: { x: 80, y: 140 },
    size: { w: 280, h: 100 },
    rotation: 0,
    stock: [...INITIAL_STOCK],
    qrIds: ['qr-bar-1', 'qr-bar-2'],
    metrics: {
      revenue: 452000,
      avgPrepTime: 6,
      activeOrders: 8,
      totalScans: 1240
    }
  }
];

export const INITIAL_QRS: QR[] = [
  { id: 'qr-bar-1', name: 'BAR-A', zoneId: 'z1', type: 'BAR', barId: 'b1', position: { x: 80, y: 250 }, isActive: true, scanCount: 840, totalGeneratedRevenue: 310000, lastActivity: new Date() },
  { id: 'qr-bar-2', name: 'BAR-B', zoneId: 'z1', type: 'BAR', barId: 'b1', position: { x: 300, y: 250 }, isActive: true, scanCount: 400, totalGeneratedRevenue: 142000, lastActivity: new Date() },
  { id: 'qr-1', name: 'MESA-01', zoneId: 'z1', type: 'TABLE', targetId: 't1', position: { x: 120, y: 500 }, isActive: true, scanCount: 45, totalGeneratedRevenue: 12500 },
  { id: 'qr-2', name: 'MESA-02', zoneId: 'z1', type: 'TABLE', targetId: 't2', position: { x: 280, y: 500 }, isActive: true, scanCount: 12, totalGeneratedRevenue: 0 },
];

export const STATUS_COLORS = {
  [TableStatus.FREE]: 'bg-[#36e27b]',           // Verde - Disponible
  [TableStatus.RESERVED]: 'bg-[#4f46e5]',       // Índigo/Azul - Reservado
  [TableStatus.OCCUPIED]: 'bg-rose-500',        // Rojo - Con orden activa
  [TableStatus.PENDING_ORDER]: 'bg-amber-500',  // Ámbar - Esperando pedido (diferenciado)
  [TableStatus.BILL_REQUESTED]: 'bg-cyan-400',  // Cyan - Pidieron cuenta
  [TableStatus.PAYING]: 'bg-violet-500',        // Violeta - Procesando pago
  [TableStatus.CLOSED]: 'bg-zinc-600'           // Gris - Cerrada
};

// Background colors for table CARDS (subtle tints)
export const STATUS_BG_COLORS = {
  [TableStatus.FREE]: 'bg-emerald-950/50 border-emerald-500/30',            // Verde sutil
  [TableStatus.RESERVED]: 'bg-indigo-950/50 border-indigo-500/30',          // Azul/Índigo sutil
  [TableStatus.OCCUPIED]: 'bg-rose-950/50 border-rose-500/30',              // Rojo sutil
  [TableStatus.PENDING_ORDER]: 'bg-amber-950/50 border-amber-500/30',       // Ámbar sutil
  [TableStatus.BILL_REQUESTED]: 'bg-cyan-950/50 border-cyan-400/30',        // Cyan sutil
  [TableStatus.PAYING]: 'bg-violet-950/50 border-violet-500/30',            // Violeta sutil
  [TableStatus.CLOSED]: 'bg-zinc-900/50 border-zinc-700/30'                 // Gris sutil
};

export const ORDER_STATUS_COLORS = {
  [OrderStatus.PENDING]: 'text-rose-400 border-rose-500/30',
  [OrderStatus.PREPARING]: 'text-amber-400 border-amber-500/30',
  [OrderStatus.READY]: 'text-[#36e27b] border-[#36e27b]/30',
  [OrderStatus.DELIVERED]: 'text-zinc-500 border-zinc-800',
  [OrderStatus.CANCELLED]: 'text-red-600 border-red-900/30'
};
