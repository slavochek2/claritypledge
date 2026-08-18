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

# P1104: Mark the two agent accounts as non-human, on three surfaces

**Blocking** `features/p1096_public_multisource_point_pipeline.md`. Deliberately the smallest thing that delivers the guarantee P1096 depends on.

## Problem

**Situation:** The point pipeline files a position held by an **agent** carrying one speaker's quoted argument. The design's entire safety rests on one sentence — the position is *the agent's reading of that speaker's argument*, never the speaker's own.

**Complication:** That sentence exists in a spec and a skill and **nowhere in the product** (`grep -rn "reading of that speaker" src/` → 0 hits, verified 2026-08-18). The position-holder row (`src/app/pages/point-detail-page.tsx:775-790`) renders a `GravatarAvatar` with `isPledger`, a truncating `{holder.userName}`, an `EarBadge` reputation count and a `PositionBadge`. No role, no subtitle, no caption slot. An agent carrying a named public figure's argument would render as a name, a face, a pledge ring and a reputation score at "+2 agree" on a claim that person never made.

**Question:** What is the smallest change that makes an agent unmistakably non-human wherever it can currently appear — **without** introducing a mechanism whose failure mode is to render agents as people?

## Appetite

**Small and bounded, by construction.** Two known accounts, three surfaces. **Reversible** — delete a constant and three render branches.

**Decision density: two founder decisions** (below), both about what an agent may do rather than how it looks.

## Solution

**A hardcoded allowlist of the two agent account ids, in application code. Not a database column.**

Three surfaces, and they are the complete set for the pipeline's own output:

1. **The position-holder row** (`point-detail-page.tsx:775-790`) — show the marker; suppress the pledger ring and the `EarBadge`.
2. **The share-card function** (`api/og.ts` ~L99-110) — it already selects a profile name and emits *"Shared by {creatorName} — take a position on ClarityPledge."* This, not the in-app `<SEO>` tag at `point-detail-page.tsx:500`, is what any crawler sees: `vercel.json:129` rewrites `/point/:id` to `/api/og?path=/point/:id` for crawler user-agents, and crawlers never execute the SPA.
3. **The accessible name** (`point-detail-page.tsx:797`, `aria-label={...Expand story by ${holder.userName}}`) — a visual-only marker leaves screen-reader users with a bare human name.

### Why an allowlist rather than a profile flag — this is the load-bearing decision

**A column fails open, and this repo has already made that mistake.** `supabase/migrations/20260602160000_p877*.sql` restricts anon/authenticated reads to an explicit grant list; that list carries `is_verified`, `is_test_account`, `is_certifier`. **`is_admin`, added later by `20260605150000_p878_search_profiles_rpc.sql:39`, is absent from it.** A new `is_agent` that misses the same list returns `undefined` → falsy → **renders as a human**. The default failure state of a column-based design *is* the harm this spec exists to prevent.

A constant in application code cannot return `undefined`. **It fails closed**, and that is the whole argument. At n=2 it is also simply correct — nothing about two known accounts needs a schema.

**What the column version would additionally cost, enumerated so the trade is visible rather than assumed:** the grant list; a write-path guard (`20260605120000_p880_trust_column_guard.sql` exists precisely because users could self-set `is_verified`/`has_pledged` — an unguarded `is_agent` lets an agent un-flag itself); and every SECURITY DEFINER accessor that builds JSONB from an explicit key list — 11 migration files emit a `'name'` key, each an independent omission site that fails open.

### Naming

An agent is named for **the argument it holds** — never a person, never the source container (a source usually holds several arguments). Provisional: *"Agent · the case for X"*.

> **Constraint discovered in review:** `GravatarAvatar` renders initials from the name at `!w-5 !h-5 !text-[10px]`. A name of that shape yields meaningless initials at the smallest rendering — the exact condition Done-When #1 tests. The marker must therefore not depend on the avatar carrying meaning.

## Risks / Non-Goals

### Risks

- **The allowlist does not scale and must not be allowed to quietly try.** **MITIGATE:** when a third agent account is needed, that is the trigger to build the durable version — with the grant list, the write guard and the 11 accessors done deliberately. Written into the successor spec, not left to memory.
- **Marking the row does not unmark the number.** An agent's position increments the same tally the room actually reads. The marker addresses the row and not the aggregate. **FOUNDER DECISION** (below) — currently unresolved, and it may be the more important half.
- **Surfaces beyond the pipeline's own output remain unmarked.** `GravatarAvatar` appears in ~30 non-test files; ~11 tables store a `*_name` string with no foreign key to `profiles`, so no profile-level mechanism could reach them anyway; two edge functions (`send-letter-emails`, `send-letter-response-signin`) render names into email, where no marker survives. **ACCEPT, scoped:** these are out of reach of the pipeline's output because agents will not appear there. **If that changes, this spec no longer covers the case** — that is the tripwire, and it is why the successor exists.
- **An agent account is still a real profile** with a slug and a page. **See founder decision 1.**

### Non-Goals

- **Do NOT add an `is_agent` column, touch the grant list, or write a trust-column guard.** That is the successor spec, triggered by agent #3.
- **Do NOT build agent capabilities, autonomy, registries, or agent-to-agent anything.**
- **Do NOT let an agent hold a pledge, an oath, or a reputation count.**
- **Do NOT name an agent after a person.**
- **Do NOT ship P1096's filing step before this.**
- **Do NOT retrofit the ~30 avatar sites.** Out of scope by the reasoning above; revisit only when an agent can appear there.

### Alternatives Considered

- **A durable profile flag.** Rejected for now on failure mode, not on effort: it fails open, and the identical omission has already happened once in this repo with `is_admin`.
- **Naming convention alone** (an `agent_` prefix). Rejected as the sole mechanism — it truncates, carries no signal in an avatar or a share card, and is unenforced.
- **Skip agents entirely for the first event.** Coherent — a point is first-class and needs no story — but it leaves the room a bare claim with no grounding, the defect that made P1074's anti-point unevaluable. A story linked to a point with **no** position is worse still: a story exists to evidence a position, so an unpositioned one is an orphan.
- **`features/p1052_agent_persistent_identity_via_staked_positions.md`** (2026-08-11) asks whether an agent can hold identity at all. This spec does not answer it — it marks two accounts and deliberately decides nothing about agent identity in general. Cited so the two are not conflated.

## Open Questions for /architect

1. **Does an agent get a profile page?** `[FOUNDER DECISION]` — a page invites reading it as a member; no page breaks the existing byline link pattern.
2. **Do agent positions count in the aggregate tally?** `[FOUNDER DECISION]` — excluding them keeps the number a human signal but makes the two poles invisible in it; including them means the number the room reads is part machine.

## Done-When

- [ ] Both agent accounts render the marker on the position row, with no pledger ring and no ear count — verified by screenshot at the smallest rendering and with a name long enough to truncate
- [ ] `curl` of the share-card function for a point carrying an agent position returns a description that does not present the position as a person's — output pasted
- [ ] The accessible name for an agent row does not read as a bare human name — verified by reading the rendered `aria-label`
- [ ] `grep` of the agent-id constant returns exactly the surfaces listed above, and no others — output pasted
- [ ] No agent's display name contains a real person's name — checkable here because both names are chosen by us; **not** generalizable (`.claude/rules/pii.md` records that automated name detection was rejected against a measured false-positive baseline)
- [ ] Founder decisions 1 and 2 answered and recorded in this spec

### What the marker must convey — not just THAT it is an agent

Knowing a row is non-human does not tell a reader what its position *means*. The semantic that has to land is:

> **Given the argument in this source, this is the position that argument commits someone to.**

Not what the quoted person believes. Not what they would answer. What the *argument* commits to. That is a stronger requirement than "looks like a machine", and it probably means the **source must be visible on the row itself**, not only inside the linked story — a reader who sees a marker but no source knows only that a machine has an opinion, which is worse than useless.

**Corollary for the private case, recorded because it inverts the intuition:** when the quoted person *is* the reader — a two-person conversation where both parties see the artifact — this is **safer** than the public case, not riskier. They can object. The P1074 letter failed on three counts: it was written in first person, it was invented rather than quoted, and it was attributed to its subject. Quotes plus a marked agent removes all three. A public figure who never sees the page cannot object, and that missing correction path is the harder case.

## Acceptance Criteria

- [ ] Someone who has not read this spec, shown the point page cold, says the agent row is not a person
- [ ] The same person, asked what the agent's position means, says something equivalent to "that's what the argument in that source implies" — **not** "that's what the speaker thinks"
