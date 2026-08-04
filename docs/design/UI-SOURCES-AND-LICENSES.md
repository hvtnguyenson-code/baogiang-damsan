# UI sources and licenses

Reviewed on **2026-08-04**. These sources informed original repository rules; none is vendored or copied substantially.

| Source | Reference | License / terms | Use in this repository |
| --- | --- | --- | --- |
| Anthropic `skills/frontend-design` | https://github.com/anthropics/skills/tree/b29e7cf65e5cb78a5ac33d582270551bc74a14eb/skills/frontend-design | Apache-2.0 for the referenced open-source skill set; repository notes exceptions for specified document skills | intentional design workflow only |
| Nutlope Hallmark | https://github.com/nutlope/hallmark/tree/aeb42fb354ff4efa36ab475773a082315a3af2ce | MIT | adversarial anti-template audit only |
| Vercel Web Interface Guidelines | https://github.com/vercel-labs/web-interface-guidelines/tree/4e799d45c17aec1498c269287a83b9dba22b966b | repository guidance; no runtime code copied | interaction, focus, mobile target, and performance review |
| GOV.UK Design System / Frontend | https://design-system.service.gov.uk/ and https://github.com/alphagov/govuk-frontend/tree/612d315a8adc0380058b37f0d4bdfeaddf683076 | Frontend code MIT; documentation Crown Copyright under OGL v3.0 unless stated otherwise | clarity of public-service forms; no GOV.UK branding, font, or components copied |
| WAI-ARIA Authoring Practices | https://www.w3.org/WAI/ARIA/apg/ | W3C document terms | native landmarks, link navigation, accessible names, and keyboard semantics |
| Be Vietnam Pro | https://github.com/google/fonts/tree/2796410152d4f9524b68ed46e69c1b60f8e0f7c3/ofl/bevietnampro | SIL Open Font License 1.1 | primary UI font; Vietnamese glyph set verified through Google Fonts/Fontsource metadata |
| IBM Plex Mono | https://github.com/IBM/plex/tree/bf260093582f04622aacc1e9f9ca604d7ccd0c42 | SIL Open Font License 1.1; reserved font name “Plex” | technical labels, codes, times, and tabular data only |
| Fontsource packages | https://fontsource.org/fonts/be-vietnam-pro and https://fontsource.org/fonts/ibm-plex-mono | packaged font files retain their upstream OFL-1.1 licenses; Fontsource tooling is MIT | versioned self-hosting through the application build |

Installed font notices remain available in each package under `node_modules/@fontsource/*/LICENSE`; distribution bundles the font files and this attribution record. No font is fetched from a CDN at runtime.
