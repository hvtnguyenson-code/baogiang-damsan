# CD-RECONCILE — controlled deployment protocol and frontend integrity

**Status: PREPARED / PRODUCTION CUTOVER NOT AUTHORIZED.** Source baseline: `499e09b5a54093905c5641f90d2b617b2683194f`.

## Verified root causes
1. Deploy #7: SSH disconnected with `Broken pipe` and exit 255 while the independent worker continued and later deployed the exact SHA successfully. The GitHub step was a long-lived attached SSH session.
2. Nginx 443 for `baogiang.dtnt-damsan.edu.vn` serves `C:/baogiang/releases/b9d0d68.../apps/web/dist`, unrelated to the current API release pointer. API and web do not share an atomic release authority. HTTP 200 cannot prove frontend version identity.
3. Worker status historically appears only when terminal; there is no durable RUNNING acknowledgement or resumable correlation protocol.

## Desired architecture and gates
- The GitHub job validates exact `main` SHA, completed CI, pinned SSH host key, isolated production secrets, and code-only/no-migration policy.
- Enqueue: short-lived SSH call; UUID nonce generated server-side; lock + refuse conflicting active worker; idempotently resume a matching inflight SHA. No long-running work remains attached to SSH.
- Worker: validate request, publish RUNNING durably, build and switch independently, preserve rollback and neighbor process protection, publish terminal success/failure with the exact nonce/SHA.
- Poll: short independent SSH calls using the returned nonce and SHA; retry ONLY transport failures; reject stale/mismatched evidence, worker failure, or timeout. Green only after a durable worker success.
- Shared Nginx: **one-time** reviewed adjustment of the Báo giảng 443 `root` to `C:/baogiang/current/apps/web/dist`. Do not modify other server blocks or reload during ordinary deployments. Preserve a byte-exact backup and neighbor hashes; `nginx -t` before/after; independently confirm the active runtime binding, hostnames, and neighbor HTTP 200. Reload needs a separate approved change window, not a code-only CD action.
- Release health: verify API live/ready, public site and exact HTML/hashed JS asset contents against the `current` release. Verify on success AND rollback. Fail closed when content does not match.
- PWA: old service workers may retain old content until app update; origin verification bypasses client SW and is not proof every browser immediately refreshes. Treat client update testing separately.

## Rollout sequence (do not reorder)
1. Review all code and Windows fixtures on one branch; require full CI. **Do not merge** because merging triggers auto deploy.
2. Snapshot/verify the installed control plane in `C:\ProgramData\BaoGiangDeploy`, compare hashes and ACL, and validate the candidate in a separate fixture. Perform a reviewed, reversible update of ONLY the dedicated Báo giảng request/worker scripts using exact Git blob hashes. Never edit production application code in place.
3. Obtain authorization for the **shared Nginx one-time change window**. Verify effective config authority, full config backup, neighbor block exact bytes/hashes, canonical `current` target and nginx access; apply only the Báo giảng 443 root substitution and `nginx -t`, then controlled reload; check both hostnames and unchanged Nội trú PID. If any test fails, restore full backup and reload back; stop.
4. Manually validate the frontend origin hash against the current release and the new short enqueue/poll script outputs without requesting a deploy of new code.
5. Merge reviewed PR: normal main CI + auto CD performs one code-only release. Verify successful GitHub job **and** matching worker nonce/SHA/report/current/API/front-end asset, rollback=notNeeded, unchanged Nội trú process ID and health.
6. Inject controlled off-host failures: SSH disconnect during build, matching retry, wrong nonce, stale SHA, busy different SHA, worker failure, missing status, old web root, mismatched HTML/asset, rollback match. Never perform fault injection on production.

## Explicit production stop conditions
- Any need to restart/change Nội trú, its PostgreSQL, port 3000, tasks or files.
- Shared Nginx command/run prefix cannot be proven, or changes would affect a non-Báo giảng server block.
- Installed controller hash/rights cannot be independently validated.
- Failed migrations, insufficient RAM, unexpected worker state, bad SHA/nonce, red CI.
- Frontend and backend provenance disagree at any point.

**This document records the designed protocol. It is NOT evidence that the production Nginx/controller cutover has occurred.**
