import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Table, Bar, QR, TableStatus, Position, AppMode, OrderStatus, NotificationType } from '../types';
import { STATUS_COLORS } from '../constants';
import { Beer, QrCode, RotateCw, Maximize2, Minimize2, Circle, Square, Trash2, Clock, Hand, Receipt } from 'lucide-react';
import VenueItem from './VenueItem';
import EditControls from './EditControls';

interface TableMapProps {
  tables: Table[];
  bars: Bar[];
  qrs: QR[];
  mode: AppMode;
  zoom: number;
  setZoom?: (fn: (z: number) => number) => void;
  activeZoneId?: string;
  selectedTableId: string | null;
  selectedBarId: string | null;
  selectedQrId: string | null;
  onSelectTable: (id: string | null) => void;
  onSelectBar: (id: string | null) => void;
  onSelectQr?: (id: string | null) => void;
  onUpdatePosition: (id: string, pos: Position, type: 'table' | 'bar' | 'qr') => void;
  onUpdateProperty?: (id: string, type: 'table' | 'bar', property: string, value: any) => void;
  onDeleteNode?: (id: string, type: 'table' | 'bar' | 'qr') => void;
  onBackgroundClick?: () => void;
  onTableAction?: (id: string, status: TableStatus) => void;
  notifications?: Array<{ id: string; type: NotificationType; tableId: string; message: string; }>;
  onDismissNotification?: (notificationId: string) => void;
}

const TableMap: React.FC<TableMapProps> = ({
  tables, bars, qrs, mode, zoom, setZoom, activeZoneId,
  selectedTableId, selectedBarId, selectedQrId,
  onSelectTable, onSelectBar, onSelectQr,
  onUpdatePosition, onUpdateProperty, onDeleteNode, onBackgroundClick, onTableAction,
  notifications = [], onDismissNotification
}) => {
  const [activeDrag, setActiveDrag] = useState<{
    id: string;
    type: 'table' | 'bar' | 'qr';
    offset: Position;
  } | null>(null);

  const [panOffset, setPanOffset] = useState<Position>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);

  const startPointerPos = useRef<Position | null>(null);
  const currentPointerPos = useRef<Position>({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  const handlePointerDown = (e: React.PointerEvent, id?: string, type?: 'table' | 'bar' | 'qr') => {
    startPointerPos.current = { x: e.clientX, y: e.clientY };
    currentPointerPos.current = { x: e.clientX, y: e.clientY };
    hasMoved.current = false;

    if (id && type) {
      e.stopPropagation();
      if (mode === AppMode.EDIT) {
        const target = e.currentTarget as HTMLElement;
        target.setPointerCapture(e.pointerId);

        let currentPos = { x: 0, y: 0 };
        if (type === 'table') currentPos = tables.find(t => t.id === id)?.position || currentPos;
        else if (type === 'bar') currentPos = bars.find(b => b.id === id)?.position || currentPos;
        else currentPos = qrs.find(q => q.id === id)?.position || currentPos;

        const rect = mapRef.current!.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left - panOffset.x) / zoom;
        const mouseY = (e.clientY - rect.top - panOffset.y) / zoom;

        setActiveDrag({
          id,
          type,
          offset: {
            x: mouseX - currentPos.x,
            y: mouseY - currentPos.y
          }
        });
      }
    } else {
      setIsPanning(true);
      (mapRef.current as any)?.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!startPointerPos.current) return;

    const dxTotal = Math.abs(e.clientX - startPointerPos.current.x);
    const dyTotal = Math.abs(e.clientY - startPointerPos.current.y);

    if (dxTotal > 5 || dyTotal > 5) {
      hasMoved.current = true;
    }

    if (activeDrag && mode === AppMode.EDIT) {
      const rect = mapRef.current!.getBoundingClientRect();
      const x = (e.clientX - rect.left - panOffset.x) / zoom - activeDrag.offset.x;
      const y = (e.clientY - rect.top - panOffset.y) / zoom - activeDrag.offset.y;

      onUpdatePosition(activeDrag.id, { x, y }, activeDrag.type);
    } else if (isPanning) {
      const dx = e.clientX - currentPointerPos.current.x;
      const dy = e.clientY - currentPointerPos.current.y;
      setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    }

    currentPointerPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent, id?: string, type?: 'table' | 'bar' | 'qr') => {
    // Solo procesamos clic si no ha habido movimiento
    if (startPointerPos.current && !hasMoved.current) {
      if (id && type) {
        if (type === 'table') {
          onSelectTable(id);
        } else if (type === 'bar') {
          onSelectBar(id);
        } else if (type === 'qr') {
          if (onSelectQr) onSelectQr(id);
        }
      } else {
        onBackgroundClick?.();
      }
    }

    // Limpieza de estados
    setActiveDrag(null);
    if (isPanning) {
      setIsPanning(false);
      (mapRef.current as any)?.releasePointerCapture(e.pointerId);
    }
    startPointerPos.current = null;
  };

  const handlePointerLeave = () => {
    // Si el puntero sale, cancelamos el arrastre pero NO disparamos un clic
    setActiveDrag(null);
    setIsPanning(false);
    startPointerPos.current = null;
  };

  return (
    <div
      ref={mapRef}
      className={`relative w-full h-full bg-[#050505] rounded-[40px] border border-zinc-900/50 overflow-hidden shadow-2xl touch-none select-none ${isPanning ? 'cursor-grabbing' : mode === AppMode.EDIT ? 'cursor-grab' : 'cursor-default'}`}
      onPointerDown={(e) => handlePointerDown(e)}
      onPointerMove={handlePointerMove}
      onPointerUp={(e) => handlePointerUp(e)}
      onPointerLeave={handlePointerLeave}
    >
      <div
        className="map-grid absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: `radial-gradient(circle, #36e27b 1px, transparent 1px)`,
          backgroundSize: `${40 * zoom}px ${40 * zoom}px`,
          backgroundPosition: `${panOffset.x}px ${panOffset.y}px`,
        }}
      ></div>

      <div
        className="relative w-full h-full origin-top-left"
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
        }}
      >
        {bars.map((bar) => {
          const isSelected = selectedBarId === bar.id;
          const isDragging = activeDrag?.id === bar.id;
          const activeOrdersCount = bar.metrics.activeOrders;

          return (
            <div
              key={bar.id}
              onPointerDown={(e) => handlePointerDown(e, bar.id, 'bar')}
              onPointerUp={(e) => { e.stopPropagation(); handlePointerUp(e, bar.id, 'bar'); }}
              style={{
                left: bar.position.x,
                top: bar.position.y,
                width: bar.size.w,
                height: bar.size.h,
                transform: `rotate(${bar.rotation || 0}deg)`,
                transition: isDragging ? 'none' : 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
                zIndex: isDragging ? 100 : isSelected ? 50 : 10
              }}
              className={`
                absolute rounded-[28px] node-element flex flex-col items-center justify-center gap-2
                bg-[#080808] shadow-2xl border transition-all group
                ${isSelected ? 'border-[#36e27b] ring-4 ring-[#36e27b]/10' : 'border-zinc-900'}
                ${mode === AppMode.EDIT ? 'cursor-move hover:border-[#36e27b]/50' : 'cursor-pointer hover:scale-[1.01]'}
              `}
            >
              {activeOrdersCount > 0 && mode === AppMode.VIEW && (
                <div className="absolute -top-3 -right-3 w-7 h-7 bg-[#36e27b] rounded-full flex items-center justify-center border-4 border-[#050505] shadow-[0_0_15px_rgba(54,226,123,0.4)] z-[60]">
                  <span className="text-[10px] font-black text-black leading-none">{activeOrdersCount}</span>
                </div>
              )}

              <div className="w-8 h-8 rounded-xl bg-zinc-900 flex items-center justify-center text-[#36e27b] group-hover:shadow-[0_0_15px_rgba(54,226,123,0.3)] transition-all pointer-events-none">
                <Beer size={16} />
              </div>
              <span className="text-[9px] font-black text-zinc-600 tracking-widest uppercase group-hover:text-white transition-colors pointer-events-none">{bar.name}</span>

              {isSelected && mode === AppMode.EDIT && onUpdateProperty && !activeDrag && (
                <EditControls
                  type="bar"
                  rotation={bar.rotation}
                  size={bar.size}
                  onUpdate={(p, v) => onUpdateProperty(bar.id, 'bar', p, v)}
                  onDelete={() => onDeleteNode && onDeleteNode(bar.id, 'bar')}
                />
              )}
            </div>
          );
        })}

        {tables.map((table) => {
          const isSelected = selectedTableId === table.id;
          const isDragging = activeDrag?.id === table.id;
          // Get notifications from DB props instead of local state
          const tableNotification = notifications.find(n => n.tableId === table.id);
          const notification = tableNotification ? {
            id: tableNotification.id,
            type: tableNotification.type,
            tableId: tableNotification.tableId,
            timestamp: new Date(),
            message: tableNotification.message,
            isRead: false
          } : undefined;
          const activeOrdersCount = table.orders.filter(o => o.status !== OrderStatus.DELIVERED && o.status !== OrderStatus.CANCELLED).length;

          return (
            <VenueItem
              key={table.id}
              table={table}
              mode={mode}
              isSelected={isSelected}
              isDragging={isDragging}
              activeOrdersCount={activeOrdersCount}
              notification={notification}
              openedAt={table.openedAt}
              onPointerDown={(e) => handlePointerDown(e, table.id, 'table')}
              onPointerUp={(e) => { e.stopPropagation(); handlePointerUp(e, table.id, 'table'); }}
              onUpdateProperty={onUpdateProperty}
              onDelete={onDeleteNode}
              onAction={onTableAction}
            />
          );
        })}

        {qrs.map((qr) => {
          const isSelected = selectedQrId === qr.id;
          const isDragging = activeDrag?.id === qr.id;
          return (
            <div
              key={qr.id}
              onPointerDown={(e) => handlePointerDown(e, qr.id, 'qr')}
              onPointerUp={(e) => { e.stopPropagation(); handlePointerUp(e, qr.id, 'qr'); }}
              style={{
                left: qr.position.x,
                top: qr.position.y,
                transition: isDragging ? 'none' : 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
                zIndex: isDragging ? 100 : isSelected ? 50 : 20
              }}
              className={`
                absolute w-12 h-12 node-element flex items-center justify-center
                rounded-2xl border transition-all group
                ${isSelected ? 'border-[#36e27b] ring-2 ring-[#36e27b]/20 bg-zinc-900' : mode === AppMode.EDIT ? 'bg-zinc-900 border-zinc-700 hover:border-[#36e27b]/50 cursor-move' : 'bg-black border-zinc-800 hover:scale-110 cursor-pointer'}
              `}
            >
              <QrCode size={16} className={`${qr.isActive ? 'text-[#36e27b]' : 'text-zinc-700'} pointer-events-none`} />
            </div>
          );
        })}
      </div>
      {/* FLOATING STATUS MENU (LIVE MODE) */}
      {mode === AppMode.VIEW && selectedTableId && tables.find(t => t.id === selectedTableId) && (
        (() => {
          const table = tables.find(t => t.id === selectedTableId)!;
          return (
            <div
              className="absolute z-[100] flex flex-col gap-2 p-2 bg-black/90 backdrop-blur-xl border border-zinc-800 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200"
              style={{
                left: table.position.x + table.size.w / 2, // Centered horizontally
                top: table.position.y - 120, // Above the table
                transform: 'translateX(-50%)'
              }}
              onPointerDown={(e) => e.stopPropagation()} // Prevent map drag
            >
              <div className="flex items-center justify-center gap-2 pb-2 border-b border-zinc-800 mb-1">
                <span className="text-[9px] font-black text-white uppercase tracking-widest">{table.name}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { onTableAction?.(table.id, TableStatus.FREE); onBackgroundClick?.(); }}
                  className="flex flex-col items-center gap-1 p-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-black border border-emerald-500/30 transition-all group"
                  title="Liberar Mesa"
                >
                  <Circle size={18} className="fill-current" />
                  <span className="text-[7px] font-black uppercase tracking-widest">Libre</span>
                </button>
                <button
                  onClick={() => { onTableAction?.(table.id, TableStatus.OCCUPIED); onBackgroundClick?.(); }}
                  className="flex flex-col items-center gap-1 p-3 rounded-xl bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white border border-rose-500/30 transition-all group"
                  title="Ocupar Mesa"
                >
                  <Square size={18} className="fill-current" />
                  <span className="text-[7px] font-black uppercase tracking-widest">Ocupada</span>
                </button>
                <button
                  onClick={() => { onTableAction?.(table.id, TableStatus.BILL_REQUESTED); onBackgroundClick?.(); }} // Using existing status or generic
                  className="flex flex-col items-center gap-1 p-3 rounded-xl bg-amber-500/10 hover:bg-amber-500 text-amber-500 hover:text-black border border-amber-500/30 transition-all group"
                  title="Cobrar / Cuenta"
                >
                  <Receipt size={18} />
                  <span className="text-[7px] font-black uppercase tracking-widest">Cuenta</span>
                </button>
              </div>
              <div className="absolute bottom-[-6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-black/90 border-r border-b border-zinc-800 rotate-45"></div>
            </div>
          );
        })()
      )}
    </div>
  );
};


export default TableMap;
