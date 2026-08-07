# PRODUCTION-SECURITY-GATE-001 — audit report

## Scope and decision

The audit was performed on branch `ops/production-security-gate` at base
`008b723d5bfd622437fb2baed40998762f9fa4a4`. No VPS, production secret,
production database, migration, deployment, PR, or merge was accessed or run.
The production release decision remains **BLOCKED**: the runtime dependency
`lodash@4.17.21` is still a high-severity finding with no safe npm fix.

The CI gate is intentionally fail-closed. It will fail while this production
finding exists; no advisory was suppressed and `npm audit fix --force` was not
used.

## Audit counts before and after remediation

Counts are from the required JSON audits. The pre-change run was captured
before the Multer pin; the post-change run was repeated after a clean lockfile
install.

| Audit | Before | After | Gate result |
|---|---:|---:|---|
| `npm audit --json` | 0 info / 2 low / 37 moderate / 46 high / 1 critical (86 total) | 0 info / 2 low / 38 moderate / 44 high / 1 critical (85 total) | Residual dev/test/build debt; not full-security PASS |
| `npm audit --omit=dev --json` | 0 info / 0 low / 11 moderate / 3 high / 0 critical (14 total) | 0 info / 0 low / 12 moderate / 1 high / 0 critical (13 total) | One production high remains |
| `npm audit --omit=dev --audit-level=high` | FAIL (3 production high) | FAIL (1 production high: `lodash`) | **BLOCKED** by contract |

The post-change production tree was also checked with `npm ls --omit=dev`;
the lockfile resolves without invalid or extraneous production packages.

## Critical/high dependency chains and disposition

`T` means npm reported `fixAvailable: true`; `F` means npm reported
`fixAvailable: false`. Packages grouped in a row share the root chain shown;
their installed versions and individual npm fix dispositions are listed so no
critical/high finding is hidden by aggregation.

| Findings | Installed version(s) and npm fix | Root chain / reachability | Advisory evidence and disposition |
|---|---|---|---|
| `lodash` **high** | `4.17.21` (F) | `apps/api` → runtime `@nestjs/config@3.3.0` → `lodash`; separate CLI/E2E chains are dev-only | npm sources 1115806 (GHSA-r5fr-rjxr-66jc), 1115810, 1120370. No safe fix is available; no major framework/toolchain upgrade was attempted. **Production blocker.** |
| `multer` **high before remediation** | `2.0.2` (pre-change) → `2.2.0` (post-change) | `apps/api` → `@nestjs/platform-express@10.4.22` → `multer`; runtime reachable | The pre-change audit reported the Multer high advisory set. The supported non-major pin `2.2.0` is enforced by the API dependency and npm `overrides`; the post-change production audit contains no Multer high. |
| `vitest` **critical** | `1.6.1` (F) | `apps/web` devDependency → `vitest` → `vite-node`/`vite`; excluded by `--omit=dev` and not shipped in the API/static artifact | npm source 1120126 (GHSA-5xrq-8626-4rwp), arbitrary file read/execute when the Vitest UI server is exposed. Dev-only residual debt; no production reachability. |
| `@eslint-community/eslint-utils`, `@eslint/eslintrc`, `@humanwhocodes/config-array` **high** | `4.10.1` (T), `2.1.4` (T), `0.13.0` (T) | workspace lint tooling → `eslint`/`minimatch`/`js-yaml`; dev-only | Propagated npm findings via the listed packages. No production reachability; broad major lint upgrades were out of scope. |
| `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `@typescript-eslint/type-utils`, `@typescript-eslint/utils` **high** | `7.18.0` (F), `7.18.0` (F), `7.18.0` (T), `7.18.0` (T) | API/web/config/contracts devDependencies → TypeScript ESLint → `eslint`; dev-only | Propagated ESLint advisory chains. Retained because lint/typecheck gates pass and no safe non-major remediation was required for production. |
| `eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` **high** | `8.57.1` (F), `7.37.5` (F), `4.6.2` (F), `0.4.26` (F) | web/API/config/contracts devDependencies → ESLint plugins → `minimatch`/`js-yaml`; dev-only | Propagated npm findings; not included in the production dependency set. |
| `@istanbuljs/load-nyc-config`, `babel-plugin-istanbul`, `file-entry-cache`, `flat-cache`, `fork-ts-checker-webpack-plugin`, `cosmiconfig`, `@nestjs/cli` **high** | `1.1.0` (F), `6.1.1` (F), `6.0.1` (T), `3.2.0` (T), `9.0.2` (T), `8.3.6` (T), `10.4.9` (F) | API dev toolchain → Jest/coverage/Nest CLI/webpack helpers → `js-yaml`, `glob`, `minimatch`; dev/build-only | Propagated npm findings; excluded from production install. No broad toolchain major upgrade was introduced. |
| `@jest/core`, `@jest/expect`, `@jest/globals`, `@jest/reporters`, `@jest/transform`, `babel-jest`, `create-jest`, `jest`, `jest-circus`, `jest-cli`, `jest-config`, `jest-resolve-dependencies`, `jest-runner`, `jest-runtime`, `jest-snapshot`, `ts-jest` **high** | `29.7.0` (F), `29.7.0` (T), `29.7.0` (T), `29.7.0` (T), `29.7.0` (T), `29.7.0` (F), `29.7.0` (T), `29.7.0` (F), `29.7.0` (T), `29.7.0` (T), `29.7.0` (F), `29.7.0` (T), `29.7.0` (T), `29.7.0` (F), `29.7.0` (T), `29.4.12` (F) | API devDependencies → Jest/ts-jest → `glob`, `babel-plugin-istanbul`, `minimatch`; dev/test-only | Propagated npm findings. API unit and integration suites pass; the packages are excluded from production runtime. |
| `brace-expansion`, `glob`, `minimatch`, `rimraf`, `test-exclude`, `tmp` **high** | `1.1.16`/`2.1.2` (F), `7.2.3`/`10.4.5` (F), `3.1.5`/`9.0.9` (F), `3.0.2` (T), `6.0.0` (T), `0.0.33` (T) | Nested lint/Jest/coverage/Nest CLI trees; all dev/test/build-only | Direct npm sources include 1130588/1130589/1130736/1130737 (brace expansion), 1109842 (glob command injection), and 1109537/1120654 (`tmp`). No production reachability. |
| `js-yaml` **high** | `3.15.0` nested / `4.3.0` root (F) | Jest/coverage/Nest CLI dev tooling → `js-yaml`; dev/build-only | npm sources 1138114/1138115 (CVE-2026-59870). No production reachability; no force upgrade. |
| `picomatch`, `vite` **high** | `4.0.1` (F), `5.4.21` (F) | `apps/web` devDependency → Vitest/Vite; Vite is used only to build static frontend assets | npm sources 1115551/1115554 (picomatch) and 1116229/1120784/1123525 (Vite). The dev server is not a production service. |

The audit tree proves the runtime/dev split: after the Multer remediation,
`--omit=dev` reports only `lodash` at high severity; all other high/critical
rows above disappear from the production set. Residual full-audit debt is
documented rather than called a full-security PASS.

## Remediation and CI gate

- `apps/api/package.json` now owns `multer` at `^2.2.0`.
- Root `package.json` pins the transitive runtime resolution with `overrides`;
  `package-lock.json` was regenerated by npm, not hand-edited.
- `.github/workflows/ci.yml` now runs immediately after the Linux `npm ci`:
  `npm audit --omit=dev --audit-level=high`. The step has no
  `continue-on-error`, output suppression, advisory ignore, secret, or service
  access, so CI fails closed while `lodash` remains.
- `npm audit fix --force` was not used. The only dependency version change
  needed for the production audit reduction was the non-major Multer pin
  (`2.0.2` → `2.2.0`).

## Quality gates

| Gate | Result |
|---|---|
| Clean `npm ci --ignore-scripts` from lockfile | PASS using a temporary writable npm cache; default cache was blocked by Windows `EPERM` |
| `npm ls --omit=dev` | PASS |
| Production audit gate | BLOCKED/FAIL as required: one high `lodash`; no suppress/force |
| Full JSON audit | PASS as evidence collection (exit 1 is expected with residual advisories); counts recorded above |
| Prisma generate | PASS |
| Prisma validate | BLOCKED: local `DATABASE_URL` is unavailable; no database was touched |
| Schema static / repository secret scan / UI static | PASS |
| Deployment static / behavioral / workflow / PowerShell / Windows fixtures | PASS |
| Lint / typecheck | PASS |
| API + web unit tests | PASS (64 API, 35 web) |
| API integration tests | PASS (24 tests; isolated test harness) |
| Builds (contracts, config, API, web) | PASS |
| Migration foundation script | BLOCKED by local Windows Bash/Service `E_ACCESSDENIED`; no migration ran |
| Playwright E2E | BLOCKED/NOT_RUN to production: local API `127.0.0.1:3100` and web `127.0.0.1:5173` were not running |
| `git diff --check` / staged-file inspection / staged secret scan | PASS |

Authoritative hosted CI state is pending the pushed commit. A green CI run is
required before any separately authorized production decision; this task does
not authorize deployment.

## Safety confirmation

No VPS or inventory was accessed. No production secret, production database,
Prisma migration, deployment, PR, merge, reset, clean, stash, rebase, amend,
squash, or force-push was performed. `.codex/config.toml` was not read,
modified, staged, committed, or deleted; it remains the sole untracked local
file.
