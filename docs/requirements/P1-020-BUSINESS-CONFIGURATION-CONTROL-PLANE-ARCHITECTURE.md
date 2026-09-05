# P1-020 — Business Configuration Control Plane Architecture

## Status

**PROPOSED / IN_REVIEW.**

- Task: `P1-020`
- Exact starting main: `28fc52dd0f62a78eda97a3e631770be47d465efa`
- Branch: `docs/business-configuration-architecture-020`
- Primary traceability: T21, T22
- Controlling decision: `ADR-046-BUSINESS-CONFIGURATION-CONTROL-PLANE.md`
- Scope: architecture and documentation only
- Implementation owners: `P1-021` persistence/control plane; `P1-022` administration workspace

This task creates no schema, migration, capability seed, API/runtime, UI, deployment or production change. It does not authorize P1-021 or P1-022 to start before P1-020 is merged, post-merge CI succeeds, and `SYNC-P1-020` closes the task.

## 1. Purpose and evidence

The accepted pre-pilot baseline requires a typed, auditable, version-aware business configuration layer for school policy that changes over time. The current repository has retained-history domain patterns, capability-based authorization and audit, but no canonical Business Configuration domain. The Phase 00 `SystemSetting` table is only a mutable string key/value metadata foundation and cannot satisfy T21.

P1-020 preserves:

- ADR-008 default-deny capability semantics;
- exact retained historical reads in existing business domains;
- ADR-041/042/043 frozen Reporting Statement semantics;
- the existing environment, secret, deployment and production authorities;
- the current `SystemSetting` schema and its Phase 00 history without expanding its authority;
- the P6 topology decision gate and all existing business-domain ownership.

The accepted source fingerprints remain unchanged:

- PA-B v1.2 DOCX blob: `c2c61a4e8acb9fde0e5fc5232467662048fd3380`;
- PA-B v1.3 addendum blob: `5876af5920d12ea6fcecf42d1b8a392cc4825f16`.

Therefore P0-900 did not trigger.

## 2. Terms

- **Policy family:** a stable, code-defined identifier registered through product governance. It names one bounded kind of business policy and fixes its payload validator, permitted business-resource kind, and resolver contract.
- **Policy definition/configuration:** the retained logical stream for one `family + resource` pair.
- **Policy version:** one immutable-on-publication typed payload assertion within that stream, with stable identity and lineage.
- **Effective policy:** the single published, non-reversed version authoritative for an exact resource and civil date.
- **Historical resolution:** resolving an exact retained policy-version identity for the requested `family + resource + civilDate`, without consulting current settings, environment values or a latest-row shortcut.
- **Business resource scope:** the object to which a policy applies. It is distinct from authorization capability scope.

## 3. Numbered decision closure

| ID | Question | Final decision |
|---|---|---|
| B1 | Canonical authority | A separate Business Configuration domain is canonical. Its logical stream is `approved family + bounded resource`; retained versions and effectivity establish authority. `SystemSetting`, env and caller payloads are not authority. |
| B2 | Family typing | Family identifiers are stable and code-defined in an allowlisted registry. Every enabled family has one explicit payload contract and validator plus one allowed resource kind. Unknown, disabled or contract-mismatched families fail closed. Adding a family requires a registered architecture/product task and reviewed code/contract change, not an admin-created key. No plugin/rules engine is introduced. |
| B3 | Initial family scope | The foundation recognizes the accepted family categories and their registered owners, but does not invent formulas. Operational start is specified by P1-030 and implemented by P1-031. Special-program workload/teaching credit and reporting treatment are specified by P4-050. Workload adjustments remain trigger-gated under P4-060/P4-061. Any other family must be registered before enablement. |
| B4 | Resource/ownership scope | The shared foundation supports only logical `SCHOOL_WIDE` and exact `ACADEMIC_YEAR` business resources. Each family registry entry permits exactly one of those kinds in its first contract. No subject, class, user, activity or caller-defined resource kind exists. `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE` authorization is separate from this business ownership dimension. |
| B5 | Time/effectivity | Effectivity uses server-normalized civil `DATE`, with inclusive `effectiveFrom` and inclusive nullable `effectiveUntil`; null means open-ended. Adjacent intervals are allowed. Gaps are representable and resolve as typed missing. Two authoritative versions for the same family/resource/date are forbidden; no implicit composition exists. “Current” uses server-owned business date, never browser/local time. |
| B6 | Versioning/lifecycle | The lifecycle supports draft authoring, publish/activate, prospective replacement/supersession, retirement/end and explicit correction/reversal. Draft payload may be edited with concurrency control. Published semantic payload is immutable. Closing an open interval is allowed only as an audited lifecycle transition paired atomically with replacement/retirement; it may not change the policy version governing an already elapsed date. No authoritative history is physically deleted. |
| B7 | Planned change vs correction | A planned change publishes a new version from a future civil date and prospectively closes/replaces the prior interval. A correction states that recorded history was wrong: it reverses/retains the prior assertion and creates corrected version(s) with mandatory reason and lineage. Correction never destroys the old evidence or silently edits frozen downstream records. |
| B8 | Missing-policy semantics | No hidden default exists. Resolution returns an exact version or a typed `POLICY_NOT_CONFIGURED`, `POLICY_AMBIGUOUS`, `POLICY_CORRUPT`, `UNKNOWN_POLICY_FAMILY`, `INVALID_POLICY_RESOURCE` or `INVALID_EFFECTIVE_DATE` outcome as applicable. A required consumer blocks on missing/ambiguous/corrupt policy. Any default must be explicit authority owned and tested by that downstream domain. |
| B9 | Authorization | Management authority is the new dedicated `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE` capability. It requires an explicit active grant. `SYSTEM_ADMIN`, position/title, PHT/BGH identity, `ACADEMIC_STRUCTURE_MANAGE`, deployment access or any other capability does not imply it. P1-021 implements/seeds it. |
| B10 | Runtime read authority | Trusted domains consume an internal resolver conceptually equivalent to `resolveEffectiveBusinessPolicy(family, resource, civilDate)`. It returns the exact typed payload and immutable policy-version identity or a typed failure. Runtime computations may not query arbitrary `SystemSetting`, inspect env as fallback, or accept caller-supplied policy blobs as authority. |
| B11 | Historical provenance | Any calculation/materialization whose meaning depends on policy must retain the exact policy-version identity, or an explicitly accepted immutable equivalent, sufficient to prevent drift. Frozen/submitted/approved Reporting Statements keep their frozen content and provenance; a later policy change never rewrites them. |
| B12 | Audit | Successful create-draft, edit-draft, publish, replace, retire, correct/reverse operations reuse the existing audit authority and retain actor, action, family, resource, old/new version identities, effectivity and correction/replacement provenance as applicable. Business mutation and success audit commit in the same transaction. Failed mutations write no success audit. |
| B13 | Concurrency | P1-021 must combine transaction isolation, database-backed integrity and explicit optimistic/idempotent command controls so concurrent publication/replacement has one winner and can never leave two authoritative versions for one family/resource/date. Losing or stale commands return typed conflict and leave no partial lifecycle/audit state. |
| B14 | P1-022 UI boundary | The workspace is capability-gated and family-bounded, with typed forms, validation, version/effectivity/history visibility and explicit publish/change/retire/correct actions. It is not a raw key/value editor, raw JSON workflow, secret manager, env editor or deployment console. |
| B15 | `SystemSetting` boundary | Existing `SystemSetting` remains untouched legacy Phase 00 metadata. It is not canonical Business Configuration authority. P1-021 must not store business-policy rows in it, migrate it implicitly, expose it through the Business Configuration API, or treat its values as resolver fallback. Any future reassessment requires its own registered task. |

## 4. Approved-family governance

The family registry is application-owned authority, not database-authored metadata. Each entry must bind:

1. a stable family identifier;
2. a human-facing name/description;
3. an exact payload schema and validator version;
4. exactly one permitted resource kind (`SCHOOL_WIDE` or `ACADEMIC_YEAR`);
5. whether publication is enabled;
6. the downstream architecture authority that defines payload semantics;
7. the typed resolver output contract.

An identifier being known does not make an arbitrary payload publishable. A family is publishable only when its explicit payload contract has been accepted and enabled. Unknown identifiers, unknown payload fields, wrong scalar/unit/enum shapes and wrong resource kinds are rejected. Admins cannot create family definitions, validators, expressions or JSON schemas through the UI.

### 4.1 Initial classification

| Accepted candidate category | Foundation recognition | Detailed authority / enablement |
|---|---|---|
| Operational/go-live start policy | Recognized as an `ACADEMIC_YEAR`-bound family category; no start formula/value shape is invented here | P1-030 closes exact semantics; P1-031 enables/implements the accepted contract using P1-021 |
| Workload/teaching-credit policy for special-program participation | Recognized as an `ACADEMIC_YEAR`-bound category | P4-050 owns exact contribution/reporting semantics and must bind any family contract it requires |
| Workload adjustment rules | Recognized but not enabled | P4-060 remains `DEFERRED_WITH_TRIGGER`; P4-061 implements only if its recorded trigger fires and P4-060 closes |
| Reporting policy affecting calculations | Recognized only where a registered calculation task owns exact semantics | P4-050/P4-060 own the currently registered workload/reporting surfaces; a materially different reporting policy requires a new registered task before family enablement |
| Other business configuration | Not implicitly approved | Must receive traceability and task-register authority before a new registry entry or validator is added |

This classification creates no orphan deferral: all currently accepted candidate semantics map to P1-030/P1-031/P1-032, P4-050 or trigger-gated P4-060/P4-061. “Other” is an admission rule, not a deferred product requirement.

## 5. Resource and effectivity model

### 5.1 Resource kinds

- `SCHOOL_WIDE`: one logical school singleton; it carries no caller-selected resource ID.
- `ACADEMIC_YEAR`: one exact retained `AcademicYear` identity.

The family registry chooses one resource kind. A request cannot substitute another kind. Supporting these two kinds does not imply that every family supports both. Family-specific architecture may further restrict valid dates, but cannot add another resource dimension without registered architecture review.

Capability scope remains `SCHOOL_WIDE`: it answers who may manage the control plane, not which business resource owns a policy. An AcademicYear-bound policy does not require or invent an `ACADEMIC_YEAR` authorization scope.

### 5.2 Civil-date intervals

Policy effectivity is an inclusive civil-date interval:

```text
effectiveFrom <= civilDate <= effectiveUntil
```

when `effectiveUntil` exists. Null end is open-ended. Timestamp fields may record authoring, publication and audit instants, but timestamps do not decide which policy governs a school business date.

The persistence layer must prevent overlapping authoritative intervals for one exact family/resource. It must allow adjacent intervals and deliberate gaps. A resolver never composes multiple families or multiple versions unless a downstream architecture explicitly defines a separate derived calculation; this foundation always resolves one family independently.

## 6. Lifecycle and retained truth

### 6.1 Draft and publication

A draft is non-authoritative. It may be validated and edited only through bounded commands with concurrency control. Publication validates family, payload, resource, effectivity and chain integrity again inside the mutation transaction. Publication gives the version stable immutable identity.

Published semantic fields—family, resource, typed payload and `effectiveFrom`—are immutable. The lifecycle may prospectively close an open end only through an explicit replace/retire command. Such closure must be audit-visible, concurrency-safe and must never alter which version governed an already elapsed civil date.

### 6.2 Prospective change

A legitimate new policy:

- creates a new version;
- starts on an explicit future effective date;
- atomically closes/supersedes the previous open authority as of the preceding civil day when applicable;
- retains both identities and replacement lineage.

The control plane does not expose arbitrary PATCH, unpublish/reactivate or physical delete.

### 6.3 Correction

A correction is for incorrectly recorded truth, not ordinary policy evolution. It requires a mandatory reason and exact target version. The previous assertion remains retained and addressable as reversed/corrected evidence. One or more replacement versions may reconstruct the corrected non-overlapping history with explicit lineage.

Correction of upstream policy does not mutate already frozen or materialized downstream facts. If a downstream fact must also be corrected, that domain uses its own authorized correction workflow and cites both old and corrected provenance.

## 7. Resolver and failure contract

Conceptual contract:

```text
family + exact resource + civilDate
    -> exact immutable policyVersionId + validated typed payload
    | UNKNOWN_POLICY_FAMILY
    | INVALID_POLICY_RESOURCE
    | INVALID_EFFECTIVE_DATE
    | POLICY_NOT_CONFIGURED
    | POLICY_AMBIGUOUS
    | POLICY_CORRUPT
```

For “current” reads, the server supplies its business date. Browser time, locale parsing and client-provided “today” are not authority. Explicit historical reads may accept an ISO civil date only through a typed boundary and must resolve retained history rather than current head.

`POLICY_AMBIGUOUS` and `POLICY_CORRUPT` are integrity incidents, never invitations to choose the newest row. Consumers must propagate/block. Resolver results should be usable inside an existing transaction so a downstream mutation can pin provenance consistently.

## 8. Historical provenance and Reporting Statements

Live non-frozen computations resolve the policy version for their exact business date and resource. If they persist or materialize a fact whose meaning depends on that policy, they retain exact `policyVersionId` plus family/resource/effective-date context where needed for verification.

ADR-041/042/043 remain controlling:

- a Reporting Statement revision freezes canonical snapshot/provenance at submission;
- later policy publication, replacement or correction does not recalculate or rewrite that revision;
- a corrected official result requires the Statement domain's successor/correction lifecycle;
- current live projections may use current authoritative policy, but may not present changed results as the old frozen statement.

Operational-start and workload domains must state their exact retained provenance in P1-030/P1-031 and P4-050/P4-060/P4-061 respectively.

## 9. Authorization and audit boundary

The dedicated management capability is:

`BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE`

ADR-008 applies without exception. The user must be active and hold an explicit valid, non-revoked matching grant. None of these implies access:

- `SYSTEM_ADMIN`;
- PHT/BGH/Hiệu trưởng position or title;
- `ACADEMIC_STRUCTURE_MANAGE`;
- `CAPABILITY_GRANT`;
- access to servers, GitHub, database, environment or deployment tooling;
- ownership of a downstream workload/reporting task.

Conversely, Business Configuration management grants no access to technical configuration or deployment surfaces.

P1-021 must use the existing audit subsystem. Success audit and state mutation are atomic. Denied authorization continues to follow ADR-008 denial auditing, while a failed business mutation must not emit a success audit.

## 10. Absolute technical-configuration exclusion

The Business Configuration domain, resolver, API and UI must never store, reveal, edit, validate as business payload, import or fall back to:

- `DATABASE_URL` or PostgreSQL host, port, database, user or password;
- session/auth secrets, cookie-signing secrets or password material;
- API tokens, Telegram bot tokens, webhook credentials or integration credentials;
- TLS private keys, certificate private material or SSH keys;
- CORS/security-hardening flags;
- API/process ports;
- Nginx executable paths, prefixes, vhosts or configuration;
- Windows Service or Scheduled Task configuration;
- filesystem, release, startup-wrapper, backup or deployment paths;
- backup credentials or security-sensitive backup locations;
- GitHub secrets or environment values;
- VPS topology or foreign-system isolation configuration;
- any other technical credential, secret, host configuration or deployment control.

Those values remain governed by the v1.3 addendum, production environment contract, runbooks, GitHub Environment and P6 decision/deployment gates. `BUSINESS_CONFIGURATION_MANAGE` gives no read access to them. Tests must prove representative technical names and payloads cannot enter or escape through the business control plane.

## 11. `SystemSetting` boundary

The current model is a Phase 00 mutable `key`, string `value`, description and update timestamp. P1-020 neither reinterprets nor modifies it.

Binding rules for P1-021/P1-022:

1. no Business Configuration row is stored in `system_settings`;
2. no Business Configuration resolver reads it;
3. no fallback maps a missing family to a `SystemSetting.key`;
4. no Business Configuration endpoint exposes generic SystemSetting CRUD;
5. no UI presents SystemSetting as business policy;
6. no implicit migration of legacy metadata occurs.

If a future audit identifies a legitimate legacy value needing migration, that work requires a separately registered task with explicit mapping, provenance and cutover authority.

## 12. Required P1-021 implementation gates

P1-021 is not mergeable until its reviewed implementation and tests establish:

1. a separate persistence topology for logical family/resource streams, immutable published versions, lifecycle/effectivity and correction/replacement lineage;
2. exact database-backed prevention of two authoritative versions for one family/resource/date;
3. same-family resource-kind integrity and parent deletion protection;
4. stable code-defined family registry with validator/version binding;
5. unknown/disabled family and unknown payload field rejection;
6. representative technical-config names/payloads rejected from create/import/publication paths;
7. inclusive civil-date, nullable open-end, adjacent interval and deliberate-gap behavior;
8. draft-only semantic editing; no PATCH/delete of published history;
9. prospective replace/retire behavior that does not rewrite elapsed history;
10. correction/reversal that retains original evidence and exact lineage;
11. internal exact historical resolver returning immutable identity plus typed payload/failure;
12. typed `UNKNOWN_POLICY_FAMILY`, `INVALID_POLICY_RESOURCE`, `INVALID_EFFECTIVE_DATE`, `POLICY_NOT_CONFIGURED`, `POLICY_AMBIGUOUS`, `POLICY_CORRUPT`, validation and concurrency conflict results;
13. `BUSINESS_CONFIGURATION_MANAGE` seeded exactly once with `SCHOOL_WIDE` only;
14. explicit grant success and no-grant, `SYSTEM_ADMIN`-only, wrong-capability and malformed-grant denial tests;
15. same-transaction success audit and no success audit on failed mutation;
16. actor/action/family/resource/version/effectivity/replacement/correction audit evidence;
17. transaction-safe/idempotent concurrency proving one publication/replacement winner and no partial history;
18. resolver transaction participation suitable for downstream provenance pinning;
19. no schema/runtime change to `SystemSetting` and no env/secret/deployment integration;
20. no enabled family payload whose semantics have not been accepted by its registered owner task.

P1-021 may choose exact table/column/index names, but may not reopen these semantic decisions. Any database limitation that prevents these invariants requires architecture correction, not a weaker implementation.

## 13. Required P1-022 administration gates

P1-022 starts only after P1-021 is closed. Its workspace must:

1. require `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE` from backend and route boundary;
2. show only approved/enabled family entries;
3. use family-specific typed forms and Vietnamese field help;
4. show resource, exact effectivity, lifecycle, version identity and retained history;
5. expose explicit draft, publish, future change, retire and correction actions;
6. make gaps, validation failures and conflicts visible without inventing defaults;
7. require correction reason and display replacement/correction provenance;
8. never provide a generic arbitrary setting, raw JSON, expression or plugin editor;
9. never read/display/edit env, secrets, TLS, database, ports, process, Nginx, Scheduled Task, filesystem, GitHub Environment or VPS topology;
10. avoid authorization inference from title, role or `SYSTEM_ADMIN`;
11. use server-owned business date/current-state responses rather than browser clock authority.

## 14. Self-review against prohibited failure modes

- No generic key/value or arbitrary JSON dumping ground is accepted.
- `SystemSetting` is explicitly non-authoritative and unchanged.
- No hidden default or env fallback exists.
- Technical/security/deployment configuration is excluded explicitly.
- Published payload/history cannot be overwritten in place or physically deleted.
- Overlapping authoritative policy and silent composition are forbidden.
- Current resolution uses server-owned business date.
- Authorization is dedicated, explicit and default-deny; no title or SYSTEM_ADMIN bypass exists.
- Frozen Reporting Statements cannot drift after policy change.
- No workload, adjustment, reporting or go-live formula is invented here.
- P1-021/P1-022 remain `PLANNED`, not implemented or ready.
- Every accepted downstream semantic is bound to an existing registered task; no orphan deferral is created.

## 15. Governance outcome

On this branch P1-020 is `IN_REVIEW`, T21 records the proposed architecture while remaining truthful that persistence/runtime/UI are absent, and T22 records the architectural exclusion without claiming enforcement not yet implemented. P1-021 remains `PLANNED` and non-startable until merge, authoritative post-merge CI and `SYNC-P1-020`.

P4-010 remains independently `READY` if its own dependencies remain satisfied. P6 remains blocked by P6-005. Production remains pre-operational.
