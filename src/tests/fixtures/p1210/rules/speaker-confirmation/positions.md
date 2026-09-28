<!-- MUST-FAIL FIXTURE for P1210 P1358 (speaker-confirmation) — GENERATED, do not hand-edit. -->
<!-- Derived from .claude/commands/slava/disagreement/positions.md: each rule's own sentence, verbatim, EXCEPT the one named below, -->
<!-- which is deleted so the predicate is watched to REJECT (epistemic.md gate 7). -->
<!-- one rule sentence has been deleted; see STRIP in scripts/points/build-rule-fixtures.mjs -->

### Step 4b — Per-quote speaker confirmation (every multi-speaker source, diarized included)

**On a diarized source, strip the speaker labels before handing the turns over** — replace `spk:0` /

**Only turns from a window that PASSED Step 2c may be used** (`select.md` Step 2c, judged per

Skip entirely for `single-speaker` and `speaker-labelled` sources. For every quote from a `turn-verified` source, do this **per quote** and record the result.
