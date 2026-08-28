---
status: today
type: story
rank: 4
created_date: '2026-08-13'
tags: [organizations, events, schema, membership]
delivery_stage: generate-tests
pipeline_ran: [create-spec, grill-me, generate-tests]
driver: heuristic
uat_file: features/uat/p1060.md
test_files:
  - e2e/integration/p1060-events-org-migration.spec.ts
  - e2e/p1060-org-scoped-events.spec.ts
  - e2e/p1060-org-directory.spec.ts
  - e2e/a11y/p1060-accessibility.spec.ts
---

# P1060: Events belong to an organization — and the second organization that needs it

## Run This

Type this from anywhere in the repo — the main checkout is fine. Nothing to `cd` into, nothing to
rebase; the worktree is already claimed for this spec and already carries the pinned contract.

    /goal "Work in the worktree on branch feature/p1060-events-org. Then: ./scripts/goal-gate.sh p1060 exits 0, output pasted. Stop after 30 turns."

`/goal` is native Claude Code, not a repo skill — the founder types it; no agent can invoke it for
them. The condition names an exit code on purpose: the evaluator reads the transcript and runs
nothing, so the only trustworthy condition is one naming an artifact the agent cannot author.

**Why the worktree clause is not decoration.** `goal-gate.sh` CHECK 3 hard-refuses to run on the
shared main checkout, so a loop started there cannot reach exit 0 no matter what it builds. Naming
the branch rather than a slot keeps this line correct if the work is ever moved.

> **[WIDENED 2026-08-19 — founder decision.]** Filed 2026-08-13 as a schema placeholder (`events.org_id`, column + backfill, *"Do NOT change event visibility or access rules here"*). That Non-Goal is **retired, deliberately**, because the condition it was waiting for arrived: the founder wants a **second Clarity Organization for online events**. The column alone does not make two organizations usable — see Problem — so shipping it without the surfaces that read it leaves the visible defect in place on the day org #2 appears. The original narrow scope is preserved at the bottom under *Superseded scope*.
>
> **[FINALIZED 2026-08-28 — eleven founder decisions recorded below, visual reference approved, zero open. Ready for `/generate-tests` then `/goalify`.]** Two changes to the widened scope. **(a) The paid membership level and gated events are split out to [p1183](p1183_membership_levels_and_gated_events.md)** — different blast radius (it writes onto the terms-acceptance record, irreversible once anyone pays), nothing to attach to (zero paid members, no payment collection), and it was gating the four items that unblock org #2 this week. **(b) `/org` — a directory of all organizations — is added**, closing the follow-up that [decisions.md](../docs/decisions.md) 2026-07-23 [product] deferred by name (*"Deferred to followups: user-facing org creation, discovery index (`/org`)…"*). The condition that deferral was waiting for is the same one that widened this spec: a second organization.

## Problem

**Situation:** `events` has `host_id → profiles` and no organization reference. [p1010](done/2026-06-10/p1010_clarity_organizations_community_container.md) shipped `organization` + `membership`, so multiple organizations are already structurally supported — the only missing edge is from an event to the org that holds it. `organization.has_events` is a *display toggle* for whether the Events tab renders (`org-page.tsx:285`), not a filter; the embedded list calls `eventsService.getUpcomingEvents()` / `getPastEvents()` with no org argument (`EventsList.tsx:41-43`).

**Complication:** the founder is creating a second organization — **Clarity Practice Community · Online** — to host online events, alongside the existing **· Chiang Mai**. On the day it exists, both pages list the same events: Chiang Mai shows the online sessions, Online shows the Chiang Mai ones. The "Past" count visible on the org page today is not Chiang Mai's; it is every event on the platform. Two organizations is therefore *worse* than one until this edge exists.

**Third complication (2026-08-28, measured):** the backfill this spec originally prescribed — *"existing rows backfilled to the Chiang Mai org"* — is **factually wrong**. Prod holds **10 events, and 2 of them are on Ko Phangan**, not in Chiang Mai. Backfilling all ten to `· Chiang Mai` would write a false historical claim into the very column this spec exists to make trustworthy. **Zero online events exist** — all ten are physical — so `· Online` launches empty, which is what makes the empty-state decision (D6) blocking rather than deferrable. Verified 2026-08-28 by read-only query against **prod** (`/rest/v1/events`, anon key); the full classification is in Solution item 2.

**Fourth complication:** the founder's stated end-state includes *"people go to `/org` and see all organizations, then go into one of them."* **That surface does not exist** — `src/App.tsx:963-965` defines `/org/:slug` and `/org/:slug/join` and nothing else. With two organizations and no directory, the second one is reachable only by knowing its URL.

**Question:** what does an event belong to, who may host into it, and how does anyone find the second organization at all?

## Appetite

**Blast radius: medium** — one nullable column is low, but the surfaces reading it are the org page, the events list, event creation, and a new public route. Reduced from *high* by the p1183 split: nothing here touches the acceptance record. **Reversibility: high** — the column, the seed, the directory route and the scoping are all revertible; no financial or terms state is written. **Decision density: none open** — all eleven decisions are recorded below, and the visual reference is approved.

## Decisions (recorded 2026-08-28, founder)

| # | Decision | Value | Why |
|---|---|---|---|
| D1 | `events.org_id` nullability | **Nullable** | The 3 Ko Phangan rows genuinely belonged to no organization, because none existed. `/events/new` is open to any logged-in user with no org context; `NOT NULL` would need an org picker before anything could save, and would force every future ad-hoc event into a community it isn't part of. |
| D2 | What the backfill writes | **The 8 Chiang Mai events only; the 2 Ko Phangan events stay NULL** | Keeps the column honest, which is the entire point of adding it. Backfilling all ten would overstate that community's history permanently. Exact slug list in Solution item 2. |
| D3 | Org #2 slug | **`online`** → `/org/online` | Pairs with the existing `/org/cm`; reads as the instance name. |
| D4 | Who may host into an org | **Organizers of that org only, from the org page** | Standalone `/events/new` stays open to any logged-in user and creates an orgless event. Matches the founder's end-state (leader of · Online posts events under it) and stops the org page inviting strangers to host into a community they may not belong to. **Note:** `membership_insert` lets any authenticated user join a public org in one click, so "any member" would be close to "anyone" in practice — that is why the line is drawn at organizer. |
| D5 | `/org` directory | **In this spec** | One route, one query, one list page. Closes the [decisions.md](../docs/decisions.md) 2026-07-23 deferral by name. Explicitly a listing, never a creation surface. |
| D6 | Empty Upcoming | **Fall through to Past, explicitly labelled** | · Online launches with **0 upcoming and 0 past** — the state that matters at launch. **Correction 2026-08-28:** an earlier draft justified this with *"· Chiang Mai has past events but none upcoming"*; that is false today — `getUpcomingEvents` filters `datetime >= grace AND status IN ('upcoming','cancelled')`, and Chiang Mai has **1 upcoming** (Social Hike, 2026-08-30) plus 7 past. The rule stands on · Online's empty state and on Chiang Mai's state after 30 Aug, not on a count that was wrong when written. |
| D7 | · Online blurb | **Seed it NULL; add the copy later** | The founder does not yet know who · Online is for — *"their purpose is to attract different kinds of people… maybe we don't know yet."* A blurb guessed now would be a positioning claim made before the positioning exists. `organization.blurb` is nullable and `org-header.tsx:121` already guards it (`{org.blurb && …}`), so a NULL seed renders cleanly today with **no code change**; the directory card omits the line entirely rather than showing a placeholder. **This unblocks the seed migration.** An earlier draft recommended mirroring Chiang Mai's blurb — retracted, it was read off the stale p1010 migration seed; prod's live blurb is a voice-led hook replaced by `20260729220000_p1010_cm_about_copy.sql`. |
| D8 | Membership levels + gated events | **Split to [p1183](p1183_membership_levels_and_gated_events.md)** | See the FINALIZED callout above. |
| D9 | Show a **participant** count beside the member count | **Yes — count + avatar stack, both on the directory card and the org header** | Measured on prod 2026-08-28: · Chiang Mai has **1 member and 45 distinct people who have RSVP'd** to its events. The directory card as first designed said *"1 member"* — hiding 45 real people and making a live community read as dead. This is the single highest-value change to the surface being built. **No RLS work:** `event_rsvps` is already `SELECT USING (true)` (`20260118_create_events.sql:70`). |
| D10 | What to call them | **`member` and `participant`** | *Member* = accepted the Clarity Organization Terms (a commitment; the membership row IS that record). *Participant* = has RSVP'd to one of its events (a fact). **"Guest" is unavailable** — [definitions.md](../docs/definitions.md) defines *Unverified Guest* as a specific auth type (anonymous auth, `is_verified: false`, `slug: null`, cannot author content) reached through `/live`. Reusing it here would collide with an identity class, not just a label. |
| D11 | The participant **list** surface | **Split to [p1192](p1192_organization_participant_roster.md)** | The count is one query and makes the directory honest today. A browsable roster needs its own PII-gated accessor mirroring `get_organization_members` (per-row gating on verified+pledged, P877 style) and a fourth tab on the org page. Different size, different review; it does not block the directory. |

## Solution

**1 — the edge.** `org_id UUID REFERENCES public.organization(id)` on `public.events`, **nullable** (D1), indexed.

**2 — the backfill, before org #2 is seeded (D2).** The migration **enumerates slugs explicitly**. It must NOT match on a `location LIKE '%Chiang Mai%'` heuristic: 3 of the 10 rows store a Google Maps URL instead of an address, one stores a Thai-script street address, and one Chiang Mai row resolves only by following a shortened link — a substring match silently misclassifies four of the eight.

**Classified 2026-08-28 against prod (`/rest/v1/events`, anon key, read-only).** Set `org_id = (SELECT id FROM organization WHERE slug='cm')` for exactly these 8:

| Event slug | Location evidence |
|---|---|
| `clarity-dinner-1-exploring-coordination-understanding-2026-02-12-ld5e` | Thai-script address, Mueang Chiang Mai District |
| `ai-run-1` | Fernpresso at Lake, Chiang Mai |
| `ai-running-club-chiang-mai-2-sun-may-24-2026-05-17-b0rc` | Fernpresso at Lake, Chiang Mai |
| `ai-running-club-chiang-mai-3-sun-may-31-2026-05-24-gfmi` | Fernpresso at Lake, Chiang Mai |
| `how-well-do-your-ai-clients-and-partners-understand-your-business-model-2026-06-08-bpl3` | short URL → Zuzalu Library, 18.7959, 98.9663 — Chiang Mai |
| `clarity-hike-doi-pui-peak-double-loop-2026-06-21-w4k2mj` | maps URL → 18.82555, 98.89449 — Doi Pui, Chiang Mai |
| `clarity-hike-buddha-footprint-doi-pui-peak-2026-07-05-76dde6` | Doi Suthep–Pui National Park, Chiang Mai |
| `social-hike-buddhas-footprint-trail-2026-08-30-9099c3` | maps URL → Hmong Doi Pui Family Coffee, Doi Pui, Chiang Mai |

**Left NULL — deliberately, these belonged to no organization because none existed:**

| Event slug | Location evidence |
|---|---|
| `clarity-run-phaeng-noi-waterfall-loop-2026-02-25-jizou5` | Zoo Cafe, Ko Phangan |
| `clarity-lab-koh-phangan-2026-03-12-ad3385` | Inner Space Coworking, Ko Phangan |

**Re-verify before running.** This list is a snapshot of prod on 2026-08-28. Re-run the query and reconcile if any event was created or edited since — the migration should also assert it touched exactly 8 rows and fail loudly if not, rather than silently backfilling a different set. State the count in the migration comment.

**3 — the second organization.** Seed **Clarity Practice Community · Online**, slug `online` (D3), `visibility: public`, `has_events: true`, blurb **NULL** per D7 (nothing blocks this item), following the existing seed pattern (`20260724120000_p1010_organizations_membership.sql:163`) plus its organizer membership row for profile slug `slava`. Idempotent `ON CONFLICT (slug) DO NOTHING`, matching the p1010 seed. No routing change is needed — `/org/:slug` is already dynamic.

**4 — each org's Events tab lists only its own events.** `EventsList` takes an optional org scope; the org page passes its own. `eventsService.getUpcomingEvents()` / `getPastEvents()` gain an optional org filter. The standalone `/events` list is unaffected and keeps showing everything.

**5 — the `/org` directory (D5).** A public route listing every `visibility='public'` organization — name, blurb (omitted when NULL), **participant count and member count** (D9), and whether it has upcoming events — each linking to `/org/:slug`. Readable signed-out, like the org pages themselves. **Not** a creation surface: no "create organization" affordance appears on it (p1010 Decision 7 stands; the create-org gap is named below and owned by nobody yet).

**6 — hosting into an organization (D4).** Today the org page shows "Host Event" / "Co-create" to any logged-in visitor (`EventsList.tsx:88-101`), and files an event that belongs to nothing. In the embedded (org-page) context those actions render **only for an organizer of that org**, and the event created from there carries that org. The standalone `/events` context is unchanged.

**7 — the empty-Upcoming display (D6).** When an org's Upcoming list is empty, its Events tab shows Past under an explicit heading rather than an empty state. When both are empty, one honest line — not a bare empty list, and not an invitation to host for a visitor who may not host (D4).

**8 — the participant count, and the avatar row (D9/D10).** A **participant** is a distinct profile
with an RSVP to an event whose `org_id` is this organization — so the count only exists once item 1
lands, and it is exactly what the org edge buys beyond scoping a list.

- **Where it shows:** on each `/org` directory card, and in the org page header beside the member count.
- **How it shows:** reuse the existing overlapping-avatar row rather than inventing one —
  `src/app/components/landing/social-proof.tsx` (`-space-x-2`, `PersonAvatar` at `size="sm"`, a
  `+N` badge carrying `relative z-10`, fixed row height so the row never collapses and shifts layout).
  That component's own comment records why the badge needs `z-10`; a fresh implementation will
  rediscover that bug. The same reuse applies to the card's "Open" affordance — match whatever
  `/pledgers` and the profile cards already use, do not author a new one.
- **Honest label — RESOLVED 2026-08-28: "45 have joined events".** We record RSVPs, not attendance.
  *"45 participants"* reads as *45 people came*; what we know is *45 people said they would*. For a
  product whose subject is calibrated claims, that gap is not papered over in its own directory.
  *Participant* remains the roster noun in [p1192](p1192_organization_participant_roster.md). If
  attendance is ever recorded separately, the stricter word becomes available.
- **Zero-participant organizations** (· Online at launch) omit the row entirely rather than printing
  `0` — the same rule as the blurb and the past-event count.
- **Not a new visibility surface.** `event_rsvps` is already world-readable; this reads rows anon can
  already read. It stays a count plus public avatar fields (name, slug, avatar) — **no PII column is
  added to any payload**, and the browsable roster with its gated accessor is p1192's problem.


## Naming — settled layers

Two of three layers are settled and used by this spec. The third moved to p1183 with the paid rung.

| Layer | What it is | Value | Owner |
|---|---|---|---|
| **Kind** | the container type; what the terms are called; what the schema calls it | **Clarity Organization** — unchanged, never marketed | settled |
| **Instance** | the communities themselves | **Clarity Practice Community · Chiang Mai**, **Clarity Practice Community · Online** | **this spec** |
| **Level** | what a member has inside an instance | free, and a paid level — name still open | **[p1183](p1183_membership_levels_and_gated_events.md)** |

The collision this resolved: `goals.md:15` and `lean-canvas.md:590` name the **€295/month paid rung** *"Clarity Practice Community"*, which is also the name of the free organizations. Applying the resolution to `lean-canvas.md` §Revenue runs through `/slava:maintain:docs-strategy-update` and belongs to p1183, since it is the *Level* row that renames the rung.

**Consequence with no owner yet:** the paid rung's month-3 milestone is *"they are running it in their own Clarity Organization"* ([goals.md](../docs/goals.md)), but no create-org capability exists for anyone — p1010 made `/org/:slug` a lookup, never a creation surface, on purpose. The milestone currently requires the founder to hand-seed an organization per member. Fine for member one; **needs its own spec before member three.** The `/org` directory in item 5 does not change this: it lists, it does not create.

## UX Design

**Visual reference — APPROVED by the founder 2026-08-28.** `/goalify` Phase 2 is satisfied; do
not re-ask for it.
https://claude.ai/code/artifact/10cedd0b-ddac-42f6-8c45-4fa002319810

This is the **named reference** for `/goalify`'s Phase 2 and the artifact the blind reviewer is given.
Per [goalify](../.claude/commands/slava/build/goalify/SKILL.md) the reviewer receives renders plus this
reference and **not** the diff, the intent, or this spec's rationale. It draws six states at the
fidelity a reviewer can judge:

| Screen | State | Why it is drawn rather than described |
|---|---|---|
| A | `/org`, signed out, desktop | The new surface's default and most common condition |
| B | `/org`, signed in, member of · Chiang Mai | Proves the only signed-in delta is a membership badge |
| C | `/org` at 320px | Narrow is the most common overflow surface ([visual-qa.md](../.claude/rules/visual-qa.md)) |
| D | `/org/cm` Events, Upcoming empty | D6's fall-through — the labelled heading is its whole visible substance |
| E | `/org/online` Events, nothing at all | · Online's day-one state; the one an invited stranger most likely lands on |
| F | Host-CTA visibility matrix | D4, including the **allowed** row (standalone `/events` unchanged) — gate 7c |

Screens A, B and C additionally carry the avatar row and the two counts; E is the reference for the
zero-participant case (**no row, no `0`**) and for a NULL blurb rendering as absence, not placeholder.

**Fidelity verified 2026-08-28 — both checks per [decisions.md](../docs/decisions.md) 2026-08-21 [process].**
Ran against the app at `localhost:5001/org/cm`. **Token diff: 12 divergences found, all corrected** —
the reference had been built from `docs/design-system.md` prose rather than measured values, so its
neutrals were blue-biased where the app's are zinc (`--foreground #09090b`, `--muted-foreground
#71717a`, `--border #e4e4e7`, `--radius 8px`), and the mock used a system font stack where the app
resolves to **Inter**. **Screenshot comparison: 4 structural defects the token diff could not see** —
production event cards carry a **4px `blue-500` left rail** and a banner image (mock had neither),
the Upcoming/Past filters carry counts in their labels (`"Upcoming (1)"`, `"Past (27)"`), and the org
header has **no avatar tile** — the reference had invented one. Join CTA reads *"Join as member"*.

**The rail is the second occurrence of the identical defect** the 2026-08-21 entry recorded on a prior
reference. The measured table is in the artifact's *Fidelity check* section.

**Not claimed:** `/org` itself has no live page to screenshot; its layout is verified only against its
sibling's measured values and structure. Local DB counts differ from prod.

**Design values are lifted, not invented** — blue-500/600 actions, green-600 for the membership badge
only, no amber/orange/yellow/purple, `max-w-5xl px-4 py-8 space-y-8`, 44px targets, and the existing
underline-tabs-vs-pills split (`org-page.tsx` ORG_TAB_CLASS comment). A build that renders both
navigation levels as pills has broken a real idiom.

**Founder-reviewed 2026-08-28** — screens A/B/C approved verbatim (*"I think we can do it exactly
like that"*). Revised in the same pass to carry the participant count and avatar row (D9/D10), and to
drop the blurb placeholder now that D7 seeds NULL.

**All open items signed off 2026-08-28** — the participant-count wording (*"45 have joined events"*),
the initials tiles, and the one-line differentiator under each org name (*"The room brings the
topic"* / *"The topic is set in advance"*, from [goals.md](../docs/goals.md)'s topic-source split).
That last line is **load-bearing now that · Online carries no blurb**: it is the only text
distinguishing two near-identical names, so treat it as product copy, not a caption.

**Freeze it at pin time.** The URL is stable across republishes — which is why one link suffices, and
also the hazard: the page behind it can change while the link cannot. Once `goal-gate` pins the
contract hash, **do not republish the artifact**; a changed reference silently changes what the blind
reviewer is judging against, mid-run, with nothing to detect it. If it must change, unpin, republish,
re-pin.

## Risks / Non-Goals

### Risks

- **MITIGATE — the backfill is a historical claim, and the naive version of it is wrong.** Measured above: 2 of 10 prod events are not Chiang Mai's, and a `location` substring match would misclassify 4 of the 8 that are. Mitigation: D2 — the explicit slug list in Solution item 2, a row-count assertion in the migration, and no substring matching. Run the backfill **before** seeding org #2, so every touched row is unambiguously Chiang Mai's.
- **MITIGATE — a new public route with no prod health coverage.** [decisions.md](../docs/decisions.md) 2026-06-06 records the standing rule: *"a new public route joins `PROD_HEALTH_ROUTES` in the same diff that ships it"*, and notes that nothing mechanical enforces it. `/org` is a new public route. Mitigation: add it to `PROD_HEALTH_ROUTES` in this diff.
- **MITIGATE — RLS drift.** An org edge invites org-scoped visibility rules the current events policies do not anticipate (`SELECT USING (true)`, `20260118_create_events.sql:41`). This spec deliberately does **not** change them: an org-scoped event stays world-readable and the scoping is a query filter, not a policy. Mitigation: confirm this explicitly in the review and say so in the migration comment — the *readable-by-all / joinable-by-some* split arrives with [p1183](p1183_membership_levels_and_gated_events.md), not here.
- **MITIGATE — the D4 hosting change is a new refusal, and new refusals block work that was previously fine.** Hiding the org-page host CTA from non-organizers must not hide it from the standalone `/events` list, where any logged-in user may still host. Mitigation: [epistemic.md](../.claude/rules/epistemic.md) gate 7c — test the *allowed* path, not only the refused one: an organizer sees it on the org page, a non-organizer does not, and any logged-in user still sees it on `/events`.
- **ACCEPT — the standalone `/events` list keeps showing everything.** That is its job.
- **ACCEPT — the participant count measures RSVPs, not attendance.** Named in Solution item 8 with the wording recommendation; the mitigation is the label, not the metric. Recording real attendance is a separate capability nobody has asked for.
- **ACCEPT — orgless events are invisible on every org page.** The 3 Ko Phangan events, and any future ad-hoc one, appear only on `/events`. Correct under D1; if those ever need a home it is a third organization, not a change here.

### Non-Goals

- **Do NOT build payment collection, subscriptions, or billing.** No rung of the ladder is purchasable and none becomes purchasable here.
- **Do NOT build membership levels or gated events.** Split to [p1183](p1183_membership_levels_and_gated_events.md).
- **Do NOT build a create-organization flow.** `/org` lists; it never creates. Named above as a gap with no owner.
- **Do NOT build the browsable participant roster.** Count and avatar row only — the list, its gated accessor and its tab are [p1192](p1192_organization_participant_roster.md).
- **Do NOT add a search box to `/org`.** Two organizations. Revisit past roughly a dozen.
- **Do NOT build a new all-events page.** `/events/*` already exists (`src/App.tsx:958`) and is the target of the directory's footer link; it stays unchanged (existing Non-Goal).
- **Do NOT change the standalone `/events` route's behavior.**
- **Do NOT change `events` RLS.** If the implementation appears to need it, stop — that is p1183's territory arriving early.
- **Do NOT backfill with a `location` substring match.** See D2.
- **Do NOT invent the · Online blurb.** Seed it NULL (D7); render nothing where it would go. No placeholder string, in the migration or the UI.
- **Do NOT read org copy from the p1010 migration seed.** It is stale — prod's Chiang Mai blurb was replaced by `20260729220000_p1010_cm_about_copy.sql`. Read live prod for current copy.
- **Do NOT edit [p1010](done/2026-06-10/p1010_clarity_organizations_community_container.md) or [p1076](done/2026-06-10/p1076_org_invite_link.md).** Both `all-done`; shipped specs are records.
- **Do NOT take the [p1110](p1110_org_invite_landing_and_cta_competition.md) fixes into this spec.** They ship independently and first.

## Done-When

- [ ] `events.org_id` exists, nullable, with a foreign key to `organization`, indexed
- [ ] The 8 listed Chiang Mai events carry the Chiang Mai organization; the 2 Ko Phangan events are NULL — backfilled before org #2 is seeded, by the explicit slug list in Solution item 2, with a row-count assertion that fails if it did not touch exactly 8
- [ ] The · Online blurb (D7) is supplied by the founder and recorded in this spec before the seed migration runs
- [ ] **Clarity Practice Community · Online** exists, is reachable at `/org/online`, and has an organizer membership row
- [ ] Chiang Mai's Events tab lists only Chiang Mai's events; Online's lists only Online's — verified with at least one event in each
- [ ] The visual reference is founder-approved and its four open items are resolved, before the contract is pinned
- [ ] `/org` lists every public organization and links to each; readable signed-out; carries no create-organization affordance — matching the approved reference at 320px, 375px and desktop
- [ ] `/org` is in `PROD_HEALTH_ROUTES` in the same diff
- [ ] An event created from an org page carries that organization
- [ ] The org-page Host Event / Co-create actions render for an organizer of that org and not for a non-organizer — **and still render for any logged-in user on the standalone `/events` list** (both halves asserted)
- [ ] An org with no upcoming events shows its past events under an explicit heading; an org with neither shows one honest line
- [ ] Each directory card and the org header show a participant count computed from RSVPs to that org's events — · Chiang Mai reads 45, not 1
- [ ] The avatar row reuses the existing `social-proof.tsx` pattern (including the `+N` badge's `z-10`), not a new implementation
- [ ] An organization with zero participants renders no avatar row and no `0` — asserted against · Online
- [ ] No PII column beyond the public avatar fields appears in any directory or header payload
- [ ] Events RLS explicitly confirmed unchanged, stated in the migration comment

## Superseded scope (original filing, 2026-08-13)

Filed as: add `org_id`, index it, backfill to the single existing org, review RLS — with Non-Goals *"Do NOT change event visibility or access rules here. Column and backfill only"* and *"Do NOT build the org-scoped position overview."* The second of those still stands (that is [p1055](p1055_norm_measurement_instrument.md) plus a view spec). The first is retired by the 2026-08-19 widening. Original rationale: *"Not urgent while one organization exists, which is why this is backlog and not week. It becomes blocking the moment a second one does."* — which is exactly what happened.

## Test Coverage Strategy

**What's Tested:**
- ✅ Schema: `events.org_id` — nullable, FK-enforced, indexed (integration, MANDATORY per P270)
- ✅ RLS regression guard: an org-scoped event stays world-readable to anon (integration)
- ✅ · Online seed: public, has_events, blurb NULL (D7), organizer membership exists (integration)
- ⚠️ Backfill correctness (8 CM slugs → org_id=cm, 2 Ko Phangan slugs → NULL): **best-effort** against the named prod slugs — skips with a warning on a DB that never had those prod rows (integration; the migration is a literal slug enumeration, not a location classifier, so synthetic test data cannot exercise it)
- ✅ Org-scoped Events tab: cross-org isolation, both directions (E2E)
- ✅ Standalone `/events` unaffected — the explicit ALLOWED path (E2E, gate 7c)
- ✅ D4 host-CTA matrix: organizer sees it / non-organizer doesn't / any logged-in user still sees it on `/events` — all three states (E2E, gate 7c)
- ⚠️ Done-When "event created from org page carries that org" — link carries org context forward is tested; full form-submission round trip is not (form complexity out of scope; flagged UAT-manual)
- ✅ D6 empty-Upcoming fallback: 0-upcoming/some-past and 0-upcoming/0-past, structurally (exact copy not yet specified — TODO(/dev) to tighten once written)
- ✅ D9/D10 participant count: verbatim "N have joined events" wording, distinct-profile counting, zero-case omission (no row, no "0") (E2E)
- ✅ Avatar row reuse: `data-testid="person-avatar"` renders, accessible name/alt present (E2E + a11y)
- ⚠️ `+N` badge `z-10` visual correctness — flagged for manual `/verify`, not automated (paint-order assertions at this DOM depth are unreliable)
- ✅ Participant payload shape: no `email`/`reason` beyond public avatar fields (E2E)
- ✅ `/org` directory: lists public orgs only, links to each, no create-org affordance, signed-out readable, NULL-blurb omission, membership badge delta (E2E)
- ✅ `/org` registered in `PROD_HEALTH_ROUTES` (mechanical assertion, closes the "nothing enforces it" gap named in Risks)
- ✅ Directory keyboard reachability + member-count button semantics (a11y)
- ✅ No-horizontal-overflow at 320px (E2E, structural)

**What's NOT Tested (and why):**
- ❌ Pixel-level visual match to the approved reference (screens A-F) — no visual-regression tooling in this repo; owned by `/verify` against the pinned artifact URL
- ❌ The differentiator line under each org name ("The room brings the topic" / "The topic is set in advance") — founder-approved UI copy with no backing schema column named anywhere in the Solution section. **Open question for `/dev`:** confirm where this text lives (hardcoded per-slug constant vs. a new column) before shipping — untested because unimplemented.
- ❌ Full event-creation form submission from the org page through to a saved `org_id` — the org-context link is tested; the form itself is existing `/events/new` surface, out of this spec's blast radius
- ❌ Exact copy for D6's empty-state headings — not specified verbatim in the spec; structural assertions only, with a TODO to tighten

**Test Pyramid:**
```
       /\
      /  \    2 E2E files (org-scoped-events, org-directory) — ~15 tests
     /____\
    / 1 A11Y \  1 file — 3 tests
   /__________\
  / 1 INTEGRATION \  MANDATORY (P270) — 8 tests
 /__________________\
/ 1 UNIT (targeted)   \  addition to existing events-service-real.test.ts
```

**Files generated:**
- `e2e/integration/p1060-events-org-migration.spec.ts` (new)
- `e2e/p1060-org-scoped-events.spec.ts` (new)
- `e2e/p1060-org-directory.spec.ts` (new)
- `e2e/a11y/p1060-accessibility.spec.ts` (new)
- `e2e/helpers/test-organization.ts` (updated — `blurb: null` support)
- `e2e/helpers/test-event.ts` (updated — `orgId` support)
- `e2e/helpers/prod-health.ts` (updated — `/org` added to `PROD_HEALTH_ROUTES`)
- `src/tests/events-service-real.test.ts` (updated — org-filter call-shape tests, TODO-flagged for `/dev` to tighten against the real query-builder shape)
- `features/uat/p1060.md` (new — 8 scenario groups covering every Done-When bullet)

## Verification Contract

**Pinned to main.** The gate reads this section from `main`, never from the branch it is judging —
otherwise a loop can delete the row it is about to fail. Adding a heading inside this section breaks
the digest; put new prose above it, and keep every sub-heading at `###`.

**16 Done-When lines plus 2 UI-Contract bindings and one regression baseline, grouped into 11 rows:
7 MECHANICAL, 2 COMPARABLE, 2 HUMAN-ONLY.** HUMAN-ONLY is 18% — under goalify's 25% refusal bar.
These are the gate's own figures, read off `./scripts/goal-gate.sh p1060 --tier ci`, not a hand
count: the threshold is mechanized precisely because an agent grading its own spec can round it.

**Two Done-When lines were satisfied before the pin and are not loop work.** DW-3 (*"the · Online
blurb is supplied by the founder and recorded in this spec"*) was written before D7 and is
**answered by D7: seed it NULL, render nothing where it would go.** It survives here only as the
negative assertion in row M1 — no placeholder string reaches the migration or the UI. DW-6 (*"the
visual reference is founder-approved and its four open items are resolved, before the contract is
pinned"*) is **satisfied at pin time**: `## UX Design` records the founder approval of 2026-08-28 and
the sign-off on all four open items. Row M1 re-asserts that the artifact URL is still the one
recorded, because a republished reference silently changes what the blind reviewer judges against.

The gate additionally requires a UAT scorecard at `features/uat/p1060.md` with every row carrying a
result (CHECK 4) and `assumptions.md` + `feedback.md` present with both axes (CHECK 6). Those are
the loop's to produce; they are not contract rows.

| line | class | decided by | artifact |
|---|---|---|---|
| M1 — source contract. DW-2 the backfill enumerates the 8 named slugs literally, asserts it touched exactly 8 rows, and contains no location substring match. DW-3/D7 the · Online seed writes a NULL blurb and no placeholder string. DW-13 the avatar row reuses the social-proof pattern including the +N badge's z-10, rather than a fresh implementation. DW-16 the migration comment states events RLS is unchanged. Both differentiator lines render verbatim, /org is a registered route, and the approved reference URL in this spec is unchanged | MECHANICAL | `npx vitest run src/tests/p1060-source-contract.test.ts` | src/tests/p1060-source-contract.test.ts |
| M2 — the query half of DW-5. Passing an org id produces exactly one .eq on org_id; omitting it produces none, so the standalone /events list stays unfiltered | MECHANICAL | `npx vitest run src/tests/events-service-real.test.ts` | src/tests/events-service-real.test.ts |
| M3 — the whole unit suite stays green. The regression baseline for every row above and below | MECHANICAL | `npx vitest run` | package.json |
| M4 — DW-1 events.org_id exists, is nullable, FK-enforced and indexed. DW-2 the 8 Chiang Mai slugs carry the cm org and the 2 Ko Phangan slugs stay NULL. DW-4 · Online exists at /org/online, public, has_events, blurb NULL, with an organizer membership row. DW-16 an org-scoped event stays world-readable to anon | MECHANICAL | `npx playwright test e2e/integration/p1060-events-org-migration.spec.ts` | e2e/integration/p1060-events-org-migration.spec.ts |
| M5 — DW-5 cross-org isolation in both directions. DW-9 the org-page Host Event link carries org context forward. DW-10 the host-CTA matrix in all three states, including the ALLOWED path on standalone /events that gate 7c exists to protect. DW-11 both empty-Upcoming fall-throughs. DW-12 the participant count from distinct RSVP profiles. DW-14 a zero-participant org renders no row and no 0. DW-15 the payload carries no PII beyond name, slug and avatar | MECHANICAL | `npx playwright test e2e/p1060-org-scoped-events.spec.ts` | e2e/p1060-org-scoped-events.spec.ts |
| M6 — DW-7 /org lists every public organization and no private one, links to each, is readable signed out, omits the blurb line entirely for a NULL blurb, carries no create-organization affordance signed in or out, and does not overflow horizontally at 320px. DW-8 /org is registered in PROD_HEALTH_ROUTES | MECHANICAL | `npx playwright test e2e/p1060-org-directory.spec.ts` | e2e/p1060-org-directory.spec.ts |
| M7 — directory cards are keyboard reachable and activate on Enter, the member-count control is a real button rather than a styled span, and every person avatar carries an accessible name or is correctly decorative | MECHANICAL | `npx playwright test e2e/a11y/p1060-accessibility.spec.ts` | e2e/a11y/p1060-accessibility.spec.ts |
| UI-1 — /org matches the approved reference at 320px, 375px and desktop: card structure and density, the two counts, the avatar row, a NULL blurb rendering as absence rather than placeholder, the differentiator line under each name, and the signed-in membership badge as the only signed-in delta | COMPARABLE | blind-reviewer | features/verification/p1060/review-round-*.md |
| UI-2 — the org Events tab reads as the same product in every state the reference draws: /org/cm with Upcoming empty falling through to a labelled Past, /org/online with nothing at all, and the org header's participant row with its +N badge legible rather than obscured by the last avatar | COMPARABLE | blind-reviewer | features/verification/p1060/review-round-*.md |
| HUM-1 — the one honest line an organization with neither upcoming nor past events shows is the right sentence to put in front of an invited stranger who may not host | HUMAN-ONLY | founder | — |
| HUM-2 — an organizer completes the real /events/new form from an org page and the saved row carries that organization, end to end. The link half is M5; the form itself is existing surface outside this spec's blast radius | HUMAN-ONLY | founder | — |

### The blind reviewer

**It must not be the agent that built the thing.** That is the one durable constraint here, and the
only property the repo's evidence supports: P1083 ran four review rounds, every defect was found by
a reviewer given renders and nothing else, and every rejected version had already passed its own
implementer's review.

**Given:** the named reference — the founder-approved artifact linked under `## UX Design`, frozen
at pin time — and renders of `/org` at **320px, 375px and desktop** signed out and signed in as a
member of · Chiang Mai, plus `/org/cm` Events with Upcoming empty and `/org/online` Events with
nothing at all. The reference is authoritative for structure, density and placement, and explicitly
**not** for copy.

**Forbidden:** the diff, this spec, the rationale, this contract, and any statement of what the
build was trying to do.

**Writes** `features/verification/p1060/review-round-N.md` itself: `VERDICT: PASS|FAIL`, then one
`SCREENSHOT: <sha256>  <path>` line per image judged. The gate re-hashes every image and never
trusts a hash it is handed. Hashing binds the verdict to the pixels judged; it cannot establish who
authored the verdict — the defence against that is independence, not arithmetic.

**Screenshots must reach the real states.** `/org/online` at day one has zero events and zero
participants, and `/org/cm` needs at least one past and zero upcoming to show the fall-through;
seed those rather than mocking them. The signed-in render needs a real membership — `getTestAuthContext()`
in `e2e/helpers/auth-context.ts` mints a real user JWT. A component fed mock props certifies a
screen the user never sees. `resize_window` can silently no-op below some minimum width, so confirm
`window.innerWidth` before trusting any 320px render (`.claude/rules/browser.md`).

### Evidence

| file | holds |
|---|---|
| `contract.sha256` | the pin |
| `review-round-N.md` | the verdict and the image hashes |
| `assumptions.md` | every call the loop made alone. There is no escalation clause — the agent decides, logs, continues |
| `feedback.md` | **two numbers**: corrections given, and turns consumed. Quality bought with runaway spend reads as success on a one-axis scoreboard |

### Red-first (run 2026-08-28, before the loop existed)

| command | result | strength |
|---|---|---|
| `npx vitest run` | **exit 1** — 288 files passed, **1 failed**: the P1060 org-filter case in `events-service-real.test.ts`. Nothing else in the suite is red | **real red, and diagnostic.** The baseline is red for exactly the reason this spec exists, and green means the org filter landed without breaking 3267 other tests |
| `npx vitest run src/tests/events-service-real.test.ts` | **exit 1** — `TypeError: Cannot read properties of undefined (reading 'map')` at `events-service-real.ts:158` | **weak red.** It fails because the mock's query builder never resolves the `.eq` the service does not make, not because an assertion about org filtering fired. `grep -c org_id src/app/data/events-service-real.ts` is **0** — the behaviour genuinely does not exist. The loop's first job on this row is to tighten the test against the real builder shape so it fails for its own reason |
| `npx vitest run src/tests/p1060-source-contract.test.ts` | **exit 1** — no test files found | **unproven-by-absence.** This proves only that the command fails when its file is missing, never that any assertion binds. Do not count it as evidence |
| the four `npx playwright test e2e/…p1060…` rows | **not run to completion** — `--list` parses all four files and enumerates 8 directory tests, so the specs are syntactically live, but no saved auth state exists locally (`.private/test-auth/local.json` absent) and the DB-backed rows need a seeded fixture org and event | **unproven.** Flagged rather than counted |

**Stated plainly: five of the seven MECHANICAL rows are unproven or weakly proven at pin time.** A
check nobody has watched fail for the right reason is not a check, and saying so here is cheaper
than discovering it at the merge boundary.

**One row is green at pin time and must not be mistaken for evidence.** `/org` is already present in
`PROD_HEALTH_ROUTES` (`e2e/helpers/prod-health.ts:30`) — added by `/generate-tests`, uncommitted on
the main checkout at pin time and carried into the worktree. Its assertion in M6 therefore passes on
arrival and has never been seen to fail. It is retained because the standing rule it enforces
([decisions.md](../docs/decisions.md) 2026-06-06) has nothing else enforcing it, not because this run
proved it.

**No `it.fails` markers are pre-authorised for this spec.** P1114 committed red tests under that
convention to keep `npm test` green while its build was outstanding; the cost was rows that exited 0
over assertions nobody had satisfied. The loop works in a worktree, so there is no green-suite
pressure on `main` to relieve — a `p1060-*` test that is committed must be committed passing.


## References

Origin: session 2026-08-13 while scoping [p1055](p1055_norm_measurement_instrument.md) — the founder's question *"show me all points that members or guests of a given Clarity organization engaged with"* has no path in the schema. Widened 2026-08-19 from a founder screenshot review of `/org/cm`; sibling fixes in [p1110](p1110_org_invite_landing_and_cta_competition.md). Finalized 2026-08-28 via `/grill-me` — eight decisions recorded, item 5 split to [p1183](p1183_membership_levels_and_gated_events.md), `/org` directory added. `/org` deferral being closed: [decisions.md](../docs/decisions.md) 2026-07-23 [product]. New-public-route health-coverage rule: [decisions.md](../docs/decisions.md) 2026-06-06. Ladder + naming context: [goals.md](../docs/goals.md), [lean-canvas.md](../docs/lean-canvas.md) §Revenue.
