---
trigger: on_error
---

# PROTOCOLO DE REPORTE DE ERRORES (STRICT MODE)

Cuando se detecte un error, SIEMPRE estructurarlo en este formato:

## TEMPLATE DE ERROR
````yaml
ERROR_ID: [AUTO-GENERADO: ERR-{YYYYMMDD}-{###}]
SEVERIDAD: [CRÍTICO | ALTO | MEDIO | BAJO]
MÓDULO: [Nombre del archivo/componente afectado]
TIPO: [RUNTIME | BUILD | TYPE | LOGIC | SECURITY | DATA]

DESCRIPCIÓN:
  - Qué: [Descripción concisa del problema]
  - Dónde: [Archivo:Línea o Ruta completa]
  - Cuándo: [Condiciones para reproducir]

CONTEXTO_CÓDIGO:
```typescript
  // Código problemático (máx 15 líneas)
```

DEPENDENCIAS_AFECTADAS:
  - [Lista de archivos que dependen de este código]

SOLUCIÓN_PROPUESTA:
  - Opción A: [Descripción + cambios mínimos necesarios]
  - Opción B: [Alternativa si aplica]

RIESGO_DE_REGRESIÓN:
  - [ ] Bajo: Cambio aislado
  - [ ] Medio: Afecta otros componentes
  - [ ] Alto: Requiere cambios en múltiples archivos

PRE_CHECKLIST:
  - [ ] ¿El fix viola las reglas-maestras.md?
  - [ ] ¿Se necesita actualizar supabaseTypes.ts?
  - [ ] ¿Hay tests que cubran este código?
  - [ ] ¿El PRD.md define este comportamiento?

DOCUMENTOS_RELACIONADOS:
  - PRD: [Sección relevante]
  - DOCUMENTACION_SISTEMA: [Sección relevante]
  - known-gaps.md: [Si aplica]
````

## CATEGORÍAS DE ERROR

### 🔴 CRÍTICO (P0)
- Data leaks entre tenants
- RLS bypasses
- Auth failures
- Pérdida de datos

### 🟠 ALTO (P1)  
- Funcionalidad rota en producción
- Tipos desactualizados (supabaseTypes.ts)
- Errores de persistencia

### 🟡 MEDIO (P2)
- UX degradada
- Datos mock en producción
- Console errors

### 🟢 BAJO (P3)
- Warnings de linter
- Optimizaciones
- Código comentado

## REGLAS DE RESPUESTA

1. **NO ARREGLAR SIN CONFIRMAR**: Presenta el error estructurado y espera confirmación
2. **CAMBIOS QUIRÚRGICOS**: Solo tocar lo necesario (ref: reglas-maestras.md)
3. **VALIDAR CONTRA PRD**: El fix debe alinearse con PRD.md
4. **DOCUMENTAR EN known-gaps.md**: Si es un issue conocido, verificar si ya está documentado
