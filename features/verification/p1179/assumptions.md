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

### A4. Entry ORDER: the three stake tags first, then the two tools, then extras.

The contract's AC-4 lists the labels as "Start a Clarity Session, Transcribe, cmp7, cmp3, cmp10",
which reads as an order; the approved reference says the separator falls **before Transcribe**.
Those two cannot both be satisfied. Taken as: the reference wins on layout, the AC line is a list of
which labels must appear verbatim, and the unit suite asserts the reference's grouping
(`cmp7, cmp3, cmp10 | Transcribe, Start a Clarity Session | This event …`). Reversible — the order
lives in one array in `event-links.ts`.

### A5. A hostile or malformed extra is DROPPED silently, not surfaced as an error.

DW-3 says "rejected or ignored". Both were available. Chose ignore: a malformed row written at
publish time must not take the room's menu down in front of a live audience, and the operator sees
the missing entry when they check the link before the event (the spec's own mitigation for the
empty-surface risk). The five standard entries always render.

### A6. An unreadable event row still yields the five standard entries.

`getEventBySlug` failing (network, RLS, a row not yet migrated) resolves to `extras = []` rather
than hiding the button. Same reasoning as A5: the standard five are global content that does not
depend on the row at all, so failing closed would remove working destinations for no gain.

### A7. `links` is mapped defensively in `events-service-real.ts` (`Array.isArray(row.links) ? … : []`).

The column is `NOT NULL DEFAULT '[]'` with a `jsonb_typeof = 'array'` CHECK, so this branch should
be unreachable in a migrated database. It is there for the window where code is deployed against a
database the migration has not reached yet — during which `row.links` is `undefined`, not `[]`.

### A8. The stake surface reads `?event=` but renders identically with or without it.

Resolved Decision 2 makes the route global and the param purely a carrier for the Links button.
The page therefore does not gate, filter or style anything on it. It is exposed in the DOM only so
the e2e spec can assert the param survived the hop.
