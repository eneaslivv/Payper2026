# Fix: Pantalla "Configurando Cuenta" infinita

Fecha: 2026-02-03

## Objetivo
Evitar que la pantalla de "Configurando Cuenta" quede bloqueada cuando el perfil no se carga o falla la lectura de Supabase.

## Cambios realizados
1) Failsafe de 8 segundos con perfil de emergencia
   - Archivo: contexts/AuthContext.tsx
   - Se mantiene el timeout de 8s, pero ahora:
     - Fuerza la salida de loading.
     - Si hay usuario y no hay perfil, crea un perfil minimo de emergencia.
     - Intenta persistirlo en `profiles` con `upsert`; si falla, usa el perfil en memoria.

2) fetchProfile ahora libera loading en cualquier caso
   - Archivo: contexts/AuthContext.tsx
   - Se agrega `finally { setIsLoading(false) }` para evitar bloqueo.
   - Si el auto-heal falla, se crea un perfil de fallback en memoria.

3) Pantalla "Configurando Cuenta" con salidas claras
   - Archivo: App.tsx
   - Se mejora el UI con botones visibles y texto de ayuda:
     - "Recargar Pagina" (reload)
     - "Salir" (signOut)
     - Mensajes de guidance si tarda mas de 10 segundos.

4) Ajustes menores aplicados (observaciones)
   - Archivo: contexts/AuthContext.tsx
   - El failsafe depende solo de `isLoading` y usa refs para leer user/profile actual.
   - Logging del timeout incluye contexto (hasUser/hasProfile/userId/email).
   - Validacion de role en perfil de emergencia y fallback.

## Archivos tocados
- contexts/AuthContext.tsx
  - Failsafe de 8s con perfil de emergencia y guardado opcional.
  - `fetchProfile` con `finally` y fallback en memoria.
  - Logging con contexto y validacion de role.
- App.tsx
  - UI mejorada de "Configurando Cuenta" y boton de salida con `signOut()`.

## Notas operativas
- El failsafe no bloquea el flujo: si el perfil no existe o falla la carga, siempre se libera la UI.
- El perfil de emergencia evita quedar atrapado mientras se reintenta el perfil real.

## Como probar
1) Login con perfil inexistente y esperar >8s.
2) Simular red lenta/offline y confirmar que nunca queda en loading.
3) Verificar que "Salir" ejecuta cierre de sesion.
