import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useClient } from '../../contexts/ClientContext';
import { MenuItem } from '../../components/client/types';

const ProductPage: React.FC = () => {
  const { id, slug } = useParams<{ id: string; slug: string }>();
  const navigate = useNavigate();
  const { addToCart, user, products } = useClient();

  const item = products.find(i => i.id === id);

  const [quantity, setQuantity] = useState(1);
  const [size, setSize] = useState('Chico');
  const [customs, setCustoms] = useState<string[]>(['Extra Shot']);
  const [notes, setNotes] = useState('');

  if (!item) return <div className="h-screen flex items-center justify-center bg-black text-white">Product not found</div>;

  const basePrice = item.price;
  const sizeSurcharge = size === 'Grande' ? 0.50 : size === 'Venti' ? 1.00 : 0;
  const customsSurcharge = (customs.includes('Oat Milk') ? 0.80 : 0) + (customs.includes('Extra Shot') ? 1.00 : 0);
  const totalPrice = (basePrice + sizeSurcharge + customsSurcharge) * quantity;

  const toggleCustom = (val: string) => {
    setCustoms(prev => prev.includes(val) ? prev.filter(c => c !== val) : [...prev, val]);
  };

  const handleAdd = () => {
    addToCart(item, quantity, customs, size, notes);
    // If user is logged in, maybe go to cart? Or just back to menu?
    // Original logic: if (user) navigate('/') - confusing.
    // Let's navigate back to menu.
    navigate(`/m/${slug}`);
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden pb-48 bg-black font-display">
      {/* HEADER SUPERPUESTO CON MAYOR PADDING TOP */}
      <div className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between p-6 bg-gradient-to-b from-black/95 to-transparent pt-[calc(1.2rem+env(safe-area-inset-top))]">
        <button onClick={() => navigate(-1)} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black/60 backdrop-blur-xl text-white border border-white/10 hover:bg-black/80 transition-all active:scale-90 shadow-2xl">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
      </div>

      <div className="relative w-full h-[45vh] shrink-0">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${item.image})` }}></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent"></div>
      </div>

      <div className="relative -mt-12 flex flex-1 flex-col rounded-t-[2.5rem] bg-black px-6 pt-10 z-10 shadow-[0_-20px_60px_rgba(0,0,0,1)] border-t border-white/[0.03]">
        <div className="absolute left-1/2 top-4 h-1 w-10 -translate-x-1/2 rounded-full bg-white/5"></div>

        <div className="mb-10">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-[32px] font-black leading-[0.95] tracking-tighter text-white uppercase italic">{item.name}</h1>
            <span className="text-2xl font-black text-primary tracking-tighter italic shrink-0">${basePrice.toFixed(2)}</span>
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-white/30 font-medium tracking-tight">{item.description}</p>
        </div>

        {/* SELECT SIZE */}
        <div className="mb-10">
          <h3 className="mb-5 text-[8px] font-black uppercase tracking-[0.4em] text-white/20 italic">Selección de Tamaño</h3>
          <div className="flex gap-3">
            {['Chico', 'Grande', 'Venti'].map(s => (
              <label
                key={s}
                onClick={() => setSize(s)}
                className={`group relative flex flex-1 cursor-pointer flex-col items-center justify-center rounded-2xl border transition-all duration-500 p-5 ${size === s ? 'border-primary bg-primary/5 shadow-xl' : 'border-white/5 bg-white/[0.01]'
                  }`}
              >
                <span className={`material-symbols-outlined mb-2 transition-colors ${size === s ? 'text-primary' : 'text-white/10'}`} style={{ fontSize: '30px' }}>local_cafe</span>
                <span className={`text-[8px] font-black uppercase tracking-[0.2em] transition-colors ${size === s ? 'text-primary' : 'text-white/20'}`}>{s}</span>
              </label>
            ))}
          </div>
        </div>

        {/* CUSTOMIZATIONS */}
        <div className="mb-10">
          <h3 className="mb-5 text-[8px] font-black uppercase tracking-[0.4em] text-white/20 italic">Configuración</h3>
          <div className="grid grid-cols-1 gap-3">
            {[
              { id: 'Oat Milk', label: 'Oat Milk', price: '+$0.80', icon: 'opacity' },
              { id: 'Extra Shot', label: 'Extra Shot', price: '+$1.00', icon: 'bolt' }
            ].map(c => (
              <label
                key={c.id}
                className={`flex cursor-pointer items-center justify-between rounded-2xl p-5 transition-all duration-500 border ${customs.includes(c.id) ? 'bg-primary/[0.04] border-primary/20' : 'bg-white/[0.01] border-white/5'}`}
                onClick={() => toggleCustom(c.id)}
              >
                <div className="flex items-center gap-5">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl transition-all ${customs.includes(c.id) ? 'bg-primary text-black' : 'bg-white/5 text-white/20'}`}>
                    <span className="material-symbols-outlined text-xl font-black">{c.icon}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className={`font-black text-xs uppercase tracking-tight italic ${customs.includes(c.id) ? 'text-white' : 'text-white/40'}`}>{c.label}</span>
                    <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest mt-1">{c.price}</span>
                  </div>
                </div>
                <div className={`relative inline-flex h-6 w-10 items-center rounded-full transition-all duration-500 ${customs.includes(c.id) ? 'bg-primary' : 'bg-white/10'}`}>
                  <div className={`h-4 w-4 rounded-full bg-black shadow-lg transition-transform duration-500 ${customs.includes(c.id) ? 'translate-x-5' : 'translate-x-1'}`}></div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* SPECIAL NOTES */}
        <div className="mb-14">
          <h3 className="mb-5 text-[8px] font-black uppercase tracking-[0.4em] text-white/20 italic">Notas Especiales</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="PREFERENCIAS..."
            className="w-full rounded-2xl border border-white/5 bg-white/[0.02] p-6 text-xs font-bold text-white placeholder:text-white/10 placeholder:text-[8px] placeholder:tracking-[0.3em] focus:border-primary/20 transition-all resize-none h-32 italic"
          />
        </div>
      </div>

      {/* FOOTER ACTION */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-black/95 backdrop-blur-3xl border-t border-white/5 px-6 pt-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] max-w-md mx-auto shadow-[0_-20px_60px_rgba(0,0,0,1)]">
        <div className="flex items-center gap-3">
          <div className="flex h-20 items-center rounded-full bg-white/[0.03] border border-white/5 px-2 shadow-inner shrink-0">
            <button
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
              className="flex size-12 items-center justify-center rounded-full text-white/20 active:scale-90 transition-all"
            >
              <span className="material-symbols-outlined text-lg">remove</span>
            </button>
            <span className="w-8 text-center text-xl font-black italic tabular-nums text-white">{quantity}</span>
            <button
              onClick={() => setQuantity(q => q + 1)}
              className="flex size-12 items-center justify-center rounded-full text-primary active:scale-90 transition-all"
            >
              <span className="material-symbols-outlined text-lg">add</span>
            </button>
          </div>

          <button
            onClick={handleAdd}
            className="group relative flex h-20 flex-1 items-center justify-between rounded-full bg-primary pl-8 pr-3 text-black shadow-[0_20px_40px_rgba(54,226,123,0.25)] active:scale-[0.97] transition-all duration-500 overflow-hidden border border-white/20"
          >
            <div className="flex flex-col items-start leading-[1] text-left shrink-0">
              <span className="font-black uppercase text-[11px] tracking-tight">Añadir</span>
              <span className="font-black uppercase text-[11px] tracking-tight opacity-40 italic">Orden</span>
            </div>
            <div className="flex items-center gap-4 relative z-10 ml-2">
              <div className="flex items-center gap-3">
                <span className="font-black text-[22px] italic tabular-nums tracking-tighter leading-none">${totalPrice.toFixed(2)}</span>
                <div className="w-14 h-14 rounded-full flex items-center justify-center bg-black text-primary transition-all group-hover:scale-105 shadow-xl shrink-0">
                  <span className="material-symbols-outlined font-black text-[28px]">add</span>
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductPage;
