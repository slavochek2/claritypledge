---
status: qa
type: task
rank: 103
workstream: keyring
created_date: '2026-09-15'
tags: [security, credentials, keyring, recovery]
disclosure: public
related: [p1318, p1316, p1239, p1148]
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1322: Harden the locked path — recovery escrow, an Always-Allow check, and the plaintext copies outside the env files — before P1318 removes anything

## Problem

**Situation:** P1316 moved every consumer of the prod master key onto the per-access lock and gave the
retirement candidates a verdict. P1318 carries the last step: remove the plaintext copies of the
critical credentials after a measured week.

**Complication:** An adversarial review of P1318 (2026-09-15, all findings re-verified by command) found
that the removal, as planned, is not safe to do and does not deliver what it claims — and that the
genuinely urgent work has no dependency on the week-long gate and is being held behind it:

- **No recovery after removal.** The only recovery path re-reads the plaintext file P1318 deletes
  (`scripts/keyring.sh:165`; `scripts/migrate.sh:397-398` still instructs re-enroll from `.env.prod`).
  A keychain loss or a new laptop then means locked out of prod.
- **The lock can be silently disabled.** "Always Allow" removes a key's dialog forever; neither
  `/weekly` nor `/day-cp` runs `keyring.sh verify` (grep: 0 hits), so nobody would notice.
- **Copies exist off the env files.** ~115 saved session transcripts hold a real-looking value next to
  a locked key name (measured, names/counts only, control = 0); both env files are mode 644; restic
  snapshots include them; the cloud VM symlinks a `.env.local`; CI holds a DB string and the now-unused
  master key. Removing two files does not make "the critical half unreadable on disk".
- **Four unused credentials still authenticate** (P1316 probes, wrong-credential controls refused), and
  a CI master key nothing references is still live. None has a consumer, so no measurement can justify
  waiting to revoke them.

**Question:** What must be true — recovery, monitoring, and a reckoning with the off-file copies —
before P1318 is allowed to delete anything, and what can be revoked now without waiting?

> Founder framing, verbatim (2026-09-15): *"ok lets do it then ... but what you mean by later? why not all in one go?"* — this spec is the "now" half: everything that does not depend on the measured week, split out so it is not held behind it.

## Appetite

Blast radius: high (prod access recovery; live credentials). Reversibility: the escrow and monitoring
are reversible; a wrong revocation is not, which is why the four unused ones are probed-and-controlled
first and the founder executes each. Decision density: a few — which off-file copies to purge vs
accept, and confirmation on each revocation.

## Invariants

- **No step here removes a plaintext copy from the env files** — that is P1318, and it stays gated on
  this spec's escrow plus its own measured week.
- **The recovery drill must be proven to restore AFTER a simulated plaintext loss**, on a keychain that
  does not already hold the item — a drill that reads the plaintext proves nothing about life without it.
  *Waived by the founder on 2026-09-21 in favour of a password-manager copy; see Done-When 1.*
- **Revocation is the founder's action at the provider** (a security-setting change the agent does not
  perform); the agent probes, enumerates dependents, and prepares exact steps.
- **Never print a credential value** — every check here is names, counts, status codes, fingerprints.

## Solution

1. **Recovery escrow.** Establish an offline, encrypted export of the locked set the founder controls
   (not on the plaintext path), and a drill that restores it onto a clean keychain. Fix
   `migrate.sh:397-398` and `keyring.sh enroll` guidance to name the escrow, not `.env.prod`, as the
   post-removal source. Block P1318's removal until this exists and the drill has passed.
2. **Always-Allow monitoring.** Wire `./scripts/keyring.sh verify` into `/weekly` (report-only), so a
   defeated gate surfaces within the week rather than never.
3. **Off-file copy reckoning.** Enumerate every plaintext copy outside the env files — transcripts,
   restic snapshots, the cloud VM's linked file, CI secrets, the second local store (P1316 Open Q3) —
   and for each record *purge* or *accept, with reason*. Transcript redaction is a founder call on his
   own files; propose a names-only redaction pass.
4. **Revocation queue, unblocked.** Hand the four unused-but-live credentials and the unreferenced CI
   master key to P1148 as an active queue (promote P1148 off backlog for these five, or record the
   probes as the accepted compensating control with an end date — not both). The founder executes each
   revocation from prepared steps after a dependents check; nothing here revokes automatically.
5. **Prediction refresh.** Re-derive the ~4/week prompt prediction for the *current* locked set (14
   names, not the 5 categories measured 2026-09-03) so P1318's stop-threshold means something.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Revoking a credential breaks a rare consumer | MITIGATE | Grep dependents before each; founder confirms; probes showed no consumer |
| The escrow itself becomes a new plaintext exposure | MITIGATE | Encrypted, offline, founder-controlled; never on the repo or backup path |
| Transcript redaction corrupts session history | ACCEPT | Names-only redaction on copies; founder approves the pass |
| FTP/hosting login still used for a deploy | MITIGATE | Confirm with founder before that one is rotated |

**Non-Goals**
- Do NOT remove any plaintext copy from `.env.local`/`.env.prod` — that is P1318.
- Do NOT revoke, rotate or delete any credential at a provider automatically — prepare steps; the founder acts.
- Do NOT change which credentials are in the locked half.

## Done-When

- [x] A recovery escrow exists off the plaintext path, and a restore drill has passed on a keychain that
      did not already hold the item — evidence: the drill's own output, values redacted
      — **Met by founder decision, 2026-09-21, with the drill waived — recorded as a trade, not a
      proof.** The founder holds both env files, copied in full, in their password manager, which is
      encrypted, synced off this Mac and reachable from their phone. Which manager is named in the private
      record. The founder declined verification ("all in [the password manager], no need to verify"). The agent's
      fingerprint comparison was withdrawn at the founder's question: the manager's CLI, once unlocked, exposes
      the whole vault to every process running as the founder, agents included. Measured names-only before
      closing: 12 of the 14 locked names come from `.env.local` and 2 only from `.env.prod`, under
      different variable names, so both files had to be in the copy. The founder confirmed both are.
      **What this does not prove:** that every value matches the keychain byte for byte. The
      residual risk is a stale or mistyped entry found on the day it is needed. Keeping it current is
      now a rotation step (`credential-keyring.md` § Recovery). The encrypted-image tool below stays
      as an optional second copy, not the gate.
      — *2026-09-15, tooling built, real run pending the founder:* `scripts/keyring-escrow.sh`
      (export / drill / restore) writes an AES-256 disk image whose passphrase macOS asks for in its
      own dialog, and refuses paths inside a checkout or under `$HOME`. `drill` runs under a sandbox
      that denies reads of the env files and confirms the denial from inside, restores into items
      confirmed absent first, checks every gate, reads one back, and cleans up.
      `scripts/test-keyring-escrow.sh` passes 37/37 with known-bad controls, including: the value is
      absent from the encrypted image's bytes, and the same grep finds it in an unencrypted image; a
      drill run outside the sandbox refuses (exit 2); an incomplete escrow fails (exit 2).
      Never run for real: it needs removable media the founder does not have. Kept as the optional
      second copy.
- [x] `migrate.sh` and the `keyring.sh enroll` guidance name the escrow, not `.env.prod`, as the
      post-removal recovery source
      — *2026-09-15:* the `migrate.sh` prod-token error now points a lost item to
      `keyring-escrow.sh restore` and a rotation to P1148; it no longer names `.env.prod`. The
      `keyring.sh` header, enroll trailer and fail-closed message name the escrow, and
      `credential-keyring.md` § Recovery orders the two sources.
- [x] `/weekly` runs `keyring.sh verify` and reports its result; a simulated defeated gate is shown to surface
      — *2026-09-15:* step 2.10.3, report-only. The exact block, run against controls:
      known-good `defeated=0 exit=0` · simulated Always Allow (trusted-app item)
      `defeated=1 exit=2` · unenrolled `missing=1 exit=1` · unreadable registry
      `missing=0 exit=1`. That last one is indistinguishable by exit code alone, so the step reads
      the count too. On the real registry: `intact=14 exit=0`.
- [x] Every plaintext copy outside the env files (transcripts, restic, cloud VM, CI, second store) is
      listed with a *purge* or *accept-with-reason* verdict; the transcript pass is run or explicitly declined
      — *2026-09-15:* all listed with a proposed verdict in the private record
      `p1322-locked-path-hardening.md` §1, all measured names-only with controls. Transcripts: 349
      files hold a locked name next to a value-shaped string. Restic: included by construction.
      Cloud VM: no locked name. CI: one accept, one purge. Second store: accepted here.
      **Transcript pass run 2026-09-17** (founder approved): 1,050 occurrences across 236 files
      replaced with a placeholder; re-scan returns 0; every redacted file still parses as JSON line
      for line; the working backups were deleted after verification rather than left as a fresh
      plaintext copy. **Env file modes fixed the same day:** both are now owner-only, and the
      keyring selftest that had failed on this passes (35/35).
      Closed with Done-When 1 on 2026-09-21: the second store and the password-manager copy are
      both accepted as founder-held.
- [x] The four unused-but-live credentials and the CI master key each carry a prepared revocation step and
      a dependents check, and sit in an active P1148 queue (P1148 promoted, or the compensating-control
      window given an end date)
      — *2026-09-15:* private record §2. The dependents check covered cp, the global tooling, pp,
      the site repo and the shell rc files, with controls outside cp (known-present names found; an
      invented name returned 0). P1148 records the queue on the compensating-control branch, window
      ending 2026-09-29, and stays `backlog`.
- [x] The ~4/week prediction is re-derived for the current 14-name locked set
      — *2026-09-15:* 78 prod runs of locked-read consumers in 30 days (executed-only count over
      transcripts; invented-command control 0). That is **~18/week mean, ~6/week floor with
      same-day runs consolidated, ~28 in the peak week**, against ~4 predicted and P1318's ~10
      stop-number. The driver is repeated prod `migrate` runs within a session. Private record §3.
- [x] P1318's removal is recorded as blocked until this spec's escrow + drill Done-When holds
      — *2026-09-15:* P1318 carries `blocked_by: p1322`, a Precondition naming the escrow and drill,
      and a first Done-When that holds step 4 until they pass.
- [x] Nothing was revoked or removed by this spec directly
      — *2026-09-15:* no provider action taken, no env line removed, and the keychain items are
      untouched (only throwaway test and drill items, created and deleted).

## Related

- [P1318](p1318_remove_plaintext_copies_of_the_critical_credential_half.md) — the removal this gates; its safety and scope holes are why this exists
- [P1316](done/2026-06-10/p1316_finish_moving_remaining_master_key_consumers.md) — the consumer migration and the liveness probes
- [P1239](done/2026-06-10/p1239_encrypt_the_critical_credential_half_with_per_access_unlock.md) — the per-access lock
- [P1148](p1148_credential_rotation_system.md) — rotation and revocation execution
