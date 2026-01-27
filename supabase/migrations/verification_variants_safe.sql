-- Verificación Unificada (Core Guardian)
SELECT 
    (SELECT count(*) FROM inventory_items WHERE variants IS NOT NULL AND jsonb_array_length(variants) > 0) as json_source_count,
    (SELECT count(*) FROM product_variants) as table_destination_count,
    (SELECT count(*) FROM inventory_items WHERE variants IS NULL AND id IN (SELECT product_id FROM product_variants)) as data_loss_check;
