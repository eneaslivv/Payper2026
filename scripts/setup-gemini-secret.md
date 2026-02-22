# 🔑 CONFIGURAR GEMINI API EN SUPABASE

## 🚨 PROBLEMA IDENTIFICADO

La funcionalidad de lectura de facturas con AI falló porque:

1. ❌ **Modelo Gemini obsoleto**: `gemini-2.0-flash-exp` no existe
2. ❌ **Librería desactualizada**: v0.21.0 → v0.24.1  
3. ❌ **Secret faltante**: `GEMINI_API_KEY` no configurado en Supabase

## ✅ CORRECCIONES YA APLICADAS

### **1. Edge Function Actualizada:**
- ✅ Modelo cambiado a: `gemini-1.5-pro-latest`
- ✅ Librería actualizada a: `@google/generative-ai@0.24.1`

### **2. Deploy Frontend:**
- ✅ React keys corregidas 
- ✅ Aplicación deployada: https://www.payperapp.io

## ⚠️ ACCIÓN REQUERIDA: CONFIGURAR SECRET

**Para reactivar la lectura de facturas, necesitas ejecutar:**

### **Opción A: Supabase Dashboard**
1. Ir a: https://supabase.com/dashboard/project/yjxjyxhksedwfeueduwl
2. Settings → Edge Functions → Environment Variables
3. Agregar:
   ```
   Variable: GEMINI_API_KEY
   Value: AIzaSyAucgOMqXeRDSb9IapXttkfbjW_Q43hXEI
   Scope: All Edge Functions
   ```

### **Opción B: Supabase CLI (Recomendada)**
```bash
# Instalar CLI
npm install -g supabase

# Login
supabase login

# Link project  
supabase link --project-ref yjxjyxhksedwfeueduwl

# Set secret
supabase secrets set GEMINI_API_KEY=AIzaSyAucgOMqXeRDSb9IapXttkfbjW_Q43hXEI

# Deploy edge function actualizada
supabase functions deploy process-invoice
```

## 🧪 TESTING POST-CONFIGURACIÓN

Una vez configurado el secret:

1. **Ir a**: https://www.payperapp.io
2. **Navegar a**: Inventario → Procesador de Facturas
3. **Subir una factura** 
4. **Verificar que procese correctamente**:
   - ✅ Extrae productos
   - ✅ Extrae cantidades  
   - ✅ Extrae precios
   - ✅ Identifica proveedor
   - ✅ Actualiza inventario automáticamente

## 📋 FUNCIONALIDAD RESTAURADA

La IA debería volver a extraer correctamente:
- **Proveedor y datos fiscales**
- **Fecha y número de factura** 
- **Lista completa de productos**:
  - Nombre del producto
  - Cantidad/stock
  - Precio unitario
  - Subtotales
  - Bonificaciones/descuentos
- **Totales e IVA**
- **Actualización automática del inventario**

## ⚡ STATUS ACTUAL

- ✅ **Frontend**: Corregido y deployado
- ✅ **React Keys**: Eliminados errores críticos  
- ✅ **Edge Function**: Actualizada con modelo correcto
- ⏳ **Gemini Secret**: Pendiente de configuración
- ⏳ **Edge Function Deploy**: Pendiente

Una vez que configures el secret, la funcionalidad de facturas debería volver a funcionar perfectamente como antes.