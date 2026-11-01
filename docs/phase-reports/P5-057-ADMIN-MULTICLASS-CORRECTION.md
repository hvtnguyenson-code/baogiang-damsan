# P5-057 / T56 ? Admin operability: multi-class teaching assignments

Status: IN_PROGRESS; task branch feat/p5-057-admin-bulk-teaching-assignments. Product Owner approved scope 2026-11-01, issue #262. Not a P5-057 closure or production release.

## Failure evidence
Original Web create form used one schoolClassId, one subject, one teacher per command. Admin had to repeat each class/subject/time assignment individually. CapabilitiesPage exposed low-level grants, while responsibility templates already existed in UsersPage.

## Changes
- Select multiple active classes by checkbox; review teacher, subject and class set before save; explicit user confirmation.
- POST /academic-years/:id/teaching-assignments/bulk/preview performs read-only conflict/eligibility checks; no write or grant is performed during preview.
- POST /academic-years/:id/teaching-assignments/bulk uses existing per-class candidate policy, calendar bounds, SERIALIZABLE transaction, guarded school-wide SUBJECT_MANAGE, audited per-created assignment, and transaction retry. Any failed class rejects the entire command.
- Existing single-assignment API and historical END/change-teacher semantics retained; no schema migration.
- Advanced rights administration guides admins toward existing approved responsibility templates; class selection does not grant capabilities.
- DTO rejects empty, repeated, forged and over-limit class lists.

## Outstanding
Full live PostgreSQL rollback/race and authentic admin-device E2E are not yet demonstrated; exact-head PR CI and independent GitHub review pending. The broader P5-057 seven-role and Android acceptance remain open; P6-050 is blocked.

## Pre-PR local gates
- API and Web TypeScript typecheck: PASS.
- API and Web ESLint: PASS.
- Web teaching-assignment component regression: 10/10 PASS (including two-class payload and blocked conflict preview).
- API bulk DTO validation: 4/4 PASS (empty, duplicate, forged and over-limit list).
- git diff --check: PASS.
- Live PostgreSQL atomic rollback/concurrency and actual admin UAT: NOT YET PROVEN; exact-head CI required.
