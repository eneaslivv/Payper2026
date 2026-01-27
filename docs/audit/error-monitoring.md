# Error Monitoring Design (Core-Guardian)

Status: design only
Last updated: 2026-01-27

## Goal
Provide error monitoring without breaking current behavior, ensuring strict multi-tenant isolation.
No dependency installation in this phase.

## Recommended Tool
Sentry (primary recommendation)
- Covers frontend + edge/serverless.
- Strong PII controls and sampling.
- Supports tags for tenant isolation.

Alternatives (not preferred)
- LogRocket: heavier, session replay may increase PII risk.
- Custom logging: higher maintenance and delayed time-to-value.

## Multi-Tenant Strategy
- Canonical tenant id: store_id (UUID)
- Secondary context: store_slug (human-readable)
- Required tags on every event: store_id, environment, release
- If store_id is missing: route to an "unassigned" bucket and alert internally

## Integration Points

Frontend (Vite/React)
- Initialize monitoring early (prefer src/main.tsx)
- Keep existing ErrorBoundary and wire it to capture errors
- Capture unhandled exceptions and promise rejections (avoid double-reporting)
- Route breadcrumbs and performance tracing via react-router-dom
- Tag context from AuthContext (store_id, user_id, role)

Edge Functions (Supabase)
- Wrap function handlers with a shared error capture utility
- Collect store_id from:
  - Request body
  - Query params
  - JWT claims (if available)
- Attach requestId/traceId for correlation

## Data to Capture (Minimum Set)
- store_id (required)
- store_slug (optional)
- user_id (UUID only, no email)
- role
- route, feature, app_mode
- environment, release, build_id
- requestId, traceId
- browser/os/device (auto)

## Privacy and PII Rules
- DO NOT log: emails, names, phones, addresses, card data, tokens, payment payloads
- Denylist fields: email, phone, address, token, password, card
- Sanitize request/response bodies before capture
- Keep retention to 30-90 days
- Use sampling in non-prod to reduce noise

## Rollout Plan (No Code Yet)
1) Confirm single entrypoint for app init (src/main.tsx vs index.tsx)
2) Define tenant source of truth: store_id from validated auth/JWT claims only
3) Define tag allowlist + PII deny-by-default; separate handling for unassigned tenant
4) Add monitoring init and ErrorBoundary capture with dedupe strategy
5) Add edge wrapper for functions (no body capture, preserve status/headers)
6) Define release/build_id source of truth (no tenant data)
7) Validate with a controlled error in dev

## Safety Checks
- No production behavior changes
- No config changes without approval
- No dependency installation in this phase

## Implementation Guardrails (Core-Guardian Review)
- Derive store_id from validated auth/JWT claims only (avoid body/query spoofing)
- Treat store_id as immutable per request; if missing/invalid, tag tenant_unassigned
- PII policy is deny-by-default; allowlist must be opt-in and versioned
- Do not capture request bodies by default in edge functions
- Add beforeSend and beforeBreadcrumb scrubbing (denylist + allowlist)
- Allowlist tags only (store_id, store_slug, environment, release, role, route)
- Send missing store_id events to a separate internal-only bucket or drop in prod
- Define dedupe strategy to avoid double reporting (ErrorBoundary vs global handlers)
- Define release/build_id source of truth with no tenant data
- Sanitize URLs to remove query params in tracing
- Non-breaking acceptance: zero behavior changes on non-error paths
- Performance budget: cap added latency and bundle size impact
