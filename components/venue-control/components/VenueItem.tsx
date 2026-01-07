import React from 'react';
import { Table, AppMode, TableStatus, OrderStatus, NotificationType } from '../types';
import { STATUS_COLORS, STATUS_BG_COLORS } from '../constants';
import { Hand, Receipt, Clock, Beer } from 'lucide-react';
import TableActions from './TableActions';
import EditControls from './EditControls'; // Need to export this from TableMap or create new file

interface VenueItemProps {
    table: Table;
    mode: AppMode;
    isSelected: boolean;
    isDragging: boolean;
    activeOrdersCount: number;
    notification?: any;
    openedAt?: Date;
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onUpdateProperty?: (id: string, type: 'table', p: string, v: any) => void;
    onDelete?: (id: string, type: 'table') => void;
    onAction?: (id: string, status: TableStatus) => void;
}

const VenueItem: React.FC<VenueItemProps> = ({
    table, mode, isSelected, isDragging, activeOrdersCount, notification, openedAt,
    onPointerDown, onPointerUp, onUpdateProperty, onDelete, onAction
}) => {

    const showActions = isSelected && mode === AppMode.VIEW && !isDragging;

    // Calculate time elapsed in minutes
    const getElapsedTime = () => {
        if (!openedAt) return null;
        const now = new Date();
        const diffMs = now.getTime() - openedAt.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 60) return `${diffMins}m`;
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        return `${hours}h${mins > 0 ? mins + 'm' : ''}`;
    };

    return (
        <div
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            style={{
                left: table.position.x,
                top: table.position.y,
                width: table.size.w,
                height: table.size.h,
                transform: `rotate(${table.rotation || 0}deg)`,
                transition: isDragging ? 'none' : 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
                zIndex: isDragging ? 100 : isSelected ? 60 : 10
            }}
            className={`
        absolute node-element flex flex-col items-center justify-center
        shadow-2xl transition-all group
        ${table.shape === 'circle' ? 'rounded-full' : 'rounded-[24px]'}
        ${STATUS_BG_COLORS[table.status] || 'bg-[#080808] border-zinc-900'}
        ${isSelected ? 'ring-4 ring-[#36e27b]/20 !border-[#36e27b]' : ''}
        ${mode === AppMode.EDIT ? 'cursor-move hover:border-[#36e27b]/40' : 'cursor-pointer hover:scale-105 active:scale-95'}
      `}
        >
            {/* Notifications */}
            {activeOrdersCount > 0 && mode === AppMode.VIEW && (
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-zinc-950 border border-[#36e27b]/50 rounded-full flex items-center justify-center shadow-2xl z-[60]">
                    <span className="text-[9px] font-black text-[#36e27b] leading-none tabular-nums">{activeOrdersCount}</span>
                </div>
            )}

            {notification && mode === AppMode.VIEW && (
                <div className="absolute -top-10 flex flex-col items-center animate-bounce z-[60] pointer-events-none">
                    <div className={`p-2 rounded-xl border shadow-2xl ${notification.type === NotificationType.CALL_WAITER ? 'bg-amber-500 border-amber-400 text-black' :
                        notification.type === NotificationType.REQUEST_CHECK ? 'bg-[#36e27b] border-emerald-400 text-black' :
                            'bg-rose-500 border-rose-400 text-white'
                        }`}>
                        {notification.type === NotificationType.CALL_WAITER && <Hand size={14} />}
                        {notification.type === NotificationType.REQUEST_CHECK && <Receipt size={14} />}
                        {notification.type === NotificationType.DELAYED && <Clock size={14} />}
                    </div>
                    <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-zinc-900 mt-[-2px]"></div>
                </div>
            )}

            {/* Status Indicator inside */}
            <div className={`w-2.5 h-2.5 rounded-full absolute bottom-[25%] ${STATUS_COLORS[table.status]} shadow-[0_0_15px_#36e27b] pointer-events-none transition-colors duration-500`}></div>
            <span className="text-[10px] font-black tracking-tighter text-white pointer-events-none">{table.name}</span>

            {/* Time elapsed badge - only show when table is occupied */}
            {openedAt && mode === AppMode.VIEW && (
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded-full z-[55]">
                    <span className="text-[7px] font-black text-zinc-400 uppercase tracking-widest tabular-nums flex items-center gap-1">
                        <Clock size={8} />
                        {getElapsedTime()}
                    </span>
                </div>
            )}

            {/* EDIT MODE CONTROLS */}
            {isSelected && mode === AppMode.EDIT && onUpdateProperty && !isDragging && (
                <EditControls
                    type="table"
                    shape={table.shape}
                    rotation={table.rotation}
                    size={table.size}
                    onUpdate={(p, v) => onUpdateProperty(table.id, 'table', p, v)}
                    onDelete={() => onDelete && onDelete(table.id, 'table')}
                />
            )}

            {/* VIEW MODE ACTIONS POPUP - Only if selected and not dragging */}
            {showActions && onAction && (
                <div className="absolute -top-32 left-1/2 -translate-x-1/2">
                    <TableActions
                        status={table.status}
                        onAction={(status) => onAction(table.id, status)}
                        onClose={() => { }} // Controlled by selection mostly
                    />
                    {/* Arrow */}
                    <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-zinc-800 mx-auto mt-1"></div>
                </div>
            )}
        </div>
    );
};

export default VenueItem;
