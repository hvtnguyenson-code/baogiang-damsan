# UI engineering checklist

## Before implementation

- Read `.codex/skills/damsan-ui/SKILL.md` and `DESIGN.md` completely.
- Confirm the real user job, route, API contract, and responsive viewports.
- Audit nearby semantics and produce a small text wireframe.
- Confirm no backend, auth, or business rule is being invented.

## During implementation

- Use semantic tokens and the approved two fonts only.
- Use native form, button, link, heading, landmark, and status semantics first.
- Use the basalt rail for structure, not decoration.
- Keep mobile controls at least 44px and inputs at least 16px.
- Preserve visible focus, paste, browser zoom, reduced motion, and safe error copy.
- Never persist credentials/tokens or derive a displayed role from capabilities.
- Avoid banned template patterns and unnecessary animation/elevation/radius.

## Verification

- Run static UI, lint, typecheck, unit, build, Playwright, and axe gates.
- Keyboard-test login, first password change, navigation, retry, and logout.
- Check 320/375/414/768/1366/1920 widths and long Vietnamese content.
- Review deterministic screenshots for density, glyphs, overflow, focus, and rail function.
- Inspect staged files, licenses, secrets, and `git diff --check`.
