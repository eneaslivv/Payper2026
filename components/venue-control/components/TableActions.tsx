import React from 'react';
import { TableStatus } from '../types';
import { DollarSign, UserCheck, XCircle, LogOut } from 'lucide-react';

interface TableActionsProps {
    status: TableStatus;
    onAction: (newStatus: TableStatus) => void;
    onClose: () => void;
}

const TableActions: React.FC<TableActionsProps> = ({ status, onAction, onClose }) => {

    // Handlers
    const handleOpen = () => {
        onAction(TableStatus.OCCUPIED);
        onClose();
    };

    const handleRequestBill = () => {
        onAction(TableStatus.BILL_REQUESTED);
        onClose();
    };

    const handleFree = () => {
        // Confirm? Maybe simple for now
        if (confirm('¿Liberar mesa? Esto cerrará la sesión actual.')) {
            onAction(TableStatus.FREE);
            onClose();
        }
    };

    const handleCloseBill = () => {
        onAction(TableStatus.FREE); // Closing bill frees the table for now (or strictly "clean" if we had it)
        onClose();
    };

    return (
        <div className="flex flex-col gap-1.5 min-w-[150px] p-2 bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/5 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-100 origin-center z-[100] ring-1 ring-white/5">
            {status === TableStatus.FREE && (
                <button
                    onClick={handleOpen}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-900 transition-all text-left group active:scale-95"
                >
                    <div className="p-1.5 rounded-lg bg-[#36e27b]/10 text-[#36e27b] group-hover:bg-[#36e27b] group-hover:text-black transition-colors shadow-[0_0_10px_rgba(54,226,123,0.1)]">
                        <UserCheck size={14} strokeWidth={2.5} />
                    </div>
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Abrir Mesa</span>
                </button>
            )}

            {status === TableStatus.OCCUPIED && (
                <>
                    <button
                        onClick={handleRequestBill}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-900 transition-all text-left group active:scale-95"
                    >
                        <div className="p-1.5 rounded-lg bg-yellow-500/10 text-yellow-500 group-hover:bg-yellow-500 group-hover:text-black transition-colors">
                            <DollarSign size={14} strokeWidth={2.5} />
                        </div>
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">Pedir Cuenta</span>
                    </button>

                    <div className="h-px bg-white/5 my-0.5" />

                    <button
                        onClick={handleFree}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-500/10 transition-all text-left group active:scale-95"
                    >
                        <div className="p-1.5 rounded-lg bg-zinc-900 text-zinc-500 group-hover:bg-red-500 group-hover:text-white transition-colors">
                            <XCircle size={14} strokeWidth={2.5} />
                        </div>
                        <span className="text-[10px] font-bold text-zinc-500 group-hover:text-red-400 uppercase tracking-widest transition-colors">Cancelar</span>
                    </button>
                </>
            )}

            {status === TableStatus.BILL_REQUESTED && (
                <button
                    onClick={handleCloseBill}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-900 transition-all text-left group active:scale-95"
                >
                    <div className="p-1.5 rounded-lg bg-[#36e27b]/10 text-[#36e27b] group-hover:bg-[#36e27b] group-hover:text-black transition-colors shadow-[0_0_15px_rgba(54,226,123,0.2)]">
                        <DollarSign size={14} strokeWidth={2.5} />
                    </div>
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Cobrar</span>
                </button>
            )}
        </div>
    );
};

export default TableActions;
