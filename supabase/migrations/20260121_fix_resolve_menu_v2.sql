-- Migration: Fix resolve_menu RPC to respect menu_rules and priority
-- Created: 2026-01-21
-- Description: Updates resolve_menu to check menu_rules for table assignment, fallback flag, and priority column.

CREATE OR REPLACE FUNCTION public.resolve_menu(
    p_store_id uuid,
    p_session_type text DEFAULT 'generic'::text,
    p_table_id uuid DEFAULT NULL::uuid,
    p_bar_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_menu_id UUID;
BEGIN
    -- Priority 1: Check for table-specific menu assignment via menu_rules
    -- Select highest priority active menu that has this table in its rules
    IF p_table_id IS NOT NULL THEN
        SELECT m.id INTO v_menu_id
        FROM menus m
        JOIN menu_rules mr ON m.id = mr.menu_id
        WHERE m.store_id = p_store_id
          AND m.is_active = TRUE
          AND mr.is_active = TRUE
          AND mr.rule_type = 'tables'
          -- Check if table_ids array contains the p_table_id
          AND mr.rule_config->'table_ids' @> jsonb_build_array(p_table_id)
        ORDER BY m.priority DESC, m.created_at DESC
        LIMIT 1;
        
        IF v_menu_id IS NOT NULL THEN
            RETURN v_menu_id;
        END IF;
    END IF;

    -- Priority 2: Fallback / Default Menu
    -- Select highest priority active menu marked as fallback
    SELECT id INTO v_menu_id
    FROM menus
    WHERE store_id = p_store_id
      AND is_active = TRUE
      AND is_fallback = TRUE
    ORDER BY priority DESC, created_at DESC
    LIMIT 1;

    -- 3. Any active menu (Last resort)
    -- If no rule matched and no fallback exists, return any active menu
    IF v_menu_id IS NULL THEN
         SELECT id INTO v_menu_id
        FROM menus
        WHERE store_id = p_store_id
          AND is_active = TRUE
        ORDER BY priority DESC, created_at DESC
        LIMIT 1;
    END IF;

    RETURN v_menu_id;
END;
$function$;
