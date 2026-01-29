-- ============================================
-- FIX: Agregar "test cafe" a inventory_items
-- ============================================
-- Contexto: "test cafe" existe en products pero NO en inventory_items
-- Esto causa falla en el Fallback de Deducción de Stock (Direct Sale)
-- que asume que si no hay receta, ProductID == InventoryItemID.
-- ============================================

INSERT INTO public.inventory_items (
  id,                                      -- MISMO ID que products
  store_id,
  name,
  price,
  item_type,
  unit_type,
  current_stock,
  min_stock,
  is_menu_visible,
  is_active,
  category_id
)
VALUES (
  '95c3434e-c2cc-4191-bb37-3f058757c966', -- MISMO ID que products
  'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533',
  'test cafe',
  6070.00,
  'sellable',                              -- Es vendible
  'unit',
  0,                                       -- Stock en 0 (se calcula por ingredientes o stock directo)
  0,
  true,
  true,
  (SELECT id FROM categories WHERE name = 'Recetas' AND store_id = 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533' LIMIT 1)
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price = EXCLUDED.price,
  item_type = EXCLUDED.item_type,
  is_menu_visible = EXCLUDED.is_menu_visible,
  is_active = EXCLUDED.is_active;

-- Verificar la corrección
SELECT id, name, item_type FROM inventory_items WHERE id = '95c3434e-c2cc-4191-bb37-3f058757c966';
