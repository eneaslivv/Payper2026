# Payper Fixed Issues Log

## 2026-01-20 — Fix registro de clientes en /m/:slug

**Problema:** "Database error saving new user" al registrar clientes nuevos

**Causa raíz:** 
1. FK `profiles_id_fkey` no era DEFERRABLE (conflicto de timing con trigger)
2. Índice único `clients_auth_user_store_unique` tenía condición WHERE que impedía ON CONFLICT

**Solución aplicada:**
1. ALTER TABLE profiles - FK a DEFERRABLE INITIALLY DEFERRED
2. Recrear índice único en clients sin condición WHERE
3. Actualizar función handle_new_user con manejo robusto

**Archivos/objetos modificados:**
- `profiles_id_fkey` constraint
- `clients_auth_user_store_unique` index
- `handle_new_user()` function

**Estado:** ✅ Resuelto
**Fecha:** 2026-01-20

## 2026-01-20 — Fix Redirect Auth (Email Verification)

**Problema:** Al verificar email, el usuario era redirigido al admin panel o site root en lugar de volver al menú.

**Causa raíz:** falta de parámetro `emailRedirectTo` en `supabase.auth.signUp()`.

**Solución aplicada:**
1. Modificado `pages/client/AuthPage.tsx`:
   - Agregado `emailRedirectTo: \`\${window.location.origin}/#/m/\${slug}\``

**Acción Manual Requerida:**
- Configurar "Redirect URLs" en Supabase Auth Dashboard.
- Agregar: `http://localhost:3005/#/m/*` y dominio producción.
