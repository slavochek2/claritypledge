---
status: all-done
type: task
rank: 354
workstream: infrastructure
created_date: '2026-11-19'
tags: [claude-md, process, monthly-review]
disclosure: public
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
spec_review_hash: 4bdbad15aa6e5b54b6e73ae2a334693be7403b5cbe1171008c01597d73aa3130
spec_review_vendors: [codex, gemini]
completed_at: 2026-11-19
---

# P1713: Six rule fixes from the 2026-11 monthly review, so the founder stops doing the agent's bookkeeping

## Problem

**Situation:** The 2026-11-19 `/slava:maintain:monthly` review read the user turns of 491 sessions (2026-10-09 → 11-19). Four analysts reported, and their key counts were re-derived by command in the review session.
**Complication:** The founder is doing work the agent should do:
- a close-out question (can I close, is KDD needed, commit?) appears in **113 sessions** (175 lines);
- one-word nudges to continue or to ask whether something works appear about 200 times;
- 9 of the top 10 false-confidence cases were links, servers or "fixed" claims handed over without the agent exercising them.

The close-out fix was proposed by the 2026-10-21 monthly too and never applied. Separately, CLAUDE.md contradicts sibling rules on commits to main and on installs, and publishes a personal working-style line in a public repo.
**Question:** Which rule edits cut the founder's bookkeeping and remove those contradictions, without adding stops? The counts are reported observations. The 113 sessions pool close, KDD and commit questions, and the continue/working counts concern in-progress work, which this spec does not address. This is a trial measured at the next monthly, not a proven causal fix.


> Founder, 2026-11-19, approving all six: "want to spec it and then review the spec with these models and then be the orchestrator … develop and then review again and then KDD ship commit."

## Appetite

Blast radius: medium to high. CLAUDE.md loads into every cp session, and a badly worded rule misdirects every agent. Reversibility: high (git revert of text). Decision density: low. The founder approved all six on 2026-11-19. The spec review (Carbon + Codex) reshaped the wording of all six and narrowed 5 and 6; the founder's goals for each are kept.

## Solution

Six text edits, made **in place** wherever possible so `CLAUDE.md` stays at or under 345 lines. Each CLAUDE.md or `.claude/rules/` edit passes `/slava:maintain:claude-md` first.

1. **Handoff line (replaces `CLAUDE.md` "After ship/deploy-adjacent work…" in Commit Discipline).** At the final handoff of implementation or operational work, end with one line, `Handoff: nothing open`, or `Handoff: open — <item, who owns it, can it wait>; <next item>…`. Items: uncommitted files, unpushed commits awaiting the founder's push, `/kdd` not run, prod deploy pending, dev server left on :PORT for UAT. Complete authorized close-out work first instead of listing it. Never kill a server the founder needs for UAT to make the line clean. When the founder asks "can I close?", answer directly. After ship/deploy-adjacent work, also say whether the change is live in prod or still local/staged (the old line's duty is kept). The label is `Handoff:`, not `Close:`, because the Stop hook already uses `Close:` to mean closing a spec.
2. **Prove the handover (folded into `CLAUDE.md` Evidence Over Declaration, in place).** Before handing over a URL, dev server or "fixed" claim, exercise the exact route or behavior in the intended environment yourself (for a URL: that host, port and path, following any redirect to its final destination) and paste the result. Never open a one-time link meant for the founder or any other recipient: the confirm route exchanges the token for a session, so opening it spends it. Verify with a separate test credential, or state that the link itself is unverified. Keep credentials out of the pasted output.
3. **Commit paths (the staging-and-commit clause of Commit Discipline, replaced in place).** In a private worktree: inspect the staged set, stage explicit paths, commit without path arguments. Lint runs as `npx --no-install eslint --fix` so it cannot fetch a package. For an authorized direct commit from the shared main checkout: `./scripts/git-ops.sh commit-to-main --message "..." --files <paths>`, which does the staging. Index ownership and failure handling stay in `.claude/rules/git.md`.
4. **Installs are ask-first.** Delete both npm entries from ALWAYS-ACT (devDependencies) and JUDGMENT (dependencies). Add to ALWAYS-ASK: installing software via any package manager, including project dependency installs. Explicit approval of the install satisfies the gate, so there is no second confirmation. Reasons: the global rule covers "any package manager command that installs new software anywhere", and a worktree install mutates the `node_modules` symlinked from the main checkout (decisions.md, the 2026 browser-version consequence).
5. **Personal working-style line leaves the public repo.** Delete the personal working-style bullet from `CLAUDE.md` Working Style Patterns, and remove the `docs/process-learnings.md` link that points at it (other references stay). Separately, add a neutral, name-free form to the founder's private global instructions; its wording is not recorded in any public file
6. **Reviewer rosters: a pointer, not an announcement.** In `.claude/rules/model-effort.md`, change the header "Three cp facts that rule doesn't cover" to "cp-specific facts that rule doesn't cover", and add one bullet: the spec-review roster lives in `/create-spec` § Spec Review and the build-review roster in `/finish` Step 4b, and both apply by default at review time. The founder names only deviations; an explicit founder instruction changes which reviewers run, never a skill's evidence or disclosure requirements. No task-start announcement, and no model names copied.

## Invariants

- `/finish` Step 4b remains the single home of the end-of-build reviewer roster (decisions.md 2026-10-16). Change 6 points at it and never copies it.
- No change adds a new stop or confirmation step beyond the install ask the global rule already requires. The global rule "Don't stop to report progress or re-confirm an approved direction" outranks anything added here.
- No public file or commit message carries the private wording of change 5.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The handoff line becomes noise | MITIGATE | Only at the final handoff of implementation or operational work, not on ordinary answers |
| Verification spends a one-time link | MITIGATE | Change 2 forbids opening the founder's link and names the alternative |
| Install ask surfaces where agents relied on the local exception | ACCEPT | The global rule already required it; one approval covers the install |
| Rules text alone does not change behaviour (last month's lesson) | DEFER | Next monthly compares the share of eligible handoffs followed by a close question, same inclusion criteria, before any enforcement hook is considered |

**Non-Goals**
- Do NOT build the progress heartbeat, context-% handoff hook or lab-server restart tool.
- Do NOT rewrite Quality Over Build Speed or the commit regime beyond change 3.
- Do NOT touch `/finish`, `/create-spec` or the simplify contract copies.

## Done-When

- [x] Handoff: `CLAUDE.md` Commit Discipline carries the `Handoff:` rule in place of the old "After ship/deploy-adjacent work" line, including the UAT-server and "answer directly" clauses; no `Close:` label added
- [x] Prove: Evidence Over Declaration requires checking the exact destination before handover and forbids opening the founder's one-time link
- [x] Commit: the staged diff shows the raw stage-and-commit sequence scoped to private worktrees, and `commit-to-main --message --files` named for the shared main checkout
- [x] Installs: `grep -n "npm install" CLAUDE.md` shows no hit in ALWAYS-ACT or JUDGMENT, and ALWAYS-ASK covers package-manager installs with "explicit approval satisfies the gate"
- [x] Personal line: the personal working-style bullet is gone from CLAUDE.md (checked by grep for the old label). `[post-ship]` the stale process-learnings link to it is left for a follow-up, because that file was mid-edit by another session at ship time; the neutral form is in the private global instructions (verified by grep, not recorded in any public file)
- [x] Rosters: `model-effort.md` header no longer says "Three", the pointer bullet names both skills, and no task-start announcement or model list is added
- [x] Behaviour cases walked against the final text, expected vs observed recorded in the KDD entry: ordinary answer (no line), UAT handoff (open — server kept), unpushed commit awaiting push (open — founder), wrong-port endpoint (caught before handover), one-time founder link (left unused)
- [x] `/slava:maintain:claude-md` run against each final rules-file diff; `./scripts/pre-commit-checks.sh` run with the files staged shows `CLAUDE.md within budget`

## Alternatives Considered

- **A Stop hook enforcing the handoff line now.** Deferred until the next monthly shows whether the text alone moved the share.
- **The close line in `/ss` only** (last month's proposal). Rejected: the founder asks before running `/ss`.
- **Dropping change 6 entirely** (Codex). Rejected in favour of the pointer: the founder's goal is to stop retyping the roster, and a pointer costs one bullet without an announcement.
- **Moving the personal line unchanged** (the original change 5). Rejected after review: unchanged, it would broaden a scope-question interrupt to every project.

## Rollback Strategy

`git revert` of the commit. Revert the global-instructions line by hand; it is one line and is not recorded publicly.

## Related

- P1209 and P1279: commit-to-main recorded the wrong file set (why change 3 names the tool and leaves failure handling to git.md)
- Spec review 2026-11-19: Carbon (9 findings) and Codex (8 findings); outputs in the session scratchpad
