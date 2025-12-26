
import React, { useRef } from 'react';
import QRCode from "react-qr-code";
import { StoreTable } from '../types';

interface QRCodeCardProps {
    table: StoreTable;
    storeId: string;
}

const QRCodeCard: React.FC<QRCodeCardProps> = ({ table, storeId }) => {
    const clientAppUrl = import.meta.env.VITE_CLIENT_APP_URL || 'https://app.coffeesquad.com';
    const qrValue = `${clientAppUrl}/?store=${storeId}&table=${table.id}`;
    const qrRef = useRef<HTMLDivElement>(null);

    const handlePrint = () => {
        const printWindow = window.open('', '', 'width=600,height=600');
        if (!printWindow) return;

        const qrSvg = qrRef.current?.querySelector('svg')?.outerHTML || '';

        printWindow.document.write(`
            <html>
                <head>
                    <title>QR - ${table.label}</title>
                    <style>
                        body {
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                            height: 100vh;
                            margin: 0;
                            font-family: sans-serif;
                        }
                        .qr-container {
                            border: 4px solid #000;
                            padding: 20px;
                            border-radius: 20px;
                        }
                        h1 { margin-bottom: 30px; font-size: 24px; font-weight: 900; text-transform: uppercase; }
                        p { margin-top: 20px; font-size: 12px; color: #666; }
                    </style>
                </head>
                <body>
                    <h1>${table.label}</h1>
                    <div class="qr-container">
                        ${qrSvg}
                    </div>
                    <p>Escanea para ordenar</p>
                    <script>
                        window.onload = () => {
                            window.print();
                            window.onafterprint = () => window.close();
                        }
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    return (
        <div className="bg-white/5 rounded-2xl p-6 border border-white/5 flex flex-col items-center gap-4 group hover:border-neon/30 transition-all">

            {/* Header Mini */}
            <div className="w-full flex justify-between items-center pb-2 border-b border-white/5 mb-2">
                <span className="text-[10px] font-black uppercase text-white/50 tracking-widest">{table.label}</span>
                <div className={`size-2 rounded-full ${table.is_active ? 'bg-neon shadow-[0_0_8px_#36e27b]' : 'bg-red-500'}`}></div>
            </div>

            {/* QR Wrapper */}
            <div
                ref={qrRef}
                className="bg-white p-4 rounded-xl border-4 border-neon shadow-[0_0_20px_rgba(54,226,123,0.2)] group-hover:shadow-[0_0_30px_rgba(54,226,123,0.4)] transition-all duration-500"
            >
                <div style={{ height: "auto", margin: "0 auto", maxWidth: 128, width: "100%" }}>
                    <QRCode
                        size={256}
                        style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                        value={qrValue}
                        viewBox={`0 0 256 256`}
                        fgColor="#000000"
                        bgColor="#ffffff"
                    />
                </div>
            </div>

            {/* Actions */}
            <button
                onClick={handlePrint}
                className="w-full py-2 bg-[#111] hover:bg-neon hover:text-black border border-white/10 rounded-lg text-white/60 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 group/btn"
            >
                <span className="material-symbols-outlined text-[16px] group-hover/btn:scale-110 transition-transform">print</span>
                Imprimir QR
            </button>
        </div>
    );
};

export default QRCodeCard;
