---
name: damsan-ui
description: Project UI authority for Báo giảng Đam San. Use for every task that designs, implements, reviews, or changes apps/web UI, interaction, accessibility, responsive layout, Vietnamese product copy, visual tokens, or UI tests in this repository.
---

# Đam San UI

Read `/DESIGN.md` completely before planning or editing any UI. Treat it as the product-specific visual authority; this skill defines the working method.

## Workflow

1. Audit the current route, data, semantics, responsive behavior, and nearby components.
2. State the user job and produce a compact text wireframe for affected viewports.
3. Check every visual choice against the semantic tokens and layout family in `DESIGN.md`.
4. Implement with native HTML semantics and existing project-owned primitives first.
5. Render deterministic screenshots at required mobile, laptop, and wide viewports.
6. Critique screenshots for template-like composition, density, Vietnamese typography, overflow, target size, and whether the basalt margin rail has structural meaning.
7. Run keyboard, focus, reduced-motion, automated accessibility, unit, static UI, and relevant E2E checks.

## Boundaries

- Preserve routes, API contracts, auth rules, and business data unless the assigned task explicitly changes them.
- Do not invent business features, metrics, notifications, roles, users, cultural motifs, or placeholder navigation.
- Do not introduce gradients, glass, glow, blobs, marketing heroes, bento/card grids, card nesting, generic permanent sidebars, icon tiles, role selectors, or broad entrance animation.
- Do not use `transition-all`; animate only a property whose cause/effect is clear and honor reduced motion.
- Use Be Vietnam Pro for product text and IBM Plex Mono only for codes, time, technical labels, or tabular values.
- Use the basalt margin rail only to orient a section, week, workflow state, or form sequence.
- Prefer borders, dividers, spacing, and type hierarchy over shadows and excessive radius.
- Use one primitive system only. Keep native controls until a real modal, menu, or combobox requires an evaluated accessible primitive library.
- Hallmark is an adversarial audit input only. It may identify generic patterns but must not redesign or override `DESIGN.md`.

When a requested UI conflicts with `DESIGN.md`, report the conflict instead of silently choosing another theme or primitive system.
