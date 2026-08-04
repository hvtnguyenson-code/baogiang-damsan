# ADR-009 — UI design system and auth vertical slice

## Status

Accepted for `PHASE-01-UI-DESIGN-SYSTEM-FOUNDATION-001`.

## Decision

The project adopts **Sổ công tác Đam San** as its operational visual direction. Root `DESIGN.md` is the visual authority, followed by `.codex/skills/damsan-ui/SKILL.md`, this ADR/checklist, external references, and finally the obsolete Phase 00 prototype.

The palette is locked to ink, school, basalt, mist, paper, and line tokens plus accessible semantic states. Be Vietnam Pro is the primary self-hosted UI font; IBM Plex Mono is restricted to technical/data utility. The basalt margin rail is the only signature accent and must carry section or workflow meaning.

The initial component system is project-owned and native-first: buttons, form fields, alerts, loading/recovery, and page frame primitives. No shadcn, Radix, Base UI, or React Aria primitive dependency is introduced. When a real modal, menu, or combobox appears, one accessible primitive system may be evaluated in a separate decision; systems must not be mixed.

`GET /api/auth/me` is the browser authentication source of truth through an HttpOnly cookie. The client stores no token, cookie, password, or hash. Public login and status routes live outside the authenticated shell. Protected routing distinguishes checking, anonymous, first-login-required, authenticated, and recoverable error states. A 401 invalidates auth; a 403 remains an authorization denial.

Visual evidence is produced as CI artifacts rather than committed screenshots. Automated axe checks supplement, but do not replace, native semantics and keyboard review.

## Consequences

- Phase 00 hero/card-grid, fake tab navigation, Inter/default blue styling, and blanket entrance animation are removed.
- Only real routes are shown; capability lists are never translated into a displayed role.
- Authentication UI can evolve without changing backend contracts.
- UI tasks must follow the principal project skill and design authority before implementation.
