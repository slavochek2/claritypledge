---
status: qa
type: task
rank: 1000950
created_date: '2026-06-18'
tags:
  - infrastructure
  - git
  - privacy
  - security
  - tooling
delivery_stage: ship
pipeline_ran: [dev, ship]
---

# P950: SHA-based privacy stamp + ship-to-prod executor (Parts A + B)

> Full spec in `~/.claude/plans/just-create-inline-spec-declarative-papert.md`. This file tracks implementation status.

## Problem

Privacy gate false-blocks on every push (calibrated on staleness, not risk-delta). No agent-executable staging→CI→main sequence — founder manually carries messages between documented gates.

## Solution

**Part B:** Replace ISO timestamp in `.claude/.privacy-reviewed` with a reviewed SHA. Layer 2 uses `git rev-list` commit enumeration + ancestor check instead of diff+timestamp comparison. Single `WATCHED_PATHS` constant shared across hook, `/privacy`, `/finish`.

**Part A:** New `git-ops.sh ship-to-prod pN` subcommand: staging push → CI poll (named check + SHA + freshness) → TTY confirm → main push → cleanup. Hard invariants: D1 (TTY confirm always fires, even with `~/.push-enabled`) + D2 (stamp only written by human-invoked `/privacy`, never by executor).

## Acceptance Criteria

- [ ] AC1 (B-write): `/privacy` writes 40-char SHA to `--git-common-dir`-rooted stamp
- [ ] AC2 (B-pass, linear): stamp at HEAD; watched-path ancestors → Layer 2 exit 0
- [ ] AC3 (B-fail, gate failure proof): un-covered commit → block, pasted non-zero exit
- [ ] AC4 (B fail-closed): empty stamp, no-origin, force-push all block
- [ ] AC5 (B co-tenant immunity): stamp at X valid after unrelated doc commit
- [ ] AC6 (B merge shape): side-branch un-reviewed watched-path commit → block
- [ ] AC7 (B content/ coverage): `content/sifter/` un-reviewed commit → Layer 2 blocks
- [ ] AC8 (/finish parity): routing + Step-3 detection use SHA/ancestor logic
- [ ] AC9 (A happy path): staging→verified-CI-green→(TTY y)→main→cleanup transcript
- [ ] AC10 (A stops on uncovered range, D2): un-reviewed commit → STOP, no push, stamp unchanged
- [ ] AC11 (A verifies right check): green unrelated workflow + absent/failed privacy check → no promote
- [ ] AC12 (A authorization, D1): `~/.push-enabled` SET → still prompts TTY; N aborts
- [ ] AC13 (A resume safety): pre-existing `staging/pN` doesn't let stale-green CI promote wrong SHAs

## Files to Modify

- `scripts/pre-push-checks.sh` — Layer 2 rewrite
- `.claude/commands/slava/maintain/privacy/SKILL.md` — SHA stamp write + watched-path constant
- `.claude/commands/slava/build/finish/SKILL.md` — routing (:55) + Step-3 detection (:77)
- `scripts/git-ops.sh` — `cmd_ship_to_prod` + dispatch + `WATCHED_PATHS` constant
- New: `.claude/commands/slava/build/ship-prod/SKILL.md`
- New: `scripts/test-hook-sha-gate.sh` — AC2-AC7 hermetic tests
- `.gitignore` — stamp path update if needed
- `docs/decisions.md` + `docs/technical/git-workflow.md`
