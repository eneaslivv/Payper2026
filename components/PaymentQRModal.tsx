
import React from 'react';
import QRCode from 'react-qr-code';

interface PaymentQRModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    total: number;
    description?: string;
}

const PaymentQRModal: React.FC<PaymentQRModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    total,
    description = "Consumo en Local"
}) => {
    if (!isOpen) return null;

    // Placeholder Logic: 
    // In a real scenario, this URL would come from the store's MP integration or a specific QR string.
    // Since we want to enable the flow, we'll generate a generic MP link format or a placeholder string.
    // Attempting to make it somewhat realistic for a generic "pay me" QR.
    const qrValue = `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=placeholder-preference-id&amount=${total}`;

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative w-full max-w-sm bg-white rounded-[2.5rem] p-8 shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95">

                {/* Header */}
                <div className="mb-6">
                    <div className="size-16 rounded-full bg-cyan-100 flex items-center justify-center mx-auto mb-4 text-cyan-600">
                        <span className="material-symbols-outlined text-3xl">qr_code_2</span>
                    </div>
                    <h3 className="text-2xl font-black uppercase italic tracking-tight text-black">Pago con <span className="text-cyan-500">QR</span></h3>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Mercado Pago / Billeteras</p>
                </div>

                {/* QR Display */}
                <div className="bg-white p-4 rounded-2xl border-2 border-dashed border-gray-200 mb-6 shadow-sm">
                    <QRCode
                        value={qrValue}
                        size={200}
                        style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                        viewBox={`0 0 256 256`}
                    />
                </div>

                {/* Amount */}
                <div className="mb-8">
                    <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">Total a Pagar</p>
                    <p className="text-4xl font-black italic-black text-black tracking-tighter">${total.toFixed(2)}</p>
                </div>

                {/* Actions */}
                <div className="w-full space-y-3">
                    <button
                        onClick={onConfirm}
                        className="w-full py-4 bg-cyan-500 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-cyan-600 transition-all shadow-lg shadow-cyan-500/20 active:scale-95"
                    >
                        Pago Confirmado
                    </button>
                    <button
                        onClick={onClose}
                        className="w-full py-4 text-gray-400 font-bold text-xs uppercase tracking-widest hover:text-black transition-all"
                    >
                        Cancelar
                    </button>
                </div>

                <p className="mt-6 text-[9px] text-gray-300 font-medium max-w-[200px] leading-tight">
                    Muestra este código al cliente. Al recibir la confirmación en tu dispositivo o billetera, presiona "Pago Confirmado".
                </p>
            </div>
        </div>
    );
};

export default PaymentQRModal;
