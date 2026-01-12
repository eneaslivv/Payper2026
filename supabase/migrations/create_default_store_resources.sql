-- Trigger to automatically create default resources for new stores
-- 1. Main Storage Point (is_default = true)

CREATE OR REPLACE FUNCTION public.initialize_new_store()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Create Default Storage Location
    INSERT INTO public.storage_locations (
        store_id,
        name,
        type,
        location_type,
        is_default,
        is_deletable
    ) VALUES (
        NEW.id,
        'Punto de Almacenamiento Principal',
        'warehouse', -- type enum
        'base',      -- location_type enum/text
        true,
        false        -- Protect default location
    );

    RETURN NEW;
END;
$$;

-- Drop trigger if exists to allow idempotent re-run
DROP TRIGGER IF EXISTS trg_initialize_new_store ON public.stores;

CREATE TRIGGER trg_initialize_new_store
AFTER INSERT ON public.stores
FOR EACH ROW
EXECUTE FUNCTION public.initialize_new_store();
