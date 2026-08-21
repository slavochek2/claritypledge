---
status: today
type: task
rank: 4
workstream: events
created_date: '2026-08-20'
tags: [points, agents, events, skills]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: heuristic
---

# P1130: points-publish — the filer that writes a prepared disagreement to the product

Stage 3 of `features/p1096_public_multisource_point_pipeline.md`. Answers its Open Question 7.

## Problem

**Situation:** `/slava:content:points-prepare` produces everything needed to file a disagreement — points aimed at a named room, one story draft per arguer holding only that speaker's verbatim quotes, each agent's position with its inference chain, and a sealed prediction — and writes nothing. It names `/points-publish` as *"the only skill in this chain that writes to the product"*. That skill does not exist: no file, no spec, no reference outside that one line.

**Complication:** This is the half where the irreversibility lives. It publishes verbatim quotes from named real people, under machine accounts that hold positions those people never took. The entire mechanism that stops such an account rendering *as* the person is P1104 — and **P1104 is not in prod.** `git log origin/main --oneline -- supabase/migrations/20260819120000_p1104_agent_accounts.sql` returns nothing; the client code exists only on local `main`, which is 112 commits ahead of `origin/main` (verified 2026-08-20). Confirmed independently against the running site: the deployed prod bundle contains `agent_accounts` **0 times**, against controls of `point_positions` 5 and `profiles` 26 in the same 1,122,611-byte file — so the zero is a real absence, not a blind probe. Prod today has no `agent_accounts` table, no `create_or_reuse_agent_account`, and no marker render path. A filer written without a precondition that asserts this would run clean and publish a robot-avatar account of a real public figure as a pledged, ear-counted person.

**Question:** What is the smallest filer that reaches a public tag feed with no reachable state in which a machine's reading of a person is published as that person?

## Appetite

**Medium-high blast radius.** Writes `profiles`, `agent_accounts`, `stories`, `points`, `story_points`, `point_positions` on a live database, and the accounts it creates are permanent public identities depicting real named people. No schema change — P1104 shipped the tables this needs.

**Reversibility is asymmetric and that asymmetry is the design constraint.** Rows are deletable and the skill file reverts with `git revert`. **Publication does not revert:** a misquote under a named person's video is public the moment it is filed, and an agent account that was seen is an account that was seen.

**Decision density: three**, all named in the brief and all resolved below. None is a taste question; each is settled by a fact in the code.

## Solution

### What it receives, what it writes

| From `/points-prepare` | Written by this skill |
|---|---|
| N points, bald statements | `points` — `visibility: 'public'`, `tags: [<event tag>]`, `first_validator_id` = filing identity |
| One story draft per arguer (summary + that speaker's verbatim quotes + source link) | `stories` — one per arguer, `visibility: 'public'`, `author_id` = that arguer's agent |
| Each agent's position per point, with inference strength | `point_positions` — one row per (agent, point) |
| The arguer list, operator-confirmed | *nothing* — accounts are a precondition, not an output. See decision (a). |
| The sealed prediction hash | *nothing* — the seal is `/points-prepare`'s artifact; this skill asserts it exists |

Plus `story_points` linking every point to **both** stories: a synthesized point is grounded in quotes from both speakers, so both stories are its evidence. Returns the tag feed URL:
`/feed?tag=<event-tag>&sort=oldest&version=latest`.

### Decision (a) — agent provisioning is a SEPARATE skill, `/slava:content:provision-agent`

**Against first, because that argument is the one nothing downstream catches.** points-publish is the only caller today. A second skill is a second file, a second version number, and a second thing to keep in sync with P1104. YAGNI says put the four writes inside the filer and be done.

**Three facts defeat it, and the third is decisive:**

1. **It already has a mandatory sub-skill.** `/slava:content:gen-agent-avatar` is not optional for any new account and carries its own blocking gates — a rights check on the source photograph, an SSIM check against it, a legibility gate at 20/40/96px, and a refusal to emit at all unless the operator line is live. A "stage" that itself invokes a gated skill is not a stage.
2. **It is needed outside this pipeline.** P1104's account model is *"a persistent reading of one person… it accumulates: many sources over time, one story per source."* Regenerating an avatar on a prompt-version bump, creating the founder's own claimed agent, adding an operator — none of these involve filing points.
3. **Provisioning cannot complete inside one run, because it spans a deploy.** `gen-agent-avatar` Step 4 emits the avatar as a **static asset**, not a database value or an upload. So the sequence is: rights-cleared photo → generate → commit the asset → **deploy** → mint the `auth.users` row via the admin API → `create_or_reuse_agent_account` → verify. A filer that stops in the middle and waits for a deploy is already two skills; naming the boundary costs less than pretending it isn't there.

**So: points-publish never creates an account.** It resolves each arguer's `subject_key` against `agent_accounts`, and on a miss it **halts** and says to run `/slava:content:provision-agent`. There is no creation path inside the filer and none may be added.

> **Defect found while reading, which `/provision-agent` must reconcile.** `gen-agent-avatar` v1.0.0 Step 4 says to write `public/agents/{slug}.png` and *"register it beside the account id in the agent constant module."* **Neither exists** — `public/agents/` is absent, and P1104 shipped the `agent_accounts` **table** (row existence answers "is this an agent?"), not a constant module. `grep -rn "AGENT_ACCOUNT\|AGENT_AVATAR" src/` → 0 hits. Step 4 describes a design P1104 replaced. `/provision-agent` sets `profiles.avatar_url` to the asset path and `gen-agent-avatar` Step 4 gets corrected in the same change.
>
> **Static asset, not a storage upload — decided.** One path resolves on every host that serves the app (local, test, prod), so the avatar does not have to be uploaded twice into two different Supabase projects, and the likeness of a real person lands in version control where it can be reviewed and reverted. Cost: the asset must be deployed **before** the prod DB write, or the avatar 404s and the portrait channel silently drops to the initials fallback (`gravatar-avatar.tsx:134`). That ordering is a precondition below, asserted by HTTP status, not by memory.

### Decision (b) — agent positions DO count in the aggregate tally

**Verified, not assumed.** `getPositionCounts` (`src/app/data/points-service-real.ts:409-430`) and the batch feed aggregation (`:378-406`) count every `point_positions` row with no exclusion of any kind. Counting them is therefore the **zero-code-change** answer; excluding them is a `src/` change in three call sites and a different P-number.

**What settles it is not the cost, it is P543.** All three feed paths end in `.filter(point => point.totalPositions > 0)` (`:406`, `:723`, `:842`) — including `getPublicPointsFeed`, the one the returned tag URL resolves through. **A point with no positions does not appear in the feed at all.** So if agent positions were excluded from the tally, every freshly filed point would be invisible on the very URL this skill returns, until a human answered it — and the room has to reach the point before it can answer. Excluding would mean changing P543 too: two coupled changes to make the artifact disappear.

The anchoring question is already decided upstream and does not reopen here: P1096 accepts that *"positions are visible before attendees answer"* on the grounds that the product already shows counts pre-answer and the sources are public anyway.

**Residue, stated rather than closed.** Each agent position row is *individually* disclosed — `Agent · {subject}`, drained card, square avatar, no pledge ring (P1104). The **aggregate bar is not**: it shows one number with no indication that k of n votes are machine readings, and those k sit at the extremes by construction, because a synthesized point is built so the two agents land at opposite ends. In a room of eight, two agents are 20% of the bar.

**Consequence that binds analysis, not the UI:** any reading of a room's answers as evidence must exclude agent `user_id`s at query time. That is a `WHERE user_id NOT IN (SELECT profile_id FROM agent_accounts)`, and it is the analyst's job, not the renderer's. This is consistent with `/points-prepare` Stage 6 — an agent-derived split is a hypothesis, never a finding.

**Falsifier for this decision:** at the first event, if anyone in the room reads the aggregate bar as though it were the room's own split, exclusion becomes a real spec and P543's filter gets revisited with it.

### Decision (c) — dry-run is the DEFAULT, and the plan IS the payload

Every run dry-runs first. There is no flag (`.claude/rules/skills.md`), no "skip preview", and no second path to a write.

**The rule that makes it worth anything:** the printed plan and the executed write must be the **same artifact**, not two derivations of one intention. A preview that re-renders what the writer will *probably* do is a preview that can diverge from it — and the divergence is invisible precisely when it matters. So:

1. Build the complete write payload — every row, every field, fully interpolated.
2. Print it verbatim, and `shasum -a 256` it.
3. Gate: explicit affirmative in the same turn. Silence, ambiguity, or any non-affirmative ⟹ refuse and exit **without writing**. No flag bypasses this and none may be added.
4. Execute **that payload**, and assert its hash still equals the printed one before the first write. A mismatch is a stop, not a warning.

The print includes, in full: every quote with its speaker and source link, every point statement, every agent position with its inference-strength label, the event tag, the resolved `subject_key` and agent `profile_id` per arguer, and the target environment and project ref.

### Environment sequencing — test first, prod second, same skill

P1096 decided the run writes to test first and promotion to prod is a separate deliberate action. Two consequences that the skill must carry rather than discover:

- **`subject_key` is UNIQUE per database, so reuse is per-environment.** An agent provisioned on test is not the same row as on prod; both environments get provisioned, and a test run proves the shape, never the prod ids.
- **The prod invocation is a second full run of this skill against the prod ref**, with its own dry-run and its own gate. It is not a "promote" operation and nothing copies rows between projects.

Credential discipline is inherited verbatim from `/slava:think:align-create-letter` and restated in the skill rather than referenced (a safety property held by reference is lost when the sibling is edited): prod ref from `.env.prod` **only**; credentials from `.env.local` **by variable name only**; a missing variable is a STOP, never a search for a nearby one.

### The event tag mechanic — different for points and stories

Not symmetric, and getting it wrong yields a feed that shows half the artifact:

- **Points:** `tags` is written directly by the inserter (`points-service-real.ts:222`). Pass the event tag; no hashtag in the statement.
- **Stories:** `tags` is **trigger-derived** — `extract_hashtags_from_content()` fires `BEFORE INSERT OR UPDATE OF content` and overwrites whatever the inserter supplied with the hashtags parsed out of `content`. So a story reaches the tag feed only if `#<event-tag>` appears **in its text**.

## Preconditions — blocking, asserted by command, not by belief

Every one of these is a STOP. This section exists because `/align-create-letter` learned it the expensive way: a run where all the gates pass and the artifact is still wrong is the failure that does not announce itself.

1. **P1104 is live in the target environment.** For prod: the migration is applied AND the client is deployed. Assert both — the table responds, and `agent_accounts` appears in the deployed bundle. Not-live ⟹ stop and say the filer would publish accounts that render as people.
2. **Every arguer resolves to an existing `agent_accounts` row** by `subject_key`. A miss halts with the near-matches by display name and the instruction to run `/provision-agent` — never an inline creation, never a fuzzy match.
3. **Each agent's avatar URL returns HTTP 200 on the target host** before any write.
4. **Quote verification has run and produced artifacts** — the `grep -F` exit codes per quote against the cleaned transcript, plus the audio-at-timecode check with who ran it and when. Prose saying "checked before filing" is not a check.
5. **The prediction is sealed** — the hash is committed to the tracked repo. Unsealed ⟹ say so in the output; do not silently proceed as though a prediction existed.
6. **Operator name is non-empty.** Structurally enforced (the RPC refuses an empty one), asserted here so it fails early rather than mid-sequence.

## Risks / Non-Goals

### Risks

- **A quoted person's own words can carry a disguised link.** Story bodies and statements render through `linkify.ts`, whose markdown-link label is independent of its href, and `/points-prepare` harvests comment sections. **MITIGATE:** neutralise `](` as well as `#`, and assert the published URL set equals the operator-supplied source link exactly.
- **This run reshapes surfaces beyond its own tag** — the feed's fixed window and the global tag cloud are shared, so a filed set displaces other people's content from the pages they appear on. **ACCEPT for the first runs, but state the count filed** so the effect is visible rather than discovered.
- **Publishing a claim a person never made.** The non-negotiable, inherited from P1096. **MITIGATE:** positions belong to the agent and are captioned as the agent's reading; the story holds quotes only; no first-person text for any person; the marker channels are a hard precondition, not a render detail.
- **The dry-run and the write diverge.** **MITIGATE:** decision (c) — one payload, hashed, asserted at the write boundary.
- **A partial write leaves orphans.** `point_positions` is `UNIQUE(point_id, user_id)`, so a naive retry after a half-write collides while the stories and points from the first attempt stay public. **MITIGATE:** one atomic block per run where the API allows it; when it does not, say out loud that atomicity is lost and record what was written before the failure.
- **P1104's cold-read checks were waived, not passed.** Its three Acceptance Criteria — a stranger saying that row is not a person, that its position means *the argument implies this*, and who published it — were explicitly waived by the founder on 2026-08-20 and were never run. **The first event is that test, and it runs on real quotes from a real named person.** **MITIGATE:** run the cold read *before* the room, on the test-environment artifact — two questions, one unfamiliar reader, five minutes: *"is that a person?"* and *"who published it?"* This is the cheapest retirement of the waiver and it is available before anything is public.
- **The robotified portrait channel is entirely untested.** P1104's suite is avatar-less by its own admission, so silhouette, chrome and name are proven and the portrait is not. **ACCEPT** — and fold it into the same cold read.

### Non-Goals

- **Do NOT create an agent account in this skill.** Resolve or halt. **NARROWED BY P1135:** the skill may now *invoke* `/provision-agent` at the halt point instead of only halting — but it still contains no account-creation logic of its own, and may not reimplement any part of `/provision-agent`. See [p1135](p1135_agent_avatars_in_storage.md) decision (c).
- **Do NOT author any story text.** It files what `/points-prepare` produced. Wrong text ⟹ re-run prepare.
- **Do NOT write to the point `context` column** (P1095).
- **Do NOT change `src/`.** Decision (b) is the zero-code-change answer precisely so this stays a skill-only change.
- **Do NOT add a flag, a `--yes`, or any second path to a write.**
- **Do NOT copy the tracked-file credential pattern** — `e2e/verify-prod-agreements.spec.ts` is the anti-pattern; its password is a literal in a tracked file by convention.
- **Do NOT write any address, key, password, profile UUID, or person's name into this spec, the skill file, or any tracked artifact.** This repo is public.
- **Do NOT extend the `/align-*` skills** to cover this.

### Alternatives Considered

- **Provisioning inline in the filer.** Rejected on the deploy boundary — see decision (a). It would produce a skill that must pause mid-run for a human to ship an asset.
- **Excluding agent positions from the tally.** Rejected on P543 — it makes every freshly filed point invisible on the URL this skill returns, and requires a second coupled `src/` change to fix.
- **Avatar via Supabase storage upload.** Rejected: two projects means two uploads and two URLs, and the binary escapes version control. **SUPERSEDED BY [P1135](p1135_agent_avatars_in_storage.md)** — decision (a) there defeats both stated reasons: per-environment upload is not new cost (`subject_key` was already `UNIQUE` per database, so provisioning was always per-environment), and the binary escaping version control trades a low-value review surface (PNG bytes) for a real cost this rejection didn't weigh — a public repo committing robotified likenesses of real named people.
- **A `published` boolean instead of the test→prod boundary.** Already rejected in P1096: the environment boundary exists and a flag can be got wrong.

### Rollback Strategy

Skill file: `git revert`. Filed rows: delete in reverse dependency order (`point_positions` → `story_points` → `points` → `stories`).

**Agent accounts are not rolled back by this skill, and as of `20260819160000` they largely cannot be:** `REVOKE DELETE, TRUNCATE … FROM service_role` plus `trg_guard_agent_account_delete` (`:321`, `:337`) mean a registry row cannot be deleted while its profile lives, by anyone. That is deliberate — a deletable registry row is an agent that reverts to rendering as a person.

**There is no un-publish, and the delete is not clean.** `visibility` is immutable after insert (P586), so the only remedy for a filed point is DELETE — and by then real attendees may hold positions on it, which `ON DELETE CASCADE` destroys along with their calibration history. **Deleting a point the room has answered costs the room's data, not just ours.** This is the concrete reason the gate sits before the write rather than relying on cleanup.

## Done-When

- [ ] A dry run prints the complete payload — every quote, statement, position, tag, resolved agent id, and the target project ref — and writes nothing, evidenced by an unchanged row count taken before and after
- [ ] Silence at the gate refuses and exits, evidenced by the identical before/after counts alongside the printed refusal — the failure path exercised, not just the happy one
- [ ] The executed payload's hash equals the printed payload's hash, pasted from the run
- [ ] A run against test files N points, one story per arguer, agent positions, and returns a tag feed URL that resolves and shows the points
- [ ] Every filed story carries `#<event-tag>` in its text and appears under that tag in the feed — the trigger mechanic proven, not assumed
- [ ] A second run covering an already-covered arguer **adds** to that agent, creating no second account — asserted by running it twice
- [ ] An arguer with no `agent_accounts` row **halts the run** and names `/provision-agent` — asserted by running it against an unprovisioned subject
- [ ] A run against an environment where P1104 is absent refuses before any write
- [ ] No story contains first-person text for any person — asserted as a negative check over the filed rows
- [ ] No agent position renders captioned as a person's own position — asserted by reading the rendered page
- [ ] **MANUAL** — The P1104 cold read is run on the test artifact before anything reaches prod: an unfamiliar reader answers *"is that a person?"* and *"who published it?"*, and the answers are recorded whatever they say

## Founder decisions

- **[FOUNDER DECISION: the event tag string]** — one tag per source pair, and it is what the returned URL points at.
- **[FOUNDER DECISION: `operator_name` as rendered]** — appears as *"Operated by {name}"* on every agent's profile page from the moment the avatar is live. It is the accountability disclosure the public-figure policy is conditional on, so it is named, not defaulted. **Note it is a per-SUBJECT invariant, not a per-run string:** reusing a subject under a different operator raises (`20260819160000:284`). Choose it once per subject, deliberately.
- **[FOUNDER DECISION: approval to create `/slava:content:provision-agent`]** — decision (a) proposes a second skill; skill creation requires approval.

## References

- `features/p1096_public_multisource_point_pipeline.md` — the pipeline; this is its stage 3
- `features/done/2026-06-10/p1104_agents_must_be_visually_distinguishable.md` — the marker, the registry, the waived cold read
- `supabase/migrations/*p1104*.sql` — **seven** migrations, read as a set. `agent_accounts` is created in `20260819120000`, but `create_or_reuse_agent_account` is **redefined at `20260819160000`** and the first file's definition is dead. Never cite the first file alone.
- `.claude/commands/slava/content/points-prepare.md` — upstream; produces what this files
- `.claude/commands/slava/content/gen-agent-avatar.md` — mandatory for every new account; Step 4 needs correcting
- `.claude/commands/slava/think/align-create-letter.md` — the prod-write precedent: credential discipline, the seal gate, the five constraints
- `scripts/bootstrap-align-agent.mjs` — the auth-user minting pattern `/provision-agent` follows
