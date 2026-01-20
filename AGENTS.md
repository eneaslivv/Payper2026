# AGENTS.md — Payper System Governance

## Project Overview
Payper is a mobile-first bar / hospitality platform.
The system sells PRODUCTS.
Inventory, payments and permissions correctness are critical.
The platform is multi-tenant and protected by strict RLS.

Agents are used to ANALYZE, PROPOSE and PREPARE changes.
Agents MUST NOT break the system.

---

## Core Principles (NON-NEGOTIABLE)

1. Stock correctness > feature speed
2. Payments correctness > UI convenience
3. Permissions correctness > developer comfort
4. No silent changes
5. No destructive changes without explicit approval

---

## Critical Core (DO NOT BREAK)

The following areas are CORE and must never be modified without explicit confirmation:

- Stock engine (stock_movements, inventory updates, triggers V17–V19)
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
