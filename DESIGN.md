# Báo giảng Đam San — UI design authority

## Product, audience, and job

Báo giảng Đam San is an operational service for Vietnamese teachers and school managers. Its interface must help people complete dense weekly, daily, period, approval, and long-form work accurately on Windows laptops and Android phones, including on slow or unreliable networks. It is not a marketing site or a generic SaaS dashboard.

## Direction: High-Contrast Professional Workspace (Approved Visual Refresh)

The visual language follows the approved administrative design direction inspired by KTNB_Auto V3: high contrast, crisp structural hierarchy, clear boundaries, and purposeful color coding for administrative operations.

Key visual elements:
- **Header**: Deep slate (`#0f172a`) with high-contrast text (`#f8fafc`), compact horizontal controls, and clear hierarchical product branding.
- **Canvas & Surfaces**: Cool slate canvas (`#cbd5e1`) contrasting with crisp white work surfaces (`#ffffff`).
- **Form Cards**: White surfaces, solid borders (`#94a3b8`), small radius (6–10px), restrained shadow (`0 3px 8px rgba(15, 23, 42, 0.08)`), and dark or color-coded section headers (`#1e293b`, `#1e3a8a`, `#0f766e`, `#4338ca`, `#b45309`).
- **Input Controls**: Slate-tinted input surfaces (`#f1f5f9`), medium-strong slate border (`#64748b`), thick left accent rail (`border-left: 4px solid #2563eb` or section role color), and distinct hover/focus states.
- **Color Roles**:
  - **BLUE** (`#2563eb`, `#1e3a8a`): primary actions, selected navigation, account lifecycle.
  - **TEAL** (`#0f766e`): professional responsibilities, approved state.
  - **INDIGO** (`#4338ca`): capability/template preview and grant grouping.
  - **AMBER** (`#78350f`): warnings, conflicts, requires-attention content (>= 4.5:1 on slate canvas).
  - **RED** (`#9f1239`): irreversible deletion or actual error only (never used for ordinary navigation).

Do not use unapproved ethnic patterns, cultural symbols, or Êđê motifs. Do not use gradients, glass, glow, blobs, marketing heroes, bento grids, equal decorative card grids, nested cards, permanent generic sidebars, icon tiles, role selectors, fake metrics, fake notifications, fake people, or invented business data.

## Semantic tokens

| Token | Value | Role / Use |
| --- | --- | --- |
| `--surface-canvas` | `#cbd5e1` | global application background canvas |
| `--surface-content` | `#ffffff` | task cards, forms, tables and modal surfaces |
| `--surface-input` | `#f1f5f9` | form input, select and textarea background |
| `--surface-input-hover` | `#e2e8f0` | input hover state |
| `--ink-primary` | `#0f172a` | primary text, table body copy |
| `--ink-heading` | `#1e293b` | section headings, field labels |
| `--ink-inverse` | `#f8fafc` | text on dark headers and badges |
| `--header-bg` | `#0f172a` | application masthead background |
| `--section-header-bg` | `#1e293b` | standard form card header |
| `--primary` | `#2563eb` | primary action buttons, active tab indicators |
| `--primary-hover` | `#1d4ed8` | primary button hover / active |
| `--ink-brand` | `#1e40af` | accessible brand foreground for text/links/labels on slate canvas (5.91:1) and white (8.76:1) |
| `--ink-brand-hover` | `#1e3a8a` | hover state for accessible brand links (8.02:1 on slate) |
| `--ink-muted-on-canvas` | `#334155` | muted secondary copy readable on canvas (8.1:1 on slate) |
| `--ink-accent-terracotta` | `#872e15` | accessible terracotta accent for work indices / badges (5.83:1 on slate) |
| `--section-blue` | `#1e3a8a` | account management section header |
| `--section-teal` | `#0f766e` | professional responsibility section header |
| `--section-indigo` | `#4338ca` | template preview & capability grant grouping |
| `--section-amber` | `#78350f` | evaluation, warning & conflict header / status badge (6.08:1 on slate) |
| `--border-input` | `#64748b` | input and select borders |
| `--border-card` | `#94a3b8` | card and panel borders |
| `--success` | `#065f46` | success text, status cues, confirmed badges (5.11:1 on slate) |
| `--danger` | `#9f1239` | irreversible deletion, danger buttons, fatal error (5.59:1 on slate) |

Status must always include text or an icon cue, never color alone. Do not add arbitrary palettes when a semantic token fits. Contrast requirements: normal text >= 4.5:1, large text >= 3:1, focus indicators clearly visible. Touch targets: all interactive controls (buttons, navigation links, tabs, compact row actions) must have min-height >= 44px and min-width >= 44px for WCAG AA mobile touch target compliance.

## Typography

- Product text: Be Vietnam Pro, self-hosted, weights 400, 500, 600, and 700 as required.
- Data/utility: IBM Plex Mono, self-hosted, weights 400 and 500, only for ASCII codes, dates, time, technical values, and tabular numbers. Vietnamese utility labels remain Be Vietnam Pro for legibility.
- Use `font-display: swap`; never load fonts from a CDN.
- Default body size is 16px with a comfortable Vietnamese line-height. Form inputs remain at least 16px on mobile.
- Prose measure is about 65ch. Operational forms and tables may use the available work width.
- Use tabular numerals for comparative data.

## Spacing, radius, elevation, and motion

- Spacing rhythm: 4, 8, 12, 16, 24, 32, 48px. Use 6 or 20px only where component density requires it.
- Radius: 2px for rails/rules, 4px for inputs and compact controls, 8px for major bounded surfaces. Pills are reserved for actual status/chips.
- Elevation: default none. A single restrained shadow is allowed only when a floating layer must separate from content.
- Motion: no automatic page entrance. Use short color, border, opacity, or transform transitions only to explain direct interaction. Honor `prefers-reduced-motion`.

## Layout families

### Auth

Asymmetric two-column composition at laptop width: a concise identity/context ledger beside the form. Collapse to one column on mobile. Keep the primary action visible at 1366×768. The form is not a centered floating card.

### Workspace

Compact masthead, link navigation, and bounded reading/work surfaces. Show only real routes. Use accent rails and card headers to identify the current work section. No permanent sidebar in this foundation.

### Administration split workspace

Desktop composition inspired by the KTNB_Auto V3 high-contrast operational layout:
- **Left management area**: user list/selection, compact search/filters, status indicators, and account lifecycle actions.
- **Right detailed workspace**: selected record details, profile editing, responsibility templates, capability preview, and safe-deletion preflight.
- Ratio approximately 5/7 on wide desktop, collapsing to a clear single-column workflow on tablet and mobile viewports without horizontal page overflow.

### Data table

Use a real table with sticky/contextual headings only when data exists. Preserve horizontal access on small screens, clear row dividers, tabular numerals, and explicit empty/error states.

### Long form

Group fields by task sequence with crisp section headings, structured form cards, and accent rails. Keep labels above fields, errors adjacent, and actions predictable.

### Weekly ledger

Orient by week/day/period with accent rails and strong table semantics. Dense does not mean cramped; keep touch targets and row scanning intact.

### Approval

Present evidence before actions. Distinguish status with text and icon. Keep irreversible actions visually and verbally explicit.

### Mobile

One work column; navigation remains native links. Controls are at least 44px high/wide where touched. Avoid fixed heights and horizontal page overflow at 320, 375, and 414px.

## Component states

Buttons, links, and fields require default, hover where available, visible `focus-visible`, active, disabled, loading, and error states as applicable. Loading retains the action label. Async status uses an appropriate live region. Recovery states name the problem without exposing internals and provide a real next action.

## Vietnamese content voice

Use concise, respectful, task-oriented Vietnamese. Prefer direct verbs such as “Đăng nhập”, “Thử lại”, and “Đăng xuất”. Explain what the person can do next. Do not expose stack traces, SQL, credentials, internal hostnames, or raw server responses. Do not invent registration, password recovery, or business capabilities that have no API.

## Accessibility and performance

- Native semantics before ARIA; route navigation uses links and `aria-current`, never tab roles.
- Include a skip link and one visible page `h1`; maintain heading order.
- All flows work by keyboard and preserve visible focus.
- Labels are programmatic; field and summary errors are connected; password paste is allowed.
- Do not lock browser zoom. Test long Vietnamese strings and 200% zoom.
- Respect reduced motion and system high-contrast behavior.
- Load only necessary font subsets/weights, avoid runtime font/CDN dependencies, and keep auth usable under slow network conditions.

## Do / don't

Do use factual copy, functional rails, dividers, deliberate density, native controls, stable loading geometry, safe return paths, and deterministic screenshot review.

Do not use decorative templates, arbitrary color, excessive rounded surfaces, `transition-all`, `h-screen`, smooth scrolling by default, client token persistence, or capability-derived role labels.
