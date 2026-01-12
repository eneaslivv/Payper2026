-- 1. Make the Sync Function Robust against Invalid UUIDs
CREATE OR REPLACE FUNCTION public.sync_inventory_config_to_relational()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_tenant_id UUID;
    v_valid_uuid_regex TEXT := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
    -- Obtener tenant_id (asumimos store_id de inventory_items es el tenant)
    v_tenant_id := NEW.store_id;

    -- 1. Sincronizar Variantes
    IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND OLD.variants IS DISTINCT FROM NEW.variants) THEN
        DELETE FROM product_variants WHERE product_id = NEW.id;
        
        IF NEW.variants IS NOT NULL AND jsonb_array_length(NEW.variants) > 0 THEN
            INSERT INTO product_variants (id, product_id, tenant_id, name, price_delta, recipe_overrides)
            SELECT 
                CASE 
                    WHEN (v->>'id') ~ v_valid_uuid_regex THEN (v->>'id')::UUID 
                    ELSE gen_random_uuid() 
                END,
                NEW.id,
                v_tenant_id,
                v->>'name',
                (COALESCE(v->>'price_adjustment', '0'))::NUMERIC,
                v->'recipe_overrides'
            FROM jsonb_array_elements(NEW.variants) v
            WHERE EXISTS (SELECT 1 FROM products p WHERE p.id = NEW.id); -- Safety Check
        END IF;
    END IF;

    -- 2. Sincronizar Addons (Extras)
    IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND OLD.addons IS DISTINCT FROM NEW.addons) THEN
        DELETE FROM product_addons WHERE product_id = NEW.id;
        
        IF NEW.addons IS NOT NULL AND jsonb_array_length(NEW.addons) > 0 THEN
            INSERT INTO product_addons (id, product_id, tenant_id, name, price, inventory_item_id, quantity_consumed)
            SELECT 
                CASE 
                    WHEN (a->>'id') ~ v_valid_uuid_regex THEN (a->>'id')::UUID 
                    ELSE gen_random_uuid() 
                END,
                NEW.id,
                v_tenant_id,
                a->>'name',
                (COALESCE(a->>'price', '0'))::NUMERIC,
                (a->>'inventory_item_id')::UUID,
                (COALESCE(a->>'quantity_consumed', '0'))::NUMERIC
            FROM jsonb_array_elements(NEW.addons) a
            WHERE EXISTS (SELECT 1 FROM products p WHERE p.id = NEW.id); -- Safety Check
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- 2. Repair Data: Replace 'var-' and 'add-' IDs with valid UUIDs in inventory_items JSONB
DO $$
DECLARE
    r RECORD;
    v JSONB;
    new_variants JSONB;
    new_addons JSONB;
    new_id UUID;
    modified BOOL;
    v_valid_uuid_regex TEXT := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
    FOR r IN SELECT id, variants, addons FROM inventory_items LOOP
        modified := false;
        new_variants := '[]'::jsonb;
        new_addons := '[]'::jsonb;
        
        -- Fix Variants
        IF r.variants IS NOT NULL AND jsonb_array_length(r.variants) > 0 THEN
            FOR v IN SELECT * FROM jsonb_array_elements(r.variants) LOOP
                IF NOT (v->>'id' ~ v_valid_uuid_regex) THEN
                    new_id := gen_random_uuid();
                    v := jsonb_set(v, '{id}', to_jsonb(new_id));
                    modified := true;
                END IF;
                new_variants := new_variants || v;
            END LOOP;
        ELSE
            new_variants := r.variants;
        END IF;

        -- Fix Addons
        IF r.addons IS NOT NULL AND jsonb_array_length(r.addons) > 0 THEN
             FOR v IN SELECT * FROM jsonb_array_elements(r.addons) LOOP
                IF NOT (v->>'id' ~ v_valid_uuid_regex) THEN
                    new_id := gen_random_uuid();
                    v := jsonb_set(v, '{id}', to_jsonb(new_id));
                    modified := true;
                END IF;
                new_addons := new_addons || v;
            END LOOP;
        ELSE
            new_addons := r.addons;
        END IF;
        
        IF modified THEN
            UPDATE inventory_items 
            SET variants = new_variants, 
                addons = new_addons 
            WHERE id = r.id;
        END IF;
    END LOOP;
END $$;
