-- Migration: Restore Variants Sync & Backfill
-- Context: Core Guardian Audit found 0 product_variants but 3 items with JSON variants.
-- Action: Re-install trigger and force update to populate table.

BEGIN;

-- 1. Re-create the Sync Function (Logic extracted from fix_variant_sync_trigger.sql)
CREATE OR REPLACE FUNCTION public.sync_inventory_config_to_relational()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_tenant_id UUID;
    v_valid_uuid_regex TEXT := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
    -- Obtener tenant_id (Fallback safely)
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
            FROM jsonb_array_elements(NEW.variants) v;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- 2. Attach Trigger (If missing)
DROP TRIGGER IF EXISTS trg_sync_inventory_config ON inventory_items;
CREATE TRIGGER trg_sync_inventory_config
    AFTER INSERT OR UPDATE OF variants ON inventory_items
    FOR EACH ROW
    EXECUTE FUNCTION sync_inventory_config_to_relational();

-- 3. FORCE BACKFILL (Trigger the update implies logic)
-- We touch the 'variants' column to fire the trigger for rows that have data.
UPDATE inventory_items 
SET variants = variants 
WHERE variants IS NOT NULL 
AND jsonb_array_length(variants) > 0;

COMMIT;
