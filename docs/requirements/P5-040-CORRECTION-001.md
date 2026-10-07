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
