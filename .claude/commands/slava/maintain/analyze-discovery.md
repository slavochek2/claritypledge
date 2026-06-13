---
name: analyze-discovery
description: Analyze a 1:1 discovery / customer-development conversation transcript (potential partner, coach recruit, customer, investor, advisor) for signals, strategy-doc impact, product ideas, relationship next steps, AND a Mom Test critique of how you ran the conversation. Compounds per-person over time.
when_to_use: After a discovery call, partner conversation, coach-recruitment interview, or any 1:1 where you were doing customer development. NOT for product practice-session transcripts (that's /analyze-transcripts). NOT for batch Claude.ai session analysis (that's /claude-conversations-to-cp).
version: 1.0.0
---

# /analyze-discovery

Analyzes a single 1:1 discovery conversation to extract what you learned, map it onto strategy, surface product ideas, plan the relationship's next step, and critique your own interviewing technique against The Mom Test — so the next conversation is sharper.

**This is customer development, not product analytics.** The unit is one human you spoke with, not aggregate session data. Output compounds into a per-person dossier under `.private/docs/business/`.

## When NOT to use this
- Product practice-session transcripts (creator+joiner doing /live) → `/analyze-transcripts`
- Batch Claude.ai conversation review → `/claude-conversations-to-cp`
- Reviewing a thing that already exists for flaws → `/slava:think:adversarial-review`

---

## Usage

```
/analyze-discovery ~/Downloads/<person>*.txt      # one or more files = ONE conversation
/analyze-discovery                                 # asks for the transcript path(s)
```

Multiple files are treated as **one conversation split into parts** (e.g. `part1`, `part2`), concatenated in filename order. Do not analyze them as separate conversations.

---

## Phase 0 — Runtime Setup (main agent, before any subagent)

Auto-detect what you can; ask once for what you can't. **No flags.** Do not skip the asks below by guessing — a wrong guess corrupts the saved file.

1. **Locate + read transcripts.** From args, or ask. Confirm the file list forms one conversation. Read all of them in full (not `head`).

2. **Size check (prevents the agent prompt from overflowing).** Sum the byte size. **If total > ~120 KB** (≈30k tokens), full inlining into multiple subagents will overflow. Do NOT silently truncate. Instead: pass the full transcript only to the agent that needs verbatim breadth (Mom Test Coach), and for the others build a **dense extract** — the main agent first produces a structured excerpt (all problem/past-behavior/objection/commitment passages + the 20-30 most signal-dense quotes, verbatim, with speaker tags) and inlines THAT. State in the run output that an extract was used and why. (A ~340 KB 2-part transcript → extract path applies.)

3. **Resolve speaker identity.** Determine which speaker is the founder (Slava) and which is the counterpart. If the transcript has no labels, uses "Speaker 1/2", or is ambiguous — **ask the user** which is which. The Mom Test critique (Agent C) and the signal/commitment read (Agent A) are invalid without this. Pass the mapping inline to every agent.

4. **Identify the person + goal (ask once, one message, if not clear):**
   - **Who is this?** (name, role, company, audience/reach if relevant)
   - **What you want from the relationship** — partner / co-founder channel / coach recruit / customer / investor / advisor. Sets the analysis lens.
   - **Primary vs secondary category** if they're more than one (Kai is both a coach AND a customer — file under one, note the other).
   - **Any next step / ask already on the table?**

5. **Resolve the dossier path against the REAL tree (do not invent folders).**
   - People-dossiers live in `.private/docs/business/{coaches|partners}/`. Note: `collaborators/` holds *agreements*, not person dossiers — don't file people there. Category filing is loose in practice (a coach-prospect may sit in `partners/`); confirm the dir with the user rather than guessing from role.
   - Slug: `{firstname}-{lastname}-{role-or-niche}`, lowercased, hyphenated — matching the existing sibling naming (e.g. `partners/<firstname>-<lastname>-cofounder-coach.md`, `coaches/<firstname>-<lastname>-relationship-coach.md`).
   - `ls` the category dir and, **if `{slug}.md` already exists, READ it** — note its actual structure (it may have a Conversation log, or tables and no log — there is no single template). This run will (a) produce a longitudinal diff, (b) conform to that file's existing structure, and (c) **show the merged file to the user before overwriting** — never silently rewrite a PII dossier.

6. **Read strategy docs** (inline into subagents — they cannot read disk):
   - `docs/lean-canvas.md` (Problem, Solution, UVP, Segments, Channels)
   - `docs/hypotheses.md` (active hypotheses + kill conditions)
   - `docs/definitions.md`
   - `docs/philosophy.md` (the WHY — for fit judgment)
   - Relationship context if relevant: `.private/docs/coach-partner-journey.md`.

7. **Save raw transcripts** alongside the dossier immediately, matching existing naming: `.private/docs/business/{category}/{slug}-transcript-{YYYY-MM-DD}[-partN].txt`. PII — `.private/` only, never the public tree.

---

## Phase 1 — Three Subagents + Main-Agent Synthesis

Agents A, B, C are independent → run in parallel. The main agent then synthesizes (no 4th subagent — synthesis stays with the orchestrator that holds all context). **The main agent inlines all file content into each prompt** (subagents have no disk access).

### Agent A — Signal Extractor + Strategy Mapper (Mom-Test-disciplined)

**Role:** "You are a customer-development analyst trained on Rob Fitzpatrick's *The Mom Test*. Your discipline: **facts and past behavior outweigh compliments and future-hypotheticals.** 'I'd totally use that' is near-zero signal; 'last week I spent 3 hours doing X manually' is gold."

**Input:** Transcript (or extract) + speaker mapping + lean-canvas + hypotheses + definitions + relationship goal.

**Task:**
1. **Their world, in facts.** What they actually do today; problems that *already happened*; current workarounds / spend / tools. Split strictly:
   - **HARD signal** — specific past events, real money/time spent, things already done.
   - **SOFT signal** — opinions, compliments, generic enthusiasm, "I would…" hypotheticals → flag as low-weight.
2. **Stake + commitment ladder (Mom Test "advance").** Did the conversation *advance*? Did they give a real commitment of **time, reputation, or money** (intro, next meeting booked, pilot, money discussed)? Or just polite interest? Name the exact next commitment to ask for.
3. **ICP fit** against the target — confirmed vs assumed, with the anchoring quote.
4. **Objections & risks** — pushback, hesitation, where they went quiet.
5. **Hypothesis evidence.** For each active hypothesis: confirming/contradicting evidence *from this one conversation*, quoted. Default verdict is **INSUFFICIENT** unless HARD signal moves it; only then STRONGER/WEAKER. Note kill-condition proximity.
6. **Problem-statement test.** Did they describe the Problem in their *own* words, or did the founder have to explain it? (Founder explaining it = weak resonance.)
7. **Candidate doc edits** — drafted as candidates only, formatted for `/slava:maintain:docs-strategy-update` to gate. Never assert a doc should change on n=1.
8. **Verbatim** — 8-12 most revealing exact quotes, each tagged HARD or SOFT.

**Output sections:** Hard Signal · Soft Signal (low-weight) · Stake & Commitment · ICP Fit · Objections & Risks · Hypothesis Evidence · Problem-Statement Test · Candidate Doc Edits (gated) · Verbatim.

### Agent B — Blindspot Hunter (hypothesis-blind)

**Role:** "You are a sharp pattern analyst. You succeed by surfacing what's surprising, emotional, or doesn't fit an obvious frame."

**Input — STRICT:** transcript (or extract) + `definitions.md`, **verbatim only**. The main agent must NOT include, paraphrase, summarize, or even reference `hypotheses.md` or `lean-canvas.md` in this prompt — that leak is the bias. Do not tell it what the company is "trying to prove" or call the person "a prospect."

**Task:** What's surprising? Where did they get emotional/energized/defensive, and what triggered it? What did they reveal about themselves (motivations, fears, ambitions)? Reframes or analogies they reached for? Raw, unfiltered product/service ideas this conversation triggers.

**Output sections:** Surprising · Emotional Peaks · Who They Are · Reframes · Raw Ideas.

### Agent C — Mom Test Coach (critiques the FOUNDER, not the counterpart)

**Role:** "You are a customer-development coach. You critique the INTERVIEWER's technique against *The Mom Test*. Be direct and specific — cite quote evidence. Goal: a measurably better next conversation."

**Input:** Full transcript (verbatim — needs breadth, not extract) + speaker mapping (founder = the side being critiqued) + relationship goal.

**Task — score each with quote evidence:** leading questions / pitching instead of asking about their life · fishing for compliments · talk-vs-listen ratio (who talked more, where the founder talked over signal) · missed follow-ups (threads they opened that the founder failed to dig into) · past-behavior vs hypotheticals · the ask/advance (did the founder push for a real commitment, or leave with a vague "stay in touch"). Then a **next-time playbook**: 5-8 concrete improvements, and for the worst questions, **rewrite them** ("Instead of '<what you asked>', ask '<better>'").

**Output sections:** Scorecard (each: rating + quote) · Top Misses · Next-Time Playbook (rewritten questions).

### Main-agent synthesis

Merge A + B + C (+ prior dossier if any). **Weight HARD over SOFT throughout.**
- **What we learned** — merge A + B; where the hypothesis-blind B contradicts/expands A's framed view, surface it.
- **Longitudinal diff** — only if a prior dossier exists: what changed (advanced / cooled / new facts).
- **Product ideas** — consolidate A's signal + B's raw ideas into ONE ranked list. **HARD signal is the gate, not just the sort:** an idea with zero HARD signal is listed but flagged `[enthusiasm-only — unvalidated]`, never ranked above a HARD-backed one. Mark `[FOUNDER DECISION]` on CTA/pricing/naming/positioning.
- **Doc impact** — consolidate A's candidate edits; recommend "run `/slava:maintain:docs-strategy-update` now" only if HARD-corroborated, else "wait for corroboration (n=1)."
- **Next steps** — single best next action + the commitment to ask for (from A's ladder); draft a follow-up message (gated, do not send).
- **Priority actions** — top 3-5. Any action that sends/publishes inherits the draft-not-send gate.

---

## Phase 2 — Write Two Artifacts

The deep analysis is large; the dossier must stay scannable. Write **both**.

### Artifact A — Dossier (entry point) → `.private/docs/business/{category}/{slug}.md`

**If the file already exists:** conform to ITS structure (Kai-style log vs Matthew-style tables — match what's there), refresh the status/fit lines if the new conversation changes them, append a dated entry to its log (or add one if absent), and **show the merged file to the user before writing.** Never silently overwrite.

**If new,** use this default (Kai-style):

```markdown
# {Name} — {role/niche} ({status — one line: "warm — said yes to next step" / "exploring" / "cooled"})

> Private (gitignored). Status: **{warm/cold/exploring + concrete commitment state}**.
> Context: `../../coach-partner-journey.md` (if coach/partner).
> Transcript(s): `{slug}-transcript-{date}.txt`. Full analysis: `{slug}-analysis-{date}.md`.

## Who
[2-4 bullets: who, audience/reach, background that matters]

## Fit assessment
[CONFIRMED vs assumed, with the anchoring quote. What they ARE vs AREN'T for us.]

## Strategic fork (if any)
[Tension with current positioning — a fork to decide consciously, not a recommendation to pivot.]

## Open / next
- Best next action + concrete commitment to ask for.
- Open questions for next conversation.

## Conversation log
- **{date}** — {1-3 lines: what happened, key signal, advance/commitment}. Transcript: `{slug}-transcript-{date}.txt`. Analysis: `{slug}-analysis-{date}.md`.
```

### Artifact B — Dated deep analysis → `.private/docs/business/{category}/{slug}-analysis-{YYYY-MM-DD}.md`

One file per conversation, never overwritten (longitudinal trail):

```markdown
# Discovery Analysis — {Name} — {YYYY-MM-DD}
**Relationship goal:** {…} | **Type:** {partner/coach/…} | **Source:** {full transcript / extract — note if extract}

## TL;DR  [3-5 lines: who, the one thing that matters, the next move]
## 1. What We Learned   [HARD first; SOFT flagged]
## 2. Longitudinal Diff  [only if prior conversation]
## 3. ICP Fit & Stake
## 4. Strategy Impact — Hypothesis evidence (n=1 caveat) + Candidate doc edits (gated)
## 5. Blindspots  [Agent B's hypothesis-blind findings]
## 6. Product Ideas  [HARD-ranked; enthusiasm-only flagged; FOUNDER DECISION tags]
## 7. Objections & Risks
## 8. How I Could Have Run This Better (Mom Test) — Scorecard + Next-time playbook (rewritten questions)
## 9. Next Steps — best action / commitment to ask for / draft follow-up (gated, do not send)
## 10. Priority Actions
## Appendix: Quotes That Matter  [8-12 verbatim, each tagged HARD/SOFT]
```

---

## Guardrails

- **`.private/docs/business/{coaches|partners}/` only.** Transcripts, dossier, analysis contain PII — never the public tree. Follow the existing tree; don't invent folders; don't file people in `collaborators/`. Scan output for anything that shouldn't persist even privately.
- **Never silently overwrite a dossier.** Show the merged Artifact A before writing. Conform to the existing file's structure, don't impose a template.
- **HARD over SOFT, always.** Compliments and "I would use that" are low-weight by construction. A product idea with zero HARD signal is flagged enthusiasm-only, never ranked above HARD-backed ideas.
- **n=1 honesty.** INSUFFICIENT is the default hypothesis verdict. Doc edits are *candidates* routed to the gate, never committed here.
- **Anti-confirmation-bias.** Agent B's prompt is transcript + definitions verbatim — no paraphrase, no hypotheses/canvas, no "prospect" framing.
- **Speaker identity is resolved before any agent runs.** Without it, the Mom Test critique and commitment read are invalid — ask if ambiguous.
- **Big transcripts get an extract, not truncation.** State when an extract was used.
- **Gated outputs.** Doc edits → `/slava:maintain:docs-strategy-update`. Follow-up message → draft only, user sends. Never collapse draft+send.
- **Subagent content is inlined.** "Read the file yourself" is a no-op for subagents.
- After completion, append one line to `.private/logs/skill-costs.log`: `<ISO-timestamp> | analyze-discovery | <model> | <tier>`.
```

