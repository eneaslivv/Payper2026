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
    theme?: {
        backgroundColor?: string;
        textColor?: string;
        accentColor?: string;
        surfaceColor?: string;
    };
}

export const OrderPickupTicket = ({ order, storeSlug, theme }: OrderPickupTicketProps) => {
    const isDelivered = order.delivery_status === 'delivered';
    const isCancelled = order.delivery_status === 'burned';

    const backgroundColor = theme?.backgroundColor || '#000000';
    const textColor = theme?.textColor || '#FFFFFF';
    const accentColor = theme?.accentColor || '#36e27b';
    // surfaceColor fallback logic
    const isLight = backgroundColor.toLowerCase() === '#ffffff' || backgroundColor.toLowerCase() === '#fff';
    const surfaceColor = theme?.surfaceColor || (isLight ? '#f4f4f5' : '#141714');

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

    // CANCELLED ORDER UI
    if (isCancelled) {
        const cancelledColor = '#ef4444'; // Red
        return (
            <div className="flex flex-col items-center justify-center min-h-screen text-center p-8 relative overflow-hidden animate-in fade-in duration-1000" style={{ backgroundColor, color: textColor }}>
                {/* Background Decorations */}
                <div className="absolute top-[-10%] left-[-20%] w-[60%] h-[40%] blur-[120px] rounded-full" style={{ backgroundColor: `${cancelledColor}1A` }} />
                <div className="absolute bottom-[-10%] right-[-20%] w-[60%] h-[40%] blur-[120px] rounded-full" style={{ backgroundColor: `${cancelledColor}1A` }} />

                {/* Main Cancel Icon */}
                <div className="relative mb-12 z-10">
                    <div className="absolute inset-0 blur-[60px] rounded-full opacity-20 animate-pulse" style={{ backgroundColor: cancelledColor }} />
                    <div className="relative w-32 h-32 rounded-[2.5rem] border flex items-center justify-center shadow-2xl" style={{ backgroundColor: surfaceColor, borderColor: `${textColor}1A` }}>
                        <span className="material-symbols-outlined text-7xl animate-in zoom-in duration-700" style={{ color: cancelledColor }}>cancel</span>
                    </div>
                </div>

                {/* Text Content */}
                <div className="relative z-10 mb-16">
                    <h2 className="text-4xl font-black italic uppercase tracking-[-0.05em] mb-4 leading-[0.85]" style={{ color: textColor }}>
                        PEDIDO<br />
                        <span style={{ color: cancelledColor }}>CANCELADO</span>
                    </h2>
                    <p className="text-sm max-w-xs leading-relaxed" style={{ color: `${textColor}80` }}>
                        Tu pedido ha sido cancelado. Si tienes dudas, contacta al local.
                    </p>
                </div>

                {/* Action Button */}
                <div className="relative z-10 w-full max-w-[280px]">
                    <button
                        onClick={() => {
                            if (storeSlug) {
                                window.location.hash = `/m/${storeSlug}`;
                            } else {
                                const currentHash = window.location.hash;
                                window.location.hash = currentHash.split('/order/')[0];
                            }
                        }}
                        className="group relative w-full py-5 text-black rounded-[2rem] overflow-hidden active:scale-[0.97] transition-all shadow-xl flex items-center justify-center gap-3"
                        style={{ backgroundColor: accentColor, boxShadow: `0 20px 40px ${accentColor}40` }}
                    >
                        <span className="relative text-xs font-black uppercase tracking-[0.15em] italic" style={{ color: '#000' }}>Volver al Menú</span>
                        <span className="material-symbols-outlined relative text-xl font-black" style={{ color: '#000' }}>arrow_forward</span>
                    </button>
                </div>

                {/* Order Reference */}
                <p className="mt-8 text-[10px] font-mono uppercase" style={{ color: `${textColor}40` }}>
                    Orden #{getDisplayId(order)}
                </p>
            </div>
        );
    }

    // DELIVERED ORDER UI
    if (isDelivered) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen text-center p-8 relative overflow-hidden animate-in fade-in duration-1000" style={{ backgroundColor, color: textColor }}>
                {/* Background Decorations 🎨 */}
                <div className="absolute top-[-10%] left-[-20%] w-[60%] h-[40%] blur-[120px] rounded-full" style={{ backgroundColor: `${accentColor}1A` }} />
                <div className="absolute bottom-[-10%] right-[-20%] w-[60%] h-[40%] blur-[120px] rounded-full" style={{ backgroundColor: `${accentColor}1A` }} />
                <div className="absolute inset-0" style={{ background: `radial-gradient(circle at center, ${accentColor}0D 0%, transparent 70%)` }} />

                {/* Main Success Icon 🏆 */}
                <div className="relative mb-12 z-10">
                    <div className="absolute inset-0 blur-[60px] rounded-full opacity-20 animate-pulse" style={{ backgroundColor: accentColor }} />
                    <div className="relative w-32 h-32 rounded-[2.5rem] border flex items-center justify-center shadow-2xl rotate-3" style={{ backgroundColor: surfaceColor, borderColor: `${textColor}1A` }}>
                        <div className="absolute inset-px rounded-[2.4rem] bg-gradient-to-br from-white/5 to-transparent" />
                        <span className="material-symbols-outlined text-7xl drop-shadow-[0_0_15px_rgba(54,226,123,0.5)] animate-in zoom-in duration-700 delay-300" style={{ color: accentColor }}>verified</span>
                    </div>
                </div>

                {/* Text Content 📝 */}
                <div className="relative z-10 mb-16">
                    <h2 className="text-5xl font-black italic uppercase tracking-[-0.05em] mb-4 leading-[0.85]" style={{ color: textColor }}>
                        ¡DISFRUTA<br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#36e27b] to-white"
                            style={{ backgroundImage: `linear-gradient(to right, ${accentColor}, ${textColor})`, textShadow: `0 0 30px ${accentColor}4D` }}>
                            TU CAFÉ!
                        </span>
                    </h2>
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <div className="h-px w-8 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                        <p className="font-black uppercase tracking-[0.3em] text-[10px]" style={{ color: `${textColor}99` }}>Pedido Entregado</p>
                        <div className="h-px w-8 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                    </div>
                </div>

                {/* Action Button 🚀 */}
                <div className="relative z-10 w-full max-w-[280px]">
                    <div className="absolute inset-0 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: `${accentColor}33` }} />
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
                        className="group relative w-full py-5 text-black rounded-[2rem] overflow-hidden active:scale-[0.97] transition-all shadow-xl flex items-center justify-center gap-3"
                        style={{ backgroundColor: accentColor, boxShadow: `0 20px 40px ${accentColor}40` }}
                    >
                        <div className="absolute inset-0 bg-white/30 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                        <span className="relative text-xs font-black uppercase tracking-[0.15em] italic" style={{ color: '#000' }}>Pedir algo más</span>
                        <span className="material-symbols-outlined relative text-xl font-black group-hover:translate-x-1 transition-transform" style={{ color: '#000' }}>arrow_forward</span>
                    </button>

                    <button
                        onClick={() => window.location.reload()}
                        className="mt-6 w-full py-4 text-[10px] font-black uppercase tracking-[0.4em] transition-all"
                        style={{ color: `${textColor}4D` }}
                    >
                        Ver Detalle del Ticket
                    </button>
                </div>

                {/* Bottom Brand Detail */}
                <div className="absolute bottom-12 flex flex-col items-center gap-2 opacity-20">
                    <p className="text-[10px] font-black uppercase tracking-[0.5em]" style={{ color: textColor }}>Coffee Squad</p>
                    <div className="h-1 w-1 rounded-full" style={{ backgroundColor: accentColor }} />
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
    // Status color overrides theme accent color for the status logic specifically
    const statusColor = currentStatus.color;

    return (
        <div className="w-full max-w-sm mx-auto flex flex-col items-center relative min-h-screen font-sans pt-8 transition-colors duration-500" style={{ backgroundColor, color: textColor }}>

            {/* Header / Order Status */}
            <div className="flex flex-col items-center mb-10 z-10 w-full px-6">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-6 backdrop-blur-md"
                    style={{ borderColor: `${statusColor}40`, backgroundColor: `${statusColor}10` }}>
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: statusColor, boxShadow: `0 0 8px ${statusColor}` }} />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: statusColor }}>
                        {currentStatus.label} {' • '} Est. {estimatedMinutes} min
                    </span>
                </div>

                <h1 className="text-4xl font-black italic uppercase tracking-tighter text-center leading-[0.9] mb-1" style={{ color: textColor }}>
                    {currentStatus.title[0]}<br />
                    <span className="text-transparent bg-clip-text"
                        style={{ backgroundImage: `linear-gradient(to right, ${textColor}, ${statusColor})` }}>
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
                                    className={`h-1.5 rounded-full transition-all duration-700 ${isActive ? 'shadow-2xl' : ''}`}
                                    style={isActive
                                        ? { backgroundColor: statusColor, boxShadow: `0 0 15px ${statusColor}` }
                                        : { backgroundColor: `${textColor}1A` }}
                                ></div>
                                <span
                                    className={`text-[9px] font-black uppercase tracking-[0.2em] text-center transition-colors duration-500`}
                                    style={isActive
                                        ? { color: statusColor, textShadow: isCurrent ? `0 0 8px ${statusColor}40` : 'none' }
                                        : { color: `${textColor}40` }}
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
                        <span className="material-symbols-outlined text-5xl mb-2" style={{ color: statusColor }}>hourglass_top</span>
                        <p className="text-sm font-bold uppercase tracking-widest text-center" style={{ color: `${textColor}66` }}>
                            Ultimando<br />Detalles
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="text-center">
                            <span className="text-6xl font-black italic tracking-tighter leading-none" style={{ color: textColor, textShadow: `0 0 20px ${statusColor}33` }}>
                                {String(timeLeft.minutes).padStart(2, '0')}
                            </span>
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] mt-2" style={{ color: `${textColor}66` }}>Minutos</p>
                        </div>
                        <span className="text-4xl font-black -mt-6" style={{ color: `${textColor}40` }}>:</span>
                        <div className="text-center">
                            <span className="text-6xl font-black italic tracking-tighter leading-none" style={{ color: statusColor, textShadow: `0 0 20px ${statusColor}80` }}>
                                {String(timeLeft.seconds).padStart(2, '0')}
                            </span>
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] mt-2" style={{ color: `${textColor}66` }}>Segundos</p>
                        </div>
                    </>
                )}
            </div>

            {/* QR Card */}
            <div className="relative group w-full px-6 mb-8">
                <div className="absolute inset-0 rounded-[2.5rem] blur-xl opacity-50 group-hover:opacity-75 transition-opacity" style={{ background: `linear-gradient(to bottom, ${statusColor}33, transparent)` }} />
                <div className="relative border rounded-[2.5rem] p-8 flex flex-col items-center shadow-2xl overflow-hidden" style={{ backgroundColor: surfaceColor, borderColor: `${textColor}1A` }}>
                    <div className="absolute top-0 left-0 w-full h-1 opacity-50" style={{ background: `linear-gradient(to right, transparent, ${statusColor}, transparent)` }} />

                    {/* QR Code Container */}
                    <div className="bg-white p-4 rounded-3xl mb-6 shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                        <QRCode
                            value={order.pickup_code}
                            size={180}
                            viewBox={`0 0 256 256`}
                            fgColor="#000000"
                        />
                    </div>

                    <h2 className="text-2xl font-black italic uppercase tracking-tighter mb-1" style={{ color: textColor }}>Escanea para retirar</h2>
                    <p className="text-[10px] font-medium text-center uppercase tracking-widest max-w-[200px] leading-relaxed" style={{ color: `${textColor}80` }}>
                        Presenta este código al barista para recibir tu dosis diaria.
                    </p>

                    <div className="mt-6 pt-6 w-full" style={{ borderTop: `1px solid ${textColor}1A` }}>
                        <div className="flex flex-col gap-3">
                            {order.order_items?.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center text-sm">
                                    <span className="font-bold" style={{ color: `${textColor}99` }}>
                                        {item.quantity}x{' '}
                                        <span style={{
                                            color: (item as any).isDeleted ? `${textColor}50` : textColor,
                                            fontStyle: (item as any).isDeleted ? 'italic' : 'normal'
                                        }}>
                                            {item.name || item.product?.name || 'Producto'}
                                        </span>
                                    </span>
                                </div>
                            ))}
                            {!order.order_items?.length && <p className="text-xs italic" style={{ color: `${textColor}80` }}>Cafe de especialidad</p>}
                        </div>
                    </div>

                    <div className="mt-6 w-full rounded-xl p-3 flex items-center justify-center gap-2" style={{ backgroundColor: `${statusColor}10`, borderColor: `${statusColor}33`, borderWidth: 1 }}>
                        <span className="material-symbols-outlined text-base" style={{ color: statusColor }}>stars</span>
                        <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: statusColor }}>
                            +{Math.floor((order.total_amount || 0) * 0.1)} Granos Sumados
                        </span>
                    </div>

                    <div className="mt-4">
                        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: `${textColor}80` }}>Orden #{getDisplayId(order)}</p>
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
