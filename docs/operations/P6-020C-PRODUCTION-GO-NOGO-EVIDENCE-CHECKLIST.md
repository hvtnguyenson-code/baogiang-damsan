# P6-020C — Checklist nghiệm thu và phiếu chuyển giao cho người vận hành

**Loại tài liệu:** checklist/bằng chứng, không chứa mật khẩu, private keys hoặc lệnh thi hành thay đổi.
**Cơ sở:** P6-010-HTTP01-TLS-RUNBOOK.md và P6-020C-NGINX-DNS-HTTPS-READINESS-PLAN.md.
**Mốc tham khảo:** main@897bd88dca3c7ccf201040bb2903d8a6f9d13a9b. Phải thay bằng SHA main được phê duyệt thật tại thời điểm triển khai.
**Trạng thái khi lập:** CHƯA NHIỆM THU PRODUCTION. Không suy PASS từ CI.

## A. Dữ liệu gốc phải được điền bằng chứng thật

| Trường | Giá trị/chỉ dẫn | Bằng chứng/status |
|---|---|---|
| VPS/IP chính thức | Historical: 103.116.104.44, phải kiểm lại | NOT_VERIFIED |
| Nginx executable | Historical: C:\nginx\nginx.exe | DISCOVERED_ONLY |
| Effective Nginx prefix | Chỉ lấy từ thẩm quyền runtime đã chứng minh, không lấy từ workingDirectory | NOT_VERIFIED — BLOCKER |
| Active Nginx config graph | Full include tree/claim summary, có hash và protected neighbor SNI inventory | NOT_VERIFIED |
| Nginx service/task/owner | Historical: Nginx Auto Start / SYSTEM | DISCOVERED_ONLY |
| Báo giảng root và ACL | C:\baogiang candidate, Node22/bootstrap P6-020B | MISSING |
| HTTP-01 include path | Exact reviewed absolute path under active Nginx prefix | NOT_SELECTED |
| HTTPS include path | Exact reviewed absolute path under active Nginx prefix | NOT_SELECTED |
| HTTP-01 webroot | C:\baogiang\shared\acme-webroot | MISSING |
| Public DNS zone | dtnt-damsan.edu.vn, Mắt Bão authoritative control to reconfirm | NOT_VERIFIED |
| A label/IP | baogiang / approved VPS IPv4 | NOT_CONFIGURED/NOT_VERIFIED |
| AAAA/CNAME/CAA | Verify conflict/issuer authority prior to issue | NOT_VERIFIED |
| ACME account email | Operator-reviewed, do not commit | PENDING_APPROVAL |
| win-acme executable | Dedicated exact SHA/version/paths | MISSING |
| win-acme settings | ClientName baogiang-win-acme, private ConfigPath and LogPath | MISSING |
| Renewal ID | baogiang-damsan fixed by P6-010 | DESIGN_VERIFIED |
| Renewal scheduled task | \BaoGiang\BaoGiangTlsRenewal; clock/account must be reviewed | MISSING |
| Certificate/key | Private PEM under C:\baogiang\shared\tls | MISSING |
| API and SPA | 127.0.0.1:3100 + versioned web assets | MISSING |
| Report path | Existing operator-owned non-reparse path outside ALL protected roots | SELECT_LATER |
| Rollback authority | Exact file-by-file snapshot and reviewed original contents | PENDING |
| DamSanV5 health check | Known protected live workload, before-and-after proof required | NOT_RUN |

Do not mark a row PASS if its only evidence is a path existence, snapshot from another day, an assumed default, a green PR or another system's config.

## B. Thứ tự cổng GO / NO-GO

| Gate | Required evidence | Allowed next step only if GO |
|---|---|---|
| C0 — shared-usage authority | VPS online; protected neighbour stable; confirmed Nginx effective runtime prefix/config or separately approved controlled-binding correction | Plan active include graph |
| C1 — dedicated bootstrap | Exact app root/ACL, independent Node22/PG; reviewed marker/startup bundle; win-acme/config/hook digest | HTTP-01 plan |
| C2 — DNS authority | Zone owner + exact host A/AAAA/CNAME/CAA conflict review, IPv4 reconfirmed, before/after diff approved | Perform A-only Mắt Bão change |
| C3 — HTTP-01 | Canonical P6-010 plan READY; exact managed config, verifier PASS, syntax PASS, no other domain claims | Separate manual shared-Nginx reload |
| C4 — first certificate | DNS authoritative PASS, public challenge PASS, exact win-acme first-issue vector with --notaskscheduler, hook NO_RELOAD | Plan 443 HTTPS |
| C5 — HTTPS ingress | PEM metadata PASS, exact 443 managed include, verifier PASS, TLS/SNI smoke + protected neighbor before/after health | Separate manual shared-Nginx reload |
| C6 — automatic renewal | Approved dedicated task account/schedule; exact renewal id; isolated win-acme state, pinned hook, safe shared reload and expiry alert tests | Enable separate renewal task |
| C7 — final acceptance | All previous evidence archived; release/DB/rollback/user smoke tests PASS; P6-030 approved separately | First deploy discussion only |

Each shared Nginx reload is a **separate approval**. The code path for a due certificate renewal can reload shared Nginx; approving C6 means explicitly accepting that recurring shared-ingress change mechanism, not just issuing a free certificate.

## C. Risk/collision reviews to attach

- Nginx port 80 and port 443 domain-claim snapshots including normalized/trailing-dot variant; upstream and SNI certificate neighbor comparison.
- Dedicated DNS A before/after snapshot and authoritative NS proof; no edit to Nội trú zone records, apex/www, MX, TXT or nameservers.
- HTTP01 webroot challenge reachability, correct persistent filesystem location, no dynamic config mutation on each renewal.
- Pin existing Nginx effective prefix/config; preserve included file hashes and exact syntax/reload vectors.
- win-acme binary/version SHA, precise clientName/config/log path, renewal task ID/account/schedule, hook SHA against immutable common authority.
- Private PEM keys only local restrictive ACL, public cert SAN/issuer/expiry metadata in report; private key bytes NEVER printed, hashed or uploaded.
- Rollback: one approved managed include restoration/removal only; no generic service restart, process kill, PG operation or Windows reboot.
- Certificate expiry alert channel and operations ownership, especially on UNKNOWN renewal outcome, without reusing the Nội trú bot.

## D. Temporary engineering conclusion

P6-010 repository test authority is already CLOSED. P6-020C does not need a competing set of TLS scripts. What remains is production-specific evidence, actual root provisioning, Nginx effective binding and separate operator approvals. The offline Desktop Commander connector blocks refreshing those VPS observations now.

**Final categorization:** P6-020C REPO PREPARATION DONE once PR CI passes; P6-020C PRODUCTION GATES OPEN; P6-030 NO-GO.

## E. Approved-action template (fill only after review)

- Change ID / approved SHA: PENDING.
- Scope: exactly one of [account/root bootstrap, Nginx binding correction, DNS A record, HTTP01 include+reload, ACME first issue, HTTPS include+reload, recurring renewal task].
- Explicit Product Owner approval and review time: PENDING.
- Backup/snapshot hashes: PENDING.
- Host/port/domain/client/renewal ID: PENDING exact values.
- Before protected-neighbour health: PENDING.
- Expected output and timeout: PENDING.
- Stop/rollback trigger and exact object(s): PENDING.
- After protected-neighbour health and TLS smoke: PENDING.
- Evidence destination: PENDING (existing safe external report sink).
