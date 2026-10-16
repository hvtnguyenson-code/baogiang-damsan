# P5-054 — Teaching Operations Workspace Closure

**Status:** PLANNED  
**Depends on:** P5-050, P2-050, P3-031  
**Traceability:** T53

## Objective

Make real daily teaching-operation workflows reachable and understandable from the product UI instead of leaving operational-overlay authority primarily in backend modules.

## Required scope

1. Local calendar exceptions:
   - date/session/slot/scope selection through authoritative options;
   - affected-occurrence preview;
   - explicit consequence that cancelled/suppressed teaching does not fabricate debt.
2. Teacher absence / substitution / supervision:
   - choose the authoritative scheduled occurrence;
   - same-subject vs supervision semantics visible before confirm;
   - candidate teachers derived from existing authority/collision checks;
   - consequences to PPCT, workload and debt shown before commit.
3. Make-up:
   - reuse P3-031 public make-up scheduling authority;
   - show original obligation and candidate slot;
   - no new PPCT consumption;
   - correction/reversal through existing retained lifecycle.
4. Operational history:
   - retained events and status;
   - no in-place rewrite of historical truth.

## UX rule

The user selects human-readable teacher/class/subject/date/period options. Raw UUIDs, internal enum names and transaction identifiers must not be required input.

## Acceptance evidence

At least one E2E flow for:
- school cancellation/local exception;
- same-subject substitution;
- different-subject supervision where supported;
- make-up scheduling;
- reversal/correction path;
- authorization denial and collision blocker.
