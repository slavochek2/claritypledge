---
status: backlog
type: comment
rank: 230
workstream: infrastructure
created_date: '2026-08-21'
tags: [idea-feed, dead-code, founder-decision, rls]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1146: Decide the idea-feed feature's fate — remove or park

## Problem

**Situation:** The idea-feed feature (`clarity_feed_ideas`, `clarity_idea_comments`,
`clarity_idea_votes`, `clarity_idea_vote_history` — four tables, ~500 lines of
`src/app/data/api.ts`, three realtime subscriptions) has no UI route. Every exported
idea-feed function (`createFeedIdea`, `voteOnIdea`, `addIdeaComment`,
`elevateCommentToIdea`, `getFeedIdeas`, `getIdeaComments`, `getIdeaVoters`,
`getVoteHistory`, `subscribeToFeed`) has zero callers anywhere in the repo, confirmed
by whole-repo grep during both P1138 and P1139. `/feed` in `App.tsx` serves P491's
unrelated hashtag feed. Prod holds 1 idea + 1 vote total. One idea-feed function also
carries a latent bug found during P1139: it issues an `UPDATE` against a policy an
earlier migration already dropped, and doesn't check the error, so it fails silently.
Unreachable today (zero callers) — dormant if parked, moot if removed. Not worth its
own P-number while the feature's fate is undecided; folded in here.

**Complication:** This table family has now produced two separate security bugs from
the same root cause — permissive RLS written at creation and never revisited because
nobody was maintaining the feature. P1138 found the UPDATE-side exposure; P1139
(2026-08-21) found the INSERT-side exposure on the same four tables. Both fixes were
policy patches, not a decision about whether the feature should exist. Patching a dead
feature's RLS a third time is the likely next incident if the actual question — remove
or park — never gets answered.

**Question:** Should the idea-feed feature be removed entirely (drop the four tables
and the ~500 lines of dead code), or deliberately parked (kept as inert schema +
code, with the security question closed but the maintenance question open)?

## Appetite

Low blast radius if removed — zero callers means no client-facing regression is
possible. Medium reversibility if removed (tables + code are recoverable from git
history and a migration rollback, but a `DROP TABLE` migration on prod is a real
data-loss step, even against near-empty tables). Low decision density — this is a
single binary founder decision, not an open design space.

## Approach

Not a build task yet. This spec exists to force the decision and record it. Once
decided:
- **Remove:** file a follow-up `task` spec — drop the four tables via migration,
  delete the dead functions from `api.ts`, remove the three realtime subscriptions,
  remove any now-orphaned types.
- **Park:** no further spec needed — record the decision in `docs/decisions.md` with
  the rationale, so the next agent who finds this table family via RLS drift-check
  or a security sweep doesn't re-litigate it.

**`[FOUNDER DECISION: remove the idea-feed feature entirely, or keep it parked as
dead code with the security question now closed by P1138+P1139?]`**

## Risks / Non-Goals

### Risks
- Removing live tables on prod, even near-empty ones, is a `DROP TABLE` — ACCEPT: no
  rollback path once run, but data volume is 1 idea + 1 vote, and both fixes (P1138,
  P1139) already independently proved zero legitimate write paths exist.
- Parking without recording the decision anywhere durable just re-creates the
  original problem (permissive-by-default schema nobody owns). MITIGATE: whichever
  way this resolves, the decision and its rationale go in `docs/decisions.md`, not
  only in this spec.

### Non-Goals
- Do NOT implement removal or any code change as part of resolving this spec —
  this spec's Done-When is the decision being made and recorded, not executed.
- Do NOT re-litigate P1138 or P1139's security fixes — both are already applied
  (test) or in flight; this spec is scoped to the feature's existence, not its RLS.
- Do NOT expand scope to `/feed`'s hashtag feature (P491) — unrelated, unaffected
  either way.

## Done-When

- [ ] Founder has answered: remove or park
- [ ] Decision + rationale recorded in `docs/decisions.md`
- [ ] If "remove": a follow-up `task` spec is filed with a P-number, referencing this
      spec
- [ ] If "park": this spec is closed with no follow-up spec required
