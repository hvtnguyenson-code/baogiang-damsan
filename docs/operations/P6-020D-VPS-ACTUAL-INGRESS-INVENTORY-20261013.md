# P6-020D — VPS fact check and Nginx first-include blocker (2026-10-13)

**Baseline:** main 559a5b46725a8147d74529df684a15529382cd0e. **Status:** only read-only evidence, review candidate. VPS mutation, P6-030 and merge are not authorized.

## Verified directly on Windows Server 2022 VPS

| Finding | Observation |
|---|---|
| Server capacity | 16 GiB RAM, 12.53 GiB free; NTFS C: 49.9 GiB total, 29.55 GiB free |
| Protected Nội trú | DamSanV5 Running as SYSTEM; Node 20.18.0 at C:\Program Files\nodejs\node.exe, TCP 3000 |
| Protected PostgreSQL | Service postgresql/PG16 data under C:\Program Files\PostgreSQL\16\data, 5432 loopback; postgresql17/PG17 data under C:\Program Files\PostgreSQL\17\data, 5433 loopback; both NetworkService |
| Nginx process/task | Nginx Auto Start Running as SYSTEM; PIDs 2308/4420 are SYSTEM SID S-1-5-18; neither has explicit -p or -c arguments |
| Candidate Nginx main file | C:\nginx\conf\nginx.conf, 1,434 bytes, CRLF, no UTF-8 BOM; SHA-256 BAB93A9F54022907B8EBA5A85E118FD8C8A1A1295335EA32D5603A8685CAB635; last change 2026-09-20 01:52:54 UTC |
| On-disk Nginx topology | Only include in candidate file is line 4: include mime.types; under http. Two existing server blocks listen 80/443 for dtnt-damsan.edu.vn and www; HTTPS proxy_pass http://localhost:3000; body limit 25m. No server include boundary for Báo giảng |
| Nginx relative path | C:\nginx\conf\mime.types exists; C:\nginx\mime.types does not. This suggests but DOES NOT PROVE effective prefix |
| Dedicated application | Local users bg_deploy/bg_api/bg_pg and C:\baogiang, C:\baogiang-pg, C:\baogiang-data all MISSING. TCP 3100/3180/5434 free at snapshot |
| SSH | sshd listens IPv4+IPv6 port 22; config: PubkeyAuthentication yes, PasswordAuthentication no. Public key companions present, pinned host identity not yet independently verified |
| Firewall | Enabled inbound allow rules for exact TCP 22/80/443 verified. Do not open 3100/5434 publicly |
| Authoritative DNS | Both ns1.matbao.vn and ns2.matbao.vn answer dtnt-damsan.edu.vn A=103.116.104.44. Neither yielded an A response for baogiang.dtnt-damsan.edu.vn |
| Existing ACME | Existing SYSTEM win-acme renewal task remains Ready; last result 0; next due 2026-10-13 10:12 +07. Do not reuse it |
| Protected certificate | C:\nginx\ssl\dtnt-damsan.edu.vn-chain.pem and corresponding private-key file exist. Public certutil metadata indicates NotAfter 2026-12-01 16:57 local display; private key bytes not read |
| Reports | C:\Users\Administrator\Documents\P6-020\reports exists; still validate full non-reparse/protected-root constraints before any file written |

These are direct passive host observations. This does NOT certify public HTTP health, actual loaded Nginx configuration, application database health, TLS connectivity or complete PASS2.

## Architectural gap not yet handled in P6-010 / P6-020C

The existing P6-010 plan/verify tools intentionally require an already ACTIVE and verified include graph for HTTP-01 or HTTPS managed server files. The actual on-disk candidate nginx.conf has **no http-scope include for such files**. Creating C:\nginx\conf\conf.d\baogiang-http01.conf alone cannot make Nginx load the file.

Existing Get-NginxEffectiveGraph rejects wildcard include with zero matching files except when PlannedManagedPath explicitly matches. Therefore empty-directory bridging does not qualify as verified readiness.

**Do not weaken Get-NginxRuntimeBinding/Get-NginxEffectiveGraph or call P6-010 plan a PASS while the include boundary is absent.**

## Required safe first-include bootstrap design

1. Verify effective running Nginx prefix/config via independently reviewed evidence. Current process/task lacks absolute -p/-c. Neither working directory nor file existence suffices. If exact authority cannot be proved, request a separately approved binding change window; this would touch shared ingress.
2. Preserve original main nginx.conf exact bytes/hash and existing TLS/neighbor health, full graph, rollback snapshot and exact Nginx task action authority.
3. Prepare the smallest reviewed http-context include, provisionally 'include conf/baogiang-managed/*.conf;', into the on-disk candidate Nginx main file; reserve dedicated directory and separate baogiang-http01.conf / baogiang.conf files, both outside Nội trú server blocks. The spelling is only a hypothesis to be checked against exact verified Nginx prefix and syntax.
4. Prepare the initial HTTP-01 managed file using existing P6-010 canonical generator. New FIRST-INCLUDE read-only plan must test the proposed modified main plus generated managed file in an isolated Windows fixture before manual approval; it must not mutate production or claim existing graph is active.
5. Because the existing P6-010 plan requires active include, the initial one-time main-file change plus first managed include is a *separate authorized bootstrap transaction*. Only after exact syntax/test/rollback review and a shared-Nginx reload approval may normal P6-010 plan/verify take over.
6. During application deploy/restart never touch or reload shared Nginx. Later automatic TLS renewal hook DOES reload shared Nginx on due renewal after exact checks; requires explicit shared-neighbor risk acceptance and independent health tests.
7. Rollback only exact attributable Nginx main/config files under approval, never global Node kill/host reboot/DamSanV5 or foreign PG operations.

## Remaining hard gates

Effective Nginx runtime binding NOT_VERIFIED; first-include bootstrap missing; full SSH host key pinned identity NOT_VERIFIED; operator Mắt Bão authority/CAA/AAAA/record change NOT_VERIFIED; exact Node22 and private PG17 signed vendor artifact hashes; disk growth/backup capacity; dedicated Windows principals/ACLs; PASS2 marker and task, public TLS/health smoke NOT_RUN.

**Decision:** complete repository-side safe first-include planner and tests, independently review; do NOT modify VPS or merge without user permission. P6-030 NO-GO.
