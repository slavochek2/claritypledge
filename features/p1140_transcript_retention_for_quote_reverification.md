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

- [x] A transcript fetched by `/points-prepare` is still readable, byte-identical, in a later
      session — `yt`'s store makes a HIT return the stored bytes byte-identical to the original
      fetch, offline, with the stub never re-invoked. Verified against a stubbed `yt-dlp`.
- [x] ~~The retained artifact is keyed such that two different caption tracks of the same video ID
      do not collide (the 2026-08-17 vs 2026-08-21 case resolves to two distinct entries)~~
      **Rewritten, 2026-08-21 (adversarial review) — this item described the wrong outcome.** The
      founder chose never-fetch-twice, under which the 08-21 run would have *reused* the 08-17
      bytes: the divergence is *prevented*, not recorded as two entries. Replaced with: **two
      different caption tracks of the same video are retained as distinct, type-labelled files and
      never overwrite each other.** Satisfied by construction: every store write is content-hash-
      gated (identical bytes → no-op, differing bytes → a numbered sibling, e.g. `en.2.vtt`),
      verified live — original file unchanged after `YT_STORE=refresh` with altered content, `cmp`
      clean against a pre-copy, sibling created, both recorded in `fetches.jsonl`.
- [x] A points run records which retained artifact its quotes were verified against, resolvable
      later without a network fetch — `points-prepare.md` now writes
      `source | track | raw_sha256 | clean_sha256 | vtt-clean version` per source to
      `.points-run-seals/<slug>.transcripts.sha256` (hashes only, safe for the public repo); the
      store's own `fetches.jsonl` independently records key, files, exit code, route per fetch.
- [x] No transcript content appears in any git-tracked path — verified by a grep of the tracked
      tree, not by inspection — `git ls-files | xargs grep -l WEBVTT` returns empty in **both** cp
      and pp (the tool now lives in pp; the store lives outside either repo, under
      `~/.local/share/yt-store/`).
- [x] The staleness policy is stated in the skill, and its failure path has been exercised: a
      deliberately stale entry produces the intended non-silent outcome, with the observed result
      pasted — policy: never auto-refresh; `YT_STORE=refresh` is the only way to see upstream
      changes, and it never overwrites, so a divergence becomes a visible sibling+diff rather than
      a silent replacement. Exercised: original `en.vtt` hash before/after refresh identical;
      `en.2.vtt` sibling created holding the new bytes; `fetches.jsonl` carries both fetches.
- [x] The consumer list is enumerated with an explicit include/exclude decision recorded per skill
      — see **Consumers** below (moved from the working plan into this spec so the record
      survives past the plan file).
- [x] `/points-prepare` line 49 no longer instructs discarding intermediates, or states the
      retention path instead — that instruction now lives at Stage 1 (the file moved lines during
      earlier edits) and points at the store + `vtt-clean` instead of the scratchpad.

## Consumers (enumerated 2026-08-21, verified by command against `yt`, `yt-dlp`, `yt-dlp-resilient`, `YT_DLP`, `youtube.com/watch`, `youtu.be`)

| Consumer | Decision | Why |
|---|---|---|
| cp `/points-prepare` | **include** | Sole cp fetcher; benefits via `yt`'s store |
| cp `/points-publish` | no change | Reads what prepare produced; never fetches |
| readfirst `server.mjs` | **include** | Already calls `yt`; zero edits needed |
| `video-publish` | exclude | Uploads, never fetches |
| `video-edit-interview`, `gen-thumbnail`, `analyze-demo-meeting`, `analyze-transcripts`, `create-letter-from-transcript`, `align-decompose`, `align-create-letter`, `align-detect` | **exclude** | Zero YouTube-fetch matches — local recordings and private participant speech. No shared store, no leak surface. |

## Implementation notes (2026-08-21)

Built: `pp/scripts/{yt,yt-store-lib.py,vtt-clean}`, symlinked to `~/.local/bin/{yt,vtt-clean}`
(`yt-dlp-resilient` resolves through `yt` as a 2-hop symlink). Full design:
`pp/docs/infra/youtube.md`. 33/33 automated checks passed against a stubbed `yt-dlp` (PATH
shadowing) covering miss→store, offline hit with exact exit-code replay (including a non-zero
partial-fetch exit code), differing-key miss, `YT_STORE=refresh` immutability, 5 id-gate defect
regressions (playlist-without-`--no-playlist`, truncated id, non-YouTube host, `ytsearch`, an id
starting with `-`), 5 general pass-through cases, and an offline `vtt-clean` + `grep -F`
re-verification against the stored raw track.

**Two residual gaps, stated rather than hidden:**
- Whether yt-dlp can make a genuine human track and an auto track collide on the identical
  `<lang>.vtt` filename when both are requested together was **not tested live** (would need a
  real network fetch against a video with both tracks sharing a lang code). The content-hash-gated
  write closes the *safety* gap regardless (a collision becomes a sibling, never an overwrite) but
  `fetches.jsonl` records `human_requested`/`auto_requested` booleans rather than a confident
  per-file label in that case.
- The two real consumers (`/points-prepare`, readfirst) were verified structurally (their exact
  invocation shapes pass the classifier's cacheable gate; stdout/stderr separation is preserved on
  a metadata hit) but **not** re-run live end-to-end against real YouTube — that would consume real
  proxy quota. Flagged per epistemic gate 5 rather than claimed as confirmed.

**Two follow-ups the plan flagged for the founder, resolved same session:**
- **`proxy` moved into pp too** (`pp/scripts/proxy`, symlinked to `~/.local/bin/proxy`) — it shared
  `yt`'s exact untracked-single-file exposure. Unmodified move, no functional change.
- **Comment retention:** comments now cache in the same store as captions (content-hash-gated,
  `<id>/info.json`, keyed by id + `--extractor-args`), accepting the same staleness risk already
  accepted for captions rather than building a second policy. `points-prepare.md`'s comment-fetch
  command corrected to a complete, runnable invocation (`--write-info-json` was missing — without
  it `--write-comments --skip-download` writes nothing to disk at all).
