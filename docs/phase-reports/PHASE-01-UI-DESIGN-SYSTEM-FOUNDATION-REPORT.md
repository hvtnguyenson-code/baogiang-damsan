# Phase 01 UI Design System Foundation Report

## Scope and base

Work packet `PHASE-01-UI-DESIGN-SYSTEM-FOUNDATION-001` on `phase/01-ui-design-system-foundation`, based on `f979264539bc5c55e47281f39e247d43b40991e6`.

## Pre-change frontend audit

- `HomePage` was a centered Phase 00 hero card followed by an equal info-card grid rather than an operational workspace.
- `AppLayout` showed an obsolete Phase 00 badge and wrapped every route, including future public auth pages, in the same shell.
- Route navigation used `role="tablist"`, `role="tab"`, and `aria-selected` without a tab-panel widget or tab keyboard model.
- Inter, default Tailwind blue, large rounded cards, icon tiles, shadows, and global entrance animation produced a generic template appearance.
- `transition-all`, smooth scrolling, and automatic fade/slide definitions conflicted with the new interaction and reduced-motion rules.
- The API client handled only health GETs, did not explicitly send same-origin credentials, assumed every success had JSON, and exposed unnormalized response bodies on errors.
- There was no auth bootstrap, protected route, safe intended destination, first-login password flow, session expiry handling, or project UI authority.
- Health functionality and its unit/API coverage were valid and needed redesign rather than removal.

## Design foundation

`DESIGN.md`, the `damsan-ui` principal skill, ADR-009, source/license attribution, and the engineering checklist establish **Sổ công tác Đam San**. The locked palette, self-hosted Be Vietnam Pro/IBM Plex Mono typography, restrained geometry, native semantics, and functional basalt margin rail replace the Phase 00 template language.

## Implementation and verification

### Governance, tokens, and application structure

- `.codex/skills/damsan-ui/SKILL.md` is the sole project UI skill and requires the sequence audit → wireframe → token check → implementation → screenshot critique → accessibility check. Root `DESIGN.md` is the higher visual authority.
- `AGENTS.md`, ADR-009, the UI engineering checklist, and the source/license record make the authority and Antigravity boundary explicit.
- The semantic foundation uses ink `#15242E`, school blue `#1F4358`, basalt `#A7462F`, mist `#F3F6F7`, paper `#FFFFFF`, and defined line/status colors. It uses restrained 2/4/8 px geometry and no default elevation.
- Be Vietnam Pro 400/500/600/700 and IBM Plex Mono 400/500 are self-hosted from package assets. The former Google Fonts/Inter dependency was removed.
- Project-owned native-first primitives cover the real slice only: button, form field, alert, loading, and recovery. No second primitive or icon system was added.
- The authenticated shell has a semantic skip link, compact identity masthead, route links with `aria-current`, display name without a derived role, and logout. Public auth and diagnostic pages do not inherit the authenticated shell.

### Auth vertical slice behavior

- The centralized typed API client covers login, `/auth/me`, change-password, logout/logout-all, and health; sends `credentials: 'same-origin'`; safely accepts 204/empty bodies; and exposes normalized errors without raw response bodies.
- `/auth/me` is the source of truth for explicit `checking`, `anonymous`, `firstLoginRequired`, `authenticated`, and `error` states. Login and password change invalidate and refetch it before routing; logout clears query state.
- Routes are canonical at `/dang-nhap`, `/doi-mat-khau-lan-dau`, `/`, `/trang-thai-he-thong`, and `/khong-co-quyen`, with compatibility redirects for `/login` and `/system-status`.
- Protected routing preserves only safe internal destinations, prevents protected-content flash and redirect loops, separates 401 from 403, and offers recovery when session verification is indeterminate.
- Login uses the real cookie API, native form semantics, accessible labels/autocomplete, paste-compatible password fields, retained loading labels, generic credential failure, and network recovery without registration or password-recovery fiction.
- First-login change matches the existing backend policy exactly: at least 12 characters with lowercase, uppercase, and a digit, plus client confirmation. A successful mutation refreshes `/me`, enters the workspace, and survives reload through the HttpOnly cookie.
- Workspace and system status contain only factual foundation/health information; no role selector, fake metric, business CRUD, raw SQL, host, stack trace, or credential is rendered.

### Static, accessibility, and interaction evidence

- `npm run test:ui:static` includes a checker self-fixture and scans production web source for forbidden transition-all, gradient, backdrop/glass, h-screen, route tab roles, browser auth persistence, Inter configuration, and missing UI authority files.
- Web unit suite: **19/19 PASS** across API success/error/empty handling, credentials, 401/403 separation, auth bootstrap/recovery, login, first-login policy/change, safe redirects, logout, semantic navigation, no role selector, and health states.
- API unit suite: **64/64 PASS**. Existing API integration, schema static, secret scan, migration fresh/legacy, lint, typecheck, and builds remained green in isolated CI.
- Playwright: **3/3 PASS**. The API auth flow and UI auth flow use separate accounts. UI coverage includes anonymous redirect, generic invalid login, valid login, first-login routing, policy/confirmation errors, HTTP 200 password change, workspace, cookie reload, logout/post-logout protection, public health, keyboard focus order, and axe checks.
- Axe found no critical or serious WCAG-tagged violations on login, first-password-change, or workspace. Keyboard evidence covers skip link → support link → username and the complete native form flow; focus remains visibly rendered.

### CI fixture isolation

- `e2e-api-admin` belongs only to `auth-api.spec.ts`; `e2e-ui-admin` belongs only to `ui-foundation.spec.ts`.
- Both accounts are created through the existing bootstrap CLI using fake workflow-only values in the isolated CI PostgreSQL service. No official database or production fixture endpoint is involved.
- Vite preview proxies `/api` only to the CI-local API process so browser requests retain same-origin cookie behavior.

### Screenshot critique and corrections

Green implementation run: [GitHub Actions 30911912642](https://github.com/hvtnguyenson-code/baogiang-damsan/actions/runs/30911912642), commit `4517c169a7c5434aa702d78d2d7370a8a40f6200`. Artifact `ui-foundation-screenshots`, ID `8893513551`, contains nine deterministic screenshots: login at 375×812 and 1366×768; first password change at 375×812 and 1366×768; workspace at 375×812, 1366×768, and 1920×1080; and ready/error-safe system status at 1366×768.

- Auth screens remain asymmetric and ledger-based on laptop, collapse to one usable column on mobile, and keep the primary action visible at 1366×768. They do not read as a centered marketing hero, card grid, or generic SaaS dashboard.
- Vietnamese glyphs and line height render correctly. The 375 px views show no horizontal overflow; navigation and controls retain usable touch dimensions. The 1920 px workspace deliberately keeps a bounded work column rather than stretching prose and ledger rows indefinitely.
- The basalt rail identifies auth context, workspace context, and diagnostic context; it is structural rather than scattered decoration.
- Status ready/error states carry text and symbol cues, reveal no internal detail, and keep retry visible. The screenshot helper now restores scroll position to the top after reload, fixing the first error-state artifact that began mid-page.
- The first CI failure (`30875884376`) exposed an incorrect test assumption about native Tab order; the test now verifies the real skip/support/form sequence. The second (`30876263328`) exposed a fresh-cache redirect after password mutation; auth state now invalidates and refetches `/me`, and E2E verifies the mutation response before navigation. Run `30911912642` confirms both corrections.

### Commits and CI

- `e1300f9` — UI authority, design system, auth vertical slice, tests, CI, and initial report.
- `0868714` — keyboard-order and deterministic screenshot correction.
- `4517c16` — forced auth refresh after password change plus response-level E2E evidence.
- Run `30911912642`: all schema/migration/security/static UI/lint/typecheck/unit/integration/build/Playwright/axe/screenshot steps PASS. The documentation-only closure commit is reverified by branch CI and its final run is reported in the task handoff.

## Boundaries

Backend source: **NO**. Schema/migration: **NO**. Authorization semantics: **NO**. Business CRUD: **NO**. VPS/official database: **NO**. Deploy/PR/merge: **NO**.

## Correction audit and closure

Correction base `29f86936accd006d22ba8fc3ce8112e11e2bf007` was audited downstream across the auth provider, login and first-login forms, app shell, route/query transitions, responsive targets, rendered copy, and typography.

- Logout now clears auth/query state only after success or an expected 401. Network, timeout, 4xx (other than 401), and 5xx failures preserve the authenticated/first-login view, expose a concise accessible alert, and offer a shared retry action in both shells.
- Login and first-login forms perform client validation before mutation, clear stale field errors, distinguish 401/input/network/server recovery copy, enforce current/new password difference, and preserve form values during network/5xx recovery.
- Mobile target and overflow assertions cover 320, 375, and 414px for login, first-login, and workspace. Vietnamese utility labels use Be Vietnam Pro; IBM Plex Mono remains limited to ASCII data/technical values. Technical implementation terms are excluded from rendered production copy and guarded by the static gate.
- Web unit suite: **22/22 PASS**. Static UI gate, typecheck, and lint pass locally. The Playwright suite was extended with mobile target/overflow checks and logout recovery evidence; the next isolated CI run must publish refreshed nine-image screenshot evidence.

Correction boundaries remain unchanged: backend/source feature/schema/migration/CI workflow/VPS/official database/deploy/PR/merge: **NO**.

## Correction-002 closure

Correction task `PHASE-01-UI-DESIGN-SYSTEM-FOUNDATION-CORRECTION-002` was implemented on the required branch from reviewed HEAD `77a0a3afa6f9117000d587f7e06399a294c3ac25`.

- Password-change 401 responses no longer notify the global unauthorized listener. The frontend rechecks `/auth/me`: a 200 response preserves first-login state and shows the current-password error; a 401 transitions to anonymous; network/5xx recovery preserves the current page without exposing backend details.
- The unit matrix now covers login blank/400-422/401/network/5xx and stale-field clearing; first-login client policy, current-password 401/session expiry, validation/network/5xx recovery, success refresh, and stale relational errors; logout success/401/network/5xx/retry behavior; and rendered-copy safety.
- E2E logout locators are unique. Responsive assertions inspect every matched visible target at 320, 375, and 414px, skip hidden responsive variants, and verify no horizontal overflow. Keyboard focus is asserted at the desktop auth layout where the context support link is visible.
- E2E evidence includes first-login logout network failure recovery, workspace logout 5xx recovery and successful retry, protected-route blocking after logout, blank-login validation, and the API cookie/CSRF flow.

Local final-head quality evidence:

- Prisma validate/generate, schema static, secret scan, UI static, repository lint, typecheck, build, and `git diff --check`: **PASS**.
- Web unit: **30/30 PASS**; API unit: **64/64 PASS**; PostgreSQL integration: **24/24 PASS**; Playwright API/UI: **3/3 PASS**.
- Screenshot artifact: `tests/e2e/test-results/ui-foundation/`, **9/9 PNGs** (`ui-foundation-screenshots`). The artifact covers login 375/1366, first-login 375/1366, workspace 375/1366/1920, and system-status ready/error-safe 1366.
- The local migration script could not start because the Windows Bash launcher returned `E_ACCESSDENIED`; CI remains the authoritative isolated fresh/legacy migration gate. No official database, VPS, deployment, PR, or merge was used.
- Final-head CI run and hosted artifact ID: triggered by the correction-002 push; record the remote run ID when the branch workflow completes.
