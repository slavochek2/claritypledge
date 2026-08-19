---
status: today
type: story
rank: 2
workstream: events
created_date: '2026-08-18'
tags: [agents, trust, points, identity]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P1104: A machine's reading of a person must never render as that person

**Blocking** `features/p1096_public_multisource_point_pipeline.md`. The pipeline cannot file anything until this ships.

## Problem

**Situation:** The pipeline files a position held by an account carrying one speaker's quoted argument. The design's safety rests on one sentence — the position is *the reading's* commitment, never the speaker's own.

**Complication:** That sentence exists in a spec and a skill and **nowhere in the product** (`grep -rn "reading of that speaker" src/` → 0 hits, verified 2026-08-18). The position-holder row (`point-detail-page.tsx:775-790`) renders a `GravatarAvatar` with `isPledger`, a truncating name, an `EarBadge` reputation count and a `PositionBadge`. No role, no subtitle, no caption slot. An account carrying a named public figure's argument renders as a name, a face, a pledge ring and a reputation score at "+2 agree" on a claim that person never made.

**Question:** What is the smallest change that makes such an account unmistakably not-the-person, on every surface it can reach — **without** introducing a mechanism whose failure mode is to render it as a person?

## Appetite

**Small and bounded.** Two known accounts. **Reversible** — delete a constant and the render branches.

**Decision density: one founder decision** (profile page), plus one question the prototype answers rather than prose (the marker's wording).

## Solution

### What one of these accounts *is* — settled, and load-bearing

**An account is a persistent reading of one person, built from sources someone chose.** It accumulates: many sources over time, one story per source (that speaker's verbatim quotes plus the source link), and a position on each point those sources bear on.

Three models were considered and two rejected on structure, not taste:

- **The account is one source.** Rejected — it collapses into the story it holds and cannot accumulate.
- **The account is an argument** (e.g. *"the case for rent caps"*). Rejected — the product's only identity slot is a profile, and a profile is read as a somebody. An argument in that slot is a category error a reader hits the moment they click it. It also assumed a reuse that nothing in the pipeline would ever perform.
- **The account is a person, read through sources.** Accepted. It is person-shaped, so it fits the identity slot with no seam.

The objection to the accepted model — *a person contradicts themselves across sources, so which source wins?* — is answered by **neither**. Both readings are true of their own source; the honest output shows both, each anchored to the source that produced it. That is why a position is defined as **a reading given a source**, not as a standing belief.

### There is no autonomy. Someone chose the sources.

Nothing here goes looking for material. A person selected the sources, shaped the points, and published the result. **Every such account has an operator, and the operator is named** — this is what makes the artifact fair to a quoted figure who never consented: a human is answerable, not a machine.

This also defines the only status distinction worth recording now:

- **Unclaimed** — the subject and the operator are different people.
- **Claimed** — they are the same person, or the subject authorised it.

**Neither is rendered as a badge.** The name states the relationship, so the distinction is already visible. Calibration — how far a claimed subject has corrected its output — is a spectrum, is a future feature, and is deliberately undefined here.

### Where the marker lives — two surfaces, two mechanisms

The earlier draft tried to make one mechanism carry the marker, the operator and the source at once, and produced a name too long for the row it sits in. They separate cleanly:

| Carries | Where | Why |
|---|---|---|
| **The marker** | the **avatar**, in-app | It never truncates and is always present. Never a photograph of the person — a distinct shape and one consistent palette, which are what survive at the 20px the position row uses (`!w-5 !h-5`). A stylized, visibly synthetic portrait may sit inside for recognition at larger sizes; it must not be what the marker depends on. |
| **The marker** | the **name field**, off-platform | A shared link renders as text only — no avatar, no shape, no colour. The name is the entire disclosure surface there. |
| **The source** | the **linked story** on the position row | Already rendered. Duplicating it into the name is what made the name unusable. |
| **The operator** | the **profile page** | Accountability information, not glance information. Provisional wording *"Published by {name}"*. |

**Consequence worth stating:** because the marker lives in the name, surfaces that render only a name inherit it for free. `PointHeader` renders the author as plain text with no avatar and needs no change.

### The marker's wording is an open question the prototype resolves

Candidates carry different defects. *"Agent"* implies autonomy that does not exist. *"Read by"* implies an act of attention the operator did not perform — the extraction was mechanical. *"Mirror"* is already this product's vocabulary but likely opaque to a stranger.

**No wording is chosen in this spec.** It is settled by putting candidates in front of someone who has not read any of this and asking what they think they are looking at. Choosing it in prose here would be a guess wearing a recommendation's clothes.

#### The prototype exists — built 2026-08-19, cold reader not yet run

A calibration plate rendering the position-holder row at the product's real geometry (12px padding, 20px avatar, `truncate` on the name, the actual `bg-muted`/`blue-100`/`blue-700` token values), with controls for avatar size, greyscale, product theme and simulated viewport width. Six rows — three people, three readings — presented with no explanation above them, which is the cold-read condition the Acceptance Criteria require. Four avatar shapes (M1–M4) and six name wordings (N1–N6, including the spec's three named candidates) are on the plate so the spec's own rejections get tested rather than assumed.

**Two constraints the plate produced, both screenshot-backed and neither in the spec before it was built:**

1. **A trailing marker is not a marker.** `{subject} (quoted)` — the least intrusive candidate — truncates to a bare person's name at a 320px row width, which is the exact harm this spec exists to prevent, reintroduced by word order alone. **Every surviving wording must lead with the marker.** This is a hard filter on candidates, not a preference, and it is decidable without a cold reader.
2. **A single fixed fill fails the product's dark theme.** A slate marker (`#39424B`) against the dark row ground (`#27272A`) drops to near-zero contrast while every human avatar keeps its saturated colour — **the signal inverts**, and the machine-assembled account becomes the quietest row in the list. "One consistent palette" cannot mean one constant colour. What stays constant is the **silhouette**; the fill must be a theme token like every other colour in the product.

Finding 2 also strengthens the shape argument the spec already makes: silhouette is the only channel that survives 20px, greyscale, low contrast *and* a theme swap simultaneously. A hexagon (M2) resolves to a circle by ~24px; a split-fill circle (M3) keeps the human silhouette and reads as a badly cropped photograph; an outline-only square (M4) loses to the row's own 1px border. Only M1 — a filled rounded square against a product where every person is a circle — distinguishes itself by something that is not a detail.

**Still open:** the wording itself, and whether the glyph inside M1 reads as a logo. Neither is answerable from this side of the screen; both need someone who has not read this spec.

### How the marker reaches a render site — no data plumbing

**A hardcoded list of the account ids, in application code. Not a database column.**

**A column fails open, and this repo has already made that mistake.** `20260602160000_p877*.sql` restricts anon/authenticated reads to an explicit grant list carrying `is_verified`, `is_test_account`, `is_certifier`. **`is_admin`, added later by `20260605150000_p878*.sql:39`, is absent from it.** A new flag that misses the same list returns `undefined` → falsy → **renders as a human**. The default failure state of a column-based design is the harm this spec exists to prevent.

A constant in application code cannot return `undefined`. **It fails closed.**

**And it removes the threading problem entirely.** Verified 2026-08-19: every render site already holds an identifier for the person it is showing — `holder.userId` and `authorId` on the point page, `authorId` in the story and point cards, `profileId` on the profile page, `story.authorSlug` in the feed card, and the crawler handlers query the profile row directly. A constant can be read from anywhere, so a site asks "is this one of them?" with what it already has. A column would have to be added to every query and carried through every constructed object — and the point page alone builds four such objects independently.

The fail-closed argument and the no-plumbing property come from the same decision.

### Disclosure must be structural, never repeated prose

The semantic that must land is *given this source, this is the position that argument commits to* — not what the speaker believes. Stamping that sentence on every row is unusable. **The row's structure says it instead:** name, source link, stance. The full explanation lives once on the profile page, and behind the marker as a tap target.

## Risks / Non-Goals

### Risks

- **A marker that is present but weak is worse than none.** **MITIGATE:** tested at the smallest rendering, with a truncating name, on someone who has not read this spec.
- **A stylized portrait reads as a photograph at 20px.** The robotic detail disappears; only shape and palette survive. **MITIGATE:** the prototype must show the marker at 20px before anything is built on it.
- **The list does not scale and must not be allowed to quietly try.** **MITIGATE:** a third account is the trigger to build the durable version deliberately — grant list, write guard, and every accessor that emits a name key. Written into a successor spec, not left to memory.
- **The accessible name is not the visible name.** `point-detail-page.tsx` contains **six** `aria-label` constructions carrying a bare name — lines 755, 797, 882, 920, 948, 1013 — every one in the file. Expanding a story reaches three of them. **MITIGATE:** all six are in scope; one is not evidence about the others.
- **The embed route builds its own objects.** `/point/:id?embed=true` (`point-detail-page.tsx:60`) constructs `embedProfileOwner` (`:404`) and a `getStoryAuthor` callback (`:476`) and hands them to a card component. Migrating the card does not cover the route. **MITIGATE:** the embed path is an explicit test case, not an inferred one.
- **Off-platform surfaces cannot carry a shaped marker at all.** **ACCEPT and state it** — this is why the name carries one, and it constrains what these accounts may hold a position on, which is a product decision rather than a rendering one.

### Non-Goals

- **Do NOT add a database column, touch the grant list, or write a trust-column guard.** That is the successor spec, triggered by account #3.
- **Do NOT build capabilities, autonomy, registries, or agent-to-agent anything.**
- **Do NOT let one of these accounts hold a pledge, an oath, or a reputation count.**
- **Do NOT build claiming, calibration, or following.** The name already encodes claimed-versus-unclaimed, so nothing downstream is blocked by waiting.
- **Do NOT enable multiple positions on one point.** `UNIQUE(point_id, user_id)` stands. For the first event each account reads one source, so it never binds. When it does, the answer is readings-per-source, not a dated history — source dates are unreliable or absent, and the existing history log timestamps when a row was written, not when the source is from.
- **Do NOT fix link-preview truthfulness here.** `features/p1108_link_previews_say_true_things.md` owns it.
- **Do NOT refactor how people render.** An earlier attempt was filed and its premise did not survive review; the marker is additive and touches nothing about people.
- **Do NOT name one of these accounts as a bare person's name.**

### Alternatives Considered

- **A durable profile flag.** Rejected on failure mode, not effort: it fails open, the identical omission has already happened once with `is_admin`, and it reintroduces the threading a constant avoids.
- **Naming convention alone.** Rejected as sole mechanism — it truncates and carries nothing in an avatar. Retained *with* the list, for the off-platform case.
- **Excluding these positions from the count.** Considered and rejected — the counts are not load-bearing evidence, a filter is a later addition, and splitting the number now is a decision without evidence behind it.
- **Skipping these accounts for the first event.** Coherent, but it leaves the room a bare claim with no grounding — the defect that made P1074's anti-point unevaluable.
- **`features/p1052_agent_persistent_identity_via_staked_positions.md`** asks whether such an account can hold identity at all. This spec does not answer it; cited so the two are not conflated.

## Open Questions for /architect

1. **Does one of these accounts get a profile page?** `[FOUNDER DECISION]` — **ANSWERED 2026-08-19: yes, the full profile page.** Not a separate stripped-down page: a new page is a new surface with its own render sites, which is exactly the threading cost the constant was chosen to avoid. The account uses `pages/profile-page-v2.tsx` and carries the marker there, with the pledge ring and ear count suppressed by the same branch as everywhere else. Rationale as recommended: a persistent accumulating account needs somewhere its stories and positions live, the operator line needs a home, and claiming later needs a page to claim. A shared profile link would carry a false pledge claim, but that is pre-existing for every non-pledger and is P1108's, not a blocker here.
2. **The marker's wording, and the operator line's wording** — resolved by the prototype, not by this spec. **Plate built 2026-08-19** (see Solution). It has already eliminated every trailing-marker wording on truncation grounds and constrained the marker's fill to a theme token. The remaining half — which leading wording a stranger reads correctly — needs a cold reader and is the next action on this spec.

## Surfaces

Every surface one of these accounts can reach. Each shows the marker or is listed with its reason.

**In scope**

- `point-detail-page.tsx:775-790` — the position-holder row
- `point-detail-page.tsx` — `ExpandableStoryRegion` (~842-882), a second independently-built author object
- `point-detail-page.tsx` — `PositionlessStoryRow` (~920-1013), a third
- `point-detail-page.tsx:60, 404, 476` — the `?embed=true` route, a fourth
- `point-detail-page.tsx` — six `aria-label`s: 755, 797, 882, 920, 948, 1013
- `feed/feed-story-card.tsx` — the public feed. **P1096:63, verified 2026-08-17: "A story renders on both the feed card and the point detail page."** The earlier three-surface scope was refuted by the pipeline spec's own text.
- `social/StoryCardDetail.tsx` — story detail
- `social/story-card-with-links.tsx`
- `social/point-card-with-links.tsx`
- `pages/profile-page-v2.tsx` — the account's profile page, plus the `Published by {operator}` line (decision 1: yes)
- `api/og.ts` — `ogForStory` (:74), `ogForPoint` (:96) and `ogForProfile` (:117). Serverless, outside React, so they carry the marker via the name.

**Excluded, with reasons**

- `shared/PointHeader.tsx` — renders the author as plain text with no avatar; inherits the marker through the name, needs no change
- `profile/compact-profile-card.tsx` — dead code, no importers found 2026-08-19
- `clarity-live-page.tsx` — no avatar import; its name handling is audio-chunk upload keys
- `shared/story-image.tsx` — uses the author name in `alt` text only, which reads correctly
- letters (10 files), partner sessions (3), story-guide (2) — 1:1, invite-scoped, or a composer for one's own content

## Done-When

- [ ] Both accounts render the marker on every in-scope surface, with no pledger ring and no ear count — screenshots at the smallest rendering and with a truncating name
- [ ] The marker is legible as not-a-person at 20px, in greyscale — screenshot pasted. **Prototype evidence produced 2026-08-19** for M1 at 20px in greyscale in both product themes; this box stays open until the shipped implementation is screenshotted, not the plate.
- [ ] `curl` of each in-scope crawler handler for content carrying one of these accounts returns a description that does not present it as a person's — output pasted
- [ ] All six `aria-label`s on the point page read as not-a-person — each read from the rendered output, not inferred
- [ ] The `?embed=true` route shows the marker — screenshot pasted
- [ ] `grep` of the id constant returns exactly the in-scope surfaces and no others — output pasted
- [ ] Every surface rendering a profile is either in scope or listed above with its reason
- [ ] No account's display name is a bare person's name — checkable because both names are chosen by us; **not** generalizable (`.claude/rules/pii.md` records that automated name detection was rejected against a measured false-positive baseline)
- [x] Founder decision 1 answered and recorded here — **yes, full profile page** (2026-08-19)

## Acceptance Criteria

- [ ] Someone who has not read this spec, shown the point page cold, says that row is not a person
- [ ] The same person, asked what its position means, says something equivalent to *"that's what the argument in that source implies"* — **not** *"that's what the speaker thinks"*
- [ ] The same person can say who published it, within one click
