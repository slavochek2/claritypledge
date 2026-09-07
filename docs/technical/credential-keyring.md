# The credential keyring — the locked half of `.env.local`

**Spec:** [P1239](../../features/p1239_encrypt_the_critical_credential_half_with_per_access_unlock.md)

`.env.local` holds every credential this repo uses in plaintext, readable by any
process running as the founder — including an agent with a shell. The keys whose
loss is not recoverable by rotation alone are additionally stored in the macOS
login keychain, in items that trust **no application at all**. macOS therefore
demands a human answer on every read.

There is no unlock command, no alias to remember and no window to display. The
dialog appears when a key is read and does not otherwise exist.

## The grant is per-key and per-access

Each critical key is its own keychain item with its own ACL. A script asking for
`OPS_EMAIL_PASSWORD` raises a dialog naming that key, gets that key, and cannot
read any other. Two reads of the *same* key raise two dialogs. Nothing is ever
unlocked "for a while" and nothing is unlocked as a set.

This is the deliberate difference from `push-on` / `~/.push-enabled`, which is a
time-windowed flag answering *"may the agent push at some point in the next N
minutes?"*. This answers *"may this program read this one key, right now?"*.
They do not chain and must not be merged — see P1239 § Integration.

## Using it

Bash:

```bash
source "$(git rev-parse --show-toplevel)/scripts/keyring.sh"
keyring_require PROD_SUPABASE_SERVICE_ROLE_KEY
# $PROD_SUPABASE_SERVICE_ROLE_KEY is exported — or we already exited non-zero
```

Node:

```js
import { keyringGet } from './lib/keyring.mjs';
const pass = keyringGet('OPS_EMAIL_PASSWORD');   // throws if declined
```

Both fail closed: a declined dialog or an unenrolled key stops the caller with a
non-zero exit and a message naming what to do. Neither falls back to the
plaintext copy, and neither proceeds with an empty value.

## Commands

| Command | What it does | Prompts? |
|---|---|---|
| `./scripts/keyring.sh status` | enrolled / not enrolled, per registered key | no |
| `./scripts/keyring.sh verify` | **is the gate still real?** — see below | no |
| `./scripts/keyring.sh enroll [KEY...]` | copy key(s) from `.env.local` into the keychain | no |
| `./scripts/keyring.sh withdraw KEY` | remove one key from the keychain | no |
| `./scripts/keyring-selftest.sh` | 19 non-interactive checks | no |
| `./scripts/keyring-gate-proof.sh [KEY]` | interactive Allow/Allow/Deny proof | **yes, 3** |

The registered set lives in [`scripts/keyring-critical.txt`](../../scripts/keyring-critical.txt)
— names only; values are never committed.

## Never click "Always Allow"

The authorization dialog offers **Allow**, **Deny** and **Always Allow**.

**"Always Allow" permanently disables the gate for that key.** It adds the calling
binary to the item's trusted-application list, after which that key is read
silently forever. There is no error, no warning, and nothing visibly changes —
the protection simply stops existing. This is P1239's top risk.

It is detectable, and that is what `verify` is for:

```
$ ./scripts/keyring.sh verify
cp.keyring.PROD_SUPABASE_SERVICE_ROLE_KEY    OK gate-intact
cp.keyring.MAILGUN_API_KEY                   DEFEATED trusted_apps=['/usr/bin/security']
FAIL — at least one item has a trusted application: the gate is a NO-OP for it.
```

It judges by comparing each item's ACL structure against a throwaway item created
through the enrollment path itself, so it self-calibrates rather than hard-coding
what a locked item looks like. Two subtleties are worth knowing, because both
produced wrong verdicts before they were understood:

- An **empty** application list means *no* application is trusted, so every read
  needs a human. A **NULL** list means *every* application is trusted — the gate
  is absent. They are opposites, and the second one reports as
  `DEFEATED wide-open ACLs=N`.
- macOS does not return an item's ACLs in a stable order, so the comparison is on
  an order-independent multiset. A verdict that flickers between runs is a bug,
  not noise — `keyring-selftest.sh` asserts stability over 8 consecutive runs.

`verify` reads each item's ACL without decrypting it, so it never prompts and can
be run any time. Exit codes: `0` all intact · `1` something not enrolled ·
`2` at least one gate defeated.

**Repair:** `./scripts/keyring.sh enroll <KEY>` re-creates the item with an empty
ACL, which discards the recorded trust.

## Debugging a consumer

`keyring_get` and `keyring_require` suspend `xtrace` around the read and restore
it afterwards, because bash traces every expanded argument and would otherwise
print the decrypted value to stderr — measured at four copies per call before the
guard. So `bash -x ./scripts/some-consumer.sh` is safe.

What is still on you: do not `echo`, log, or interpolate a critical value into
output yourself. The guard covers the library, not what a caller does with the
value once it has it.

### If every key reports DEFEATED at once

Suspect ACL-layout drift before compromise, particularly just after a macOS
update. `verify` compares each item against a throwaway item created fresh
through the enrollment path, but an already-enrolled item keeps the shape it was
given when *it* was enrolled — an OS update does not rewrite stored keychain
structures. If Apple changes the layout a freshly created empty-ACL item gets,
every previously enrolled key would start comparing unequal simultaneously.

A genuine "Always Allow" affects **one** key — the one whose dialog was answered
that way. All keys failing together is the signature of drift. Distinguish them
by re-enrolling a single key and re-running `verify`: if that key goes green
while the others stay red, it is drift, and `./scripts/keyring.sh enroll`
re-enrolls the rest. This is a reasoned expectation, not something that has been
observed — no macOS layout change has been available to test against.

## Recovery

The plaintext copy in `.env.local` is the recovery source and **has not been
removed**. P1239's invariant is that both copies coexist until the locked path has
served every consumer at least once.

If the keychain is lost, corrupted, or a gate is defeated:

```bash
./scripts/keyring.sh enroll          # re-enrolls everything from .env.local
./scripts/keyring.sh verify          # confirm every gate is intact again
```

Executed as a drill on 2026-09-07 (withdraw → confirm gone → enroll → confirm
restored → confirm gate intact) before any plaintext removal was contemplated.

**Do not remove anything from `.env.local` until** `/day-cp` and one deploy have
both completed on the locked path, and the measured prompt count over a full
`/weekly` + `/day-cp` cycle is at or below roughly 10/week (P1239 Done-When).

## Why not `security add-generic-password -w <value>`

That puts the secret in `argv`, where any process can read it from `ps` for the
lifetime of the call. `scripts/lib/keychain.py` talks to Security.framework
directly instead: values arrive on stdin and leave on stdout, never as arguments.
Creating the item and setting its empty ACL happen in one call — doing it in two
makes macOS treat it as *modifying* an item and prompt during enrollment
(measured: `OSStatus -128`).

## What is NOT covered

- **The CI-side copy** of the direct-DB credential. It is read from the CI
  provider's own secret store, not from `.env.local`, so locking the local file
  does not break it — and does not protect it either. Different attack surface,
  tracked on P1214.
- **A second local config store** holding four live secrets outside `.env.local`
  (P1239 Open Question 5) — unresolved.
- **Read-blocking the plaintext half** via `sandbox.filesystem.denyRead`
  (P1239 Open Question 4) — a founder call, deliberately not taken here. Note
  that `permissions.deny` must *not* be used for this: since Claude Code
  v2.1.257 the mere existence of a deny rule escalates most Bash commands to a
  human prompt.
