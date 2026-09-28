<!-- MUST-FAIL FIXTURE for P1210 P1367 (page-shape) — GENERATED, do not hand-edit. -->
<!-- Derived from .claude/commands/slava/disagreement/clarity-night-publish.md: each rule's own sentence, verbatim, EXCEPT the one named below, -->
<!-- which is deleted so the predicate is watched to REJECT (epistemic.md gate 7). -->
<!-- one rule sentence has been deleted; see STRIP in scripts/points/build-rule-fixtures.mjs -->

An opening, then these five headings, in this order, and nothing else:

node scripts/points/page-check.mjs <desc.md>; echo $?

17. **No negation opener.** Neither the page nor any section starts with what the event is not

18. **Never "we quoted".** The page shows quotes; it does not narrate quoting them.

19. **Never imply the people spoke about the event's frame term** when they did not. If the topic

20. **No talk videos in Sources.** Each person's story already carries their source; Sources holds

21. **The round rule is what the room does, never page copy.** In each round nobody disagrees while

**The corrections log exists before the first correction (P1367).** Draft mode's first action,

| **Date, start, end, venue** | Founder decision. Ask whether the room is confirmed; if not, Step 8 drafts the ask. **Resolve the date by command, never in your head** (P1367): `node scripts/events/event-date.mjs resolve --today <YYYY-MM-DD> --time <HH:MM> "<his words>"`. Exit 3 means the phrase has two readings ("next Tuesday" on a Monday): show him both lines and write nothing until he picks. Echo the chosen line back, and write it into the handoff's `## Now` block in the same step as the DB write. |
