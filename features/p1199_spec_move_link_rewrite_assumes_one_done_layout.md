---
status: backlog
type: task
rank: 99
workstream: infra
created_date: '2026-08-31'
tags: [ship, doc-links, tooling]
drafted_by: sonnet
exec_model: sonnet
exec_effort: low
driver: anomaly
---

# P1199: Spec-close link rewrite assumes one `features/done/` layout — it has two

## Problem

`features/done/` has held two coexisting layouts since at least P1094: flat (`features/done/pN_*.md`)
and dated-subfolder (`features/done/YYYY-MM-DD/pN_*.md`). The move-time relative-link rewrite in
`git-ops.sh`'s spec-close step (2026-08-17, P1094 — "exact path math") computes a link target's
depth assuming the dated-subfolder shape uniformly, rather than resolving each target's REAL path.

P1179 (2026-08-31) hit this directly: its spec closed into `features/done/2026-06-10/` and links to
P1161, which closed FLAT at `features/done/p1161_....md` in the same session. The rewrite produced
`../../p1161_....md` (two levels up, correct only if the target were also one level deeper) instead
of the correct `../p1161_....md`. `validate-doc-links.cjs`'s ratchet caught 3 dead links at the
spec-close commit; fixed by hand before the ship could proceed.

## Appetite

**Blast radius: low.** Touches only the link-rewrite step of `git-ops.sh`'s spec-close, and only
fires for specs whose body links to another spec already in `features/done/`.

**Reversibility: high.** Pure tooling fix.

**Decision density: low.**

## Solution

Resolve each link target's actual on-disk path via `find`/glob (the way path-lookup is already
expected to work elsewhere in this codebase, per `.claude/rules/epistemic.md` gate 4 — "read the
manifest before guessing among N paths") rather than assuming a fixed relative depth. Compute the
correct `../` prefix from the mover's own destination path to the target's real resolved path.

## Risks / Non-Goals

- **MITIGATE** — an ambiguous target (same P-number basename existing at two paths, which should
  never happen given P-number uniqueness) should refuse and flag rather than guess.
- **Non-goal:** normalizing `features/done/` to a single layout. That's a bigger, separate migration;
  this task only makes the rewrite correct under the layout as it actually exists today.

## Done-When

- [ ] A fixture reproduces the P1179 shape: a spec closing into a dated subfolder, linking to another
      spec that lives flat in `features/done/` — and the rewrite produces a resolvable link.
- [ ] `validate-doc-links.cjs` passes on the fixture without a manual fix.
- [ ] Existing P1094 canary/tests (if any) still pass — this must not regress the already-fixed
      docs/-root and features/-root link cases.

## References

- `scripts/git-ops.sh` (spec-close git-mv + link rewrite)
- `docs/decisions.md` 2026-08-17 [technical] (P1094, "exact path math") · 2026-08-31 [technical] entry
  ("two `features/done/` layouts")
- `features/done/2026-06-10/p1179_event_room_links_menu_and_stake_surface.md`
- `scripts/validate-doc-links.cjs`
