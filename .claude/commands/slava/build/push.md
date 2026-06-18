---
name: push
description: "Get local main commits to origin/main with zero micromanagement — commit outstanding work, run the privacy stamp, then hand off the single staging-hop command. Collapses the 3 stop-and-ask gates into one final y/N."
when_to_use: "When you're on main with uncommitted changes and/or commits ahead of origin and you just want them pushed. Triggered by /push, 'push', 'commit and push', 'push it'. NOT for feature branches (use /ship) and NOT for deploying functions to prod (use /ship-prod)."
version: 1.0.0
---

# /push

Push local `main` work to `origin/main` without making you steer every gate.

```
/push
/push "commit message for outstanding changes"
```

**Why this skill exists:** pushing to main in this repo has three gates that previously each became a stop-and-ask (commit-or-not, run-privacy, branch-protection staging-hop). The staging hop is already encoded deterministically in `scripts/git-ops.sh push-docs`. This skill does the two things `push-docs` can't do itself — commit your work and write the privacy stamp — then hands you the one command that finishes the job. **You answer exactly one `y/N` at the end.** That final prompt is a hard security invariant (P919 / D1) and is never bypassed.

**Do NOT re-derive the git sequence in prose.** The whole point is to delegate to `push-docs`. If you find yourself manually `git push`-ing to a staging branch, stop — you're reimplementing the brittle path this skill replaces.

---

## Decisions this skill makes for you (do NOT ask)

- Commit outstanding tracked changes → **yes** (you invoked /push = "commit and push my work").
- Run `/maintain:privacy` → **yes, automatically — when the push range touches a watched path** (its stamp is required by `push-docs`; src-only pushes skip it). Never ask "ok to run privacy?".
- Use the staging-branch hop → **yes** (it's the canonical and only path to main; `push-docs` owns it).

## Genuine STOPs (surface these, do not auto-resolve)

- **Not on `main`** → this skill only pushes main. For `feature/*` or `fix/*`, route to `/ship`.
- **Behind `origin/main`** (divergence) → could be co-tenant work. Report ahead/behind counts; suggest `git pull --rebase`. Do not blindly proceed.
- **Privacy review finds a HARD flag** → real PII can't reach a public repo. Surface it; let the user fix or move to `.private/`.
- **`audit-privacy` CI red on staging** → surfaced by `push-docs`; relay it.
- **The final `Confirm push? (y/N)`** → the user's one touchpoint. Never auto-answer.

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

### 4. Hand off the staging hop

`push-docs` does the rest deterministically — privacy-coverage check, `main.lock`, staging push, `audit-privacy` CI poll, promote, cleanup. Its final `Confirm push? (y/N)` reads from `/dev/tty` and **refuses to run without a real interactive TTY** (the D1 guard, `git-ops.sh:2576`). The agent's Bash tool has no TTY, so **do not run `push-docs` yourself** — it would `die` after pushing the staging branch, leaving a half-done state.

Hand the user the single command to run **in their own terminal** (a real interactive shell — this is where the y/N works):

> Prepped: committed `<n>` commit(s)`<, privacy stamp written>`. To finish, run this in your terminal — it stages to `staging/doc-<sha>`, waits for `audit-privacy` CI, then asks `y/N` once before promoting to main:
>
> ```
> ./scripts/git-ops.sh push-docs
> ```

> **Note:** running it as `! ./scripts/git-ops.sh push-docs` from the Claude prompt is **not** guaranteed to provide a TTY — if it prints `no TTY available — refusing to auto-confirm (D1)`, run it directly in your terminal instead. (TTY behaviour of the `!` path is unverified — primary path is your own terminal.)

The user answers `y` once; the script handles promote + staging-branch cleanup.

---

## What you replaced

| Before (the manual transcript) | With /push |
|---|---|
| "Commit committed-only or commit first?" → wait | auto-commit (step 2) |
| "Run /privacy?" → wait | auto-run (step 3) |
| "PR or disable the check?" → wait | `push-docs` owns the staging hop |
| agent rediscovers the protocol each time | one documented delegation |

Three ask-gates → one `y`. That last `y` stays, by design.
