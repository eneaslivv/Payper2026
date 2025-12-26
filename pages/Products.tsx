
import React, { useState, useMemo } from 'react';
import { MOCK_PRODUCTS, MOCK_LOTS, MOCK_ADJUSTMENTS } from '../constants';
import { Product, InventoryLot, StockAdjustment } from '../types';

const Products: React.FC = () => {
  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS);
  const [lots, setLots] = useState<InventoryLot[]>(MOCK_LOTS);
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>(MOCK_ADJUSTMENTS);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Todos');
  
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showLotModal, setShowLotModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  // States for Adjust Modal
  const [adjQty, setAdjQty] = useState<number>(0);
  const [adjReason, setAdjReason] = useState<StockAdjustment['reason']>('Pérdida');

  // States for New Lot Modal
  const [newLotProduct, setNewLotProduct] = useState<string>('');
  const [newLotQty, setNewLotQty] = useState<number>(0);
  const [newLotPurchaseDate, setNewLotPurchaseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [newLotExpiryDate, setNewLotExpiryDate] = useState<string>('');

  const categories = ['Todos', 'Cafetería', 'Pastelería', 'Bebidas Frías', 'Sandwiches'];

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = activeCategory === 'Todos' || p.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, activeCategory]);

  const handleAdjustStock = () => {
    if (selectedProduct && adjQty !== 0) {
      const newAdjustment: StockAdjustment = {
        id: `ADJ-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
        productId: selectedProduct.id,
        deltaQty: adjQty,
        reason: adjReason,
        staffName: 'Carlos Admin',
        timestamp: new Date().toISOString().replace('T', ' ').substr(0, 16)
      };
      
      setAdjustments(prev => [newAdjustment, ...prev]);
      setProducts(prev => prev.map(p => p.id === selectedProduct.id ? { ...p, stock: p.stock + adjQty } : p));
      
      if (adjQty < 0) {
        let remainingToSubtract = Math.abs(adjQty);
        setLots(prev => prev.map(lot => {
          if (lot.productId === selectedProduct.id && remainingToSubtract > 0) {
            const consumed = Math.min(lot.currentQty, remainingToSubtract);
            remainingToSubtract -= consumed;
            return { ...lot, currentQty: lot.currentQty - consumed };
          }
          return lot;
        }));
      }

      setShowAdjustModal(false);
      setAdjQty(0);
    }
  };

  const handleSaveLot = () => {
    if (newLotProduct && newLotQty > 0 && newLotExpiryDate) {
      const newLot: InventoryLot = {
        id: `L-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
        productId: newLotProduct,
        purchaseDate: newLotPurchaseDate,
        expirationDate: newLotExpiryDate,
        initialQty: newLotQty,
        currentQty: newLotQty
      };

      setLots(prev => [newLot, ...prev]);
      setProducts(prev => prev.map(p => p.id === newLotProduct ? { ...p, stock: p.stock + newLotQty } : p));
      
      setShowLotModal(false);
      setNewLotProduct('');
      setNewLotQty(0);
      setNewLotExpiryDate('');
    }
  };

  return (
    <div className="p-6 md:p-8 lg:px-12 max-w-[1600px] mx-auto space-y-8 pb-20 relative">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-[#181111] dark:text-white">Inventario Avanzado</h1>
          <p className="text-[#886364] dark:text-gray-400 text-base font-normal max-w-xl">
            Control de stock por lotes (FIFO), trazabilidad de vencimientos y auditoría de pérdidas operativas.
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setShowLotModal(true)}
            className="flex items-center justify-center gap-2 bg-white dark:bg-white/5 border border-primary/20 text-primary px-6 py-3 rounded-full font-bold text-sm hover:bg-primary/5 transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">inventory</span>
            <span>Nuevo Lote</span>
          </button>
          <button className="flex items-center justify-center gap-2 bg-white dark:bg-white/5 border border-border-color text-text-main dark:text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-black/5 transition-all">
            <span className="material-symbols-outlined text-[20px]">history</span>
            <span>Historial Ajustes</span>
          </button>
          <button className="flex items-center justify-center gap-2 bg-primary hover:bg-red-600 text-white px-6 py-3 rounded-full font-bold text-sm shadow-lg shadow-primary/30 transition-all hover:scale-105">
            <span className="material-symbols-outlined text-[20px]">add</span>
            <span>Nuevo Producto</span>
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-gray-400">search</span>
            </div>
            <input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full pl-10 pr-3 py-3 border-none ring-1 ring-gray-200 dark:ring-gray-700 rounded-full leading-5 bg-white dark:bg-[#1a0f0f] dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary sm:text-sm shadow-sm" 
              placeholder="Buscar por nombre o SKU..." 
              type="text"
            />
          </div>
          <div className="flex gap-2">
            {categories.map(cat => (
              <button 
                key={cat} 
                onClick={() => setActiveCategory(cat)}
                className={`px-5 py-3 rounded-full text-sm font-bold transition-all ${
                  activeCategory === cat ? 'bg-[#181111] text-white' : 'bg-white border border-gray-200 text-gray-600'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Table */}
        <div className="lg:col-span-8 bg-white dark:bg-[#1a0f0f] rounded-2xl shadow-sm border border-[#e5dcdc] dark:border-[#333] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Producto</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Precio</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Stock Total</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredProducts.map(product => (
                  <tr key={product.id} className="group hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <img alt={product.name} className="size-12 rounded-lg object-cover" src={product.image}/>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold">{product.name}</span>
                          <span className="text-xs text-gray-400">SKU: {product.sku}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-semibold">${product.price.toFixed(2)}</td>
                    <td className="px-6 py-4 font-black">{product.stock} un.</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                        product.stockStatus === 'Alto' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                      }`}>{product.stockStatus}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => { setSelectedProduct(product); setShowAdjustModal(true); }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-50 text-orange-600 font-bold text-xs hover:bg-orange-100 transition-all"
                        >
                          <span className="material-symbols-outlined text-[16px]">tune</span>
                          Ajustar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Expiration Tracking Panel */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white dark:bg-[#1a0f0f] p-6 rounded-2xl border border-border-color shadow-sm">
            <h3 className="text-lg font-extrabold mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">event_busy</span>
              Próximos Vencimientos
            </h3>
            <div className="space-y-3">
              {lots.filter(l => l.currentQty > 0).sort((a,b) => new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime()).map(lot => {
                const p = products.find(prod => prod.id === lot.productId);
                return (
                  <div key={lot.id} className="p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100">
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-bold text-sm">{p?.name}</p>
                      <span className="text-[10px] font-black text-red-600">{lot.currentQty} un.</span>
                    </div>
                    <p className="text-xs text-red-700 font-medium">Vence: {lot.expirationDate}</p>
                    <div className="w-full bg-red-200 h-1 rounded-full mt-2 overflow-hidden">
                      <div className="bg-red-600 h-full" style={{width: `${(lot.currentQty/lot.initialQty)*100}%`}}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-primary/5 p-6 rounded-2xl border border-primary/10">
            <h4 className="text-sm font-bold text-primary mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">lightbulb</span>
              KPI de Inventario
            </h4>
            <p className="text-xs text-text-secondary leading-relaxed">
              El índice de rotación de stock ha subido un 5% este mes. Se recomienda reducir el pedido de <span className="font-bold">Croissants</span> debido a la tasa de vencimiento detectada.
            </p>
          </div>
        </div>
      </div>

      {/* Adjust Stock Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#181111]/60 backdrop-blur-sm" onClick={() => setShowAdjustModal(false)}></div>
          <div className="relative bg-white dark:bg-[#1a0f0f] rounded-2xl shadow-2xl w-full max-w-md p-8 overflow-hidden animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-black mb-1">Ajuste de Inventario</h3>
            <p className="text-text-secondary text-sm mb-6">Registra pérdidas, daños o ajustes manuales para auditoría.</p>
            
            <div className="space-y-6">
              <div className="flex items-center gap-4 p-3 bg-black/5 rounded-xl">
                <img src={selectedProduct?.image} className="size-12 rounded-lg object-cover" />
                <div>
                  <p className="font-bold">{selectedProduct?.name}</p>
                  <p className="text-xs text-text-secondary">Stock actual: {selectedProduct?.stock} un.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-secondary">Cantidad (+ / -)</label>
                  <input 
                    type="number"
                    value={adjQty}
                    onChange={(e) => setAdjQty(parseInt(e.target.value))}
                    className="w-full px-4 py-3 rounded-xl border border-border-color bg-white text-lg font-black focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-secondary">Razón</label>
                  <select 
                    value={adjReason}
                    onChange={(e) => setAdjReason(e.target.value as any)}
                    className="w-full px-4 py-3 rounded-xl border border-border-color bg-white text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option>Pérdida</option>
                    <option>Daño</option>
                    <option>Robo</option>
                    <option>Vencimiento</option>
                    <option>Corrección Manual</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button onClick={() => setShowAdjustModal(false)} className="flex-1 px-4 py-4 rounded-xl border border-border-color font-bold hover:bg-black/5">Cancelar</button>
                <button onClick={handleAdjustStock} className="flex-1 px-4 py-4 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/20 hover:bg-red-600 transition-all">Guardar Ajuste</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Lot Modal */}
      {showLotModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#181111]/60 backdrop-blur-sm" onClick={() => setShowLotModal(false)}></div>
          <div className="relative bg-white dark:bg-[#1a0f0f] rounded-2xl shadow-2xl w-full max-w-md p-8 overflow-hidden animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-black mb-1">Nuevo Lote</h3>
            <p className="text-text-secondary text-sm mb-6">Ingresa un nuevo lote de mercadería al inventario.</p>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-text-secondary">Producto</label>
                <select 
                  value={newLotProduct}
                  onChange={(e) => setNewLotProduct(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-border-color bg-white text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                >
                  <option value="">Selecciona un producto</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-text-secondary">Cantidad Inicial</label>
                <input 
                  type="number"
                  value={newLotQty}
                  onChange={(e) => setNewLotQty(parseInt(e.target.value))}
                  className="w-full px-4 py-3 rounded-xl border border-border-color bg-white text-lg font-black focus:ring-2 focus:ring-primary outline-none"
                  placeholder="0"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-text-secondary">Fecha Compra</label>
                  <input 
                    type="date"
                    value={newLotPurchaseDate}
                    onChange={(e) => setNewLotPurchaseDate(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border-color bg-white text-sm focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-text-secondary">Fecha Vencimiento</label>
                  <input 
                    type="date"
                    value={newLotExpiryDate}
                    onChange={(e) => setNewLotExpiryDate(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border-color bg-white text-sm focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-6">
                <button onClick={() => setShowLotModal(false)} className="flex-1 px-4 py-4 rounded-xl border border-border-color font-bold hover:bg-black/5">Cancelar</button>
                <button 
                  onClick={handleSaveLot}
                  disabled={!newLotProduct || newLotQty <= 0 || !newLotExpiryDate}
                  className="flex-1 px-4 py-4 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/20 hover:bg-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Registrar Lote
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Products;
