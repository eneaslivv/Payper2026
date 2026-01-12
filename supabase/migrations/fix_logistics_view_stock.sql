-- HEAVY LOGISTICS STOCK FIX - Phase 3
-- 1. Helper function for consistent name normalization
CREATE OR REPLACE FUNCTION public.normalize_location_name(p_name text)
RETURNS text AS $$
BEGIN
    RETURN REGEXP_REPLACE(LOWER(COALESCE(p_name, '')), '^(barra: |barra |bar: |punto de almacenamiento )|[^a-z0-9]', '', 'g');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Fixed get_location_stock (METRICS)
CREATE OR REPLACE FUNCTION public.get_location_stock(p_location_id uuid)
RETURNS TABLE (
    total_items integer,
    total_closed_units integer,
    total_open_packages integer,
    total_effective_stock numeric,
    estimated_value numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_norm text;
    v_full_name text;
BEGIN
    SELECT public.normalize_location_name(name), name INTO v_norm, v_full_name 
    FROM public.storage_locations WHERE id = p_location_id;

    RETURN QUERY
    WITH 
    -- Closed stock
    cs AS (
        SELECT ils.item_id, ils.closed_units, ii.cost, ii.package_size
        FROM public.inventory_location_stock ils
        JOIN public.inventory_items ii ON ii.id = ils.item_id
        WHERE ils.location_id = p_location_id
    ),
    -- Open from standalone table
    ots AS (
        SELECT op.inventory_item_id as item_id, op.remaining, ii.cost
        FROM public.open_packages op
        JOIN public.inventory_items ii ON ii.id = op.inventory_item_id
        WHERE op.location_id = p_location_id OR public.normalize_location_name(op.location) = v_norm
    ),
    -- Open from global JSONB
    igo AS (
        SELECT ii.id as item_id, (pkg->>'remaining')::numeric as remaining, ii.cost
        FROM public.inventory_items ii,
             jsonb_array_elements(ii.open_packages) pkg
        WHERE public.normalize_location_name(pkg->>'location') = v_norm
    ),
    combined AS (
        SELECT item_id, units, rem, cst, psize FROM (
            SELECT item_id, closed_units as units, 0::numeric as rem, cost as cst, package_size as psize FROM cs
            UNION ALL
            SELECT item_id, 0 as units, remaining as rem, cost as cst, 1 as psize FROM ots
            UNION ALL
            SELECT item_id, 0 as units, remaining as rem, cost as cst, 1 as psize FROM igo
        ) s
    )
    SELECT
        COUNT(DISTINCT item_id)::integer,
        SUM(units)::integer,
        (SELECT COUNT(*)::integer FROM (SELECT 1 FROM ots UNION ALL SELECT 1 FROM igo) o),
        SUM(units * COALESCE(psize, 1) + rem)::numeric,
        SUM((units * COALESCE(psize, 1) + rem) * COALESCE(cst, 0))::numeric
    FROM combined;
END;
$$;

-- 3. Fixed get_location_stock_details (LIST)
CREATE OR REPLACE FUNCTION public.get_location_stock_details(p_location_id uuid)
RETURNS TABLE (
    id uuid,
    item_id uuid,
    closed_units integer,
    open_packages jsonb,
    item_name text,
    item_unit_type text,
    item_image_url text,
    item_cost numeric,
    item_package_size numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_loc_name text;
    v_norm text;
BEGIN
    SELECT name, public.normalize_location_name(name) INTO v_loc_name, v_norm 
    FROM public.storage_locations WHERE id = p_location_id;

    RETURN QUERY
    WITH
    cs AS (
        SELECT ils.item_id as iid, ils.closed_units as units, ils.id as sid
        FROM public.inventory_location_stock ils
        WHERE ils.location_id = p_location_id
    ),
    ots AS (
        SELECT op.inventory_item_id as iid, jsonb_agg(op.*) as pkgs
        FROM public.open_packages op
        WHERE op.location_id = p_location_id 
           OR public.normalize_location_name(op.location) = v_norm
        GROUP BY op.inventory_item_id
    ),
    igo AS (
        SELECT ii.id as iid, jsonb_agg(pkg) as pkgs
        FROM public.inventory_items ii,
             jsonb_array_elements(ii.open_packages) pkg
        WHERE public.normalize_location_name(pkg->>'location') = v_norm
        GROUP BY ii.id
    ),
    all_item_ids AS (
        SELECT iid FROM cs
        UNION SELECT iid FROM ots
        UNION SELECT iid FROM igo
    )
    SELECT
        COALESCE((SELECT sid FROM cs WHERE cs.iid = a.iid), '00000000-0000-0000-0000-000000000000'::uuid) as id,
        a.iid as item_id,
        COALESCE((SELECT units FROM cs WHERE cs.iid = a.iid), 0)::integer as closed_units,
        (
            SELECT jsonb_agg(p)
            FROM (
                SELECT jsonb_array_elements(COALESCE((SELECT pkgs FROM ots WHERE ots.iid = a.iid), '[]'::jsonb)) as p
                UNION ALL
                SELECT jsonb_array_elements(COALESCE((SELECT pkgs FROM igo WHERE igo.iid = a.iid), '[]'::jsonb)) as p
            ) sub
        ) as open_packages,
        ii.name,
        ii.unit_type,
        ii.image_url,
        ii.cost,
        ii.package_size
    FROM all_item_ids a
    JOIN public.inventory_items ii ON ii.id = a.iid
    ORDER BY ii.name ASC;
END;
$$;
