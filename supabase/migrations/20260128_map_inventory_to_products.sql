-- PASO 1: MAPEO Y CREACIÓN DE PRODUCTOS
-- Este script NO altera order_items aún. Solo prepara la tabla de mapeo y crea los productos faltantes.

-- 1. Crear tabla temporal de mapeo
CREATE TABLE IF NOT EXISTS inventory_product_mapping (
    inventory_item_id UUID PRIMARY KEY,
    product_id UUID NOT NULL,
    action_taken TEXT, -- 'MATCHED', 'CREATED'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Función DO block para procesar el mapeo
DO $$
DECLARE
    v_inv_item RECORD;
    v_product_id UUID;
    v_action TEXT;
    v_store_id UUID := 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533'; -- ID Fijo para safety, o extraer dinámicamente
BEGIN
    -- Iterar sobre items que son 'sellable' O que están siendo usados en order_items (aunque digan 'ingredient')
    -- Para seguridad, filtramos inventory_items que tienen registro en order_items
    FOR v_inv_item IN 
        SELECT DISTINCT i.* 
        FROM inventory_items i
        JOIN order_items oi ON oi.product_id = i.id
        WHERE i.store_id = v_store_id
        -- Opcional: Filtrar solo lo que realmente parece vendible si hay ingredientes puros
    LOOP
        v_product_id := NULL;
        v_action := 'NONE';

        -- A. Buscar si ya existe un producto con el mismo nombre (Case insensitive trim)
        SELECT id INTO v_product_id 
        FROM products 
        WHERE store_id = v_inv_item.store_id 
        AND TRIM(LOWER(name)) = TRIM(LOWER(v_inv_item.name))
        LIMIT 1;

        -- B. Si existe, mapear
        IF v_product_id IS NOT NULL THEN
            v_action := 'MATCHED';
        ELSE
            -- C. Si NO existe, crear nuevo producto
            INSERT INTO products (
                store_id, 
                name, 
                description,
                base_price,
                image, 
                category,
                active,
                is_visible,
                created_at,
                updated_at
            ) VALUES (
                v_inv_item.store_id,
                v_inv_item.name,
                v_inv_item.description,
                v_inv_item.price,
                v_inv_item.image_url,
                COALESCE(v_inv_item.category_id::text, 'General'),
                TRUE,
                TRUE,
                NOW(),
                NOW()
            ) RETURNING id INTO v_product_id;
            
            v_action := 'CREATED';
        END IF;

        -- D. Registrar Mapeo
        IF v_product_id IS NOT NULL THEN
            INSERT INTO inventory_product_mapping (inventory_item_id, product_id, action_taken)
            VALUES (v_inv_item.id, v_product_id, v_action)
            ON CONFLICT (inventory_item_id) DO UPDATE 
            SET product_id = EXCLUDED.product_id, action_taken = EXCLUDED.action_taken;
        END IF;

    END LOOP;
END;
$$;

-- 3. Verificar resultados
SELECT * FROM inventory_product_mapping;
