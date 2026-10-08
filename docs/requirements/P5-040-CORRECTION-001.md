# P5-040 Correction 001 — Pre-Deploy Consistency Findings Remediation

## Status

**CLOSED — Parent PR #202 merged to `main@1282f24a5300da88c155c7dc5523644d14bd53c8`.**

- Task: `P5-040` (Correction 001)
- Starting canonical base: `main@6e6b76f15998c4a7d70b61502bda932571d46ea0`
- Initial audit branch: `audit/p5-040-predeploy-consistency`
- Initial audit commit: `3c7233fd953b19b943c0185d444aef8ff8e9be14`
- Initial audit claim: `PASS — NO BLOCKER/HIGH FINDINGS` (REJECTED by independent adversarial review and final adjudication)
- Final adjudication outcome: confirmed 6 findings (CX-01 HIGH, CX-02..CX-06 MEDIUM; CX-07 was adjudicated as non-defect and not adopted)
- Current task status: `CLOSED` (PR #202 merged to `main@1282f24a5300da88c155c7dc5523644d14bd53c8`; PR CI #657 SUCCESS; post-merge CI #658 SUCCESS)
- Downstream status: `P6-020` remains strictly `DEFERRED_WITH_TRIGGER`
- Production state: strictly **PRE-OPERATIONAL** (no deployment performed)

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
- Documentation commit: `63d92750e67b364e854983bd63676759f1106873` (`docs(governance): record P5-040 review correction 004`)
- Resulting HEAD: `63d92750e67b364e854983bd63676759f1106873`
- Task Governance:
  - `P5-040`: strictly **`IN_PROGRESS`**.
  - `P6-020`: strictly **`DEFERRED_WITH_TRIGGER`**.
  - Production state: strictly **`PRE-OPERATIONAL`**.

## 8. Review Correction 005 — Preserve Foreground Work & Supersede Stale Auth Reconciliation

### 8.1 Scope and Objective
Address independent re-review findings RC5-01 and RC5-02 on branch `fix/p5-040-consistency-correction-001`:
1. **RC5-01 (MEDIUM): Foreground verification destroys unsaved page state.**
   Separated visual/interaction shielding from component lifecycle destruction. During foreground verification (`FOREGROUND_VERIFY`), protected page content is non-visible and non-interactive, but the component tree remains mounted to preserve draft state (Reporting Statements, Business Configuration, Special Programme Workspace, etc.). Only an authoritative session boundary discards the subtree.
2. **RC5-02 (MEDIUM): Authoritative local session boundaries must supersede pending reconciliation.**
   Protected 401, logout, login, and change-password session invalidation paths immediately advance the monotonic reconciliation sequence (`invalidatePendingReconciliations()`), rendering any in-flight `/auth/me` requests stale with zero state mutation upon late resolution.

### 8.2 Architectural Implementation
1. **Explicit Reconciliation Mode:**
   - Defined `ReconciliationMode = 'NONE' | 'FOREGROUND_VERIFY' | 'BOUNDARY_VERIFY'` in `auth-context.tsx`.
   - `FOREGROUND_VERIFY`: Used for focus/visibility return. Presentation fails closed (`status = 'checking'`, `auth = null`), but business cache and session generation remain intact.
   - `BOUNDARY_VERIFY`: Used for cross-tab `SESSION_BOUNDARY_CHANGED`. Destructively purges old cache and aborts generation immediately.
2. **Component Lifecycle & Draft Preservation in `ProtectedRoute`:**
   - `ProtectedRoute` renders `<Outlet />` inside `<div aria-hidden="true" style={{ display: 'none' }}>` while displaying `<RouteLoading label="Đang kiểm tra phiên làm việc" />` when `reconciliationMode === 'FOREGROUND_VERIFY'`.
   - The route subtree container is keyed by `sessionIdentityKey = previousUserIdRef.current ?? authQuery.data?.user.id ?? 'anonymous'`. For the same user, the key is invariant, preserving component instances and unsaved form/draft states without remounting.
   - For an identity change (User A -> User B) or anonymous transition (401), the key changes, cleanly unmounting and discarding old protected subtrees and drafts.
   - `CapabilityRoute` passes through `<Outlet />` during `FOREGROUND_VERIFY`, preventing unauthorized redirection to `/khong-co-quyen` during verification.
3. **Sequence Invalidation (`invalidatePendingReconciliations`):**
   - Implemented `invalidatePendingReconciliations()` helper that increments `reconciliationSeqRef.current`.
   - Called upon `onUnauthorized` callback (protected 401), `login()` replacement, `logout()` execution, and `changePassword()` 401 error.
   - Any late-resolving `/auth/me` detects `reconciliationSeqRef.current !== seq` and aborts immediately without mutating state or resurrecting auth.

### 8.3 Regression Suite & Verification
- Suite: `apps/web/src/__tests__/session-cache-isolation.test.tsx` (38 tests, 100% PASS):
  - **Test 32 (RC5-01):** Draft survives same-user foreground verification without component remounting (`DRAFT-MUST-SURVIVE` preserved, mount count unchanged, unmount count 0).
  - **Test 33 (RC5-01):** Real production page (`ReportingStatementsPage`) preserves local state (form select value) across same-user foreground verification.
  - **Test 34 (RC5-01):** Changed user discards old draft and unmounts old protected subtree.
  - **Test 35 (RC5-01):** Authoritative 401 discards old draft and transitions to login route.
  - **Test 36 (RC5-02):** Pending foreground reconciliation superseded by protected 401; late 200 User A performs zero state mutation.
  - **Test 37 (RC5-02):** Pending foreground reconciliation superseded by successful logout; late 200 does not restore auth.
  - **Test 38 (RC5-01):** Same-user foreground verification preserves exact mount count (`mountCount` unchanged, `unmountCount === 0`).
  - **Tests 1-31:** All prior session isolation, BroadcastChannel fallback, generation stability, and race condition tests continue to pass.
- Web unit tests: `npm run test:unit -w apps/web`: 28 test files passed (412 tests).
- Monorepo unit tests: `npm run test:unit`: 127 test suites passed (2242 tests).
- Static UI gate: `npm run test:ui:static`: PASS.
- Monorepo build: `npm run build`: PASS (contracts, config, api, web).
- Linter & Typecheck: `npm run lint` (0 warnings), `npm run typecheck` (0 errors).

### 8.4 Commits and Governance
- Implementation commit: `485a64137f8987c8b2d95217c8e6c67b54324d23` (`fix(web): preserve protected drafts during session verification`)
- Documentation commit: `efed62120f5dd2cfdfcb3c2df12b01109ac351bf` (`docs(governance): record P5-040 review correction 005`)
- Task Governance:
  - `P5-040`: strictly **`IN_PROGRESS`**.
  - `P6-020`: strictly **`DEFERRED_WITH_TRIGGER`**.
  - Production state: strictly **`PRE-OPERATIONAL`**.

## 9. Review Correction 006 — Preserve Session on Indeterminate Reconciliation Failure

### 9.1 Scope and Objective
Address independent re-review finding RC6-01 on branch `fix/p5-040-consistency-correction-001`:
- **RC6-01 (MEDIUM): Indeterminate verification failures falsely collapsed into logout.**
  `reconcileSessionBoundary()` previously caught all errors from `fetchAuthMe({ notifyUnauthorized: false })` and treated them as anonymous/session invalid. This incorrectly collapsed HTTP 401, network status 0, HTTP 5xx, and malformed responses into destructive logout behavior, violating repository authority and `AuthRecovery` copy ("Phiên của bạn chưa bị coi là đã đăng xuất.").

### 9.2 Required Outcome Classification & Architectural Invariants
Reconciliation failure is strictly classified into two categories:
1. **Confirmed Anonymous (`apiError.statusCode === 401`):**
   - Authoritative session termination confirmed by backend.
   - Clears session cache via `clearSessionCache(queryClient)`.
   - Aborts previous session generation.
   - Resets `AUTH_QUERY_KEY = null` and `previousUserIdRef = undefined`.
   - Ends reconciliation mode (`reconciliationMode = 'NONE'`, `reconciliationError = null`).
   - Renders public/login route and destroys old protected subtrees/drafts.
2. **Indeterminate Verification Failure (`statusCode === 0`, `statusCode >= 500`, malformed response):**
   - Must **NOT** clear session cache.
   - Must **NOT** rotate generation or abort valid in-flight queries/mutations.
   - Must **NOT** set `AUTH_QUERY_KEY` to null or reset `previousUserIdRef`.
   - Must **NOT** infer logout or transition to anonymous route.
   - Enters bounded verification recovery state (`reconciliationError = apiError`).

### 9.3 Behavior by Reconciliation Mode
1. **FOREGROUND_VERIFY Indeterminate Failure:**
   - Retains verified user auth, session generation, and business cache internally.
   - Retains mounted protected subtree inside `<div aria-hidden="true" style={{ display: 'none' }}><Outlet /></div>`.
   - Displays `<AuthRecovery title="Chưa thể kiểm tra phiên đăng nhập" message="Hệ thống tạm thời chưa thể xác thực phiên làm việc hiện tại..." onRetry={retry} />` while keeping protected business surface non-visible and non-interactive.
   - Retrying calls direct server-authoritative `/auth/me`:
     - Same user: Clears recovery state (`reconciliationError = null`, `reconciliationMode = 'NONE'`), restoring protected page visibility and interaction with unsaved form draft completely preserved without remounting.
     - Changed user (User B): Discards old User A draft/cache and establishes User B.
     - 401: Transitions to anonymous and routes to login.
2. **BOUNDARY_VERIFY Indeterminate Failure:**
   - For an authoritative remote `SESSION_BOUNDARY_CHANGED`, old business cache/generation was already purged fail-closed.
   - On network/5xx failure of `/auth/me`, the user is **NOT** falsely classified as anonymous.
   - Remains in fail-closed boundary recovery UI (`<AuthRecovery />` rendered without mounted `<Outlet />`) and allows retry.
   - Retrying direct `/auth/me` resolves identity upon 200 or confirms anonymous upon 401.
3. **Monotonic Sequence Protection:**
   - Increments sequence ref on boundary invalidation.
   - Stale reconciliation N failing late after N+1 succeeds User B performs zero state mutation and cannot overwrite newer success or set `reconciliationError`.

### 9.4 Regression Suite & Verification
- Suite: `apps/web/src/__tests__/session-cache-isolation.test.tsx` (46 tests, 100% PASS):
  - **Test 39 (RC6-01):** Foreground network failure does not logout; retains verified User A internally, keeps generation and cache intact, leaves protected subtree mounted but hidden, shows recovery UI.
  - **Test 40 (RC6-01):** Foreground 503 does not logout; maintains all invariants of Test 39.
  - **Test 41 (RC6-01):** Foreground network failure -> retry -> same User A restores authenticated UI without remounting or draft loss (`DRAFT-MUST-SURVIVE` preserved, mount count unchanged).
  - **Test 42 (RC6-01):** Foreground network failure -> retry -> User B discards old draft, clears old cache, invalidates generation, and establishes User B.
  - **Test 43 (RC6-01):** Foreground network failure -> retry -> 401 transitions to anonymous/login, destroying old draft, cache, and generation.
  - **Test 44 (RC6-01):** Remote boundary + network failure is NOT anonymous; old User A state destroyed, remains in boundary recovery UI without login redirect.
  - **Test 45 (RC6-01):** Remote boundary recovery retry -> User B establishes new identity safely.
  - **Test 46 (RC6-01):** Stale reconciliation error cannot overwrite newer success; late N error performs zero state mutation.
  - **Tests 1-38:** All prior session isolation, BroadcastChannel fallback, generation stability, and draft preservation tests continue to pass.
- Web unit tests: `npm run test:unit -w apps/web`: 28 test files passed (420 tests).
- Monorepo unit tests: `npm run test:unit`: 127 test suites passed (2250 tests: 420 web + 1830 api).
- Lint: `npm run lint`: PASS (0 warnings across all 4 packages).
- Typecheck: `npm run typecheck`: PASS (0 errors across contracts, config, api, web).
- Static UI gate: `npm run test:ui:static`: PASS.
- Monorepo build: `npm run build`: PASS (contracts, config, api, web).
- Whitespace / diff check: `git diff --check`: PASS (0 whitespace / newline issues).

### 9.5 Commits and Current HEAD
- Implementation commit: `cb62555cbe14c0a3f34e740e908cd791fe9ffaa9` (`fix(web): preserve session on reconciliation failure`)
- Documentation commit: `e5bc3911dcc080599fa650defc86db29bcd64a46` (`docs(governance): record P5-040 review correction 006`)
- Task Governance:
  - `P5-040`: strictly **`IN_PROGRESS`** (Correction 006 completed on branch; awaiting independent review).
  - `P6-020`: strictly **`DEFERRED_WITH_TRIGGER`**.
  - Production state: strictly **`PRE-OPERATIONAL`**.

## 10. Review Correction 007 — Preserve Verified Auth Context During Foreground Shield

### 10.1 Scope and Objective
Address independent re-review finding RC7-01 on branch `fix/p5-040-consistency-correction-001`:
- **RC7-01 (MEDIUM): Mounted business pages observed transient `auth = null` during `FOREGROUND_VERIFY`.**
  Correction 005/006 preserved the mounted protected route subtree during `FOREGROUND_VERIFY` so unsaved drafts survive. However, `AuthContext` exposed `auth: reconciliationMode !== 'NONE' ? null : (authQuery.data ?? null)`. Consequently, every foreground verification caused mounted business pages (such as `MakeupSchedulingPage`, `CapabilitiesPage`, `AppLayout`) to temporarily observe `auth = null` and empty capabilities (`hasAccess: true -> false -> true`). When same-user verification concluded, capability-dependent bootstrap effects re-ran (e.g. `academicYearsApi.list(...) -> setAcademicYearId(res.items[0].id)`), unintentionally resetting user-selected state (such as academic year) merely upon Alt-Tab / foreground focus.

### 10.2 Architectural Separation: Context Stability vs. Visual/Interaction Authority
Reconciliation semantics require strictly separating internal context stability from visual/interaction authority:
1. **Context Stability:**
   - **`NONE`:** `auth = authQuery.data ?? null`.
   - **`FOREGROUND_VERIFY`:** `auth = last verified authQuery.data / retained verified auth` (never null). Mounted descendants retain access to their provisionally verified identity and capabilities without spurious capability-drop reinitialization.
   - **`BOUNDARY_VERIFY`:** `auth = null` strictly. A remote authoritative session boundary already destroyed the old session cache/generation, so old identity must not be available.
   - **Initial Auth Check:** No previously verified auth exists, so `auth = null`.
2. **Visual & Interaction Authority:**
   - `ProtectedRoute` remains the confidentiality and interaction boundary.
   - During `FOREGROUND_VERIFY` and foreground indeterminate error, the protected subtree remains completely shielded (`aria-hidden="true"`, `display: none`, no pointer or keyboard interaction).
   - Only authoritative confirmation of same-user `/auth/me` removes the shield.
   - Any identity change (User B) or confirmed 401 unmounts/destroys the old protected subtree.

### 10.3 Capability Route Normalization
- Previously, `CapabilityRoute` contained a special bypass:
  ```tsx
  if (auth.reconciliationMode === 'FOREGROUND_VERIFY') {
    return <Outlet />;
  }
  ```
- With retained verified auth in `FOREGROUND_VERIFY`, this bypass is removed. `CapabilityRoute` now evaluates retained verified capabilities normally:
  ```tsx
  if (!auth.auth || !allow(auth.auth.capabilities)) return <Navigate to="/khong-co-quyen" replace />;
  return <Outlet />;
  ```
- This prevents unauthorized components from mounting merely because foreground verification is active, while parent `ProtectedRoute` continues shielding the subtree.

### 10.4 Static Audit of `useAuth()` Consumers
A bounded static audit of mounted protected pages calling `useAuth()` confirmed:
- `AppLayout`: derived user display and navigation capabilities stay stable; no layout flicker.
- `HomePage`: work index links and capability checks maintain stable rendering.
- `ProfilePage`: profile display remains intact.
- `ReportingStatementsPage`, `ReportingStatementDetailPage`: query enablement and filter state remain stable.
- `CapabilitiesPage`: capability inspector does not flash empty state during verification.
- `DutyAssignmentsPage`, `TemporalAssignmentsPage`: assignment management scopes remain stable.
- `MakeupSchedulingPage`: bootstrap effect depending on `hasAccess` does not oscillate, preventing academic year resets.

### 10.5 Regression Suite & Verification
- Suite: `apps/web/src/__tests__/session-cache-isolation.test.tsx` (52 tests, 100% PASS):
  - **Test 47 (RC7-01):** Foreground shield retains last verified auth internally (`status === 'checking'`, `reconciliationMode === 'FOREGROUND_VERIFY'`, `auth?.user.id === 'user-a'`), while route wrapper is hidden and shield is visible.
  - **Test 48 (RC7-01):** Real `MakeupSchedulingPage` retains user-selected academic year (`year-2` remains `year-2`) after foreground verification, and bootstrap list request count remains exactly 1.
  - **Test 49 (RC7-01):** Real `MakeupSchedulingPage` retains selected `year-2` through foreground network failure + retry for same user; no capability-derived reset.
  - **Test 50 (RC7-01):** `FOREGROUND_VERIFY` does not bypass `CapabilityRoute`; unauthorized child component is never mounted.
  - **Test 51 (RC7-01):** `BOUNDARY_VERIFY` exposes no retained auth (`auth === null`, `reconciliationMode === 'BOUNDARY_VERIFY'`), and old cache/subtree remains destroyed.
  - **Test 52 (RC7-01):** Changed user (User B) still resets real page context, clears User A cache, and mounts fresh state.
  - **Tests 1–46:** All existing session isolation, boundary reconciliation, BroadcastChannel fallback, and indeterminate failure tests continue to pass.
- Suite: `apps/web/src/__tests__/makeup-scheduling-page.test.tsx`: 10/10 tests PASS.
- Web unit tests: `npm run test:unit -w apps/web`: 28 test files passed (426 tests: 420 previous + 6 new).
- Monorepo unit tests: `npm run test:unit`: 127 test suites passed (2256 tests: 426 web + 1830 api).
- Lint: `npm run lint`: PASS (0 warnings across all 4 packages).
- Typecheck: `npm run typecheck`: PASS (0 errors across contracts, config, api, web).
- Static UI gate: `npm run test:ui:static`: PASS.
- Monorepo build: `npm run build`: PASS (contracts, config, api, web).
- Whitespace / diff check: `git diff --check`: PASS (0 whitespace / newline issues).

### 10.6 Commits and Current HEAD
- Implementation commit: `22a27533036fb1cbeae0e95db50b91e9f16cb839` (`fix(web): retain verified auth during foreground checks`)
- Documentation commit: `d99af7699ef6a1347dd590c1c79656ad07600688` (`docs(governance): record P5-040 review correction 007`)
- Task Governance:
  - `P5-040`: strictly **`IN_PROGRESS`** (Correction 007 completed on branch; awaiting final independent review before Codex).
  - `P6-020`: strictly **`DEFERRED_WITH_TRIGGER`**.
  - Production state: strictly **`PRE-OPERATIONAL`**.

## 11. Review Correction 008 — Close Codex Adversarial Findings AR-01..AR-04

### 11.1 Scope and Objective
Address confirmed material adversarial findings AR-01 through AR-04 from the Codex independent review on branch `fix/p5-040-consistency-correction-001`:
1. **AR-01 (HIGH): Protected HTTP 401 Must Invalidate Session Even If Body Is Malformed.**
   - *Root cause:* `apiFetch()` invoked `readJson(response)` before inspecting `response.status === 401 && shouldNotifyUnauthorized`. If a protected endpoint returned HTTP 401 with malformed JSON (`{bad`), empty body, or rejected stream, `readJson` threw an unhandled `ApiError` prior to `notifyUnauthorized()`. Consequently, authoritative session invalidation was lost, and stale auth/cache/generation persisted.
   - *Remediation:* For protected non-credential endpoints, HTTP 401 is authoritative by its status code alone. Session invalidation (`notifyUnauthorized()`) is triggered immediately upon header verification of the current generation, before attempting body parsing. Body read/parse failures on 401 are safely caught and normalized into bounded 401 `ApiError`. Credential endpoints (`/auth/login`, `/auth/change-password`) remain exempt from global unauthorized broadcast. Outdated generation 401 responses cannot invalidate newer sessions.
2. **AR-02 (MEDIUM): BOUNDARY_VERIFY Must Never Be Downgraded By Focus.**
   - *Root cause:* During a pending remote boundary check (`BOUNDARY_VERIFY`), window focus triggered `handleForegroundSafety()` which invoked `reconcileSessionBoundary({ isRemoteBoundary: false })`. This demoted the reconciliation mode to `FOREGROUND_VERIFY`. Because old auth had already been purged to `null`, `ProtectedRoute` revealed the mounted subtree while `CapabilityRoute` saw `auth === null` and redirected to `/khong-co-quyen`. After User B resolved, the browser remained stuck on the denial route.
   - *Remediation:* `BOUNDARY_VERIFY` is made strictly dominant until the server returns authoritative 200 or 401. Foreground focus/visibility events while `reconciliationModeRef.current === 'BOUNDARY_VERIFY'` (or in boundary recovery) are strict NO-OPs that do not downgrade mode, repurge generation, or spawn duplicate requests. `reconcileSessionBoundary` defensively preserves `BOUNDARY_VERIFY` against non-remote calls.
3. **AR-03 (MEDIUM): Telegram message_id Must Be Runtime-Validated.**
   - *Root cause:* `TelegramBotApiAdapter` asserted provider response typing via TypeScript assertion `(await response.json()) as { ok?: boolean; result?: { message_id?: number } }` and checked `body.ok === true && body.result?.message_id != null`. Strings, objects, arrays, floats, or negative numbers could be treated as valid success, leading to durable `SENT` status.
   - *Remediation:* Added strict runtime structural validation: `body` must be a non-null object and not array; `body.ok === true`; `result` must be a non-null object and not array; `message_id` must be a finite safe positive integer (`typeof msgId === 'number' && Number.isSafeInteger(msgId) && msgId > 0`). Any structurally invalid acknowledgement returns `sanitizedErrorCode: 'MALFORMED_SUCCESS_ACKNOWLEDGEMENT', uncertainOutcome: true`, ensuring delivery status resolves to durable `UNKNOWN`.
4. **AR-04 (MEDIUM): Make-Up Candidate BLOCKED State Must Not Be Lost When Schedule Read Fails.**
   - *Root cause:* `MakeupSchedulingPage` coupled candidates and schedules loading with `Promise.all([listCandidates(...), listSchedules(...)])`. If candidates returned `BLOCKED` but schedules failed with 503, the entire `Promise.all` rejected, preventing candidate `BLOCKED` status from applying. The UI retained old `PASS` candidate state and visible forms.
   - *Remediation:* Decoupled candidate and schedule queries using separate promises and `Promise.allSettled`. At reload start, candidate state transitions to fail-closed `LOADING`, clearing existing selection, target options, and replacement references. Candidate `BLOCKED` status is applied immediately and independently of schedule query status. Scheduling actions and form display are strictly gated on `candidatesStatus === 'PASS'`. Candidate and schedule errors are rendered in independent alerts. Monotonic sequence token (`loadSeqRef`) prevents stale delayed requests from overwriting newer state.

### 11.2 Invariants Preserved
- Secret sanitization (CX-02) and no credential leakage.
- Full-body Telegram timeout (CX-04).
- Exact historical `ppctItemRevisionId` provenance retention (CX-06).
- All session semantics, foreground draft survival, and indeterminate network/5xx recovery policies from Corrections 002 through 007.
- Zero schema changes, zero database migrations, zero workflow/infrastructure changes.

### 11.3 Regression Suites & Test Evidence
1. **AR-01 Tests (A1..A7) in `apps/web/src/__tests__/session-cache-isolation.test.tsx`:**
   - **Test 53 (A1):** Protected 401 + valid JSON -> exactly one unauthorized boundary, auth anonymous, cache cleared, generation rotated.
   - **Test 54 (A2):** Protected 401 + malformed JSON (`{bad`) -> identical session invalidation to A1.
   - **Test 55 (A3):** Protected 401 + empty JSON -> session invalidated.
   - **Test 56 (A4):** Protected 401 with body read rejecting after headers -> session invalidated.
   - **Test 57 (A5):** Credential `/auth/login` 401 -> does NOT trigger global unauthorized boundary.
   - **Test 58 (A6):** Credential `/auth/change-password` 401 -> preserves deterministic reconciliation policy without global boundary.
   - **Test 59 (A7):** Old-generation protected 401 arriving after User B session established -> does NOT invalidate User B.
2. **AR-02 Tests (B1..B6) in `apps/web/src/__tests__/session-cache-isolation.test.tsx`:**
   - **Test 60 (B1):** Remote boundary pending -> focus -> mode remains `BOUNDARY_VERIFY`.
   - **Test 61 (B2):** Capability route where User B has required capability -> focus during boundary verify does not redirect to `/khong-co-quyen`; remains on intended route after B resolves.
   - **Test 62 (B3):** Remote boundary pending -> multiple focus/visibility events -> no duplicate purge or generation churn.
   - **Test 63 (B4):** Remote boundary recovery after network/503 -> focus -> remains BOUNDARY recovery, not foreground.
   - **Test 64 (B5):** Explicit retry from BOUNDARY recovery -> remains `BOUNDARY_VERIFY` until 200/401.
   - **Test 65 (B6):** User B lacks capability -> only AFTER authoritative B resolves may `CapabilityRoute` redirect to `/khong-co-quyen`.
3. **AR-03 Tests (C1..C8) in `apps/api/src/telegram/`:**
   - **C1 (Test 15):** Valid positive integer `message_id` -> success (`SENT`).
   - **C2 (Test 16):** Missing `message_id` -> `MALFORMED_SUCCESS_ACKNOWLEDGEMENT`, `uncertainOutcome: true`.
   - **C3 (Test 17):** String `message_id` -> `MALFORMED_SUCCESS_ACKNOWLEDGEMENT`, `uncertainOutcome: true`.
   - **C4 (Test 18):** Object `message_id` -> `MALFORMED_SUCCESS_ACKNOWLEDGEMENT`, `uncertainOutcome: true`.
   - **C5 (Test 19):** Array `message_id` -> `MALFORMED_SUCCESS_ACKNOWLEDGEMENT`, `uncertainOutcome: true`.
   - **C6 (Test 20):** Float/invalid numeric `message_id` (`123.45`, `-5`) -> `MALFORMED_SUCCESS_ACKNOWLEDGEMENT`, `uncertainOutcome: true`.
   - **C7 (Test 21):** Malformed JSON -> `MALFORMED_SUCCESS_ACKNOWLEDGEMENT`, `uncertainOutcome: true`.
   - **C8 (`telegram.service.spec.ts`):** Service receives malformed acknowledgement -> durable delivery status `UNKNOWN`.
4. **AR-04 Tests (D1..D6) in `apps/web/src/__tests__/makeup-scheduling-page.test.tsx`:**
   - **D1 (Test 11):** Initial PASS -> select candidate -> reload: candidates BLOCKED, schedules 503 -> BLOCKED warning visible, schedule error visible, old create form absent, submit impossible.
   - **D2 (Test 12):** Initial PASS -> selected candidate -> candidate request 503 -> old candidate becomes non-actionable.
   - **D3 (Test 13):** Candidates BLOCKED -> schedules delayed/fails later -> BLOCKED applied independently before and after schedule failure.
   - **D4 (Test 14):** Candidates PASS -> schedules 503 -> candidate PASS behavior remains deterministic, schedule error displayed separately.
   - **D5 (Test 15):** Overlapping reload: request A delayed, request B completes first -> late A cannot overwrite B state.
   - **D6 (Test 16):** BLOCKED response clears old target options and replacement selection; replacement button disabled.

### 11.4 Verification Summary
- `session-cache-isolation.test.tsx`: 65 passed, 0 failed.
- `makeup-scheduling-page.test.tsx`: 16 passed, 0 failed.
- `telegram-bot-api.adapter.spec.ts`: 21 passed, 0 failed.
- `telegram.service.spec.ts`: 28 passed, 0 failed.
- Web unit tests: `npm run test:unit -w apps/web`: 28 test files passed (439 tests).
- Monorepo unit tests: `npm run test:unit`: 127 test suites passed (2276 tests: 439 web + 1837 api).
- Lint: `npm run lint`: PASS (0 warnings across all 4 packages).
- Typecheck: `npm run typecheck`: PASS (0 errors across contracts, config, api, web).
- Static gates: PASS (`test:schema:static`, `test:secrets`, `test:deploy:static`, `test:deploy:behavior`, `test:workflow:contract`, `test:deploy:powershell`, `test:ui:static`).
- Monorepo build: `npm run build`: PASS (contracts, config, api, web).
- Diff check: `git diff --check`: PASS.

### 11.5 Implementation Commits
1. `5dbb88c` — `fix(web): invalidate malformed protected 401 responses` (AR-01)
2. `05d7e90` — `fix(web): preserve boundary reconciliation across focus` (AR-02)
3. `3f37fb7` — `fix(telegram): validate provider success acknowledgement` (AR-03)
4. `6f5516a` — `fix(makeup): fail closed across candidate reload errors` (AR-04)
5. *(current)* — `docs(governance): record P5-040 review correction 008`

### 11.6 Governance Status
- Task `P5-040`: strictly **`IN_PROGRESS`** (awaiting independent adversarial re-review).
- Task `P6-020`: strictly **`DEFERRED_WITH_TRIGGER`**.
- Production state: strictly **`PRE-OPERATIONAL`**.

## 12. Review Correction 009 — Preserve Authoritative 401 When Global Notification is Suppressed (AR-01-R1)

### 12.1 Scope and Objective
Address confirmed adversarial finding AR-01-R1 from the Codex targeted adversarial re-review on branch `fix/p5-040-consistency-correction-001`:
1. **AR-01-R1 (MEDIUM): HTTP 401 Authority Classification Coupled with Global Side Effect.**
   - *Root cause:* `apiFetch()` in `apps/web/src/lib/api-client.ts` previously branched on `response.status === 401 && shouldNotifyUnauthorized`. When global notification was suppressed (`shouldNotifyUnauthorized === false`, such as in `fetchAuthMe({ notifyUnauthorized: false })`), HTTP 401 fell through to standard body parsing via `readJson(response)`. If the 401 response body had malformed JSON, a stream read failure, or stalled indefinitely, `readJson` threw a non-ApiError exception. Callers (e.g. `reconcileSessionBoundary`) caught this and normalized it to `ApiError(0, 'Không thể kết nối đến máy chủ.')`, incorrectly treating authoritative HTTP 401 as an indeterminate network error (resulting in error recovery rather than authoritative anonymous).
   - *Remediation:* Completely decouple HTTP 401 status code authority from global unauthorized notification:
     - Every current-generation HTTP 401 is surfaced to callers as `ApiError` with `statusCode: 401` unconditionally.
     - `shouldNotifyUnauthorized === false` suppresses ONLY the global notification/broadcast side effect; it never ignores HTTP 401 status authority or falls through to body parsing.
     - The 401 response body is non-authoritative for session validity and is not awaited at all, eliminating any risk of stream stalls, connection drops, or malformed syntax masking the authoritative 401 boundary. Safe, bounded local copy (`Phiên làm việc đã hết hạn hoặc không hợp lệ.`) is returned.

### 12.2 Invariants Preserved
- AR-02 boundary dominance, AR-03 Telegram runtime ack validation, AR-04 Make-up fail-closed reload.
- Generation safety: generation check remains strictly prior to 401 handling, preventing stale-generation 401 responses from invalidating newer user sessions.
- Credential endpoints (`/auth/login`, `/auth/change-password`) continue returning `ApiError(401)` without global unauthorized broadcast, preserving existing user-facing form validation and error UX.
- Zero schema changes, zero database migrations, zero workflow/infrastructure changes.

### 12.3 Regression Suites & Test Evidence
1. **AR-01-R1 Tests (R1-01..R1-09) in `apps/web/src/__tests__/session-cache-isolation.test.tsx` (Tests 66..74):**
   - **Test 66 (R1-01):** `fetchAuthMe({ notifyUnauthorized: false })` + 401 valid JSON -> `ApiError.statusCode === 401`, listener NOT called.
   - **Test 67 (R1-02):** `fetchAuthMe({ notifyUnauthorized: false })` + 401 malformed JSON -> `ApiError.statusCode === 401`, listener NOT called.
   - **Test 68 (R1-03):** `fetchAuthMe({ notifyUnauthorized: false })` + 401 body stream rejects with `TypeError('terminated')` -> `ApiError.statusCode === 401`, listener NOT called.
   - **Test 69 (R1-04):** `fetchAuthMe({ notifyUnauthorized: false })` + 401 body stream never resolves -> `ApiError(401)` returned immediately without waiting for body.
   - **Test 70 (R1-05):** Foreground reconciliation + `/auth/me` 401 with body read rejecting -> final status anonymous, business cache cleared, generation rotated.
   - **Test 71 (R1-06):** Remote `BOUNDARY_VERIFY` + `/auth/me` 401 with body read rejecting -> final status anonymous, no old cache, NOT recovery/error.
   - **Test 72 (R1-07):** Credential `/auth/change-password` 401 + follow-up `/auth/me` 401 with broken/stalled body -> recognized confirmed expired session, old auth cleared according to existing policy.
   - **Test 73 (R1-08):** Credential `/auth/login` 401 with malformed/stalled body -> `ApiError(401)`, no global unauthorized notification, login form UX preserved.
   - **Test 74 (R1-09):** Old-generation protected 401 after User B exists -> remains rejected as session change (`statusCode: 0`), User B unaffected.

### 12.4 Verification Summary
- `session-cache-isolation.test.tsx`: 74 passed, 0 failed (all 65 prior tests + 9 R1 tests).
- `api-client.test.ts`: 13 passed, 0 failed.
- `auth-flow.test.tsx`: 23 passed, 0 failed.
- Web unit tests: `npm run test:unit -w apps/web`: 28 test files passed (454 tests).
- Monorepo unit tests: `npm run test:unit`: 127 test files passed (2292 tests: 454 web + 1838 api).
- Lint: `npm run lint`: PASS (0 warnings across all 4 packages).
- Typecheck: `npm run typecheck`: PASS (0 errors across contracts, config, api, web).
- Static gates: PASS (`test:schema:static`, `test:secrets`, `test:ui:static`).
- Monorepo build: `npm run build`: PASS (contracts, config, api, web).
- Diff check: `git diff --check`: PASS.

### 12.5 Implementation Commits
1. `30ebf3a` — `fix(web): preserve suppressed 401 authority`
2. *(current)* — `docs(governance): record P5-040 review correction 009`

### 12.6 Governance Status
- Task `P5-040`: strictly **`CLOSED`** (PR #202 merged to `main@1282f24a5300da88c155c7dc5523644d14bd53c8`; PR CI #657 SUCCESS; post-merge CI #658 SUCCESS).
- Task `P6-020`: strictly **`DEFERRED_WITH_TRIGGER`**.
- Production state: strictly **`PRE-OPERATIONAL`**.

