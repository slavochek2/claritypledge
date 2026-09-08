---
paths:
  - "scripts/**"
  - ".claude/commands/**"
  - "e2e/**"
  - "supabase/**"
  - "features/**"
---

# Credentials — which half a secret lives in, and how to touch it

Since P1239 the credentials in this repo live in **two halves**, and the difference is
operational, not cosmetic.

- **Routine half** — most of `.env.local`. Plaintext, readable by any process running as
  the founder. Use it as before.
- **Locked half** — the credentials whose loss rotation cannot undo. They sit in the
  macOS login keychain in items that trust **no application**, so macOS demands a human
  answer on **every read**. There is no unlock command, no time window, no state to
  remember, and no way for an agent to grant itself one.

**Both halves currently hold the same values.** The plaintext copies have not been
removed and must not be until P1239's remaining Done-When items pass. So a script that
reads `.env.local` today still works — which is exactly why this rule exists: nothing
will fail to tell you that you took the unguarded path.

## Which half is this credential in?

```bash
./scripts/keyring.sh status          # per-key: enrolled / NOT enrolled — never prompts
```

In code, `is_locked()` (Python) and `exists` (`scripts/lib/keychain.py`) answer the same
question without costing a dialog. Branch on it during migration; never guess.

The **names** of the locked credentials are deliberately NOT in this repo — see
"Identifiers" below.

## Reading one

Never `source .env.local` to obtain a locked credential, and never read it out of the
file directly. Use the helper for your language; each fails closed.

```bash
source "$(git rev-parse --show-toplevel)/scripts/keyring.sh"
keyring_require PROD_EXAMPLE_KEY          # exported, or we already exited non-zero
```
```js
import { keyringGet } from './lib/keyring.mjs';   // throws if declined
```
```python
from keyring import require                        # raises KeyringError if declined
```

The grant is **per key and per access**. Asking for one credential prompts for that one
and cannot reach any other; two reads of the same key raise two dialogs. Do not batch
requests to "save" prompts — the granularity is the security property.

## Fail closed — never soften this

A declined dialog or an unenrolled key must stop the caller with a non-zero exit and a
message naming what to do. **Never** add a fallback to the plaintext copy, and never
continue with an empty value. A fallback silently converts the gate into decoration, and
because both halves currently hold the same value it would look like it worked.

## Never put a secret in a command argument

`cmd --token "$VALUE"` is visible in `ps` to every process on the machine for the
lifetime of the call. The helpers move values over stdin/stdout only. This applies to
your own code too — see also [git.md](git.md) and P1148's leak-path list.

## Never run a credential consumer under `bash -x`

Bash traces every expanded argument, so `set -x` prints decrypted values to stderr —
measured at four copies from a single call before the guard existed.

`keyring_require` and `keyring_get` now suspend tracing across the read. **That guard
cannot protect a caller who captures the value**: `v="$(keyring_get KEY)"` forks a
subshell, and the subshell's `set +x` cannot reach the parent's trace of the assignment.
If you must capture a raw value, suspend tracing in your own shell frame around it — see
the top of `scripts/keyring-gate-proof.sh`, which suppresses tracing globally for exactly
this reason.

## Say why you are asking

The dialog cannot name you. It says "Python wants to use ...", which is why the founder
denied a legitimate request on 2026-09-08 and had no way to find out whose it was.

Every read now announces itself before the dialog — notification, stderr line, and a
record in the request log — carrying the key, the session id, the branch and **the
reason you supply**. Supply one:

```bash
KEYRING_REASON="weekly ops mailbox check" keyring_require OPS_EXAMPLE_KEY
```

`./scripts/keyring.sh requests` shows the log. A request with no reason still goes
through; it just arrives as "(no reason given)", which the founder is entitled to deny.

## Never click "Always Allow"

The dialog offers Allow, Deny and Always Allow. **Always Allow permanently disables the
gate for that credential** — no error, no warning, nothing visibly different, that key
simply reads silently forever afterwards. Tell the founder "Allow", never "Always Allow".

It is detectable, and the check never prompts:

```bash
./scripts/keyring.sh verify     # 0 all intact · 1 something unenrolled · 2 a gate is defeated
```

Two traps worth knowing before you interpret its output, both of which produced wrong
verdicts during implementation: an **empty** application list means no app is trusted
(good), while a **NULL** one means every app is trusted (the gate is absent) — they are
opposites; and macOS returns ACL entries in unstable order, so a verdict that flickers
between runs is a defect, not noise. If **every** key reports defeated at once, suspect
layout drift after an OS update rather than compromise: a real Always Allow affects
exactly one key.

## Rotation must write the locked copy too

Rotation is the only thing that writes new credential values. A rotator that updates only
`.env.local` leaves the locked copy holding the credential the provider just revoked —
which presents as a broken gate rather than a stale value. After the plaintext copies are
removed, such a rotator writes nothing any consumer reads and still reports success.
[P1148](../../features/p1148_credential_rotation_system.md) owns this; do not add a
rotator for a locked credential without reading its P1239-coupling section.

## Identifiers belong in `.private/`, never in a public file

A list of *which* credentials are critical is a ranked target list, and the weakness it
describes is live while the plaintext copies still exist. The registry lives at
`.private/docs/keyring-critical.txt`; specifics live in `.private/docs/security-log.md`.
Public files — specs, docs, commit messages, this rule — describe credentials
generically ("the prod master key", "the mail-sending key"). P1148 and P1214 name zero
credentials; match that. The public template is `scripts/keyring-critical.txt.example`.

## Why per-access rather than a time window

Recorded so it is not relitigated. A window makes every critical secret readable by
**everything** running for its whole duration, with no record of what read them; a
per-access confirmation makes exactly one read possible and requires a human present.
The window was measured to buy about two fewer prompts per week against a workload of
roughly four events per week. A flag file was also rejected on the founder's own
standard: *a flag cannot prove a human is at the keyboard right now.* Full reasoning and
the rejected alternatives are in P1239; operator detail is in
[credential-keyring.md](../../docs/technical/credential-keyring.md).
