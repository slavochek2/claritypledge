---
status: all-done
type: story
rank: 0.5
workstream: C2
tags:
  - letters
  - results
  - one-to-many
  - overview
  - workshop
created_date: '2026-04-12'
flow: dev
pipeline_plan:
  - create-spec
  - challenge-prd
  - ascii-flows
  - ux
  - architect
  - ui
  - generate-tests
  - dev
  - verify
pipeline_ran:
  - create-spec
  - challenge-prd
  - ascii-flows
  - ux
  - architect
  - ui
  - generate-tests
  - spec-review
uat_file: features/uat/p700.md
test_files:
  - e2e/p700-letter-overview.spec.ts
  - e2e/a11y/p700-letter-overview-accessibility.spec.ts
pipeline_skipped:
  - view -- no net-new visual polish beyond ui
locked_at: '2026-05-14T09:23:33.974Z'
superseded_by: p836
completed_at: 2026-05-17
---

# P700: Letter Overview — per-letter author view (list-first, two selectors)

> **Depends on:** [P699](../../archive/p699_letter_results_story_walk.md) (individual story walk — shares RPC pattern, owns per-delivery drill-in page)
> **Supersedes:** [P746](../../archive/p746_letter_sent_snapshot_aggregates.md) (rejected — same surface at thinner fidelity), [P624](../../archive/p624_understanding_agreement_grid.md) (rejected — grid folded here, then iterated out in favour of lists)
> **Related:** [P663](../../archive/p663_letter_live_interleave.md) (pre-loaded /live concept), [P703](../2026-04-17/p703_verify_live_from_letter_results.md) (pre-loaded /live + inbox invite)

## Problem

**Situation:** After P664 (sent-tab redesign) and P699 (per-delivery story walk), the sent tab groups by letter and each recipient row links to that person's individual results page. The letter author has two views today: "all my letters" (sent tab, letter-grouped) and "one recipient's results" (per-delivery page).

**Complication:** The author lacks a middle layer — a single surface for one letter that answers *"where does everyone stand on this letter's stories and points?"* without opening each recipient page one by one. Sent-tab cards are intentionally light (navigation chrome), and per-delivery pages are intentionally narrow (one respondent). Neither supports comparison across respondents for the same letter.

Secondary gaps (inherited from the rejected P746):
1. **Sent-tab cards default to expanded on load.** Several sent letters = initial render is visually noisy.
2. **No direct jump from aggregate to a recipient's specific story or point.** The author must open the recipient's page and scroll.

**Question:** Where does the per-letter aggregate live, and how does the author reach a specific recipient's specific story from there — without introducing a visualization that outpaces the data volumes (1-5 respondents per letter is typical)?

## Appetite

Medium blast radius (new page + one sent-tab polish pass). Fully reversible — remove the route, revert the sent-tab CTA, sent tab returns to P664 shape. Low viz complexity (no charts, no axes, no dots in MVP — just text lists). High decision density on data selection patterns (story selector / person selector / combined). No schema changes.

## Solution

### Where the aggregate lives

New page at `/letter/:id/overview`, reached from the Sent tab via an `[Open overview]` CTA on each letter card. The CTA sits rightmost in the card action area, directly before the `[···]` ghost dropdown, matching the drafts-tab `Prepare Letter` pattern. Mobile: the CTA moves into the `[···]` dropdown as the top item. Sent-tab cards default to **collapsed** on first mount and on reload.

Author-only. Non-author visiting the route is redirected or blocked.

### Two selectors, three views (no grids in MVP)

The page has two selectors at the top: **Story** and **Person**. Combined state drives the view.

| Story | Person | View |
|-------|--------|------|
| default: Story #1 | none | **Cohort list on one story** — every person's positions on that story's CLAIM + ANTI, one row per person |
| none (cleared) | selected | **Person's journey list** — that person's positions across every story/point in the letter |
| selected | selected | **Zoom card** — that person on that story, with CLAIM/ANTI values and `/live` movement as prose |

On landing, Story is pre-selected (first story in the letter); Person is cleared. The author can clear Story to switch to Person-only view.

### View 1 — Cohort on one story (default)

For the selected story, list every respondent with their key values inline:

```
Story: [Story 1 ▼]     Person: [— none — ▼]

"The AI Threat Narrative"
Alice    Und 8        CLAIM +2 agree             ANTI ◌ no position    ★ Verified   [open]
Bob      Und 4 → 7    CLAIM −2 → −1 moved        ANTI ◌ no position    → Moved      [open]
Carol    —            —                          —                     · Waiting
```

- One row per respondent. Columns: name · understanding · CLAIM value · ANTI value · status · drill-in link.
- Understanding shows `letter → /live` when verified (`4 → 7`), single value when letter-only, `—` when waiting.
- Position values render as signed value + label (`+2 agree`, `−1 somewhat disagree`, `0 unsure`). Hollow circle `◌` = no position set (distinct from "unsure" which is an explicit position).
- Movement between letter and `/live` renders inline (`−2 → −1 moved`).
- Row click / `[open]` deep-links to `/letter/:id/results?delivery={deliveryId}` (P699's per-delivery page) anchored to the selected story.

### View 2 — Person across all stories (Person selected, Story cleared)

For the selected person, list every story in the letter with their values:

```
Story: [— none — ▼]     Person: [Bob ▼]

Bob · Letter only
  Story 1 "The AI Threat Narrative"        Und 4/10 → 7/10
    CLAIM  −2 disagree → −1 somewhat disagree
    ANTI   ◌ no position
  Story 2 "Human Connection"               Und 6/10
    CLAIM  −1 somewhat disagree
    ANTI   ◌ no position
  [Open Bob's full results →]
```

- Section per story. Each section shows understanding (with pre/post if verified) and CLAIM/ANTI values inline.
- Bottom link opens Bob's per-delivery results page (P699).

### View 3 — Zoom card (both selected)

```
Story: [Story 1 ▼]     Person: [Bob ▼]

Bob on "The AI Threat Narrative"
  Understanding:   4/10 → 7/10 (verified)
  CLAIM "AI displaces workers":   −2 disagree → −1 somewhat disagree
  ANTI  "Humans adapt":            ◌ no position
[Open Bob's full results →]
```

Single-respondent single-story focus. Same fields, denser prose.

### Why no grid in MVP

- Typical letter has 1-5 respondents. Dots on axes add chrome without adding information at that volume.
- Workshop projection (the grid's unique payoff, per P624's original framing) is not an active use case for the MVP author audience.
- A text list preserves polarisation legibility (you can see Alice is at +2 while Bob moved from −2 to −1) without a visualization library.
- Grid remains open as a later enhancement if/when the author starts facilitating live workshops. Non-goal for this spec.

### Entry point changes (sent tab)

- Desktop: add `[Open overview]` solid blue button in each letter card's action area, rightmost position, directly before `[···]`. Matches drafts-tab `Prepare Letter` chrome (`hidden sm:inline-flex bg-blue-500 hover:bg-blue-600 text-white min-h-[44px]`).
- Mobile: add `Open overview` as the top item in the card's `[···]` dropdown.
- All letter cards default to collapsed on first mount and after reload. Expansion state is session-ephemeral (no persistence).

### Data access

Single SECURITY DEFINER RPC returning the letter's full response payload for the author:
- Per recipient: `delivery_id`, display name, completion state (letter-only / verified / waiting)
- Per (recipient × story): story understanding (letter self-rating; `/live` speaker rating if verified)
- Per (recipient × point): position type + signed value (letter; `/live` if verified)

Author ownership validated inside the RPC. RLS on underlying tables remains the authoritative boundary; the RPC is a convenience aggregator. Reuse P699's `get_letter_results` pattern — extend (or wrap) if single-recipient shape doesn't fit cleanly; leave signature to `/architect`.

## Risks / Non-Goals

### Risks

1. **List density with 10+ respondents.** View 1 is one row per person — fine at 1-5, dense at 10+. Mitigation: list is scrollable; no need to fit on one screen. If this becomes a pain we revisit with sort/filter.
2. **Anonymous and opt-out recipients.** P747 introduces anonymous identity for recipients. Preserve the current `receiver_name || receiver_email || 'Anonymous'` fallback until P747 lands; do not introduce an interim labelling scheme.
3. **Mean-value trap.** Never display a mean (position or understanding). Show raw per-recipient values so bimodal / polarised distributions stay legible.
4. **RPC author scoping.** The aggregator must enforce `author_id = auth.uid()` inside the function body; callers cannot bypass via direct table access because RLS already blocks it.

### Non-Goals

- **No grid / dot-plot / chart** in MVP. Text lists only. Grid is a separate later spec if it earns its place.
- **No story grid view** (all points × all people at once). View 1 shows one story's CLAIM + ANTI per row; it does not tile multiple stories.
- **No "everything for everyone at once" aggregate.** The two-selector model rejects the full cross-join view as noise.
- **No real-time refresh.** Author reloads the page after a `/live` session to see updated values.
- **No verify action / pre-loaded `/live` from this page.** Owned by P702 / P703.
- **No cross-letter aggregation.** One letter per overview page.
- **No mean, median, or averaged values.** Display raw per-recipient data only.
- **No edits** to the rejected P624 grid spec or its superseded follow-ups. Those are historical records.
- **No sender-side changes** beyond the sent-tab CTA and collapsed-by-default behavior.

## Done-When

- [ ] Sent tab cards default to collapsed on first mount and after reload
- [ ] Desktop `[Open overview]` button renders rightmost in the card action area, directly before `[···]`, matching drafts-tab `Prepare Letter` chrome
- [ ] Mobile `[Open overview]` appears as top item in the `[···]` dropdown
- [ ] Clicking `[Open overview]` navigates to `/letter/:id/overview`
- [ ] Landing state shows Story = first story in letter, Person = none — View 1 renders
- [ ] Story dropdown lists every story in the letter and has a "— none —" clear option
- [ ] Person dropdown lists every recipient (by display name, Anonymous fallback) and has a "— none —" clear option
- [ ] View 1 renders when Story is selected and Person is not: one row per recipient with Und · CLAIM · ANTI · status · drill-in
- [ ] View 2 renders when Person is selected and Story is not: one section per story with Und and CLAIM/ANTI values
- [ ] View 3 renders when both are selected: zoom card with Und + CLAIM + ANTI for that pair
- [ ] Position movement shown inline (`−2 → −1`) when a `/live` value exists for that point
- [ ] Understanding movement shown inline (`4 → 7`) when a `/live` verification exists for that story
- [ ] Hollow circle `◌` renders for points with no position set (distinct from `0 unsure`)
- [ ] Deep-link drill-in: row click / `[open]` opens `/letter/:id/results?delivery={deliveryId}` anchored to the currently-selected story (View 1) or the zoomed story (View 3)
- [ ] Deep-link drill-in from View 2's "Open person's full results" opens the per-delivery page without story anchor
- [ ] Anonymous respondents render as `(Anonymous)` using the existing fallback chain
- [ ] Non-author visiting `/letter/:id/overview` is redirected or shown a not-authorized state
- [ ] Existing per-recipient drill-in from sent-tab (P664) continues to work unchanged

## Acceptance Criteria

- [ ] Author sees all respondents' positions on a selected story in one list (View 1)
- [ ] Author switches to a selected person and sees that person's positions across every story (View 2)
- [ ] Author selects both story and person and sees the zoomed single-cell view (View 3)
- [ ] No means or averages displayed anywhere
- [ ] No grid, dot plot, or chart rendered anywhere on the page
- [ ] `Und X → Y` displays correctly when only letter data exists (`X`), when both letter + `/live` exist (`X → Y`), and when waiting (`—`)
- [ ] Polarised distributions are legible from the list (e.g. Alice +2 and Bob −2 on the same CLAIM visible in adjacent rows without further interaction)
- [ ] Loading, empty (no recipients), and error states render without crashing
- [ ] Mobile layout keeps rows readable at 390px width — no horizontal scroll on View 1's primary columns

## UX Notes

**Selector placement (desktop):** Two dropdowns top-left, labelled `Story` and `Person`. Current selection visible at rest. `— none —` item at top of each list clears that selector. Changing either selector updates the view without a navigation transition.

**Selector placement (mobile):** Selectors stack vertically above the list. Full-width.

**View 1 row layout (desktop):**

```
[Name]  [Und X or X→Y]  [CLAIM signed+label or —]  [ANTI signed+label or ◌]  [Status]  [open →]
```

Columns are fixed-width on desktop; on mobile, name + status are the primary row, CLAIM/ANTI values wrap below the name.

**View 2 section layout:**

Story title · understanding line · two indented lines for CLAIM and ANTI. Stories render top-to-bottom in author authoring order. Stories with no response from this person show the story title with `Waiting for first completion` in muted text on the understanding line, and no CLAIM/ANTI lines.

**View 3 zoom layout:**

Single card. Story title at top, respondent name + status (`Letter only` / `Verified` / `Waiting`) on the meta line. Understanding, CLAIM, ANTI each on their own line with prose labels.

**Empty / edge states:**
- Zero recipients (letter sent to nobody): impossible in practice; render a "No recipients" placeholder anyway for safety.
- All recipients waiting: View 1 shows the story, every row says `· Waiting`, no values.
- Selected person has no response on selected story (View 3): `Waiting for first completion` in place of values.
- Anti-point missing entirely for a story (some authors only wrote a CLAIM): the `ANTI` column in View 1 renders as `—` in muted text; View 2 omits the ANTI line.

**Verification movement:**
- Understanding: `4 → 7` with a small arrow glyph (`→`) between values when `/live` data exists for that (recipient, story).
- Position: signed value with label, `→` separator, new signed value with label (`−2 disagree → −1 somewhat disagree`).
- Letter-only: single value, no arrow.

**Back nav:** `[← Sent]` link top-left returns to the sent tab with the originating letter card scrolled into view but not auto-expanded.

## UX Design

Extends `## UX Notes` above with explicit flows, accessibility, responsive, and visual context. Layout rules stay in UX Notes; this section adds the UX-layer context the next skills need.

### User Flow

**Flow A — Sent tab → Overview landing**
1. Author opens Sent tab. Cards default collapsed (see Solution → Entry point changes).
2. Author spots a letter card. Desktop: clicks `[Open overview]` solid blue button. Mobile: taps `[···]` → `Open overview` (top item).
3. Browser navigates to `/letter/:id/overview`.
4. Page mounts with Story = first story, Person = none → View 1 renders (see ASCII Flow → View 1).
5. Author scans the cohort list. No further action required to reach value.

**Flow B — Switch to person-focus (View 1 → View 2)**
1. From View 1 (Story selected), author clears Story dropdown to `— none —`.
2. Author selects a person from Person dropdown.
3. List re-renders as View 2 (person across all stories). No page navigation; client-side.
4. Author reads the person's story-by-story breakdown. Clicks `[Open Bob's full results →]` if they want P699 detail.

**Flow C — Drill to recipient results (View 1 row → P699)**
1. From View 1, author clicks any `[open]` link on a recipient row.
2. Browser navigates to `/letter/:id/results?delivery={deliveryId}&story={storyId}`, anchored to the selected story.
3. Author is now on the P699 per-delivery page for that recipient.
4. Back navigation returns author to the overview (browser back; no custom state needed).

**Flow D — Mobile equivalents**
- All three views available on mobile. Selectors stack full-width above the list (see Responsive Design below).
- View 1 rows wrap CLAIM/ANTI below the name on narrow viewports; tap target for `[open]` spans the full row.
- Flows A–C apply identically; the difference is layout only.

---

### UI States (beyond `## UX Notes`)

**Loading** — use skeleton rows matching View 1 row shape (name placeholder, three column placeholders, status placeholder). Data payload is small (<10 recipients × <5 stories); first paint is fast. Skeleton prevents layout shift when the list resolves. No spinner needed — spinner signals an unpredictable wait; skeleton signals imminent content.

**Error (RPC fails)** — centered message within the list area: `Could not load results. [Retry]`. Selectors remain usable (preserve selector state). Retry re-fires the RPC without a page reload.

**No /live data anywhere** — the page renders normally. Movement arrows never appear. Understanding shows single value, not `X → Y`. Status column shows `★ Verified` or `· Waiting` based on letter completion, never `→ Moved`. This is not an error state — letter-only is valid and expected.

**Selector mid-change** — selecting a dropdown option updates the list immediately via client-side filter. No loading indicator. If the resolved view is empty (e.g., valid combination with zero matching rows), show the appropriate empty state from UX Notes rather than a generic spinner.

**Both selectors cleared** — impossible on initial landing (Story always pre-selected). If the author manages to clear both, show: "Select a story or a person to explore." with both dropdowns visually highlighted (focus ring or subtle border accent). No error tone — treat as a guidance prompt.

---

### Accessibility

- Selectors: `role="combobox"`, `aria-label="Select story"` and `aria-label="Select person"`.
- List region: `aria-live="polite"` so screen readers announce view changes when Story or Person selection changes.
- Status glyphs (`★ ◌ · →`) are decorative characters — each needs a visually-hidden text equivalent: `<span class="sr-only">Verified</span>★`, `<span class="sr-only">No position</span>◌`, `<span class="sr-only">Waiting</span>·`, `<span class="sr-only">Moved</span>→`.
- Movement values (`−2 → −1`): screen reader must read "from minus two to minus one", not "minus two arrow minus one". Wrap the arrow in `aria-hidden="true"` and add a visually-hidden string, e.g. `"from −2 disagree to −1 somewhat disagree"`.
- Keyboard: Tab order = Story dropdown → Person dropdown → list rows (each row is a Tab stop; Enter on a row with `[open]` activates the drill-in link).
- Focus indicator: visible 2px ring on selector triggers and on each focusable row. Matches existing design system focus ring pattern.
- Color contrast: muted text (`--muted-foreground`) must meet WCAG AA (4.5:1) against card background. Verify in `/ui` — especially for `◌ no position` and `· Waiting` which carry semantic weight.
- `[← Sent]` back link: descriptive `aria-label="Back to Sent tab"` (avoids generic "Back" read-aloud).

---

### Responsive Design

**320–767 (mobile)**
- Selectors stack full-width, one above the other. Match `## UX Notes` → "Selector placement (mobile)".
- View 1: primary row = name + status. CLAIM/ANTI values wrap to a second line below the name. Understanding stays on the primary row if it fits; wraps otherwise.
- `[open]` is a full-row tap target (not just the link text). Min 44px touch target height.
- View 2 / View 3: prose layouts unchanged; they already read top-to-bottom naturally.
- No horizontal scroll. All primary columns fit within 320px by wrapping, not truncating.

**768–1023 (tablet)**
- Selectors side-by-side (two columns). View 1 renders with desktop column structure but tighter column widths.
- Status column may abbreviate to glyphs only (`★`, `→`, `·`) — label shown in tooltip (`title` attribute, with `aria-label` for screen readers).
- `[open]` remains a visible link, not folded.

**1024+ (desktop)**
- Fixed-width columns per `## UX Notes` → "View 1 row layout (desktop)". No changes from that spec.

**Breakpoint behavior:** CSS grid/flex handles all column collapse. No JS breakpoint detection required. No layout thrash on resize.

---

### Visual Context

**Density intent:** Dense-efficient. The author is scanning respondent data to decide who to verify next — this is number-and-label reading, not reflection. Spacing should feel like a table of records. Contrast with pledge-signing (spacious, ceremonial): this page sits at the opposite end of the density spectrum. Tight row padding, compact typography, no decorative whitespace between rows.

**Visual reference:** Should feel like the per-delivery results page (P699) — this page is its aggregate sibling. Same card chrome, same typography scale, same muted metadata pattern (`· Waiting`, `Und 4`). The sent tab (P664) is the `[← Back]` parent and sets the outer chrome. Avoid introducing new visual weight or color use not already present in P699 or P664.

## ASCII Flow

**Sent tab card (desktop)** — `[Open overview]` sits rightmost before `[···]`:

```
┌────────────────────────────────────────────────────────────────┐
│  📨  Understanding AI Risks           3 recipients             │
│       Sent 2 days ago · 2 responded · 1 waiting               │
│                             [Open overview]  [···]            │
└────────────────────────────────────────────────────────────────┘
```

Solid blue button, matches drafts-tab `Prepare Letter` chrome. On mobile, `Open overview` is the top item in the `[···]` dropdown. Cards default collapsed.

**Letter Overview — View 1 (Story selected, Person cleared — landing state):**

```
← Sent
Understanding AI Risks

Story: [Story 1 ▼]     Person: [— none — ▼]

"The AI Threat Narrative"
Alice    Und 8        CLAIM +2 agree             ANTI ◌ no position    ★ Verified   [open]
Bob      Und 4 → 7    CLAIM −2 → −1 moved        ANTI ◌ no position    → Moved      [open]
Carol    —            —                          —                     · Waiting
```

**Letter Overview — View 2 (Person selected, Story cleared):**

```
Story: [— none — ▼]     Person: [Bob ▼]

Bob · Letter only
  Story 1 "The AI Threat Narrative"        Und 4/10 → 7/10
    CLAIM  −2 disagree → −1 somewhat disagree
    ANTI   ◌ no position
  Story 2 "Human Connection"               Und 6/10
    CLAIM  −1 somewhat disagree
    ANTI   ◌ no position
[Open Bob's full results →]
```

**Letter Overview — View 3 (both selected):**

```
Story: [Story 1 ▼]     Person: [Bob ▼]

Bob on "The AI Threat Narrative"
  Understanding:   4/10 → 7/10 (verified)
  CLAIM "AI displaces workers":   −2 disagree → −1 somewhat disagree
  ANTI  "Humans adapt":            ◌ no position
[Open Bob's full results →]
```

Mobile keeps the same semantic layout; View 1 wraps CLAIM/ANTI values below the name when the row doesn't fit.

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Overview route | `/letter/:letterId/overview` | New page, author-only |
| Sent-tab CTA (desktop) | `Open overview` · solid blue Button · rightmost before `[···]` | Card header, matches drafts-tab `Prepare Letter` |
| Sent-tab CTA (mobile) | `Open overview` menu item (top) in `[···]` dropdown | Card header |
| Default sent-tab state | all cards collapsed | On mount / reload |
| Landing view | Story = first story, Person = none (View 1) | Page mount |
| Selector clear item | `— none —` as first option | Both selectors |
| Understanding format | `X` or `X → Y` (integer 0-10) | All views |
| Position format | `{signed value} {label}` — `+N agree`, `0 unsure`, `−N disagree` with degree label | All views |
| No position set | `◌ no position` in muted text | All views |
| Movement separator | `→` with one space each side | Understanding + position |
| Status labels | `★ Verified` · `→ Moved` · `· Waiting` · `Letter only` | View 1 status column, View 2/3 meta line |
| Anonymous label | `(Anonymous)` | Existing fallback chain |
| Row drill-in URL | `/letter/:letterId/results?delivery={deliveryId}&story={storyId}` | View 1 row, View 3 link |
| Person drill-in URL | `/letter/:letterId/results?delivery={deliveryId}` | View 2 footer link |
| Back link | `[← Sent]` | Top-left on overview page |

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd (original P700) | Grid visualization under-specified for small N | Deferred to /ux; /ascii-flows then reopened the design | Low respondent counts made the grid's complexity hard to justify |
| 2 | /ascii-flows (30 variants) | "Paired Grid Board" hybrid won the scoring — CLAIM+ANTI side-by-side, person filter chips, table below | Captured but not adopted — see decision #3 | Grid still optimal for workshop projection, but not for 1-5 respondent reading |
| 3 | founder directive (KISS, post-ascii) | Grid/dots add chrome without information at 1-5 respondents; facilitator's real jobs are "pick who to verify" and "see one person's full picture" | Reject grids in MVP; two selectors drive three text-list views (cohort-on-story, person-across-stories, zoom) | Fast to ship, easy to read, zero viz debt. Grid remains open as a later enhancement |
| 4 | founder directive | Full aggregate (all stories × all people at once) has no facilitator job | Non-goal; landing always pre-selects first story | Everything-at-once is noise without focus |
| 5 | founder directive | Means and averaged values destroy polarisation signal | Display raw per-recipient values only; no means anywhere | P581 lesson: bimodal distributions must stay visible |
| 6 | P746 (rejected, folded here) | Sent-tab cards default to expanded — noisy on load | Default collapsed on mount and reload; session-ephemeral expansion | Author picks a letter before scanning its contents |
| 7 | P746 (rejected, folded here) | `[Open overview]` CTA placement | Desktop: solid blue Button rightmost before `[···]`, matching drafts-tab `Prepare Letter`. Mobile: top item in `[···]` dropdown | Reuse existing mental model; zero new affordance |
| 8 | P746 (rejected, folded here) | Need to jump from aggregate to a specific recipient's specific story | View 1 row / View 3 link deep-links to `/letter/:id/results?delivery={deliveryId}&story={storyId}` | Removes the "open recipient → scroll to story" friction |
| 9 | founder directive | Anonymous identity pending P747 | Keep `receiver_name \|\| receiver_email \|\| 'Anonymous'` fallback | P747 owns identity; no interim scheme |
| 10 | /challenge-prd | Aggregator RPC signature under-specified | Deferred to /architect — extend or wrap `get_letter_results`; enforce author scoping inside the function | Architect is the right layer for RPC shape + security |

## Technical Architecture

### Technical Analysis

**`get_letter_results(p_letter_id UUID, p_delivery_id UUID DEFAULT NULL)`** — SECURITY DEFINER RPC, current signature as of P725. Returns a **single row** per call: `perspective`, `sender_profile` (JSONB), `receiver_profile` (JSONB), `snapshots`, `predictions`, `ratings`, `point_responses`. Granted to `authenticated` only. Auth logic: caller is either the sender or the verified receiver of one specific delivery. Critical limitation for P700: it is shaped for one delivery at a time — when called by the sender without `p_delivery_id`, `ratings` and `point_responses` are empty. It cannot return multi-delivery cohort data in one call. This makes extension non-viable; see AD1.

**`/live` understanding data**: `story_verifications` rows with `source='live'` hold `speaker_rating` (author-given) and `listener_rating` (receiver self-rating). The P699 RPC only queries `source='letter'` verifications. P700 needs `source='live'` data for the `X → Y` understanding movement. This adds a second query path to any new aggregator.

**`letters-service.ts` — `getLetterResults()`** (`src/app/data/letters-service.ts` line 1191): typed client wrapper around the existing RPC. Returns `LetterResultsData`. P700 needs a separate service function returning a different shape.

**`LetterCard` in `sent-tab.tsx`** (`src/app/components/letters/sent-tab.tsx`): `const [isExpanded, setIsExpanded] = useState(true)` (line 131). Currently **expands on mount**. P700 requires collapsed-by-default — a one-line change to `useState(false)`. Note: P725 comment at line 130 justified the current `true` ("expand cards by default so recipient identity surfaces without an extra tap"). P700 Resolved Decision #6 explicitly overrides this.

**`[Results]` button pattern in `sent-tab.tsx`**: Desktop solid-blue Button (lines 267-275): `hidden sm:inline-flex bg-blue-500 hover:bg-blue-600 text-white min-h-[44px]`. Mobile Results is in the `[···]` dropdown (line 252-263, `className="sm:hidden"`). P700's `[Open overview]` CTA follows this exact pattern, placed in the same actions `<div>` rightmost before `<DropdownMenuTrigger>`. The drafts-tab `Prepare Letter` button (`drafts-tab.tsx` lines 213-222) uses identical classes — this is the spec's stated visual reference. No new chrome needed.

**Route pattern** (`src/App.tsx` line 656-666): `/letter/:id/results` wrapped in `<ClarityLandingLayout>` (no chromeFree). P700's route `/letter/:letterId/overview` follows the same pattern. Ordering constraint: must be declared before the generic `/letter/:id` route.

**Author guard pattern** (`letter-results-page.tsx` line 110-115): `useAuth()` redirect for unauthenticated, then RPC NULL return for non-author mapped to `'not-found'` state. P700 follows the same two-layer pattern.

**`letter_deliveries` table**: relevant columns — `id`, `letter_id`, `receiver_profile_id`, `receiver_email`, `receiver_name`, `receiver_slug` (P725), `status`, `completed_at`, `steps_completed`, `total_steps`. No `/live` session FK on deliveries; the link is via `clarity_sessions.source_letter_id + target_listener_id`.

**`story_verifications` for `/live` movement**: rows with `source='live'`, `speaker_id = sender_id`, `listener_id = receiver_profile_id` represent post-/live understanding. `speaker_rating` = author's rating (0-10). These are the values for `X → Y` understanding display.

**Position movement data gap**: `/live` point positions live in `clarity_live_turns` or `point_positions` — authoritative source not confirmed without reading P703 migration. See AD5 for MVP decision to defer `/live` position movement.

**Reuse inventory (existing assets applicable to P700):**

| Asset | File | Reuse plan |
|-------|------|-----------|
| `LetterCard` | `sent-tab.tsx` | Modify: collapsed default + `[Open overview]` CTA |
| `getLetterResults()` | `letters-service.ts` | Not reused — different data shape required |
| `get_letter_results` RPC | Migration | Not extended — shape mismatch (see AD1) |
| `ClarityLandingLayout` | `layouts/clarity-landing-layout.tsx` | Reuse as-is for overview page wrapper |
| `useAuth()` + redirect pattern | `letter-results-page.tsx` | Reuse auth gate pattern verbatim |
| `DropdownMenuItem` pattern | `sent-tab.tsx` | Reuse for mobile `Open overview` menu item |
| Solid blue `Button` pattern | `drafts-tab.tsx` / `sent-tab.tsx` | Reuse classes for desktop `[Open overview]` |

---

### Architecture Decisions

**AD1: New `get_letter_overview` RPC — not an extension or wrapper of `get_letter_results`**

- **Chosen:** New SECURITY DEFINER function `get_letter_overview(p_letter_id UUID)` returning one row per delivery with per-story and per-point data aggregated across all recipients.
- **Rationale:** `get_letter_results` is shaped for exactly one delivery. P700 needs all deliveries in a single round-trip. Extending the existing function would require changing its return type — a breaking change to a shipped, tested function with multiple call sites. Wrapping it in a loop (N calls for N deliveries) is an N+1 query antipattern. A dedicated function with the correct shape from the start is cheaper and safer.
- **Trade-off:** New migration file; higher initial cost than "add an overload." Accepted — the alternative incurs technical debt requiring unwinding once N deliveries > 1.
- **Alternative rejected:** `get_letter_results` extended to return multi-delivery data. Would silently break the receiver code path that depends on the existing single-row return shape and the P699 E2E test suite.

**AD2: Return shape — one row per delivery, per-story/point data as JSONB arrays**

- **Chosen:** RPC returns one row per `delivery_id` with JSONB fields: `delivery` (id, `display_name` computed via `COALESCE(p.name, ld.receiver_email, 'Anonymous')`, receiver_slug, status, completed_at — **no raw `receiver_email`** per Security Review); `story_data` JSONB array ({story_id, position, letter_rating nullable, live_rating nullable}); `point_data` JSONB array ({point_id, story_id, letter_position nullable}).
- **Rationale:** The client side needs to pivot across three views. A flat row-per-delivery shape is the most flexible — the TypeScript layer handles the pivot, not SQL. This mirrors the P699 pattern of returning JSONB arrays that the service layer maps into typed objects.
- **Trade-off:** Client-side pivot logic is non-trivial (group by story_id for View 1, already grouped by delivery for View 2). Acceptable — pure data transformation with no side effects.
- **Alternative rejected:** Three separate JSONB arrays (one per view shape) from the RPC. Pre-bakes view logic into SQL, making it harder to extend.

**AD3: Include `source='live'` verifications for understanding movement**

- **Chosen:** `get_letter_overview` queries `story_verifications` for both `source='letter'` (letter understanding baseline) and `source='live'` (post-/live understanding) for each (sender, receiver, story) triple. Returns `letter_rating` and `live_rating` (nullable) per story row.
- **Rationale:** Understanding movement (`X → Y`) is a first-class display requirement (Done-When items 12-13). The data is in `story_verifications` and accessible SECURITY DEFINER. Excluding it would require a follow-up migration.
- **Trade-off:** Two passes on `story_verifications` per delivery (once per source). At 1-5 recipients × 1-5 stories, negligible query overhead.
- **Alternative rejected:** Client-side second fetch for `/live` data. Doubles round-trips; defeats the purpose of a single aggregator.

**AD4: Author scoping — RPC-internal `auth.uid() = clarity_letters.sender_id` check**

- **Chosen:** First step of `get_letter_overview` validates `auth.uid() = cl.sender_id AND cl.status = 'sealed'`. Returns 0 rows on failure (RETURN with no RETURN QUERY). Granted to `authenticated` only. No `anon` grant.
- **Rationale:** Matches the established pattern from `get_letter_results`. SECURITY DEFINER bypasses RLS so the explicit guard is mandatory. Zero-rows return (not exception) prevents existence leakage.
- **Trade-off:** Author-only: no receiver can call this RPC. Correct — this page is author-only per spec.
- **Alternative rejected:** Client-side author check before calling the RPC. Bypassable; RPC-internal enforcement is authoritative.

**AD5: `/live` point position movement — deferred from MVP RPC**

- **Chosen:** `get_letter_overview` returns `letter_position` per point per delivery. It does NOT return `/live` positions in MVP. The `→ moved` display for position (Done-When item 12) renders single values only when `live_position` is null. A `[DEFER: P700 /live positions]` comment in the migration documents where to add it.
- **Rationale:** `/live` point positions live in `clarity_live_turns` or `point_positions` — the authoritative source is not confirmed without reading P703 schema additions in detail. Adding an unverified JOIN risks silent wrong data. The spec's UX Notes explicitly cover this case: "No /live data anywhere — the page renders normally. Movement arrows never appear." This is a valid degraded state, not an error.
- **Trade-off:** The position movement arrow feature requires a migration addendum once the P703 live-position query path is confirmed.
- **Alternative rejected:** Including `/live` positions now via an unverified query. Would risk incorrect data.

**AD6: Client-side view switching — React state, not URL-synced**

- **Chosen:** `LetterOverviewPage` holds `selectedStoryId: string | null` and `selectedDeliveryId: string | null` in `useState`. Selector changes trigger immediate re-render. No URL query params for selector state.
- **Rationale:** The spec says "Changing either selector updates the view without a navigation transition." URL-synced state adds URL mutation on every dropdown change — unnecessary complexity when data is already loaded and the three views are pure derivations of selector state. The spec does not require deep-linkable selector state.
- **Trade-off:** Refreshing the page resets selectors to landing state (Story = first story, Person = none). Acceptable per spec.
- **Alternative rejected:** URL params `?story=&person=`. Adds `useSearchParams` mutation on every dropdown change and complicates back navigation without product benefit.

**AD7: Sent-tab card collapsed state — `useState(false)`, no persistence**

- **Chosen:** Change `LetterCard`'s `useState(true)` to `useState(false)` for `isExpanded`. Session-ephemeral: once expanded, stays expanded until page reload. No localStorage, no server state.
- **UX override:** UX said (via P725) cards default expanded. P700 Resolved Decision #6 explicitly changes this to collapsed. This decision implements that one-line change. P725 is in `features/done/` — no spec update needed; the P700 spec documents the override.
- **Trade-off:** Authors with one or two sent letters may find collapsed-by-default marginally less convenient. Accepted — the sent tab's primary use case is now "pick a letter to open its overview."
- **Alternative rejected:** localStorage per-letter expanded state. Adds code and persistence that the spec explicitly rejects.

---

### Security Review

**RLS Policies:**
- ✅ All five relevant tables (`clarity_letters`, `letter_deliveries`, `letter_point_responses`, `story_verifications`, `letter_story_snapshots`) have RLS enabled. Policies remain the backstop for direct-table access; SECURITY DEFINER bypasses them by design. The new `get_letter_overview` RPC's internal auth gate is the authoritative boundary.
- ✅ Read-only feature — no `WITH CHECK` concerns, no new write paths.

**Authentication:**
- ✅ RPC granted to `authenticated` only (never `anon`) — matches `get_letter_results` precedent. Prevents anonymous existence-probing of letter IDs.
- ⚠️ **Client-side route guard required.** `/letter/:letterId/overview` page must mirror `letter-results-page.tsx`: `useAuth()` redirect for unauthenticated users; RPC `null`/empty return mapped to a not-found or redirect state. Defence-in-depth — the RPC is the real boundary. See Build Sequence Step 4.

**Authorization:**
- ✅ Author-only: RPC body enforces `auth.uid() = cl.sender_id AND cl.status = 'sealed'` before emitting any row. SECURITY DEFINER precedent from P699.
- ⚠️ **Invariant: return 0 rows (never empty-shaped rows, never exception) on unauthorized or invalid input.** Prevents existence leakage via error messages or partial payloads. Addressed in AD4 and Build Sequence Step 1.
- ⚠️ **All delivery / rating / response / point sub-queries must filter by `letter_id = p_letter_id`** after the ownership gate. No path where iterating deliveries could pull rows from another letter. Addressed in Build Sequence Step 1.

**Input Validation:**
- ✅ `p_letter_id` is typed `UUID` — format validated at the DB layer (malformed input rejected before the function body runs).
- ✅ Story and Person selectors are populated entirely from the RPC response; users cannot inject IDs that were not already returned for this letter.
- ✅ Deep-link drill-in URLs (`?delivery=…&story=…`) are re-authorized by P699's `get_letter_results` on the target page. P700 does not trust these params for any authorization decision.
- ✅ Parameterized queries throughout — no string interpolation into SQL.

**Data Protection:**
- ⚠️ **`receiver_email` must NOT be returned as a raw field.** `get_letter_results` deliberately omits it; P700 must follow the same PII-minimization precedent. Compute `display_name` inside the RPC via `COALESCE(p.name, ld.receiver_email, 'Anonymous')` and return only the computed string. The author already knows the emails they addressed the letter to — adding them to the API response only exposes PII in browser dev tools. Addressed in AD2 and Build Sequence Step 1.
- ✅ Anonymous recipient handling: `(Anonymous)` fallback kicks in when both `receiver_name` and `receiver_email` are null. P747 will own opt-out identity — no interim scheme.
- ✅ No cross-letter contamination: the `letter_id = p_letter_id` filter in every sub-query plus `auth.uid() = sender_id` isolates the payload.
- ✅ No new PII surfaces — recipient emails, when present, never leave the server.

---

### Implementation Approach

**Worktree recommended:** New route + new migration + multiple component edits across 5 files; keeping off `main` avoids contaminating the branch with in-progress work and is the default for P-number features.

#### Build Sequence

1. **Migration: `get_letter_overview` RPC** — New SECURITY DEFINER function. Author-only gate (`auth.uid() = cl.sender_id AND cl.status = 'sealed'`) runs first; on failure returns 0 rows (no exception, no empty-shaped row). Every sub-query for deliveries, ratings, responses, and points filters by `letter_id = p_letter_id` — no cross-letter contamination path. Returns one row per delivery: `delivery` JSONB (id, `display_name` computed inside RPC via `COALESCE(p.name, ld.receiver_email, 'Anonymous')` — **never emit raw `receiver_email`**, receiver_slug, status, completed_at), `story_data` JSONB array (story_id, position, letter_rating, live_rating), `point_data` JSONB array (point_id, story_id, letter_position). Granted to `authenticated` only (never `anon`). See AD1, AD2, AD4, AD5.

2. **Types + service function** — Add `LetterOverviewData`, `OverviewDelivery`, `OverviewStoryRow`, `OverviewPointRow` to `src/app/types/index.ts`. Add `getLetterOverview(letterId: string): Promise<LetterOverviewData[] | null>` to `src/app/data/letters-service.ts` wrapping the new RPC.

3. **Sent-tab card changes** — In `src/app/components/letters/sent-tab.tsx`: (a) `useState(false)` for `isExpanded`; (b) add `[Open overview]` desktop Button (solid blue, `hidden sm:inline-flex`, placed rightmost in actions `<div>` before `<DropdownMenuTrigger>`); (c) add `Open overview` as top `DropdownMenuItem` in `[···]` (mobile-visible). Navigation target: `/letter/${letter.id}/overview`.

4. **New overview page** — `src/app/pages/letter-overview-page.tsx`. `useAuth()` redirect for unauthenticated. Calls `getLetterOverview(letterId)`. Manages `selectedStoryId` + `selectedDeliveryId` state. Landing: `selectedStoryId = first snapshot story_id`, `selectedDeliveryId = null`. Renders `[← Sent]` back link, letter title, two selectors, three view components (View 1: cohort list for selected story; View 2: person across all stories; View 3: zoom card). Loading: `ClarityPageLoader`. Null result → navigate to `/letters?tab=sent`.

5. **Route registration** — `src/App.tsx`: lazy import `LetterOverviewPage`, add `/letter/:letterId/overview` route with `<ClarityLandingLayout>` before the `/letter/:id` generic route.

#### Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/YYYYMMDDHHMMSS_p700_get_letter_overview.sql` | `get_letter_overview` SECURITY DEFINER RPC |
| `src/app/pages/letter-overview-page.tsx` | `/letter/:letterId/overview` page with selector state and three views |

#### Files to Modify

| File | Change |
|------|--------|
| `src/app/data/letters-service.ts` | Add `getLetterOverview()` service function |
| `src/app/types/index.ts` | Add `LetterOverviewData`, `OverviewDelivery`, `OverviewStoryRow`, `OverviewPointRow` |
| `src/app/components/letters/sent-tab.tsx` | `useState(false)` for expand; add `[Open overview]` desktop Button; add `Open overview` top DropdownMenuItem |
| `src/App.tsx` | Lazy import + `/letter/:letterId/overview` route before `/letter/:id` |

## Component Strategy

### Component Inventory (Summary)

**Design system primitives available (`src/components/ui/`):**
`Button`, `DropdownMenu` + `DropdownMenuTrigger/Content/Item`, `Tooltip` + `TooltipProvider/Trigger/Content`, `ScrollArea`, `Dialog`, `Accordion`, `Tabs`, `ClarityLoader` / `ClarityPageLoader`, `PersonAvatar` / `GravatarAvatar`, `EarBadge`, `UnderstoodBadge`

**Feature components relevant to P700 (`src/app/components/letters/`):**
`LetterCard` (in `sent-tab.tsx`), `RecipientRow` (in `sent-tab.tsx`), `LetterParticipantRow`, `StoryWalk`, `ClarityLandingLayout`

**Shared components relevant to P700:**
`PositionBadge` (`src/app/components/shared/PositionBadge.tsx`), `FilterTabs`, `FixedBottomBar`, `FocusHeader`

**No shadcn `Select` component exists** — the project uses `DropdownMenu` for all selection UI. This drives the selector implementation choice (see Component Map).

---

### Component Map

| Element | Classification | File / Notes | Decision needed? |
|---------|---------------|--------------|-----------------|
| `[Open overview]` desktop Button | **Reuse** | `src/components/ui/button.tsx` — `size="sm"` · `className="hidden sm:inline-flex bg-blue-500 hover:bg-blue-600 text-white min-h-[44px]"` — verbatim match to `Results` button in `sent-tab.tsx` lines 267–275 and `Prepare Letter` in `drafts-tab.tsx` lines 213–222 | No |
| `Open overview` mobile dropdown item | **Reuse** | `DropdownMenuItem` in `sent-tab.tsx` — add as top item in existing `[···]` menu. Pattern: line 252–263 in `sent-tab.tsx` | No |
| `LetterCard` collapsed default | **Extend** | `src/app/components/letters/sent-tab.tsx` line 131 — change `useState(true)` → `useState(false)`. One-line change; no new prop needed | No |
| Page wrapper / layout | **Reuse** | `ClarityLandingLayout` from `src/app/layouts/clarity-landing-layout.tsx` — same as `letter-results-page.tsx`. No `chromeFree` or `compact` needed for overview | No |
| `[← Sent]` back link | **Reuse** | `Link` from `react-router-dom` — styled as `text-sm text-muted-foreground hover:text-foreground flex items-center gap-1` with a `←` glyph or `ChevronLeft` icon. Matches back-link pattern used in `letter-results-page.tsx` | No |
| Story selector (`Story: [Story 1 ▼]`) | **New** | No shadcn `Select` in project; DropdownMenu is the existing pattern. Build `StorySelector` as a thin wrapper around `DropdownMenu` + `DropdownMenuTrigger/Content/Item`. File: `src/app/pages/letter-overview-page.tsx` (co-located as module-level helper — too small to extract). Add `aria-label="Select story"` on trigger | No |
| Person selector (`Person: [— none — ▼]`) | **New** | Same pattern as StorySelector above. `PersonSelector` co-located in the same page file. Add `aria-label="Select person"` on trigger | No |
| View 1 — Cohort list container | **New** | `OverviewCohortList` component. `aria-live="polite"` region wrapping the list. File: `src/app/pages/letter-overview-page.tsx` (page-local; no reuse elsewhere yet) | No |
| View 1 — Recipient row | **New** | `CohortRow` — replaces `RecipientRow` from `sent-tab.tsx` (different data shape: Und + CLAIM + ANTI + status + drill-in). Co-located in page file initially. **Not an extension of `RecipientRow`** — that component has no concept of positions or understanding values | No |
| Understanding display (`X` or `X → Y`) | **New** | `UnderstandingDisplay` — renders integer value(s) with movement arrow when live data present. Inline `<span>` with `aria-hidden="true"` on `→` glyph + sr-only text. Co-located in page file | No |
| Position display (`+2 agree`, `◌ no position`) | **Extend** | `PositionBadge` at `src/app/components/shared/PositionBadge.tsx` does not support the signed numeric format (`+2 agree`, `−1 somewhat disagree`) or the `◌ no position` hollow circle state. Extend: add a `format="signed-label"` prop rendering `{sign}{value} {label}` text; add `noPosition` boolean prop rendering `◌ no position` in `text-muted-foreground`. Alternative: inline helper in the page file (simpler if only used here). **Decision needed:** extract to PositionBadge or inline? | Yes — inline vs. extend PositionBadge |
| Status glyph (`★ Verified`, `→ Moved`, `· Waiting`) | **New** | `StatusGlyph` — renders decorative glyph + sr-only text equivalent per UX accessibility spec. Co-located in page file. Pure presentational, < 20 lines | No |
| Movement separator `→` (Understanding + Position) | **New** | Inline `<span aria-hidden="true">→</span>` + sr-only wrapper. No dedicated component needed — implemented inline within `UnderstandingDisplay` and position display | No |
| View 2 — Person journey list | **New** | `OverviewPersonJourney` component. Per-story sections: story title, understanding line, CLAIM/ANTI lines. `[Open {name}'s full results →]` link at bottom. Co-located in page file | No |
| View 3 — Zoom card | **New** | `OverviewZoomCard` component. Single card (`rounded-lg border bg-card`). Co-located in page file | No |
| Loading skeleton | **New** | Inline skeleton rows using `bg-muted animate-pulse` classes — match View 1 row shape. No dedicated component; consistent with `feed-skeleton.tsx` pattern in the project | No |
| Error state with retry | **New** | Inline `<div>` with `text-muted-foreground` message + `Button variant="outline" size="sm"` retry. Matches `SentTab` error state pattern (`sent-tab.tsx` lines 382–389) | No |
| Empty state (both selectors cleared) | **New** | Inline guidance message: `"Select a story or a person to explore."` with focus-ring highlight on both selector triggers. No separate component | No |
| Auth guard + redirect | **Reuse** | `useAuth()` + `navigate` pattern from `letter-results-page.tsx` lines 111–115 — verbatim | No |
| Page loader | **Reuse** | `ClarityPageLoader` from `src/components/ui/clarity-loader.tsx` — same usage as `letter-results-page.tsx` line 202 | No |

---

### Composition Tree

```
LetterOverviewPage                          [src/app/pages/letter-overview-page.tsx]
  state: selectedStoryId: string | null     [AD6 — client-side, not URL-synced]
  state: selectedDeliveryId: string | null
  state: pageState: 'loading' | 'error' | 'ready'
  state: overviewData: LetterOverviewData[] | null

  ├── ClarityPageLoader                     [loading state only]

  ├── [← Sent] Link                         [top-left; aria-label="Back to Sent tab"]

  ├── <h1> letter title                     [text-xl font-semibold text-foreground]

  ├── Selector row                           [flex gap-4 flex-col sm:flex-row]
  │     ├── StorySelector                   [DropdownMenu wrapper]
  │     │     ├── label: "Story"            [text-xs text-muted-foreground]
  │     │     ├── DropdownMenuTrigger       [aria-label="Select story"; shows current title or "— none —"]
  │     │     └── DropdownMenuContent
  │     │           ├── DropdownMenuItem "— none —"  [clears selectedStoryId]
  │     │           └── DropdownMenuItem × N stories [sets selectedStoryId]
  │     └── PersonSelector                  [DropdownMenu wrapper]
  │           ├── label: "Person"           [text-xs text-muted-foreground]
  │           ├── DropdownMenuTrigger       [aria-label="Select person"; shows name or "— none —"]
  │           └── DropdownMenuContent
  │                 ├── DropdownMenuItem "— none —"  [clears selectedDeliveryId]
  │                 └── DropdownMenuItem × N recipients [sets selectedDeliveryId]

  ├── <div aria-live="polite">              [list region; announces view changes]
  │
  │   [View 1: Story selected, Person cleared]
  │     ├── story subtitle                  [text-sm text-muted-foreground italic]
  │     └── CohortRow × N                  [one per delivery]
  │           ├── name                     [text-sm font-medium text-foreground]
  │           ├── UnderstandingDisplay     [text-sm text-muted-foreground]
  │           ├── position display (CLAIM) [signed label or ◌]
  │           ├── position display (ANTI)  [signed label or ◌ or — when absent]
  │           ├── StatusGlyph              [★/→/·  + sr-only text]
  │           └── [open →] Link            [to /letter/:id/results?delivery=…&story=…]
  │
  │   [View 2: Person selected, Story cleared]
  │     ├── person meta line               ["{Name} · Letter only / Verified"]
  │     ├── StorySection × N
  │     │     ├── story title              [text-sm font-medium]
  │     │     ├── UnderstandingDisplay     [Und X/10 → Y/10 or "Waiting for first completion"]
  │     │     ├── CLAIM line               [text-sm; omitted when no response]
  │     │     └── ANTI line                [text-sm; omitted when point absent or no response]
  │     └── [Open {name}'s full results →] Link [to /letter/:id/results?delivery=…]
  │
  │   [View 3: Both selected]
  │     └── OverviewZoomCard               [rounded-lg border bg-card p-4]
  │           ├── story title              [text-sm font-medium]
  │           ├── person name + status     [text-sm text-muted-foreground]
  │           ├── Understanding line       [UnderstandingDisplay]
  │           ├── CLAIM line
  │           ├── ANTI line
  │           └── [Open {name}'s full results →] Link
  │
  │   [Both cleared guidance]
  │     └── "Select a story or a person to explore." [text-sm text-muted-foreground text-center py-8]
  │
  │   [Error state]
  │     └── "Could not load results." + Button variant="outline" size="sm" [Retry]

  └── [Loading skeleton — View 1 shape]    [3 rows of bg-muted animate-pulse h-9 rounded]
```

---

### Visual Specification

Informed by Visual Context: **Dense-efficient** — author is scanning respondent data to decide who to verify next. Same card chrome and typography scale as P699 per-delivery results page. Opposite end of the density spectrum from pledge-signing (spacious/ceremonial).

**Visual hierarchy:**
- Primary: story title (View 1 subtitle above list) and recipient names in CohortRow — `text-sm font-medium text-foreground`
- Secondary: understanding + position values — `text-sm text-foreground` (readable numbers, not muted — they carry decision weight)
- Tertiary: status glyphs, `◌ no position`, `· Waiting`, movement label, column separators — `text-xs text-muted-foreground`
- Page title (letter name): `text-xl font-semibold text-foreground` — matches `letter-results-page.tsx` pattern
- Selector labels ("Story", "Person"): `text-xs font-medium text-muted-foreground uppercase tracking-wide`
- Selector trigger button: `text-sm text-foreground border border-input bg-background rounded-md px-3 py-1.5` — not a solid Button; matches input-like affordance pattern

**Emotional register: Dense-efficient (record-scanning)**
- Row padding: `py-1.5 px-3` — matches `RecipientRow` in `sent-tab.tsx` exactly
- Inter-row gap: none — rows touch, separated only by `border-t border-border/50` — table-like, no breathing room
- Section gap (View 2 story sections): `mt-3` between story sections — minimal but present for scanability
- No card background per row — CohortList sits on `bg-background`, no per-row card chrome (avoids "card soup")
- View 3 zoom card: `rounded-lg border bg-card p-4` — single card wrapping, matches existing card pattern used in `sent-tab.tsx` and `letter-results-page.tsx`
- Back link + page title: `pt-4 pb-3 px-4` — matches `letter-results-page.tsx` header zone spacing
- Selector zone: `px-4 pb-3` with selectors in `flex gap-3 flex-col sm:flex-row`
- List zone: `px-0` (full-bleed row tap targets on mobile) — rows use own `px-3`

**Negative constraints:**
- No per-row cards (no `rounded-lg border bg-card` per CohortRow) — this would create card soup and contradict the dense-efficient intent
- No loading spinner — use skeleton rows only (spec explicitly rejects spinner for a fast payload)
- No color-coded position values (no green/red for agree/disagree) — design system rule: only blue for actions/stances; muted-foreground for metadata
- No movement `→` as a Lucide icon — use the Unicode `→` character per the UI Contract (`Movement separator: →`)
- No `text-amber-*`, `text-orange-*`, `text-purple-*` per design system rules
- No `Accordion` or collapsible per-row chrome — rows are flat list items, not expandable

**Spacing per zone:**
- Page outer: `max-w-2xl mx-auto px-4` (wider than P699's `max-w-sm` — View 1 has multiple columns)
- Header zone (back link + title): `pt-4 pb-2`
- Selector zone: `pb-3`
- List region: no outer padding; rows own horizontal padding (`px-3`)
- View 3 card: `p-4` internal; no outer padding beyond list region
- Mobile stack: selectors become `flex-col w-full`; each selector trigger `w-full`

**Animation/transition:**
- No animation on view switch — the spec says "Changing either selector updates the view without a navigation transition." Immediate re-render, no fade.
- Skeleton uses Tailwind `animate-pulse` (already in project via `tailwindcss-animate` plugin) — purpose: prevent layout shift on first load only
- Hover transitions: `transition-colors` on CohortRow tap targets (matches `RecipientRow` pattern: `hover:bg-accent/30 transition-colors`)
- No other animations

**Implementation refinements:**
- CohortRow drill-in: entire row is a tap target on mobile (`role="button" tabIndex={0}`) matching `RecipientRow` pattern in `sent-tab.tsx` lines 82–90
- Focus ring: `focus-visible:ring-1 focus-visible:ring-ring` — inherited from Button base class; explicitly add to custom row interactive elements
- Border radius consistency: `rounded-md` on selector trigger; `rounded-lg` on View 3 card — matches existing convention (`LetterCard` uses `rounded-lg`)
- Muted text contrast: `--muted-foreground: 240 3.8% 46.1%` on white background (`--background: 0 0% 100%`) = approximately 4.6:1 — meets WCAG AA for `text-xs` at regular weight. Verify during `/verify` pass
- `◌` character (U+25CB) renders at `text-sm` in Inter at approximately 0.8em width — legible at 14px
- Movement arrow character `→` (U+2192) renders cleanly in Inter at all sizes used here

---

### Extraction Plan

No extraction needed — no duplicated patterns in the files this feature touches.

The `StorySelector` and `PersonSelector` components are new thin wrappers (< 30 lines each) used only on this page. Co-locating them in `letter-overview-page.tsx` is correct at this scope. Extraction to `src/app/components/letters/` should be considered only if a second page needs the same selector pattern.

`CohortRow` has no counterpart in the existing codebase — `RecipientRow` in `sent-tab.tsx` has a different data contract (status + progress only, no positions or understanding). No extraction from `RecipientRow`; `CohortRow` is net-new.

`UnderstandingDisplay` and `StatusGlyph` are single-feature helpers; co-locate in the page file until a second consumer exists.

---

## Test Coverage Strategy

**Files generated:**
- `e2e/p700-letter-overview.spec.ts` — 22 E2E tests (2 describe blocks)
- `e2e/a11y/p700-letter-overview-accessibility.spec.ts` — 14 accessibility tests
- `features/uat/p700.md` — 22 UAT scenarios (UAT-1 through UAT-9)

**Test pyramid:**
```
       /\
      /  \   22 E2E
     /____\
    / 14 A11Y \
   /____________\
  (no unit / int)
```

**What's tested:**
- ✅ Landing state: Story pre-selected, Person = none → View 1 cohort list
- ✅ View 1 rows: understanding, CLAIM/ANTI positions, status glyphs (★ Verified, → Moved, · Waiting)
- ✅ Understanding movement (X → Y) — seeded via `source='live'` story_verifications
- ✅ `◌ no position` for un-responded ANTI points
- ✅ Story selector: lists options, switches list, clears to "— none —"
- ✅ View 2: person journey with story sections, footer link without story param
- ✅ View 3: zoom card with title, understanding, drill-in link
- ✅ Drill-in URL patterns: `?delivery=…&story=…` (Views 1/3) vs `?delivery=…` only (View 2)
- ✅ Both selectors cleared → guidance prompt "Select a story or a person to explore."
- ✅ Non-author authorization redirect/block
- ✅ Sent-tab cards collapsed by default (AD7)
- ✅ `[Open overview]` desktop button presence and navigation
- ✅ All-waiting edge case: own fixture, no values shown, no crash
- ✅ ARIA labels on both selectors (`aria-label="Select story"`, `aria-label="Select person"`)
- ✅ `aria-live="polite"` on list region
- ✅ `aria-label="Back to Sent tab"` on back link
- ✅ Keyboard: Tab/Enter/ArrowDown/Escape for both DropdownMenus
- ✅ Touch targets ≥ 40px for both selectors
- ✅ Row drill-in links keyboard-reachable

**What's NOT tested (rationale):**
- ❌ `/live` position movement (CLAIM X → Y): AD5 defers `/live` positions from MVP RPC — letter values only in MVP
- ❌ Anonymous recipient rendering `(Anonymous)`: RPC COALESCE logic server-side — covered by UAT-7.5 manual check
- ❌ Error state with retry: requires `page.route()` interception — covered by UAT-7.4 manual check
- ❌ Mobile column wrapping: CSS-level visual assertion — covered by UAT-9 and `/verify` pass
- ❌ axe-core automated scan: not in project's established a11y test pattern
