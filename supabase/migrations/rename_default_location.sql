-- Rename the default location to "Stock General" for better UX
-- and update the creation function to use this name in the future

-- 1. Update existing default locations
UPDATE public.storage_locations
SET name = 'Stock General'
WHERE is_default = true AND name = 'Almacenamiento General';

-- 2. Update the function to use 'Stock General' for new stores
CREATE OR REPLACE FUNCTION public.create_default_location(p_store_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_location_id uuid;
BEGIN
    SELECT id INTO v_location_id FROM public.storage_locations 
    WHERE store_id = p_store_id AND is_default = true LIMIT 1;
    
    IF v_location_id IS NULL THEN
        INSERT INTO public.storage_locations (store_id, name, type, location_type, is_default, is_deletable, is_consumable)
        VALUES (p_store_id, 'Stock General', 'warehouse', 'base', true, false, false)
        RETURNING id INTO v_location_id;
    END IF;
    
    RETURN v_location_id;
END;
$$;
