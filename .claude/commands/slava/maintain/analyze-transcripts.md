---
name: analyze-transcripts
description: Analyze all session transcripts for product insights, problem statement challenges, and blindspot discovery. Combines transcripts with session ratings, pair history, strategy docs, and optionally Mixpanel events.
when_to_use: After batch transcription completes, or periodically (weekly/monthly) to extract product insights from accumulated session data.
version: 1.0.0
---

# /analyze-transcripts

Analyzes the full corpus of session transcripts to surface product insights, challenge the problem statement, discover blindspots, and generate actionable FCO recommendations.

## Usage

```
/analyze-transcripts              # analyze all transcripts
/analyze-transcripts 7d           # only sessions from last 7 days
/analyze-transcripts PAIR:slava+gosha  # only sessions for a specific pair
```

## Data Collection Phase

Before spawning analysis agents, the main agent collects all data and passes it inline.

**Delivery contract — state this inline in every agent's prompt.** A background subagent's final
reply text does not reach the main conversation; it is silently lost. (`.claude/rules/skills.md`
§Subagent I/O loads when a skill is *edited*, never when one *runs* — so the spawn prompt must
carry the contract itself.) Each agent **Writes** its report to a parent-supplied path under the
session scratchpad and then also returns the text; the parent **clears those paths before
spawning**, reads the **files** rather than the replies, and treats a missing or empty file as
that agent having **failed** — never as an empty finding. If both arrive and differ, the file wins.

### Step 1: Pull transcripts from prod

```bash
PROD_SERVICE=$(grep SUPABASE_SERVICE_ROLE_KEY .env.prod 2>/dev/null | cut -d= -f2)
# Fallback: use the prod service role key from supabase CLI
# supabase --project-ref besjtuodziykmjidubzw projects api-keys

curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/session_transcripts?select=*&order=created_at.desc" \
  -H "apikey: $PROD_SERVICE" \
  -H "Authorization: Bearer $PROD_SERVICE"
```

### Step 2: Pull session metadata + ratings

```bash
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/clarity_sessions?select=id,code,creator_name,joiner_name,creator_profile_id,joiner_profile_id,live_state,created_at,mode,is_private&mode=eq.live&order=created_at.desc" \
  -H "apikey: $PROD_SERVICE" \
  -H "Authorization: Bearer $PROD_SERVICE"
```

From `live_state`, extract `sessionHistory` — array of rounds with `checkerRating`, `responderRating`, `skipped`, `type`.

### Step 3: Build pair linkage

Group sessions by normalized pair: `LEAST(creator_profile_id, joiner_profile_id) + GREATEST(...)`. For sessions with NULL joiner_profile_id (pre-auth era), fall back to `creator_name + joiner_name` fuzzy match (lowercase, trim).

Output: pair ID → list of sessions in chronological order (session 1, 2, 3...).

### Step 4: Read strategy docs

Read these files and include their content in agent prompts:
- `docs/hypotheses.md`
- `docs/lean-canvas.md` (Problem section especially)
- `docs/definitions.md`
- `docs/philosophy.md`
- `docs/hypotheses.md` (active hypotheses and their status)

### Step 5 (optional): Mixpanel enrichment

If an agent needs behavioral data beyond what's in the transcript, it can request Mixpanel event data. The ML events collector stores all analytics events in GCS alongside audio chunks:

```bash
gcloud storage cat gs://claritypledge-ml-training/sessions/{CODE}/events.json
```

This gives timestamped events (ratings, skips, role switches, explain-back starts) aligned to audio timestamps. Use when a transcript raises timing or behavioral questions.

---

## Analysis Phase: Three Sequential Agents

### Agent 1: Protocol Anthropologist

**Role:** "You are a Protocol Anthropologist studying what happens when two humans attempt verified understanding. You treat each transcript as fieldwork. Your job is to find the gap between how the protocol was designed and how humans actually behave in it."

**Input:** All transcripts + session ratings + pair history + `hypotheses.md` + `lean-canvas.md`

**Task:**
1. For each active hypothesis in `hypotheses.md`, find confirming and contradicting evidence in the transcripts. Use specific quotes. Rate: STRONGER / WEAKER / UNCHANGED / INSUFFICIENT DATA. Note proximity to kill conditions.
2. Challenge the problem statement in `lean-canvas.md`:
   - Is the problem really "listeners overestimate comprehension"? Or is it something else the transcripts reveal? (e.g., social norm suppression, defensiveness, attention saturation)
   - Who initiates gap-reveals? If A consistently discovers the gap but B is unsurprised, that challenges "mutual miscalibration"
   - Are "holy shit" moments about understanding gaps, or about unstated preference gaps? (Different mechanism)
3. Build a Protocol Failure Taxonomy — categorize the ways explain-back breaks:
   - Resistance patterns (deflection, immediate agreement without paraphrasing, meta-paraphrase vs content-paraphrase)
   - What interventions worked vs. didn't
   - Session structures that produced gap reveals vs. polite non-events
4. Per-pair longitudinal patterns: is pair N improving across sessions? What changes between session 1 and session 3?

**Output format:**
```
## Hypothesis Evidence
[for each active hypothesis]

## Problem Statement: What Transcripts Actually Show
[confirming + challenging evidence with quotes]

## Protocol Failure Taxonomy
[categorized patterns]

## Pair Progression
[per-pair longitudinal observations]
```

### Agent 2: Blindspot Hunter

**Role:** "You are a pattern analyst with NO knowledge of what ClarityPledge is trying to prove. You know only the domain concepts (from definitions.md). Your job is to find what's surprising, emotional, unexpected, or doesn't fit any obvious frame. You succeed by surfacing things the team hasn't thought about."

**Input:** All transcripts + `definitions.md` ONLY. Do NOT give this agent hypotheses.md or lean-canvas.md.

**Task:**
1. What patterns appear across multiple sessions that seem significant but aren't about understanding calibration?
2. Where do participants get emotional, defensive, or energized? What triggers those moments?
3. What do participants say about the experience itself? (meta-comments about the process)
4. What unexpected use patterns emerge? (e.g., pairs using it for X when it was designed for Y)
5. What comparisons or analogies do participants use to describe what's happening?
6. Any signals about who would pay, who would refer, who would resist?
7. Raw ideas — things you'd try if you were building this product, based purely on what you observed

**Output format:**
```
## Surprising Patterns
[patterns that don't fit the obvious frame]

## Emotional Peaks
[moments of energy, defensiveness, breakthroughs — with quotes]

## Meta-Commentary
[what participants say about the process itself]

## Unexpected Uses / Behaviors
[things the team probably didn't anticipate]

## Raw Ideas
[product/service ideas triggered by transcript observations]
```

### Agent 3: Synthesis + Actionable Output

**Role:** "You are a strategic advisor to a founder who is both the product owner and the fractional Chief Clarity Officer delivering facilitated sessions. Your job is to merge analytical insights into one actionable picture."

**Input:** Outputs from Agent 1 + Agent 2 + pair linkage + all transcripts

**Task:**
1. Merge insights — where do Agent 1 and Agent 2 agree? Where does Agent 2 surface things that contradict or expand Agent 1's hypothesis-framed findings?
2. Identify new hypotheses — patterns from Agent 2 that deserve to become formal hypotheses
3. Problem statement update — draft specific edits to `lean-canvas.md` Problem section if evidence warrants
4. Per-pair FCO recommendations:
   - For each pair with 2+ sessions: what should the next session focus on?
   - Draft 2-3 stories or points to file for them (based on gaps revealed in transcripts)
   - Draft a follow-up email or message to send them
5. ICP signals — which pair characteristics correlate with "holy shit" moments vs. polite acknowledgment? What predicts who will convert?
6. Priority actions — top 3-5 things to do based on this analysis (product changes, process changes, FCO approach changes)

**Output format:** Single markdown document (see Output section below).

---

## Output

Save to: `.private/docs/analysis/transcript-analysis-{YYYY-MM-DD}.md`

```markdown
# Session Corpus Analysis — {date}

**Data:** {N} transcripts | {date range} | {N} unique pairs | {N} sessions with ratings

---

## 1. Problem Statement: What We Thought vs. What We See
[Confirming evidence, challenging evidence, proposed edits to lean-canvas]

## 2. Hypothesis Evidence
[Per-hypothesis: evidence, strength update, kill condition proximity]

## 3. Blindspots Discovered
[Patterns Agent 2 found that Agent 1 missed — new frames, new mechanisms]

## 4. Protocol Failure Taxonomy
[How explain-back breaks, what works, what doesn't]

## 5. New Hypotheses to Consider
[Patterns that deserve formal hypothesis treatment]

## 6. Pair Reports
### Pair: {Creator} + {Joiner} ({N} sessions)
- Progression: [longitudinal observations]
- Next session focus: [recommendation]
- Draft stories/points to file: [specific content]
- Draft follow-up message: [email/message text]

## 7. ICP Signals
[Who converts, who doesn't, predictive patterns]

## 8. Priority Actions
1. [action]
2. [action]
3. [action]

## 9. Raw Ideas
[Agent 2's product/service ideas that survived synthesis]

## Appendix: Quotes That Matter
[The 10-15 most revealing quotes from the corpus, with context]
```

---

## Notes

- Output goes to `.private/` — never committed to public repo (transcripts contain PII)
- Mixpanel events are pulled on-demand when agents need behavioral timing data
- The Blindspot Hunter agent deliberately has NO access to hypotheses — this prevents confirmation bias
- Run monthly or after a batch of new sessions. Compare with previous analysis to track how insights evolve.
- Pair linkage uses profile IDs where available, falls back to name matching for pre-auth sessions
