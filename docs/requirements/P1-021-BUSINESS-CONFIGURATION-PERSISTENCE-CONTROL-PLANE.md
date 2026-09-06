# P1-021 — Business Configuration persistence/control plane

## Trạng thái

**IN_PROGRESS** trên branch `feat/business-configuration-persistence-control-plane-021`, bắt đầu từ `origin/main@836e56ca3277986c72139080a8da70ea78796a3f`.

- Authority: ADR-046 và P1-020 đã CLOSED.
- Traceability: T21, T22.
- P1-021 không đóng task, không tạo PR/CI/merge evidence, không deploy và không mở P1-022.

## Topology và boundary

`BusinessPolicyStream` là authority logical cho `family + exact bounded resource`; chỉ có `SCHOOL_WIDE` hoặc `ACADEMIC_YEAR`. `BusinessPolicyVersion` giữ DRAFT/PUBLISHED/REVERSED, JSONB typed payload, historical validator version, civil-DATE effectivity, replacement/correction lineage và evidence actor. `BusinessPolicyCommand` giữ receipt idempotency theo `actor + commandId` cùng canonical fingerprint.

Registry là application-owned allowlist. Production registry hiện **rỗng**, không có family publication-enabled: P1-021 không enable semantic operational-start, workload hay reporting chưa được task chủ quản chấp nhận. Test chỉ được dùng provider override với test-only family; không seed và không export vào production catalog.

`SystemSetting` không thay đổi, không có relation, không được đọc/lưu/fallback. Technical config/secrets không có family hay endpoint; strict validator là authority boundary và audit chỉ lưu fingerprint/metadata an toàn.

## API và resolver

Management routes đều yêu cầu `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE`: `GET /api/business-configuration/families`, `policies`, `policies/:streamId`, `resolve`; và command `POST` cho drafts, edit-draft, publish, replace, retire, correct. Không có PATCH/DELETE published state.

`resolveEffectiveBusinessPolicy(family, resource, civilDate, optionalExistingTransaction)` trả exact `policyVersionId`/validator/payload hoặc `UNKNOWN_POLICY_FAMILY`, `INVALID_POLICY_RESOURCE`, `INVALID_EFFECTIVE_DATE`, `POLICY_NOT_CONFIGURED`, `POLICY_AMBIGUOUS`, `POLICY_CORRUPT`; không đọc env hay `SystemSetting`.

Lifecycle mutation dùng Serializable transaction kèm bounded retry (tối đa 3 attempts cho P2034, 40001, 40P01; deterministic business conflicts không retry; thất bại transient sau 3 attempts map thành typed conflict; failed attempt rollback toàn transaction), optimistic draft revision, receipt idempotency và same-transaction `AuditService`. Migration thêm resource/lifecycle checks, partial unique streams, inclusive GIST exclusion cho PUBLISHED overlap, lineage trigger và immutable-published trigger.

## 20-Gate Implementation & Evidence Matrix

| # | Gate | Implementation evidence | Test/verifier evidence | Local execution |
|---|------|-------------------------|------------------------|-----------------|
| 1 | Separate persistence topology | `prisma/schema.prisma` (`BusinessPolicyStream`, `BusinessPolicyVersion`, `BusinessPolicyCommand`); `prisma/migrations/20260906020000_business_configuration_persistence_foundation/migration.sql` | `scripts/ci/verify-business-configuration-schema.cjs`, `scripts/ci/verify-business-configuration-schema.sql` (Invariants 1, 4, 10, 12, 14, 18, 30) | PASS (static), LOCAL NOT RUN — thiếu isolated PostgreSQL environment (migration SQL) |
| 2 | DB-backed no-overlap | `migration.sql` (`business_policy_versions_no_published_overlap` EXCLUDE USING gist) | `scripts/ci/verify-business-configuration-schema.sql` (Invariants 19, 22), `apps/api/test/business-configuration/business-configuration.integration.spec.ts` (Section 12) | PASS (static), LOCAL NOT RUN — thiếu isolated PostgreSQL environment (migration SQL/integration) |
| 3 | Resource integrity & deletion protection | `migration.sql` (`business_policy_streams_resource_shape_check`, `academic_year_fkey` ON DELETE RESTRICT, `stream_fkey` ON DELETE RESTRICT) | `scripts/ci/verify-business-configuration-schema.sql` (Invariants 2, 3, 7, 33, 34) | PASS (static), LOCAL NOT RUN — thiếu isolated PostgreSQL environment (migration SQL) |
| 4 | Code-defined registry + validator version | `apps/api/src/business-configuration/business-policy-registry.ts` (`BusinessPolicyFamilyDefinition`, `familyFor`, `validateResource`, `PRODUCTION_BUSINESS_POLICY_FAMILIES`) | `apps/api/src/business-configuration/business-policy-registry.spec.ts`, `scripts/ci/verify-business-configuration-schema.cjs` | PASS |
| 5 | Unknown/disabled family & payload rejection | `apps/api/src/business-configuration/business-configuration.service.ts` (`family()`, `validateResource()`, `family.validate()`) | `apps/api/src/business-configuration/business-configuration.service.spec.ts`, `apps/api/test/business-configuration/business-configuration.integration.spec.ts` (Section 9) | PASS (unit), LOCAL NOT RUN — thiếu isolated PostgreSQL environment (integration) |
| 6 | Technical-config rejection | `apps/api/src/business-configuration/business-policy-registry.ts` (`strictObject`, validators rejecting unknown fields) | `apps/api/test/business-configuration/business-configuration.integration.spec.ts` (table-driven test rejecting 8 representative technical fields) | PASS (unit), LOCAL NOT RUN — thiếu isolated PostgreSQL environment (integration) |
| 7 | Civil-date effectivity semantics | `apps/api/src/business-configuration/business-configuration.service.ts` (`dates()`, `resolveEffectiveBusinessPolicy()`), `migration.sql` (`interval_check`, GIST exclusion) | `scripts/ci/verify-business-configuration-schema.sql` (Invariants 8, 20, 21), `apps/api/test/business-configuration/business-configuration.integration.spec.ts` (Section 12) | PASS (static), LOCAL NOT RUN — thiếu isolated PostgreSQL environment (migration SQL/integration) |
| 8 | Draft-only edit / no published PATCH/delete | `apps/api/src/business-configuration/business-configuration.service.ts` (`editDraft` checking status DRAFT; controller has no PATCH/DELETE routes), `migration.sql` (`immutable_guard`) | `scripts/ci/verify-business-configuration-schema.sql` (Invariants 24-27), `apps/api/test/business-configuration/business-configuration.integration.spec.ts` (Sections 10, 11) | PASS (static), LOCAL NOT RUN — thiếu isolated PostgreSQL environment (migration SQL/integration) |
| 9 | Prospective replace/retire | `apps/api/src/business-configuration/business-configuration.service.ts` (`replace()`, `retire()`), `migration.sql` (allowed `effective_until` close trigger) | `scripts/ci/verify-business-configuration-schema.sql` (Invariants 28, 29), `apps/api/test/business-configuration/business-configuration.integration.spec.ts` (Sections 15, 16) | PASS (static), LOCAL NOT RUN — thiếu isolated PostgreSQL environment (migration SQL/integration) |
| 10 | Correction/reversal retained lineage | `apps/api/src/business-configuration/business-configuration.service.ts` (`correct()`), `migration.sql` (`lineage_guard`, `lifecycle_evidence_check`) | `scripts/ci/verify-business-configuration-schema.sql` (Invariants 14, 15, 18, 23), `apps/api/test/business-configuration/business-configuration.integration.spec.ts` (Section 17) | PASS (static), LOCAL NOT RUN — thiếu isolated PostgreSQL environment (migration SQL/integration) |
| 11 | Internal exact historical resolver | `apps/api/src/business-configuration/business-configuration.service.ts` (`resolveEffectiveBusinessPolicy()`) | `apps/api/src/business-configuration/business-configuration.service.spec.ts`, `apps/api/test/business-configuration/business-configuration.integration.spec.ts` (Section 13) | PASS (unit), LOCAL NOT RUN — thiếu isolated PostgreSQL environment (integration) |
| 12 | Typed resolver outcomes & conflict handling | `packages/contracts/src/index.ts` (`BusinessPolicyResolutionOutcome`), `apps/api/src/business-configuration/business-configuration.service.ts` | `apps/api/src/business-configuration/business-configuration.service.spec.ts` (AMBIGUOUS, CORRUPT, RESOLVED), `apps/api/test/business-configuration/business-configuration.integration.spec.ts` (Section 13) | PASS (contracts/unit), LOCAL NOT RUN — thiếu isolated PostgreSQL environment (integration) |
| 13 | Capability seeded once SCHOOL_WIDE only | `prisma/capability-catalog.cjs` (`BUSINESS_CONFIGURATION_MANAGE`, `['SCHOOL_WIDE']`), `packages/contracts/src/index.ts` | `scripts/ci/verify-business-configuration-schema.cjs`, `apps/api/src/business-configuration/business-configuration-capability.spec.ts` | PASS |
| 14 | Authorization success and denial matrix | `apps/api/src/business-configuration/business-configuration.controller.ts` (`@RequireCapability('BUSINESS_CONFIGURATION_MANAGE', { scope: 'SCHOOL_WIDE' })`) | `apps/api/test/business-configuration/business-configuration.integration.spec.ts` (Section 8: PASS for active grant, DENY for 8 unauthorized conditions) | PASS (typecheck/build), LOCAL NOT RUN — thiếu isolated PostgreSQL environment (integration) |
| 15 | Same-transaction audit / no success on fail | `apps/api/src/business-configuration/business-configuration.service.ts` (`mutate()`, `successAudit()`) | `apps/api/test/business-configuration/business-configuration.integration.spec.ts` (Section 19: AuditService.write failure rolls back mutations) | PASS (typecheck/build), LOCAL NOT RUN — thiếu isolated PostgreSQL environment (integration) |
| 16 | Sufficient audit evidence | `apps/api/src/business-configuration/business-configuration.service.ts` (`successAudit()` recording actor, action, entityId, metadata) | `apps/api/test/business-configuration/business-configuration.integration.spec.ts` (Sections 9, 10, 11, 15, 16, 17) | PASS (typecheck/build), LOCAL NOT RUN — thiếu isolated PostgreSQL environment (integration) |
| 17 | Transaction-safe / idempotent concurrency | `apps/api/src/business-configuration/business-configuration.service.ts` (`mutate()` dùng Serializable transaction kèm bounded retry tối đa 3 attempts cho P2034/40001/40P01, `canonicalJson()`, `fingerprint()`), `migration.sql` (`business_policy_commands_actor_command_key`) | `scripts/ci/verify-business-configuration-schema.sql` (Invariants 30, 31, 32), `apps/api/src/business-configuration/business-configuration.service.spec.ts` (bounded retry cases A-H), `apps/api/test/business-configuration/business-configuration.integration.spec.ts` (Sections 18, 22, 23) | PASS (static/unit), LOCAL NOT RUN — thiếu isolated PostgreSQL environment (migration SQL/integration) |
| 18 | Resolver transaction participation | `apps/api/src/business-configuration/business-configuration.service.ts` (`resolveEffectiveBusinessPolicy(..., db: Db = this.prisma)` accepting `Prisma.TransactionClient`) | `apps/api/src/business-configuration/business-configuration.service.spec.ts` | PASS |
| 19 | No SystemSetting integration | `prisma/schema.prisma` (`SystemSetting` untouched, no relations), `apps/api/src/business-configuration/business-configuration.service.ts` (no SystemSetting usage) | `scripts/ci/verify-business-configuration-schema.cjs`, `apps/api/test/business-configuration/business-configuration.integration.spec.ts` (Section 6) | PASS (static), LOCAL NOT RUN — thiếu isolated PostgreSQL environment (integration) |
| 20 | No unaccepted production family semantics | `apps/api/src/business-configuration/business-policy-registry.ts` (`PRODUCTION_BUSINESS_POLICY_FAMILIES = []`) | `scripts/ci/verify-business-configuration-schema.cjs`, `apps/api/src/business-configuration/business-policy-registry.spec.ts` | PASS |

## Local evidence summary

- `npm run prisma:generate`: PASS.
- `npm run test:schema:static`: PASS (foundation, academic structure, business configuration static verifiers).
- `npm run lint -w packages/contracts`: PASS.
- `npm run typecheck -w packages/contracts`: PASS.
- `npm run build -w packages/contracts`: PASS.
- `npm run lint -w apps/api`: PASS.
- `npm run typecheck -w apps/api`: PASS.
- `npm run test:unit -w apps/api`: PASS (66 test suites, 938 tests passed).
- `npm run build -w apps/api`: PASS.
- `npm exec --workspace apps/api -- jest --listTests`: PASS (`business-configuration.integration.spec.ts` discovered).
- PostgreSQL integration/migration test execution: `LOCAL NOT RUN — thiếu isolated PostgreSQL environment`.
