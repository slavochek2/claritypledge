---
status: week
type: task
rank: 58
workstream: events
created_date: '2026-08-21'
tags: [points, transcripts, provenance, youtube]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1140: Retain fetched transcripts so published quotes stay re-verifiable

Child concern of [P1096](p1096_public_multisource_point_pipeline.md). That spec makes quote
verification the non-negotiable gate; this one makes the artifact that gate runs against survive
the session.

## Problem

**Situation:** `/slava:content:points-prepare` fetches YouTube captions with `yt-dlp`, cleans them,
and greps every quote against the cleaned text. Its own instruction is explicit —
`points-prepare.md:49`: *"Write intermediates to the session scratchpad, never to the repo."*
Nothing survives the session.

**Complication:** `/slava:content:points-publish` files those quotes verbatim, attributed to named
real people, under machine agent accounts. Its preconditions require the per-quote `grep -F` exit
codes "against the cleaned transcript" plus an audio-at-timecode check. **Once the session ends the
cleaned transcript no longer exists, so that evidence references an artifact nobody can produce
again.** Measured on 2026-08-21: the run re-fetched the same two video IDs the 2026-08-17 run had
already fetched, and got *different transcripts of the same videos* — 30,745/46,645 chars against
the earlier 31,539/48,943, because the later run selected an `en-GB` human-authored caption track
over the auto track for one source. The 2026-08-17 run's six points therefore cite quotes against
an artifact that cannot be reproduced or re-checked. Compounding it, `points-prepare` records that
caption fetching "works only from a residential connection"
(`pp/docs/infra/youtube.md`) — a future session on a different network cannot re-verify a published
quote at all.

**Question:** Where should fetched transcripts live, and keyed how, so that a quote published today
can be re-verified against the exact bytes it was checked against?

**Prior art in-repo:** `video-edit-interview/SKILL.md:12` exists partly because "the transcript was
lost + re-transcribed twice" (session 29932534). Its fix was pipeline-local — copy to
`~/video-library/$SLUG/transcript.srt`. The points chain does not share it. Two independent
pipelines hitting the same failure is the signal that retention belongs somewhere shared rather
than being solved a third time.

## Appetite

**Blast radius:** medium — read by the points chain and potentially several other transcript
consumers, but adds no runtime surface to the product itself. A bad cache silently serving the
wrong transcript would corrupt quote verification, which is the one thing this pipeline must not
get wrong.

**Reversibility:** high — a cache is additive. Deleting the store returns every skill to
fetch-every-time behaviour. No migration, no schema, no prod dependency.

**Decision density:** medium. Storage location is constrained (below). The cache key and the
invalidation policy are genuinely open and are the substance of the work.

## Approach

Retain the fetched artifact under a content-addressed key, and record alongside each published run
which exact artifact its quotes were checked against.

**Hard constraint — this repo is public (AGPL-3.0).** Third-party video transcripts must NOT land
in tracked paths. Store under `.private/` (gitignored) or outside the repo entirely, and track only
hashes — mirroring the `.points-run-seals/<slug>.sha256` pattern established at `a98d0449`, where
the private artifact stays private and a publishable hash carries the timestamp.

Design questions to resolve during the work, deliberately not answered here:

1. **Cache key.** Video ID alone is insufficient and this is proven, not hypothetical: the same ID
   yielded two different transcripts four days apart because the *track* differed (`en` vs `en-GB`
   vs auto). The key plausibly needs id + track + cleaner version, since a change to the cleaning
   script also changes what `grep -F` runs against.
2. **What to retain.** Quote verification greps the cleaned/normalized form; provenance argues for
   the raw VTT. Retaining both costs little and answers different questions — but state the choice
   rather than defaulting.
3. **Consumers.** Enumerate before designing. `grep -rl` currently finds transcript handling in:
   `points-prepare`, `points-publish`, `create-letter-from-transcript`, `align-decompose`,
   `align-create-letter`, `align-detect`, `analyze-demo-meeting`, `analyze-transcripts`,
   `video-edit-interview`, `video-publish`, `gen-thumbnail`. **Do not assume all should share one
   store** — session transcripts (private participant speech) and public-video captions have
   different sensitivity and different retention answers. Read each before including it.
4. **Staleness.** YouTube caption tracks change under a fixed ID; view and comment counts already
   moved between the two runs. A cache that silently serves a stale transcript for a video whose
   captions were later corrected is a *new* failure mode that fetch-every-time does not have. The
   re-fetch and invalidation policy must be stated explicitly, not left implicit.

## Risks / Non-Goals

### Risks

- **A stale cache hit silently corrupts verification.** If captions are corrected upstream and the
  cache serves the old copy, `grep -F` passes against text the source no longer contains — a
  verification that reports success while being wrong. *Mitigation:* make the retained artifact
  content-addressed and record the fetch date per entry; require an explicit staleness decision
  (re-fetch, or knowingly pin) rather than a silent hit. Any freshness check must be exercised in
  its failing direction before it is trusted (`.claude/rules/epistemic.md` gate 7).
- **Sensitive material entering a shared store.** Session transcripts contain real participant
  speech. Pooling them with public-video captions in one location invites a later leak into a
  tracked path. *Mitigation:* the consumer enumeration above decides inclusion per-skill; default
  is exclude.
- **Cache growth unbounded.** *Mitigation:* state a retention window or size ceiling; if the work
  bounds it, `log` what gets evicted rather than dropping silently.

### Non-Goals

- Do NOT store transcripts in any git-tracked path. Hashes only, `.private/` or outside the repo
  for content.
- Do NOT build a cross-run index or query layer over `.private/points-runs/` — that is the
  persistent decision store frozen by `docs/decisions.md` 2026-07-14 [product].
- Do NOT change any quote-verification rule in `points-prepare` or `points-publish`. This spec
  makes the existing checks auditable after the fact; it does not relax or replace them.
- Do NOT fold session/meeting transcripts into the store without reading each consuming skill
  first.
- Do NOT add speaker diarization or local Whisper. P1096 decided 2026-08-19 to solve attribution by
  source selection, not by build; that decision stands and is out of scope here.

### Alternatives Considered

- **Keep fetch-every-time (do nothing).** Zero build, and it is genuinely the status quo's one
  merit: never stale. Rejected because it makes published quote-verification evidence
  unreproducible, and because caption fetching is network-position-dependent — the re-fetch may
  simply be unavailable when re-verification is needed.
- **Reuse `~/video-library/<slug>/`** (the interview pipeline's existing convention). Attractive
  because it already exists; rejected as the primary answer because it is keyed by editing-project
  slug rather than by source identity, holds SRTs for videos *being produced* rather than sources
  *being quoted*, and lives outside any provenance-hashing discipline. Worth revisiting as the
  storage root once the key is chosen.
- **Commit transcripts to the repo.** Would give free history and timestamps. Rejected outright:
  public repo, third-party content.

### Rollback Strategy

Delete the store directory and revert the skill edits that read it. Every consuming skill returns to
fetching on each run — the current behaviour. No data migration, nothing in the product depends on
it.

## Done-When

- [ ] A transcript fetched by `/points-prepare` is still readable, byte-identical, in a later
      session
- [ ] The retained artifact is keyed such that two different caption tracks of the same video ID do
      not collide (the 2026-08-17 vs 2026-08-21 case resolves to two distinct entries)
- [ ] A points run records which retained artifact its quotes were verified against, resolvable
      later without a network fetch
- [ ] No transcript content appears in any git-tracked path — verified by a grep of the tracked
      tree, not by inspection
- [ ] The staleness policy is stated in the skill, and its failure path has been exercised: a
      deliberately stale entry produces the intended non-silent outcome, with the observed result
      pasted
- [ ] The consumer list is enumerated with an explicit include/exclude decision recorded per skill
- [ ] `/points-prepare` line 49 no longer instructs discarding intermediates, or states the
      retention path instead
