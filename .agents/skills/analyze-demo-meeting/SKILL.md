---
name: analyze-demo-meeting
description: Analyze a 1:1 meeting transcript — either a founder interview / demonstration-discovery (customer dev where the product IS the conversation) or a peer/collaborator working session — for signals, strategy impact, product ideas, relationship next steps, AND a lens-aware critique of how you ran it. COUNTERPART — INTERVIEW (Mom Test / Demonstration Critic, per mode) or PEER (Collaboration Critic; overrides mode). Compounds per-person over time.
when_to_use: After a founder interview, discovery call, any 1:1 where you ran customer development AND/OR demonstrated the product live, OR a peer/collaborator brainstorm or working session where nobody is being interviewed. Renamed from analyze-discovery (2026-07) — demonstration-discovery is now the default interview shape. NOT for product practice-session transcripts (that's /analyze-transcripts). NOT for batch Claude.ai review (that's /claude-conversations-to-cp). NOT for surfacing one person's high-stakes items — that's /slava:think:align-detect.
version: 2.1.0
---

# /analyze-demo-meeting

Analyzes a single 1:1 meeting to extract what you learned, map it onto strategy, surface product ideas, plan the next step, and critique your own technique — lens-aware, because your product is a conversation, so discovery and demonstration often collapse into one act.

**Announce at start:** `Running /analyze-demo-meeting — COUNTERPART: {INTERVIEW|PEER}, mode: {discovery|demo|mixed|ignored}.`

**Customer development, not product analytics.** The unit is one human. Output compounds into a per-person dossier under `.private/docs/business/`.

## Usage

```
/analyze-demo-meeting ~/video-edits/<person>*.md            # mode defaults to mixed
/analyze-demo-meeting mode:discovery ~/Downloads/<p>.txt    # pure Mom Test critique
/analyze-demo-meeting mode:demo ...                         # Demonstration Critic only
/analyze-demo-meeting                                       # asks for path(s)
```

Multiple files = **one conversation split into parts**, concatenated in filename order.

**The three modes (they only change Agent C, the critique lens — and only when `COUNTERPART: INTERVIEW`):**
- `discovery` — pure Mom Test. Judges: avoided pitching, listened > talked, past-behavior facts.
- `demo` — Demonstration Critic. The product IS the conversation; you're *supposed* to talk and lead. Judges the demonstration.
- `mixed` (default) — segment the transcript by mode and apply the right lens per segment (Mom Test on discovery portions, Demonstration Critic on demo + convert portions). Most founder interviews are mixed.

## Phase 0 — Runtime setup (main agent)

1. **Locate + read transcripts** in full. Confirm they form one conversation. **Check encoding first** (`file <path>`); if not UTF-8/ASCII, decode before reading (`iconv -f UTF-16 -t UTF-8`) and size the corpus from the **decoded** text. Parse `mode:` if given (default `mixed`).
2. **Size check.** If total > ~120 KB, pass the full transcript only to Agent C (needs verbatim breadth); build a dense extract for A/B and say so. **"Say so" means in the written output, not only in the run narration** — the dated analysis carries a line naming the extract, its size, and which agents received it. An undisclosed extract makes every "not found in the transcript" claim in that analysis unfalsifiable.
3. **Resolve speaker identity** — which speaker is the founder (Slava) vs the counterpart. Ask if ambiguous. The critique and commitment read are invalid without it.
4. **Identify person + goal, and set `COUNTERPART`** (one message, ask once): who, role/company, any next step on the table, and what you want from the relationship.
   - **`COUNTERPART` is a property of the CONVERSATION, not of the person.** Classify from the transcript you just read, never from a CRM verdict: **`INTERVIEW`** = one side holds the questioner role and the other is the subject (customer, coach, referrer, investor, advisor). **`PEER`** = neither side is the subject; both advance their own agenda and both advise.
   - A recorded not-a-customer verdict does **NOT** imply `PEER` — a founder who turns out not to be the buyer was still *interviewed*. Buying status changes the ICP read, not the lens.
   - **Propose the classification with its evidence, then let the user confirm or correct it in the same message** (`.claude/rules/skills.md` — ask once at runtime, no flags). Format: `COUNTERPART: PEER — both sides propose and neither is interviewed; e.g. <quote>. Confirm or correct.` **The user's answer always wins.**
   - Both at once? File under the **primary**, note the secondary in the dossier's first line (a coach who is also a customer — one folder, one note).
   - **`PEER` overrides `mode:`** — the Mom Test lens and the Demonstration Critic both presuppose an interview. Say so in the announce line rather than dropping it silently (Transparency Principle).
5. **Resolve the dossier path against the REAL tree** (`.private/docs/business/{coaches|partners|...}/`). `ls` the dir; if `{slug}.md` exists, READ it and conform to its structure. Never invent folders. Show the merged dossier before overwriting.
6. **Read the OBJECTIVE + strategy** (inline the short artifacts; pass *paths* for large corpora — subagents can read from disk, but their plain output does not return, so each agent must `Write` its deliverable and message back the path). **Agent C's lens artifact depends on `COUNTERPART`:** on **`INTERVIEW`**, `.private/docs/business/discovery-questions.md` §OBJECTIVE (ICP-5, falsifier, the 7, stop rule) is the *script* technique is critiqued against; on **`PEER`**, the same §OBJECTIVE is a **boundary** (was this session worth spending on?) **plus the prior dossier's `## Alignment state`** as the **baseline** (did anything move?). Also: `docs/lean-canvas.md`, `docs/hypotheses.md`, `docs/definitions.md`.
7. **Save a COPY of the raw transcript** to `.private/docs/business/{category}/{slug}-transcript-{YYYY-MM-DD}[-partN].{ext}` — PII, `.private/` only, never public. (A copy: the production original stays in `~/video-edits`.)

## Phase 1 — Three subagents + main-agent synthesis

Agents A, B, C run in parallel; main agent synthesizes. All file content inlined into prompts.

### Agent A — Signal Extractor + Strategy Mapper (Mom-Test-disciplined + LEV)

**Role (INTERVIEW):** customer-dev analyst on *The Mom Test*. Facts and past behavior outweigh compliments and future-hypotheticals.
**Role (PEER):** collaboration analyst. Facts and past behavior still outweigh opinions, but nobody is a subject — do not read the counterpart as a prospect. §1 HARD/SOFT and §6 verbatim are unchanged; §2 LEV applies **only if a live demonstration actually occurred** (it often does not in a peer session — say so rather than manufacturing LEV moments).

**Task:**
1. **Their world in facts.** Split **HARD signal** (specific past events, real money/time spent) from **SOFT signal** (opinions, compliments, "I would…" → low-weight).
2. **LEV — Live-Experienced-Value signal.** Moments the counterpart *felt* the product work on them in real time (a gap revealed, confusion→clarity, a "score" moving) — **and moments they were exposed and felt nothing, which are `LEV−` and carry the same weight.** LEV sits **between HARD and SOFT** — stronger than a compliment (experienced, not hypothetical), weaker than their own past behavior. **A tier that can only move evidence up is a ratchet.** The null is the falsifier and is usually the strongest single datum a demonstration produces. Quote each LEV moment, **signed**.
3. **Convert-check.** At peak LEV, was a **costly commitment** asked — cash, effort (a page of work), or reputation (a named intro) — whichever fits the offer? Or did it evaporate into polite interest / abstract theory? Name the exact commitment that should have been asked.
4. **Stake + commitment ladder**, **ICP-5 fit** (confirmed vs assumed, with quote), **objections & risks**, **hypothesis evidence** (default INSUFFICIENT unless HARD signal moves it), **problem-statement test** (did they state the problem in their own words, or did the founder explain it?).
5. **Candidate doc edits** — drafted for `/slava:maintain:docs-strategy-update` to gate. Never assert on n=1.
6. **Verbatim** — 8–12 quotes, each tagged HARD / SOFT / **LEV±**.

**If `COUNTERPART: PEER`, Agent A changes in four places; §1 HARD/SOFT and §6 verbatim are unchanged.** (§2 LEV is scoped by the Role line above — it applies only if a demonstration actually occurred.) §4 drops **stake + commitment ladder** and the **problem-statement test** — both presuppose a subject being interviewed — and swaps **ICP-5 fit → Overlap / Divergence map**: where the two agendas provably coincide, where they provably don't, and which of *their* claims are load-bearing for *ours* (name it, quote it, say what would falsify it). §3's **convert-check → Alignment-state read**: AGREED (named owner) · DISAGREED and left open (quote both positions — a disagreement named and left open is a *result*, not a failure) · PARKED (concrete observable revisit trigger).
**Idea provenance:** every idea in §Product Ideas carries `[origin: them | me | joint]`; a `them`-origin idea carries its source quote.

### Agent B — Blindspot Hunter (hypothesis-blind — identical on both COUNTERPART paths)

**Input STRICT:** transcript + `definitions.md` verbatim only. NO hypotheses/lean-canvas/objective, no "prospect" framing (that leak is the bias). What's surprising? Emotional peaks + triggers? Who they are? Reframes they reach for? Raw product ideas.

### Agent C — Critique lens (`COUNTERPART` selects the lens; on INTERVIEW, `mode` selects which of the three)

**Role:** customer-dev coach critiquing the INTERVIEWER (founder = Slava). Direct, quote-cited. **Critique against the OBJECTIVE in `discovery-questions.md` (the ICP-5, the falsifier, the 7, the stop rule)** — so when the objective sharpens, this critique sharpens automatically.

- **`mode: discovery` — Mom Test lens.** Scorecard: leading/pitching · fishing for compliments · talk-vs-listen · missed follow-ups · past-behavior vs hypotheticals · the ask/advance. Rewrite the worst questions.
- **`mode: demo` — Demonstration Critic.** The product is a conversation; talking and leading are expected. Scorecard: **time-to-demonstration** (how many min before a live gap-reveal? aim ~5) · **demonstration quality** (did the gap land as *felt* experience or stay intellectual?) · **entry point** (concrete high-stakes conversation vs generic business archaeology) · talking = **demo or ramble?** (not penalized per se) · leading = **to their OWN gap or imposed?** · **stop-rule adherence** (did they name concepts + show a live instance, or *teach the model*? teaching = violation) · **the convert** (at peak LEV, a clean costly ask, or diluted into theory?). Rewrite the worst moments.
- **`mode: mixed` (default) — segment, then apply per-segment.** Split the transcript into discovery / demonstration / convert segments; score discovery portions with the Mom Test lens and demo+convert portions with the Demonstration Critic. State the segment boundaries.
- **`COUNTERPART: PEER` — Collaboration Critic (replaces all three lenses above).** Nobody is being interviewed, so talk-vs-listen, "did you pitch," and time-to-demonstration are **not defects here** — do not score them. Scorecard: **agenda symmetry** (whose problem did the airtime serve; fair trade or drift?) · **the ask** (was a concrete ask made; was resistance heard and *named*, or silently re-asked?) · **transfer** (did the founder verify the peer's model, or assume it — CP's own protocol turned on its author) · **unresolved-left-unresolved** (papering a disagreement over with agreement is the defect; naming one and leaving it open is not) · **trajectory** (any explicit statement about the collaboration's own health — **quote it, never score it**). **Mutual advising is not interview inversion:** the inversion defect (`docs/decisions.md` 2026-07-29) is *scoped to* `INTERVIEW`, where the counterpart's advice displaces the founder's learning agenda. On `PEER` the symmetric defect is the founder's own agenda going unserved.

### Main-agent synthesis

Merge A + B + C (+ prior dossier). **Weight HARD > LEV± > SOFT.** `LEV−` ranks with `LEV+`, never below it and never as SOFT — sign is direction, not strength. Sections: what we learned · longitudinal diff (if prior) · product ideas (HARD-gated; enthusiasm-only flagged) · doc impact (n=1 caveat) · next steps + gated draft follow-up · priority actions (top 3–5).

## Phase 2 — Write two artifacts

- **Dossier** → `.private/docs/business/{category}/{slug}.md` (conform to existing structure if present; show merged before writing).
- **Dated deep analysis** → `.private/docs/business/{category}/{slug}-analysis-{YYYY-MM-DD}.md` (never overwritten). Sections: TL;DR · What We Learned (HARD/LEV first) · Longitudinal Diff · ICP-5 Fit & Stake · Strategy Impact · Blindspots · Product Ideas · Objections & Risks · **How I Ran This (lens-aware critique) — scorecard + rewritten questions + convert-check** · Next Steps (gated) · Priority Actions · Appendix quotes (HARD/SOFT/LEV±).
- **If `COUNTERPART: PEER`, three analysis sections substitute** (not add): `ICP-5 Fit & Stake → Overlap & Divergence` · `How I Ran This → How We Worked Together` · `Next Steps → Alignment state`. **The gate survives the rename, in the analysis only:** the **analysis** §Alignment state ends with a `### Drafted follow-up (draft only — never sent)` subsection. It goes in the dated analysis, which is never overwritten — **not** in the dossier section of the same name, which every run replaces wholesale. The **dossier** gains one section:

```markdown
## Alignment state (as of {date})
### Agreed             | Owner | Action | By when |
### Open disagreements | Question | Their position (quote) | My position (quote) | Why open |
### Parked             | Idea | Why parked | Revisit WHEN (observable trigger) |
```

  **Merge semantics:** each run **replaces** the dossier's `## Alignment state` wholesale, stamped `as of {date}`. Superseded states are not merged or diffed in place — they survive in the never-overwritten dated analyses. Nothing reads across dossiers. **Trajectory** (any explicit statement about the collaboration's own health) goes in the dated analysis under §How We Worked Together as a verbatim quote, never a score.

## Guardrails

- `.private/docs/business/` only (PII). Follow the real tree; don't invent folders.
- Never silently overwrite a dossier — show the merge.
- **HARD > LEV± > SOFT** — `LEV−` ranks with `LEV+`; a null result is a falsifier, so it is never demoted to SOFT. n=1 honesty (INSUFFICIENT default; doc edits are candidates → the gate).
- Agent B is hypothesis-blind (transcript + definitions verbatim only).
- Speaker identity resolved before any agent runs.
- Save a **copy** of the transcript to `.private`; the production original stays in `~/video-edits`.
- Gated outputs: doc edits → `/slava:maintain:docs-strategy-update`; follow-up message → draft only.
- **Idea provenance.** Every idea is tagged `[origin: them | me | joint]` (same enum Agent A emits); a `them`-origin idea carries its source quote. Such an idea may not enter a public doc (`content/`, `docs/`) without either (a) first name only, no identifying context, **engaged and argued against, not borrowed**, or (b) an explicit `[FOUNDER DECISION]`. **This is a label, not a gate** — nothing downstream reads it; it makes an unattributed borrow visible on sight.
- After completion, append one line to `.private/logs/skill-costs.log`: `<ISO> | analyze-demo-meeting | <model> | <COUNTERPART>/<mode>` — on PEER, mode is `ignored`, so without COUNTERPART the branch leaves no distinguishable trace.
