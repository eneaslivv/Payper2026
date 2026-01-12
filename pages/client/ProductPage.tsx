import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useClient } from '../../contexts/ClientContext';
import { MenuItem } from '../../components/client/types';

const ProductPage: React.FC = () => {
  const { id, slug } = useParams<{ id: string; slug: string }>();
  const navigate = useNavigate();
  const { addToCart, user, products, store } = useClient();

  const item = products?.find(i => i.id === id);

  // --- STATE ---
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  // Dynamic Variants/Addons from DB
  const [variantId, setVariantId] = useState<string | null>(null);
  const [addonIds, setAddonIds] = useState<string[]>([]);

  // Effect to set initial selection from variants if available
  useEffect(() => {
    if (item?.variants && item.variants.length > 0) {
      setVariantId(item.variants[0].id);
    }
  }, [item]);

  // Theme support
  const theme = store?.menu_theme || {};
  const accentColor = theme.accentColor || '#36e27b';
  const backgroundColor = theme.backgroundColor || '#000000';
  const textColor = theme.textColor || '#FFFFFF';
  const surfaceColor = theme.surfaceColor || '#141714';

  // Helper to convert hex to rgb for gradients if needed, or just use hex
  // specific logic for gradients: we'll use inline styles for gradients to support dynamic colors

  if (!item) return <div className="h-screen flex items-center justify-center" style={{ backgroundColor, color: textColor }}>Product not found</div>;

  // --- CALCULATIONS ---
  const currentVariant = item.variants?.find(v => v.id === variantId);

  const variantPriceAdj = currentVariant?.price_adjustment !== undefined ? Number(currentVariant.price_adjustment) : 0;
  const itemPrice = item.price !== undefined ? Number(item.price) : 0;
  const basePrice = itemPrice + variantPriceAdj;

  const selectedAddonsCost = item.addons
    ? item.addons
      .filter(a => addonIds.includes(a.id))
      .reduce((sum, a) => sum + (Number(a.price) || 0), 0)
    : 0;

  const totalPrice = (basePrice + selectedAddonsCost) * quantity;

  // --- HANDLERS ---
  const toggleCustom = (id: string) => {
    setAddonIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const handleAdd = () => {
    // Construct a cart item with the calculated price
    const cartItem = {
      ...item,
      price: basePrice + selectedAddonsCost,
    };

    // We pass IDs to context for the order
    addToCart(cartItem, quantity, addonIds, variantId || undefined, notes);
    navigate(`/m/${slug}/cart`);
  };

  return (
    <div
      className="relative flex min-h-screen w-full flex-col overflow-x-hidden pb-48 font-display transition-colors duration-500"
      style={{ backgroundColor, color: textColor }}
    >
      {/* HEADER SUPERPUESTO */}
      <div
        className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between p-6 pt-[calc(1.2rem+env(safe-area-inset-top))]"
        style={{ background: `linear-gradient(to bottom, ${backgroundColor}F2, transparent)` }}
      >
        <button
          onClick={() => navigate(-1)}
          className="flex h-12 w-12 items-center justify-center rounded-2xl backdrop-blur-xl border transition-all active:scale-90 shadow-2xl"
          style={{
            backgroundColor: `${surfaceColor}80`,
            borderColor: `${textColor}1A`,
            color: textColor
          }}
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
      </div>

      <div className="relative w-full h-[45vh] shrink-0">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${item.image})` }}></div>
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(to top, ${backgroundColor} 10%, ${backgroundColor}1A 40%, transparent 100%)` }}
        ></div>
      </div>

      <div
        className="relative -mt-12 flex flex-1 flex-col rounded-t-[2.5rem] px-6 pt-10 z-10 shadow-[0_-20px_60px_rgba(0,0,0,0.5)] border-t"
        style={{ backgroundColor, borderColor: `${textColor}08` }}
      >
        <div className="absolute left-1/2 top-4 h-1 w-10 -translate-x-1/2 rounded-full" style={{ backgroundColor: `${textColor}0D` }}></div>

        <div className="mb-10">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-[32px] font-black leading-[0.95] tracking-tighter uppercase italic" style={{ color: textColor }}>{item.name}</h1>
            <span className="text-2xl font-black tracking-tighter italic shrink-0" style={{ color: accentColor }}>${totalPrice.toFixed(2)}</span>
          </div>
          <p className="mt-4 text-[12px] leading-relaxed font-medium tracking-tight" style={{ color: `${textColor}4D` }}>{item.description}</p>
        </div>

        {/* DYNAMIC SIZES / VARIANTS */}
        {item.variants && item.variants.length > 0 && (
          <div className="mb-10">
            <h3 className="mb-5 text-[8px] font-black uppercase tracking-[0.4em] italic" style={{ color: `${textColor}33` }}>Selección de Tamaño</h3>
            <div className="flex gap-3 flex-wrap">
              {item.variants.map((v) => (
                <label
                  key={v.id}
                  onClick={() => setVariantId(v.id)}
                  className={`group relative flex flex-1 min-w-[30%] cursor-pointer flex-col p-4 rounded-2xl border transition-all duration-500 ${variantId === v.id ? 'shadow-xl' : ''}`}
                  style={{
                    backgroundColor: variantId === v.id ? `${accentColor}0D` : `${textColor}03`,
                    borderColor: variantId === v.id ? accentColor : `${textColor}0D`
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="material-symbols-outlined transition-colors"
                      style={{ fontSize: '24px', color: variantId === v.id ? accentColor : `${textColor}1A` }}
                    >local_cafe</span>
                    <span className="text-[10px] font-black" style={{ color: variantId === v.id ? accentColor : textColor }}>
                      {v.price_adjustment >= 0 ? '+' : ''}${v.price_adjustment}
                    </span>
                  </div>
                  <span
                    className="text-[9px] font-black uppercase tracking-[0.2em] transition-colors"
                    style={{ color: variantId === v.id ? accentColor : `${textColor}33` }}
                  >{v.name}</span>

                  {/* Stock Microcopy for Variants */}
                  {v.recipe_overrides && v.recipe_overrides.length > 0 && (
                    <div className="mt-2 space-y-0.5">
                      {v.recipe_overrides.map((ov, i) => (
                        <div key={i} className="text-[7px] font-bold uppercase tracking-tighter" style={{ color: `${textColor}33` }}>
                          {ov.quantity_delta > 0 ? '+' : ''}{ov.quantity_delta} impacto stock
                        </div>
                      ))}
                    </div>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* DYNAMIC ADDONS */}
        {item.addons && item.addons.length > 0 && (
          <div className="mb-10">
            <h3 className="mb-5 text-[8px] font-black uppercase tracking-[0.4em] italic" style={{ color: `${textColor}33` }}>Personalización</h3>
            <div className="grid grid-cols-1 gap-3">
              {item.addons.map((addon) => (
                <label
                  key={addon.id}
                  className="flex cursor-pointer items-center justify-between rounded-2xl p-5 transition-all duration-500 border"
                  style={{
                    backgroundColor: addonIds.includes(addon.id) ? `${accentColor}0A` : `${textColor}03`,
                    borderColor: addonIds.includes(addon.id) ? `${accentColor}33` : `${textColor}0D`
                  }}
                  onClick={() => toggleCustom(addon.id)}
                >
                  <div className="flex items-center gap-5">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-xl transition-all"
                      style={{
                        backgroundColor: addonIds.includes(addon.id) ? accentColor : `${textColor}0D`,
                        color: addonIds.includes(addon.id) ? '#000000' : `${textColor}33`
                      }}
                    >
                      <span className="material-symbols-outlined">{addon.name.toLowerCase().includes('leche') || addon.name.toLowerCase().includes('milk') ? 'opacity' : 'add_circle'}</span>
                    </div>
                    <div>
                      <span className="font-bold text-sm uppercase tracking-tight block" style={{ color: textColor }}>{addon.name}</span>
                      {/* Stock Microcopy for Addons */}
                      {addon.quantity_consumed && addon.quantity_consumed > 0 && (
                        <span className="text-[9px] font-bold uppercase tracking-widest block" style={{ color: `${textColor}33` }}>
                          +{addon.quantity_consumed} por unidad
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="font-black text-sm" style={{ color: accentColor }}>+${addon.price}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* SPECIAL NOTES */}
        <div className="mb-14">
          <h3 className="mb-5 text-[8px] font-black uppercase tracking-[0.4em] italic" style={{ color: `${textColor}33` }}>Notas Especiales</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="PREFERENCIAS..."
            className="w-full rounded-2xl border p-6 text-xs font-bold transition-all resize-none h-32 italic outline-none"
            style={{
              backgroundColor: `${textColor}05`,
              borderColor: `${textColor}0D`,
              color: textColor,
              '--placeholder-color': `${textColor}1A`,
              '--focus-border': accentColor
            } as any}
          />
          <style>{`
            textarea::placeholder {
                color: ${textColor}1A !important;
                font-size: 8px;
                letter-spacing: 0.3em;
            }
          `}</style>
        </div>
      </div>

      {/* FOOTER ACTION */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 backdrop-blur-3xl border-t px-6 pt-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] max-w-md mx-auto shadow-[0_-20px_60px_rgba(0,0,0,0.2)]"
        style={{
          backgroundColor: `${backgroundColor}F2`,
          borderColor: `${textColor}0D`
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-20 items-center rounded-full border px-2 shadow-inner shrink-0"
            style={{
              backgroundColor: `${textColor}05`,
              borderColor: `${textColor}0D`
            }}
          >
            <button
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
              className="flex size-12 items-center justify-center rounded-full active:scale-90 transition-all"
              style={{ color: `${textColor}33` }}
            >
              <span className="material-symbols-outlined text-lg">remove</span>
            </button>
            <span className="w-8 text-center text-xl font-black italic tabular-nums" style={{ color: textColor }}>{quantity}</span>
            <button
              onClick={() => setQuantity(q => q + 1)}
              className="flex size-12 items-center justify-center rounded-full active:scale-90 transition-all"
              style={{ color: accentColor }}
            >
              <span className="material-symbols-outlined text-lg">add</span>
            </button>
          </div>

          <button
            onClick={handleAdd}
            disabled={item.isOutOfStock}
            className={`group relative flex h-20 flex-1 items-center justify-between rounded-full pl-8 pr-3 text-black active:scale-[0.97] transition-all duration-500 overflow-hidden border border-white/20 ${item.isOutOfStock ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
            style={{ backgroundColor: item.isOutOfStock ? '#333' : accentColor, boxShadow: item.isOutOfStock ? 'none' : `0 20px 40px ${accentColor}40` }}
          >
            <div className="flex flex-col items-start leading-[1] text-left shrink-0">
              <span className="font-black uppercase text-[11px] tracking-tight">{item.isOutOfStock ? 'Agotado' : 'Añadir'}</span>
              <span className="font-black uppercase text-[11px] tracking-tight opacity-40 italic">{item.isOutOfStock ? 'Sin Stock' : 'Orden'}</span>
            </div>
            {!item.isOutOfStock && (
              <div className="flex items-center gap-4 relative z-10 ml-2">
                <div className="flex items-center gap-3">
                  <span className="font-black text-[22px] italic tabular-nums tracking-tighter leading-none">${totalPrice.toFixed(2)}</span>
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center bg-black transition-all group-hover:scale-105 shadow-xl shrink-0"
                    style={{ color: accentColor }}
                  >
                    <span className="material-symbols-outlined font-black text-[28px]">add</span>
                  </div>
                </div>
              </div>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductPage;
