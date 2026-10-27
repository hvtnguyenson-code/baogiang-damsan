# P5-055 — Data Readiness & Import Center

**Status:** CLOSED by `SYNC-P5-055` (bounded technical scope; real-persona UAT under P5-057)
**Depends on:** P5-052, P5-053, P2-020, P3-020, P4-074  
**Traceability:** T54

## Objective

Give BGH/Admin one coherent place to understand whether the school-year data needed for operation is ready and to enter the existing import workflows.

## Mandatory domains

The center must cover, at minimum:

- TKB;
- PPCT;
- historical teaching evidence where delayed go-live applies;
- GDĐP;
- HĐTN-HN.

It may expose other already-authoritative datasets when useful, but must not fabricate a new source of truth.

## Required behavior

For each domain show:

- current readiness/state;
- latest relevant retained version/import;
- blocking findings if any;
- the exact safe next action;
- link into the authoritative existing workflow.

The center is an orchestration/readiness surface. Parsing, validation, preview, confirm, CAS/idempotency and persistence remain owned by the existing domain services.

## Unified import interaction contract

Where a domain supports file ingestion, the product should follow a recognizable sequence:

1. Chọn tệp;
2. Kiểm tra cấu trúc;
3. Xử lý giá trị chưa nhận diện where applicable;
4. Xem trước/đối chiếu;
5. Xác nhận;
6. Kích hoạt/publish only when that domain has a separate explicit lifecycle.

Not every domain must implement all six steps; the UI must not invent lifecycle actions absent from backend authority.

## Acceptance evidence

A PHT/Admin can determine from one workspace what is missing before school operation and navigate into TKB, PPCT, history, GDĐP and HĐTN-HN without knowing internal route paths.

## PR #248 READY correction — 2026-10-23

Correction remains on `feat/p5-055-data-readiness-import-center`, from HEAD `5d00da1e2cebd8e99dab46d3278fd61bca12de52`; audited canonical main is `d13e1f98b063c9ee902ed8940372a2bbac224a55`. Dependencies P5-052, P5-053, P2-020, P3-020 and P4-074 are CLOSED; traceability T54 remains unchanged.

Readiness must fail closed when required evidence is absent. The center reuses the effective OPERATIONAL_START policy resolver and retained models. PPCT coverage follows actual year/subject/grade teaching assignments and exact retained bindings, rather than a catalog-subject count or an assumed CORE default. Every GDĐP/HĐTN-HN master must have a published plan; missing or superseded-only versions cannot produce READY.

TKB activation alone is not date-bounded readiness. The center reports NOT_ASSESSED and directs users to the existing timetable readiness evaluator. Historical import receipts alone require reconciliation in the existing history workspace. These are explicit current response semantics within P5-055, not a new readiness ledger or an unregistered implementation deferral. Valid day-one history, fully issued programme plans and PPCT with proven coverage retain READY. An explicit unknown year returns HTTP 404; default year selection applies only when the ID is omitted.

Evidence and remaining PostgreSQL verification/Git write blockers: [READY correction report](../phase-reports/P5-055-READY-CORRECTION-REPORT.md). No schema/migration, auth, CI/CD, production, parser or ledger change is authorized by this correction.

## Closure: SYNC-P5-055 (27/10/2026)

The 23/10/2026 correction status above is a **historical checkpoint**, not the current state. Its actual fail-closed correction `006d1e23a06e0a5764bc7087f6e13aa4465ce3e7` was committed, tested and merged in PR #248 final head `a5efc02735cdf9101ad14e007c448493bac75bc8`, merge SHA `6f1e83a8f021db1ab23f9902981a6b32f36d65ab`. PR CI #824 and P6-021 off-host compatibility #71, authoritative post-merge main CI #825, auto-deploy #23 and Deploy VPS #20 all SUCCESS. Exact deploy SHA verification appears in Deploy VPS #20. Retrospective independent ChatGPT technical GitHub review posted as PR #248 COMMENT `5661587622` (not formal third-party `APPROVED`).

Readiness continues to **fail closed**: ACTIVE timetable is not enough for date-bounded readiness, so TKB remains `NOT_ASSESSED` without authoritative evaluator; imported historical receipts do not prove historical fulfillment; PPCT requires actual assignment subject–grade and valid retained associations; missing/superseded programme plans are not READY. This is **not** universal school readiness acceptance. Persona/Android and live workflow verification remain in P5-057/T56, before teacher pilot P6-050. No new parser, ledger or schema/migration was introduced. Parent PR did modify CI job timeout from 20 to 35 minutes, solely to accommodate Playwright installation; no production deploy workflow change. Complete closure evidence: [SYNC-P5-055](../phase-reports/SYNC-P5-055-CLOSURE.md).
