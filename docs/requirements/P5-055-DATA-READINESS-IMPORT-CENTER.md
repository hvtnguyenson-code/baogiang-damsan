# P5-055 — Data Readiness & Import Center

**Status:** PLANNED  
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
