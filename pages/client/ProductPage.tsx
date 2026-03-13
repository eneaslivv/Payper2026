import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLayoutEffect } from 'react';
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

  // Modifier group selections: { [groupId]: selectedOptionId[] }
  const [selections, setSelections] = useState<Record<string, string[]>>({});

  // Legacy fallback state (used when no modifier_groups exist)
  const [variantId, setVariantId] = useState<string | null>(null);
  const [addonIds, setAddonIds] = useState<string[]>([]);

  const hasModifierGroups = (item?.modifier_groups || []).length > 0;

  // Initialize default selections from modifier groups
  useEffect(() => {
    if (!item) return;
    if (hasModifierGroups) {
      const defaults: Record<string, string[]> = {};
      for (const group of item.modifier_groups!) {
        const defaultOpt = group.modifier_options.find(o => o.is_default);
        if (defaultOpt) {
          defaults[group.id] = [defaultOpt.id];
        } else if (group.min_select > 0 && group.modifier_options.length > 0) {
          // Auto-select first option for required groups
          defaults[group.id] = [group.modifier_options[0].id];
        } else {
          defaults[group.id] = [];
        }
      }
      setSelections(defaults);
    } else if (item.variants && item.variants.length > 0) {
      setVariantId(item.variants[0].id);
    }
  }, [item]);

  // Theme
  const theme = store?.menu_theme || {};
  const accentColor = theme.accentColor || '#36e27b';
  const backgroundColor = theme.backgroundColor || '#000000';
  const textColor = theme.textColor || '#FFFFFF';
  const surfaceColor = theme.surfaceColor || '#141714';

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    const raf = window.requestAnimationFrame(() => window.scrollTo(0, 0));
    const timeout = window.setTimeout(() => window.scrollTo(0, 0), 50);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
    };
  }, [id]);

  if (!item) return <div className="h-screen flex items-center justify-center" style={{ backgroundColor, color: textColor }}>Product not found</div>;

  // --- SELECTION HANDLERS ---
  const toggleOption = (groupId: string, optionId: string, maxSelect: number) => {
    setSelections(prev => {
      const current = prev[groupId] || [];
      if (maxSelect === 1) {
        // Radio behavior
        return { ...prev, [groupId]: current.includes(optionId) ? [] : [optionId] };
      }
      // Multi-select (checkbox)
      if (current.includes(optionId)) {
        return { ...prev, [groupId]: current.filter(id => id !== optionId) };
      }
      if (current.length >= maxSelect) return prev; // at max
      return { ...prev, [groupId]: [...current, optionId] };
    });
  };

  // --- PRICE CALCULATION ---
  const totalPrice = useMemo(() => {
    let price = Number(item.price) || 0;

    if (hasModifierGroups) {
      for (const group of item.modifier_groups!) {
        const selected = selections[group.id] || [];
        for (const optId of selected) {
          const opt = group.modifier_options.find(o => o.id === optId);
          if (opt && opt.affects_price !== false) {
            price += Number(opt.price_delta) || 0;
          }
        }
      }
    } else {
      // Legacy
      const currentVariant = item.variants?.find(v => v.id === variantId);
      price += Number(currentVariant?.price_adjustment) || 0;
      if (item.addons) {
        price += item.addons
          .filter(a => addonIds.includes(a.id))
          .reduce((sum, a) => sum + (Number(a.price) || 0), 0);
      }
    }

    return price * quantity;
  }, [item, selections, variantId, addonIds, quantity, hasModifierGroups]);

  // All selected modifier option IDs (flat)
  const allSelectedModifierIds = useMemo(() => {
    return Object.values(selections).flat();
  }, [selections]);

  // Validation: check required groups
  const isValid = useMemo(() => {
    if (!hasModifierGroups) return true;
    for (const group of item.modifier_groups!) {
      const selected = (selections[group.id] || []).length;
      if (selected < group.min_select) return false;
    }
    return true;
  }, [item, selections, hasModifierGroups]);

  // --- ADD TO CART ---
  const handleAdd = () => {
    if (!isValid) return;

    if (hasModifierGroups) {
      // Calculate unit price with modifiers
      let unitPrice = Number(item.price) || 0;
      for (const group of item.modifier_groups!) {
        for (const optId of (selections[group.id] || [])) {
          const opt = group.modifier_options.find(o => o.id === optId);
          if (opt && opt.affects_price !== false) unitPrice += Number(opt.price_delta) || 0;
        }
      }
      const cartItem = { ...item, price: unitPrice };
      addToCart(cartItem, quantity, [], '', notes, allSelectedModifierIds);
    } else {
      // Legacy path
      const currentVariant = item.variants?.find(v => v.id === variantId);
      const variantAdj = Number(currentVariant?.price_adjustment) || 0;
      const addonsCost = item.addons
        ? item.addons.filter(a => addonIds.includes(a.id)).reduce((sum, a) => sum + (Number(a.price) || 0), 0)
        : 0;
      const cartItem = { ...item, price: Number(item.price) + variantAdj + addonsCost };
      addToCart(cartItem, quantity, addonIds, variantId || '', notes);
    }
    navigate(`/m/${slug}/cart`);
  };

  // --- MODIFIER TYPE ICONS ---
  const typeIcons: Record<string, string> = {
    size: 'straighten',
    extra: 'add_circle',
    replacement: 'swap_horiz',
    removal: 'remove_circle',
    informational: 'info',
  };

  return (
    <div
      className="relative flex min-h-screen w-full flex-col overflow-x-hidden pb-48 font-display transition-colors duration-500"
      style={{ backgroundColor, color: textColor }}
    >
      {/* HEADER */}
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
        <div
          className="absolute inset-0 bg-no-repeat"
          style={{
            backgroundImage: `url(${item.image})`,
            backgroundSize: 'contain',
            backgroundPosition: 'top center',
            backgroundColor
          }}
        ></div>
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

        {/* MODIFIER GROUPS (new system) */}
        {hasModifierGroups && item.modifier_groups!.map((group) => {
          const selected = selections[group.id] || [];
          const isRadio = group.max_select === 1;
          const isRequired = group.min_select > 0;
          const isMissing = isRequired && selected.length < group.min_select;

          return (
            <div key={group.id} className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-sm" style={{ color: `${textColor}33` }}>{typeIcons[group.modifier_type] || 'tune'}</span>
                <h3 className="text-[8px] font-black uppercase tracking-[0.4em] italic" style={{ color: `${textColor}33` }}>{group.name}</h3>
                {isRequired && (
                  <span className="text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{
                    backgroundColor: isMissing ? '#ef444420' : `${accentColor}15`,
                    color: isMissing ? '#ef4444' : accentColor,
                  }}>
                    Obligatorio
                  </span>
                )}
              </div>

              {/* Radio-style (size, replacement) */}
              {isRadio ? (
                <div className="flex gap-3 flex-wrap">
                  {group.modifier_options.map((opt) => {
                    const isSelected = selected.includes(opt.id);
                    return (
                      <label
                        key={opt.id}
                        onClick={() => toggleOption(group.id, opt.id, group.max_select)}
                        className={`group relative flex flex-1 min-w-[30%] cursor-pointer flex-col p-4 rounded-2xl border transition-all duration-500 ${isSelected ? 'shadow-xl' : ''}`}
                        style={{
                          backgroundColor: isSelected ? `${accentColor}0D` : `${textColor}03`,
                          borderColor: isSelected ? accentColor : `${textColor}0D`
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className="material-symbols-outlined transition-colors"
                            style={{ fontSize: '24px', color: isSelected ? accentColor : `${textColor}1A` }}
                          >{typeIcons[group.modifier_type] || 'local_cafe'}</span>
                          {(opt.price_delta || 0) !== 0 && (
                            <span className="text-[10px] font-black" style={{ color: isSelected ? accentColor : textColor }}>
                              {opt.price_delta >= 0 ? '+' : ''}${opt.price_delta}
                            </span>
                          )}
                        </div>
                        <span
                          className="text-[9px] font-black uppercase tracking-[0.2em] transition-colors"
                          style={{ color: isSelected ? accentColor : `${textColor}33` }}
                        >{opt.name}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                /* Multi-select (extra, removal, informational) */
                <div className="grid grid-cols-1 gap-3">
                  {group.modifier_options.map((opt) => {
                    const isSelected = selected.includes(opt.id);
                    const atMax = !isSelected && selected.length >= group.max_select;
                    return (
                      <label
                        key={opt.id}
                        className={`flex cursor-pointer items-center justify-between rounded-2xl p-5 transition-all duration-500 border ${atMax ? 'opacity-40' : ''}`}
                        style={{
                          backgroundColor: isSelected ? `${accentColor}0A` : `${textColor}03`,
                          borderColor: isSelected ? `${accentColor}33` : `${textColor}0D`
                        }}
                        onClick={() => !atMax && toggleOption(group.id, opt.id, group.max_select)}
                      >
                        <div className="flex items-center gap-5">
                          <div
                            className="flex h-12 w-12 items-center justify-center rounded-xl transition-all"
                            style={{
                              backgroundColor: isSelected ? accentColor : `${textColor}0D`,
                              color: isSelected ? '#000000' : `${textColor}33`
                            }}
                          >
                            <span className="material-symbols-outlined">
                              {group.modifier_type === 'removal' ? 'remove_circle' :
                               group.modifier_type === 'informational' ? 'info' :
                               isSelected ? 'check_circle' : 'add_circle'}
                            </span>
                          </div>
                          <span className="font-bold text-sm uppercase tracking-tight" style={{ color: textColor }}>{opt.name}</span>
                        </div>
                        {(opt.price_delta || 0) !== 0 && (
                          <span className="font-black text-sm" style={{ color: accentColor }}>
                            {opt.price_delta > 0 ? '+' : ''}${opt.price_delta}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* LEGACY: VARIANTS (when no modifier_groups) */}
        {!hasModifierGroups && item.variants && item.variants.length > 0 && (
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
                    <span className="material-symbols-outlined transition-colors" style={{ fontSize: '24px', color: variantId === v.id ? accentColor : `${textColor}1A` }}>local_cafe</span>
                    <span className="text-[10px] font-black" style={{ color: variantId === v.id ? accentColor : textColor }}>
                      {v.price_adjustment >= 0 ? '+' : ''}${v.price_adjustment}
                    </span>
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] transition-colors" style={{ color: variantId === v.id ? accentColor : `${textColor}33` }}>{v.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* LEGACY: ADDONS (when no modifier_groups) */}
        {!hasModifierGroups && item.addons && item.addons.length > 0 && (
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
                  onClick={() => setAddonIds(prev => prev.includes(addon.id) ? prev.filter(c => c !== addon.id) : [...prev, addon.id])}
                >
                  <div className="flex items-center gap-5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl transition-all" style={{
                      backgroundColor: addonIds.includes(addon.id) ? accentColor : `${textColor}0D`,
                      color: addonIds.includes(addon.id) ? '#000000' : `${textColor}33`
                    }}>
                      <span className="material-symbols-outlined">add_circle</span>
                    </div>
                    <span className="font-bold text-sm uppercase tracking-tight" style={{ color: textColor }}>{addon.name}</span>
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
            disabled={item.isOutOfStock || !isValid}
            className={`group relative flex h-20 flex-1 items-center justify-between rounded-full pl-8 pr-3 text-black active:scale-[0.97] transition-all duration-500 overflow-hidden border border-white/20 ${(item.isOutOfStock || !isValid) ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
            style={{ backgroundColor: (item.isOutOfStock || !isValid) ? '#333' : accentColor, boxShadow: (item.isOutOfStock || !isValid) ? 'none' : `0 20px 40px ${accentColor}40` }}
          >
            <div className="flex flex-col items-start leading-[1] text-left shrink-0">
              <span className="font-black uppercase text-[11px] tracking-tight">{item.isOutOfStock ? 'Agotado' : !isValid ? 'Seleccioná' : 'Añadir'}</span>
              <span className="font-black uppercase text-[11px] tracking-tight opacity-40 italic">{item.isOutOfStock ? 'Sin Stock' : !isValid ? 'opciones' : 'Orden'}</span>
            </div>
            {!item.isOutOfStock && isValid && (
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
