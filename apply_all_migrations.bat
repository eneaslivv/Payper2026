@echo off
REM =============================================
REM Script para aplicar todas las migrations del 2026-02-13
REM Ejecutar desde: C:\Users\eneas\Downloads\livv\Payper\coffe payper
REM =============================================

echo.
echo ========================================
echo Aplicando Migrations 2026-02-13
echo ========================================
echo.

REM Verifica que supabase CLI este instalado
where supabase >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Supabase CLI no encontrado
    echo.
    echo Instala con: npm install -g supabase
    echo O usa: npx supabase
    pause
    exit /b 1
)

REM Verifica que estamos en el directorio correcto
if not exist "supabase\migrations" (
    echo ERROR: Directorio supabase\migrations no encontrado
    echo Ejecuta este script desde: C:\Users\eneas\Downloads\livv\Payper\coffe payper
    pause
    exit /b 1
)

echo Directorio: %CD%
echo.

REM Verifica conexion a Supabase
echo [1/6] Verificando conexion a Supabase...
supabase projects list >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: No estas autenticado en Supabase CLI
    echo.
    echo Ejecuta primero: supabase login
    pause
    exit /b 1
)
echo OK - Conectado
echo.

REM Link al proyecto si no esta linkeado
echo [2/6] Verificando link al proyecto...
supabase link --project-ref huwuwdghczpxfzkdvohz
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: No se pudo linkear al proyecto
    pause
    exit /b 1
)
echo OK - Proyecto linkeado
echo.

REM Aplicar migrations en orden
echo [3/6] Aplicando migration: rename_versioned_functions...
supabase db push --include-all
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Fallo al aplicar migrations
    pause
    exit /b 1
)
echo OK - Migrations aplicadas
echo.

REM Regenerar TypeScript types
echo [4/6] Regenerando TypeScript types...
supabase gen types typescript --project-id huwuwdghczpxfzkdvohz > src\types\database.types.ts
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: No se pudieron regenerar los types (puede ser normal si no tienes permisos)
) else (
    echo OK - Types regenerados
)
echo.

REM Verificar estado
echo [5/6] Verificando estado de migrations...
supabase db diff
echo.

echo [6/6] Verificando en base de datos...
echo Ejecutando queries de verificacion...

REM Crear archivo temporal con query de verificacion
echo SELECT COUNT(*) as total_migrations FROM supabase_migrations.schema_migrations; > verify_temp.sql
echo SELECT name FROM supabase_migrations.schema_migrations ORDER BY name DESC LIMIT 5; >> verify_temp.sql

supabase db execute --file verify_temp.sql
del verify_temp.sql

echo.
echo ========================================
echo COMPLETADO
echo ========================================
echo.
echo Migrations aplicadas correctamente!
echo.
echo Proximos pasos:
echo 1. Verifica en Supabase Dashboard que todo este OK
echo 2. Regenera types en frontend si es necesario
echo 3. Prueba las funcionalidades criticas
echo.

pause
