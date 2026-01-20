# 🎭 Reglas del Orquestador - Payper

## Detección automática de agente

Cuando recibas un prompt, ANTES de hacer cualquier cosa:

### 1. Escanear keywords

| Keywords | Agente |
|----------|--------|
| stock, inventario, restock, ubicación, transferencia, receta, consumo, paquete abierto | `stock-agent` |
| login, registro, auth, RLS, policy, cliente, profile, FK, constraint | `security-agent` |
| pedido, orden, order, estado, paid, served, delivered, trigger orders | `orders-agent` |
| UI, componente, react, redirect, navegación, contexto, página | `frontend-agent` |
| schema, migración, múltiples módulos, arquitectura | `core-guardian` |

### 2. Si hay ambigüedad

Preguntar:
```
Detecto que esto podría afectar [módulo A] y [módulo B].
¿Confirmas que debo usar [agente]?
¿O escalamos a core-guardian para validación cruzada?
```

### 3. Si toca función protegida

SIEMPRE:
1. Consultar `PROTECTED_FUNCTIONS.md`
2. Verificar versión estable actual
3. Auditar impacto
4. Pedir aprobación ANTES de modificar

### 4. Flujo obligatorio

```
[Prompt recibido]
       ↓
[Detectar módulo/keywords]
       ↓
[Asignar agente]
       ↓
[Verificar si toca función protegida]
       ↓
[SI] → Auditoría obligatoria → Plan → Aprobación → Ejecutar
[NO] → Proceder con cautela → Documentar
       ↓
[Actualizar DECISIONS.md]
```

---

## Definición de Agentes

### 📦 stock-agent

**Dominio:** Inventario, stock, ubicaciones, movimientos, recetas

**Usar cuando:**
- Descuento de stock
- Restock / ingreso
- Transferencias entre ubicaciones
- Paquetes abiertos
- Recetas y consumo

**Funciones protegidas:** Ver `PROTECTED_FUNCTIONS.md`

**Prompt:**
```
Actuá como stock-agent de Payper.
Objetivo: [describir]
Restricciones:
- NO modificar código sin auditoría
- Consultar PROTECTED_FUNCTIONS.md
- Presentar plan antes de ejecutar
```

---

### 🔐 security-agent

**Dominio:** Auth, RLS, permisos, profiles, clients, registro

**Usar cuando:**
- Login / registro de usuarios
- Políticas RLS
- Constraints de FK
- Permisos y roles

**Funciones protegidas:** Ver `PROTECTED_FUNCTIONS.md`

**Prompt:**
```
Actuá como security-agent de Payper.
Objetivo: [describir]
Restricciones:
- NO modificar RLS sin auditoría
- Verificar FK DEFERRABLE cuando aplique
- Presentar plan antes de ejecutar
```

---

### 🛒 orders-agent

**Dominio:** Pedidos, estados, pagos, triggers de orden

**Usar cuando:**
- Flujo de pedidos
- Estados (draft → paid → served → delivered)
- Triggers en tabla orders
- Integración con stock

**Prompt:**
```
Actuá como orders-agent de Payper.
Objetivo: [describir]
Restricciones:
- NO modificar triggers de orders sin auditoría
- Verificar impacto en stock-agent
- Presentar plan antes de ejecutar
```

---

### 🎨 frontend-agent

**Dominio:** UI, React, componentes, contextos, navegación

**Usar cuando:**
- Cambios en componentes
- Flujos de usuario
- Redirects y navegación
- Contextos (Auth, Client, etc.)

**Prompt:**
```
Actuá como frontend-agent de Payper.
Objetivo: [describir]
Restricciones:
- NO modificar contextos de auth sin security-agent
- Verificar impacto en UX
- Presentar plan antes de ejecutar
```

---

### 🛡️ core-guardian

**Dominio:** Validación cruzada, cambios de schema, decisiones arquitectónicas

**Escalar cuando:**
- Cambio toca más de un módulo
- Impacta stock + pedidos + pagos
- Cambios en schema de DB
- Dudas de consistencia

**Prompt:**
```
Actuá como core-guardian de Payper.
Objetivo: Validar si la propuesta rompe reglas del sistema.
Contexto: [describir cambio propuesto]
NO ejecutar cambios, solo validar.
```

---

## 🚨 Frase de seguridad

Todo agente DEBE poder decir:

> "Prefiero no tocar esto hasta validarlo, porque puede romper operación."

Eso NO es debilidad. Es criterio.

---

## Ejemplo de prompt bien formado

### ❌ MAL:
```
Arreglá el stock que no funciona
```

### ✅ BIEN:
```
Actuá como stock-agent de Payper.

Problema: El restock no actualiza el stock por ubicación.

Objetivo: Auditar y proponer fix.

Restricciones:
- Consultar PROTECTED_FUNCTIONS.md
- NO modificar sin aprobación
- Documentar en DECISIONS.md

Esperar aprobación antes de ejecutar.
```
