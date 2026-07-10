---
name: analyze-demo-meeting
description: Analyze a 1:1 founder interview / demonstration-discovery meeting transcript (customer dev where the product IS the conversation) for signals, strategy impact, product ideas, relationship next steps, AND a mode-aware critique of how you ran it. Modes — discovery (Mom Test lens), demo (Demonstration Critic), mixed (segment + apply per-segment; default). Compounds per-person over time.
when_to_use: After a founder interview, discovery call, or any 1:1 where you ran customer development AND/OR demonstrated the product live. Renamed from analyze-discovery (2026-07) — demonstration-discovery is now the default interview shape. NOT for product practice-session transcripts (that's /analyze-transcripts). NOT for batch Claude.ai review (that's /claude-conversations-to-cp).
version: 2.0.0
---

# /analyze-demo-meeting

Analyzes a single 1:1 meeting to extract what you learned, map it onto strategy, surface product ideas, plan the next step, and critique your own technique — mode-aware, because your product is a conversation, so discovery and demonstration often collapse into one act.

**Customer development, not product analytics.** The unit is one human. Output compounds into a per-person dossier under `.private/docs/business/`.

## Usage

```
/analyze-demo-meeting ~/video-edits/<person>*.md            # mode defaults to mixed
/analyze-demo-meeting mode:discovery ~/Downloads/<p>.txt    # pure Mom Test critique
/analyze-demo-meeting mode:demo ...                         # Demonstration Critic only
/analyze-demo-meeting                                       # asks for path(s)
```

Multiple files = **one conversation split into parts**, concatenated in filename order.

**The three modes (they only change Agent C, the critique lens):**
- `discovery` — pure Mom Test. Judges: avoided pitching, listened > talked, past-behavior facts.
- `demo` — Demonstration Critic. The product IS the conversation; you're *supposed* to talk and lead. Judges the demonstration.
- `mixed` (default) — segment the transcript by mode and apply the right lens per segment (Mom Test on discovery portions, Demonstration Critic on demo + convert portions). Most founder interviews are mixed.

## Phase 0 — Runtime setup (main agent)

1. **Locate + read transcripts** in full. Confirm they form one conversation. Parse `mode:` if given (default `mixed`).
2. **Size check.** If total > ~120 KB, pass the full transcript only to Agent C (needs verbatim breadth); build a dense extract for A/B and say so.
3. **Resolve speaker identity** — which speaker is the founder (Slava) vs the counterpart. Ask if ambiguous. The critique and commitment read are invalid without it.
4. **Identify person + goal** (ask once): who, role/company, what you want from the relationship (customer / partner / coach / referrer), any next step on the table.
5. **Resolve the dossier path against the REAL tree** (`.private/docs/business/{coaches|partners|...}/`). `ls` the dir; if `{slug}.md` exists, READ it and conform to its structure. Never invent folders. Show the merged dossier before overwriting.
6. **Read the OBJECTIVE + strategy** (inline into subagents — no disk access): `.private/docs/business/discovery-questions.md` §OBJECTIVE (the ICP-5, the falsifier, the 7, the stop rule — **Agent C critiques against this**), `docs/lean-canvas.md`, `docs/hypotheses.md`, `docs/definitions.md`.
7. **Save a COPY of the raw transcript** to `.private/docs/business/{category}/{slug}-transcript-{YYYY-MM-DD}[-partN].{ext}` — PII, `.private/` only, never public. (A copy: the production original stays in `~/video-edits`.)

## Phase 1 — Three subagents + main-agent synthesis

Agents A, B, C run in parallel; main agent synthesizes. All file content inlined into prompts.

### Agent A — Signal Extractor + Strategy Mapper (Mom-Test-disciplined + LEV)

**Role:** customer-dev analyst on *The Mom Test*. Facts and past behavior outweigh compliments and future-hypotheticals.

**Task:**
1. **Their world in facts.** Split **HARD signal** (specific past events, real money/time spent) from **SOFT signal** (opinions, compliments, "I would…" → low-weight).
2. **LEV — Live-Experienced-Value signal (NEW).** Moments the counterpart *felt* the product work on them in real time (a gap revealed, confusion→clarity, a "score" moving). LEV sits **between HARD and SOFT** — stronger than a compliment (experienced, not hypothetical), weaker than their own past behavior. Quote each LEV moment.
3. **Convert-check (NEW).** At peak LEV, was a **costly commitment** asked — cash, effort (a page of work), or reputation (a named intro) — whichever fits the offer? Or did it evaporate into polite interest / abstract theory? Name the exact commitment that should have been asked.
4. **Stake + commitment ladder**, **ICP-5 fit** (confirmed vs assumed, with quote), **objections & risks**, **hypothesis evidence** (default INSUFFICIENT unless HARD signal moves it), **problem-statement test** (did they state the problem in their own words, or did the founder explain it?).
5. **Candidate doc edits** — drafted for `/slava:maintain:docs-strategy-update` to gate. Never assert on n=1.
6. **Verbatim** — 8–12 quotes, each tagged HARD / SOFT / **LEV**.

### Agent B — Blindspot Hunter (hypothesis-blind)

**Input STRICT:** transcript + `definitions.md` verbatim only. NO hypotheses/lean-canvas/objective, no "prospect" framing (that leak is the bias). What's surprising? Emotional peaks + triggers? Who they are? Reframes they reach for? Raw product ideas.

### Agent C — Technique Critic (MODE-AWARE — the only part `mode` changes)

**Role:** customer-dev coach critiquing the INTERVIEWER (founder = Slava). Direct, quote-cited. **Critique against the OBJECTIVE in `discovery-questions.md` (the ICP-5, the falsifier, the 7, the stop rule)** — so when the objective sharpens, this critique sharpens automatically.

- **`mode: discovery` — Mom Test lens.** Scorecard: leading/pitching · fishing for compliments · talk-vs-listen · missed follow-ups · past-behavior vs hypotheticals · the ask/advance. Rewrite the worst questions.
- **`mode: demo` — Demonstration Critic.** The product is a conversation; talking and leading are expected. Scorecard: **time-to-demonstration** (how many min before a live gap-reveal? aim ~5) · **demonstration quality** (did the gap land as *felt* experience or stay intellectual?) · **entry point** (concrete high-stakes conversation vs generic business archaeology) · talking = **demo or ramble?** (not penalized per se) · leading = **to their OWN gap or imposed?** · **stop-rule adherence** (did they name concepts + show a live instance, or *teach the model*? teaching = violation) · **the convert** (at peak LEV, a clean costly ask, or diluted into theory?). Rewrite the worst moments.
- **`mode: mixed` (default) — segment, then apply per-segment.** Split the transcript into discovery / demonstration / convert segments; score discovery portions with the Mom Test lens and demo+convert portions with the Demonstration Critic. State the segment boundaries.

### Main-agent synthesis

Merge A + B + C (+ prior dossier). **Weight HARD > LEV > SOFT.** Sections: what we learned · longitudinal diff (if prior) · product ideas (HARD-gated; enthusiasm-only flagged) · doc impact (n=1 caveat) · next steps + gated draft follow-up · priority actions (top 3–5).

## Phase 2 — Write two artifacts

- **Dossier** → `.private/docs/business/{category}/{slug}.md` (conform to existing structure if present; show merged before writing).
- **Dated deep analysis** → `.private/docs/business/{category}/{slug}-analysis-{YYYY-MM-DD}.md` (never overwritten). Sections: TL;DR · What We Learned (HARD/LEV first) · Longitudinal Diff · ICP-5 Fit & Stake · Strategy Impact · Blindspots · Product Ideas · Objections & Risks · **How I Ran This (mode-aware critique) — scorecard + rewritten questions + convert-check** · Next Steps (gated) · Priority Actions · Appendix quotes (HARD/SOFT/LEV).

## Guardrails

- `.private/docs/business/` only (PII). Follow the real tree; don't invent folders.
- Never silently overwrite a dossier — show the merge.
- **HARD > LEV > SOFT.** n=1 honesty (INSUFFICIENT default; doc edits are candidates → the gate).
- Agent B is hypothesis-blind (transcript + definitions verbatim only).
- Speaker identity resolved before any agent runs.
- Save a **copy** of the transcript to `.private`; the production original stays in `~/video-edits`.
- Gated outputs: doc edits → `/slava:maintain:docs-strategy-update`; follow-up message → draft only.
- After completion, append one line to `.private/logs/skill-costs.log`: `<ISO> | analyze-demo-meeting | <model> | <mode>`.
