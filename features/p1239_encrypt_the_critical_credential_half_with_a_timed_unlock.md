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

# P1239: Split `.env.local`, encrypt the catastrophic half, unlock it for a window

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

**Question:** Which keys go behind the lock, how long does an unlock last, and what reads them?

## Appetite

**Blast radius: high** — a bug that loses the encrypted half loses production access. **Reversibility:
high while both copies exist, low after the plaintext is removed.** **Decision density: one** — the
window length.

## Invariants

- **Never remove the plaintext copy until the encrypted path has served every consumer at least
  once.** Both copies coexist through a full cycle (a `/day-cp` run, a `/weekly` run, one deploy).
- **Fail closed and loud.** A consumer that cannot decrypt must stop with a message naming the
  unlock command — never fall back to a plaintext copy, and never proceed with an empty value.
- **An unlock gates a STATE, not an action** — this is the load-bearing difference from
  `push-on`, which the founder's framing reasonably assumed was equivalent. `push-on` authorises
  one discrete, observable act. An unlock makes secrets readable to **everything** running for the
  whole window, with no record of what read them. The window is therefore the security parameter,
  and it must be short by default and visible while open.

## Solution

Split `.env.local` into a routine half (stays plaintext) and a critical half (encrypted at rest),
decrypted into the environment for a bounded window by an explicit command.

**Classification is coarse and comes first** — it does not wait on P1214's 28 retirement verdicts.
The test is "would losing this be unrecoverable or expensive?", not a full inventory.

**Mechanism is an open question** (below). Whatever is chosen must not put the passphrase or the
decrypted values through a tool call or the shell history — [P1148](p1148_credential_rotation_system.md)
item 15 records that a value passing through a tool call lands in the session transcript.

**Window default: 30 minutes.** One-time-per-access was the founder's first instinct and is
rejected in the Alternatives below.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| An injected agent reads the secrets during an open window | ACCEPT | Unavoidable by construction — the window exists so work can happen. Bounded by keeping it short; NOT closed. This is the honest limit of the whole approach and must not be described as solved |
| The founder unlocks and forgets, leaving a long window open | MITIGATE | Expiry enforced by the CONSUMER at read time, never by a cleanup job — a revocation that must survive to fire fails open. Precedent: `push-on`'s expiry job died with its terminal and a "30-minute" flag was still granting access 3h23m later |
| A consumer silently gets an empty value and writes bad data | MITIGATE | Fail closed and loud, per Invariants; exercise the failure path and observe a non-zero exit before shipping (epistemic gate 7) |
| Losing the passphrase locks the founder out of production | MITIGATE | Both copies coexist through a full cycle; the recovery path is written down and tested BEFORE the plaintext is removed |
| Encrypting keys that P1214 later retires | ACCEPT | Cheap and self-correcting — a retired key simply leaves the encrypted half later |

**Non-Goals**
- Do NOT adopt a password manager CLI as the mechanism on the assumption it solves this. Any
  secret an agent can obtain by running a command, an injected agent obtains the same way; a
  manager fixes secrets-at-rest, which is the same thing this spec fixes, not the shell problem.
- Do NOT encrypt the routine half. Friction spent on low-value keys is what gets the whole thing
  switched off.
- Do NOT change which credential any consumer uses — that is P1214.

## Done-When

- [ ] The critical half is unreadable on disk without the passphrase, verified by reading the file
- [ ] With the vault locked, a consumer needing a critical key stops with a message naming the
      unlock command — observed, exit code non-zero
- [ ] After the window expires, the same consumer fails again without any new action taken
- [ ] `/day-cp` and one deploy complete on the encrypted path while the plaintext copy still exists
- [ ] The recovery path is documented and has been executed once, before any plaintext is removed
- [ ] No passphrase or decrypted value appears in shell history, the session transcript, or `ps`

## Alternatives Considered

- **One-time unlock per access (founder's first instinct).** Rejected: it would be abandoned within
  a week and replaced by a long window or switched off entirely. A control that is not used is
  worth less than a shorter one that is. Design for a busy Tuesday.
- **Encrypt the whole file.** Rejected: maximises friction, and the routine half is most of the
  keys and almost none of the risk.
- **Do nothing; rely on P1214 retirement.** Rejected in the Problem — retirement cannot reach the
  44 keys that stay, including the master key eleven consumers still write with.

## Open Questions

1. **Mechanism.** Not assessed: `age`/`gpg` with a passphrase-derived key, the macOS Keychain with
   a Touch ID prompt, or an encrypted disk image. The Keychain option is the only one that can
   avoid a typed passphrase entirely, which would remove the transcript risk — worth checking first.
2. **What counts as critical.** Proposed starting set: the prod database key, mail-sending, blog
   admin, the ops mailbox password, and the social-publishing tokens. Needs a founder pass.
3. Does the window need to be visible while open (a prompt indicator), and is that worth building?

## Related

- **Peer:** [P1214](p1214_credential_separation_and_privilege_reduction.md) — shrinks what ends up
  inside the vault. Independent: this spec does not wait on its verdicts.
- **Peer:** [P1148](p1148_credential_rotation_system.md) — owns rotation and revocation. Its own
  "vault" is a short-lived ROLLBACK escrow during a swap, a different mechanism from this one;
  the names collide and should not be conflated.
