import { useMemo, useState, useEffect } from "react";
import QRCode from "react-qr-code";

interface OrderPickupTicketProps {
    order: {
        id: string;
        pickup_code: string;
        delivery_status: 'pending' | 'delivered' | 'burned' | 'preparing' | 'ready' | 'received';
        order_number: number;
        created_at: string;
        total_amount?: number;
        order_items?: Array<{
            quantity: number;
            product?: {
                name: string;
            };
            // Legacy/Fallback
            name?: string;
        }>;
    };
    storeSlug?: string;
}

export const OrderPickupTicket = ({ order, storeSlug }: OrderPickupTicketProps) => {
    const isDelivered = order.delivery_status === 'delivered' || order.delivery_status === 'burned';

    // Timer Logic
    const [timeLeft, setTimeLeft] = useState({ minutes: 5, seconds: 0 });

    // AI Wait Time Estimation Logic 🤖
    const estimatedMinutes = useMemo(() => {
        const baseTime = 5; // 5 mins base
        const itemsCount = order.order_items?.reduce((acc: number, item: any) => acc + (item.quantity || 1), 0) || 1;
        const itemFactor = itemsCount * 2; // 2 mins per item

        // Peak Hour Check (Morning 8-10am, Evening 5-7pm)
        const hour = new Date().getHours();
        const isPeak = (hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 19);
        const peakFactor = isPeak ? 5 : 0;

        return baseTime + itemFactor + peakFactor;
    }, [order.order_items]);

    useEffect(() => {
        if (isDelivered) return;

        // Use the dynamic estimated time instead of fixed 5 mins
        const created = new Date(order.created_at).getTime();
        const now = new Date().getTime();
        const diff = Math.max(0, (created + estimatedMinutes * 60 * 1000) - now);

        const updateTimer = () => {
            const now = new Date().getTime();
            const diff = Math.max(0, (created + estimatedMinutes * 60 * 1000) - now);

            const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((diff % (1000 * 60)) / 1000);
            setTimeLeft({ minutes: m, seconds: s });
        };

        const interval = setInterval(updateTimer, 1000);
        updateTimer(); // Initial call

        return () => clearInterval(interval);
    }, [order.created_at, isDelivered, estimatedMinutes]);

    if (isDelivered) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen text-center p-8 bg-black relative overflow-hidden animate-in fade-in duration-1000">
                {/* Background Decorations 🎨 */}
                <div className="absolute top-[-10%] left-[-20%] w-[60%] h-[40%] bg-[#36e27b]/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-20%] w-[60%] h-[40%] bg-[#36e27b]/10 blur-[120px] rounded-full" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(54,226,123,0.05)_0%,transparent_70%)]" />

                {/* Main Success Icon 🏆 */}
                <div className="relative mb-12 z-10">
                    <div className="absolute inset-0 bg-[#36e27b] blur-[60px] rounded-full opacity-20 animate-pulse" />
                    <div className="relative w-32 h-32 rounded-[2.5rem] bg-gradient-to-br from-[#111] to-black border border-white/10 flex items-center justify-center shadow-2xl rotate-3">
                        <div className="absolute inset-px rounded-[2.4rem] bg-gradient-to-br from-white/5 to-transparent" />
                        <span className="material-symbols-outlined text-7xl text-[#36e27b] drop-shadow-[0_0_15px_rgba(54,226,123,0.5)] animate-in zoom-in duration-700 delay-300">verified</span>
                    </div>
                </div>

                {/* Text Content 📝 */}
                <div className="relative z-10 mb-16">
                    <h2 className="text-5xl font-black text-white italic uppercase tracking-[-0.05em] mb-4 leading-[0.85]">
                        ¡DISFRUTA<br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#36e27b] to-white"
                            style={{ textShadow: '0 0 30px rgba(54,226,123,0.3)' }}>
                            TU CAFÉ!
                        </span>
                    </h2>
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <div className="h-px w-8 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                        <p className="text-gray-400 font-black uppercase tracking-[0.3em] text-[10px]">Pedido Finalizado</p>
                        <div className="h-px w-8 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                    </div>
                </div>

                {/* Action Button 🚀 */}
                <div className="relative z-10 w-full max-w-[280px]">
                    <div className="absolute inset-0 bg-[#36e27b]/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                    <button
                        onClick={() => {
                            if (storeSlug) {
                                window.location.hash = `/m/${storeSlug}`;
                            } else {
                                // Fallback: try to strip the /order/ part from hash
                                const currentHash = window.location.hash;
                                window.location.hash = currentHash.split('/order/')[0];
                            }
                        }}
                        className="group relative w-full py-5 bg-[#36e27b] text-black rounded-[2rem] overflow-hidden active:scale-[0.97] transition-all shadow-[0_20px_40px_rgba(54,226,123,0.25)] flex items-center justify-center gap-3"
                    >
                        <div className="absolute inset-0 bg-white/30 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                        <span className="relative text-xs font-black uppercase tracking-[0.15em] italic">Pedir algo más</span>
                        <span className="material-symbols-outlined relative text-xl font-black group-hover:translate-x-1 transition-transform">arrow_forward</span>
                    </button>

                    <button
                        onClick={() => window.location.reload()}
                        className="mt-6 w-full py-4 text-white/30 hover:text-white/60 text-[10px] font-black uppercase tracking-[0.4em] transition-all"
                    >
                        Ver Detalle del Ticket
                    </button>
                </div>

                {/* Bottom Brand Detail */}
                <div className="absolute bottom-12 flex flex-col items-center gap-2 opacity-20">
                    <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white">Coffee Squad</p>
                    <div className="h-1 w-1 rounded-full bg-[#36e27b]" />
                </div>
            </div>
        );
    }

    const statusConfig = {
        received: {
            color: '#36e27b', // Neon Green
            label: 'RECIBIDO',
            title: ['TU CAFÉ SE ESTÁ', 'CREANDO'],
            icon: 'check_circle'
        },
        preparing: {
            color: '#3b82f6', // Blue
            label: 'EN COCINA',
            title: ['PREPARANDO', 'TU PEDIDO'],
            icon: 'coffee_maker'
        },
        ready: {
            color: '#f59e0b', // Amber/Orange
            label: 'LISTO',
            title: ['TU PEDIDO ESTÁ', 'ESPERÁNDOTE'],
            icon: 'stars'
        },
        delivered: {
            color: '#36e27b',
            label: 'ENTREGADO',
            title: ['DISFRUTA', 'TU CAFÉ'],
            icon: 'check_circle'
        },
        burned: {
            color: '#ef4444', // Red
            label: 'CANCELADO',
            title: ['PEDIDO', 'CANCELADO'],
            icon: 'cancel'
        },
        pending: {
            color: '#9ca3af', // Gray
            label: 'PROCESANDO',
            title: ['ENVIANDO', 'PEDIDO'],
            icon: 'pending'
        }
    };

    const currentStatus = statusConfig[order.delivery_status] || statusConfig.pending;
    const accentColor = currentStatus.color;

    return (
        <div className="w-full max-w-sm mx-auto flex flex-col items-center relative min-h-screen bg-black text-white font-sans selection:bg-[#36e27b] selection:text-black pt-8">

            {/* Header / Order Status */}
            <div className="flex flex-col items-center mb-10 z-10 w-full px-6">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-6 backdrop-blur-md"
                    style={{ borderColor: `${accentColor}40`, backgroundColor: `${accentColor}10` }}>
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: accentColor, boxShadow: `0 0 8px ${accentColor}` }} />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: accentColor }}>
                        {currentStatus.label} {' • '} Est. {estimatedMinutes} min
                    </span>
                </div>

                <h1 className="text-4xl font-black italic uppercase tracking-tighter text-center leading-[0.9] mb-1">
                    {currentStatus.title[0]}<br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400"
                        style={{ backgroundImage: `linear-gradient(to right, white, ${accentColor})` }}>
                        {currentStatus.title[1]}
                    </span>
                </h1>

                {/* Status Progress Bar 🚀 */}
                <div className="flex gap-2 mt-8 w-full px-4 mb-4">
                    {['REC', 'PREP', 'LISTO', 'FIN'].map((s, i) => {
                        const states = ['received', 'preparing', 'ready', 'delivered'];
                        const isActive = states.indexOf(order.delivery_status) >= i;
                        const isCurrent = states.indexOf(order.delivery_status) === i;
                        return (
                            <div key={s} className="flex-1 flex flex-col gap-2">
                                <div
                                    className={`h-1.5 rounded-full transition-all duration-700 ${isActive ? 'shadow-2xl' : 'bg-white/10'}`}
                                    style={isActive ? { backgroundColor: accentColor, boxShadow: `0 0 15px ${accentColor}` } : {}}
                                ></div>
                                <span
                                    className={`text-[9px] font-black uppercase tracking-[0.2em] text-center transition-colors duration-500 ${isActive ? '' : 'text-slate-800'}`}
                                    style={isActive ? { color: accentColor, textShadow: isCurrent ? `0 0 8px ${accentColor}40` : 'none' } : {}}
                                >
                                    {s}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Countdown Timer */}
            <div className="flex items-center gap-4 mb-12">
                {timeLeft.minutes === 0 && timeLeft.seconds === 0 ? (
                    <div className="flex flex-col items-center animate-pulse">
                        <span className="material-symbols-outlined text-5xl text-[#36e27b] mb-2">hourglass_top</span>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest text-center">
                            Ultimando<br />Detalles
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="text-center">
                            <span className="text-6xl font-black italic tracking-tighter leading-none" style={{ textShadow: '0 0 20px rgba(54,226,123,0.3)' }}>
                                {String(timeLeft.minutes).padStart(2, '0')}
                            </span>
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-500 mt-2">Minutos</p>
                        </div>
                        <span className="text-4xl font-black text-gray-700 -mt-6">:</span>
                        <div className="text-center">
                            <span className="text-6xl font-black italic tracking-tighter leading-none text-[#36e27b]" style={{ textShadow: '0 0 20px rgba(54,226,123,0.5)' }}>
                                {String(timeLeft.seconds).padStart(2, '0')}
                            </span>
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-500 mt-2">Segundos</p>
                        </div>
                    </>
                )}
            </div>

            {/* QR Card */}
            <div className="relative group w-full px-6 mb-8">
                <div className="absolute inset-0 bg-gradient-to-b from-[#36e27b]/20 to-transparent rounded-[2.5rem] blur-xl opacity-50 group-hover:opacity-75 transition-opacity" />
                <div className="relative bg-[#111] border border-white/10 rounded-[2.5rem] p-8 flex flex-col items-center shadow-2xl overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#36e27b] to-transparent opacity-50" />

                    {/* QR Code Container */}
                    <div className="bg-white p-4 rounded-3xl mb-6 shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                        <QRCode
                            value={order.pickup_code}
                            size={180}
                            viewBox={`0 0 256 256`}
                            fgColor="#000000"
                        />
                    </div>

                    <h2 className="text-2xl font-black italic uppercase tracking-tighter mb-1">Escanea para retirar</h2>
                    <p className="text-[10px] font-medium text-gray-500 text-center uppercase tracking-widest max-w-[200px] leading-relaxed">
                        Presenta este código al barista para recibir tu dosis diaria.
                    </p>

                    <div className="mt-6 pt-6 border-t border-white/5 w-full">
                        <div className="flex flex-col gap-3">
                            {order.order_items?.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center text-sm">
                                    <span className="font-bold text-gray-300">{item.quantity}x <span className="text-white">{item.product?.name || 'Producto'}</span></span>
                                </div>
                            ))}
                            {!order.order_items?.length && <p className="text-xs text-gray-600 italic">Cafe de especialidad</p>}
                        </div>
                    </div>

                    <div className="mt-6 w-full bg-[#36e27b]/5 border border-[#36e27b]/20 rounded-xl p-3 flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-[#36e27b] text-base">stars</span>
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#36e27b]">
                            +{Math.floor((order.total_amount || 0) * 0.1)} Granos Sumados
                        </span>
                    </div>

                    <div className="mt-4">
                        <p className="text-[10px] font-black text-gray-700 uppercase tracking-widest">Orden #{getDisplayId(order)}</p>
                    </div>
                </div>
            </div>

            {/* Bottom Actions are handled by ClientLayout floating nav */}
            <div className="h-24" />
        </div>
    );
};

const getDisplayId = (order: any) => {
    if (order.order_number && Number(order.order_number) > 0) return order.order_number;
    if (order.id && order.id.length >= 4) return order.id.slice(0, 4);
    return '???';
};

export default OrderPickupTicket;
