# P5-057 / WS1-B ? Ki?m tra li?n k?t ngu?n quy?n B1 v?i ch?ng c? server (12/11/2026)

**Task:** P5-057 / T56, WS1-B1, sau PR #280. **N?n:** `main@552f4b9b3ef0ebedd1aafccab17aeb20467de957`. **Ph?m vi:** READ ONLY / ADVISORY_ONLY. **Tr?ng th?i:** tri?n khai tr?n nh?nh ri?ng, ch? PR CI/review; P5-057 v?n IN_PROGRESS, P6-050 v?n BLOCKED.

## Ph?m vi

- M? r?ng duy nh?t `B1RepositoryInspector.inspect(grantId)` ?? truy v?n ngu?n B1 **do server x?c ??nh**, qua `grant_sources` li?n k?t `access_commands`, `role_appointments`, `authority_seats` trong c?ng transaction PostgreSQL `REPEATABLE READ` / `SET TRANSACTION READ ONLY`.
- R?ng bu?c h?nh d?ng ngu?n theo 5 lo?i trong migration B1. `LEGACY_UNCLASSIFIED`/ngu?n kh?ng thu?c danh m?c l? `UNVERIFIED`; kh?ng t? g?n ngu?n cho grant c?. Ki?m tra ngu?n g?n ??ng user/coordinate, command c? actor/target ??ng ??i t??ng, kh?ng t? c?p quy?n th??ng, appointment ??ng user v? c? seat ?ang b?t, th?ng tin revision/slice/support v?n c?.
- Ki?m tra `supersedesSourceId` thu?c t?p ngu?n c?ng coordinate v? kh?ng t?o v?ng l?p. Kh?ng tin l?ch s? ho?c c? ch?ng minh do client g?i.
- M?i k?t qu?, k? c? `SUPPORT_CANDIDATE`, v?n `canConfirm=false`, `provenanceVerified=false`; kh?ng ph?i ch?ng nh?n quy?n b? nhi?m hay c?n c? cho writer.

## Ki?m ch?ng tr??c khi m? PR

- Jest m?c ti?u (isolated transformer, kh?ng s?a config d? ?n): **16/16 PASS**; c? negative case v? ngu?n l?/legacy, thi?u ho?c v? hi?u seat, command t? c?p/sai target, lineage thi?u/t? tham chi?u/v?ng, v? kh?ng ghi v?o DB.
- TypeScript scoped cho hai t?p: **PASS**.
- ESLint v?i parser/rules kh?ng d?ng type information: **PASS**. **ESLint chu?n c? type-aware rules ch?a ???c ch?ng minh c?c b?**, v? ti?n tr?nh v??t gi?i h?n b? nh? c?a MCP laptop; ph?i ch? CI exact-head ki?m tra chu?n.
- PostgreSQL **17.10 th?t**, c?m c? l?p tr?n laptop c?ng loopback `127.0.0.1:55491`, l??c ?? nh? m? ph?ng c?c b?ng B1 li?n quan (kh?ng ph?i ch?y ?? migration chain): g?i `B1RepositoryInspector` b?ng PrismaClient th?t ? hai ngu?n `SUPPORT_CANDIDATE`, `supportingSourceCount=2`; v? hi?u seat v? l?m sai target c?a command ? `UNVERIFIED`; PostgreSQL t? ch?i UPDATE trong transaction `READ ONLY`. **PASS; server th? nghi?m ?? d?ng.** Kh?ng k?t n?i VPS hay DB production.

## Nh?ng gate CH?A ho?n t?t

1. ??y ch? l? **ki?m tra t?nh nh?t qu?n h?nh d?ng d? li?u**. Ch?a x?c nh?n ngu?n th?c s? ???c ph?p c?p capability theo issuer/authority seat/scope, ch?a ph? duy?t ma tr?n 9 capability nh?y c?m, ch?a ch?ng minh l?ch s? authority theo th?i gian hay ?? m?i provenance legacy.
2. Ch?a k?ch ho?t source-aware writer, command b? nhi?m/mi?n nhi?m, evaluator m?i, `canConfirm`, x? l? CAS/idempotency hay UI; kh?ng thay schema/migration/CI/CD/deploy.
3. C?n CI chu?n tr?n GitHub (lint, typecheck, unit/integration, Playwright v? compatibility PostgreSQL 16), review ??c l?p, ?i?u ki?n merge ri?ng; **kh?ng merge n?u ch?a c? ch? th? c?a ch? d? ?n**.
4. Tr??c writer th?c ph?i x?c minh h?nh vi D2/D3 b?ng actor-seat policy, ?nh ch?p d? li?u nh?t qu?n, ngu?n ??c l?p v? rollback; `P5-057` / 7-persona UAT v?n m?.

**Quy t?c ph?t h?nh:** m?t nh?nh ? m?t commit ? m?t PR; kh?ng ??ng VPS/N?i tr?, kh?ng l?m DB production migration/backfill, kh?ng t?o tuy?n deploy m?i.
