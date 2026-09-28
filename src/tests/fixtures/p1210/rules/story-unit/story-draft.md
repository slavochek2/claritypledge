<!-- MUST-FAIL FIXTURE for P1210 DW-9 (story-unit) — GENERATED, do not hand-edit. -->
<!-- Derived from .claude/commands/slava/disagreement/story-draft.md: each rule's own sentence, verbatim, EXCEPT the one named below, -->
<!-- which is deleted so the predicate is watched to REJECT (epistemic.md gate 7). -->
<!-- one rule sentence has been deleted; see STRIP in scripts/points/build-rule-fixtures.mjs -->

description: "Draft one story per (person, point) — P1210 §7: a machine account's reading of that person's argument, holding only that speaker's verbatim quotes with the source link in the video_url field. Enforces the P1141 voice rules, the craft rules in docs/story-craft.md, the three-tier accuracy rule, and (author_id, point_id) uniqueness at build time. There is no build-time character ceiling (the 1,500 figure was WITHDRAWN by P1210 §7); `stories.content <= 10000` still binds. Each story is written by an isolated per-arguer writer and checked by a separate agent that did not write it. Terminal output only; writes nothing to the product."

- **No character ceiling** — not until several runs have been seen. The old 1,500 ceiling is what forced the compression; a per-point story is short by construction, so a ceiling would be solving a problem the unit change already removes. The `stories.content` 10,000 database limit is a constraint, not a brief, and it still binds.
