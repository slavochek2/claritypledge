---
status: week
type: story
rank: 1000079
workstream: events
created_date: '2026-09-08'
tags: [events, event-detail, ux, description]
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: heuristic
disclosure: public
---

# P1264: The trail link is buried in the hike description

## Problem

**Situation:** The hike event's description is one block of markdown rendered into a
`prose` container. Inside it sits the AllTrails route link — the single piece of
information an attendee most needs before deciding to come, and the one they will want
again on the morning of the hike.

**Complication:** An inline link inside body copy reads as body copy. This is the exact
failure P1194 fixed for the group-chat invite, which lived the same way inside
`events.description` and was missed until it was pulled out into `GroupChatBlock` — a
button with its own weight. Nothing was learned from that for any *other* important link,
because P1194 was scoped to the group chat.

**Question:** Give the trail link the weight it needs, and tidy the two other things in
the same description while it is open — the quotes, which currently run as flat
paragraphs, and a closing PS pointing at the public Chiang Mai events calendar.

> Founder framing, verbatim: *"the old trails link. We can render it like a button, like
> a proper button, because that's an important link. And second, the quotes can be
> formatted nicely, so it reads nicely. And last one, at the end of it, we might say
> something like PS and link the Google Calendar to Chiang Mai. But also maybe as a
> button. I don't know. Or is it too many buttons? What do you think?"*

## Appetite

Blast radius: low — one optional column on `organization`, one component, CSS scoped to
the description container, one event's description text. Every existing event renders
unchanged (no note → component returns `null`). Reversibility: high — additive nullable
column, inert after a code revert; description text is data. Decision density: low.

## Solution — REVISED THREE TIMES DURING REVIEW

The shipped shape is **not** the shape this spec was filed with. Both reversals came from
founder review of the live test page, and both are recorded here rather than rewritten
away, because each one removed a piece of machinery the first draft had argued for.

**1. Links in the description are CSS chips — no column, no component.**

*Filed as:* a nullable `events.trail_url` column feeding a `TrailLinkBlock` component
rendered as a standalone button above the description.

*Shipped as:* `.event-description a` styled as a solid dark inline pill directly in
`src/index.css`. The founder's call, verbatim: *"imho better put button inliine where it
belongs and making it smaller inline with text"*. A standalone block put the route link
~900px from the sentence describing the route; inline, "View hike on AllTrails" sits in
the paragraph that says how long the loop is, and "Directions" sits in the sentence naming
the cafe — which is where each one is wanted.

Consequences of the reversal, all of them wins: no schema column, no service method, no
component, and it generalises — every link a host writes into any event description gets
the treatment, rather than one blessed field. `renderMarkdownSafe` already emits
`target="_blank" rel="noopener noreferrer"` and protocol-allowlists the href, so the
guard the column-based design needed at its render boundary is already there for free.

`events.links` (P1179) is **not** reusable here and this is deliberate on P1179's side:
that column is tags-only by construction, resolved to `/stake/:tag` and nothing else, so
that no external destination can reach a render path. Do not widen it.

**Styling.** Solid `hsl(var(--foreground))` background, `hsl(var(--background))` text, ↗
affordance, pill radius. Chosen by looking, not by assuming: an earlier outline-only
version was called out by the founder as *"barely vsible"*, and green was rejected because
the registered page already carries a green success card plus WhatsApp's `#25D366`, and
`.claude/rules/src.md` bans green action buttons outright. Touch target is 34px, 40px under
`(pointer: coarse)`.

**One exception, founder-directed:** a link inside an italic aside (`.event-description em
a`) resets to a plain underlined link. `claritypledge.com/cm` is a mention, not an action,
and a solid pill around it reads as an advert.

**2. Sections, and quotes with attributions above them.**

Description text gains `##` headings — "The route", "Where we meet", "What to expect",
"What to bring". Quotes become markdown blockquotes; `@tailwindcss/typography` is already
applied to the container so `>` renders styled with no code change.

**Bug found and fixed here:** the typography plugin injects `open-quote`/`close-quote`
pseudo-elements on `blockquote p`, so literal `"` characters in the source doubled them,
and the closing mark landed *after* the attribution when the attribution was inside the
quote. Fixed by dropping the literal quotes and lifting each attribution out of the
blockquote to the line above it, ending in `:` — the founder's own instruction: *"put 'one
recent hiker, 4.6★ over 48 reviews' ... before the quotes maybe ending with ':'"*.

**3. The PS becomes `organization.event_footer_note` — an org-level note, its own card.**

*Filed as:* a paragraph typed at the end of one event's description.

*Shipped as:* a nullable `TEXT` column on `organization`, rendered by `OrgFooterNote` as a
sibling card **below** the event card, on every event that org runs.

Two things were wrong with the description-paragraph version, and only the second was
visible from the founder's side. The words are identical on every event the org runs, so
per-event text means retyping and drift. And anything inside the description necessarily
renders *before* the blocks that follow it, so the aside could never sit where the founder
wanted it — after the group-chat button.

Position moved once more after that: from the last paragraph inside the event card to its
own card below it, on the founder's annotated screenshot (*"what do you think about moving
this into separate seciton below"*). Inside the card it read as the closing line of this
hike's description; as a sibling card the page says structurally that it is not about this
event, with no extra copy.

**Activation is the column, not a flag.** The founder asked whether the note could be
switched on and off per group. It already can: the column is nullable, so an org with no
note renders nothing. Setting the column IS the switch. No boolean was added.

**4. `GroupChatBlock` moved above the description.**

Founder asked *"maybe at top of descirpiton not of bototm? or bototm?"*. Top, for two
reasons that point the same way. Logged out it is a **reason to register**, and a reason to
register must be visible where the decision is made, not after scrolling a long itinerary.
Registered, it is the next action after registering — measured ~700px below the
confirmation card in the old position, far enough that a blind visual-QA pass read the two
green elements as unrelated features that happened to share a colour.

It stays `!isPast`, unlike the calendar block (P1256): a group chat is *most* useful just
after a hike — photos, "who has my jacket", where everyone went to eat.

## Resolved Decisions

1. **The PS is prose, not a button.** Visual: RSVP + trail + calendar is three competing
   CTAs and the RSVP stops being the obvious next action. Tone: "PS" is an aside from a
   person; button weight overclaims it and makes an off-event personal plug read as an ad.
2. **The trail link is not gated.** It is decision-support for someone not yet registered.
   Gating it behind RSVP inverts what it is for.
3. **No `trail_url` column.** Superseded by the CSS-chip approach — see Solution 1. The
   migration that added it is discussed under Known Debt.
4. **No per-org enable flag.** The nullable column is the flag — see Solution 3.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Chip styling applies to EVERY link a host writes in a description, including ones meant as prose | ACCEPT | The italic-aside escape hatch exists for exactly this; scoped to `.event-description`, so no other page is touched |
| `organization.event_footer_note` is public — anyone can read it anonymously | ACCEPT | It renders on a public event page by design; an integration test asserts the anonymous read succeeds so a future RLS tightening fails loudly instead of silently blanking it |
| Column added with no editor UI, so only a programmatic write can set it | ACCEPT | Identical to `links` (P1179) and `group_chat_url` at ship; an operator step, listed in Next Steps |
| Description edits on prod are unversioned data | ACCEPT | Test-env event is edited and reviewed first — the founder's stated sequence |

**Non-Goals**
- Do NOT widen `events.links` to carry URLs. Its tags-only shape is a security invariant.
- Do NOT change the RSVP button or the location block.
- Do NOT touch `renderMarkdownSafe` — blockquotes and the protocol allowlist already work.
- Do NOT edit the prod event in this spec's work.
- Do NOT add a boolean enable flag for the org note.

## Invariants

- No user-authored string may reach the DOM except through `renderMarkdownSafe`. This
  covers the org note as much as the description — it is a property of the render path,
  not of the data, and `p1264-org-footer-note.test.tsx` asserts it for `javascript:` hrefs
  and raw HTML.
- The event page has exactly one full-width primary action (P955). The description chips
  are inline and auto-width by construction.
- Per-event state fetched in an effect must be CLEARED before the new request, not only
  written in `.then`. Both the org note and the group-chat URL key on `eventId`; writing
  only on success leaves the previous event's value rendered under the new event until the
  request resolves, and permanently if it rejects. For the group-chat URL this is a
  correctness bug, **not** a disclosure — the effect's guard clears the URL when the viewer
  is not host or RSVP'd on the new event, and RLS on `event_private_info` is the boundary
  in any case, so the stale value is only visible to someone entitled to both links.
  Regression: `p1264-stale-org-note-on-navigation.test.tsx`.

## Acceptance Criteria

- [x] Links inside the description render as visibly distinct inline chips, sized to their
      own label — verified at desktop and at a real 375px viewport (`innerWidth` confirmed
      375 via `emulate`, `scrollWidth` delta 0).
- [x] The quotes in the description render as visibly set-apart blockquotes with the
      attribution above them, and with no doubled quotation marks.
- [x] The PS renders below the event card as its own block, in italic prose, with a plain
      underlined link to `claritypledge.com/cm` — verified in the DOM
      (`insideEventCard=false`, note top 1963 > card bottom 1939).
- [x] An org with no note renders exactly as before — no empty block, no divider. Unit
      test covers `null` and whitespace-only.
- [x] The group-chat block renders above the description in both states, logged out
      (locked explainer) and registered (green button) — both verified live with a real
      test user and a real RSVP.
- [x] Navigating from one event to another never shows the previous event's org note or
      group-chat URL — regression test drives real router navigation with the second
      request left unsettled.
- [x] Founder reviewed the test-env mirror across several rounds (label, colour, section
      headings, quote attributions, block placement — the last round delivered as an
      annotated screenshot) and authorised the ship in session on 2026-09-08. Recorded
      as what happened rather than as a final reload, which was not separately confirmed.

## Done-When

- [x] Migration adds `organization.event_footer_note` and applies cleanly on test.
- [x] Integration test proves the column exists, is nullable, and is anonymously readable
      — proven to FAIL against a database without the column.
- [x] `npm test` (3872 passed), `npm run build` pass.
- [x] Branch reviewed by an adversarial external reviewer (codex); both findings verified
      by command before acting, one fixed with a regression test, one recorded as debt.

## Known Debt

`supabase/migrations/20260908065003_p1264_event_trail_url.sql` adds `events.trail_url` and
is now dead — the CSS-chip reversal removed its only consumer, and `grep -rn trail_url src/
e2e/ scripts/ supabase/` returns only the migration itself. It is applied on **test** and
was never applied to prod.

It is deliberately NOT deleted in this branch. Deleting the file alone would leave the
column present on test with no migration describing it — file/database drift, and it would
not remove the column that is the actual (inert, never-written, nullable) exposure. Removing
it properly needs a `DROP COLUMN` migration, which is an ALWAYS-ASK operation. Founder
decision required; do not apply this migration to prod in the meantime.

## Next Steps (operator, post-ship — deliberately not gating)

No commit on this branch can close these; they are actions on prod data.

- Apply `20260908093000_p1264_org_event_footer_note.sql` on prod.
- Set `organization.event_footer_note` for the `cm` org to the founder-authored PS text.
- Apply the reviewed description text to the prod hike event.
- Decide the `trail_url` column's fate (see Known Debt).

## Open Questions

- **The confirmation EMAIL has no group-chat mention.** The confirmation *page* already
  renders `GroupChatBlock` above "Add to Calendar" — verified live, so the founder's
  question about it needs no work. `buildConfirmation` in
  `supabase/functions/_shared/email-helpers.ts` is the real gap. Putting the invite URL in
  an email makes an RSVP-gated link forwardable and inbox-resident; a line pointing at the
  event page keeps the gate. Separate spec, not an extension of this one.

## Related

- **P1194** — the same defect for the group-chat link; `GroupChatBlock` is the pattern this
  started from, including the deliberate not-full-width decision.
- **P1179** — `events.links`, tags-only by construction. Named here so a later agent does
  not "reuse" it.
- **P955** — one full-width primary per view; enforced by the p955-gate.
- **P1256** — the calendar block's `isPast` widening, deliberately not copied here.
