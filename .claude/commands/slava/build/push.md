---
name: push
description: "Get local main commits to origin/main with zero micromanagement — commit outstanding work, run the privacy stamp, run the staging hop, and push. No confirmation prompts; only genuine blockers stop it."
when_to_use: "When you're on main with uncommitted changes and/or commits ahead of origin and you just want them pushed. Triggered by /push, 'push', 'commit and push', 'push it'. NOT for feature branches (use /ship) and NOT for deploying functions to prod (use /ship-prod)."
version: 1.0.0
---

# /push

Push local `main` work to `origin/main` without making you steer every gate.

```
/push
/push "commit message for outstanding changes"
```

**Why this skill exists:** pushing to main in this repo has three gates that previously each became a stop-and-ask (commit-or-not, run-privacy, branch-protection staging-hop). The staging hop is encoded deterministically in `scripts/git-ops.sh push-docs`. This skill commits your work, writes the privacy stamp, and runs `push-docs` non-interactively. **`/push` runs to completion with no confirmation prompt** — invoking it IS your authorization. It stops ONLY on a genuine blocker (privacy flag, CI red, behind origin). The real security boundary — the server-side `audit-privacy` CI check on main — still gates every commit; only the redundant local "are you sure" is removed.

**Do NOT re-derive the git sequence in prose.** The whole point is to delegate to `push-docs`. If you find yourself manually `git push`-ing to a staging branch, stop — you're reimplementing the brittle path this skill replaces.

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

### 4. Run the staging hop (no confirmation — `/push` is the authorization)

Run `push-docs` **yourself**, non-interactively. Invoking `/push` IS the human authorization for this push, so pass `PUSH_DOCS_ASSUME_YES=1` to skip the local `y/N` (the script otherwise blocks on a TTY the agent doesn't have):

```bash
PUSH_DOCS_ASSUME_YES=1 ./scripts/git-ops.sh push-docs
```

This does everything deterministically — privacy-coverage check, `main.lock`, staging push to `staging/doc-<sha>`, `audit-privacy` CI poll, promote to main, cleanup — and **does not prompt**. Relay its output.

**What stays protected (do NOT bypass these):** the `audit-privacy` CI required check on main is non-bypassable and gates every commit server-side (the real boundary, P919); `PUSH_DOCS_ASSUME_YES` only removes the local "are you sure". It applies to `push-docs` ONLY — never set it for `ship-to-prod` (prod deploys keep their mandatory prompt).

**Surface, don't auto-resolve, if `push-docs` exits non-zero:** privacy coverage gap, `audit-privacy` CI red, staging-push rejected (behind origin), `gh` not authenticated. Report the script's message; do not retry blindly or `--force`.

Report the result: `Pushed <n> commit(s) to origin/main. Staging branch cleaned up.`

---

## What you replaced

| Before (the manual transcript) | With /push |
|---|---|
| "Commit committed-only or commit first?" → wait | auto-commit (step 2) |
| "Run /privacy?" → wait | auto-run (step 3) |
| "PR or disable the check?" → wait | `push-docs` owns the staging hop |
| agent rediscovers the protocol each time | one documented delegation |
| final `y/N` deadlocked the agent (no TTY) | `PUSH_DOCS_ASSUME_YES=1` — agent completes the push |

Three ask-gates + a TTY deadlock → zero prompts. `/push` runs end to end; only a real blocker stops it.
