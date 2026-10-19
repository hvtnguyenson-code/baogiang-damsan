# P5-052 — Task-Oriented Workspace & Information Architecture

**Status:** IN_REVIEW<br>
**Depends on:** P5-050, P5-051<br>
**Traceability:** T51

## Objective

Replace the flat capability-to-menu projection with a school-work information architecture while preserving backend capability authority.

## Mandatory workspace families

The principal product navigation must organize reachable work into these families:

1. **Công việc của tôi**
   - lịch dạy;
   - báo giảng/kê khai;
   - công việc cá nhân;
   - notifications when P5-056 closes.
2. **Dữ liệu năm học**
   - năm học/lớp;
   - phân công;
   - khung tiết;
   - TKB;
   - PPCT;
   - relevant import/readiness.
3. **Điều hành chuyên môn**
   - calendar exceptions;
   - substitution/supervision;
   - make-up;
   - GDĐP/HĐTN-HN.
4. **Báo cáo & phê duyệt**
   - accessible statements;
   - approval queue;
   - school/subject reporting and workload surfaces when authorized.
5. **Quản trị**
   - users;
   - responsibility/capability administration;
   - business configuration;
   - audit.

This is a semantic grouping requirement, not permission to create fake routes.

## Home/workspace requirement

The signed-in landing page must be an actionable readiness/work queue, not a duplicate list of routes.

For BGH/PHT, it must expose authoritative status such as:

- school-year setup readiness;
- timetable readiness/version;
- PPCT readiness;
- pending approvals;
- unresolved import/findings;
- teaching-operation items requiring action;
- special-programme readiness where authorized.

Only real backend data may be shown. No fake metrics.

## UX constraints

- Follow `DESIGN.md`: no generic SaaS dashboard, no decorative card grid, no permanent template sidebar merely to solve navigation.
- Desktop and Android widths must remain usable.
- Main actions must be reachable through visible navigation/workspace without typing URLs.
- Capability denial must explain the missing prerequisite or safe next action where appropriate.
- Technical capability keys and UUIDs are not normal user-facing language.

## Acceptance evidence

- Teacher, subject leader, PHT, principal and admin navigation fixtures;
- keyboard and mobile navigation;
- long Vietnamese labels;
- no top-level flat list of every management capability;
- current route deep links remain safely supported or redirected;
- route guards still use capability contracts, not persona labels.
