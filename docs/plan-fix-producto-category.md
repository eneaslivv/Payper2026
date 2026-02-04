# Plan: Alta de producto falla por category_id en products

Fecha: 2026-02-04
Hora: 06:20 UTC

## Objetivo
Evitar el error "could not find the 'category_id' column of 'products'" al crear productos desde "Carga Suministro".

## Diagnostico
- El frontend intenta insertar `category_id`, `price` e `image_url` en `products`.
- En la BD, `products` no tiene esas columnas; usa `category`, `category_slug`, `base_price`, `image`.
- Resultado: PostgREST devuelve error de schema cache y el insert falla.

## Plan de accion
1) Confirmar columnas reales de `products` en produccion.
2) Ajustar payload de alta manual (PRODUCTO) para `products`:
   - Usar `category` (string) y `category_slug`.
   - Usar `base_price` en lugar de `price`.
   - Usar `image` en lugar de `image_url`.
3) Mantener payload actual para `inventory_items`:
   - `category_id`, `price`, `image_url`.
4) Ajustar update (`handleUpdateItem`) segun tabla:
   - Si `products`: `category`, `category_slug`, `base_price`, `image`.
   - Si `inventory_items`: `category_id`, `price`, `image_url`.
5) Mapear categoria:
   - Buscar nombre por `category_id` en `categories`.
   - Generar `category_slug` (lowercase + guiones).
6) Pruebas:
   - Crear producto con categoria.
   - Crear producto sin categoria.
   - Editar producto y validar persistencia sin errores.

## Resultado esperado
- Alta de producto exitosa.
- No hay errores de schema cache.
- Categoria y precio se guardan correctamente.
