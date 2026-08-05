---
name: push
description: "Commit outstanding work, write the privacy stamp, and drive the staging hop to origin/main. Completes the push autonomously when ~/.push-enabled is set; otherwise stops and asks the user to run push-enable."
when_to_use: "When you're on main with uncommitted changes and/or commits ahead of origin and you just want them pushed. Triggered by /push, 'push', 'commit and push', 'push it'. NOT for feature branches (use /ship) and NOT for deploying functions to prod (use /ship-prod)."
version: 3.0.0
---

# /push

Push local `main` work to `origin/main` without making you steer every gate.

```
/push
/push "commit message for outstanding changes"
```

**Why this skill exists:** pushing to main in this repo has three gates that previously each became a stop-and-ask (commit-or-not, run-privacy, branch-protection staging-hop). This skill absorbs all three: it commits your work, writes the privacy stamp, and drives `scripts/git-ops.sh push-docs` through the staging branch and the `audit-privacy` CI poll. Whether it can also land the final push depends on one human flag — read the next section before doing anything else.

## One human flag decides whether you can finish

**Whether the agent can complete the push depends entirely on `~/.push-enabled`.** It is a single flag controlling two checks — not two independent walls:

| Check | Where | Behavior |
|---|---|---|
| PreToolUse hook | `~/.claude/hooks/block-prod-deploy.sh:27` | Blocks the agent's `git push` **unless** `~/.push-enabled` exists. Matches on command text containing `git push` — so `./scripts/git-ops.sh push-docs` is not matched and runs regardless. That is a matcher artifact, **not** an intended allowance. |
| Layer 3 — prod TTY confirm | `scripts/pre-push-checks.sh:203-207` (`.git/hooks/pre-push` is a **symlink** to it) | Prompts `Ship to production? (y/N)` and reads `/dev/tty`. Only guards `remote_ref == refs/heads/main` (`:181`). |

**The waiver is explicit and it is real:** `scripts/pre-push-checks.sh:173-176` runs *before* Layer 3 and short-circuits it —

```bash
if [[ -f "$HOME/.push-enabled" ]]; then
  echo "  ✅ Push allowed (push-enable active; PII scan + privacy gate enforced above)."
  exit 0
fi
```

So with the flag set, **you can and should complete the push yourself.** With it unset, you cannot — no env var substitutes.

**What the flag does NOT waive:** Layer 1 (PII scan) and Layer 2 (privacy-stamp gate) both run *above* the waiver and are always enforced. It waives only the human "are you sure", never a content check.

**Never create the flag yourself** — global CLAUDE.md: *"authorization the agent can forge is not authorization."* Ask the user to run `push-enable` (a `.zshrc` alias that sets it with a 30-minute auto-expiry). That is one word for them, versus handing them a push procedure.

`PUSH_DOCS_ASSUME_YES=1` is unrelated to all of the above: it silences only `push-docs`' **own** `y/N` (`git-ops.sh:2918-2932`) and is never exported into the git push, so it cannot affect the pre-push hook either way.

> **History:** v1.0.0 promised "runs to completion with no confirmation prompt" (false — ignored the TTY gate). v2.0.0 then claimed the flag "does not enable an agent push" (also false — inverted the waiver, inferred from one observed failure instead of reading `pre-push-checks.sh`). Both cost real session turns. **Read the hook source before asserting what blocks you.**

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

### 4. Check the flag BEFORE running the staging hop

```bash
ls ~/.push-enabled 2>/dev/null && echo ACTIVE || echo INACTIVE
```

**INACTIVE → stop here and ask first.** Do not run `push-docs` yet: it would push a staging branch, burn a full CI run, then die at the TTY read and orphan that branch (see the leak below). Ask for the one word:

> N commit(s) ready. To let me finish the push, run `push-enable` (sets a 30-min auto-expiring flag). I can't set it myself — it's your authorization, not mine.

**ACTIVE → proceed. You complete the push yourself.** Note the flag auto-expires 30 minutes after `push-enable`; if it lapses mid-run you'll land back at the TTY read.

### 5. Run the staging hop

```bash
PUSH_DOCS_ASSUME_YES=1 ./scripts/git-ops.sh push-docs
```

Deterministic: privacy-coverage check → `main.lock` → staging push to `staging/doc-<short-sha>` → `audit-privacy` CI poll → push to main → staging cleanup. `PUSH_DOCS_ASSUME_YES=1` silences only the script's own `y/N`; with the flag ACTIVE the pre-push waiver handles the rest, and it runs unattended end to end.

**The staging branch name is computed from live HEAD** (`git-ops.sh:2813`) and cleanup runs **only after a successful main push** (`:2953`). So every aborted run **leaks one remote branch permanently** — the script prints the delete command on the `n` path but *not* on a hook failure. If a run aborts, report it:

```bash
git ls-remote origin 'staging/*'                    # audit the leak
git push origin --delete staging/doc-<sha>          # clean up (needs the flag)
```

**Real blockers (surface, don't auto-resolve):** `audit-privacy` CI **red** (content is not publishable — never `--force`), privacy coverage gap, staging push rejected (behind origin), `gh` not authenticated.

**What stays protected:** the server-side `audit-privacy` required check on main is non-bypassable (the real boundary, P919), and Layers 1–2 of the pre-push hook run regardless of the flag. `PUSH_DOCS_ASSUME_YES` applies to `push-docs` ONLY — never `ship-to-prod`, which requires a TTY unconditionally (`git-ops.sh:2683`).

**Never hand the user `! <command>` as a workaround.** Claude Code's `!` bash mode is **not** a TTY: `push-docs` dies at its `[[ -t 0 ]]` guard (`git-ops.sh:2931`), and the pre-push hook's `/dev/tty` read fails the same way. If the flag is unavailable, the fallback is the user running it in a **real terminal** — not `!`.

Verify and report: `git rev-list --left-right --count origin/main...HEAD` → expect `0	0`.

**Never** offer `git push --no-verify`, a direct `git push origin staging/<sha>:main` (skips the lock), or creating `~/.push-enabled` yourself. The flag is the user's to set; `push-enable` is theirs to type.

---

## What you replaced

| Before (the manual transcript) | With /push |
|---|---|
| "Commit committed-only or commit first?" → wait | auto-commit (step 2) |
| "Run /privacy?" → wait | auto-run (step 3) |
| "PR or disable the check?" → wait | `push-docs` owns the staging hop |
| agent rediscovers the protocol each time | one documented delegation |
| agent guesses at what blocks it and asserts the guess | flag semantics read from source and cited (step 4) |

**Honest contract:** with `~/.push-enabled` set, `/push` runs end to end and pushes to main. Without it, `/push` does everything up to the push and asks the user for one word — `push-enable` — never a push procedure, and never `!`.
