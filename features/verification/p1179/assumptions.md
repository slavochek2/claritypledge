# P1179 — calls made without asking

There is no escalation clause. The agent decides, logs here, continues.

## Made by /goalify at contract time (2026-08-28)

**A1. DW-4 binds `P1161` only; `docs/events/clarity-practice-event.md` is left untouched.**
The spec's Risks row and Done-When line say both files call `/feed/cmp7` "the room's URL". Only
P1161 does (`:205`, `:246`, `:256`). The practice-event doc carries no route pointer at all —
`grep -n 'feed'` returns 17 hits, all the English word "feedback". The founder was asked twice
whether the doc's run-of-show block 5 should be made to name the Links menu, and did not answer
either time. Taken as: leave it. Reversible — adding that pointer later is a one-line doc edit and
needs no contract change.

**A2. The DW-4 grep resolves P1161 by `find`, not by a literal path.** A co-tenant session had
`features/p1161_*.md` staged as a rename into `features/done/` at the moment this contract was
pinned, so a hardcoded path would have gone stale the instant that ship landed.

**A3. `/live` in the Links sheet knowingly contradicts P844 on the same routes.** P844 hides the
nav's Start-a-Session CTA on event pages as a competing primary action; the founder added `/live`
to the sheet on 2026-08-28. Inside a menu it is one entry among five, so P844's reason does not
carry over. Recorded because the two decisions now point opposite ways on the same route.

## Made by the loop

<!-- append below, one heading per call -->
