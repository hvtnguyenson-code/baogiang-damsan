# ADR-025 — Timetable Import Request Idempotency Bindings

- **Status:** Accepted
- **Date:** 2026-08-12
- **Scope:** LOCAL-FC-04B3C3A durable request-key persistence foundation
- **Refines:** ADR-022 request-key storage only

## Context

ADR-021 requires three distinct confirmation outcomes:

1. the same request key and deterministic fingerprint replay the original result;
2. the same request key with a materially different fingerprint returns conflict;
3. a different request key with the same semantic duplicate identity replays the existing committed import.

ADR-022 stores one optional request-key/fingerprint pair directly on each committed receipt. That pair is sufficient as original-creation provenance, but it cannot remember an additional key first accepted through semantic replay. Without durable binding, that additional key could later be reused with different material and the system could not reliably enforce the required conflict.

Audit-event JSON and application-only lookup are unsuitable authoritative registries: neither provides the required globally unique concurrency boundary.

## Decision

`TimetableImportRequestKey` / `timetable_import_request_keys` is the authoritative namespace of consumed timetable-import confirmation keys.

Each retained row contains:

- a UUID primary key;
- a required receipt UUID with `ON DELETE RESTRICT`;
- a globally unique, trimmed, nonblank request key bounded to 200 characters;
- a trimmed, nonblank request fingerprint bounded to 128 characters;
- a `TIMESTAMPTZ(3)` binding instant.

One receipt may have zero, one, or many bindings. One request key belongs to exactly one receipt. Fingerprints are intentionally not globally unique. A receipt-ID index supports replay history and lookup.

The existing `TimetableImportReceipt.requestIdempotencyKey` and `requestFingerprint` fields remain immutable provenance for the original creation request. They are neither removed nor repurposed. Every accepted non-null key must eventually have an authoritative binding:

- C3B will write an original creation key/fingerprint to both the receipt provenance fields and a request-key binding;
- semantic replay under a different key will add only a binding to the original receipt;
- a consumed key can never later identify a materially different fingerprint.

The forward migration backfills every existing non-null receipt key/fingerprint pair, preserving the receipt commit instant as `boundAt`. Global destination uniqueness makes conflicting historical keys fail migration rather than silently choosing a receipt.

No raw workbook bytes, workbook JSON, source cell values, formulas, URLs, or filesystem paths are stored. Raw workbook retention remains unchanged.

## Consequences

C3B can implement serializable confirmation and replay against a durable one-to-many key namespace without weakening semantic duplicate behavior. Receipt provenance remains historically meaningful while replay keys gain durable conflict protection.

This ADR refines only ADR-022's request-key-storage decision. The remainder of ADR-022 stays Accepted.

## Non-scope

This decision does not implement confirmation endpoints, fingerprint serialization, semantic replay services, checksums, timetable version/entry creation, imported-DRAFT locks, parsing, preview, profile/alias APIs, frontend, E2E, workflow, deployment, VPS access, or production migration. Those confirmation behaviors belong to C3B.
