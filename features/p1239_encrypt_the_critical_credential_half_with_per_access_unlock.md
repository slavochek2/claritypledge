---
status: week
type: task
rank: 1000068
workstream: keyring
created_date: '2026-09-03'
tags: [security, credentials, encryption]
related: [p1214, p1148]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1239: Split `.env.local`, lock the critical half behind a per-access confirmation

> **Revised 2026-09-03 after measurement.** The first draft proposed a 30-minute unlock window,
> rejecting per-access confirmation on the grounds that it *"would be abandoned within a week...
> design for a busy Tuesday."* That premise was never measured, and it is **false for this
> machine**: critical-credential access runs at ~4 events/week across 9 of the last 30 days. There
> is no busy Tuesday. The window bought nothing it needed to buy and cost the one property the
> spec itself named as the honest limit of the approach. **The window is removed.** Evidence in
> Measured Baseline; the superseded reasoning is preserved in Alternatives.

## Problem

**Situation:** `.env.local` holds 72 keys in plaintext, readable by any process running as the
founder. Among them are credentials whose loss is not recoverable by rotation alone — the prod
database key, the mail-sending key, the blog admin key, the ops mailbox password.

**Complication:** [P1214](p1214_credential_separation_and_privilege_reduction.md)'s adversarial
review established that the master database key **must remain on disk** — eleven consumers write
with it, and only the *last* consumer's migration would let it be removed. So retirement (P1214
Phase 3) removes 28 of 72 keys and leaves the remaining 44 permanently readable. Against the
stated adversary — an injected agent with shell — nothing else on the roadmap reduces exposure for
the keys that stay.

> Founder framing, verbatim: *"we can split the file and encrypt the one that is critical - and
> each time i would have to type alias and password to unlock it for an agent 1 time access? or
> unlock for say 10 min or 30 min .. so either one time by default or time similar like push-on"*

**The first instinct was right.** "One time by default" is what this spec now builds. The
`push-on`-style time window is what it rejects — see Alternatives.

**Question:** Which keys go behind the lock, and what does a consumer do when it hits one?

## Measured Baseline (2026-09-03)

Measured from 30 days of session transcripts by matching structured tool-call records, not skill
names — a first pass matching names returned false ~28/30-day counts, because the skill catalogue
appears in every session's system-reminder. A control probe (a skill known to have run) returned a
non-zero count through the same matcher that returned zero for the blog and social keys, so the
zeroes are measured absences, not a broken search.

| Credential | Consumers | Events / 30d | Attended? |
|---|---|---|---|
| `PROD_SUPABASE_SERVICE_ROLE_KEY` | ~15 scripts + ~20 skills; concentrated in `/day-cp`, `/weekly`, `promote-*` | **14 across 9 days** | attended |
| `OPS_EMAIL_PASSWORD` | `scripts/read-ops-email.mjs`, and inside `/weekly` | **4** (3 ride inside `/weekly`) | attended |
| `MAILGUN_API_KEY` | 3 edge functions (deployed secret, **not** read from `.env.local`); `scripts/resend-feedback.sh` manual | **1 manual** | manual attended |
| `GHOST_ADMIN_API_KEY` | 6 content skills | **0** | — |
| `POSTIZ_API_TOKEN` / `POSTIZ_PASSWORD` | 3 skills | **0** | — |
| `SUPABASE_DB_URL` | `.github/workflows/db-backup.yml`, `cron: '0 3 * * *'` | **daily** | **UNATTENDED** |

**Distinct days with any founder-triggered critical touch: 9 of 30.**
**Per-access model: ~4 confirmations/week. 30-minute-window model: ~2/week.** The window's entire
purchase is **two fewer prompts per week**, in exchange for the exposure described in Invariants.

**Independently re-derived** (epistemic gate 9): a second count over a wider transcript set (1712
files including worktrees, vs 659) returned 8 distinct days for prod-key-consuming skills — same
order, same conclusion.

### The unattended consumer, and what it does and does not mean

`db-backup.yml` reads a prod-DB-tier credential nightly with no human present. It reads it from
**GitHub's** secret store, not from `.env.local` — verified by reading the workflow. So locking the
local file **does not break the nightly backup**, and no exemption is needed.

It does mean the prod database connection string exists in a second place this spec does not
reach. That is a different attack surface (GitHub account compromise, not local shell injection)
and is **out of scope here** — filed as a note for P1214, not solved by any version of P1239.
Do not describe this spec as removing standing prod-DB access; it removes the *local* copy's
standing readability only.

No other workflow references a critical-tier key (all 12 checked). `crontab -l` is empty; the one
launchd job belongs to a different repo.

## Appetite

**Blast radius: high** — a bug that loses the encrypted half loses production access. **Reversibility:
high while both copies exist, low after the plaintext is removed.** **Decision density: zero** — the
window was the only open decision and the measurement closed it.

## Invariants

- **Never remove the plaintext copy until the encrypted path has served every consumer at least
  once.** Both copies coexist through a full cycle (a `/day-cp` run, a `/weekly` run, one deploy).
- **Fail closed and loud.** A consumer that cannot decrypt must stop with a message naming what to
  do — never fall back to a plaintext copy, and never proceed with an empty value.
- **The unlock gates an ACCESS, not a state.** This is the load-bearing correction to the first
  draft. A time window makes secrets readable to **everything** running for its whole duration,
  with no record of what read them; a per-access confirmation makes exactly one read possible and
  requires a human at the keyboard to permit it. The first draft named this as the honest,
  unavoidable limit of the approach. It is neither unavoidable nor, at 4 events/week, expensive
  to remove.
- **No grant may be satisfiable by a file an agent can create.** Precedent, in the founder's own
  words, from pp's `pre-push` hook: *"a flag can't prove a human is at the keyboard right now."*

## Solution

Split `.env.local` into a routine half (stays plaintext) and a critical half (locked at rest).
A consumer that needs a critical key triggers a confirmation the founder answers **at the moment
of the read**. There is no window, no expiry to enforce, and no unlock command to remember.

**Critical set — all five categories, including the two that measured zero.** Ghost admin and the
Postiz tokens cost nothing to gate this month, so gating them is free insurance rather than a
judgment call. `SUPABASE_DB_URL` is included for the local copy; the GitHub copy is out of scope
per above.

**Classification is coarse and comes first** — it does not wait on P1214's 28 retirement verdicts.
The test is "would losing this be unrecoverable or expensive?", not a full inventory.

**Mechanism — measured on this machine 2026-09-03, not assumed:**

| Candidate | Verdict | Evidence |
|---|---|---|
| Plain macOS Keychain (`security add/find-generic-password`) | **Rejected — zero protection** | Stored a value and read it back with **no challenge at all**. An agent with a shell does the same. |
| Keychain item with **no trusted applications** (`-T ""`) | **Selected** | The read blocked and produced a system authorisation dialog — observed live by the founder. This is the per-access human-presence gate. |
| Biometric / Secure Enclave ACL (`.biometryCurrentSet`) | **Blocked, not chosen** | `errSecMissingEntitlement` (-34018) under both unsigned and ad-hoc-signed builds; `security find-identity -v` reports **0 valid identities**. Needs an Apple Developer Program membership ($99/yr) first. |
| `age` / `sops` | Not installed | `which age sops` → not found. `gpg` present. |

**Do not buy the Apple Developer membership for this.** At ~4 confirmations/week a fingerprint
saves ~4 seconds/week. Revisit only if the measured count triples.

Whatever is implemented must not put a passphrase or a decrypted value through a tool call or the
shell history — [P1148](p1148_credential_rotation_system.md) item 15 records that a value passing
through a tool call lands in the session transcript. **The selected mechanism satisfies this by
construction**: the founder answers an OS dialog; nothing is typed into the terminal.

## Integration with the existing grant vocabulary

The founder's framing anticipated this would work "similar like `push-on`". It should **not**, and
the machine already contains both patterns:

| Existing control | Shape | What it proves |
|---|---|---|
| `push-on` / `~/.push-enabled` (`~/.zshrc`) | **time-windowed flag file**, 30 min default, 120 min ceiling | that the founder authorised pushing *at some point in the last N minutes* |
| pp's `.git/hooks/pre-push` | **real `/dev/tty` read**, no flag can satisfy it | that a human is at the keyboard *right now* |

**P1239 belongs to the second family, and the founder already wrote down why** — the `pre-push`
hook's own comment: *"a flag can't prove a human is at the keyboard right now."* The `push-on`
family has additionally already failed open in production: a "30-minute" flag was still granting
access **3h23m** later because its cleanup job died with its terminal (2026-08-05).

**They do not chain, and must not be merged.** `push-on` answers *"may the agent push to git?"* —
a session-level intent. This answers *"may this program read the master key, now?"* — a
moment-level act. Merging them would drag credential reads back under a time-windowed flag, which
is the exact failure mode above. In a `/weekly` run the founder may answer both: one `push-on` at
the start, one OS dialog when the prod key is read. Roughly one of each per week.

**The best integration is that this adds no vocabulary at all.** Under the selected mechanism there
is no alias to type and no state to remember — the dialog appears when a key is read and does not
otherwise exist. `push-status` has no counterpart to build because there is no status to hold.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The founder clicks **"Always Allow"** on the dialog and permanently defeats the gate | **MITIGATE — new, and now the top risk** | Replaces the first draft's open-window risk. The control silently becomes a no-op with no error and no visible change. Must be verified after implementation by re-reading and confirming the dialog still fires, and the failure must be detectable (see Done-When) |
| An injected agent reads a secret while a legitimate read is being approved | ACCEPT | Bounded to a single read the founder initiated, not a window. Not zero — an agent racing the same second could benefit — but no longer a standing invitation |
| A consumer silently gets an empty value and writes bad data | MITIGATE | Fail closed and loud, per Invariants; exercise the failure path and observe a non-zero exit before shipping (epistemic gate 7) |
| Losing access to the locked half locks the founder out of production | MITIGATE | Both copies coexist through a full cycle; the recovery path is written down and tested BEFORE the plaintext is removed |
| Confirmation fatigue if the real count is higher than measured | MITIGATE | Re-measure after one `/weekly` + one `/day-cp` cycle on the locked path. If actual prompts exceed ~10/week, revisit — that is the number at which the rejected window earns reconsideration |
| Encrypting keys that P1214 later retires | ACCEPT | Cheap and self-correcting — a retired key simply leaves the critical half later |

**Non-Goals**
- Do NOT adopt a time-windowed unlock, a `vault-on` alias, or any grant an agent could forge. See
  Integration.
- Do NOT encrypt the routine half. Friction spent on low-value keys is what gets the whole thing
  switched off.
- Do NOT change which credential any consumer uses — that is P1214.
- Do NOT solve the GitHub-side copy of `SUPABASE_DB_URL` here — see Measured Baseline.
- ~~Do NOT adopt a password manager CLI on the assumption it solves this.~~ **Narrowed 2026-09-03.**
  The original wording — *"any secret an agent can obtain by running a command, an injected agent
  obtains the same way"* — is correct for an **already-unlocked** manager and wrong for any
  mechanism that demands human presence per access. As written it ruled out the very shape this
  spec now adopts. Corrected form: **do not adopt any credential store whose secrets can be read
  by a command without a human answering a prompt.** An always-unlocked manager, and the plain
  macOS Keychain, both fail that test.

## Done-When

- [ ] The critical half is unreadable on disk without a confirmation, verified by reading the file
- [ ] A consumer needing a critical key produces a confirmation prompt; **declining it** makes the
      consumer stop with a non-zero exit and a message naming what happened — observed, exit code
      pasted (epistemic gate 7)
- [ ] A second read of the same key produces a **second** prompt — verifying no implicit window and
      no "Always Allow" was recorded
- [ ] The "Always Allow" failure mode is either impossible or detectable: document what the founder
      must not click, and provide a one-command check that reports whether the gate still fires
- [ ] `/day-cp` and one deploy complete on the locked path while the plaintext copy still exists
- [ ] The recovery path is documented and has been executed once, before any plaintext is removed
- [ ] No passphrase or decrypted value appears in shell history, the session transcript, or `ps`
- [ ] Prompt count over one full `/weekly` + `/day-cp` cycle is recorded and compared to the ~4/week
      prediction — if it exceeds ~10/week, stop and revisit before removing any plaintext

## Alternatives Considered

- **A 30-minute unlock window (this spec's own first draft).** **Rejected on measurement.** It buys
  two fewer prompts per week and costs the property that makes the control worth having: for its
  whole duration every process can read every critical secret, unrecorded. Its stated justification
  — that per-access confirmation *"would be abandoned within a week"* — assumed a workload that
  does not exist here (~4 events/week, 9 days in 30). Kept in the record because the reasoning was
  sound and the premise was simply never checked; that is the reusable lesson.
- **One-time unlock per access.** **Adopted** — this was the founder's first instinct.
- **Encrypt the whole file.** Rejected: maximises friction, and the routine half is most of the
  keys and almost none of the risk.
- **Buy the Apple Developer membership for a Touch ID gate.** Rejected for now: $99/yr to save
  roughly four seconds a week. The dialog is the same security; only the input method differs.
- **Do nothing; rely on P1214 retirement.** Rejected in the Problem — retirement cannot reach the
  44 keys that stay, including the master key eleven consumers still write with.

## Open Questions

1. ~~**Mechanism.**~~ **CLOSED 2026-09-03** by direct measurement — see the Solution table. The
   first draft's guess that the Keychain option was *"the only one that can avoid a typed
   passphrase... worth checking first"* was half right: checking it first was correct, and the
   biometric variant it had in mind is paywalled while a better-than-expected non-biometric variant
   works today.
2. **What counts as critical.** Resolved to all five proposed categories plus the local
   `SUPABASE_DB_URL` — the two zero-use categories are free to include. **Still needs a founder
   pass** against the full 72-key name list for anything the proposed set missed.
3. ~~**Does the window need to be visible while open?**~~ **CLOSED** — no window, nothing to display.

4. **Which mechanism guards the locked half at READ time — and one that is now ruled out.**
   Measured 2026-09-04, on the machine, during an unrelated incident:

   - **Do NOT use `permissions.deny`.** From Claude Code **v2.1.257** (reached this machine
     2026-09-03), the *existence of any* `permissions.deny` rule makes Claude Code escalate to the
     human on every Bash command whose read target it cannot statically resolve — the everyday
     `cd $X && grep -rn foo src/`. Deny rules bind in every permission mode, so
     `--dangerously-skip-permissions` does not help. Six such rules protecting two files produced a
     day of near-continuous approval prompts across every concurrent session. The prompt says so
     verbatim: *"a Read() deny rule is configured; only you can approve running it anyway."* If this
     spec's locked half is implemented as a deny rule, it reproduces that outage at 30x the file
     count. See pp `docs/decisions.md` 2026-09-04 and `docs/infra/claude-code.md`.

   - **A text-matching PreToolUse hook is necessary but NOT sufficient.** `~/.claude/hooks/block-secret-reads.sh`
     replaced those deny rules and closes the leak they had (a plain `cat` walked around a `Read()`
     rule). But it matches the pre-expansion command string, and three bypasses were reproduced
     against it and cannot be closed by any regex: a path split across the command
     (`cd $HOME/.config && cat restic/*`), variable indirection (`d=denytest; cat /tmp/$d/x`), and a
     pre-existing symlink. The path does not exist as text until the shell expands it. Good against
     accident and honest mistake; not against an instruction-following agent.

   - **`sandbox.filesystem.denyRead` is the only spelling-proof option** — enforced at the syscall
     level, immune to all three bypasses, and it does **not** trigger the v2.1.257 escalation.
     Entries for the mail credentials are already staged in `~/.claude/settings.json` and are inert
     because `sandbox.enabled` is unset.

   **The tension this spec must resolve:** [P1214](p1214_credential_separation_and_privilege_reduction.md)
   Non-Goals rejects sandboxing the interactive session (2026-09-01) on the grounds that it "needs
   the repo, MCP servers and browser, and would still hold the same credentials." That reasoning is
   about *confining the session*; `sandbox.filesystem.denyRead` is a narrower thing — a read block on
   named paths, not confinement — and the second half of the objection ("would still hold the same
   credentials") is exactly what THIS spec removes. Whether the narrow form is in or out of P1214's
   rejection is unresolved and is a founder call, not an implementer's.

5. **A second credential location this spec does not cover.** Scope is `.env.local`, but
   `~/.claude/mcp-*.json` holds four live secrets outside it: two Google OAuth values, a Gmail app
   password, and a Telegram bot token. `TELEGRAM_BOT_TOKEN` exists in **both** files, so one copy is
   already redundant. The founder proposed folding these into `.env.local` on 2026-09-04; that was
   **not** done, because it would move four secrets from a guarded file into the unguarded 78-secret
   one. Open: do these join the critical half, get their own guard, or stay put?

6. **Key-count drift.** This spec says 72 keys; the file held **78** on 2026-09-04. The founder pass
   in question 2 should work from a freshly enumerated list, not the number recorded here.

## Related

- **Peer:** [P1214](p1214_credential_separation_and_privilege_reduction.md) — shrinks what ends up
  inside the locked half, and owns the GitHub-side `SUPABASE_DB_URL` copy this spec cannot reach.
  Independent: this spec does not wait on its verdicts.
- **Peer:** [P1148](p1148_credential_rotation_system.md) — owns rotation and revocation. Its own
  "vault" is a short-lived ROLLBACK escrow during a swap, a different mechanism from this one;
  the names collide and should not be conflated.
- **Precedent, contrasting:** `push-on` / `~/.push-enabled` in `~/.zshrc` and pp's `pre-push` hook
  — the two grant shapes this spec chooses between. See Integration.
