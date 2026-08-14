---
status: rejected
type: task
rank: 7
created_date: '2026-04-04'
tags:
  - design-system
  - wave-1
  - design-excellence
flow: dev
closed_at: '2026-08-14'
---

# P657: Design System Foundation

> **Closed 2026-08-14 — backlog triage.** **Attempt #4 at this problem already shipped.** [decisions.md](../../docs/decisions.md) 2026-06-25 logs P955 as *"attempt #4 at the same problem"*; P655 shipped, P656 parked, and nothing ever blocked on this Wave-1 foundation (`grep -rl "components/ui/card\|badge" src/` → zero). The `tailwind.config.js:92` `calc()` bug is real and has produced no traceable defect in 149 days. That entry's own rule 1: *"Autopsy prior attempts before building attempt N+1."*
>
> Full reasoning and the adversarial review that produced this call: session plan v2, 2026-08-14.

**Part of:** Design Excellence Program (3-wave). Wave 1 of 3.
**Followed by:** P655 (Pipeline Skills Upgrade), P656 (Rendering-Aware Loop)

---

## Problem

**Situation:** The ClarityPledge design system exists as documentation but is not enforced. AI agents implementing UI features have no reliable visual constraints to work within — the documented rules are aspirational, not structural.

**Complication:** A design system audit (2026-04-04) found critical structural gaps: broken CSS in `tailwind.config.js` (missing `calc()` in border-radius DEFAULT), font CSS variables referenced but never defined, two competing blue palettes with no documented distinction, 293 direct color class usages across 30 files, and missing base components (Card, Badge, form error states). The enforcement hook exits 0 always — it warns but never blocks.

**Question:** How do we fix the design system infrastructure so agents building new features have a reliable, enforced foundation to work within?

---

## Appetite

- **Blast radius:** Medium. Touches `tailwind.config.js` and `index.css` which affect every rendered page. Changes are additive (new tokens) or bug fixes (broken calc) — not removals. Visual regression risk on existing pages.
- **Reversibility:** High. All changes are git-revertible. New CSS tokens are additive and don't affect existing usage.
- **Decision density:** Low. All design decisions were resolved in the Design Excellence research session (2026-04-04). One founder decision needed: whether to add a Card component or treat card patterns as layout utilities.

---

## Solution

Fix the broken design system infrastructure and add the missing structural pieces that new features depend on. This is not a visual redesign — it is making the existing documented design system actually work.

**1. Fix bugs in config**
- `tailwind.config.js` line ~92: fix broken `var(--radius - 4px)` → `calc(var(--radius) - 4px)`
- `index.css`: define `--font-sans`, `--font-serif`, `--font-mono` CSS variables (currently referenced in tailwind config but never set — fonts work by accident via body tag override)

**2. Add missing semantic tokens** (`index.css` + `tailwind.config.js`)
- `--success` / `--success-foreground` — currently green used via raw `text-green-600` etc.
- `--warning` / `--warning-foreground`
- `--info` / `--info-foreground`
- `--ceremony-bg`, `--ceremony-fg`, `--ceremony-accent` — the navy/parchment palette used in agreement/pledge pages is a valid second visual language but has no tokens. Formalize it instead of continuing ad hoc hex values.

**3. Add missing base components** (`src/components/ui/`)
- `card.tsx` — documented extensively but doesn't exist; cards are built ad hoc per page
- `badge.tsx` — generic Badge with variants: success, pending, neutral (currently only domain-specific badges exist)
- Add error/invalid variant to `input.tsx` and `textarea.tsx`
- Fix `ear-badge.tsx` and `understood-badge.tsx` to use `cn()` instead of string concatenation (breaks Tailwind class merging)

**4. Make enforcement real** (`.claude/hooks/design-system-check.sh`)
- Change exit code from 0 (warn) to 1 (block) for critical violations
- Add detection for: hardcoded hex colors in className (`bg-[#...]`, `text-[#...]`), inline `style={{}}` with color values, arbitrary pixel font sizes
- Keep exit 0 for non-critical warnings (e.g. arbitrary spacing values)

**5. Document the two visual languages** (`docs/design-system.md`, `.claude/rules/src.md`)
- Standard language: blue-500/shadcn/ui — for all product UI
- Ceremony language: navy #0044CC / parchment — for agreement/pledge/ritual moments
- Add "Never use X in Y context" negative constraints table to `src.md`
- Document approved component selection constraints (which Button variant for which context)

---

## Risks / Non-Goals

**Risks:**
- Tailwind/CSS changes can cause visual regressions on pages not touched directly. Mitigation: `/verify` is mandatory before shipping; screenshot all major page types.
- Making the hook exit 1 will block commits that currently pass. Mitigation: audit existing violations first, add `# design-system-ignore` escape for documented exceptions (landing page redesign is deferred).

**Non-Goals:**
- Do NOT fix the 293 existing direct color class usages in app pages — that is scope for individual page redesigns
- Do NOT redesign the landing pages (v3, v4) — they are intentional style experiments, not in scope
- Do NOT change the visual appearance of existing shipped pages — only add new tokens and fix broken config
- Do NOT add shadcn/ui components beyond Card and Badge — resist scope creep
- Do NOT add dark mode support — it's defined but untested; defer to a dedicated spec

---

## Done-When

- [ ] `tailwind.config.js` border-radius DEFAULT uses valid `calc()` syntax
- [ ] `--font-sans`, `--font-serif`, `--font-mono` defined in `index.css`
- [ ] `--success`, `--warning`, `--info` token families defined and mapped in tailwind config
- [ ] `--ceremony-*` token family defined for navy/parchment palette
- [ ] `card.tsx` exists in `src/components/ui/` with at least two variants (default, ceremony)
- [ ] `badge.tsx` exists with success/pending/neutral variants
- [ ] `input.tsx` and `textarea.tsx` have error state styling
- [ ] `ear-badge.tsx` and `understood-badge.tsx` use `cn()` (no string concatenation)
- [ ] `design-system-check.sh` exits 1 on hex color violations and pixel font sizes
- [ ] `docs/design-system.md` documents both visual languages with usage rules
- [ ] `.claude/rules/src.md` has negative constraint table
- [ ] `/verify` confirms no visual regression on: profile page, live session page, agreements page, home/feed page

## Alternatives Considered

- **Fix all 293 violations now:** Rejected. Too large scope, high regression risk, landing pages are intentional experiments. Enforcing on new code is sufficient for now.
- **Consolidate to one blue (remove ceremony palette):** Rejected. The ceremony/pledge moments have a legitimate distinct visual language. Formalizing it as a documented second language is better than forcing one palette everywhere.
- **Keep hook as exit 0:** Rejected. A warning that's never actionable becomes noise. The hook has been exit 0 since creation — it has never blocked a single violation.

## Rollback Strategy

All changes are purely additive (new tokens, new components) except:
- Bug fix in `tailwind.config.js` — if it causes regression, `git revert` restores broken-but-stable state
- Hook enforcement change — if it blocks too aggressively, comment out new checks and file a separate bug spec

No migration needed. No DB changes. Safe to revert any individual change independently.
