---
status: all-done
type: task
rank: 26
workstream: infrastructure
created_date: '2026-10-08'
tags: [ship, closure-gate, override]
disclosure: public
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
completed_at: 2026-10-08
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
- Eligible when the spec's frontmatter carries a dated, non-empty `withdrawn:` field or the
  `retracted` tag. `type: comment` alone does NOT qualify (founder decision 2026-10-08, below).
  **The classification must already be on `main` before the close**: a relabel inside the
  closing range (real spec → withdrawn/retracted) refuses.
- No `feature/pN-*` or `fix/pN-*` ref (local or remote) is ahead of main.
- Main's history holds no implementation evidence for pN: no non-revert commit whose subject
  names pN and touches a path outside `features/`, is a merge, or is a `ready for QA` stamp,
  and (locally) no code-review entry naming pN. Applied locally and in CI (CI: git history
  only). This is what separates a real withdrawal from implemented work relabelled in an
  earlier push (review round 1, H1).
- **Decided (founder, 2026-10-08): eligibility is withdrawn/retracted only.** At review, 13 of
  14 open `type: comment` specs would otherwise have been agent-closable. The choice is ONE
  switch, `ADMIN_TYPE_COMMENT_ELIGIBLE=0` in `scripts/lib/admin-close.sh`; setting it to 1
  re-admits `type: comment`. A comment-only spec gets a `[GATE ADMIN] NOT ELIGIBLE` line
  naming the fix (record `withdrawn:` or the `retracted` tag on origin/main first).
- Locally the route also refuses until `origin/main` carries `scripts/lib/admin-close.sh`
  ("ship P1444 first"), because CI judges a close with origin/main's copy.
- The closing commit changes only the spec's own path (move into `features/done/`) and its UAT
  file.
- Gates print `[GATE 2.5] SKIP: administrative closure; no completion asserted` and
  `[GATE 2.7] SKIP: administrative closure; no implementation review required`. The
  `ready for QA` stamp requirement on the no-branch route is skipped for this route only.
- `.github/workflows/closure-gate.yml` re-derives eligibility from the committed blobs of the
  closing commit and its parent. It never trusts a trailer, and uses one event range for both
  closure discovery and commit lookup.
- **Out of scope (decided 2026-10-08):** making no-branch closes move the UAT file with the
  spec. No no-branch close has ever done it (pre-existing since P920, every spec, not only
  administrative ones); a hand-staged UAT move is refused by the exact-paths commit check.

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

**Decided (founder, 2026-10-08): the keychain dialog is accepted as the one-click override
approval**, with the honest label above kept in the code: friction plus a human-presence check,
not shown unforgeable against UI scripting. A server-side approval tied to a founder-only
identity remains the stronger option (Codex) and stays out of scope.

**Decided (delegated by the founder, 2026-10-08): CI keeps accepting a COMPLETE override trailer
set** (`Gate-Override`, `Gate-Override-Reason`, `Gate-Override-Approval`, in a real trailer block)
**as a WARNING, not a pass-through error.** Residual, documented in `closure-gate.yml` and
`gate-override.sh`: whoever writes the commit can write the trailers, so CI records a loud,
permanent claim; it cannot prove the approval happened.

**Then:** close P1274 through the administrative path.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A real spec relabelled `withdrawn:` / `retracted` to skip gates | MITIGATE | Classification must predate the close on main (relabel in range refuses); no implementation evidence for pN in main's history; branch-ahead check. **Residual:** an earlier-push relabel of a spec with NO implementation evidence still closes administratively |
| Work done on a deleted or never-pushed branch | ACCEPT | Unobservable from the repo; the guarantee is scoped to observable evidence and says so |
| Keychain dialog answerable by UI scripting | DEFER | Unverified; labelled honestly; the probe needs the founder present |
| Forged override trailers accepted by CI | ACCEPT | Founder-delegated 2026-10-08: CI requires the complete trailer set in a real trailer block and reports it as a WARNING; whoever writes the commit can forge it. Fix is a server-side approval (Non-Goal) |
| No-branch close leaves the UAT file behind | ACCEPT | Pre-existing since P920 for every no-branch close; out of scope (2026-10-08) |
| "Always Allow" silently disables the approval | MITIGATE | Access list verified before and after the read |
| CI runs `origin/main`'s gates, so a close relying on R1 fails CI until P1444 is on `origin/main` | ACCEPT | Ordering rule from P1309: push P1444 before the P1274 close |

**Non-Goals**
- Do NOT build the server-side founder-identity approval.
- Do NOT change what gates 2.5 / 2.7 require of real specs.
- Do NOT add a test mode or environment variable that skips approval in production.

## Done-When

- [x] A withdrawn or retracted spec with no branch closes through `git-ops.sh ship pN` with both SKIP lines and no founder input; a `type: comment`-only spec refuses (canary) (L1, L1d; real-repo P1274 dry run)
- [x] The same spec with a `feature/pN-*` branch carrying a code commit ahead of main refuses (canary) (L2 local, L2b remote-only, C4 CI)
- [x] A spec relabelled to withdrawn/retracted within the closing range refuses (canary) (L3, L3b, L3c, C2, C9)
- [x] A closing commit touching any path besides the spec and its UAT file refuses (canary) (L4 under the lock, C3, C15)
- [x] A real spec on a red gate refuses without approval, and refuses when approval is declined (canary, keychain read injected only in the test harness that calls the extracted decision function) (R1, D2, E2)
- [x] A defeated or indeterminate access list on the approval item refuses (canary) (D3–D6, E3, E4)
- [x] The refusal text no longer says "run this in your Terminal"; it names the one-click approval (R1, test-pipeline-gates B2)
- [x] `closure-gate.yml` re-derives the administrative close from committed blobs (local run of its logic against a fixture commit pasted) (C0–C15 run the workflow's own run: blocks; C1 log in the suite output)
- [x] P1274 qualifies for the administrative path. Pre-ship evidence (2026-10-08, real repo, `bash scripts/ship-gates.sh p1274`): `[GATE ADMIN] NOT ELIGIBLE: origin/main does not carry scripts/lib/admin-close.sh yet — ship P1444 first ...; every other condition passed`. The ordering check runs last, so every other condition passed against the real history, refs and review log. `[post-ship]` once P1444 is on origin/main: close P1274 with `./scripts/git-ops.sh ship p1274`, then re-check that CI passes on the pushed close.

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
