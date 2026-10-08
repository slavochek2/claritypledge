---
status: week
type: task
rank: 26
workstream: infrastructure
created_date: '2026-10-08'
tags: [ship, closure-gate, override]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1444: Closure gate — withdrawn and comment specs close on their own; real overrides are one click

## Problem

> Founder framing, verbatim (2026-10-08): "Fix the closure gate: withdrawn or comment specs like P1274 close without the founder; real overrides use a one-click approval instead of 'run this in your Terminal'. Then close P1274."

**Situation:** `git-ops.sh ship pN` runs `scripts/ship-gates.sh` before any close (P1246). Gate 2.5
needs a ticked completion section plus a `dev`/`fix` run; gate 2.7 needs a code-review stamp naming
pN. A red gate can be passed only by `--override`, which prompts on `/dev/tty`
(`scripts/lib/gate-override.sh`), so the founder has to open a terminal and type a reason.

**Complication:** A spec that was withdrawn or is a `type: comment` note has no implementation to
gate, so it can never pass 2.5 or 2.7. Verified 2026-10-08: `bash scripts/ship-gates.sh p1274`
(a retracted comment spec, `status: all-done`, still in `features/`) fails 2.5 "no completion
section" and 2.7 "no review entry". Every such close becomes a founder terminal session. And the
terminal prompt does not prove a human anyway: a pty wrapper answers it (decisions.md 2026-09-08,
P1246).

**Question:** How does a spec with nothing to gate close without the founder, without opening a
way for real work to skip its gates, and what replaces the terminal prompt for real overrides?

## Appetite

Blast radius: medium. Every close goes through this path, and a loose exemption would let
unreviewed code close. Reversibility: high (git revert of scripts). Decision density: one founder
call (the override primitive's assurance level, below).

## Invariants

- The gate fails closed: an unreadable spec, a missing script, an unresolvable branch or an
  indeterminate approval all refuse (P1246).
- A test never uses the bypass as its stand-in for a human (decisions.md 2026-09-08).
- Never claim the approval is unforgeable unless it has been shown to be (decisions.md 2026-09-08).

## Solution

Technical design by Codex (2026-10-08), as the founder directed.

**R1 — administrative closure (no founder).**
- Eligible when the spec's frontmatter says `type: comment`, or carries a dated, non-empty
  `withdrawn:` field, or the legacy `retracted` tag. **The classification must already be on
  `main` before the close**: a relabel inside the closing range (real spec → comment/withdrawn)
  refuses.
- No `feature/pN-*` or `fix/pN-*` ref (local or remote) is ahead of main.
- The closing commit changes only the spec's own path (move into `features/done/`) and its UAT
  file.
- Gates print `[GATE 2.5] SKIP: administrative closure; no completion asserted` and
  `[GATE 2.7] SKIP: administrative closure; no implementation review required`. The
  `ready for QA` stamp requirement on the no-branch route is skipped for this route only.
- `.github/workflows/closure-gate.yml` re-derives eligibility from the committed blobs of the
  closing commit and its parent. It never trusts a trailer, and uses one event range for both
  closure discovery and commit lookup.

**R2 — one-click override for a real red gate.**
- `--override --reason "<text>"` asks for approval through a dedicated macOS keychain approval
  item. The founder enrols it once; it trusts no application. Reading it raises the system
  keychain dialog: **Allow** approves, **Deny** refuses.
- The request is announced first (notification, stderr line, request log, as `keyring.sh`
  already does) and names the spec and the reason.
- The item's access list is verified before **and** after the read. A defeated
  ("Always Allow"), missing or indeterminate access list refuses.
- The closure commit records `Gate-Override:` plus `Gate-Override-Reason:` and
  `Gate-Override-Approval: keychain dialog`.
- `/dev/tty` stops being an independent authorization path.
- **Honest label:** this is friction plus a human-presence check. Nobody has shown that the
  system dialog cannot be answered by UI scripting on this machine (Codex: not verified), and
  the code says so.

[FOUNDER DECISION: is a keychain dialog an acceptable override until something stronger exists?
Codex recommends a server-side approval tied to a founder-only identity the agents cannot use. On a
single machine where `gh` is logged in as the founder, that identity does not exist yet. A probe
that tries to answer the dialog by script would settle the question, and it needs you present.]

**Then:** close P1274 through the administrative path.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A real spec relabelled `type: comment` to skip gates | MITIGATE | Classification must predate the close on main; relabel in range refuses; branch-ahead check |
| Work done on a deleted or never-pushed branch | ACCEPT | Unobservable from the repo; the guarantee is scoped to observable evidence and says so |
| Keychain dialog answerable by UI scripting | DEFER | Unverified; labelled honestly; the probe needs the founder present |
| "Always Allow" silently disables the approval | MITIGATE | Access list verified before and after the read |
| CI runs `origin/main`'s gates, so a close relying on R1 fails CI until P1444 is on `origin/main` | ACCEPT | Ordering rule from P1309: push P1444 before the P1274 close |

**Non-Goals**
- Do NOT build the server-side founder-identity approval.
- Do NOT change what gates 2.5 / 2.7 require of real specs.
- Do NOT add a test mode or environment variable that skips approval in production.

## Done-When

- [ ] A `type: comment` spec with no branch closes through `git-ops.sh ship pN` with both SKIP lines and no founder input (canary)
- [ ] The same spec with a `feature/pN-*` branch carrying a code commit ahead of main refuses (canary)
- [ ] A spec relabelled to `type: comment` within the closing range refuses (canary)
- [ ] A closing commit touching any path besides the spec and its UAT file refuses (canary)
- [ ] A real spec on a red gate refuses without approval, and refuses when approval is declined (canary, keychain read injected only in the test harness that calls the extracted decision function)
- [ ] A defeated or indeterminate access list on the approval item refuses (canary)
- [ ] The refusal text no longer says "run this in your Terminal"; it names the one-click approval
- [ ] `closure-gate.yml` re-derives the administrative close from committed blobs (local run of its logic against a fixture commit pasted)
- [ ] P1274 closed through the administrative path. `[post-ship]` re-check that CI passes on the pushed close.

## Alternatives Considered

- **Keep the `/dev/tty` prompt as a second path:** rejected. A pty wrapper already defeats it.
- **An osascript dialog:** rejected. Scripts can click it.
- **Touch ID through a Swift helper:** stronger against synthetic clicks, but an editable helper's success is still forgeable. Not available without new tooling.
- **Exempt every `type: comment` spec by label alone:** rejected. Relabelling would skip gates.

## Rollback Strategy

Revert the `scripts/` and workflow commit. Specs already closed administratively stay closed: the
close moved a file and changed no code.

## Related

- P1246 (closure gate, override), P1309 (absorbed specs), P1239 / `scripts/keyring.sh` (per-access dialog)
- P1274 (the spec to close)
