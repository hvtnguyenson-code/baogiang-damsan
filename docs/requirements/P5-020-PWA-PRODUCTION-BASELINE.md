# P5-020 — PWA Production Baseline

## Status

`CLOSED` by `SYNC-P5-020`

## Canonical start

- task: `P5-020` PWA production baseline
- traceability: `T32`
- dependency: `P5-010` — `CLOSED` by `SYNC-P5-010`
- canonical start: `main@7ef20def783f17ef07a5881bf7d61060c3486199`
- branch: `feat/p5-020-pwa-production-baseline`

## Objective

Deliver a production-safe installable Progressive Web App (PWA) baseline for Báo giảng Đam San that fulfills requirement `T32` before the teacher pilot.

The system is:
- an installable web application shell on mobile and desktop browsers (Android Chrome, iOS Safari, desktop Chromium/Edge);
- a controlled service worker caching strictly static, immutable build assets (compiled JS/CSS, HTML app shell, static icons, self-hosted fonts);
- a prompted update workflow giving users explicit control over new version activation without forced reload loops.

The system is **NOT**:
- an offline Báo giảng system;
- an offline reporting system;
- an offline authentication system;
- a push notification system (Web Push);
- a custom app store or custom installation wizard.

## Invariant 1 — Strict Network-Only Boundary for API

The service worker caching boundary is structural:

```text
/api
/api/**
= NETWORK ONLY / NO CACHE
```

Under no circumstances may any `/api/**` response be stored in the Service Worker Cache Storage or any client-side persistence layer.
- No `CacheFirst` for `/api`.
- No `NetworkFirst` cache fallback for `/api`.
- No `StaleWhileRevalidate` for `/api`.
- No offline API mock/fallback payloads.
- No caching of `/api/auth/**`, `/api/reporting/**`, `/api/business-configuration/**`, or any other current or future API endpoint.
- No Background Sync, offline mutation queues, or client-side storage of mutations (`POST`, `PUT`, `PATCH`, `DELETE`).

Direct browser navigation to an API route (e.g. `/api/health/live`) must bypass the service worker navigation fallback and never return `index.html`.

## Invariant 2 — Authentication and Business Data Integrity

The application's existing authentication model remains unchanged:
- `credentials: 'same-origin'` session cookie;
- server-side session authority (`/api/auth/me`);
- no browser token persistence (no auth tokens in `localStorage`, `sessionStorage`, or `IndexedDB`);
- React Query cache remains unpersisted (in-memory only).

When network is unavailable:
- the static application shell may render;
- all authentication and business API requests fail cleanly with network error;
- no stale or unauthorized business data is ever served from cache.

## Invariant 3 — Prompted Update Strategy

Update behavior must be non-intrusive and user-controlled:
- Service worker updates in the background.
- When an updated service worker is waiting (`waiting`), a compact Vietnamese operational notice is displayed:
  - Text: **“Có phiên bản mới của Báo giảng.”**
  - Primary button: **“Tải lại để cập nhật”** (triggers `skipWaiting()` and cleanly reloads the page once).
  - Secondary button: **“Để sau”** (dismisses the notice for the current session without unregistering the worker).
- No automatic unexpected reload loops.
- No "ready for offline" marketing notices.

## Web App Manifest Contract

- `name`: Báo giảng CM Đam San
- `short_name`: Báo giảng
- `lang`: vi
- `start_url`: /
- `scope`: /
- `display`: standalone
- `theme_color`: `#1F4358` (DESIGN.md `school-800`)
- `background_color`: `#F3F6F7` (DESIGN.md `mist-50`)
- `icons`:
  - `pwa-192x192.png`: 192×192 standard icon (PNG)
  - `pwa-512x512.png`: 512×512 standard icon (PNG)
  - `pwa-maskable-512x512.png`: 512×512 maskable icon with approved safe zone (PNG)
  - Apple touch icon: 180×180 / 192×192 link in `index.html`

## Update UI Design Requirements

- Adheres to `DESIGN.md` and `.codex/skills/damsan-ui/SKILL.md`.
- Compact banner or docked toast at the viewport bottom, semantic HTML (`role="status"`, `aria-live="polite"`).
- Styled using approved semantic tokens:
  - Background: `paper-0` (`#FFFFFF`) or `mist-50` (`#F3F6F7`) with `line-300` (`#C9D4DA`) border.
  - Text: `ink-950` (`#15242E`).
  - Actions: existing project `Button` primitive (`school-800` primary, secondary outline/ghost).
- Accessible touch targets (minimum 44×44px where applicable), visible keyboard focus, responsive across 320px–414px mobile and 1366×768 laptop.
- No gradients, glassmorphism, glowing effects, marketing heroes, or new component libraries.

## Testing and Verification Evidence

1. **Manifest Contract Verification**:
   - Automated checks validating all required manifest attributes, colors, and asset references.
2. **Service Worker Security Verification**:
   - Build-time and test-time validation that `/api/**` is excluded from navigation fallback and has no cache strategies.
   - Verification that no API routes or responses exist in precache or runtime cache rules.
3. **Update UI Unit Tests**:
   - Pure presentation component unit tests verifying visibility, dismissal, reload action callback, and Vietnamese copy.
4. **Static Verification Script**:
   - `scripts/ui/verify-pwa-baseline.cjs` integrated into `npm run test:ui:static` and runnable standalone.
5. **Build Artifact Evidence**:
   - Post-build inspection proving `manifest.webmanifest`, `sw.js`, and icon assets are generated in `apps/web/dist`.
6. **Security & Privacy Negative Audits**:
   - Clean grep across diff and new code for `localStorage`, `sessionStorage`, `indexedDB`, `BackgroundSync`.
7. **Playwright Production-like Runtime Evidence (Review Correction 001)**:
   - Automated deterministic E2E suite (`tests/e2e/specs/pwa-baseline.spec.ts`) asserting:
     - Manifest reachable and conforms to all required identity, color, and icon fields;
     - `sw.js` reachable, containing `/api` navigation denylist and `NetworkOnly` runtime route, excluding `/api` from precache, with no `BackgroundSync`;
     - `navigator.serviceWorker.ready` resolves with active registration;
     - page reload confirms active Service Worker controller (`navigator.serviceWorker.controller !== null`);
     - live `GET /api/health/live` succeeds over network under service worker control;
     - runtime Cache Storage audit proves zero `/api` entries exist across all caches;
     - simulated offline mode confirms `GET /api/health/live` fails/rejects without cached API fallback.

## Forbidden Scope

- No changes to backend API controllers, contracts, services, or business logic.
- No changes to authentication or session handling.
- No changes to Prisma schema or database migrations.
- No changes to `.github/workflows/ci.yml` or production deployment scripts.
- No production VPS mutation or deployment access.
- Production environment remains strictly `PRE-OPERATIONAL`.

## Closure Evidence

- final independently reviewed parent head: `397d2fadfc23b9a9dee5e45a7da9190e6dbf799a`;
- parent PR: #195;
- exact-head parent CI: #644 / run `37434113165` — **SUCCESS**;
- normal parent merge/main: `fa54eaea5c2055517428d18559f652001999d0e4`;
- authoritative post-merge main CI: #645 / run `37435484376` — **SUCCESS**;
- independent GitHub review: **PASS** after bounded Review Corrections 001–002;
- Review Correction 001 added direct runtime evidence for Service Worker registration/activation/client control plus zero `/api` Cache Storage entries and offline API failure without cached fallback;
- Review Correction 002 changed only the generated-Service-Worker whitespace-sensitive assertion and preserved all runtime/security invariants;
- external CI-641 security-advisory drift for pre-existing `proxy-addr@2.0.7` was resolved separately through security PR #196 before final P5-020 exact-head CI; it was not a P5-020 regression;
- no residual P5-020 correction/re-entry task remains;
- no production deploy/VPS mutation occurred; production remains **PRE-OPERATIONAL**.
