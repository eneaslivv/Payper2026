import React from 'react';
import { Table, AppMode, TableStatus, OrderStatus, NotificationType } from '../types';
import { STATUS_COLORS, STATUS_BG_COLORS } from '../constants';
import { Hand, Receipt, Clock, Beer, Bell } from 'lucide-react';
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

    // Determine Priority Alert Status
    // P0: Bill Requested (Receipt icon + Cyan Pulse)
    // P1: Call Waiter (Hand icon + Amber Glow)
    // P2: Order Ready (Internal Green Pulse)
    const isBillRequested = notification?.type === NotificationType.REQUEST_CHECK;
    const isCallWaiter = notification?.type === NotificationType.CALL_WAITER;
    const isReady = table.orders.some(o => o.status === OrderStatus.READY);

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
        <>
            <style>{`
                @keyframes pulse-cyan {
                    0% { box-shadow: 0 0 0 0 rgba(34, 211, 238, 0.7); border-color: rgba(34, 211, 238, 0.8); }
                    70% { box-shadow: 0 0 0 15px rgba(34, 211, 238, 0); border-color: rgba(34, 211, 238, 1); }
                    100% { box-shadow: 0 0 0 0 rgba(34, 211, 238, 0); border-color: rgba(34, 211, 238, 0.8); }
                }
                @keyframes glow-amber {
                    0% { box-shadow: 0 0 5px rgba(245, 158, 11, 0.4); border-color: rgba(245, 158, 11, 0.5); }
                    50% { box-shadow: 0 0 20px rgba(245, 158, 11, 0.8); border-color: rgba(245, 158, 11, 1); }
                    100% { box-shadow: 0 0 5px rgba(245, 158, 11, 0.4); border-color: rgba(245, 158, 11, 0.5); }
                }
                @keyframes ready-inner-pulse {
                    0% { transform: scale(1); opacity: 1; filter: drop-shadow(0 0 2px #36e27b); }
                    50% { transform: scale(1.3); opacity: 0.8; filter: drop-shadow(0 0 8px #36e27b); }
                    100% { transform: scale(1); opacity: 1; filter: drop-shadow(0 0 2px #36e27b); }
                }
            `}</style>
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
                    zIndex: isDragging ? 100 : (isSelected || isBillRequested || isCallWaiter) ? 60 : 10,
                    animation: isBillRequested ? 'pulse-cyan 2s infinite' : isCallWaiter ? 'glow-amber 2s infinite' : 'none'
                }}
                className={`
                    absolute node-element flex flex-col items-center justify-center
                    shadow-2xl transition-all group
                    ${table.shape === 'circle' ? 'rounded-full' : 'rounded-[24px]'}
                    ${/* Base Color Logic with Alert Overrides */ ''}
                    ${isBillRequested ? '!bg-cyan-950/80 !border-cyan-400' :
                        isCallWaiter ? '!bg-amber-950/80 !border-amber-500' :
                            activeOrdersCount > 0 ? 'bg-emerald-950/40 border-emerald-500/50' : // Active Order Tint
                                STATUS_BG_COLORS[table.status] || 'bg-[#080808] border-zinc-900'}
                    
                    ${isSelected ? 'ring-4 ring-[#36e27b]/20 !border-[#36e27b]' : ''}
                    ${mode === AppMode.EDIT ? 'cursor-move hover:border-[#36e27b]/40' : 'cursor-pointer hover:scale-105 active:scale-95'}
                `}
            >
                {/* Integrated Status Icons (Background) */}
                <div className="absolute inset-0 flex items-center justify-center opacity-30 group-hover:opacity-40 transition-opacity pointer-events-none">
                    {isBillRequested ? <Receipt size={table.size.w * 0.4} className="text-cyan-400" /> :
                        isCallWaiter ? <Hand size={table.size.w * 0.4} className="text-amber-500" /> :
                            activeOrdersCount > 0 ? <Beer size={table.size.w * 0.3} className="text-emerald-500" /> : // Active Order Icon
                                isReady ? <Bell size={table.size.w * 0.4} className="text-[#36e27b]" /> : null}
                </div>

                {/* Notifications badge count */}
                {activeOrdersCount > 0 && mode === AppMode.VIEW && !isBillRequested && !isCallWaiter && (
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-zinc-950 border border-[#36e27b]/50 rounded-full flex items-center justify-center shadow-2xl z-[60]">
                        <span className="text-[9px] font-black text-[#36e27b] leading-none tabular-nums">{activeOrdersCount}</span>
                    </div>
                )}

                {/* Legacy Bubble Notification (Keeping for backward compatibility but making it subtle if integrated alerts are active) */}
                {notification && mode === AppMode.VIEW && (
                    <div className={`absolute -top-10 flex flex-col items-center animate-bounce z-[60] pointer-events-none ${isBillRequested || isCallWaiter ? 'opacity-0 scale-50' : 'opacity-100'}`}>
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
                <div className={`
                    w-2.5 h-2.5 rounded-full absolute bottom-[25%] 
                    ${isReady ? 'bg-[#36e27b] shadow-[0_0_15px_#36e27b]' : STATUS_COLORS[table.status]} 
                    pointer-events-none transition-all duration-500
                    ${isReady ? 'animate-[ready-inner-pulse_1.5s_infinite]' : ''}
                `}></div>

                <span className={`text-[10px] font-black tracking-tighter pointer-events-none ${isBillRequested ? 'text-cyan-100' : isCallWaiter ? 'text-amber-100' : 'text-white'}`}>
                    {table.name}
                </span>

                {/* Time elapsed badge - only show when table is occupied */}
                {openedAt && mode === AppMode.VIEW && (
                    <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 border rounded-full z-[55] transition-colors ${isBillRequested ? 'bg-cyan-900 border-cyan-400 text-cyan-50' : isCallWaiter ? 'bg-amber-900 border-amber-500 text-amber-50' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>
                        <span className="text-[7px] font-black uppercase tracking-widest tabular-nums flex items-center gap-1">
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
        </>
    );
};

export default VenueItem;
