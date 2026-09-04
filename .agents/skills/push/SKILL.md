---
name: push
description: "Commit this session's work, write the privacy stamp, and drive the staging hop to origin/main. Completes the push autonomously when ~/.push-enabled is set; otherwise stops and asks the user to run push-on."
when_to_use: "When you're on main with uncommitted changes and/or commits ahead of origin and you just want them pushed. Triggered by /push, 'push', 'commit and push', 'push it'. NOT for feature branches (use /ship) and NOT for deploying functions to prod (use /ship-prod)."
version: 5.1.0
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

`PUSH_DOCS_ASSUME_YES=1` is unrelated to all of the above. A `VAR=1 cmd` prefix **is** inherited by every child process including `git push` and the hooks — but no hook reads this variable. It gates exactly one branch — the `PUSH_DOCS_ASSUME_YES` test in `cmd_push_docs`'s promote step.

> **History — read this before you assert anything about the gates.** v1.0.0 promised "no confirmation prompt" (ignored the TTY gate). v2.0.0 claimed the flag "does not enable an agent push" (inverted the waiver). v3.0.0 claimed `PUSH_DOCS_ASSUME_YES` "is never exported into the git push" (false — it is inherited; the conclusion was right, the mechanism invented) and that Layer 2 is "always enforced" (it skips non-main refs). v3.1.0 then shipped a recovery check (`--is-ancestor <sha> origin/main`) that **can never return true in the abort case it was written for**, so orphaned staging branches would have read "unsafe to delete" forever. **Four versions, four sets of false claims — including two consecutive attempts to fix the problem — every one produced by inferring from an observed symptom instead of reading the source.** Cite `file:line` you have actually opened, or don't make the claim. The only thing that has ever caught these is a hostile reviewer told to assume a false claim exists. **v5.1.0 continues the pattern and is recorded here by the session that wrote it:** while fixing `cmd_push_docs` on 2026-09-04 the author asserted that co-tenant commits could reach production unscanned (false — the server-side `main-privacy-gate` ruleset refuses them; the cost was always a wasted run, never a leak), aimed the first fix at the promote when the defect was at the staging push, and declared an `errexit` bug in his own new code that mutation testing then refused to reproduce. Three retractions in one session; two hostile reviews caught the first two, a mutant caught the third. **A gate that disagrees with you is worth more than your confidence.**

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

`push-docs` only blocks on commits that touch **watched paths** — `WATCHED_PATHS` default near the top of `git-ops.sh`, overridden by `scripts/privacy-watched-paths.sh` when present, which is the source of truth: `docs/`, `features/`, `.claude/commands/`, `CLAUDE.md`, `README.md`, `content/articles/`, `content/sifter/`, `supabase/migrations/`. A push whose range touches **none** of these (e.g. `src/`-only) needs no stamp — skip this step.

Check the push range: `git diff --name-only origin/main..HEAD`.

- **No watched path touched** → skip; go to step 4.
- **Stamp already covers HEAD** (`.privacy-reviewed` == `git rev-parse HEAD`) → already done; go to step 4.
- **Otherwise** → run the **`/maintain:privacy`** skill. It reviews and, if clean, writes `.privacy-reviewed = HEAD`. This must run **after** the commit so the stamp covers it.
  - Clean → stamp written, continue.
  - **HARD flag found** → STOP. Surface the finding; do not stamp, do not push.

### 4. Check the flag BEFORE running the staging hop — ONE ask, with a number

**Do not reach this step until steps 1-3 are DONE.** Committing and the privacy review need no
flag — nothing in them is a push. Asking for `push-on` before them spends the grant on local work
and guarantees a second ask. (2026-09-01: a `/push` that started with ~55 min of flag ran 34 min of
commit + privacy review over 168 commits, then died at the promote step with the flag lapsed.)

**Check `main.lock` BEFORE you ask for the flag.** `push-docs` acquires the lock (`acquire_main_lock` in
`cmd_push_docs`) before the staging push and holds it until exit — across the whole CI poll
(`while (( waited < MAX_WAIT ))`, `MAX_WAIT=600`), so a
co-tenant `/push` or `/ship` can own it for ten minutes while your own wait times out after 120s
(`GIT_OPS_MAIN_LOCK_TIMEOUT:-120`) and dies having pushed nothing. If you ask for `push-on` first,
that dead 2-minute wait is spent out of the user's grant — and it is spent again on every retry.

```bash
ls -l .claude/worktrees/main.lock 2>/dev/null || echo "main.lock: FREE"
```

`git-ops.sh reconcile` does **not** answer this — it classifies per-worktree-slot `.lock` files and
never looks at `main.lock`, so it prints nothing whether the lock is free or held by a live
co-tenant, and "no output" reads as free either way. (Verified 2026-09-01: empty output, exit 1,
with a live holder. A probe that returns the same verdict for both states is blind — global
CLAUDE.md, control-probe rule.) `acquire_main_lock` is the only thing that reports a holder, and it
takes the lock to do it.

- **Lock held by a LIVE session** → do **not** ask for the flag yet. Report the holder and that a
  co-tenant push is in flight, and wait for it to clear. Their run ends with a push to main, so
  re-check your own ahead/behind afterwards — their commits may already include yours.
- **Lock free** → continue to the budget check below.

(2026-09-01, the session next door: window granted, burned by a 2-minute lock wait plus CI polling,
flag lapsed, second `push-on` needed. Same *symptom* as the case above, different *cause* — the
20-minute budget cannot help when the time goes to a lock that was never yours to take.)

**One grant must cover BOTH pushes.** `push-docs` pushes twice — the staging branch, then `main` —
separated by a CI poll budgeted at up to 600s (plus up to 120s of lock wait even when the pre-check
above was clean, since a co-tenant can take the lock between your check and your run). So the question is never "is the flag set" but
**"are there enough minutes left for staging push + CI + promote"**. Budget **45 minutes** — ask for `push-on 60`. MEASURED 2026-09-04: three `audit-privacy` runs on one SHA took 768s, 980s and 793s, so the poll budget is now 2400s (`GIT_OPS_CI_MAX_WAIT`), not the 600s that was throwing away green verdicts. A 20-minute grant cannot cover a scan that reliably takes 13-16.

```bash
_e=$(head -1 ~/.push-enabled 2>/dev/null)
_s=$(date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$_e" +%s 2>/dev/null || date -u -d "$_e" +%s 2>/dev/null)
if [[ -n "$_s" ]]; then echo "remaining_min=$(( (_s - $(date -u +%s)) / 60 ))"; else echo "remaining_min=none"; fi
```

- **`remaining_min` >= 20** → proceed to step 5 immediately. Do not do any other work first.
- **`none`, <= 0, or < 20** → **stop and ask ONCE, naming the number** — never a bare "run push-on",
  which grants the 30 min default and lands you back here mid-CI:

  > N commit(s) committed and privacy-stamped, ready to push. Run **`push-on 60`** and I'll take it
  > from there — staging hop, CI, and the promote to main, no further input. I can't set the flag
  > myself; it's your authorization, not mine.

  `push-on` caps at 120 min (`PUSH_MAX_TTL_MIN`, `~/.zshrc`), so 60 is accepted as-is.

**Never ask a second time in one `/push`.** If the grant lapses mid-run anyway, that is the
`--resume` case in step 5 — CI is already green on this SHA and is not re-run; you still need one
fresh grant, but say that plainly.

### 5. Run the staging hop

```bash
PUSH_DOCS_ASSUME_YES=1 ./scripts/git-ops.sh push-docs
```

Deterministic: **snapshot pin** → privacy-coverage check → `main.lock` → staging push to `staging/doc-<short-sha>` → `audit-privacy` CI poll → promote → staging cleanup. `PUSH_DOCS_ASSUME_YES=1` silences only the script's own `y/N`; with the flag FRESH the pre-push waiver handles the rest, and it runs unattended end to end.

**Everything runs on ONE pinned snapshot SHA — `main` is never re-read (2026-09-04).** Step 0 resolves `$local_sha` once and every later stage uses it: the ahead-count, the branch NAME, the staging push (`${local_sha}:refs/heads/<branch>`) and the promote (`${local_sha}:refs/heads/main`). Before this, `cmd_push_docs` resolved `main` live at five points across a 15-20 minute run on a checkout whose median gap between watched-path commits is ~16 min, so the staging branch was pushed at one SHA while the poll waited on another, never matched, and died at `MAX_WAIT`. Do not "simplify" any of these back to `main`; `scripts/test-push-snapshot-pinning.sh` fails the commit if you do.

**A push therefore ships the REVIEWED snapshot, not "everything on main right now."** If HEAD has run ahead of the `.privacy-reviewed` stamp, Step 0 **retreats** the snapshot to the stamp and says so, and those later commits ship on the next run — instead of aborting and forcing a re-review (measured at 34 min over 168 commits). Report the deferred count to the user; do not treat it as a failure.

**The CI freshness baseline is stamped BEFORE the staging push** — GitHub starts the workflow when the ref lands, mid-push, so a baseline taken afterwards is later than our own run's `started_at` and the poll rejects its own green scan. Measured 2026-09-04: `audit-privacy` concluded SUCCESS at 09:47:53 on the pinned snapshot and the run still died with `origin/main` unmoved. It is stamped *after* the `--resume` delete, so a prior run's check-run is still correctly rejected.

Cleanup runs **only after a successful promote** (`push-docs [6/6]`), so every aborted run **leaks one remote branch** — the script prints the delete command on the `n` path but *not* on a hook failure.

**Recovery if the run aborts after the staging push (the flag-expired case) — use `--resume`:**

```bash
./scripts/git-ops.sh push-docs --resume     # after a fresh push-on
```

`--resume` **deletes the leftover staging branch and re-pushes it**, so GitHub fires a fresh `push`
event and a fresh full-range `audit-privacy` run. That is the actual deadlock: re-pushing the same
SHA onto an existing ref is a no-op update, no event fires, no run is ever created, and a plain
re-run therefore polls until `MAX_WAIT` and dies — which is what forced a second `push-on`.

**`--resume` REPLAYS the aborted run's snapshot from `$GIT_COMMON_DIR/.push-docs-resume`; it does
not re-derive one (2026-09-04).** It must, because the Step-0 retreat depends on the privacy stamp
and the stamp moves whenever `/maintain:privacy` runs — including from `/day`, `/kdd`, or a
co-tenant. A resume that recomputed the snapshot computed a *different* branch name, `ls-remote`
missed the branch the aborted run had actually left on origin, and it died "no staging branch —
drop `--resume`" while orphaning that branch permanently: the recovery path broken by the exact
condition it exists to recover from. It now refuses when the run state is missing, malformed, or
names a SHA this repo does not have, and clears the state on success.

**It does NOT reuse the green run that already passed on that SHA, and neither should you.**
`audit-privacy` scans a **range computed from the event** (`privacy-scan.yml`, "Compute scan range"
— `pull_request` → `base..head`, a re-push → `before..after`, a new ref → full `origin/main..after`),
and the workflow runs on `pull_request` as well as `push`. So a green check-run on your exact SHA
may have scanned an empty or narrow diff, and accepting it by `head_sha` alone would promote
content nothing ever scanned — past the P919 required check, which that run satisfies. The poll's
freshness guard is what binds the verdict to *our* full-range push; it stays enforced on every
path, `--resume` included. (This exact relaxation was written, reviewed, and removed on
2026-09-01.)

The staging branch is cleaned up by the successful `--resume` run itself. If you must delete one by
hand, note the deadlock: `git push origin --delete` *is* a push, so a flag-expiry abort blocks
its own cleanup. Do not loop on it — report the branch name and fold it into the same single
`push-on` ask.

**Check containment against LOCAL `main`, not `origin/main`.** An aborted run means the main push never happened, so the staging tip is a *descendant* of `origin/main`, never an ancestor — `--is-ancestor <sha> origin/main` returns 1 in exactly the situation you're trying to clean up, and reads as "unsafe to delete" forever:

```bash
git merge-base --is-ancestor <sha> HEAD && echo "contained in local main — safe to delete"
```

A `staging/doc-*` branch is only ever a copy of local `main` at push time, so once it is contained in your local history, deleting it loses nothing. (After a *successful* push the branch is already gone — the `push-docs [6/6]` cleanup block — so any surviving `staging/*` is by definition from an abort.)

**Real blockers (surface, don't auto-resolve):** `audit-privacy` CI **red** (content is not publishable — never `--force`), privacy coverage gap, staging push rejected (behind origin), `gh` not authenticated.

**What stays protected:** the server-side `audit-privacy` check on main is the real boundary (P919 — *documented*; the branch-protection API returns 403 to the local `gh` token, so "required" is not verifiable from here. Do not restate it as confirmed). Layer 1's PII scan runs on every ref regardless of the flag. `PUSH_DOCS_ASSUME_YES` applies to `push-docs` ONLY — never `ship-to-prod`, whose `Confirm prod push? (y/N)` + `exec < /dev/tty` in `cmd_ship_to_prod` has no `ASSUME_YES` escape at all.

**Never hand the user `! <command>` as a workaround.** Claude Code's `!` bash mode is **not** a TTY: `push-docs` dies at the `[[ -t 0 ]]` guard in its promote step, and the pre-push hook's `/dev/tty` read fails the same way. If the flag is unavailable, the fallback is the user running it in a **real terminal** — not `!`.

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
| two `push-on` asks per push (one burned on local work, one on the CI poll) | one ask, after the local work, sized to cover both pushes (step 4) + `--resume` when it still lapses (step 5) |

**Honest contract:** with `~/.push-enabled` set, `/push` runs end to end and pushes to main. Without it, `/push` does everything up to the push and asks the user for one word — `push-on` — never a push procedure, and never `!`.
