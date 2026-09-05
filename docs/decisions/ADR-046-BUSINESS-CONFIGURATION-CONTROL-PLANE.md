# ADR-046 — Business Configuration Control Plane

- **Status:** Proposed by P1-020; pending independent review, merge and `SYNC-P1-020` acceptance.
- **Date:** 2026-09-06
- **Scope:** Typed/versioned business-policy authority, effectivity, lifecycle, authorization, historical resolution and technical-configuration exclusion.
- **Task baseline:** `main@28fc52dd0f62a78eda97a3e631770be47d465efa`
- **Traceability:** T21, T22; downstream T23, T28, T30

## Context

The pre-pilot baseline requires data-driven school business policy that changes over time, but explicitly rejects an untyped `SystemSetting` dumping ground. Current `SystemSetting` is Phase 00 mutable string metadata. It has no family typing, version/effectivity history, immutable provenance or bounded business-policy authorization.

Technical configuration already has separate environment, deployment and production authorities. Combining those values with school policy would expose secrets and grant business administrators technical control. Existing retained-history domains and ADR-008/041/042/043 supply patterns and invariants, but no existing domain is itself the Business Configuration authority.

## Decision

### 1. Separate canonical domain

Business Configuration is a separate retained domain. One logical stream is identified by:

`approved policy family + exact bounded business resource`.

It retains typed policy versions, effectivity and correction/replacement lineage. `SystemSetting`, environment variables, deployment files and caller-supplied policy blobs are not authority or fallback.

### 2. Closed family registry

Policy families are stable, code-defined and allowlisted. Every enabled family binds one explicit versioned payload validator, one permitted business-resource kind and one downstream semantic authority. Unknown/disabled family IDs, wrong resource kinds, unknown payload fields and invalid contracts fail closed.

Admins cannot create families, validators, expressions, plugins or arbitrary JSON schemas. A new family requires a registered product/architecture task and reviewed registry/contract change.

The foundation recognizes only categories already bound to registered work: operational start (`P1-030`/`P1-031`), special-program workload/reporting (`P4-050`) and trigger-gated workload adjustment (`P4-060`/`P4-061`). P1-020 invents none of their formulas.

### 3. Minimal business resource kinds

The shared foundation supports only:

- logical `SCHOOL_WIDE` with no caller-chosen ID; or
- one exact retained `ACADEMIC_YEAR` identity.

Each family permits exactly one kind initially. Subject, class, user, activity and arbitrary resource scopes are excluded unless later registered authority changes this ADR.

Business resource ownership is not authorization scope. Management authorization remains school-wide even for an AcademicYear-bound policy.

### 4. Civil-date effectivity and fail-closed resolution

Effectivity is an inclusive civil `DATE` interval `effectiveFrom..effectiveUntil`; null end is open-ended. Adjacent intervals and deliberate gaps are valid. Overlap between authoritative versions for one family/resource/date is forbidden, and policies are never silently composed.

Current resolution uses the server-owned business date. Exact historical resolution accepts:

`family + resource + civilDate`

and returns one immutable version identity plus validated typed payload, or a typed unknown-family, invalid-resource/date, missing, ambiguous or corrupt result. Consumers do not choose a latest row, read `SystemSetting`, inspect env or accept a caller payload as policy authority. Required consumers block on missing/ambiguous/corrupt outcomes; this layer supplies no hidden default.

### 5. Retained lifecycle and correction

Drafts are non-authoritative and editable only with bounded concurrency controls. Publication makes family, resource, typed payload and start date immutable.

A legitimate future change creates a new version and atomically closes/replaces prior open authority prospectively. An interval end may change only through that audited lifecycle transition and never so as to alter which version governed an already elapsed date. Retirement is likewise explicit.

A data correction is distinct: it reverses but retains the incorrect assertion, requires actor/reason, and creates corrected version(s) with lineage. No authoritative history is physically deleted, generically patched, unpublished or reactivated.

### 6. Dedicated authorization and existing audit

Management requires an explicit active:

`BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE`

grant. ADR-008 applies. `SYSTEM_ADMIN`, title/role, PHT/BGH identity, `ACADEMIC_STRUCTURE_MANAGE`, technical/deployment access and other capabilities do not imply it. P1-021 owns capability seed/runtime implementation.

Mutations reuse the existing audit authority. Successful state change and success audit commit in one transaction and retain actor, action, family, resource, old/new version identity, effectivity and replacement/correction provenance as applicable. Failed mutation writes no success audit.

### 7. Historical provenance and frozen outputs

Downstream persisted calculations/materializations affected by policy retain exact policy-version identity or an explicitly accepted immutable equivalent. A later policy edit does not rewrite frozen/submitted/approved Reporting Statement revisions under ADR-041/042/043. Corrections to a downstream frozen fact use that domain's own successor/correction lifecycle.

### 8. Technical configuration is absolutely excluded

The domain/API/UI must not store, expose, edit, import or fall back to database URLs or PostgreSQL credentials; auth/session secrets; API/Telegram tokens or webhook credentials; TLS private material; SSH keys; CORS/security flags; process ports; Nginx configuration; Windows Service/Scheduled Task configuration; filesystem/deployment/backup paths or credentials; GitHub secrets/environment values; VPS topology; or any technical credential/deployment secret.

Those remain under the v1.3 addendum, production environment/runbook and P6 authorities. Business Configuration management grants no technical access.

### 9. `SystemSetting` remains outside

The existing `SystemSetting` model and Phase 00 migration remain unchanged legacy metadata. P1-021 must not store business policies there, read it from the resolver, expose it through Business Configuration endpoints or use it as fallback. Any future migration/reassessment requires a separate registered task.

### 10. Concurrency invariant

P1-021 must enforce family validation, effectivity integrity and one-authority-per-date through database-backed constraints plus transaction and command conflict controls. Concurrent publish/replace operations have one winner; a loser returns typed conflict and leaves no partial lifecycle or success-audit state.

## Consequences

- P1-021 can design exact tables/indexes and implement lifecycle/resolver/capability/audit without reopening business semantics.
- P1-022 can build only typed family-specific administration after P1-021 closes.
- The control plane is not a universal rules engine, plugin system, arbitrary formula language, raw JSON editor, secret manager or deployment console.
- Missing policy blocks a consumer that requires it unless that consumer's registered authority explicitly defines and tests a default.
- P1-030 and P4 tasks own their formulas and domain-specific provenance; P1-020 supplies only the shared authority.

## Rejected alternatives

- Reuse `SystemSetting` for business policy.
- Permit admin-created keys or arbitrary JSON payloads.
- Read environment values as business-policy fallback.
- Allow overlapping versions and choose newest/latest silently.
- Mutate published historical payload or physically delete evidence.
- Infer management access from title, role, `SYSTEM_ADMIN` or academic/deployment capability.
- Expose secrets, infrastructure or deployment settings in the business workspace.
- Build a universal rules engine or user-defined code/formula system.

## Implementation authorization

None. P1-020 is architecture/documentation only. P1-021 owns persistence, capability, control plane, audit, resolver and tests. P1-022 owns the bounded UI. Neither becomes startable until P1-020 merge, authoritative post-merge CI and non-recursive `SYNC-P1-020` closure.
