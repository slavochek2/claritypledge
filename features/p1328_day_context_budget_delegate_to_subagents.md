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
   NOT READY and exits non-zero. A staged newer runtime is reported as a warning, not NOT READY, which
   is that repo's own recorded conclusion of 2026-09-16.

**Why not Gemini** (the founder asked): the delegation lane `~/.agents/bin/delegate-gemini` is a text
REST call. It cannot drive Chrome, call MCP, run the ledger, or read the machine, and the scrape and
the health waves are exactly that. It remains the right lane for text-only bulk (summarising a
transcript), none of which is on `/day`'s critical path today.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A subagent returns a partial report that reads complete | MITIGATE | The ledger and `day-gates --mode=subday-return` grade the steps, not the report |
| Concurrent subagents collide in one Chrome | MITIGATE | Probed: each subagent gets its own tab group. Sources still run one at a time |
| The model mistypes the payload when writing the raw file | MITIGATE | Writer `--expect N` refuses a count mismatch |
| `get_page_text` truncates a larger week | MITIGATE | Same count check. Drain fallback documented |
| Subagent context still fills on a very large Facebook page | ACCEPT | It is isolated from the dispatcher; the failure is per source and loud |
| iframe loading breaks if a site adds `X-Frame-Options: DENY` | DEFER | The count check fails loudly; the drain fallback is the path |

**Non-Goals**
- Do NOT change what any check measures, or any gate's verdict logic.
- Do NOT split `day-cp.md` into multiple files (P1324's check-sync pairs one manifest with one doc).
- Do NOT extend the heal whitelist with a new repair.

## Done-When

- [ ] `grep -rn "no MCP access"` over this repo's `.claude/`, `~/.claude/commands` and `~/.claude/CLAUDE.md` returns nothing; the corrected wording cites the 2026-09-17 probe
- [ ] Writer `--expect` refuses a raw file whose count disagrees (exit 1, message names both counts), proven by a test that feeds it a truncated copy of a real payload; the correct count still writes
- [ ] The Todo.Today week and Sola extractors run end to end in a subagent against the live sites and their writers report the counts the pages show
- [ ] A dry heal from a claritypledge session prints a verdict, and an unmatched NOT READY exits non-zero (test in the workload repo)
- [ ] One real `/day` pass on Sonnet: every ledger step recorded, all due browser sources refreshed, `day-gates.sh --mode=finish` clean. Peak main-session context, read from its transcript, reported against the 286K baseline. `[post-deploy]` this is the founder's next `/day`

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
