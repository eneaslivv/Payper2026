import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ToastSystem';
import { Invoice, InvoiceItem, InvoiceStatus, InventoryItem } from '../types';
import { supabase } from '../lib/supabase';

// Status badge config
const statusConfig: Record<InvoiceStatus, { label: string; color: string; animate?: boolean }> = {
    pending: { label: 'Pendiente', color: 'bg-white/10 text-white/50' },
    processing: { label: 'Procesando...', color: 'bg-neon/20 text-neon', animate: true },
    extracted: { label: 'Listo', color: 'bg-blue-500/20 text-blue-400' },
    confirmed: { label: 'Confirmado', color: 'bg-neon/20 text-neon' },
    error: { label: 'Error', color: 'bg-red-500/20 text-red-400' }
};

interface InvoiceProcessorProps {
    isOpen?: boolean;
    onClose?: () => void;
}

const InvoiceProcessor: React.FC<InvoiceProcessorProps> = ({ isOpen = true, onClose }) => {
    const { profile } = useAuth();
    const { addToast } = useToast();

    // State
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
    const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const getAuthHeaders = () => {
        const storageKey = 'sb-yjxjyxhksedwfeueduwl-auth-token';
        const storedData = localStorage.getItem(storageKey);
        let token = '';
        if (storedData) {
            try {
                const parsed = JSON.parse(storedData);
                token = parsed.access_token || '';
            } catch (e) { }
        }
        const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        return {
            'Content-Type': 'application/json',
            'apikey': apiKey,
            'Authorization': token ? `Bearer ${token}` : `Bearer ${apiKey}`
        };
    };

    const fetchData = async (isBackground = false) => {
        const storeId = profile?.store_id || 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533';
        if (!isBackground) setLoading(true);

        try {
            const baseUrl = 'https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1';
            const headers = getAuthHeaders();

            // Fetch invoices
            const invoicesRes = await fetch(
                `${baseUrl}/invoices?store_id=eq.${storeId}&order=created_at.desc&limit=20`,
                { headers }
            );
            if (invoicesRes.ok) {
                const data = await invoicesRes.json();
                setInvoices(data || []);
            }

            // Fetch inventory items
            const inventoryRes = await fetch(
                `${baseUrl}/inventory_items?store_id=eq.${storeId}`,
                { headers }
            );
            if (inventoryRes.ok) {
                const data = await inventoryRes.json();
                setInventoryItems(data || []);
            }

            // Fetch categories
            const categoriesRes = await fetch(
                `${baseUrl}/categories?store_id=eq.${storeId}&order=position.asc`,
                { headers }
            );
            if (categoriesRes.ok) {
                const data = await categoriesRes.json();
                setCategories(data || []);
            }

        } catch (err: any) {
            console.error('Fetch error:', err);
        } finally {
            if (!isBackground) setLoading(false);
        }
    };

    const handleFileUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) return;

        const storeId = profile?.store_id; // Asegúrate de tener el storeId del contexto
        if (!storeId) {
            addToast('No se encontró el ID de la tienda', 'error');
            return;
        }

        setUploading(true);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) {
                addToast(`Archivo no soportado: ${file.name}`, 'error');
                continue;
            }

            try {
                const ext = file.name.split('.').pop();
                const fileName = `${storeId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

                // 1. Subir imagen a Storage (Bucket 'invoices-files')
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('invoices-files')
                    .upload(fileName, file);

                if (uploadError) throw uploadError;

                // Get public URL for downstream processing (IA)
                const { data: { publicUrl } } = supabase.storage
                    .from('invoices-files')
                    .getPublicUrl(uploadData.path);

                // 2. Crear registro en BD (Esto activará el RLS que acabamos de crear)
                const { data: invoiceDataArr, error: dbError } = await supabase
                    .from('invoices' as any)
                    .insert({
                        store_id: storeId, // <--- CRÍTICO: Usar store_id, no tenant_id
                        image_url: uploadData.path,
                        status: 'processing',
                        proveedor: '',
                        fecha_factura: new Date().toISOString().split('T')[0],
                        nro_factura: '',
                        subtotal: 0,
                        iva_total: 0,
                        total: 0
                    })
                    .select();

                if (dbError) throw dbError;

                const invoiceData = (invoiceDataArr as any)[0];

                setInvoices(prev => [invoiceData, ...prev]);
                addToast(`Documento añadido`, 'success');

                // Auto-process
                processInvoice(invoiceData.id, publicUrl);

            } catch (err: any) {
                console.error('Upload error:', err);
                addToast(`Error: ${err.message}`, 'error');
            }
        }

        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const processInvoice = async (invoiceId: string, imageUrl: string) => {
        setInvoices(prev => prev.map(inv =>
            inv.id === invoiceId ? { ...inv, status: 'processing' as InvoiceStatus } : inv
        ));

        try {
            console.log('[ProcessInvoice] Starting with:', { invoiceId, imageUrl });

            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-invoice`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                    },
                    body: JSON.stringify({ invoice_id: invoiceId, image_url: imageUrl })
                }
            );

            const responseText = await response.text();
            console.log('[ProcessInvoice] Response:', response.status, responseText);

            if (!response.ok) {
                throw new Error(`Processing failed: ${response.status} - ${responseText}`);
            }

            await fetchInvoiceDetails(invoiceId);
            addToast('✅ Procesado con IA', 'success');

        } catch (err: any) {
            console.error('[ProcessInvoice] Error:', err);
            addToast(`Error: ${err.message}`, 'error');
            setInvoices(prev => prev.map(inv =>
                inv.id === invoiceId ? { ...inv, status: 'error' as InvoiceStatus } : inv
            ));
        }
    };

    const fetchInvoiceDetails = async (invoiceId: string) => {
        try {
            const baseUrl = 'https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1';
            const headers = getAuthHeaders();

            const invoiceRes = await fetch(`${baseUrl}/invoices?id=eq.${invoiceId}`, { headers });
            const invoiceData = await invoiceRes.json();

            const itemsRes = await fetch(`${baseUrl}/invoice_items?invoice_id=eq.${invoiceId}`, { headers });
            const itemsData = await itemsRes.json();

            if (invoiceData && invoiceData.length > 0) {
                const invoice = { ...invoiceData[0], items: itemsData || [] };
                setInvoices(prev => prev.map(inv => inv.id === invoiceId ? invoice : inv));
                if (selectedInvoice?.id === invoiceId) {
                    setSelectedInvoice(invoice);
                }
            }
        } catch (err) {
            console.error('Fetch details error:', err);
        }
    };

    const handleSelectInvoice = async (invoice: Invoice) => {
        if (!invoice.items) {
            await fetchInvoiceDetails(invoice.id);
            const updated = invoices.find(i => i.id === invoice.id);
            setSelectedInvoice(updated || invoice);
        } else {
            setSelectedInvoice(invoice);
        }
    };

    const updateItemField = (itemId: string, field: keyof InvoiceItem, value: any) => {
        if (!selectedInvoice?.items) return;

        const updatedItems = selectedInvoice.items.map(item => {
            if (item.id === itemId) {
                const updated = { ...item, [field]: value };
                if (field === 'quantity' || field === 'unit_price') {
                    const qty = field === 'quantity' ? value : item.quantity;
                    const price = field === 'unit_price' ? value : item.unit_price;
                    const bonif = item.bonification || 0;
                    updated.total_line = qty * price * (1 - bonif / 100);
                }
                return updated;
            }
            return item;
        });

        setSelectedInvoice({ ...selectedInvoice, items: updatedItems });
    };

    const removeItem = (itemId: string) => {
        if (!selectedInvoice?.items) return;
        const updatedItems = selectedInvoice.items.filter(item => item.id !== itemId);
        setSelectedInvoice({ ...selectedInvoice, items: updatedItems });
    };

    const handleConfirmImport = async () => {
        if (!selectedInvoice?.items || selectedInvoice.items.length === 0) return;

        setConfirming(true);
        const storeId = profile?.store_id || 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533';
        const headers = { ...getAuthHeaders(), 'Prefer': 'return=representation' };

        try {
            for (const item of selectedInvoice.items) {
                let finalInventoryId = item.matched_inventory_id;

                // 1. Si ya tiene match, actualizamos stock vía RPC (Trazable)
                if (finalInventoryId) {
                    const existingItem = inventoryItems.find(i => i.id === finalInventoryId);
                    if (existingItem) {
                        // Buscamos la ubicación de destino (por ahora Depósito o la ubicación predeterminada)
                        const { data: defaultLoc } = await supabase
                            .from('storage_locations')
                            .select('id')
                            .eq('store_id', storeId)
                            .eq('is_default', true)
                            .single();

                        const targetLoc = defaultLoc?.id;

                        if (targetLoc) {
                            await supabase.rpc('transfer_stock', {
                                p_item_id: finalInventoryId,
                                p_from_location_id: null,
                                p_to_location_id: targetLoc,
                                p_quantity: item.quantity,
                                p_user_id: profile?.id || '',
                                p_notes: `Compra de ${selectedInvoice.proveedor} (Factura ${selectedInvoice.nro_factura})`,
                                p_movement_type: 'PURCHASE',
                                p_reason: 'Reposición de Stock'
                            });
                        } else {
                            // Fallback (solo si no hay ubicaciones, aunque el Trigger sync_inventory_item_total_stock requiere item_stock_levels)
                            console.warn('No se encontró ubicación predeterminada para la compra');
                        }
                    }
                }
                // 2. Si NO tiene match, CREAMOS el item nuevo (y luego impactamos stock)
                else {
                    const categoryId = item.category_id || (categories.length > 0 ? categories[0].id : null);

                    const { data: createdItems, error: createError } = await supabase
                        .from('inventory_items')
                        .insert({
                            store_id: storeId,
                            name: item.name,
                            sku: `ITEM-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
                            current_stock: 0,
                            item_type: 'ingredient',
                            unit_type: item.unit || 'unit',
                            min_stock: 5,
                            category_id: categoryId
                        })
                        .select();

                    if (createError) throw createError;

                    if (createdItems && createdItems.length > 0) {
                        finalInventoryId = createdItems[0].id;

                        // Impactamos el stock inicial de la compra
                        const { data: defaultLoc } = await supabase
                            .from('storage_locations')
                            .select('id')
                            .eq('store_id', storeId)
                            .eq('is_default', true)
                            .single();

                        if (defaultLoc?.id) {
                            await supabase.rpc('transfer_stock', {
                                p_item_id: finalInventoryId,
                                p_from_location_id: null,
                                p_to_location_id: defaultLoc.id,
                                p_quantity: item.quantity,
                                p_user_id: profile?.id || '',
                                p_notes: `Carga inicial por compra: ${selectedInvoice.proveedor}`,
                                p_movement_type: 'PURCHASE',
                                p_reason: 'Carga inicial'
                            });
                        }
                    }
                }

                // 3. Importante: Actualizamos el item de la factura con el ID del inventario (sea nuevo o existente)
                if (finalInventoryId) {
                    await fetch(
                        `https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/invoice_items?id=eq.${item.id}`,
                        {
                            method: 'PATCH',
                            headers: getAuthHeaders(),
                            body: JSON.stringify({
                                matched_inventory_id: finalInventoryId,
                                is_new_item: !item.matched_inventory_id // saved as new if it wasn't matched initially
                            })
                        }
                    );
                }
            }

            // 4. Marcar factura como confirmada
            await fetch(
                `https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/invoices?id=eq.${selectedInvoice.id}`,
                { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ status: 'confirmed', confirmed_at: new Date().toISOString() }) }
            );

            addToast('✅ Importación confirmada y stock actualizado', 'success');

            // Optimistic Update: Remove invoice from list and clear selection
            setInvoices(prev => prev.filter(inv => inv.id !== selectedInvoice.id));
            setSelectedInvoice(null);

            // Refresh data in background without spinner
            await fetchData(true);

        } catch (err: any) {
            console.error('Confirm error:', err);
            addToast('Error: ' + err.message, 'error');
        } finally {
            setConfirming(false);
        }
    };

    const handleDiscardAll = () => {
        if (!selectedInvoice) return;
        if (confirm('¿Descartar todos los items de esta factura?')) {
            setSelectedInvoice({ ...selectedInvoice, items: [] });
        }
    };

    const handleDeleteInvoice = async (invoiceId: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Evitar seleccionar la factura
        if (!confirm('¿Eliminar esta factura de la cola?')) return;

        try {
            const headers = getAuthHeaders();
            // Eliminar items primero
            await fetch(
                `https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/invoice_items?invoice_id=eq.${invoiceId}`,
                { method: 'DELETE', headers }
            );
            // Eliminar factura
            await fetch(
                `https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/invoices?id=eq.${invoiceId}`,
                { method: 'DELETE', headers }
            );

            setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
            if (selectedInvoice?.id === invoiceId) {
                setSelectedInvoice(null);
            }
            addToast('Factura eliminada', 'success');
        } catch (err: any) {
            addToast('Error: ' + err.message, 'error');
        }
    };

    // Filtrar facturas confirmadas de la cola
    const pendingInvoices = invoices.filter(inv => inv.status !== 'confirmed');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[5060] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-[#0D0F0D] border border-white/10 rounded-3xl w-full max-w-6xl h-[85vh] flex flex-col animate-in zoom-in-95 duration-300 shadow-2xl overflow-hidden">

                {/* HEADER */}
                <header className="px-6 py-4 border-b border-white/[0.04] flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-tighter">
                            <span className="text-white">INGESTA</span>{' '}
                            <span className="text-neon">SUMINISTRO</span>
                        </h1>
                        <p className="text-white/30 text-[9px] uppercase tracking-[0.2em] mt-0.5">
                            Procesamiento masivo de facturas
                        </p>
                    </div>
                    <button
                        onClick={onClose || (() => window.history.back())}
                        className="size-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all"
                    >
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                </header>

                {/* MAIN CONTENT */}
                <div className="flex-1 flex overflow-hidden">

                    {/* LEFT PANEL - Queue */}
                    <div className="w-80 flex-shrink-0 border-r border-white/[0.04] flex flex-col">
                        <div className="p-4 border-b border-white/[0.04]">
                            <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest">
                                Documentos en Cola
                            </h3>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                            {loading ? (
                                <div className="flex items-center gap-3 p-4">
                                    <div className="size-5 border-2 border-t-neon border-white/10 rounded-full animate-spin"></div>
                                    <span className="text-white/40 text-sm">Cargando...</span>
                                </div>
                            ) : pendingInvoices.length === 0 ? (
                                <div className="text-center py-8 text-white/20 text-xs">
                                    Sin documentos pendientes
                                </div>
                            ) : (
                                pendingInvoices.map(invoice => {
                                    const status = statusConfig[invoice.status];
                                    const isSelected = selectedInvoice?.id === invoice.id;

                                    return (
                                        <div
                                            key={invoice.id}
                                            onClick={() => handleSelectInvoice(invoice)}
                                            className={`p-3 rounded-xl border cursor-pointer transition-all group relative ${isSelected
                                                ? 'bg-neon/5 border-neon/30'
                                                : 'bg-black/30 border-white/5 hover:border-white/10'
                                                }`}
                                        >
                                            {/* Botón eliminar */}
                                            <button
                                                onClick={(e) => handleDeleteInvoice(invoice.id, e)}
                                                className="absolute top-2 right-2 size-6 rounded-lg bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-white/20 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                <span className="material-symbols-outlined text-sm">close</span>
                                            </button>

                                            <div className="flex items-center gap-3">
                                                {status.animate ? (
                                                    <div className="size-4 border-2 border-t-neon border-white/10 rounded-full animate-spin"></div>
                                                ) : (
                                                    <div className={`size-3 rounded-full ${invoice.status === 'extracted' ? 'bg-neon' : invoice.status === 'error' ? 'bg-red-500' : 'bg-white/20'}`}></div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-white font-bold text-sm truncate">
                                                        {invoice.proveedor || 'Sin proveedor'}
                                                    </p>
                                                    <p className="text-white/30 text-[9px] truncate">
                                                        {invoice.items?.length || 0} items
                                                    </p>
                                                </div>
                                                <span className="text-neon font-bold text-xs">
                                                    ${invoice.total?.toLocaleString('es-AR', { minimumFractionDigits: 0 }) || '0'}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Add Button */}
                    <div className="p-3 border-t border-white/[0.04]">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,application/pdf"
                            multiple
                            className="hidden"
                            onChange={(e) => handleFileUpload(e.target.files)}
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="w-full py-3 rounded-xl border-2 border-dashed border-white/10 text-white/40 font-bold text-[10px] uppercase tracking-widest hover:border-neon/30 hover:text-neon/60 transition-all disabled:opacity-50"
                        >
                            {uploading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="size-4 border-2 border-t-neon border-neon/20 rounded-full animate-spin"></span>
                                    Subiendo...
                                </span>
                            ) : (
                                '+ Añadir Otro'
                            )}
                        </button>
                    </div>
                </div>

                {/* RIGHT PANEL - Editor */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {!selectedInvoice ? (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center">
                                <div className="size-20 mx-auto mb-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-center">
                                    <span className="material-symbols-outlined text-4xl text-white/10">description</span>
                                </div>
                                <p className="text-white/20 text-sm font-bold uppercase tracking-widest">
                                    Selecciona un documento
                                </p>
                                <p className="text-white/10 text-xs mt-1">
                                    para editar
                                </p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Invoice Header Cards */}
                            <div className="grid grid-cols-4 gap-3 p-4 border-b border-white/[0.04]">
                                <div className="bg-black/30 rounded-xl p-4 border border-white/5">
                                    <label className="text-[8px] font-black text-neon/60 uppercase tracking-widest block mb-1">Proveedor</label>
                                    <input
                                        type="text"
                                        value={selectedInvoice.proveedor || ''}
                                        onChange={(e) => setSelectedInvoice({ ...selectedInvoice, proveedor: e.target.value })}
                                        className="w-full bg-transparent text-white font-bold text-lg outline-none"
                                        placeholder="..."
                                    />
                                </div>
                                <div className="bg-black/30 rounded-xl p-4 border border-white/5">
                                    <label className="text-[8px] font-black text-white/30 uppercase tracking-widest block mb-1">Total Factura</label>
                                    <p className="text-white font-bold text-lg">$ {selectedInvoice.total?.toLocaleString('es-AR', { minimumFractionDigits: 2 }) || '0.00'}</p>
                                </div>
                                <div className="bg-black/30 rounded-xl p-4 border border-white/5">
                                    <label className="text-[8px] font-black text-white/30 uppercase tracking-widest block mb-1">Impuestos (IVA)</label>
                                    <p className="text-white font-bold text-lg">$ {selectedInvoice.iva_total?.toLocaleString('es-AR', { minimumFractionDigits: 2 }) || '0.00'}</p>
                                </div>
                                <div className="bg-black/30 rounded-xl p-4 border border-white/5">
                                    <label className="text-[8px] font-black text-white/30 uppercase tracking-widest block mb-1">Fecha</label>
                                    <input
                                        type="date"
                                        value={selectedInvoice.fecha_factura || ''}
                                        onChange={(e) => setSelectedInvoice({ ...selectedInvoice, fecha_factura: e.target.value })}
                                        className="w-full bg-transparent text-white font-bold text-lg outline-none"
                                    />
                                </div>
                            </div>

                            {/* Items Table */}
                            <div className="flex-1 overflow-auto p-4">
                                {!selectedInvoice.items || selectedInvoice.items.length === 0 ? (
                                    <div className="flex items-center justify-center h-full">
                                        {selectedInvoice.status === 'processing' ? (
                                            <div className="flex items-center gap-3">
                                                <div className="size-6 border-2 border-t-neon border-white/10 rounded-full animate-spin"></div>
                                                <span className="text-white/40">Procesando con IA...</span>
                                            </div>
                                        ) : (
                                            <span className="text-white/20">Sin items</span>
                                        )}
                                    </div>
                                ) : (
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-white/[0.04]">
                                                <th className="text-left text-[8px] font-black text-white/30 uppercase tracking-widest px-3 py-3 w-28">Categoría</th>
                                                <th className="text-left text-[8px] font-black text-white/30 uppercase tracking-widest px-3 py-3">Producto</th>
                                                <th className="text-center text-[8px] font-black text-white/30 uppercase tracking-widest px-3 py-3 w-16">Cant.</th>
                                                <th className="text-center text-[8px] font-black text-white/30 uppercase tracking-widest px-3 py-3 w-16">% Bonif.</th>
                                                <th className="text-right text-[8px] font-black text-white/30 uppercase tracking-widest px-3 py-3 w-24">P. Unit Neto</th>
                                                <th className="text-right text-[8px] font-black text-neon/60 uppercase tracking-widest px-3 py-3 w-24">P. Unit c/IVA</th>
                                                <th className="text-right text-[8px] font-black text-white/30 uppercase tracking-widest px-3 py-3 w-24">Importe ($)</th>
                                                <th className="w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedInvoice.items.map((item, idx) => (
                                                <tr key={item.id || idx} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                                                    <td className="px-3 py-3">
                                                        <select
                                                            className="w-full bg-[#1a1a1a] text-white/60 text-xs outline-none cursor-pointer rounded px-2 py-1 border border-white/10"
                                                            value={item.category_id || ''}
                                                            onChange={(e) => updateItemField(item.id, 'category_id', e.target.value)}
                                                            style={{ colorScheme: 'dark' }}
                                                        >
                                                            <option value="" className="bg-[#1a1a1a] text-white/40">Cat...</option>
                                                            {categories.map(c => (
                                                                <option key={c.id} value={c.id} className="bg-[#1a1a1a] text-white">{c.name}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <input
                                                            type="text"
                                                            value={item.name}
                                                            onChange={(e) => updateItemField(item.id, 'name', e.target.value)}
                                                            className="w-full bg-transparent text-white font-bold text-sm outline-none"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        <input
                                                            type="number"
                                                            value={item.quantity}
                                                            onChange={(e) => updateItemField(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                                                            className="w-14 bg-black/40 border border-white/10 rounded px-2 py-1 text-white text-sm text-center outline-none focus:border-neon/50"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        <span className="text-white/30 text-sm">{item.bonification || 0}</span>
                                                    </td>
                                                    <td className="px-3 py-3 text-right">
                                                        <span className="text-white/50 text-sm">
                                                            {item.unit_price?.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3 text-right">
                                                        <span className="text-neon font-bold text-sm underline decoration-neon/30">
                                                            {(item.unit_price * 1.21)?.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3 text-right">
                                                        <span className="text-white font-bold text-sm">
                                                            {item.total_line?.toLocaleString('es-AR', { minimumFractionDigits: 0 })}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        <button
                                                            onClick={() => removeItem(item.id)}
                                                            className="text-white/20 hover:text-red-400 transition-all"
                                                        >
                                                            <span className="material-symbols-outlined text-base">close</span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {/* Footer Actions */}
                            {selectedInvoice.items && selectedInvoice.items.length > 0 && (
                                <div className="p-4 border-t border-white/[0.04] flex items-center justify-between">
                                    <button
                                        onClick={handleDiscardAll}
                                        className="text-white/30 text-[10px] font-bold uppercase tracking-widest hover:text-red-400 transition-all"
                                    >
                                        Descartar Todo
                                    </button>
                                    <button
                                        onClick={handleConfirmImport}
                                        disabled={confirming}
                                        className="px-8 py-3 bg-neon text-black rounded-xl font-black text-[11px] uppercase tracking-widest shadow-lg shadow-neon/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {confirming ? (
                                            <>
                                                <span className="size-4 border-2 border-t-black border-black/20 rounded-full animate-spin"></span>
                                                Procesando...
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined text-base">check_circle</span>
                                                Confirmar Importación ({selectedInvoice.items.length} items)
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>

    );
};

export default InvoiceProcessor;
