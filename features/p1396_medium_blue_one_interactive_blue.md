---
status: qa
type: task
rank: 92
workstream: design
created_date: '2026-10-02'
tags: [design-system, ui, consistency]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec, inline]
drafted_by: opus
exec_model: opus
exec_effort: low
driver: heuristic
related:
  - p1308
  - p1393
---

# P1396: One interactive blue is medium blue, not navy

## Problem

> Founder framing, verbatim (2026-10-02): "maybe we went to fast into navy.. mayb buttons have to be middle?"
> — then, after comparing both live: "lets go with  localhost:5199/feed"

P1308 landed dark navy as the one interactive blue (merged locally, never pushed). Seeing it with the
logo, the founder reconsidered: *"maybe we went to fast into navy.. mayb buttons have to be middle?"*.
After comparing the real feed in both colours side by side (`localhost:5198` navy vs `localhost:5199`
medium), the founder chose medium: *"lets go with localhost:5199/feed"*.

## Appetite

Blast radius: medium (visual, app-wide via one config value). Reversibility: one line. Decision density:
one call, made.

## Solution

- `tailwind.config.js`: `blue-500` and `blue-600` → `#2563eb`, `blue-700` → `#1d4ed8`.
- Hex literals P1308 swept to navy (certificate exports, landing illustrations, slider) return to medium;
  the last navy submit button (pledge form) becomes `bg-blue-600`.
- Logo, loader, favicon SVG, `theme-color` and PWA manifest `theme_color` → `#2563eb`.
- Guard `p1308-one-blue.test.ts` and `docs/design-system.md` follow. Navy `#002B5C` stays certificate-only.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| PWA/home-screen PNG icons and the link-preview PNG are still `#3b82f6` (no generator script; no SVG renderer installed) | DEFER | Visually near-identical to `#2563eb`; regenerate when an icon pipeline exists |

**Non-Goals:** Do NOT change avatar colours. Do NOT change certificate frames/ink.

## Done-When

- [x] Built CSS renders `bg-blue-600` and `bg-blue-500` as `#2563eb`; guard test asserts the mapping
- [x] No navy (`#002B5C`) on any button in prod-reachable UI (grep)
- [x] Logo, loader, favicon, theme colour on `#2563eb`
- [x] Full vitest green (5409 passed)