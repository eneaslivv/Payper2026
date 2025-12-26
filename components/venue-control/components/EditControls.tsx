import React from 'react';
import { RotateCw, Maximize2, Minimize2, Circle, Square, Trash2 } from 'lucide-react';

const ControlButton: React.FC<{ icon: React.ReactNode, onClick: () => void }> = ({ icon, onClick }) => (
    <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className="w-8 h-8 flex items-center justify-center rounded-xl bg-zinc-900 text-zinc-500 hover:text-[#36e27b] hover:bg-[#36e27b]/10 transition-all border border-zinc-800 active:scale-90"
    >
        {icon}
    </button>
);

interface EditControlsProps {
    type: 'table' | 'bar';
    rotation: number;
    size: { w: number, h: number };
    shape?: string;
    onUpdate: (prop: string, value: any) => void;
    onDelete: () => void;
}

const EditControls: React.FC<EditControlsProps> = ({ type, rotation, size, shape, onUpdate, onDelete }) => (
    <div
        className="absolute -top-16 left-1/2 -translate-x-1/2 flex items-center gap-1 p-1.5 bg-[#0a0a0a] border border-[#36e27b]/30 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] z-[200]"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
    >
        <ControlButton icon={<RotateCw size={12} />} onClick={() => onUpdate('rotation', (rotation + 45) % 360)} />
        <ControlButton icon={<Maximize2 size={12} />} onClick={() => onUpdate('size', { w: size.w + 10, h: size.h + 10 })} />
        <ControlButton icon={<Minimize2 size={12} />} onClick={() => onUpdate('size', { w: Math.max(40, size.w - 10), h: Math.max(40, size.h - 10) })} />
        {type === 'table' && (
            <>
                <ControlButton
                    icon={shape === 'circle' ? <Square size={12} /> : <Circle size={12} />}
                    onClick={() => onUpdate('shape', shape === 'circle' ? 'square' : 'circle')}
                />
                <ControlButton
                    icon={<div className="font-black text-[9px]">QR</div>}
                    onClick={() => onUpdate('qr_modal', true)}
                />
            </>
        )}
        <div className="w-px h-4 bg-zinc-800 mx-1"></div>
        <ControlButton
            icon={<Trash2 size={12} className="text-rose-500" />}
            onClick={onDelete}
        />
    </div>
);

export default EditControls;
