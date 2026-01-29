-- Inspect schema of variants and recipes
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('product_variants', 'product_recipes', 'product_addons')
ORDER BY table_name, column_name;
