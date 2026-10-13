# P6-020D — Approved-scope design for first Nginx include bootstrap

**Status:** READ-ONLY DESIGN. This document is not an instruction to run commands on the VPS; no production mutation has been approved.
**Starting source:** 2026-10-13 VPS observations in P6-020D-VPS-ACTUAL-INGRESS-INVENTORY-20261013.md.
**Existing canonical tools:** deployment-common.ps1 (Get-NginxEffectiveGraph / Get-NginxRuntimeBinding), production-http01-plan.ps1 / production-http01-verify.ps1, production-nginx-plan.ps1 / production-nginx-verify.ps1, p6-010-http01-tls-common.ps1, production-tls-renewal-hook.ps1 and existing Windows deployment fixtures.

## The exact missing capability

Current P6-010 code assumes active Nginx HTTP scope already loads the managed file. On this server the 1,434-byte on-disk nginx.conf contains only a MIME include; the managed include path is absent. On a future approved change, simply writing a server file and invoking normal plan/verify will fail closed.

Additionally, the running nginx task/process lacks absolute -p/-c; the candidate config cannot be declared effective even when it parses. A new tool must not silently repair/ignore this mismatch.

## Minimum separately reviewed first-include plan contract

A dedicated first-include planner and verifier is a **pre-activation** tool and must be separate from P6-010's already closed post-activation contract.

Inputs for the future implementation:
- Reviewed absolute NginxExe, NginxPrefix, NginxConfig, dedicated application root, exact planned ManagedHttp01Config and later ManagedTlsConfig.
- Expected original Nginx main bytes SHA-256 (the observed candidate was BAB93A9F54022907B8EBA5A85E118FD8C8A1A1295335EA32D5603A8685CAB635, NOT an automatically applicable future precondition).
- Exact reviewed immutable source commit for the P6-010 canonical HTTP-01 generator; authoritative existing report directory outside Nginx/App/foreign roots.
- Explicitly approved and independently proven runtime prefix/config binding; an absent binding is NOT_VERIFIED, not a default.

Outputs:
- Explicit PRECONDITION_NOT_PROVEN / CONFLICT / READY_FOR_SEPARATE_MANUAL_APPROVAL state. Never a claim that a new include is already active.
- SHA-256, byte length, CRLF vs LF and BOM expectations for original main file and proposed desired main; exact canonical generated managed HTTP-01 file bytes/hash.
- The exact insertion point **inside http context**, not within existing Nội trú server nodes; preserve existing bytes and all original server-block semantics.
- Guarded directory path, non-reparse ancestor checks, broad-access ACL review, zero domain collisions, neighbor and SSL evidence.
- Explicit source/object filenames and cryptographic hashes for rollback; exact manual test/reload and expected exit statuses (not executed by planner).
- Immutable reviewed main original hash and approved change ID so the installer cannot apply a stale plan.

Critical implementation tests required:
1. Ordinary candidate main file with existing two Nội trú server blocks, no include => planner creates exactly one proposed http-scoped boundary, no production writes.
2. Already active exact include => no second include; existing canonical P6-010 normal route applies.
3. Reparse point, malformed main AST, multiple http blocks, unexpected main hash, dynamic includes, domain collision => fail closed.
4. CRLF+BOM rules preserve original content except reviewed insertion and survive re-parse.
5. Missing managed directory, zero-file wildcard and planned exact managed file => no false ACTIVE status. Stage a complete fixture to test the *combined* desired main and desired HTTP-01 bytes.
6. Verify mandatory rollback exact original hash, neighbor evidence and no mutation/reload.
7. Simulate the actual Nginx absolute prefix, including how relative include paths resolve, on an isolated Windows fixture; no logic that derives runtime provenance from workingDirectory.
8. Protect old SSL/private keys, existing win-acme tasks, port 3000, PostgreSQL 5432/5433; no new public ports.

Do not solve this by changing P6-010 Get-NginxEffectiveGraph's fail-closed semantics, broadly rewriting nginx.conf or appending a new server block directly to the protected neighbor's server block.

## Stage gates and exact operator boundary

**A — repository only:** independent code review and fixture/CI verification of new first-include tool (separate task); no host changes.

**B — dedicated Báo giảng bootstrap:** exact OS principal SIDs, ACLs, Node22 version, private PostgreSQL17, startup marker, win-acme assets. Each host mutation requires a user-approved bounded change request.

**C — protected shared ingress window:** runtime authority proven; actual main-config bytes still match the approved snapshot; permitted exact main-file include insertion plus one canonical managed HTTP01 file in a reviewed transaction; syntax check and limited shared Nginx reload only after separate explicit authorization, while Nội trú health/TLS is checked before and after.

**D — DNS/ACME/443:** authoritative Mắt Bão A-only record change, external HTTP01 challenge verification, separate first issuance without reload, canonical HTTPS managed include, Nginx verification/approved manual reload, scheduled own win-acme renewal with accepted shared-Nginx reload risk.

**E — P6-030:** exact deployed app/DB/health/rollback readiness, separate user approval. Remains NO-GO now.

## Decision summary

- VPS passive inventory has identified the first-include architectural gap and relevant protected neighbors.
- The present repository cannot truthfully claim readiness to apply P6-010 on this current Nginx topology without a separate first-include bridge.
- New production operations remain blocked pending independently reviewed bootstrap tool, exact active Nginx binding and explicit user approvals.
