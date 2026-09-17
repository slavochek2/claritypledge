---
status: week
type: task
rank: 107
workstream: infrastructure
created_date: '2026-09-17'
tags: [day, subagents, context, browser-automation]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1328: /day runs out of context because it refuses to delegate, on a premise that is false

## Problem

**Situation:** `/day` is one dispatcher (`~/.claude/commands/day.md`) that invokes the ClarityPledge
sub-day (`day-cp.md`) and the CM Events refresh inline in the main conversation. The founder runs it
on Sonnet.

**Complication:** It keeps running out of room and dropping work.

> Founder, 2026-09-17, verbatim: "So we tried to fix that they execute everything, but it doesn't.
> It's continuously ... complaining that it runs out of context."

Measured from that morning's `/day` transcript:

| Point in the run | Main-session context |
|---|---|
| Before any step (system, tools, rules) | 115K tokens |
| After `day.md` (65 KB) and `day-cp.md` (72 KB) load | 160K |
| End of session | 286K |

The CM Events browser scrape was abandoned at 2 of 7 Todo.Today pages. The run declined to delegate
because four places say subagents cannot use MCP: `.claude/rules/skills.md:80,90`,
`.claude/commands/slava/build/finish/criteria/skills.md:17`, and `day.md` Steps 1 and 8 (outside this
repo). When the founder asked "you can spin subagents?", the agent quoted that rule back.

**That premise is false.** Verified 2026-09-17 by live probe, raw tool results read, not agent
summaries: a Sonnet subagent loaded the claude-in-chrome, playwright and chrome-devtools schemas,
created its own tab group, navigated, ran `javascript_tool` including top-level `await`, and closed
the tab. The main session, as a control, got the identical `tabs_context_mcp` response.

The scrape is also the largest single sink, and for a mechanical reason: a `javascript_tool` result
is truncated at about 1 KB (`[TRUNCATED]`, measured), so the skill drains events four at a time
through the model, roughly 150-200 calls. Measured alternatives, same day:

- `get_page_text` returned a 21,001-character payload intact in one call.
- One `javascript_tool` call loaded all 7 Todo.Today dates through same-origin iframes: 118 events,
  every card's date matching its page. Control: 2026-09-19 by direct navigation had 29 cards, the
  iframe had 29.
- Sola detail-page times load the same way (3 of 3 distinct times), so one call replaces one page
  load per event.

Found in the same pass: the Agent VM heal pointer (`~/.claude/commands/slava/util/agent-vm-heal.md`)
invokes `/lh-heal`, a command local to another repo, so a `/day` session in this repo can never reach
it. Run by path in dry mode, the heal script printed nothing and exited 0 while the app reported
NOT READY.

**Question:** Move the bulky, mechanical work out of the main session so a pass fits, without losing
any of the completion checks P1205/P1206/P1324 built.

## Appetite

Blast radius: medium. Every `/day` pass, but the ledger and day-gates stay the arbiters of whether a
pass completed. Reversibility: high, prose and extractor changes in versioned repos. Decision density:
zero founder decisions. The founder delegated the design ("I trust your expertise and decisions").

## Invariants

- A pass's completeness is still graded by artifacts, never by what a subagent says: the step ledger
  (`$DAY_STEP`), `day-gates.sh --mode=subday-return|verify|finish`, and the push receipt (decisions.md
  2026-09-01, P1205).
- The cm-events skill remains the sole owner of the browser scrapes. Subagents are its workers, not a
  second path around it (decisions.md 2026-09-01, "a verifier, not a performer").
- A due browser source that did not complete is a loud failure, never a skip (strict `/day` mode).
- Scrape data does not pass through the dispatcher's context; only result lines return.

## Solution

1. **Correct the premise everywhere it is written**, citing the probe.
2. **Sub-days run in a subagent.** Step 1 spawns one subagent per discovered sub-day. It invokes the
   sub-day skill with `$SINCE`, `$DUE_VERDICT` and `$DAY_STEP`, and returns the sub-day's printed
   blocks and HEALTH rows. The dispatcher relays them verbatim. A question the sub-day would have
   asked the founder (Branch Status) is returned as a question and asked by the dispatcher. The
   ledger is file-based, so steps record exactly as before.
3. **Each due browser source is scraped in its own subagent**, launched by the cm-events skill. It
   returns only the writer's result line or a named failure. Extraction uses the bulk channel: one
   in-page call collects every page through same-origin iframes, and `get_page_text` carries the
   payload out. The writer takes the in-page event count and refuses a raw file that disagrees, so a
   truncated or mistyped transfer fails instead of publishing a partial week. The drain one-liner
   stays documented as the fallback.
4. **The Agent VM heal runs the workload repo's heal script by path.** That script names an unmatched
   NOT READY and exits non-zero, and so does a run that attempted nothing (a held lock) or a readiness
   check that failed to run.
   **Changed during build:** `ready`'s verdict on a staged newer runtime is left as NOT READY. That
   repo's 2026-09-16 note keeps the check, its autoheal escalation keys on the verdict, and flipping
   it deserves its own look. The staged skew itself is the founder's call, because the remedy
   (`./lh update`) restarts the container and interrupts a running campaign.

**Why not Gemini** (the founder asked): the delegation lane `~/.agents/bin/delegate-gemini` is a text
REST call. It cannot drive Chrome, call MCP, run the ledger, or read the machine, and the scrape and
the health waves are exactly that. It remains the right lane for text-only bulk (summarising a
transcript), none of which is on `/day`'s critical path today.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A subagent returns a partial report that reads complete | MITIGATE | `day.md` Step 1 runs `day-step.sh missing` filtered to the sub-day's ids right after the reply; `--mode=finish` grades again at Step 11. (`--mode=subday-return` checks continuity only; the first draft said otherwise, and the review caught it) |
| A subagent self-attests an `attest` step it did not really do | ACCEPT | Unchanged from inline runs: attest steps were always the agent's own statement (P1324). `cmd` steps record real exit codes |
| An overdue `/weekly` inside the sub-day cannot hear "skip" | MITIGATE | The dispatcher announces it before spawning, while an interrupt still stops it |
| A question for the founder is answered after the sub-day's step was recorded | ACCEPT | Only Branch Status asks, and its question is informational (apply/drop a stash) |
| A copy that keeps its length but corrupts content | MITIGATE | The count is distinct complete rows; Todo.Today rows must fall in the scraped week |
| A partly hydrated day is read as complete | MITIGATE | Count must hold for 3s; foreign-dated cards or an empty day (except day 0) render no payload. A page that hydrates a stable subset for >3s is still possible — ACCEPT, no in-page signal distinguishes it |
| Sola's first time-range leaf is venue hours, not the event | ACCEPT | Same heuristic as the pre-existing detail extractor; no instance observed (24/24 plausible on 2026-09-17) |
| A count refusal leaves no failure row in scrape history | DEFER | The recorder exists only in an uncommitted working copy of `scrape_guard.py`; the RESULT/FAILED line and Step 8b's unchanged-cache check still surface it |
| Concurrent subagents collide in one Chrome | MITIGATE | Probed: each subagent gets its own tab group. Sources still run one at a time |
| The model mistypes the payload when writing the raw file | MITIGATE | Writer `--expect N` refuses a count or content mismatch |
| `get_page_text` truncates a larger week | MITIGATE | Same count check. Drain fallback documented |
| Subagent context still fills on a very large Facebook page | ACCEPT | It is isolated from the dispatcher; the failure is per source and loud |
| iframe loading breaks if a site adds `X-Frame-Options: DENY` | DEFER | The count check fails loudly; the drain fallback is the path |

**Non-Goals**
- Do NOT change what any check measures, or any gate's verdict logic. (heal.sh's exit codes are the exception, and only toward louder: states that were exit 0 without being "nothing needed or verified".)
- Do NOT split `day-cp.md` into multiple files (P1324's check-sync pairs one manifest with one doc).
- Do NOT extend the heal whitelist with a new repair.

## Done-When

- [x] `grep -rn "no MCP access"` over this repo's `.claude/`, `~/.claude/commands` and `~/.claude/CLAUDE.md` returns nothing; the corrected wording cites the 2026-09-17 probe — empty on this branch and in `~/.claude`; control: the same grep on unshipped main still finds both lines. `[post-deploy]` re-run on main after ship
- [x] Writer `--expect` refuses a raw file whose count disagrees (exit 1, message names both counts), proven by a test that feeds it a truncated copy of a real payload; the correct count still writes — `test_payload_count.py` 20/20, hermetic, real payloads for both sources; also refuses count-preserving corruption and a shifted week; the mutant with the check removed fails 11
- [x] The Todo.Today week and Sola extractors run end to end in a subagent against the live sites and their writers report the counts the pages show — final brief text, 2026-09-17: todo_today 117 (per-day 10/23/29/13/9/17/16, identical to an independent drain run), sola 24/24 timed, both "page count checked"; facebook 13 from 11 raw cards with an empty venue page skipped
- [x] A dry heal from a claritypledge session prints a verdict, and an unmatched NOT READY exits non-zero (test in the workload repo) — live dry run against the VM: exit 1 naming the staged skew; heal-decisions 60/60, red before each fix
- [x] The pieces a real pass depends on are verified in isolation: subagents drive Chrome and spawn subagents (live probes), all three browser briefs pass live, ledger check-sync OK for both manifests, `day-step`/`day-gates`/`day-pass-guard` suites 57/134/40, the sub-day-steps probe names an unrecorded step and warns with no ledger. `[post-deploy]` one real `/day` on Sonnet — every ledger step recorded, all due sources refreshed, `--mode=finish` clean, peak context reported against the 286K baseline — is the founder's next `/day`

## Alternatives Considered

- **Split `day-cp.md` so only its health waves run in a subagent.** Rejected: breaks P1324's one-doc check-sync, and the dispatcher would still load the rest of the file.
- **Download the payload as a file from the page.** Rejected: a browser download is a per-session permission and a screen effect every morning, and it adds Chrome's multiple-downloads prompt.
- **POST the payload to a localhost receiver.** Rejected: page CSP and Chrome's local-network-access prompt; the extractor's own header records the localhost channel as blocked.
- **Keep everything inline and trim prose.** Rejected: the skill text is 47K of the 286K. The scrape and tool output are the rest.

## Rollback Strategy

Each change is a commit in its own repo (`~/.claude`, this repo, `beeper-digest`,
`linked-helper-docker`). Reverting the `day.md` Step 1/8 commit restores inline dispatch; the
extractors are additive files and the writer flag is optional.

## Related

- P1205, P1206, P1324 — the completion checks this must not weaken
- P1327 — filed in the same pass from the same `/day` findings
