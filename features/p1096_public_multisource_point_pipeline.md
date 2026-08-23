---
status: today
type: story
rank: 3
workstream: events
created_date: '2026-08-17'
tags: [points, events, youtube, agents]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: heuristic
---

# P1096: Manufacture felt disagreement from public material

## Problem

**Situation:** The comprehension protocol works. What does not work is the entry — people will not invest the onboarding time because they cannot see why it matters. This is on record, not inferred: a sympathetic, well-motivated tester who gave the protocol a long session still bounced off the entry cost, and reported having no signal to anchor the 0-10 scale against. Session record and verbatim reactions: `.private/deconstruct/` (private — this is a recorded one-to-one conversation, so the participant is not characterised and not quoted here).

**Complication:** A person only feels the gap when a disagreement they care about is on the table. Manufacturing that between two specific humans is expensive — both must consent, both must attend, both must care about the same thing — which is exactly where every prior attempt stalled: at the ask. `features/p1084_crux_letter.md` is the private-dyad answer to this and carries three unresolved blockers of its own.

**Question:** Can an agent manufacture a **felt** disagreement out of **public** material — a conversation plus its opposition — such that a room of strangers arrives already holding opposed positions, and experiences the instrument as what makes their disagreement legible rather than as a protocol they were sold?

**Point A → Point B → obstacle**, stated once because everything downstream inherits it:

- **A:** the instrument works; the entry does not. People will not pay onboarding cost for a benefit they cannot see.
- **B:** a room walks in already holding opposed positions on something they care about, and the instrument is what makes the disagreement legible. Nobody was sold the instrument first.
- **Obstacle:** a felt gap needs a live disagreement people care about, and manufacturing one between two named humans costs consent, scheduling and shared stakes.
- **The bet:** public conversation + its opposition = a ready-made disagreement, free, repeatable, at any scale, with the evidence attached.

## Appetite

**Medium blast radius.** Two new agent identities per source pair, plus public stories and points on prod. It writes real rows to a live database and publishes text quoting real people. No schema change is anticipated.

**Reversible** — filed rows are deletable; skills revert with `git revert`. What is **not** reversible is publication: a misquote under a named person's video is public the moment it is filed.

**Decision density: low.** The founder decisions accumulated over this design session are already settled (see Non-Goals). The remaining open questions are empirical, not editorial.

## Solution

### Pipeline — three stages, three skills, one of which already exists

| Stage | Skill | State |
|---|---|---|
| **1. Select** | video selector | spec'd, not built — `features/p1088_video_selector_for_point_extraction.md` |
| **2. Extract** | `/slava:content:points-prepare` | **exists**; needs multi-source input (see below) |
| **3. File** | points filer | not built, not yet spec'd |

**Stage 2 is the same skill, not a new one.** Its rules are unchanged — bald restatement, both commitments, the opposing camp read rather than imagined, the room required. The only change is **input arity**: it accepts N transcripts instead of one, and tracks which speaker said what. With an opposed pair, the second video *supplies* the opposing camp that the skill would otherwise hunt for in comments — a strictly better source, because those people argued at length and on the record.

**The points are generated for the AUDIENCE, not for the speakers.** The videos are input material: they supply the evidence and the two poles. The points are aimed at the room that will take positions.

**Stage 3 files, per source pair:**
- one **agent identity per speaker**, each summarising and quoting **only** that speaker;
- one **story per speaker** — the agent's summary plus that speaker's verbatim quotes, with the source link;
- the **points**, public, linked to those stories, under one event tag;
- each agent's **position on each point**, captioned as *the agent's reading of that speaker's argument* — never as the speaker's position;
- the return value is the tag feed URL.

**The `/align-*` family is not reusable here** and should not be extended to fit. `/align-decompose` authors a story about one person's experience for that person to rate — a different job, and its story-authoring is precisely what this pipeline forbids.

### The end-state the founder described, 2026-08-19 — and the reuse rule it turns on

One invocation: *given these two videos, produce the rest.* The pipeline identifies the speakers, **checks whether an agent already exists for each one and reuses it if so**, creates the points, finds each speaker's quotes, files a story per speaker and a position per point, and returns a tag feed URL. The founder opens that feed and sees the points with positions already filed on behalf of every covered speaker.

**The reuse clause is not a convenience — it is what makes the account model work at all, and this spec currently contradicts it.** Stage 3 above says *"one agent identity per speaker"* per source pair and says nothing about reuse, so a second run covering the same speaker creates a **second** agent. `p1104` defines an account as *"a persistent reading of one person… it accumulates: many sources over time, one story per source"* — accumulation is impossible if every run mints a new identity. Two agents for one person is also worse than a duplicate: they can hold **different positions on the same point**, and `UNIQUE(point_id, user_id)` will not catch it, because they are different users.

**Corrected rule: an agent is created once per subject and reused thereafter.** A run adds a story and positions to an existing agent; it creates one only when the subject has never been covered.

**Subject key — DECIDED 2026-08-19, after a first attempt was rejected.** The key is **one operator-supplied canonical reference to the PERSON**, exact-match for reuse. Preference order: Wikidata entity → Wikipedia page → the person's own site → an internal slug minted by us when the subject has no public page (the claimed case). Names remain display-only.

**A YouTube channel URL was proposed and rejected by the founder the same day, correctly:** a channel identifies whoever *publishes* the video, not the person speaking in it. The same subject appears across many channels — the person is the invariant, the channel is not. This is why the key must reference the person directly.

**KISS, deliberately.** One string field, exact match, no fuzzy matching and no online resolution. When no key matches, the skill shows near-matches by display name and the operator says *"same person, use that one"* or *"new one"*. That human step is the entire ambiguity mechanism; there is no escalation path and none is wanted. It is improvable later — normalising to Wikidata, alias tables — **without anything already filed having to change**, because filed rows hold the key they were created with.

**This makes reuse and the P1104 registration problem the same question.** Reuse requires asking *"do we already have an agent for this person?"*, which requires a stable key for a subject; registration requires knowing which accounts are agents, which requires the same key. Answer it once and both are solved — the registry keyed by subject is both the reuse lookup and the marker lookup. **The key itself is the hard part** and is not yet chosen: a display-name string is fragile across sources (*"Donald Trump"*, *"President Trump"*, *"Trump"*), and the pipeline's own speaker labels come from captions, which this spec already records as unreliable. Routed to `/architect` on P1104, because the fail-closed property depends on it.

### Two things the described flow assumes but has not decided

- **Which speakers get an agent — DECIDED 2026-08-19, and half of it already exists.** `/slava:content:points-prepare` already carries the rule: *"Identify who ARGUES, not who speaks. A host who asks questions for fifty minutes and takes no position gets no agent and no story. Five speakers routinely means two or three arguers."* So the moderator/interviewer exclusion is specified, not missing. **What is added:** the creating skill **proposes** the arguer list and the operator **confirms it before any agent is created.** There is no automatic creation path. **That confirmation is the only bound on how many public accounts this pipeline can create** — worth stating plainly, because nothing else limits it.
- **Where the run stops — DECIDED 2026-08-19.** The run writes to the **test database first**. The founder reads the quotes there, changes what needs changing, and **only then** is anything promoted to prod. The staging boundary is environmental, which the project already has, rather than a publish flag that has to be invented and can be got wrong. The tag feed link the run returns points at test; the prod link is the second, deliberate action. This reconciles the one-shot flow with the quote-verification gate without asking anyone to be diligent at the end of a long run.

### Why a story rather than the point's own context field

A story renders on both the feed card and the point detail page; the point's `context` column renders on one and is written by nothing (`features/p1095_retire_dead_point_context_field.md`). The story is also the model's own answer to *why does this point exist*. Verified 2026-08-17.

## Risks / Non-Goals

### Risks

- **Publishing a claim a person never made.** The whole design sits one caption away from asserting a real person's position. **MITIGATE:** positions belong to the agent, visibly; the story holds quotes only; no first-person voice for anyone. This is the single non-negotiable.
- **Quotes are caption-sourced and unverified.** Auto-captions mangle words and names. **MITIGATE:** every quote checked against the source before filing — `/slava:content:points-prepare` already specifies this precisely as two distinct checks, and they catch different failures: `grep -F` each quote against the cleaned transcript (catches a quote the extractor invented or paraphrased) **and** check the survivor against the **audio at its timecode** (catches the caption robot mis-hearing — a dropped negation reverses a claim). For any content class where a misquote causes real harm, this stops being a step and becomes a gate.
- **Speaker misattribution is a separate failure from mis-transcription, and it is the harder one.** Right words, wrong mouth. **DECIDED 2026-08-19: solve it by source selection, not by build.** Prefer single-speaker or dominant-speaker sources; the founder selects for this at stage 1. Local Whisper would improve transcription accuracy but **would not resolve attribution** — that needs speaker diarization, which is a substantially larger build for a problem that choosing better sources removes. **Transcript-first for now; Whisper and diarization are later iterations, not prerequisites.**
- **Identity-charged topics split a room regardless of the points' quality**, so a split proves nothing about the agent. **MITIGATE:** first run on a contested-but-not-identity-defining topic. Record which topic class each run used.
- **Positions are visible before attendees answer**, so the room is anchored. **ACCEPT** — the product already shows counts before answering, and the source videos are public anyway. **Consequence to hold:** event positions are a discussion prompt, never evidence that the agent found a real split. Calibration evidence comes from the sealed prediction file.
- **Caption fetching works only from a residential connection** (`pp/docs/infra/youtube.md`). **ACCEPT** for now — it works from the founder's machine. Anything server-side needs a proxy.

### Non-Goals

- **Do NOT let any agent write in a person's first person**, or claim what a person believes, would answer, or would vote.
- **~~Do NOT build video embedding or jump-to-timestamp in stories.~~ SUPERSEDED by
  `features/p1141_story_carries_a_video_with_jumpable_quotes.md`** (founder ruling 2026-08-21).
  This non-goal was written to protect the first run from scope creep, before any run had
  happened. P1096 is the v1 design and not the source of truth — it was never implemented under
  its own number, while the pipeline shipped under P1104, P1130 and P1135. P1141 builds both the
  embedded player and the jump-to-timestamp quotes. The original text, for the record: *"A
  clickable source link under the quote does the job for the first runs. Stories carry an image
  today; there is no video support anywhere."*
  **P1096's separate markdown non-goal still stands as written** — P1141 narrows that ban to what
  the 2026-08-20 security finding actually supports (structure allowed, link label must match its
  destination); it does not lift it.
- **Do NOT add markdown rendering to stories** for this. Story text renders plain with links made clickable; a 10,000-character limit means a long summary already fits.
- **Do NOT write to the point `context` column.**
- **Do NOT provision the YouTube API key for the first run.** Search, view counts, comments and subtitles all work with no key and no account; the key is for selecting from large volumes later.
- **Do NOT build audience-scoped lists** (`features/p1089_audience_scoped_point_list.md`, parked). Public source ⟹ public points.
- **Do NOT extend the `/align-*` skills** to cover this.
- **Do NOT build the filing skill before one manual run has produced points worth filing.**

### Alternatives Considered

- **`features/p1084_crux_letter.md` — the private two-person letter.** Not rejected; **superseded in priority**. Its problem (two people whose real disagreement is invisible) is real and its analysis stands, but it needs consent, a schema-shaped prediction store it does not have, and a reader-facing question the product does not ask. This spec reaches the same outcome without any of the three, because public material needs no consent.
- **One clarity agent holding all perspectives.** Fails with an opposed pair — one identity cannot hold both poles.
- **Single video plus an imagined counter-camp.** Weaker: the opposition is inferred rather than argued.

## Run log

### Run 1 — 2026-08-17, effective-altruism opposed pair

Sources: a 33-minute defence (28,847 views) and a 56-minute critique (49,516 views). Full record in `.private/points-runs/ea-pair-2026-08-17.md`. Six points produced, terminal only, nothing filed.

**RETRACTED — the density thesis was not confirmed, and the original claim here was arithmetically false.** This paragraph previously read *"argument density fell monotonically with reach across six candidates"*. It does not. All six measured candidates, ordered by reach ascending, with comments per thousand views:

| Views | Comments/1k |
|---|---|
| 2,594 | 34.3 |
| 9,168 | 5.3 |
| 28,847 | 9.4 |
| 49,516 | 13.4 |
| 751,558 | 1.7 |
| 3,050,014 | 2.7 |

**Three of five adjacent comparisons RISE.** The original sentence concealed this by listing both high-reach values before both low-reach ones, and by citing only four of the six measured points. Even on those four it is false (9.4 → 13.4 rises).

**What can honestly be said:** the two highest-reach candidates had the two lowest densities. That is one comparison, n=6, one topic, one search, candidates selected by the same agent that formed the thesis — and production genre (a TED talk and a video-essay channel at the top of the reach range; a podcast and a long essay at the bottom) is confounded with reach across the whole sample. Video age, which mechanically depresses comments-per-view as cumulative views accrue, was not recorded and cannot now be checked.

**And the measure is the wrong one for the claim.** P1088's premise is about argument *quality*; what was measured is comment *quantity* per viewer. The quality probe (comment length, reason markers, reply depth) was run **only on the two videos already selected** — the rejected high-reach pair was never sampled, so there is zero evidence their argument was worse. That is this repo's own control-group rule inverted: the probe ran on survivors only.

**Consequence:** P1088's ranking premise is **untested**, not confirmed. Do not cite this run as evidence for it. A real test samples quality across the full reach range, controls for genre and age, and states a threshold before measuring.

**Defect found — asymmetric framing.** Five of six points were the *defence's* claims baldly restated, leaving the critique to answer in someone else's vocabulary. The artifact looks balanced because a counter-quote sits under every point, which is exactly what made it hard to see. Two mechanical checks now sit in the skill (swap test, framing-origin tally, both reported whatever they say).

**Form found — the synthesized point.** A claim **neither** speaker made, built so each one's own quotes commit them to opposite ends, with the inference chain shown. More polarizing by construction and neutral by construction, because neither side owns the framing. Now the target form in the skill. **Untested against a room.**

**Signal found — the cross-camp split.** The strongest point in the run was the one where two speakers *inside the same video* landed on opposite ends. A point that cuts across camps rather than between them cannot be built from a single source, and a room cannot pre-sort itself by tribe on it. Now flagged explicitly by the skill.

**Process finding.** The run was executed by following the skill by hand rather than invoking it. Judgment was applied inconsistently — the framing asymmetry is precisely the class of error a written procedure prevents and free-hand application does not. Skill rewritten to v0.2.0 from this run.

**Two honest weaknesses in run 1:** the room was asserted by the agent rather than confirmed by the founder, so every predicted percentage inherited an unchecked assumption; and one agent position was a stretch (inferred from what a speaker mocked, not from what he argued) and shipped unmarked. Both now have rules.

## Open Questions

1. **Does a pair actually beat a single source?** Run 1 produced richer material than the single-source run of 2026-08-17, but no room has answered either set — so this is **still open**, and the comparison that would close it is a room, not a reading.
1b. **Does a synthesized point split harder than a restated one?** New question, created by run 1. Same answer needed from the same room.
2. **Which selector mode yields the best material** — two creators, or one panel that already contains its disagreement? See P1088.
3. **What does the room do with a point whose two poles are both evidenced?** Unknown until a room does it.
4. ~~**What is the stable key that identifies an agent's subject across sources?**~~ **ANSWERED 2026-08-19** — operator-supplied canonical person reference, exact match. See Solution. *Still routed to `/architect` on P1104:* the key is chosen, but **where it lives** (constant, column, or separate entity) is not.
5. ~~**Who approves a speaker into becoming an agent?**~~ **ANSWERED 2026-08-19** — the skill proposes arguers, the operator confirms before creation.
6. ~~**Does the run publish, or stage for review?**~~ **ANSWERED 2026-08-19** — writes to test first; promotion to prod is a separate deliberate step.
7. **What builds and owns `/points-publish`?** Created 2026-08-19. `points-prepare` already names it as *"the only skill in this chain that writes to the product"*, and **it does not exist** — no skill file, no spec, no reference outside that one line. It is this spec's stage 3, and it is the piece that must invoke agent creation before filing anything.

## Done-When

- [ ] One manual run produces points from an opposed pair, aimed at a named room, with per-speaker quotes attached and predictions sealed before anyone answers
- [ ] The founder judges whether those points are sharper than the single-source run of 2026-08-17 — recorded either way
- [ ] Every quote used has been checked against its source, not just against the captions
- [ ] Points and stories filed public under one event tag, reachable at a tag feed URL
- [ ] No agent holds a position captioned as a person's own, asserted as a negative check
- [ ] A second run covering a speaker already covered **adds to that speaker's existing agent** rather than creating a new one — asserted by running it twice, not by reading the code
- [ ] No story contains first-person text for any person, asserted as a negative check

## Acceptance Criteria

- [ ] A room can see, from the quotes alone, why the two sides disagree
- [ ] Attendees take positions without anyone explaining the protocol first
- [ ] At least one attendee reports learning where they actually stand relative to someone else

**Falsifier:** the paired-source points are no sharper than single-source ones, and the room's positions cluster rather than split ⟹ the opposition is not what makes a point polarizing, and the value is in the extraction craft alone.

## References

- `features/p1088_video_selector_for_point_extraction.md` — stage 1
- `features/p1089_audience_scoped_point_list.md` — parked; the private-source case
- `features/p1095_retire_dead_point_context_field.md` — why grounding lives in a story
- `features/p1104_agents_must_be_visually_distinguishable.md` — blocks this spec; owns the agent marker and the subject-key question
- `features/p1084_crux_letter.md` — the private-dyad predecessor line
- `.claude/commands/slava/content/points-prepare.md` — stage 2
