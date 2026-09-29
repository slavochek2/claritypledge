---
status: week
type: bug
rank: 13
workstream: disagreement-pipeline
created_date: '2026-09-29'
tags: [disagreement-pipeline, promote-to-prod, transcripts, agent-avatars]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1370: Disagreement pipeline hardening after the ikigai1 prod promotion

## Problem

**Situation:** On 2026-09-28/29 run `ai-ikigai-2026-09-29` (tag `ikigai1`) was promoted to prod. `/slava:disagreement:promote-to-prod` refused at first, and correctly: no `disagreement:accuracy-check` ledger line was bound to the story bytes. The check was then redone by hand. See [decisions.md](../docs/decisions.md) 2026-09-29 [process].

**Complication:** Five gaps showed up. Each was re-diagnosed by command in this session:

1. **Accuracy evidence is never written by the stage that earns it.** story-draft's checkers passed 21 of 21, but nothing turned those verdicts into the ledger line promote-to-prod reads. Hash recipe, verified: sha256 over the contents sorted by code point and joined with no separator. This reproduces `fc7b8fee…` from the 21 live TEST rows. Row content = draft block + `\n\n#<tag>`.
2. **The transcripts were durable, but their identity was not recorded.** *The premise that they lived only in scratch is false:* `~/.local/share/yt-store` holds raw and clean files for all six sources, and every hash in `.points-run-seals/ai-ikigai-2026-09-29.transcripts.sha256` matches the store today. Tan's clean text is 36,420 bytes. Only the redacted story transcripts (`story/tx/`) were scratch-only. The real gaps:
   - the seal's `track:` field holds the *requested* language (`en`), not the track that was served;
   - there is no character count;
   - the promote-time check fetched from YouTube again instead of reading the sealed store, and YouTube's `en` track for eRrc1pUY5oU had meanwhile become machine-translated.
3. **promote-to-prod contradicts itself.** Stage 2 provisions agents, which writes permanent identities, before the Stage 4 gate. The announce line says "nothing is written until you confirm".
4. **Event dates drift.**
   - `event-date.mjs resolve "next week tuesday"` exits 2 (cannot read) instead of exit 3 with both readings.
   - The TEST event slug says 2026-09-29, but the event is on 2026-10-06 (`check --env test` exits 1).
   - A decisions.md line still says "event #2 (Tue 2026-09-29)".
5. **Agent avatars are JPEG stored as `.png` and served as `image/png`.**
   - Cause: gen-agent-avatar Step 4 runs `sips -Z 512 agent-robot.png --out …png`. `sips` keeps the source format (Gemini returns JPEG) unless it is given `-s format png`. Reproduced with a JPEG named `.png`.
   - On TEST, 7 of 11 real agent avatars are JPEG bytes, including all five ikigai portraits.

> Founder framing, verbatim: "Fix these, most important first."

## Appetite

- **Blast radius:** medium. It covers every future disagreement run's path to prod. It touches no `src/`.
- **Reversibility:** git revert.
- **Decision density:** low. The founder approved all five fixes. Re-encoding existing avatars is a separate prod-data decision.

## Invariants

- **The checker is not the writer.** An accuracy line is written only from verdicts by a model that did not write the story. The tool refuses when `checked_by` names a writer model.
- **The hash is computed from the rows actually written** (read back from the target), never from a local payload.
- **Re-verification never re-fetches.** A transcript is identified by its sealed hashes. A hash, char-count or track mismatch refuses; it is never "corrected".
- **The promote-to-prod gate precedes every permanent write**, including agent identities.

## Solution

1. **`scripts/points/accuracy-check.mjs`**, with three commands:
   - `hash` prints `content_sha256` from rows read by anon from the target.
   - `record`:
     - verifies the transcripts seal against the store;
     - matches each row to a `checker: PASS` draft in the run file;
     - runs `grep -F` on every `video_quotes` quote in the sealed clean transcript for that row's video;
     - refuses on any miss or a writer/checker overlap;
     - appends the exact ledger line.
   - `verify` prints MATCH, MISSING or STALE against the latest line.

   publish Stage 6 calls `record`. promote-to-prod Stage 0 calls `verify`.
2. **Seal line** gains `served_track` (the store file whose bytes match `raw_sha256`) and `clean_chars`. The prepare skill prefers `en-orig` when it differs from `en`. Re-verification goes through the tool, which reads the store only.
3. **promote-to-prod reorder:** pre-assign prod profile UUIDs, carry the avatars, build and hash the full envelope, pass the one gate, then provision with those ids (the mint must return exactly them), then write.
4. `resolve` reads "next week X" and "X next week" with both readings (exit 3). Fix the TEST slug and the stale decisions line.
5. gen-agent-avatar converts with `sips -s format png` and asserts PNG magic bytes. provision-agent asserts the magic before upload.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A story edited on TEST after review no longer matches its draft, so `record` refuses | ACCEPT | Correct behaviour: new bytes need a new check (§2) |
| No-separator concatenation is boundary-ambiguous | ACCEPT | Format is what promote-to-prod reads; changing it invalidates existing lines |
| Existing JPEG-as-png avatars on test/prod | DEFER | Browsers sniff image bytes; re-encoding is a prod write → founder decision |

**Non-Goals:** Do NOT change the ledger line format. Do NOT touch `src/`. Do NOT re-encode existing prod avatars. Do NOT rename the run slug (seal files are keyed on it).

## Done-When

- [x] `accuracy-check.mjs hash` reproduces `fc7b8fee…` from the live ikigai1 TEST rows; a one-byte change gives a different hash
- [x] `record` refuses on a mismatched transcript hash, a quote absent from the transcript, a row with no PASS draft, and a checker that shares a writer model (tests)
- [x] `verify` exits 0 / MISSING / STALE correctly (tests)
- [x] publish, promote-to-prod and prepare name the tool and the new seal fields
- [x] promote-to-prod provisions only after the gate, with pre-assigned ids
- [x] `resolve "next week tuesday"` on 2026-09-28 exits 3 listing 29 Sep and 6 Oct
- [x] TEST event slug carries 2026-10-06 and `check --env test` exits 0
- [x] gen-agent-avatar output is PNG by `file -b` for a JPEG input

## Related

- [decisions.md](../docs/decisions.md) 2026-09-29 [process]
- decisions.md 2026-09-?? (line ~13791): `source .env.local` echoed credentials. Do not add that pattern.
- P1140, P1187 (transcript store), P1135 (agent avatars), P1367 (event-date)