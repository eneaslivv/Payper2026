BEGIN;

-- 1. Limpiar tabla por si acaso (Idempotencia)
TRUNCATE TABLE product_variants;

-- 2. Insertar DIRECTAMENTE desde el JSON (Bypassing trigger logic, reproducing the logic)
INSERT INTO product_variants (id, product_id, tenant_id, name, price_delta, recipe_overrides)
SELECT 
    CASE 
        WHEN (v->>'id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN (v->>'id')::UUID 
        ELSE gen_random_uuid() 
    END,
    ii.id, -- inventory_item_id is product_id here
    ii.store_id,
    v->>'name',
    (COALESCE(v->>'price_adjustment', '0'))::NUMERIC,
    v->'recipe_overrides'
FROM inventory_items ii,
     jsonb_array_elements(ii.variants) v
WHERE ii.variants IS NOT NULL 
  AND jsonb_array_length(ii.variants) > 0;

COMMIT;
