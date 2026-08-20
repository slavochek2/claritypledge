---
name: push
description: "Commit this session's work, write the privacy stamp, and drive the staging hop to origin/main. Completes the push autonomously when ~/.push-enabled is set; otherwise stops and asks the user to run push-on."
when_to_use: "When you're on main with uncommitted changes and/or commits ahead of origin and you just want them pushed. Triggered by /push, 'push', 'commit and push', 'push it'. NOT for feature branches (use /ship) and NOT for deploying functions to prod (use /ship-prod)."
version: 4.0.0
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
| PreToolUse hook | `~/.claude/hooks/block-prod-deploy.sh` → `push_flag_valid()` | Text-matches the push command and blocks unless the flag is present **and unexpired**. **It does not match `./scripts/git-ops.sh push-docs`** — so the hook will *not* stop you from starting step 5 with a missing or lapsed flag. Step 4's own check is what stops you. The real boundary is the server-side check (P919), not this local hook. |
| Layer 3 — prod TTY confirm | `scripts/pre-push-checks.sh` (`.git/hooks/pre-push` is a **symlink** to it) | Prompts `Ship to production? (y/N)` and reads `/dev/tty`. Only guards `remote_ref == refs/heads/main`. |

**The waiver is explicit and it is real:** in `scripts/pre-push-checks.sh` it runs *before* Layer 3 and short-circuits it — but only for a flag that is present **and unexpired** (the `_exp_s` check at the `PUSH_FLAG` block). Grep for `PUSH_FLAG` rather than trusting a line number here; this region has moved twice.

So with the flag set, **you can and should complete the push yourself.** With it unset, you cannot — no env var substitutes.

**What the flag does NOT waive — stated precisely:**
- **Layer 1 (PII content scan, `:44-68`)** — runs on every ref, unconditionally. This is the one that is always enforced.
- **Layer 2 (privacy-stamp gate, `:74-168`)** — runs above the waiver, but `:76` `continue`s on any ref that isn't `refs/heads/main`. So `push-docs`' own `staging/doc-*` push skips it; the stamp is enforced on the main push.

The flag waives only the human "are you sure" — never Layer 1.

**Never create the flag yourself** — global CLAUDE.md: *"authorization the agent can forge is not authorization."* Ask the user to run `push-on`. One word for them, versus handing them a push procedure.

**The expiry is ENFORCED — an expired flag grants nothing.** `push-on` writes a UTC-Z timestamp *into* `~/.push-enabled`, and **both** consumers check it (`block-prod-deploy.sh` `push_flag_valid()`; `pre-push-checks.sh` at the waiver). Both **fail closed** on anything ambiguous — missing, empty, legacy contentless, unparseable, past expiry, or claiming more than 2h of remaining life.

The presence of the file therefore proves nothing. Use `push-status`, or check it properly:

```bash
push-status     # ⚠️ PUSH ENABLED — 24 min left  |  🔒 EXPIRED  |  🔒 Push disabled
```

Do **not** treat `[[ -f ~/.push-enabled ]]` or a bare `cat` as ACTIVE — a stale flag looks identical to a live one and will fail at the confirm *after* you have already pushed a staging branch and burned a CI run.

*(History: the pre-2026-08-05 `push-enable` alias backgrounded its cleanup without disowning it, so the expiry died with the terminal — observed live, a "30-minute" flag still granting pushes 3h23m later. Fixed twice over: `push-on` uses zsh `&!` so the cleanup survives its parent shell, **and** the consumers no longer trust the file's mere existence. A revocation that depends on a background job surviving is one that silently fails open.)*

`PUSH_DOCS_ASSUME_YES=1` is unrelated to all of the above. A `VAR=1 cmd` prefix **is** inherited by every child process including `git push` and the hooks — but no hook reads this variable. It gates exactly one branch, `git-ops.sh:2924`.

> **History — read this before you assert anything about the gates.** v1.0.0 promised "no confirmation prompt" (ignored the TTY gate). v2.0.0 claimed the flag "does not enable an agent push" (inverted the waiver). v3.0.0 claimed `PUSH_DOCS_ASSUME_YES` "is never exported into the git push" (false — it is inherited; the conclusion was right, the mechanism invented) and that Layer 2 is "always enforced" (it skips non-main refs). v3.1.0 then shipped a recovery check (`--is-ancestor <sha> origin/main`) that **can never return true in the abort case it was written for**, so orphaned staging branches would have read "unsafe to delete" forever. **Four versions, four sets of false claims — including two consecutive attempts to fix the problem — every one produced by inferring from an observed symptom instead of reading the source.** Cite `file:line` you have actually opened, or don't make the claim. The only thing that has ever caught these is a hostile reviewer told to assume a false claim exists.

**Do NOT re-derive the git sequence in prose.** Delegate to `push-docs`. If you find yourself manually `git push`-ing to a staging branch, stop — you're reimplementing the brittle path this skill replaces.

---

## Decisions this skill makes for you (do NOT ask)

- Commit tracked changes **you modified this session** → **yes**, no need to ask. Dirty files you did *not* touch → list them once and ask (`git.md`; `/push` gets no exemption from "only stage what you changed").
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
2. **Clear the index BEFORE your first `git add`** (`.claude/rules/git.md` — doing it after mixes bystanders in invisibly):
   ```bash
   git diff --cached --name-only          # inspect for prior-session leftovers
   git reset HEAD -- <bystander>          # unstage anything not yours
   ```
3. Stage **only paths you modified in this session**, by explicit path. Never `git add .` / `-A`. This repo runs concurrent worktree sessions and `git.md` calls staging-everything *"the #1 cause of wrong-files-in-wrong-commit"* — `/push` does not get an exemption from that. For dirty files you did **not** touch, list them once and ask; don't sweep them in and don't adjudicate file-by-file.
4. `/push` runs on the shared main checkout, so commit through `./scripts/git-ops.sh commit-to-main --message "..." --files <explicit paths>` (`.claude/rules/git.md` — corrected 2026-08-20: a hand-run `git add` + `git commit -- <files>` is NOT safe there even bystander-checked; `commit-to-main` holds a lock across the whole staging+commit sequence, which is the actual guarantee needed). Use the user's message (or a descriptive `chore:`/`docs:`/`fix:` summary of the staged files) plus the commit trailers your session was given (the `Co-Authored-By:` model line + `Claude-Session:` link from your session's git instructions). **Use the running session's model in the trailer — do not hardcode a model name** (a Sonnet `/push` must not stamp Opus authorship).

### 3. Write the privacy stamp (only if a watched path changed)

`push-docs` only blocks on commits that touch **watched paths** — default at `git-ops.sh:61`, overridden by `scripts/privacy-watched-paths.sh` when present (`:62-64`), which is the source of truth: `docs/`, `features/`, `.claude/commands/`, `CLAUDE.md`, `README.md`, `content/articles/`, `content/sifter/`, `supabase/migrations/`. A push whose range touches **none** of these (e.g. `src/`-only) needs no stamp — skip this step.

Check the push range: `git diff --name-only origin/main..HEAD`.

- **No watched path touched** → skip; go to step 4.
- **Stamp already covers HEAD** (`.privacy-reviewed` == `git rev-parse HEAD`) → already done; go to step 4.
- **Otherwise** → run the **`/maintain:privacy`** skill. It reviews and, if clean, writes `.privacy-reviewed = HEAD`. This must run **after** the commit so the stamp covers it.
  - Clean → stamp written, continue.
  - **HARD flag found** → STOP. Surface the finding; do not stamp, do not push.

### 4. Check the flag BEFORE running the staging hop

```bash
zsh -ic push-status 2>/dev/null || \
  { _e=$(head -1 ~/.push-enabled 2>/dev/null); \
    _s=$(date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$_e" +%s 2>/dev/null); \
    [[ -n "$_s" ]] && (( $(date -u +%s) < _s )) && echo ACTIVE || echo INACTIVE; }
```

**INACTIVE → stop here and ask first.** Do not run `push-docs` yet: it would push a staging branch, burn a full CI run, then die at the TTY read and orphan that branch permanently (see the leak below). Ask for the one word:

> N commit(s) ready. To let me finish the push, run `push-on`. I can't set it myself — it's your authorization, not mine.

**PRESENT but older than ~30 min → treat as stale, confirm before proceeding.** The expiry is a backgrounded subshell (`~/.zshrc:455`) that dies with its terminal, so an old flag may be a leftover rather than a live grant. Pushing on a stale flag means pushing on authorization the user thinks already lapsed.

**FRESH → proceed. You complete the push yourself.** Start promptly: if the window lapses mid-run you land in the recovery case below.

### 5. Run the staging hop

```bash
PUSH_DOCS_ASSUME_YES=1 ./scripts/git-ops.sh push-docs
```

Deterministic: privacy-coverage check → `main.lock` → staging push to `staging/doc-<short-sha>` → `audit-privacy` CI poll → push to main → staging cleanup. `PUSH_DOCS_ASSUME_YES=1` silences only the script's own `y/N`; with the flag FRESH the pre-push waiver handles the rest, and it runs unattended end to end.

**The staging branch name is computed from live HEAD** (`git-ops.sh:2814`) and cleanup runs **only after a successful main push** (`:2949-2955`). So every aborted run **leaks one remote branch permanently** — the script prints the delete command on the `n` path but *not* on a hook failure.

**Recovery if the run aborts after the staging push (the flag-expired case):**

```bash
git ls-remote origin 'staging/*'                    # audit the leak
git push origin --delete staging/doc-<sha>          # cleanup — itself needs the flag
```

**Note the deadlock:** `git push origin --delete` *is* a `git push`, so if the abort was caused by the flag expiring, the cleanup is blocked by that same expiry. Do not loop on it. Report the orphaned branch name and ask the user to re-run `push-on`, then retry both the push and the cleanup.

**Check containment against LOCAL `main`, not `origin/main`.** An aborted run means the main push never happened, so the staging tip is a *descendant* of `origin/main`, never an ancestor — `--is-ancestor <sha> origin/main` returns 1 in exactly the situation you're trying to clean up, and reads as "unsafe to delete" forever:

```bash
git merge-base --is-ancestor <sha> HEAD && echo "contained in local main — safe to delete"
```

A `staging/doc-*` branch is only ever a copy of local `main` at push time, so once it is contained in your local history, deleting it loses nothing. (After a *successful* push the branch is already gone — `git-ops.sh:2949-2955` — so any surviving `staging/*` is by definition from an abort.)

**Real blockers (surface, don't auto-resolve):** `audit-privacy` CI **red** (content is not publishable — never `--force`), privacy coverage gap, staging push rejected (behind origin), `gh` not authenticated.

**What stays protected:** the server-side `audit-privacy` check on main is the real boundary (P919 — *documented*; the branch-protection API returns 403 to the local `gh` token, so "required" is not verifiable from here. Do not restate it as confirmed). Layer 1's PII scan runs on every ref regardless of the flag. `PUSH_DOCS_ASSUME_YES` applies to `push-docs` ONLY — never `ship-to-prod`, which requires a TTY unconditionally (`git-ops.sh:2683-2684`) and never consumes the flag's waiver (`:2469`).

**Never hand the user `! <command>` as a workaround.** Claude Code's `!` bash mode is **not** a TTY: `push-docs` dies at its `[[ -t 0 ]]` guard (`git-ops.sh:2931`), and the pre-push hook's `/dev/tty` read fails the same way. If the flag is unavailable, the fallback is the user running it in a **real terminal** — not `!`.

Verify and report: `git rev-list --left-right --count origin/main...HEAD` → expect `0	0`.

**Never** offer `git push --no-verify`, a direct `git push origin staging/<sha>:main` (skips the lock), or creating `~/.push-enabled` yourself. The flag is the user's to set; `push-on` is theirs to type.

---

## What you replaced

| Before (the manual transcript) | With /push |
|---|---|
| "Commit committed-only or commit first?" → wait | commits this session's files automatically (step 2) |
| "Run /privacy?" → wait | auto-run (step 3) |
| "PR or disable the check?" → wait | `push-docs` owns the staging hop |
| agent rediscovers the protocol each time | one documented delegation |
| agent guesses at what blocks it and asserts the guess | flag semantics read from source and cited (step 4) |

**Honest contract:** with `~/.push-enabled` set, `/push` runs end to end and pushes to main. Without it, `/push` does everything up to the push and asks the user for one word — `push-on` — never a push procedure, and never `!`.
