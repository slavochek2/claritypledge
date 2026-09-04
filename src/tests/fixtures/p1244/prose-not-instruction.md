# The real 2026-09-03 false positives, kept as a fixture

These three lines are correct prose from the pipeline's own files. Every one of them was
FLAGGED when the verb and phrase lists were widened without the span/object fix. They must
stay CLEAN forever; if any of them starts failing, the widening has regressed.

**Verification:** `grep -F` against the cleaned transcript (exit codes pasted). Timecode
`seconds:` resolved strictly from the RAW `.vtt` file in the yt-store (§0.6).

A whitelist-and-count check is what makes a hash of an opaque SQL string mean anything.

- [ ] **No story ends with a trailing `Source:` line** — same shape as the check above and
      for the same reason: this skill does not author the rule, it only catches a violation.

Prose may also freely discuss the stores: you could run ls somewhere, and the diarize-store
holds the artifacts. None of that is an instruction to this pipeline.
