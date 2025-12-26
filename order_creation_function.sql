-- ==============================================
-- FUNCIÓN: Crear pedido con descuento automático de stock
-- CoffeeSaaS - Order Processing
-- ==============================================

-- Primero, crear la tabla order_items si no existe
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price_unit NUMERIC(10,2) NOT NULL,
    variant_name TEXT,
    addons JSONB DEFAULT '[]',
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS en order_items
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view order_items via orders"
ON order_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM orders 
    WHERE orders.id = order_items.order_id 
    AND orders.store_id = auth.get_user_store_id()
  )
);

CREATE POLICY "Users can insert order_items via orders"
ON order_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM orders 
    WHERE orders.id = order_items.order_id 
    AND orders.store_id = auth.get_user_store_id()
  )
);

-- ==============================================
-- FUNCIÓN RPC: Crear pedido completo
-- ==============================================
CREATE OR REPLACE FUNCTION create_order_with_stock_deduction(
    p_store_id UUID,
    p_customer_name TEXT,
    p_total_amount NUMERIC,
    p_status TEXT DEFAULT 'pending',
    p_order_items JSONB DEFAULT '[]'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_recipe RECORD;
BEGIN
    -- 1. Insertar el pedido principal
    INSERT INTO orders (store_id, customer_name, total_amount, status)
    VALUES (p_store_id, p_customer_name, p_total_amount, p_status)
    RETURNING id INTO v_order_id;
    
    -- 2. Insertar cada item del pedido
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_order_items)
    LOOP
        INSERT INTO order_items (
            order_id,
            product_id,
            name,
            quantity,
            price_unit,
            variant_name,
            addons,
            note
        ) VALUES (
            v_order_id,
            (v_item->>'product_id')::UUID,
            v_item->>'name',
            COALESCE((v_item->>'quantity')::INTEGER, 1),
            COALESCE((v_item->>'price_unit')::NUMERIC, 0),
            v_item->>'variant_name',
            COALESCE(v_item->'addons', '[]'),
            v_item->>'note'
        );
        
        -- 3. Descontar stock basado en las recetas del producto
        v_product_id := (v_item->>'product_id')::UUID;
        
        IF v_product_id IS NOT NULL THEN
            FOR v_recipe IN 
                SELECT pr.inventory_item_id, pr.quantity_required
                FROM product_recipes pr
                WHERE pr.product_id = v_product_id
            LOOP
                UPDATE inventory_items
                SET current_stock = current_stock - (v_recipe.quantity_required * COALESCE((v_item->>'quantity')::INTEGER, 1))
                WHERE id = v_recipe.inventory_item_id;
            END LOOP;
        END IF;
    END LOOP;
    
    -- 4. Retornar el resultado
    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'message', 'Pedido creado y stock descontado'
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- Otorgar permisos para ejecutar la función
GRANT EXECUTE ON FUNCTION create_order_with_stock_deduction TO authenticated;

-- ==============================================
-- NOTA: Ejecutar este script en Supabase SQL Editor
-- ==============================================
