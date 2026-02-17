import React, { useState, useEffect, useRef } from 'react';
import { useOffline } from '../contexts/OfflineContext'; // Import context
import jsQR from 'jsqr';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { markOrderAsDelivered } from '../lib/scanHandler';
import { toast } from 'sonner';

interface ScanOrderModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentStation?: string; // Station to assign when scanning
}

const ScanOrderModal: React.FC<ScanOrderModalProps> = ({ isOpen, onClose, currentStation }) => {
    const { profile } = useAuth();
    const { refreshOrders } = useOffline();

    // Refs
    const inputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // States
    const [scanValue, setScanValue] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'preview' | 'success' | 'error' | 'assigned'>('idle');
    const [scannedOrder, setScannedOrder] = useState<any>(null);
    const [errorMessage, setErrorMessage] = useState('');

    // Active station from localStorage (set by OrderBoard)
    const [activeStation, setActiveStation] = useState<string>(() => {
        return localStorage.getItem('payper_dispatch_station') || 'ALL';
    });

    // Sync with localStorage changes (when OrderBoard changes station)
    useEffect(() => {
        const handleStorageChange = () => {
            const station = localStorage.getItem('payper_dispatch_station') || 'ALL';
            setActiveStation(station);
        };
        window.addEventListener('storage', handleStorageChange);
        // Also sync on modal open
        if (isOpen) {
            handleStorageChange();
        }
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [isOpen]);

    // Input Modes: 'gun' (hidden input, default), 'manual' (visible input), 'camera' (webcam)
    const [inputMode, setInputMode] = useState<'gun' | 'manual' | 'camera'>('gun');
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);

    // Auto-focus input when open & idle & gun/manual mode
    useEffect(() => {
        if (isOpen && status === 'idle' && inputMode !== 'camera' && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen, status, inputMode]);

    // Handle Input Mode Switching
    useEffect(() => {
        if (!isOpen) {
            // Reset on close
            stopCamera();
            setInputMode('gun');
            resetModal();
        }
    }, [isOpen]);

    // Camera Logic
    const startCamera = async () => {
        try {
            setCameraError(null);
            setIsCameraActive(false);

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Hardware incompatible.");
            }

            const constraints = { video: { facingMode: 'environment' }, audio: false };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => {
                    videoRef.current?.play();
                    setIsCameraActive(true);
                    requestAnimationFrame(tick);
                };
                streamRef.current = stream;
            }
        } catch (err: any) {
            console.error("Camera Error:", err);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message?.includes('denied')) {
                setCameraError("PERMISO DENEGADO.");
            } else {
                setCameraError(`FALLO SENSOR: ${err.message || "No detectado"}`);
            }
        }
    };

    const tick = () => {
        if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
            if (inputMode !== 'camera' || !isOpen) return;

            // Draw video frame to canvas
            if (canvasRef.current) {
                const canvas = canvasRef.current;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    canvas.height = videoRef.current.videoHeight;
                    canvas.width = videoRef.current.videoWidth;
                    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

                    // Decode
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const code = jsQR(imageData.data, imageData.width, imageData.height, {
                        inversionAttempts: "dontInvert",
                    });

                    if (code && code.data && status !== 'loading' && status !== 'preview' && status !== 'success') {
                        // Valid QR found
                        setScanValue(code.data); // Update input value for visual feedback
                        handleScanSubmit(undefined, code.data); // Auto-submit
                        return; // Stop loop temporarily while processing?
                    }
                }
            }
        }
        if (inputMode === 'camera' && isOpen) {
            requestAnimationFrame(tick);
        }
    };

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }
        setIsCameraActive(false);
    };

    // Toggle Camera
    useEffect(() => {
        if (isOpen && inputMode === 'camera') {
            startCamera();
        } else {
            stopCamera();
        }
        return () => stopCamera();
    }, [inputMode, isOpen]);

    const resetModal = () => {
        setScanValue('');
        setStatus('idle');
        setScannedOrder(null);
        setErrorMessage('');

        if (inputMode === 'camera') {
            // Reiniciar la cámara completamente
            stopCamera();
            setTimeout(() => {
                if (isOpen && inputMode === 'camera') {
                    startCamera();
                }
            }, 100);
        } else {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    };

    const handleScanSubmit = async (e?: React.FormEvent, manualValue?: string) => {
        e?.preventDefault();
        const codeToProcess = manualValue || scanValue;

        if (!codeToProcess.trim()) return;

        setStatus('loading');
        setErrorMessage('');

        try {
            const code = codeToProcess.trim();
            // Extract UUID if it's a URL (basic check)
            const cleanCode = code.includes('order_') ? code.split('order_')[1] : code;

            console.log("🔍 Scanning code:", code, "Clean:", cleanCode);

            // 1. Fetch Order Details to Preview
            let query = supabase.from('orders').select(`
                *,
                order_items(*)
            `);

            const isNumeric = /^\d+$/.test(cleanCode);
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanCode);

            if (isUUID) {
                console.log("👉 Search by UUID (ID or Pickup Code)");
                query = query.or(`id.eq.${cleanCode},pickup_code.eq.${cleanCode}`);
            } else if (isNumeric) {
                console.log("👉 Search by Order Number (Numeric)");
                // Try strictly order_number first to avoid type casting issues with pickup_code
                query = query.eq('order_number', cleanCode);
            } else {
                console.log("👉 Search by Pickup Code (Text)");
                query = query.eq('pickup_code', cleanCode);
            }

            const { data, error } = await query.maybeSingle();

            console.log("📡 Query Result:", { data, error });
            console.log("🔍 Order Items Array:", data?.order_items);
            console.log("🔍 Order Items Length:", data?.order_items?.length);

            if (error) throw error;

            if (!data) {
                // FALLBACK: If numeric search failed on order_number, try pickup_code?? 
                // Rare case where pickup_code is numbers only.
                setStatus('error');
                setErrorMessage(`Orden no encontrada (Code: ${cleanCode})`);
                return;
            }

            console.log("✅ Order Found:", data.order_number || data.id, "Order ID:", data.id);

            // Hybrid approach from OfflineContext: prioritize order_items, fallback to items JSON
            if (!data.order_items || data.order_items.length === 0) {
                // Try fetching separately
                const { data: orderItems, error: itemsError } = await supabase
                    .from('order_items')
                    .select('*')
                    .eq('order_id', data.id);

                console.log("📦 Fetched Items Separately:", orderItems, "Error:", itemsError);

                if (orderItems && orderItems.length > 0) {
                    data.order_items = orderItems;
                    console.log("✅ Items attached from separate query:", data.order_items.length);
                } else if ((data as any).items) {
                    // Fallback to JSON field if it exists
                    console.log("📦 Using items JSON field:", (data as any).items);
                    data.order_items = (data as any).items;
                } else {
                    console.warn("⚠️ No items found anywhere for this order!");
                }
            }

            // --- ENRICH ITEMS WITH PRODUCT NAMES ---
            if (data.order_items && data.order_items.length > 0) {
                const productIds = data.order_items.map((i: any) => i.product_id).filter(Boolean);

                if (productIds.length > 0) {
                    // Fetch from both tables to be safe
                    const [productsRes, inventoryRes] = await Promise.all([
                        supabase.from('products').select('id, name').in('id', productIds),
                        supabase.from('inventory_items').select('id, name').in('id', productIds)
                    ]);

                    const productMap = new Map();
                    productsRes.data?.forEach((p: any) => productMap.set(p.id, p.name));
                    inventoryRes.data?.forEach((p: any) => productMap.set(p.id, p.name));

                    // Attach names
                    data.order_items = data.order_items.map((item: any) => ({
                        ...item,
                        enriched_name: productMap.get(item.product_id) || item.name || 'Producto desconocido'
                    }));
                }
            }

            // Check current store ownership
            if (profile?.store_id && data.store_id !== profile.store_id) {
                console.warn("⛔ Store Mismatch:", data.store_id, profile.store_id);
                // TEMPORARY BYPASS FOR DEBUGGING
            }

            // Check if already delivered
            if (data.status === 'served') {
                setStatus('error');
                setErrorMessage('Esta orden YA FUE ENTREGADA.');
                setScannedOrder(data);
                return;
            }

            // ============================================
            // TWO-SCAN AUTOMATIC FLOW FOR STATIONS
            // ============================================
            const currentStation = activeStation && activeStation !== 'ALL' ? activeStation : null;
            const orderStation = (data as any).dispatch_station;

            // CASE A: Station selected AND order NOT yet assigned to this station → AUTO-ASSIGN (1st scan)
            if (currentStation && (!orderStation || orderStation !== currentStation)) {
                console.log("📍 FIRST SCAN - Auto-assigning to station:", currentStation);

                const { error: stationError } = await supabase
                    .from('orders' as any)
                    .update({
                        dispatch_station: currentStation,
                        status: 'preparing' // Move to preparing status
                    })
                    .eq('id', data.id);

                if (stationError) {
                    console.warn("⚠️ Could not assign station:", stationError);
                    setStatus('error');
                    setErrorMessage('Error al asignar estación');
                } else {
                    console.log("✅ Order auto-assigned to station:", currentStation);
                    // Show the order details in 'assigned' state instead of 'success'
                    (data as any).dispatch_station = currentStation; // Update local data
                    setScannedOrder(data);
                    setStatus('assigned');
                    toast.success(`📍 #${data.order_number || '---'} → ${currentStation}`, {
                        description: 'Escanea nuevamente para entregar'
                    });
                    await refreshOrders();
                }
                return; // Exit early - show assigned state
            }

            // CASE B: Order already assigned to this station → Show preview for delivery (2nd scan)
            // CASE C: No station selected (ALL view) → Show preview for delivery
            // Both cases fall through to show the preview popup

            setScannedOrder(data);
            setStatus('preview');

        } catch (err: any) {
            console.error('Scan Error:', err);
            setStatus('error');
            setErrorMessage('Error al consultar la orden: ' + err.message);
        }
    };

    const handleConfirmDelivery = async () => {
        if (!scannedOrder) return;

        console.log("🚚 Confirming delivery for:", scannedOrder.pickup_code || scannedOrder.id);

        // Obtener el user ID del usuario autenticado
        const { data: { user } } = await supabase.auth.getUser();
        const staffId = user?.id || profile?.id;

        if (!staffId) {
            console.error("❌ No se pudo obtener el ID del usuario autenticado");
            setStatus('error');
            setErrorMessage('Error: Usuario no autenticado');
            return;
        }

        console.log("👤 Staff ID:", staffId);

        // At this point, we're on the 2nd scan (or ALL view) - just deliver
        const success = await markOrderAsDelivered(scannedOrder.pickup_code || scannedOrder.id, staffId);

        if (success) {
            setStatus('success');
            toast.success(`✅ Orden #${scannedOrder.order_number || '---'} ENTREGADA`);
            await refreshOrders();
            setTimeout(() => {
                resetModal();
            }, 1500);
        } else {
            setStatus('error');
            setErrorMessage('No se pudo confirmar la entrega. Verifica si ya fue procesada.');
        }
    };

    // Global Key Handler for Modal Actions
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Allow Typing in Manual Mode
            if (inputMode === 'manual' && (e.target as HTMLElement).tagName === 'INPUT') return;

            if (e.key === 'Escape') {
                onClose();
            }

            if (status === 'preview' && e.key === 'Enter') {
                handleConfirmDelivery();
            }

            if ((status === 'error' || status === 'success') && e.key === 'Enter') {
                resetModal();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, status, scannedOrder, inputMode]);


    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="relative w-full max-w-lg bg-[#0D0F0D] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >

                {/* Header */}
                <div className="p-6 border-b border-white/[0.04] flex items-center justify-between bg-white/[0.02]">
                    <div>
                        <h2 className="text-xl font-black uppercase italic-black tracking-tight text-white flex items-center gap-2">
                            <span className="material-symbols-outlined text-neon animate-pulse">qr_code_scanner</span>
                            Escáner <span className="text-neon">Rápido</span>
                        </h2>
                        <p className="text-[9px] font-bold text-white/30 uppercase tracking-[0.2em] mt-1">
                            {status === 'idle' ? 'Esperando lectura...' : status === 'preview' ? 'Confirmar Entrega' : 'Procesando'}
                        </p>
                    </div>

                    <div className="flex gap-2">
                        {/* Mode Toggles */}
                        {status === 'idle' && (
                            <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/5 mr-2">
                                <button
                                    onClick={() => setInputMode('gun')}
                                    className={`px-3 py-1 rounded-md text-[9px] font-bold uppercase transition-all ${inputMode === 'gun' ? 'bg-neon text-black' : 'text-white/30 hover:text-white'}`}
                                    title="Modo Pistola (Input Oculto)"
                                >
                                    <span className="material-symbols-outlined text-sm">barcode_reader</span>
                                </button>
                                <button
                                    onClick={() => setInputMode('camera')}
                                    className={`px-3 py-1 rounded-md text-[9px] font-bold uppercase transition-all ${inputMode === 'camera' ? 'bg-neon text-black' : 'text-white/30 hover:text-white'}`}
                                    title="Usar Cámara"
                                >
                                    <span className="material-symbols-outlined text-sm">videocam</span>
                                </button>
                                <button
                                    onClick={() => setInputMode('manual')}
                                    className={`px-3 py-1 rounded-md text-[9px] font-bold uppercase transition-all ${inputMode === 'manual' ? 'bg-neon text-black' : 'text-white/30 hover:text-white'}`}
                                    title="Entrada Manual"
                                >
                                    <span className="material-symbols-outlined text-sm">keyboard</span>
                                </button>
                            </div>
                        )}

                        <button onClick={onClose} className="size-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all">
                            <span className="material-symbols-outlined text-lg">close</span>
                        </button>
                    </div>
                </div>

                {/* Content Body */}
                <div className="p-8 flex-1 overflow-y-auto min-h-[350px] flex flex-col items-center justify-center relative">

                    {/* CAMERA LAYER */}
                    {inputMode === 'camera' && status === 'idle' && (
                        <div className="absolute inset-0 z-0 bg-black">
                            <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover opacity-60`} />
                            <canvas ref={canvasRef} className="hidden" />
                            {/* Overlay */}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="size-48 border-2 border-neon/50 rounded-3xl relative">
                                    <div className="absolute top-0 left-0 size-4 border-t-4 border-l-4 border-neon -mt-1 -ml-1"></div>
                                    <div className="absolute top-0 right-0 size-4 border-t-4 border-r-4 border-neon -mt-1 -mr-1"></div>
                                    <div className="absolute bottom-0 left-0 size-4 border-b-4 border-l-4 border-neon -mb-1 -ml-1"></div>
                                    <div className="absolute bottom-0 right-0 size-4 border-b-4 border-r-4 border-neon -mb-1 -mr-1"></div>
                                    <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-500/50 shadow-[0_0_10px_red]"></div>
                                </div>
                            </div>
                            {cameraError && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
                                    <p className="text-red-500 font-bold uppercase">{cameraError}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* IDLE STATE (GUN/MANUAL) */}
                    {status === 'idle' && inputMode !== 'camera' && (
                        <div className="flex flex-col items-center text-center w-full max-w-xs animate-in fade-in zoom-in-95">

                            {inputMode === 'gun' ? (
                                <>
                                    <div className="size-24 border-4 border-dashed border-white/10 rounded-3xl flex items-center justify-center mb-6 animate-pulse">
                                        <span className="material-symbols-outlined text-4xl text-white/20">barcode_reader</span>
                                    </div>
                                    <p className="text-sm font-bold text-white uppercase tracking-widest">Escanea el código ahora</p>
                                    <p className="text-[10px] text-white/30 mt-2">El sistema detectará automáticamente el pedido.</p>

                                    {/* Hidden form acting as listener */}
                                    <form onSubmit={(e) => handleScanSubmit(e)} className="absolute opacity-0 pointer-events-none">
                                        <input ref={inputRef} value={scanValue} onChange={e => setScanValue(e.target.value)} onBlur={() => setTimeout(() => inputRef.current?.focus(), 100)} autoComplete="off" />
                                    </form>
                                </>
                            ) : (
                                <div className="w-full">
                                    <label className="text-[9px] font-black text-white/40 uppercase tracking-widest block mb-2 text-left">Ingresar Código Manualmente</label>
                                    <div className="flex gap-2">
                                        <input
                                            ref={inputRef}
                                            value={scanValue}
                                            onChange={e => setScanValue(e.target.value)}
                                            className="flex-1 bg-white/5 border border-white/10 rounded-xl h-12 px-4 text-white font-mono text-center uppercase focus:border-neon/50 outline-none"
                                            placeholder="Ej: ORDER_123"
                                            onKeyDown={(e) => e.key === 'Enter' && handleScanSubmit(e as any)}
                                        />
                                        <button
                                            onClick={() => handleScanSubmit()}
                                            className="px-4 bg-neon text-black rounded-xl font-bold uppercase hover:bg-neon/90"
                                        >
                                            <span className="material-symbols-outlined">arrow_forward</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {status === 'loading' && (
                        <div className="flex flex-col items-center z-10">
                            <span className="material-symbols-outlined text-4xl text-neon animate-spin mb-4">sync</span>
                            <p className="text-xs font-bold text-neon uppercase tracking-widest">Buscando Orden...</p>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="text-center w-full z-10">
                            <div className="size-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4 text-red-500 border border-red-500/20">
                                <span className="material-symbols-outlined text-3xl">error_outline</span>
                            </div>
                            <h3 className="text-lg font-black text-white uppercase mb-2">Error de Lectura</h3>
                            <p className="text-xs font-medium text-red-400 mb-8">{errorMessage}</p>

                            {scannedOrder && (
                                <div className="bg-white/5 p-4 rounded-xl border border-white/5 text-left mb-6 opacity-50 grayscale">
                                    <p className="text-[10px] text-white/40 uppercase tracking-widest mb-1">Orden Detectada</p>
                                    <p className="text-lg font-black text-white">#{scannedOrder.order_number}</p>
                                </div>
                            )}

                            <button onClick={resetModal} className="px-6 py-3 rounded-xl bg-white/10 text-white font-bold text-xs uppercase tracking-widest hover:bg-white/20 transition-all">
                                Intentar de nuevo (Enter)
                            </button>
                        </div>
                    )}

                    {status === 'success' && (
                        <div className="text-center w-full z-10">
                            <div className="size-24 rounded-full bg-neon/10 flex items-center justify-center mx-auto mb-6 text-neon border-2 border-neon shadow-[0_0_50px_rgba(74,222,128,0.3)] animate-pulse">
                                <span className="material-symbols-outlined text-5xl">task_alt</span>
                            </div>
                            <h3 className="text-3xl font-black text-neon uppercase italic-black tracking-tighter mb-2">¡Pedido Entregado!</h3>
                            {scannedOrder?.order_number && (
                                <p className="text-lg font-bold text-white/60 mb-4">Orden #{scannedOrder.order_number}</p>
                            )}
                            <p className="text-xs font-medium text-white/40 mb-8 uppercase tracking-widest">El cliente ha sido notificado</p>

                            <button
                                onClick={resetModal}
                                className="px-8 py-4 rounded-xl bg-neon text-black font-black text-sm uppercase tracking-widest hover:bg-neon/90 transition-all shadow-lg shadow-neon/20 hover:scale-105 active:scale-95"
                            >
                                <span className="flex items-center gap-2">
                                    <span className="material-symbols-outlined">qr_code_scanner</span>
                                    Escanear Siguiente
                                </span>
                            </button>
                        </div>
                    )}

                    {/* ASSIGNED STATE - First scan from station */}
                    {status === 'assigned' && scannedOrder && (
                        <div className="w-full space-y-6 animate-in slide-in-from-bottom-4 duration-300 z-10 relative">
                            {/* Assigned Banner */}
                            <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 flex items-center gap-4">
                                <div className="size-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-blue-400 text-2xl">location_on</span>
                                </div>
                                <div>
                                    <p className="text-blue-400 font-black uppercase text-sm">Pedido Asignado</p>
                                    <p className="text-blue-300/60 text-[10px] uppercase tracking-widest">Escanea nuevamente para confirmar entrega</p>
                                </div>
                            </div>

                            {/* Order Summary Card */}
                            <div className="bg-[#1A1C1A] border border-white/10 rounded-2xl p-5 shadow-2xl">
                                <div className="flex justify-between items-start mb-4 border-b border-white/5 pb-4">
                                    <div>
                                        <p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest mb-1">En Proceso</p>
                                        <h3 className="text-3xl font-black text-white italic-black tracking-tighter">#{scannedOrder.order_number}</h3>
                                        {scannedOrder.customer_name && (
                                            <p className="text-[10px] text-white/50 uppercase font-bold mt-1 max-w-[150px] truncate">
                                                {scannedOrder.customer_name}
                                            </p>
                                        )}
                                    </div>
                                    <div className="px-3 py-1 rounded-lg border bg-blue-500/10 text-blue-400 border-blue-500/20 text-[9px] font-black uppercase tracking-widest">
                                        {(scannedOrder as any).dispatch_station || activeStation}
                                    </div>
                                </div>

                                {/* Items */}
                                <div className="bg-black/20 rounded-xl p-3 max-h-[150px] overflow-y-auto custom-scrollbar space-y-2">
                                    {scannedOrder.order_items && scannedOrder.order_items.length > 0 ? (
                                        scannedOrder.order_items.map((item: any, idx: number) => (
                                            <div key={`order-item-${item.id || item.product_id || `${item.name}-${idx}`}`} className="flex justify-between text-sm py-1 border-b border-white/5 last:border-0 items-center">
                                                <div className="flex items-center gap-2 flex-1">
                                                    <span className="size-5 rounded bg-white/10 flex items-center justify-center text-[10px] font-black text-white">{item.quantity}</span>
                                                    <span className="text-white/80 font-medium text-xs truncate max-w-[180px]">
                                                        {(item as any).enriched_name || item.name || 'Producto desconocido'}
                                                    </span>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-white/40 text-xs text-center py-4">Sin productos</p>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={resetModal}
                                    className="py-4 rounded-xl bg-white/5 text-white/40 font-black text-[10px] uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all"
                                >
                                    Escanear Otro
                                </button>
                                <button
                                    onClick={onClose}
                                    className="py-4 rounded-xl bg-blue-500/20 text-blue-400 font-black text-[10px] uppercase tracking-widest hover:bg-blue-500/30 transition-all"
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    )}

                    {status === 'preview' && scannedOrder && (
                        <div className="w-full space-y-6 animate-in slide-in-from-bottom-4 duration-300 z-10 relative">
                            {/* Order Summary Card */}
                            <div className="bg-[#1A1C1A] border border-white/10 rounded-2xl p-5 shadow-2xl">
                                <div className="flex justify-between items-start mb-4 border-b border-white/5 pb-4">
                                    <div>
                                        <p className="text-[9px] font-bold text-neon uppercase tracking-widest mb-1">Orden Activa</p>
                                        <h3 className="text-3xl font-black text-white italic-black tracking-tighter">#{scannedOrder.order_number}</h3>
                                        {scannedOrder.customer_name && (
                                            <p className="text-[10px] text-white/50 uppercase font-bold mt-1 max-w-[150px] truncate">
                                                {scannedOrder.customer_name}
                                            </p>
                                        )}
                                    </div>
                                    <div className={`px-3 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${scannedOrder.is_paid ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                                        {scannedOrder.is_paid ? 'PAGADO' : 'PENDIENTE'}
                                    </div>
                                </div>
                            </div>

                            {/* Metadata Row */}
                            <div className="flex gap-2 mb-3 flex-wrap">
                                {scannedOrder.created_at && (
                                    <div className="bg-black/30 px-3 py-1.5 rounded-lg border border-white/5 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-white/40 text-sm">schedule</span>
                                        <span className="text-[10px] font-bold text-white/60 uppercase">
                                            {new Date(scannedOrder.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                )}
                                {scannedOrder.delivery_method && (
                                    <div className="bg-black/30 px-3 py-1.5 rounded-lg border border-white/5 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-white/40 text-sm">
                                            {scannedOrder.delivery_method === 'mesa' ? 'table_restaurant' : 'shopping_bag'}
                                        </span>
                                        <span className="text-[10px] font-bold text-white/60 uppercase">
                                            {scannedOrder.delivery_method === 'mesa' ? `Mesa ${scannedOrder.table_number || '?'}` : 'Para Llevar'}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="bg-black/20 rounded-xl p-3 max-h-[150px] overflow-y-auto custom-scrollbar space-y-2 mb-2">
                                {scannedOrder.order_items && scannedOrder.order_items.length > 0 ? (
                                    scannedOrder.order_items.map((item: any, idx: number) => (
                                        <div key={`scan-item-${item.id || item.product_id || `${item.name}-${idx}`}`} className="flex justify-between text-sm py-1 border-b border-white/5 last:border-0 items-center">
                                            <div className="flex items-center gap-2 flex-1">
                                                <span className="size-5 rounded bg-white/10 flex items-center justify-center text-[10px] font-black text-white">{item.quantity}</span>
                                                <span className="text-white/80 font-medium text-xs truncate max-w-[180px]">
                                                    {(item as any).enriched_name || item.name || 'Producto desconocido'}
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-8">
                                        <span className="material-symbols-outlined text-white/20 text-3xl mb-2 block">shopping_cart_off</span>
                                        <p className="text-white/40 text-xs">Sin productos detectados</p>
                                        <p className="text-white/20 text-[10px] mt-1">Consulta con soporte técnico</p>
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={resetModal}
                                    className="py-4 rounded-xl bg-white/5 text-white/40 font-black text-[10px] uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all"
                                >
                                    Cancelar (Esc)
                                </button>
                                <button
                                    onClick={handleConfirmDelivery}
                                    className="py-4 rounded-xl bg-neon text-black font-black text-[10px] uppercase tracking-widest shadow-lg shadow-neon/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 group"
                                >
                                    <span>Confirmar Entrega</span>
                                    <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
                                </button>
                            </div>
                            <div className="text-center">
                                <span className="text-[8px] text-white/20 uppercase tracking-widest">Presiona ENTER para procesar</span>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div >
    );
};

export default ScanOrderModal;
