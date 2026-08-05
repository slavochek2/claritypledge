---
name: push
description: "Run every gate ahead of a main push autonomously — commit outstanding work, privacy stamp, staging branch, CI verify — then hand the user one command to type. The final push to main is human-only by design and the agent cannot complete it."
when_to_use: "When you're on main with uncommitted changes and/or commits ahead of origin and you just want them pushed. Triggered by /push, 'push', 'commit and push', 'push it'. NOT for feature branches (use /ship) and NOT for deploying functions to prod (use /ship-prod)."
version: 2.0.0
---

# /push

Push local `main` work to `origin/main` without making you steer every gate.

```
/push
/push "commit message for outstanding changes"
```

**Why this skill exists:** pushing to main in this repo has three gates that previously each became a stop-and-ask (commit-or-not, run-privacy, branch-protection staging-hop). This skill absorbs all three: it commits your work, writes the privacy stamp, and drives `scripts/git-ops.sh push-docs` through the staging branch and the `audit-privacy` CI poll. **Everything up to the main push is autonomous.**

## The last step is human-only — do not try to automate it

**The agent cannot push to `main` in this repo. This is deliberate, and no env var, flag, or workaround changes it.** Two independent gates enforce it:

| Gate | Where | What it does |
|---|---|---|
| 1 | `~/.claude/hooks/block-prod-deploy.sh` | PreToolUse hook — blocks the agent's `git push` unless `~/.push-enabled` exists. **Never create that flag yourself**; it is human-controlled by design (global CLAUDE.md). |
| 2 | `.git/hooks/pre-push:~206` | On any push to `refs/heads/main`, prompts `Ship to production? (y/N)` and reads from `/dev/tty`. The source comment states the intent verbatim: *"Require TTY — agents can't provide this, so they're blocked."* |

**Gate 2 is the binding one.** It fires regardless of Gate 1, so flipping `~/.push-enabled` does **not** enable an agent push. Observed 2026-08-05: a `push-docs` run got all the way through — staging branch created, `audit-privacy` green, `main.lock` held — and still died at the TTY read.

`PUSH_DOCS_ASSUME_YES=1` only silences `push-docs`' **own** prompt (Gate 3, the script's local "are you sure"). It has no effect on Gate 2. An earlier version of this skill promised "runs to completion with no confirmation prompt" — that promise was structurally impossible and cost a session's worth of turns hunting a workaround that does not exist.

**So: do not** bare-`git push`, do not set `~/.push-enabled`, do not `--no-verify`, do not spawn a subagent to try. Run every gate you *can*, then hand the user the command in step 5.

**Do NOT re-derive the git sequence in prose.** Delegate to `push-docs`. If you find yourself manually `git push`-ing to a staging branch, stop — you're reimplementing the brittle path this skill replaces.

---

## Decisions this skill makes for you (do NOT ask)

- Commit outstanding tracked changes → **yes** (you invoked /push = "commit and push my work").
- Run `/maintain:privacy` → **yes, automatically — when the push range touches a watched path** (its stamp is required by `push-docs`; src-only pushes skip it). Never ask "ok to run privacy?".
- Use the staging-branch hop → **yes** (it's the canonical and only path to main; `push-docs` owns it).

## Genuine STOPs (surface these, do not auto-resolve)

- **Not on `main`** → this skill only pushes main. For `feature/*` or `fix/*`, route to `/ship`.
- **Behind `origin/main`** (divergence) → could be co-tenant work. Report ahead/behind counts and let the user resolve. Do not blindly proceed or auto-rebase shared main.
- **Privacy review finds a HARD flag** → real PII can't reach a public repo. Surface it; let the user fix or move to `.private/`.
- **`audit-privacy` CI red on staging** → surfaced by `push-docs`; relay it. Never `--force` or bypass.
- **`Authentication failed for 'https://github.com'`** → run `gh auth setup-git` (wires the active `gh` token into git's credential helper — needed after a token rotation), then re-run `push-docs`. One-time fix; does not need user confirmation.

---

## Steps

### 1. Preflight (all read-only — no prompts)

```bash
git -C "$(git rev-parse --show-toplevel)" rev-parse --abbrev-ref HEAD   # must be main
git fetch origin main
git rev-list --left-right --count origin/main...HEAD                    # behind<TAB>ahead
git status --short
```

- **Branch ≠ main** → STOP: "On `<branch>`, not main. /push is main-only; use `/ship` for feature branches."
- **Behind > 0** → STOP: report the ahead/behind counts and let the **user** resolve. Do NOT run `git pull --rebase` yourself — rebasing the shared `main` checkout can collide with a co-tenant `/ship` mid-cherry-pick (git.md). State the counts; the rebase is the user's call.
- **Clean working tree AND ahead = 0** → nothing to do. Report "Already at origin/main." and exit.
- **Clean working tree, ahead > 0** → skip step 2 (already committed); go to step 3.

### 2. Commit outstanding work (only if the tree is dirty)

Respect the git firewall (`.claude/rules/git.md`): **explicit paths only, never `git add .` / `-A`.**

1. `./scripts/pre-commit-checks.sh` — must pass (relay any real WARNING; bundle-size noise unrelated to your files is fine to note and proceed).
2. Stage **all** tracked-modified + untracked, non-ignored files **by explicit path** — this accumulated work is what you're pushing; this is the common case (the transcript that motivated this skill had a dirty tree the user wanted committed). **Do NOT ask "should I commit these?"** — committing them is the intent of /push. Never `git add .` / `-A`. Then run `git diff --cached --name-only` as a thin firewall guard: only STOP if a staged path is **unmistakably** another live session's in-flight work (e.g. `src/` files for a feature/P-number unrelated to anything in this conversation). A foreign path → unstage it (`git reset HEAD -- <file>`) and report; do not adjudicate ownership file-by-file with the user as a routine step.
3. Commit with the user's message (or a descriptive `chore:`/`docs:`/`fix:` summary of the staged files), explicit `-- <files>`, and the commit trailers your session was given (the `Co-Authored-By:` model line + `Claude-Session:` link from your session's git instructions). **Use the running session's model in the trailer — do not hardcode a model name** (a Sonnet `/push` must not stamp Opus authorship).

### 3. Write the privacy stamp (only if a watched path changed)

`push-docs` only blocks on commits that touch **watched paths** (`git-ops.sh:61`): `docs/`, `features/`, `.claude/commands/`, `CLAUDE.md`, `README.md`, `content/articles/`, `content/sifter/`. A push whose range touches **none** of these (e.g. `src/`-only) needs no stamp — skip this step.

Check the push range: `git diff --name-only origin/main..HEAD`.

- **No watched path touched** → skip; go to step 4.
- **Stamp already covers HEAD** (`.privacy-reviewed` == `git rev-parse HEAD`) → already done; go to step 4.
- **Otherwise** → run the **`/maintain:privacy`** skill. It reviews and, if clean, writes `.privacy-reviewed = HEAD`. This must run **after** the commit so the stamp covers it.
  - Clean → stamp written, continue.
  - **HARD flag found** → STOP. Surface the finding; do not stamp, do not push.

### 4. Run the staging hop (autonomous — expect it to stop at Gate 2)

Run `push-docs` **yourself**. Pass `PUSH_DOCS_ASSUME_YES=1` to silence the script's own `y/N` so it reaches the CI verification unattended:

```bash
PUSH_DOCS_ASSUME_YES=1 ./scripts/git-ops.sh push-docs
```

This deterministically does the valuable, tedious work: privacy-coverage check → `main.lock` → staging push to `staging/doc-<sha>` → `audit-privacy` CI poll → attempts the main push. Note Gate 1 does **not** block this invocation (it blocks bare `git push`), so let the script run.

**Expected terminal state — this is success, not failure:**

```
✅ 'audit-privacy' passed on <sha>
Ship to production? (y/N)
.git/hooks/pre-push: line 206: /dev/tty: Device not configured
Push cancelled.
git-ops: push-docs: git push origin main failed
```

That is Gate 2 doing its job. **Do not retry, do not diagnose it as a bug, do not look for a flag.** The lock is released by the trap and the staging branch remains — everything is in a clean, resumable state. Go to step 5.

**Real blockers (surface, don't auto-resolve):** privacy coverage gap, `audit-privacy` CI **red**, staging-push rejected (behind origin), `gh` not authenticated. These are distinct from the expected Gate-2 stop above — an `audit-privacy` failure means the content is not publishable, and never gets a `--force`.

**What stays protected:** the server-side `audit-privacy` required check on main is non-bypassable (the real boundary, P919). `PUSH_DOCS_ASSUME_YES` applies to `push-docs` ONLY — never set it for `ship-to-prod`.

### 5. Hand off the final push (required — this is the deliverable)

Report what you completed, then give the user **one command** to run. The `!` prefix runs it in their shell with a real TTY, satisfying both gates legitimately:

```
! ./scripts/git-ops.sh push-docs
```

They answer `y` at each prompt. This is the canonical path — it retakes `main.lock` and re-verifies CI (fast, already green), so lock discipline is preserved.

Template for the handoff message:

> Gates cleared: privacy stamp written · staging `staging/doc-<sha>` created · `audit-privacy` CI green · N commit(s) ready.
> The push to main is human-only (pre-push TTY gate). Run this and answer `y`:
> `! ./scripts/git-ops.sh push-docs`

**Never** offer `git push --no-verify`, `~/.push-enabled`, or a direct `git push origin staging/<sha>:main` as an alternative — the first two bypass the gate, and the third skips the lock.

After the user reports it succeeded, confirm with `git rev-list --left-right --count origin/main...HEAD` (expect `0	0`) rather than assuming.

---

## What you replaced

| Before (the manual transcript) | With /push |
|---|---|
| "Commit committed-only or commit first?" → wait | auto-commit (step 2) |
| "Run /privacy?" → wait | auto-run (step 3) |
| "PR or disable the check?" → wait | `push-docs` owns the staging hop |
| agent rediscovers the protocol each time | one documented delegation |
| agent hunts for a workaround to the TTY gate, finds none | Gate 2 documented as unautomatable; agent stops and hands off |

Three ask-gates absorbed. The fourth — the prod-deploy confirmation — is **not** removed and cannot be: you type one command at the end.

**Honest contract:** `/push` does not push to main. It makes the push a single keystroke away and guarantees everything before it is already green.
