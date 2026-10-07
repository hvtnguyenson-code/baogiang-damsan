# P5-040 Correction 001 — Pre-Deploy Consistency Findings Remediation

## Status

**IN_PROGRESS — Active correction branch `fix/p5-040-consistency-correction-001`.**

- Task: `P5-040` (Correction 001)
- Starting canonical base: `main@6e6b76f15998c4a7d70b61502bda932571d46ea0`
- Initial audit branch: `audit/p5-040-predeploy-consistency`
- Initial audit commit: `3c7233fd953b19b943c0185d444aef8ff8e9be14`
- Initial audit claim: `PASS — NO BLOCKER/HIGH FINDINGS` (REJECTED by independent adversarial review and final adjudication)
- Final adjudication outcome: confirmed 6 findings (CX-01 HIGH, CX-02..CX-06 MEDIUM; CX-07 was adjudicated as non-defect and not adopted)
- Current task status: `IN_PROGRESS` (P5-040 is NOT CLOSED and CANNOT be marked CLOSED before correction, independent review, merge, and a full P5-040 re-audit are complete)
- Downstream status: `P6-020` remains strictly `DEFERRED_WITH_TRIGGER`
- Production state: strictly **PRE-OPERATIONAL** (no deployment before correction + re-audit are fully satisfied)

---

## 1. Context and Rejection of Initial Audit

The initial consistency audit performed on branch `audit/p5-040-predeploy-consistency` (commit `3c7233fd953b19b943c0185d444aef8ff8e9be14`) concluded with a claim of 0 findings and a PASS outcome. This claim was rejected during independent adversarial review and final adjudication due to concrete technical and architectural defects across session lifecycle, Telegram transport failure handling/secret safety, and make-up read-model integrity.

Consequently:
- The initial audit branch `audit/p5-040-predeploy-consistency` is retained solely as historical evidence of the first audit iteration and MUST NOT be used as base, merged, or cherry-picked.
- All six confirmed findings are registered for complete remediation under **P5-040 Correction 001** on dedicated branch `fix/p5-040-consistency-correction-001` branched from exact canonical base `6e6b76f15998c4a7d70b61502bda932571d46ea0`.
- Task `P5-040` remains `IN_PROGRESS`. No status vocabulary outside `PRE-PILOT-TASK-REGISTER.md` is introduced.

---

## 2. Confirmed Findings Scope

### 2.1 CX-01 (HIGH) — Session / React Query Isolation
- **Domain:** Web client authentication and query cache boundary.
- **Problem:** A single global `QueryClient` retained business data across logout, session expiration, and user account switches. Only `['auth', 'me']` was invalidated, leaving sensitive business query data (reporting statements, workspace context, Telegram status, users, capabilities, schedules, PPCT) in memory cache accessible to subsequent user sessions before background refetch. Additionally, `apiFetch()` defaulted to `notifyUnauthorized = false`, preventing 401 responses on protected endpoints from triggering session boundary resets.
- **Remediation:** Central session cache lifecycle at auth/query boundary:
  - On logout: cancel pending queries, clear business query cache and mutation state, transition auth state to anonymous.
  - On unauthorized session expiry: 401 from protected business endpoints triggers session cache reset without treating credential-entry errors (e.g., failed login password) as valid session expirations.
  - On identity transition (User A -> User B): business cache of User A is strictly non-reusable for User B.
  - In-flight isolation: responses from in-flight queries initiated by User A completing after logout/switch must not populate or contaminate User B's cache.
- **Target Files:** `apps/web/src/auth/**`, `apps/web/src/lib/api-client.ts`, `apps/web/src/__tests__/**`.

### 2.2 CX-02 (MEDIUM) — Telegram Provider Description Secret Leakage
- **Domain:** Telegram adapter error transport.
- **Problem:** `errBody.description` was regex-filtered and truncated to 64 characters before being stored as `sanitizedErrorCode`. Provider description is untrusted text that may contain bot tokens, webhook secrets, internal URLs, or raw provider bodies. Regex character filtering does not constitute cryptographic secret redaction.
- **Remediation:** Do not persist arbitrary provider descriptions. Use deterministic safe codes mapped from HTTP status / provider classes (e.g., `HTTP_400`, `HTTP_403`, `HTTP_404`, `HTTP_429`) or bounded internal allowlists. Absolutely no tokens, secrets, URLs, raw bodies, or raw descriptions in stored or logged error codes.
- **Target Files:** `apps/api/src/telegram/telegram-bot-api.adapter.ts`, `apps/api/src/telegram/telegram-bot-api.adapter.spec.ts`.

### 2.3 CX-03 (MEDIUM) — Telegram Malformed Success Acknowledgement Handling
- **Domain:** Telegram adapter delivery state resolution.
- **Problem:** Under ADR-058, `FAILED` requires definitive provider rejection (e.g., HTTP 400, 403, 404). Responses with HTTP 200 and `ok: true` but missing `message_id` or with malformed JSON were erroneously classified as `FAILED`.
- **Remediation:** HTTP 200 with `ok: true` missing a valid provider `message_id` or with malformed success body represents an ambiguous outcome and MUST resolve to `UNKNOWN`, never `FAILED`. `UNKNOWN` deliveries must not be automatically resent.
- **Target Files:** `apps/api/src/telegram/telegram-bot-api.adapter.ts`, `apps/api/src/telegram/telegram-bot-api.adapter.spec.ts`.

### 2.4 CX-04 (MEDIUM) — Telegram Transport Timeout Must Cover Response Body
- **Domain:** Telegram adapter network timeout lifecycle.
- **Problem:** Timeout timer was cleared immediately after `fetch()` resolved headers, prior to `response.json()` body reading/parsing. A stalled response body could hang indefinitely beyond the intended deadline.
- **Remediation:** Network deadline must cover the entirety of required network I/O, including response body reading/parsing. If body reading/parsing times out on a success response, outcome is `UNKNOWN`.
- **Target Files:** `apps/api/src/telegram/telegram-bot-api.adapter.ts`, `apps/api/src/telegram/telegram-bot-api.adapter.spec.ts`.

### 2.5 CX-05 (MEDIUM) — Make-Up Candidate BLOCKED State Must Not Become Empty-Success
- **Domain:** Make-up candidate read model and UI presentation.
- **Problem:** When progress/debt projection for a class-subject root returns `BLOCKED`, the candidate service skipped it (`if (projection.status !== 'PASS') continue;`). If all roots were blocked, the endpoint returned `items: [], total: 0`, and the UI displayed "Không có nghĩa vụ nợ tiết hợp lệ" (empty success), creating semantic corruption where blocked upstream debt data was misrepresented as zero debt.
- **Remediation:** Extend shared contract for make-up candidates with explicit status (`PASS` / `BLOCKED`) and bounded safe findings. If any targeted progress/debt root is `BLOCKED`, the overall candidate response must fail-closed as `BLOCKED`. UI must display a clear warning ("Chưa thể xác định đầy đủ nghĩa vụ dạy bù do dữ liệu nguồn đang bị chặn") and disable scheduling actions. Real empty PASS is displayed only when authoritative projections pass with zero debt.
- **Target Files:** `packages/contracts/src/index.ts`, `apps/api/src/operational-overlays/makeup-schedules.service.ts`, `apps/web/src/pages/MakeupSchedulingPage.tsx`, related tests.

### 2.6 CX-06 (MEDIUM) — Make-Up Candidate Must Retain Exact PPCT Item Revision Provenance
- **Domain:** Make-up candidate read model PPCT enrichment.
- **Problem:** Upstream `ProgressDebtItemV2` supplies both `ppctItemId` and `ppctItemRevisionId`. Make-up candidate omitted `ppctItemRevisionId` and enriched titles by querying revisions by `ppctItemId` sorted by `createdAt DESC`, effectively showing the newest/latest revision rather than the exact retained historical revision.
- **Remediation:** Candidate must retain `ppctItemRevisionId`. PPCT enrichment lookup must match the exact retained `ppctItemRevisionId`. If the retained revision is missing or does not match the item, fail-closed without fabricating or defaulting to the latest revision.
- **Target Files:** `packages/contracts/src/index.ts`, `apps/api/src/operational-overlays/makeup-schedules.service.ts`, related tests.

### 2.7 CX-07 Non-Adoption Confirmation
- Independent adjudication confirmed that `CapabilityGuard.deny()` recording `AUTHORIZATION_DENIED` outside the business transaction is compliant with ADR-008 and is NOT a defect.
- No changes to `CapabilityGuard` or `AuditService` are authorized or made.

---

## 3. Strict Scope Constraints
- **Database Schema:** 0 schema changes, 0 migrations.
- **Deployment / Infrastructure:** 0 changes to `.github/workflows/**`, `scripts/deploy/**`, Nginx, TLS, or Windows Scheduled Tasks.
- **Environments:** No VPS access, no production DB access, no real Telegram API calls.
- **Task Gates:** P5-040 remains `IN_PROGRESS`. P6-020 remains `DEFERRED_WITH_TRIGGER`. Production remains `PRE-OPERATIONAL`.

---

## 4. Implementation and Verification Evidence

### 4.1 Canonical Base & Branches
- **Canonical starting base:** `main@6e6b76f15998c4a7d70b61502bda932571d46ea0`
- **Correction branch:** `fix/p5-040-consistency-correction-001`
- **Initial audit branch (historical evidence only, rejected):** `audit/p5-040-predeploy-consistency` at `3c7233fd953b19b943c0185d444aef8ff8e9be14`

### 4.2 Commit Sequence
1. `edc6ca9` — `docs(governance): register P5-040 correction 001`
2. `a56b8b7` — `fix(web): isolate query cache across sessions`
3. `551b70c` — `fix(telegram): harden provider transport outcomes`
4. `2fa04d2` — `fix(makeup): preserve blocked state and PPCT provenance`
5. *(current)* — `docs(governance): record P5-040 correction 001 evidence`

### 4.3 Exact Files Changed
- `docs/requirements/P5-040-CORRECTION-001.md`
- `docs/governance/PRE-PILOT-TASK-REGISTER.md`
- `docs/governance/CURRENT-PROJECT-STATUS.md`
- `apps/web/src/auth/session-cache.ts`
- `apps/web/src/auth/auth-context.tsx`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/__tests__/session-cache-isolation.test.tsx`
- `apps/api/src/telegram/telegram-bot-api.adapter.ts`
- `apps/api/src/telegram/telegram-bot-api.adapter.spec.ts`
- `packages/contracts/src/index.ts`
- `apps/api/src/operational-overlays/makeup-schedules.service.ts`
- `apps/api/test/operational-overlays/makeup-schedules.service.spec.ts`
- `apps/web/src/pages/MakeupSchedulingPage.tsx`
- `apps/web/src/__tests__/makeup-scheduling-page.test.tsx`

### 4.4 Targeted Verification Results
- **CX-01 (Session / React Query Isolation):**
  - `apps/web/src/__tests__/session-cache-isolation.test.tsx`: 8 passed, 0 failed.
  - Verifies: User A logout clears cache; fresh cache isolated from User B; stale cache isolated from User B; late in-flight response from User A cannot contaminate User B; protected 401 triggers session boundary; failed login 401 does not clear valid session; Telegram status cache cleared; Reporting statement / detail / workspace cache cleared.
- **CX-02 / CX-03 / CX-04 (Telegram Transport Hardening):**
  - `apps/api/src/telegram/telegram-bot-api.adapter.spec.ts`: 14 passed, 0 failed.
  - `apps/api/src/telegram/telegram.service.spec.ts`: 27 passed, 0 failed.
  - `apps/api/test/telegram/telegram-routing.spec.ts`: 5 passed, 0 failed.
  - Verifies: HTTP 200 with ok:true and message_id -> success; HTTP 200 with ok:true but missing message_id -> UNKNOWN (CX-03); HTTP 200 malformed JSON -> UNKNOWN (CX-03); HTTP 400/403/404/429 -> deterministic FAILED codes without raw provider description or token leakage (CX-02); timeout covers full body reading/parsing in finally block (CX-04); body stall aborts to UNKNOWN.
- **CX-05 / CX-06 (Make-Up Read Model Integrity):**
  - `apps/api/test/operational-overlays/makeup-schedules.service.spec.ts`: 57 passed, 0 failed.
  - `apps/web/src/__tests__/makeup-scheduling-page.test.tsx`: 10 passed, 0 failed.
  - Verifies: PASS projection + zero debt -> true empty PASS; one root BLOCKED -> whole candidate response BLOCKED fail-closed (CX-05); mixed PASS/BLOCKED -> whole response BLOCKED fail-closed (CX-05); UI renders warning alert for BLOCKED without empty-success and disables scheduling; exact candidate retains `ppctItemRevisionId` (CX-06); stable PPCT item with 2 revisions renders exact pinned revision; newest revision cannot override historical pinned revision; missing retained revision -> fail-closed BLOCKED.

### 4.5 Full Repository Verification Results
- `npm run lint`: PASS (0 warnings, 0 errors across `@baogiang/web`, `@baogiang/api`, `@baogiang/contracts`, `@baogiang/config`).
- `npm run typecheck`: PASS (0 errors across contracts, config, api, web).
- `npm run test:unit`: PASS:
  - `@baogiang/web`: 28 test files, 379 passed, 0 failed.
  - `@baogiang/api`: 99 test files, 1830 passed, 0 failed.
  - Total: 127 test files, 2209 passed.
- `npm run test:schema:static`: PASS (foundation, academic, business-config, telegram).
- `npm run test:secrets`: PASS (auth secret scan).
- `npm run test:deploy:static`: PASS (20 scripts and forbidden patterns).
- `npm run test:deploy:behavior`: PASS.
- `npm run test:workflow:contract`: PASS.
- `npm run test:deploy:powershell`: PASS.
- `npm run test:ui:static`: PASS (UI foundation, PWA baseline).
- `npm run build`: PASS (all 4 packages built cleanly).
- `git diff --check`: PASS (0 whitespace / conflict markers).

### 4.6 Environment-Gated Suites (Local Execution Policy)
- `npm run test:integration`: `NOT LOCALLY REPRODUCED` — Local execution refused by safety guard `resolveSafeTestDatabaseUrl` because no isolated test database is configured. PR CI will serve as the authoritative gate.
- `npm run test:migrations:ci`: `NOT LOCALLY REPRODUCED` — Requires CI PostgreSQL service container (`POSTGRES_ADMIN_URL`).
- `npm run test:e2e`: `NOT LOCALLY REPRODUCED` — Requires running local dev web/API instances (`127.0.0.1:5173` and `127.0.0.1:3000`).

### 4.7 Operational Integrity Confirmation
- Schema/migrations: 0 schema changes, 0 migrations.
- Workflows/deployment: 0 workflow changes, 0 deployment script changes.
- Infrastructure: 0 VPS connections, 0 production database connections, 0 real Telegram bot calls.
- Task Governance:
  - `P5-040`: **`IN_PROGRESS`** (Correction 001 complete on branch; independent review and full re-audit required before closure).
  - `P6-020`: strictly **`DEFERRED_WITH_TRIGGER`**.
  - Production state: strictly **`PRE-OPERATIONAL`**.

---

## 5. Review Correction 002 — Complete Cross-Tab Session Isolation

### 5.1 Independent-Review Finding
- **Severity:** `HIGH` (Residual finding of `CX-01`).
- **Description:** Correction 001 hardened same-tab cache and session boundary isolation, but did not handle cross-tab session replacement. The backend issues an origin-wide session cookie (`baogiang_session`). Multiple browser tabs/windows sharing the same origin share this cookie. Because each tab maintained an independent React Query client with `refetchOnWindowFocus: false` and without cross-tab session boundary propagation, logging out and logging in as a different user in Tab 2 left Tab 1 holding User A's identity and cached business data in memory. Returning to Tab 1 risked exposing sensitive business data belonging to User A to User B.

### 5.2 Root Cause
- Absence of origin-wide, cross-tab session boundary notification.
- In-memory `QueryClient` state in background tabs was never invalidated when another tab on the same origin executed login, logout, or experienced a session-invalidating 401.
- In `apiFetch()`, generation validation was executed after network headers were received but prior to body streaming (`readJson()`), leaving a window where a stalled body read resolving after a session transition could leak into the application.

### 5.3 Implementation Architecture
1. **Credential-Free Session Boundary Channel:**
   - Established a lightweight `BroadcastChannel` with stable identifier `baogiang_session_channel`.
   - Message payload is strictly metadata-only (`SESSION_BOUNDARY_CHANGED`, random event ID, and local sender tab ID).
   - Absolutely zero user IDs, usernames, tokens, cookies, capabilities, or business payloads are transmitted across the channel or persisted to local storage.
2. **Local Event Semantics:**
   - **Login:** Only upon successful login response is the session boundary reset, old cache purged, `SESSION_BOUNDARY_CHANGED` broadcast to other tabs, and `/auth/me` queried to establish the new session generation. Failed credential logins do not clear or disrupt valid existing sessions.
   - **Logout:** Upon successful logout, local session cache is purged and `SESSION_BOUNDARY_CHANGED` is broadcast origin-wide.
   - **Protected 401:** A 401 on protected business endpoints triggers local cache purging and broadcasts a session boundary event. Credential-checking endpoints (`/auth/login`, `/auth/change-password`) do not broadcast session invalidation.
3. **Remote Tab Handling:**
   - Receiving a remote boundary event immediately aborts in-flight network requests of the old generation, clears business query cache and active mutations, resets auth state, and re-validates `/auth/me` from the server.
   - Remote tabs do not re-broadcast received events, eliminating event loops. Server `/auth/me` remains the sole authority for identity.
4. **Browser Compatibility & Fallback:**
   - In environments without `BroadcastChannel` support, a fail-closed focus and `visibilitychange` fallback immediately purges business queries upon foreground return prior to re-validating `/auth/me`.
5. **Body-Read Generation Race Hardening:**
   - In `apiFetch()`, generation is verified both before reading the body stream and again immediately after JSON parsing.
   - If the session generation increments or an abort signal triggers during body reading, the request is rejected with bounded `ApiError` ("Yêu cầu bị hủy do phiên làm việc đã thay đổi"), preventing stale responses from resolving.

### 5.4 Regression Suite & Verification
- Suite: `apps/web/src/__tests__/session-cache-isolation.test.tsx` (17 tests, 100% PASS):
  - Cross-tab 1: Tab B login -> broadcast boundary -> Tab A purges cache and re-resolves User B identity.
  - Cross-tab 2: Tab A fresh business cache -> remote boundary purges it immediately.
  - Cross-tab 3: Tab A stale business cache -> remote boundary purges it immediately.
  - Cross-tab 4: In-flight request in Tab A when remote boundary arrives -> late response rejected; does not contaminate new cache.
  - Cross-tab 5: Remote logout -> Tab A cache purged and transitions to anonymous.
  - Cross-tab 6: Failed credential login -> no broadcast sent; valid session retained.
  - Cross-tab 7: Protected 401 -> local purge + exactly one outbound broadcast; receiver does not rebroadcast.
  - Cross-tab 8: No `BroadcastChannel` support -> focus/visibility fallback immediately purges stale cache and revalidates.
  - Body race: Generation changes during pending body stream read -> rejected as old-session response.
  - Tests 1-8: Existing same-tab Correction 001 isolation tests continue to pass.

### 5.5 Commits and Current HEAD
- Implementation commit: `b91ff0d535f769a9c85efa8ca717f4fe4d48d7ba` (`fix(web): synchronize session boundaries across tabs`)
- Documentation commit: `df00b2a5162f19b6c75fa8d0150b5484415d4b9d` (`docs(governance): record P5-040 review correction 002`)
- Task Governance:
  - `P5-040`: strictly **`IN_PROGRESS`** (Correction 002 completed on branch; awaiting independent review, merge, and full re-audit).
  - `P6-020`: strictly **`DEFERRED_WITH_TRIGGER`**.
  - Production state: strictly **`PRE-OPERATIONAL`**.

---

## 6. Review Correction 003 — Harden Cross-Tab Session Reconciliation

### 6.1 Independent-Review Findings
- **RC3-01 (HIGH) — BroadcastChannel Usable-State & Fallback Gating:**
  Correction 002 gated foreground fallback behind `isBroadcastChannelSupported()`, which only tested constructor existence. In environments where the constructor throws (e.g. sandbox permissions), `getBroadcastChannel()` returns `null`, or `postMessage()` throws, the channel was unusable but the fallback was disabled, leaving old-account business cache accessible across tabs.
- **RC3-02 (MEDIUM) — Stale Time & Cache Reuse on Auth Reconciliation:**
  Correction 002 used `clearSessionCache() -> setQueryData(AUTH_QUERY_KEY, null) -> fetchQuery(AUTH_QUERY_KEY)`. With production `staleTime: 30_000`, newly set `null` was treated as fresh data, causing `fetchQuery` to return cached `null` without making a server network call to verify origin session identity.

### 6.2 Root Cause
- Gating foreground fallback on static API existence rather than maintaining an active defense-in-depth safety net.
- Re-using React Query cache mechanics (`fetchQuery`) for server-authoritative session boundary revalidation instead of direct network execution.
- Absence of monotonic sequence ordering across burst events (logout immediately followed by login).

### 6.3 Implementation Architecture
1. **Server-Authoritative Network Revalidation (Bypassing React Query Cache):**
   - Directly executes `fetchAuthMe({ notifyUnauthorized: false })` via HTTP network call.
   - Completely bypasses `queryClient.fetchQuery` and `staleTime: 30_000`, ensuring the origin cookie is authoritatively checked against the server.
2. **Fail-Closed Reconciliation State:**
   - Introduced `isReconciling` flag in `AuthProvider`.
   - When a remote boundary or fail-closed fallback is active, `deriveStatus` resolves to `'checking'` and `auth` resolves to `null`.
   - Ensures no old User A business surface can render while the new session identity is in-flight.
3. **Monotonic Sequence Ordering (Burst Hardening):**
   - Maintained `reconciliationSeqRef` counter.
   - Each reconciliation increments the sequence; out-of-order or superseded responses from earlier events (e.g. slow logout 401 response returning after fast login response) are discarded.
4. **Defense-in-Depth Foreground Safety Net:**
   - Foreground safety net is always active.
   - When BroadcastChannel is unavailable or broken (`!isBroadcastChannelSupported()`), immediately purges cache and fails closed upon window focus / visibility change.
   - When BroadcastChannel is operational, safely verifies server identity on foreground return without disrupting same-user session cache during normal tab switching.
   - Focus listener ignores interactive form controls (`INPUT`, `SELECT`, `TEXTAREA`, `BUTTON`, `A`) to prevent focus bubbling from clearing active forms.
5. **Channel Isolation & Error Hardening:**
   - Bounded `getBroadcastChannel()` and `broadcastSessionBoundary()` with error handling so constructor/postMessage errors fail safely.
   - Automatically scopes channel names per test path in test environments to eliminate cross-worker interference during parallel Vitest execution.

### 6.4 Regression Suite & Verification
- Suite: `apps/web/src/__tests__/session-cache-isolation.test.tsx` (23 tests, 100% PASS):
  - Test 18 (Test A & F): Production `staleTime: 30_000` with cached null auth -> remote boundary forces network `/auth/me` call and resolves User B.
  - Test 19 (Test B): BroadcastChannel constructor throws -> foreground safety net purges cache immediately and resolves User B.
  - Test 20 (Test C): `postMessage` throws -> sender does not crash, receiver revalidates and purges via foreground safety net.
  - Test 21 (Test D): Logout -> login burst events -> latest event wins, final state User B with zero User A cache.
  - Test 22 (Test E): Slow first reconciliation superseded by second boundary -> slow response discarded, User B preserved.
  - Test 23: Fail-closed checking state -> status `'checking'` and auth `null` while revalidation is in-flight.
  - Tests 1-17: All earlier Correction 001 and Correction 002 session isolation tests continue to pass.
- Web unit tests: `npm run test:unit -w apps/web`: 28 test files passed (397 tests).
- Monorepo unit tests: `npm run test:unit`: 127 test suites passed (2227 tests).
- Lint, typecheck, static UI, build: all PASS with 0 warnings/errors.

### 6.5 Commits and Current HEAD
- Implementation commit: `c0fb825b67ea36220be78a69096959c667e9a749` (`fix(web): harden cross-tab session reconciliation`)
- Documentation commit: `b3ee64e087ad78e0b52d8f54e2652c371542f9b9` (`docs(governance): record P5-040 review correction 003`)
- Task Governance:
  - `P5-040`: strictly **`IN_PROGRESS`** (Correction 003 completed on branch; awaiting independent review, merge, and full re-audit).
  - `P6-020`: strictly **`DEFERRED_WITH_TRIGGER`**.
  - Production state: strictly **`PRE-OPERATIONAL`**.

---

## 7. Review Correction 004 — Safe Foreground Session Reconciliation

### 7.1 Independent-Review Findings
- **RC4-01 (HIGH) — Foreground Verification Not Fail-Closed Pending Network Revalidation:**
  When `BroadcastChannel` appeared operational, foreground return initiated identity verification without entering a fail-closed presentation state (`forcePurgeImmediately: false` left `isReconciling = false`). Consequently, User A's identity and cached business UI remained rendered and interactive while the network `GET /auth/me` request was in-flight. If a previous `BroadcastChannel` message was dropped, delivery was blocked, or the tab resumed from background/suspension, User B returning to an existing User A tab could observe User A's sensitive business surface until `/auth/me` finished.
- **RC4-02 (HIGH) — Same-User Foreground Revalidation Unnecessarily Rotates Session Generation:**
  Reconciliation unconditionally executed `startSessionScope(refreshed.user.id)` upon `/auth/me` response resolution, even when `refreshed.user.id === previousUserIdRef.current`. Because `startSessionScope` aborts the active `AbortController` and increments `currentSessionGeneration`, normal tab/window focus returns aborted legitimate in-flight business queries and mutations ("Yêu cầu bị hủy do phiên làm việc đã thay đổi"). For mutations (POST/PATCH), the server could commit while the browser rejected with an ambiguous write error, risking duplicate submission by the user.

### 7.2 Design Principle: Decoupled Fail-Closed Presentation & Cache Destruction
1. **Fail-Closed Presentation:**
   Hide protected business surfaces immediately upon foreground return by entering `isReconciling = true` (`status = 'checking'`, `auth = null`) prior to awaiting server `/auth/me`. ProtectedRoute renders loading/checking state, ensuring complete confidentiality.
2. **Session Generation & Cache Destruction Gate:**
   Abort requests and purge business cache ONLY when an authoritative session boundary is confirmed:
   - Remote `SESSION_BOUNDARY_CHANGED` received across tabs;
   - Identity transition (`User A -> User B`) confirmed by server network authority;
   - Session revocation / 401 confirmed by server.
3. **Same-User Foreground Return:**
   Preserves existing business cache, retains current session generation, and avoids aborting in-flight queries or mutations.

### 7.3 Reconciliation Architecture & Generation Lifecycle
1. **Foreground Safety Verification:**
   - Synchronously sets `isReconciling = true` (fail-closed presentation).
   - Does NOT purge business cache or abort active requests in advance.
   - Executes direct server network authority via `fetchAuthMe({ notifyUnauthorized: false })`.
2. **Same Identity Result (`refreshed.user.id === previousUserId`):**
   - Keeps business query cache intact.
   - Retains current session generation without calling `clearSessionCache()`, `resetSessionScope()`, or `startSessionScope()`.
   - In-flight queries and mutations proceed to completion without interruption.
   - Updates `AUTH_QUERY_KEY` with refreshed user/capabilities data.
   - Sets `isReconciling = false`, restoring authenticated UI presentation.
3. **Identity Changed Result (`refreshed.user.id !== previousUserId`):**
   - Executes `clearSessionCache(queryClient)` to purge User A business queries and abort User A generation.
   - `clearSessionCache` establishes a single new usable session generation via `resetSessionScope()`.
   - Eliminates redundant subsequent `startSessionScope()` calls, preventing double-reset generation.
   - Sets `previousUserIdRef` to User B, updates auth cache, and sets `isReconciling = false`.
4. **Anonymous / 401 Result:**
   - Executes `clearSessionCache(queryClient)` and aborts old generation.
   - Sets `AUTH_QUERY_KEY = null`, clears `previousUserIdRef`, and sets `isReconciling = false`.
5. **Remote Broadcast Boundary:**
   - On `SESSION_BOUNDARY_CHANGED`, immediately executes `clearSessionCache(queryClient)` and enters `isReconciling = true`.
   - When server `/auth/me` resolves, establishes new identity without double-resetting session generation.
6. **Burst Ordering:** Monotonic `reconciliationSeqRef` ensures earlier superseded reconciliation attempts cannot overwrite newer state.

### 7.4 Regression Suite & Verification
- Suite: `apps/web/src/__tests__/session-cache-isolation.test.tsx` (31 tests, 100% PASS):
  - **Test 24 (RC4-01):** Operational BroadcastChannel + delayed foreground verification -> status `'checking'` and auth `null` while in-flight; resolves User B with cache A completely removed (configured with production `staleTime: 30_000`, `refetchOnWindowFocus: false`).
  - **Test 25 (RC4-01):** `postMessage` failure + delayed foreground verification -> immediately asserts fail-closed presentation (`'checking'`, `null`) before network resolution.
  - **Test 26 (RC4-02):** Same-user foreground return leaves `getCurrentSessionGeneration()` exactly unchanged (production query options).
  - **Test 27 (RC4-02):** Same-user foreground return does not abort in-flight business GET request; succeeds normally without session-change error (production query options).
  - **Test 28 (RC4-02):** Same-user foreground return does not abort in-flight business mutation (POST), preserving write-result certainty.
  - **Test 29:** Changed-user foreground verification invalidates session generation, rejects old in-flight requests, removes User A cache, and establishes User B.
  - **Test 30:** Foreground 401 response transitions to anonymous, purges business cache, and invalidates session generation.
  - **Test 31:** No BroadcastChannel environment + same-user foreground verification -> fail-closed presentation during verification, preserves cache and generation upon same-user confirmation.
  - **Tests 1-23:** All prior isolation, remote broadcast, fallback, burst ordering, and body-read race tests continue to pass.
- Web unit tests: `npm run test:unit -w apps/web`: 28 test files passed (405 tests).
- Monorepo unit tests: `npm run test:unit`: 127 test suites passed (2235 tests).
- Lint, typecheck, static UI, build: all PASS with 0 warnings/errors.

### 7.5 Commits and Current HEAD
- Implementation commit: `ced1fde2ea4f8f9c0143d403ad2deb8f363f2789` (`fix(web): preserve valid requests during session reconciliation`)
- Documentation commit: *(recorded upon docs commit)*
- Resulting HEAD: *(recorded upon docs commit)*
- Task Governance:
  - `P5-040`: strictly **`IN_PROGRESS`** (Correction 004 completed on branch; awaiting independent review, merge, and full re-audit).
  - `P6-020`: strictly **`DEFERRED_WITH_TRIGGER`**.
  - Production state: strictly **`PRE-OPERATIONAL`**.
