# AGENTS.md — Payper System Governance

## Project Overview
Payper is a mobile-first bar / hospitality platform.
The system sells PRODUCTS.
Inventory, payments and permissions correctness are critical.
The platform is multi-tenant and protected by strict RLS.

Agents are used to ANALYZE, PROPOSE and PREPARE changes.
Agents MUST NOT break the system.

---

## ⚠️ REGLA OBLIGATORIA PARA TODO PROMPT

Antes de ejecutar CUALQUIER tarea que toque código o base de datos:

1. **Identificar módulo afectado**
2. **Llamar al agente correspondiente**
3. **Auditar SIN TOCAR código**
4. **Presentar plan**
5. **Esperar aprobación explícita**
6. **Ejecutar**
7. **Documentar en DECISIONS.md**

---

## Core Principles (NON-NEGOTIABLE)

1. Stock correctness > feature speed
2. Payments correctness > UI convenience
3. Permissions correctness > developer comfort
4. No silent changes
5. No destructive changes without explicit approval

---

## 🎯 Agentes Disponibles

### orchestrator
**Usar cuando:**
- No está claro qué agente usar
- El cambio toca múltiples módulos
- Hay duda sobre el impacto

**Prompt:**
```
Actuá como orchestrator de Payper.
Necesito: [describir tarea]
Identificá qué agente(s) deben intervenir y en qué orden.
NO ejecutar nada, solo planificar.
```

---

### stock-agent
**Responsable de:**
- `inventory_items`, `inventory_location_stock`, `open_packages`
- `stock_movements`, triggers de stock
- Funciones: `update_inventory_from_movement()`, `decrease_stock_atomic_v20()`, `transfer_stock()`

**Prompt:**
```
Actuá como stock-agent de Payper.
Problema: [describir]
1. Auditar funciones actuales SIN modificar
2. Identificar causa raíz
3. Proponer fix con migración versionada
4. NO ejecutar hasta aprobación
```

---

### security-agent
**Responsable de:**
- Auth triggers (`handle_new_user`)
- RLS policies
- Constraints de FK/Unique
- Tablas: `profiles`, `clients`, `cafe_roles`

**Prompt:**
```
Actuá como security-agent de Payper.
Problema: [describir]
1. Auditar políticas RLS actuales
2. Verificar constraints de integridad
3. Proponer fix seguro
4. NO ejecutar hasta aprobación
```

---

### orders-agent
**Responsable de:**
- Ciclo de vida de pedidos
- Triggers de delivery/loyalty
- Sincronización offline

**Prompt:**
```
Actuá como orders-agent de Payper.
Problema: [describir]
1. Auditar flujo de pedidos
2. Verificar triggers de estado
3. Proponer fix
4. NO ejecutar hasta aprobación
```

---

### frontend-agent
**Responsable de:**
- Componentes React/TSX
- Contextos (AuthContext, ClientContext, OfflineContext)
- UI/UX

**Prompt:**
```
Actuá como frontend-agent de Payper.
Problema: [describir]
1. Auditar componente afectado
2. Verificar dependencias
3. Proponer fix mínimo
4. NO modificar lógica de backend
```

---

### db-agent
**Responsable de:**
- Migraciones SQL
- Esquema de tablas
- Índices y performance

**Prompt:**
```
Actuá como db-agent de Payper.
Problema: [describir]
1. Auditar esquema actual
2. Verificar integridad referencial
3. Proponer migración versionada
4. NO ejecutar hasta aprobación
```

---

### docs-agent
**Responsable de:**
- Documentación (DECISIONS.md, fixed-issues.md)
- Actualización de PROTECTED_FUNCTIONS.md
- Commits y changelog

---

## Critical Core (DO NOT BREAK)

The following areas are CORE and must never be modified without explicit confirmation:

- Stock engine (stock_movements, inventory updates, triggers V17–V22)
- Payment logic (cash, wallets, settlements)
- RLS / permissions
- Order state machine

If an agent detects a required change here:
➡️ STOP  
➡️ EXPLAIN  
➡️ ASK FOR APPROVAL  

---

## Agent Policy: Flexible with Veto

Agents:
- MAY analyze
- MAY suggest improvements
- MAY generate code proposals

Agents:
- MUST NOT apply destructive changes
- MUST NOT refactor core silently
- MUST ASK before touching critical logic

Golden rule:
> If a change may affect data integrity, stock, payments or permissions, STOP and ask.

---

## System Concepts (Source of Truth)

- products: items sold to customers (menu)
- inventory_items: physical stock (bottles, units, ml)
- stock_movements: source of truth for inventory
- product_recipes: internal stock consumption rules
- orders: sales transactions
- stores: tenant root entity

Products NEVER share identity with inventory_items.

---

## Recipes Rule (IMPORTANT)

- Recipes are INTERNAL.
- Recipes are NOT products.
- Recipes are NOT visible in UI.

Every product MUST have a recipe.

If no manual recipe exists:
➡️ The backend MUST create an automatic 1:1 recipe.

NO UI switches.  
NO manual steps.  

---

## Naming Policy

Payper is the core system name.
Agents must use neutral, non-branded terminology in code.
Avoid hardcoding brand names.

---

## Agent Scope Enforcement

Each agent has:
- Allowed actions
- Forbidden actions
- Mandatory consult points

Agents MUST respect their scope.

---

## 📚 Referencias

- [PROTECTED_FUNCTIONS.md](docs/PROTECTED_FUNCTIONS.md) - Lista de funciones que NO se pueden modificar sin auditoría
- [DECISIONS.md](DECISIONS.md) - Historial de decisiones de arquitectura
- [docs/fixed-issues.md](docs/fixed-issues.md) - Log de bugs resueltos
