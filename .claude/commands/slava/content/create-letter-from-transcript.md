---
name: create-letter-from-transcript
description: "Turn a conversation transcript or dictation into a private Clarity Doc (fact point, anti-point, story, point) through a guided, question-driven process — then file it on prod with positions set."
when_to_use: "When you have a recorded or dictated conversation about a personal tension and want it filed as a Clarity Doc. Two-party transcript is the strongest source; solo dictation works but the anti-point becomes a labeled guess."
version: 1.1.0
---

# Create Letter From Transcript

Turn a transcript (or dictation) into a **private Clarity Doc** with four elements in reading order:

**FACT POINT → ANTI-POINT → STORY → POINT**

This is the reverse of normal authoring. Instead of story-first extraction, you start from what was said and reverse-engineer the structure. The skill **asks questions and directs the user** — it never invents the user's inner world.

> It files a **Doc, not a letter.** A Clarity Letter is the sealed snapshot of a doc sent to a recipient, and `seal_and_send_letter` rejects sending to yourself. The private, self-owned container is the Doc.

## Hard gates (never skip)

1. **Emotion gate** — never draft the story, derive the point, or file anything until the user has answered, in their own words, "what did you feel?" and "what need was underneath?" Fabricated feelings invalidate the whole Doc.
2. **Prod-write gate** — never write to prod until the user has confirmed the final content (facts, anti-point, story, point).
3. **Seal gate** — sealing a letter is irreversible (immutable snapshot, delivery cannot be recalled). Default is Doc-only. Seal ONLY if the user names a recipient who is not them, after draft → show → explicit "seal it" in the same turn.

## What each element is

| Element | Voice | Holds | User's position |
|---------|-------|-------|-----------------|
| **Fact point** | Neutral, third person, name both people | The objective sequence. No interpretation. | `strongly_agree` (+3) |
| **Anti-point** | The *other* person, generalized | Their likely belief about what happened, in their words | `strongly_disagree` (-3) |
| **Story** | The user, first person, plain | Feeling + need + request (NVC). No facts. | (story, not a point) |
| **Point** | The user | Their value, the logical inverse of the anti-point | `strongly_agree` (+3) |

The "anti" nature is carried by the **position** (strongly disagree), NOT a system tag. **Never set `system_tags` on these private points** — `misunderstanding` is a curriculum tag for the st1–st9 set, not for personal points.

## Source quality — state it before drafting

- **Two-party transcript** (both people's words present) → the anti-point can use the other person's *real* language. Strongest source.
- **Solo dictation** (only the user's side) → the anti-point is the user's *projection*. Label it "unverified guess", and **persist that label**: write it into the anti-point's `context` column (e.g. "Unverified guess — [name] has not confirmed this is their view"), so the caveat survives into the filed Doc, not just the chat.

## Multiple tensions

One transcript can hold more than one tension. If so, produce one (fact, anti, story, point) **chapter per tension**, each as its own story with its own three points, added to the same Doc at increasing `doc_stories.position`. Do not flatten distinct tensions into one muddy chapter.

## Process

### 1. Extract the facts (fact point)
Pull the objective sequence. Third person, name both people, keep timestamps. No feelings, no interpretation. Present the fact list and ask: "Are these accurate? Anything missing or wrong?" One confirmation round now saves five later.

### 2. Draft the anti-point (the other person's belief)
- **Generalized** — do not reference the user specifically. A belief, not an accusation.
- **Their natural language** — not the user's terms, not Clarity Pledge terms.
- **Anchor on a cost-MODEL belief, not a magnitude.** Recipe: (1) name the recurring behavior; (2) ask what the other person believes that behavior costs; (3) write the belief that the cost is *zero or erased* ("leaves no mark", "nothing is lost", "gets undone") — NOT that the magnitude is small. Test: could they accept your wording and still say "but this time was bigger"? If yes, you anchored on magnitude. Re-anchor on the cost model.

  | Domain | Magnitude (escapable, wrong) | Cost-model (flippable, right) |
  |--------|------------------------------|-------------------------------|
  | Lateness | "A little late is fine." | "Lateness leaves no mark; the warmth of finally meeting erases the wait." |
  | Cancelling plans | "Cancelling once in a while is fine." | "A cancelled plan just gets rescheduled, so nothing is really lost." |

- The fact point sits right above it, binding their agreement to the actual situation. That binding closes the reinterpretation escape.

### 3. ASK for the emotions and need (story)
Apply the **emotion gate**. Ask: "What did you feel? What need was underneath?" Then write the story in first person, plain voice, NVC scaffold invisible: **Feeling → Need → Request**. No facts in the story. Surface every inference you add as a correction point the user can fix.

**Plain, not poetic — this is the model's hardest constraint.**
- Bad (poetic): "Some part of me had started doing math I did not want to do, trust resetting itself a notch lower without my permission."
- Good (plain): "When I left, I felt disappointed and angry. It is that I have a need for predictability. I want to be able to count on what we agree on."

No metaphors. No dashes (em or en) — break into separate sentences. Short sentences.

### 4. Derive the point (the user's value)
State the value as the **logical inverse of the anti-point**, so agreeing with the point requires abandoning the anti-point. Plain, simple, falsifiable. Not poetic.

### 5. Adversarial pass (strengthen)
Optimize for **P(they agree with the anti-point) × P(they move to the point after understanding the story).** These trade off on the generalization axis: over-generalizing to win agreement reopens the reinterpretation escape. Run the devil's-advocate test from `definitions.md`: can someone agree with the anti-point AND, after reading the story, still hold it by reinterpreting? If yes, the anti-point is too loose — tighten it. Leave only two honest exits: a real flip, or an honest Fork ("I understand your cost, I still weigh it differently"). State the residual Fork honestly. Do not engineer it away.

### 6. File on prod (after the prod-write gate)
See **Filing mechanics**.

## Interaction style
- Ask questions, direct the user, iterate. The skill absorbs the work; it does not dump a draft and wait.
- Plain voice. NVC is invisible scaffolding, never labeled in output.
- No dashes (em or en). Break into separate sentences.
- Emotions and values belong to the user — elicit, never fabricate.
- Naming (doc title) is a founder decision. Use a neutral working title and tell the user to rename.

## Privacy (public repo)
Transcript content and real people's names go **only** to prod (private rows) and `.private/`. **Never** write transcript snippets, real names, or the other person's words into any public-repo file (specs, docs, commit messages). This repo is AGPL-public.

## Filing mechanics (technical)

**Owner:** the user's prod profile id. Look it up by email (the user's personal Google account; resolve from the profile, do not hardcode):
```sql
select p.id, p.slug from auth.users u join profiles p on p.id=u.id
where lower(u.email) in ('<email>','<email-variant>');
```
**Assert exactly one row.** 0 rows → stop ("no prod profile for this account"). >1 → stop, list, ask which. Never proceed with a null or ambiguous `owner_id`.

**All content `visibility: private`.** Points: omit `system_tags` (the default `{}` is what you want; do not set it). Story `current_version` is set by the initial-version trigger — just insert the story. If COMMIT fails with a version-invariant error, the trigger did not fire as expected; investigate, do not blind-retry.

**Prod writes use curl + the Supabase Management API.** Cloudflare blocks python `urllib`/`requests` (error 1010); **curl's default User-Agent works** — do not use python for the HTTP call. Source `.env.prod` for `SUPABASE_ACCESS_TOKEN` and derive the prod ref **from `.env.prod` only** (`.env.local` overrides `VITE_SUPABASE_URL` with the test ref). Build the JSON body with python, POST it with curl.

**Atomicity:** submit the entire `DO $$ ... $$` block as ONE Management-API call. The API wraps each call in its own transaction; splitting statements across calls breaks atomicity and half-writes. One call, one DO block, sequential inserts:

```
clarity_docs   (id, owner_id, title, visibility='private')
stories        (id, author_id, content, visibility='private')
points x3      (id, statement, first_validator_id=owner, visibility='private',
                created_at = now(), now()+'1 second', now()+'2 seconds')   -- fact→anti→norm
story_points x3(story_id, point_id, author_id=owner, created_at = matching increasing offsets)
doc_stories    (doc_id, story_id, position=0,
                point_config = jsonb_build_object('order', jsonb_build_array(fact_id, anti_id, norm_id)))
```

**Order is locked twice on purpose** (P837 trap): increasing `story_points.created_at` AND explicit `point_config.order`. Set both.

**Positions** (point_positions; history is trigger-populated). Enum: `strongly_disagree, disagree, somewhat_disagree, unsure, somewhat_agree, agree, strongly_agree`.
```
point_positions (point_id, user_id=owner, position): fact='strongly_agree', anti='strongly_disagree', point='strongly_agree'
```

**Idempotency:** re-running creates a *duplicate* Doc silently. Before filing, ask the user if this is a re-run; if a partial write happened, note that `point_positions` has `UNIQUE(point_id, user_id)` so a naive retry collides — verify clean state or use fresh point ids.

**Fallback** if Management API is blocked: curl PostgREST REST API with `PROD_SUPABASE_SERVICE_ROLE_KEY` from `.env.local` (prod), one table at a time.

**Verify before claiming done.** Read back the doc (private, owner), story (private, current_version=1), points (private, no system_tags, ordered), point_config.order, and the three positions. Show the read-back. Never declare done — present evidence.

**View:** `https://claritypledge.com/d/<docId>` (logged in as owner; private doc is owner-only).

## Cost tracking
After completion, silently append one line to `.private/logs/skill-costs.log`:
`<ISO-timestamp> | create-letter-from-transcript | <model> | <tier>`
