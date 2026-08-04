# Báo giảng Đam San — UI design authority

## Product, audience, and job

Báo giảng Đam San is an operational service for Vietnamese teachers and school managers. Its interface must help people complete dense weekly, daily, period, approval, and long-form work accurately on Windows laptops and Android phones, including on slow or unreliable networks. It is not a marketing site or a generic SaaS dashboard.

## Direction: Sổ công tác Đam San

The visual language takes structure from a teacher's weekly work ledger and administrative forms without imitating aged paper. It is clear, firm, moderately dense, and factual.

The signature element is a **basalt margin rail**: a narrow `basalt-600` rule that aligns and labels a real section, week, form sequence, or workflow state. It must clarify scanning and hierarchy; never scatter it as decoration.

Do not use unapproved ethnic patterns, cultural symbols, or Êđê motifs. Do not use gradients, glass, glow, blobs, marketing heroes, bento grids, equal decorative card grids, nested cards, permanent generic sidebars, icon tiles, role selectors, fake metrics, fake notifications, fake people, or invented business data.

## Semantic tokens

| Token | Value | Use |
| --- | --- | --- |
| `ink-950` | `#15242E` | primary text |
| `school-800` | `#1F4358` | identity and primary interaction |
| `basalt-600` | `#A7462F` | sole structural accent and margin rail |
| `mist-50` | `#F3F6F7` | application background |
| `paper-0` | `#FFFFFF` | input and content surfaces |
| `line-300` | `#C9D4DA` | borders and dividers |
| `success-700` | `#246B45` | success text/icon |
| `success-50` | `#EDF7F1` | success background |
| `warning-800` | `#7A4B00` | warning text/icon |
| `warning-50` | `#FFF7E6` | warning background |
| `error-700` | `#A32929` | error text/icon; never basalt |
| `error-50` | `#FFF1F1` | error background |

Status must always include text or an icon cue, never color alone. Do not add arbitrary palettes when a semantic token fits.

## Typography

- Product text: Be Vietnam Pro, self-hosted, weights 400, 500, 600, and 700 as required.
- Data/utility: IBM Plex Mono, self-hosted, weights 400 and 500, only for codes, dates, time, technical labels, and tabular numbers.
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

Compact masthead, link navigation, and a bounded reading/work column. Show only real routes. Use the margin rail to identify the current work section. No permanent sidebar in this foundation.

### Data table

Use a real table with sticky/contextual headings only when data exists. Preserve horizontal access on small screens, clear row dividers, tabular numerals, and explicit empty/error states.

### Long form

Group fields by task sequence with headings and basalt rails. Keep labels above fields, errors adjacent, and actions predictable. Never split a simple form into cards.

### Weekly ledger

Orient by week/day/period with the margin rail and strong table semantics. Dense does not mean cramped; keep touch targets and row scanning intact.

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
