# PRODUCTION-SECURITY-GATE-001 — Correction-002 report

## Decision and safety

Correction-002 was executed from exact pre-change HEAD
`4eb10851b157b5f83cc22eabe984270f015ca688` on
`ops/production-security-gate`. Remediation ladder **A** achieved the
production security acceptance; B and C were not attempted. No VPS,
production secret, production database, migration, deployment, PR, or merge
was accessed or run.

## Registry evidence

The required npm registry queries returned:

| Package | Published contract |
|---|---|
| `@nestjs/config@3.2.0` | `lodash: 4.17.21`, `dotenv: 16.4.1`, `dotenv-expand: 10.0.0`, `uuid: 9.0.1` |
| `@nestjs/config@3.3.0` | `lodash: 4.17.21`, `dotenv: 16.4.5`, `dotenv-expand: 10.0.0` |
| `lodash@4.18.1` | integrity `sha512-dMInicTPVE8d1e5otfwmmjlxkZoUpiVLwyeTdUsi/Caj/gfzzblBcCEs5RHV/AsjuCmxWrte2TNGSYuCeCq+0Q==` |

The workspace manifest range remains `@nestjs/config: ^3.2.0`; the lockfile
resolves exact `3.3.0`. Because upstream 3.x still declares exact
`lodash@4.17.21`, the root override is necessary. No `@nestjs/config` 4.x
upgrade and no direct lodash application dependency were introduced.

## Remediation ladder

**A — used and accepted.** Added the root override:

```json
"lodash": "4.18.1"
```

Then ran npm 10 targeted `npm update lodash --package-lock-only --ignore-scripts`.
The generated lock diff changes only the lodash package entry from `4.17.21`
to `4.18.1` with the registry integrity above. No unrelated production
version drift occurred. B (direct API security anchor) and C (latest 3.x
config upgrade) were not needed.

## Production resolution and drift

After clean `npm ci --ignore-scripts`:

```text
baogiang-damsan@0.0.1
└── @baogiang/api@0.0.1
    └── @nestjs/config@3.3.0
        └── lodash@4.18.1 overridden
```

`npm ls --omit=dev` is valid with no invalid or extraneous production
packages. The normalized production map contains 281 package paths before and
after. Version drift is exactly one package: `lodash 4.17.21 → 4.18.1`.
Multer remains the previously accepted `2.2.0`; all other production package
versions are unchanged. No package was added or removed from the production
map.

## Audit counts

The pre-change production evidence from Correction-001 was
`0 info / 0 low / 12 moderate / 1 high / 0 critical` (13 total), with
`lodash@4.17.21` as the sole high. After ladder A:

| Command | Result |
|---|---|
| `npm audit --omit=dev --json` | `0 info / 0 low / 12 moderate / 0 high / 0 critical` (12 total) |
| `npm audit --omit=dev --audit-level=high` | exit `0` |
| Full `npm audit --json` | `0 info / 3 low / 33 moderate / 52 high / 1 critical` (89 total), exit `1`; residual findings are dev/test/build-only |

No advisory was suppressed and `npm audit fix --force` was not used. The
existing CI step remains fail-closed:
`npm audit --omit=dev --audit-level=high` immediately after `npm ci`.

## Runtime and quality gates

| Gate | Result |
|---|---|
| Clean `npm ci --ignore-scripts` | PASS using a temporary writable npm cache; default Windows cache had EPERM |
| `npm ls lodash --omit=dev --all` | PASS; only production lodash is `4.18.1` |
| `npm ls --omit=dev` | PASS |
| Production audit JSON and audit-level-high | PASS; high/critical are zero and exit is 0 |
| Runtime smoke (`lodash` primitives + `@nestjs/config` load) | PASS |
| Prisma generate | PASS |
| Prisma validate | BLOCKED: local `DATABASE_URL` unavailable; no database touched |
| Schema static / secret scan / UI static | PASS |
| Deployment static / behavior / workflow / PowerShell / Windows fixtures | PASS |
| Lint / typecheck | PASS |
| API unit (64 tests) / web unit (35 tests) | PASS |
| API integration (24 tests) | PASS |
| Contracts/config/API/web builds | PASS |
| Migration foundation | BLOCKED by local Windows Bash `E_ACCESSDENIED`; no migration ran |
| Playwright E2E | BLOCKED: local API `127.0.0.1:3100` and web `127.0.0.1:5173` were not running |
| `git diff --check` / staged inspection / staged secret scan | Required before commit |

The environment blockers do not affect the production audit acceptance. Full
audit residual dev-only debt remains documented and is not called a full
security PASS.

## Safety confirmation

No VPS, production secrets/database/migration/deploy, Nginx/service mutation,
PR, or merge was performed. No reset, clean, stash, rebase, amend, squash, or
force-push was performed. `.codex/config.toml` was not read, modified, deleted,
staged, or committed; it remains the sole untracked file.
