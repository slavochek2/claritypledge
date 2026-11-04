---
status: all-done
type: story
rank: 53
workstream: clarity-canvas
created_date: '2026-10-21'
tags: [canvas, agent, sales-mastermind, onboarding]
disclosure: public
pipeline_ran: [create-spec, dev, dev.2, dev.3]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
completed_at: 2026-11-04
---

# P1536: Clarity Canvas, first draft from the owner's own material

## Problem

**Situation:** The sales mastermind (`docs/goals.md` 3a) runs on each attendee's Clarity Canvas.
The canvas page is live (P1508), the nine-box set is being redesigned (P1535), and sharing a canvas
with an event is being built (P1515). The only way to get a canvas filled today is by hand: an agent
writes a markdown draft and `scripts/seed-p1508-canvas-drafts.mjs` loads it, on the test database
only.
**Complication:** Nobody wants to type their canvas, and nobody should start from a blank page
(brief decision 2026-10-14). goals.md 3a names "a small Clarity Chat step that turns each attendee's
material into a first canvas draft (to be specced)" as one of the three builds the event needs.
**Question:** How does an attendee give their agent whatever they already have about their offer
and get back a first canvas they recognise as theirs?

> Founder, 2026-10-21: "specs for material to first canvas draft, probably as done by agents, so you
> can upload stuff, appoint stuff, and then the agent does it for you. Maybe consumes markdowns, I
> guess. Well, consumes anything but practically converts to markdown and then consumes, or maybe
> links."

("appoint stuff" is read as *point to* stuff, i.e. links.)

## Appetite

Blast radius: one new flow, but it sends people's business material to an AI provider and writes
points into their account. Reversibility: medium (new edge function + one write function; drafts
are private rows that can be deleted). Decision density: a few founder calls (below).

## Design v6 (2026-10-29): authoritative

**This section is the current design.** Where anything below it (Solution, Versions, Box guide, Acceptance Criteria,
Cost Budget, Known limitations) conflicts, this section wins; those sections stay as the history of v1-v3, which is built
on this branch.

- It folds the founder's 2026-10-29 testing feedback and decisions D1-D19.
- It went through three hostile review rounds (Gemini 4 Argon and Codex each round): v4 → v5 → v6, with every finding
  answered in the review ledger at the end of §6. The fourth check, narrow and on the round-3 fixes only, is in the ledger.
- Evidence tags: **[code]** read at the cited file:line on 2026-10-29; **[hyp]** inference, not run.

**Model + effort for /dev:** S1 engine + migrations and S5 → Opus driver, high, Sonnet subagents build, Opus reviews;
S2 prompt text → Opus, high, real-model eval; S3, S4, S6 UI → Sonnet subagents under an Opus driver.

### 1. Decisions (founder, binding)

#### D1 — Send updates the draft
- Every owner message in a canvas thread is applied by one draft run. A message is text, a voice note once transcribed, or an upload once converted.
- There is no "Update draft" button and no "notes" concept.
- Run cap per draft: 5 → 30. The daily AI caps (D18) stay the real limit.

Supersedes:
- Solution, "Draft my canvas" as a separate action.
- Versions §5 "Update draft".
- §9 "Revisions per draft are capped" (5).
- the 2026-10-29 "notes + Update draft" research design.

#### D2 — A run changes only the boxes the message is about
- With tags (D5): exactly the tagged boxes.
- Without tags: the boxes the model names as addressed, enforced by the server.
- Every other box keeps its exact points (same point ids).
- A first draft (draft has no points and no base) and "Make it about <group>" cover all nine boxes.

Supersedes:
- Solution step 4 "Re-running before Publish replaces the draft's points".
- §8 "each revision replaces the draft's points".

#### D3 — Two concepts: talk and Publish
- **Talk** changes the private draft. **Publish** makes it visible to readers.
- Publish has one fixed spot in a sticky top bar, the same on phone and desktop and in both Canvas and Chat views.
- It never leaves the screen. When it cannot run, a status takes its place (§2).
- **Design rule:**
  - A button's look changes only when its meaning changes.
  - Typing changes only the composer's send slot.
  - Publish is filled and may sit beside a filled Send.
  - Copy prompt keeps one look always.

Supersedes:
- The P955 "ladder" in the canvas thread: `CanvasCreateBar`, `CanvasDraftCard` composing, and `openerIsPrimary` (`src/app/pages/chat/canvas-items.ts`) [code].

#### D4 — Workspace layout
- **≥1280px:** canvas left, chat right, on one screen.
- **Narrower:** one screen with a `Canvas │ Chat` switch. Both panes stay mounted (CSS-hidden), so scroll, caret and unsent text survive a switch.
- BottomNav and the event strip are hidden on this screen.
- Fixes:
  - the empty band above the thread;
  - the phone name squeeze (no buttons in the byline row);
  - grid columns follow container width.

Supersedes:
- The "Revise in chat" link to `/chats/...`.
- The pane gate that needs `?thread=`.

#### D5 — Add to chat on every box
- Owner only, on draft and published versions. Chat icon + label.
- Inserts an inline reference tag at the caret; several tags per message are allowed.
- On a published canvas it opens the workspace. The next draft is created by the first Send, upload or voice note, never by the tap.
- A draft already open from a different base, which has at least one message, asks **Add to my draft / Start over from vN**.
- The words "New version" leave the UI.

Supersedes:
- Versions §2 "Start a new version?".
- §9 paperclip-with-open-draft question.
- `canvas-new-version-button.tsx`.

#### D6 — Changed marker
- After a run, a box whose point set differs from the base version's shows **Changed** (owner, draft only).
- This is computed, not stored (§2).
- No base (first canvas): never any markers.

#### D7 — Undo
- Undo after each run restores the draft's state before that run.
- Repeated taps walk back run by run. There is no redo.
- An undone run's instruction no longer counts as material (§2).

Supersedes:
- §8 "Revising or discarding deletes only the points that draft created". That now happens at Publish or Discard only.

#### D8 — Version origin
- Versions are numbered in order and show their origin **to everyone**: `v3 · 29 Oct · from v1`.
- The owner never names a version.

#### D9 — One canvas = one sale loop
- Groups share a canvas only if they are roles in one sale, or one segment described twice.
- Old pivots go to Hypotheses I've falsified.
- Non-customer actors never make a segment.
- Focus order:
  1. the owner's newest stated focus;
  2. a group that has paid;
  3. the group most boxes can be filled for;
  4. the narrower group.
- On an existing canvas the current focus stays.
- Codex blind-labelled the 21 rows of [`features/research/one-canvas-cases-for-p1536.md`](../../research/one-canvas-cases-for-p1536.md): 21/21 agreement.

#### D10 — Mixed material
- Draft one canvas, with no question round.
- The reply's first line names what was found and what was chosen, followed by **[Make it about agencies]** and **[Start an agencies canvas]**.

#### D11 — Copy prompt
- Produces ONE markdown file.
- Several businesses → one section per canvas, each starting "This canvas is about <group>."
- Carries the full box definitions.

#### D12 — Box definitions rewritten (§4)

#### D13 — Shortest possible reply
- The mirror's reply is as short as possible, visual over text.
- No "What I decided on my own".
- Empty-box questions are not repeated in chat.

#### D14 — Naming the agent
- "Your mirror agent" in canvas surfaces, never a fixed name.

#### D15 — One update at a time (2026-10-29)
- While a run is in flight, or an upload or voice note is being converted, the owner can type.
- **Send, upload, voice, Undo and Publish wait.** Each is replaced by a status in its own spot, never disabled.
- One message ⇒ one run. Runs never batch messages.
- One active run per owner: while one canvas updates, another canvas's Send shows "Another of your canvases is updating."

Supersedes:
- v4 coalescing, "messages sent during a run chain the next run", and S1.2.

#### D16 — The second canvas (2026-10-29)
- **[Start an agencies canvas]** works from the moment the reply shows it.
- **Publish is a single action**, never bundled with it.
- After Publish, the publish reply repeats the offer.
- While an offer is open, the draft's extracted material is kept privately for **at most 30 days after Publish**. It is deleted:
  - when every offer is started or dismissed;
  - or at 30 days;
  - or when the canvas or account is deleted.
- After expiry, each offer's buttons are replaced by "Send the material again to start this canvas."

Supersedes:
- v4 J10 (Artifacts menu entry).
- F3.
- "only before first publish".

#### D17 — Deletion is said, once (2026-10-29)
- The publish reply says what happened to the material:
  - deleted now;
  - or kept until the offer closes, at most 30 days.
- Long-term retention for every canvas is a separate future spec: INBOX-239.

#### D18 — Daily caps, permanent (2026-10-29)

| Cap | From | To |
|---|---|---|
| Per person, canvas | 20 runs / $3 a day | **60 runs / $6 a day** |
| Shared canvas bucket | $15 a day | **$45 a day** |
| Shared total | $50 a day | $50 a day (unchanged) |

- Chat replies keep their own $5.
- Caps are daily, reset at 00:00 UTC.
- Google's monthly cap on the production key stays the outer fence. /dev reads its amount and records it here (§8).

#### D19 — Publish never offers a combined choice
- A screen offers no "X + Y" compound action.
- Each decision gets its own button, at the moment it is relevant.

#### D20 — The owner marks their own stance on draft points (2026-10-30)
- A point the AI writes or rewords starts with no stance. The owner marks it before Publish, or publishes it unmarked.
- An unchanged point keeps its stance. A copied point carries the owner's stance from its source.
- A reworded box drops the old wording's stance without a notice; the box shows Changed again.
- Why: nothing goes out under the owner's name that they did not endorse (founder: "why should we prevent the user from doing something if there are no negatives?"). Needed by P1529's mid-session canvas update.
- S3 shows the stance control on draft points.

---

### 2. The model in one page

#### Workspace and thread
- **Workspace** = the owner's canvas screen with its chat.
  - Opened by: Artifacts "Open draft", the chat draft card's Open, Add to chat on any box, a new canvas, or a fork landing.
  - URL marker `?ws=1`. **S3 changes the shared predicate** `isBottomNavHiddenRoute(pathname, search)`
    (`src/app/components/layout/bottom-nav-routes.ts:15` [code]: it reads `search` but has no `ws` rule today), and checks
    that the event-strip consumer uses the same predicate.
- **←** goes to `location.state.from` when present. Otherwise:
  - published canvas → its canvas page;
  - draft-only canvas → Artifacts.

  This also applies to direct entry and reload.
- **Thread** = one per draft (unchanged).
- With no open draft, the chat pane shows the newest closed thread ending in its publish reply.
  - Its composer is live: the first Send, upload or voice note opens the next draft from the version on screen.
  - Its offers render from `get_canvas_draft_state(p_canvas)`, which returns the open draft and the newest closed draft's
    offers with `material_expired`. Never from message text.

#### Words used below
- **run**: one `canvas_draft_runs` row. Kinds:
  - `message` (triggered by an owner message);
  - `focus` (a focus switch);
  - `fork_first` (a fork's first draft).
- **used run**: a run that reached the model and finished, `done` or `undone`. It counts toward the cap of 30.
- **applied run**: `done` only. Undo walks applied runs, newest first.
- **active run**: `queued` or `running`, inside its lease (queued 3 min, running 5 min; `c_dead`, runs migration `:286` [code]).
  - **One active run per owner** (the existing unique index on `owner_id`, versions migration `:257` [code], kept).
  - So two canvases never update at once. A second canvas's Send gets `busy_elsewhere`: "Another of your canvases is updating."

#### Lifecycle: one lock protocol, one transition table
Every RPC below takes, in order:
1. the per-owner advisory lock (existing);
2. the draft row;
3. the run row.

**First step under the lock: expire.** Any active run past its lease is failed with the existing dead-run settlement
(runs `:308-315` [code]), and its trigger message shows **[Try again]**. So a stale run never blocks anything, and no client
round trip is needed. `get_canvas_draft_state` does the same.

The same step also fails at once, with no model call and no charge, any queued run whose voice trigger message has `transcript_status = 'failed'`. The client also invokes begin on that change, and begin fails the run the same way, so a failed transcript never waits for the lease.

| Caller | Allowed when | Refuses with | Effect |
|---|---|---|---|
| `canvas_workspace_send` (text, upload, voice) | no active run for the owner; draft open or creatable; `p_expected_revision` matches | `busy`, `busy_elsewhere`, `cap_reached`, `stale_view` | message + `queued` run of kind `message` (+ draft open/replace) |
| `canvas_draft_retry(p_draft, p_failed_run, p_expected_revision, p_client_id)` | the run is the draft's newest and `failed`; idle; not at cap | `busy`, `busy_elsewhere`, `cap_reached`, `stale_view`, `not_retryable` | new `queued` run copying the failed run's kind, trigger message, scope and target offer. **An upload whose material was never written** (extraction failed, or the client left before posting the file): `not_retryable`; its bubble reads "Send the file again." An upload whose material was written and whose drafting failed retries normally: the row's `message_id` is the trigger message, so the selector includes it. |
| `canvas_draft_switch_focus(p_draft, p_offer, p_expected_revision, p_client_id)` | idle; offer `offered` | `busy`, `busy_elsewhere`, `cap_reached`, `stale_view`, `not_offered` | `queued` run of kind `focus`, `target_offer_id` on the RUN (the draft is untouched until complete) |
| `canvas_draft_fork(p_draft, p_offer, p_expected_revision, p_client_id)` | source idle or closed; offer `offered`; `material_until` not passed | `busy`, `busy_elsewhere`, `stale_view`, `expired`, `not_offered` | new canvas + draft + thread + `queued` `fork_first` run, offer `started` |
| `canvas_draft_offer_dismiss(p_draft, p_offer, p_expected_revision)` | idle (no active run for the owner); offer `offered` (a repeat on a dismissed offer returns ok, writes nothing) | `busy`, `busy_elsewhere`, `stale_view` | offer `dismissed`, revision +1, material rule (§ Retention) |
| `canvas_draft_undo(p_draft, p_expected_run, p_expected_revision)` | idle; `p_expected_run` = newest applied run | `busy`, `stale_view` | restore its step; run → `undone` |
| `canvas_draft_publish(p_draft, p_expected_revision)` | idle; `has_points`; `differs_from_base` | `busy`, `stale_view`, `draft_empty`, `no_changes` | publish; cleanup; publish reply |
| `canvas_draft_discard(p_draft, p_expected_revision)` | idle | `busy`, `stale_view` | discard; cleanup |
| `_canvas_draft_run_begin(p_run)` (worker) | the run is `queued` AND its input is ready: text at once; voice when transcript `done`; **upload when the invocation carries the file** (claim first, then extract) | `not_ready`, `gone` | `queued → running`, reserve spend; a second call on a running/terminal run returns its state and makes no model call |
| `_canvas_draft_add_material(p_run, …)` (worker, upload) | the run is `running` | `gone` | material row with `message_id`; a late write for a failed/expired run touches nothing (existing pattern, runs `:576-583` [code]) |
| `_canvas_draft_run_complete(p_run, …)` / `_fail` (worker) | the run is `running` | `gone` | settle; apply (complete) or fail; a late answer touches nothing |

- Every successful mutation increments `canvas_drafts.revision`.
- Every RPC that creates a run returns `{run_id, revision}`. Fork also returns `{canvas_id, draft_id, thread_root_id}`.
- The client invokes `canvas-draft` with that `run_id` right away.
- `p_client_id` makes Send, retry, focus and fork idempotent: a repeat returns the first result.

#### Inputs
| Input | How it enters | When the run may begin |
|---|---|---|
| Text | `canvas_workspace_send` | at once |
| Upload | `canvas_workspace_send(p_attachment {kind:'file', label})` creates the message and the run. The client then posts the file to `canvas-draft` with `run_id`. In that one invocation the function: (1) begins (claims `queued → running`, reserves spend); (2) extracts; (3) writes material via `_canvas_draft_add_material` (run is `running`, row gets `message_id`); (4) drafts with the selector, which now includes that row. This replaces today's separate upload handler (`supabase/functions/_shared/canvas-handlers.ts` `handleUpload`) for workspace uploads. | extraction failure fails the run in the same invocation (`unreadable`, `too_large`); no lease wait |
| Link | inside a text message, as today (`gatherLinks`, `supabase/functions/_shared/canvas-run.ts:113` [code]); material row gets `message_id` | at once |
| Voice | `canvas_workspace_send(p_attachment {kind:'voice', …})` calls P1576's voice insert (same helper as `send_voice_note`, so a canvas voice note has one write path) | when `transcript_status = 'done'`; the client invokes on that change, and begin returns `not_ready` before it. `failed` fails the run with no model call. |

#### Material and context for a run: one selector
`_canvas_draft_effective_input(p_draft, p_run)` is used by run begin AND by fork:
- owner messages (kind `message`, author = owner, voice via its transcript) whose current run is `done`, plus the trigger
  message;
- material rows whose `message_id` belongs to those messages;
- **seed rows** of this draft: rows a fork copied in (`origin = 'fork_seed'`, `message_id` null), always included, in every later run and in a further fork (copied again as seed rows);
- copied chats (forward/clarify) only in the draft's own thread, as today (runs `:362`, `:402` [code]); **never by fork**.

**Excluded everywhere:**
- messages whose current run is `undone` or `failed`;
- their material;
- **the mirror's replies to undone runs** (replies carry `run_id`; Undo rewrites the reply to "Undone.");
- every other mirror reply. Replies are never model context: the draft points are the state.

#### Run output and scope
Run output, in schema order: `focus`, `other_canvases`, `scope`, `actions`, `questions`, `note`.

| Run | Scope | Extra rule |
|---|---|---|
| `message`, tagged | exactly `box_refs` | model `scope` ignored |
| `message`, untagged | model `scope`, validated against `_canvas_box_tags()` | — |
| first draft (no points, no base) | all nine | — |
| `focus` | all nine | **customer-facing boxes are rebuilt**: before applying, every current point in the six customer-facing boxes (Customer Segments, Problem, Solution, Go-to-market strategy, Offers & Pricing, My next milestone) leaves the draft. `keep` is refused for them; only `new` and `reword` fill them. The founder-fit three (Guiding values, My current biggest challenge, Hypotheses I've falsified) follow the normal rules. |
| `fork_first` | all nine | focus fixed to the offer's group |

**Server enforcement in `_canvas_draft_run_complete`:**
- Source box (of the named point) and destination box must both be in scope. A cross-box move needs both.
- Anything else is dropped and counted.
- `questions` and `pending_links` are merged per box, and only for scoped boxes.
- **Empty scope** (no box addressed): nothing in the draft changes, including focus and offers. No step. The reply is
  "Nothing changed on the canvas." + `note` (3c wording; it was "No box changed."). It still counts as used.
  - **Exception: uploads (J9).** A run with `input_kind = 'file'` may persist its offers, and say J9's line, even with an empty scope. Typed and
    spoken input keep the rule above. The run still changes no point, question, link or focus, and makes no step, so there is nothing to Undo
    for it and its offers stay dismissable (a later Undo of an earlier run does not touch them). The merge rules, the focus check, the cap of 3 open
    offers and the names filter apply as for any run. The J9 line ("Your new file is also about A. This canvas stays about F.") is built by the
    database from the offers it actually inserted and the current focus, so the reply matches durable state; the engine's own reply for such a
    run carries no J9 line.
  - **Decided 2026-11-03 by Gemini Argon and Codex, for the founder at UAT.** Why: a real-model measurement found the model names the other group
    in 10 of 10 uploads about another business (and in 0 of 10 about the same group or a helper), yet 13 of 20 such runs had an empty scope because
    the file added nothing to this canvas, so J9's offer row was lost exactly when it mattered.
  - **Failure mode:** a noisy file can leave a misleading offer. The owner dismisses it.
- **Focus:**
  - Stored only after the names filter; a failing focus is replaced by the previous focus, or by null.
  - Changes only in a `focus` run (from the run's `target_offer_id`) and in the first draft.
  - A `message` run never changes focus (D9: the current focus stays).

#### Offers: a durable relation, never a snapshot
`canvas_draft_offers(id uuid, draft_id, group_label, why, state offered|focused|started|dismissed, started_canvas_id, created_run_id, created_at)`,
closed to clients except through `get_canvas_draft_state`.
- A run's `other_canvases` output is **merged**:
  - a group matching an existing offer or the focus (case- and space-normalized) is ignored;
  - new groups are inserted as `offered`;
  - at most 3 open offers per draft.
- Each offer is names-filtered; a failing one is dropped.
- **Undo never changes an offer's state.**
  - Undo of the run that created an offer that is still `offered` deletes that offer.
  - A `started` or `dismissed` offer stays as it is.
- Offer states: `offered | focused | started | dismissed`. Only `offered ⇄ focused` is reversible.
- A focus switch re-checks under the lock at complete that its target is still `offered`; otherwise the run fails `not_offered` and changes nothing.
- On complete, a focus switch:
  - sets the target `focused`;
  - inserts the previous focus as a new `offered` row;
  - records both in the step.
- Undo of that switch:
  - restores the focus;
  - sets the target back to `offered`;
  - deletes the inserted row.
- `started` and `dismissed` are never changed by Undo.
- Merge ignores groups matching a `focused` offer.

#### Steps and Undo
- Before an applied run changes anything, the step stores:
  - the draft's point ids, questions, pending_links and focus;
  - the ids of the offers the run is about to insert.
- `canvas_draft_undo`:
  - restores points, questions, links and focus;
  - deletes the run's still-`offered` new offers;
  - rewrites the run's reply to "Undone.";
  - marks the run `undone`;
  - deletes the step.
- No redo.

#### Point ledger
- `canvas_draft_points(draft_id, run_id, point_id, story_ids uuid[])` records every point and engine-written story a draft
  created. Closed to clients; never deleted by Undo.
- **Publish:** deletes ledger points that no version tags, and their engine stories when no remaining point links them.
- **Discard:** the same, for every ledger point not tagged by another version.
- Owner-written stories are never touched.

#### Changed (D6)
- Computed in the owner read: per box, the draft's point id set ≠ the base version's.
- An undo back to the base shows no marker.
- No base ⇒ no marker.

#### Retention (D16) and deletion
- **At Publish:**
  - With no `offered` offer: material is deleted.
  - Otherwise: `material_until = published_at + 30 days − 1 hour`, so the hourly job deletes it within 30 days of Publish.
- **When the last `offered` offer becomes started or dismissed:** the closed draft's material is deleted in that same transaction.
- **Expiry is enforced by time, not by the job.**
  - Every read and every fork treats `material_until < now()` as expired.
  - An hourly pg_cron job (existing pattern, e.g. `20260909120000_p1283…` [code]) deletes expired rows.
  - So physical deletion happens within 30 days whenever the job runs on schedule.
  - A missed job run leaves the rows unreadable (time-enforced expiry) until the next run deletes them. Known limitation: physical deletion depends on pg_cron running.
- **A fork's copy is the new canvas's own material** (the owner chose to start it). It follows the new draft's lifecycle:
  deleted at that draft's Publish (or kept while it has its own offers), discarded with it, and deleted with its canvas or
  account (`ON DELETE CASCADE`, existing).
- **A fork carries at most 12 seed rows.** When more would cross, the oldest are merged into one "Earlier material" row.
  Known limitation: that row and the "Your messages" row each keep at most 200,000 characters, so a very large merge
  loses its tail, and later forks inherit the loss. A run reads at most 150,000 characters of material anyway.
- **Erasure (`erase_chat_data_for`):** other people's words reach a run only through forward/clarify copies in the thread.
  A fork copies only the owner's own files, links and messages. So no third-party-derived text crosses into a fork by
  construction, and the existing `derived_refs` cancellation covers both canvases' in-flight runs.
  - Known limitation: erasure cancels in-flight runs and scrubs replies, but points already in the owner's draft that were
    written from a forwarded copy stay (they are the owner's draft, as before v6). A later run that reads those points does
    not carry the sender's ref. `[FOUNDER DECISION: should erasing a sender also remove canvas points written from their
    forwarded words? Today: no.]`

#### Publish spot (one element, one place)
| Draft state | Spot shows | Element |
|---|---|---|
| active run (incl. waiting for transcript or extraction) | Updating… | status text, same footprint |
| idle, `has_points`, `differs_from_base` | **Publish** (filled) | button |
| idle, draft from vN, no difference from base | No changes yet | status text |
| no open draft, version published | Published · v3 | status text |
| new canvas, no points | Not published yet | status text |

No disabled Publish, ever. The spot never collapses. The server enforces the same rule (`draft_empty`, `no_changes`).
Publish while the newest run is `failed` is allowed: that message is not part of the version, and its bubble keeps "I couldn't update the draft." The owner saw it before tapping Publish.

#### Composer send slot
| State | Send slot |
|---|---|
| active run | status "Updating…" in the slot (meaning changed ⇒ look changes) |
| at cap, with something to publish | composer replaced by "This draft has had 30 updates. Publish it to keep going." |
| at cap, nothing to publish | "This draft has had 30 updates." + **[Start over]** (Discard, then the next Send opens a fresh draft) |
| `busy_elsewhere` | status "Another of your canvases is updating." |
| idle | the mic/Send swap only (P1576) |

#### Names filter (applies to every generated surface)
Today's rule (`supabase/functions/_shared/canvas-names.ts:75-89` [code]):
- names are learned from text the owner did not write (files, links, copied chats);
- a weak name the owner also typed is exempt;
- names that appear only in owner messages are never learned.

**v6 change:**
- **Owner messages also feed `strong`** for any token on a bundled first-names list (public-domain given-name list,
  minus the existing `allNotNames` common words), plus the patterns `<Name>:`, `<Name> from <Org>`, `<Name>'s`.
- Capitalised brand-like tokens in owner messages stay allowed: the owner's own business and platform names must survive.
- The owner's complete name stays exempt.
- **Surfaces checked:** points, stories, focus, offers (group + why), questions, note, replies, and the fork's "Your
  messages" row (scanned as owner messages).
- **Known limitation, kept in the spec:** heuristic. A surname-only mention or a name absent from the list passes. Tests
  bound what was modelled, not what is true.

---

### 3. User journeys

All copy is proposed: **[FOUNDER DECISION F1: every quoted user-facing string in §3 and §4.]**

#### J1. First canvas from material (new canvas)
1. Artifacts `New artifact → Canvas`, or the mirror chat's **+ → Canvas**, opens the workspace on a new canvas.
   - Chat opener: "Give your mirror agent anything about your business: files, links, a few lines. It drafts your canvas." with **Copy prompt** (outline, fixed look).
   - Spot: "Not published yet".
2. Owner uploads a deck. The upload is the first message.
   - Spot and send slot: "Updating…" (converting, then running).
   - Owner may type meanwhile; Send waits.
3. Run 1 ends: reply "Draft ready: 6 of 9 boxes. [Undo]". Spot: **Publish**. Send slot back.
4. Owner pastes a link and sends → run 2 (scoped to the boxes the link addresses) → "Updated: [Go-to-market strategy] [Offers & Pricing] [Undo]".
5. Owner taps Publish. Spot: "Published · v1". Publish reply:
   - (no other groups found) "Published v1. I deleted the text of your uploads; the canvas keeps what I drew from them."

#### J2. Change a box by talking (draft open)
1. Canvas view: owner taps **Add to chat** on Offers & Pricing.
   - Phone: the view switches to Chat. The tag lands at the saved caret, and the composer is focused inside the same tap handler (keeps the iOS keyboard).
2. Owner types "€200 per pilot team, paid by HR", then taps Add to chat on My next milestone. The second tag lands at the caret. One Send.
3. Spot "Updating…"; the two tagged boxes show "Updating…".
4. Reply: "Updated: [Offers & Pricing] [My next milestone] [Undo]".
   - Tapping a chip shows that box (phone: switches view; desktop: scrolls it to center) with a 2-second highlight ring.
   - Both boxes show **Changed**. Other boxes keep their exact points.

#### J3. Published canvas → next version
1. Owner on published v2 taps Add to chat on Customer Segments.
2. The workspace opens with spot "Published · v2" and chat empty state "Talk about any box. Nothing changes for readers until you publish."
   - **Nothing is written.**
3. Leave → nothing remains. Or send (text, upload or voice): `canvas_workspace_send` atomically:
   - opens the draft from v2 (all v2 points tagged into it);
   - creates the thread with base card "From v2 · 27 Oct";
   - inserts the message and the queued run.
4. Version label `v3 · Draft · from v2`. Publish → `v3 · 29 Oct · from v2` for everyone.

#### J4. Add to chat on v1 while a draft from v2 is open
- **Draft with ≥1 message:** bottom sheet "You have a draft from v2. Add this to it, or start over from v1? Starting over discards that draft." with **[Add to my draft]** (filled) and **[Start over from v1]** (red text).
  - The choice is held client-side, with the open draft's id and revision.
  - The first Send passes them, and the server discards and opens in the same transaction.
  - A changed revision (another tab acted) → `stale_view`. The composer text is kept, and the sheet re-asks with fresh facts.
- **Draft with no message:** no sheet; replaced at the first Send.
- **Same base:** no sheet; the tag goes into that draft.

#### J5. Voice note
- P1576 voice note; tags in the composer attach to it.
- Bubble "Transcribing…", spot "Updating…".
- The run is invoked when `transcript_status = done` and reads the transcript.
- Failed transcript: the run fails with no model call. Line under the bubble: "I couldn't hear this one. Type it instead."

#### J6. Undo
- The reply of the newest applied run carries **Undo** (ghost).
- Tap → the canvas returns to the state before that run. The reply line becomes "Undone."
- The previous applied run's reply now carries Undo.
- The undone message stays in the thread marked "Undone". It is never material again.

#### J7. Mixed material, two businesses found
**Reply:**
- First line: "I found two businesses: café owners and agencies. This canvas is about café owners, since you call them your focus."
- Buttons: **[Make it about agencies]** **[Start an agencies canvas]**
- Then "Draft ready: 7 of 9 boxes. [Undo]".

**Owner options:**
- **Keep:** nothing to do.
- **Switch:** `canvas_draft_switch_focus(p_draft, p_offer_id)`. A run with scope all boxes and focus = agencies.
  - Café becomes an offer (so the owner can switch back or start it).
  - Undo restores focus and offers.
- **Start second:** `canvas_draft_fork(p_draft, p_offer_id)`.
  - Creates a new canvas, draft and thread.
  - Copies, through the one input selector (§2): the owner's own files and links, and one "Your messages" row holding the owner's done messages (voice as transcript). Never failed or undone messages, never other people's copied lines.
  - Sets focus and queues the first run. The owner lands in the new workspace.
  - The offer state → `started` (stores the new canvas id). The button becomes "Agencies canvas started · Open".
  - Idempotent per offer id, under the lock.
- **Dismiss:** small "×" on the offer row → `dismissed`.

#### J8. Three or more found
- First line: "I found three businesses: … This canvas is about café owners, since they already pay you."
- Then one row per other group, max 3: `Agencies  [Make it about this] [Start a canvas]  ×`. [F1: row labels.]

#### J9. A second business appears later (upload into an existing draft)
- The current focus stays (D9). First line: "Your new file is also about agencies. This canvas stays about café owners." plus the same offer row.
- Customer-facing boxes may change only with material about café owners.
- Founder-fit boxes may take business-wide points: Guiding values, My current biggest challenge, Hypotheses I've falsified.

#### J10. After Publish with an open offer (D16, D17)
1. Publish reply: "Published v1. Your material also covers agencies. [Start an agencies canvas] I keep the text of your uploads for this until you start it or for 30 days, then delete it."
2. Later taps work as J7 Start second, with the kept material.
3. At expiry, or when every offer is started or dismissed, the material is deleted. Unused offer buttons read "Send the material again to start this canvas."

#### J11. Edges

| Case | Behaviour |
|---|---|
| Run cap (30) reached | Composer replaced by the cap line; Publish available. With nothing to publish: **[Start over]** (§2 Composer send slot). |
| Run fails / AI daily cap hit | Reply "I couldn't update the draft. [Try again]". Draft untouched. No auto-retry. |
| Daily cap hit before the call | Reply "Your mirror agent has used today's updates. It can continue tomorrow." No model call, no charge. |
| Message addresses no box | Reply "No box changed." plus the model's `note` (≤160 chars, names-filtered) when the message asked something. No Undo. Counts toward the cap. |
| Two tabs | Every mutation carries the revision → `stale_view`, refetch, text kept. |
| Phone Back / ← | Switch changes replace history; ← per §2. |
| Viewer / signed out | No Add to chat, no markers, no workspace; labels show origin. |
| Closed thread opened from the mirror chat | Composer replaced by "Published as v3. [Open canvas]". |
| Keyboard open on phone | The bar stays visible: `position: sticky` inside the scroll container, the composer pinned to the visual viewport. Verified in WebKit emulation; the founder checks on a real phone at UAT. |

#### Wireframes
v4 frames below, except:
- the 375 Chat-composing frame shows the send slot as "Updating…" during a run;
- the J7 frame gains the "×" per offer row;
- the J10 publish reply is new.

```
| Your mirror agent                     |
| Published v1. Your material also      |
| covers agencies.                      |
| ( Start an agencies canvas )        × |
| I keep the text of your uploads for   |
| this until you start it or for 30     |
| days, then delete it.                 |
```

**375px, published v2, owner (J3 step 1)**
```
+-------------------------------------+
| ←  Sales map                [Share] |
|    v2 · 27 Oct · from v1            |
|-------------------------------------|
| Owner Name                          |  byline: name only, no buttons
| CORE ASSUMPTIONS                    |
| Customer Segments   [💬 Add to chat]|  quiet text button, 44px, box header,
| +---------------------------------+ |  never inside the card (card is a <button>)
| | HR leads in 50-500 teams      > | |
| +---------------------------------+ |
| Offers & Pricing    [💬 Add to chat]|
| What do they buy, and for how much? |  question (owner only)
|-------------------------------------|
| [▣ Today's event]                   |
| Home  Chats  Events  Artifacts  You |
+-------------------------------------+
```

**375px workspace, Chat view, composing with two tags (J2 step 2)**
```
+-------------------------------------+
| ←  Sales map             [Publish]  |  sticky; filled; never moves
|    v3 · Draft · from v2             |
| [ Canvas ]  [■ Chat ]               |
|-------------------------------------|
|   ┌ From v2 · 27 Oct ┐              |
|        You: [Customer Segments] Not |
|        HR leads, people leads       |
| Updated: [Customer Segments]  Undo  |
|-------------------------------------|
| (📎)(⇪) [Offers & Pricing] €200 per |
|  pilot, paid by HR [My next mi… (➤) |  ➤ Send filled beside filled Publish
+-------------------------------------+
```

**375px workspace, Canvas view, run in flight (J2 step 3)**
```
+-------------------------------------+
| ←  Sales map              Updating… |  status, same footprint, not a button
|    v3 · Draft · from v2             |
| [■ Canvas ]  [ Chat ]               |
|-------------------------------------|
| Customer Segments   [💬 Add to chat]|
| Changed                             |
| | People leads in 50-200 startups>| |
| Offers & Pricing    [💬 Add to chat]|
| ◌ Updating…                         |
| My next milestone   [💬 Add to chat]|
| ◌ Updating…                         |
+-------------------------------------+
```

**375px, mixed-material reply (J7)**
```
| Your mirror agent                    |
| I found two businesses: café owners  |
| and agencies. This canvas is about   |
| café owners, since you call them     |
| your focus.                          |
| ( Make it about agencies )           |  outline, auto width, fixed look
| ( Start an agencies canvas )         |
| Draft ready: 7 of 9 boxes.     Undo  |
```

**375px, J4 dialog (bottom sheet)**
```
| You have a draft from v2. Add this   |
| to it, or start over from v1?        |
| Starting over discards that draft.   |
| [        Add to my draft           ] |  filled
|          Start over from v1          |  red text
```

**1440px workspace (sidebar expanded 248; canvas ~752; chat 440)**
```
+------+-------------------------------------------------------------------------------+
| side | ←  Sales map · v3 · Draft · from v2                                [Publish] |  sticky, spans both
| bar  |-----------------------------------------------+-------------------------------|
|      | Owner Name                                    |  ┌ From v2 · 27 Oct ┐          |  pane top = bar bottom
|      | CORE ASSUMPTIONS                              |      You: [Offers & Pricing]  |  (no empty band)
|      | Customer Segments 💬Add  Problem 💬Add        |      €200 per pilot team      |
|      | Changed                                       |  Updated: [Offers & Pricing]  |
|      | +-------------------+ +-------------------+   |                        Undo   |
|      | | People leads... > | | Every deadline. > |   |                               |
|      | +-------------------+ +-------------------+   |                               |
|      | PROFITABILITY        (2 columns: <720px)      |-------------------------------|
|      | Offers & Pricing 💬Add  My next milestone 💬  | (📎)(⇪) Write, or add a box   |
|      | Changed                                       |          to chat… (🎙Aa)(🎤)   |
+------+-----------------------------------------------+-------------------------------+
```
Sidebar collapsed at 1440: canvas column ≥720px → 3 columns. 1024-1279px: the 375 layout (bar + switch),
chat column `max-w-2xl` centred.

---

### 3b. Founder walkthrough, 2026-11-01 (binding; supersedes §2, §3 and S3 where it says so)

The founder tested on hosted TEST as a first-time owner and mostly reached **the old canvas chat thread, not the S3 workspace**.

Verified 2026-11-01 (Codex-checked):
- **The three "start" buttons leave the canvas.** Artifacts New canvas (`artifacts-new-canvas.tsx:23`), mirror + Canvas (`use-start-canvas.tsx:129`) and New version (`canvas-new-version-button.tsx:24`) all call `useStartCanvas`. It runs `canvas_draft_open`, which creates the canvas, its version, the thread root and the draft in one call, and then navigates to the chat thread (`use-start-canvas.tsx:74,78`).
- **Two paths already reach the workspace:** Artifacts Open draft (`use-canvas-draft-menu.ts:70`) and the draft card's Open.
- **The old thread's controls live in the chat code:** Create canvas / Update draft, "Creating your canvas…", the draft card and the "…" Discard menu (`canvas-thread.tsx:157,180`, `canvas-thread-copy.ts:65-101`, `CanvasThreadHeader.tsx:73`).
- **The workspace mounts the same pieces:** its chat uses `ThreadPanel`, whose tray is the old `CanvasThreadBar` (`ThreadPanel.tsx:55`).

Root cause: S3 was reviewed as code, and nobody walked the journey from **New canvas**.

**Decisions (founder, 2026-11-01):**
- **W0. One owner surface.** The canvas workspace is the only place an owner edits a canvas. This changes **presentation and routing only**:
  - **What stays:** the thread, its messages, forwarded/clarify copies, erasure refs, and the engine's thread-scoped inputs (`20261030080000_p1536_v6_engine.sql:569,615`).
  - **What goes, everywhere:** the old tray's Create canvas / Update draft / "Creating your canvas…" and the "…" Discard. Send is the update (§2), status is the Publish spot and send slot (§2), and Discard moves to W6.
  - **Old canvas-thread addresses (`/chat/...` whose root is a `canvas_version` attachment) resolve by that version:**
    - open draft → `/p/:handle/canvas/:tag?ws=1`;
    - published version → `/p/:handle/canvas/:tag?v=<version>`;
    - discarded draft → the canvas page at its newest published version, or Artifacts › Canvases if there is none;
    - deleted or not the viewer's → the existing unavailable state;
    - drafting off → the thread stays readable as today.
  - **The mirror chat keeps its cards:** one per thread root, as today. Each card adds the state of its version and an **Open** that resolves by the same rules.
- **W1. The canvas is home; the thread is a panel.** `?ws=1` (workspace mode: the panel, Thread button and switcher exist, BottomNav is hidden) is on exactly while the owner is **editing**: a draft is open, or a Clone is pending.
  - **A published view with nothing being edited:** has no `ws=1`, no panel, no Thread button and no switcher. Only Clone is shown.
  - **Entry points that land in workspace mode:** New canvas, mirror + Canvas, Clone, a Drafts row.
  - **Entry points that land in workspace mode only when a draft is open:** a card's Open, an old address (W0).
  - **Mine:** opens the published view.
  - **After Publish:** the page REPLACEs to `?v=<new version>` (no `ws=1`), and the panel closes. A toast carries the Publish reply's first line, and the reply stays in the thread.
  - **New canvas:** keeps today's `canvas_draft_open`. Canvas and draft exist at once, and it lands on `ws=1` instead of `/chat`.
  - **≥1280:** the thread panel sits on the right and closes with ×. While it is closed, a **Thread** button sits in the header. Open/closed is local UI state, not in the URL, and closing keeps the unsent text and scroll.
  - **<1280:** a `Canvas | Thread` switcher under the header. A new canvas opens on Thread, everything else on Canvas. The tab is local state, and switching replaces nothing in history.
  - **Add to chat and reply chips (S4/J2):** <1280 they flip the switcher; ≥1280 they open a closed panel, with focus in the tap handler.
  - **←:** §2's rule stands (`location.state.from` when in-app). The fallback, for direct entry and reload, becomes Artifacts › Canvases.
- **W2. A mirror agent you can open from any page (Intercom-style) is a separate future spec** (INBOX-256), built on the W1 panel. Not in P1536.
- **W3. "New version" → Clone,** with a copy icon, secondary, shown only to the owner on a **published** version.
  - **Nothing is written on tap** (the J3 rule). The thread opens empty with "Clone v2. Nothing changes for readers until you publish." The header reads `[v2 ▾] New draft from v2`, the spot reads "No changes yet", and there is no Discard (× cancels). The first Send runs `canvas_workspace_send`; leaving before then writes nothing. Cancel (×, or switching away) returns to v2.
  - **Same-base draft open:** Clone opens that draft.
  - **Other-base draft open:** the J4 rules apply as written, including the "≥1 message" threshold (no sheet for an untouched draft).
  - **On a draft:** no Clone, and no "you have an open draft" dialog.
- **W4. Draft or Published is always named.**
  - **Header:** `Canvas 4 ✎ [v2 ▾] Draft|Published`.
  - **Mirror-chat card:** state + **Open** (secondary). The Publish reply there carries **Open canvas**.
  - **Inside the panel:** no Open buttons. The Publish reply's chip flips to Canvas on <1280.
- **W5. Canvases list: Drafts / Mine / Shared with me** (like Letters).
  - **Drafts:** my canvases with an open draft. Opens `?ws=1`.
  - **Mine:** my canvases with ≥1 published version. Opens the newest published version, with a "Draft open" badge when one exists.
  - **Neither:** a canvas with neither (never published, draft discarded) appears in no tab.
- **W6. Discard draft** sits in the thread panel header beside the state, secondary destructive, with the existing confirm. It calls the existing checked discard, which keeps the canvas and version rows (`20261030080000_p1536_v6_engine.sql:701,726`).
  - **Draft from vN:** returns the page to vN.
  - **Never-published canvas:** lands on Artifacts › Canvases › Drafts.
  - **Before the first Send:** an unwritten Clone has nothing to discard. Cancel is the × in W3.
- **W7. Primary buttons, per state** (supersedes J1's "fixed look" for Copy prompt; composer content never changes either button):

  | Spot state (§2) | Primary | Copy prompt |
  |---|---|---|
  | Not published yet (empty new canvas) | Copy prompt | primary |
  | Updating… / No changes yet / Published · vN | none | secondary (only where shown) |
  | Publish | Publish | secondary |

  Everything else uses one shared secondary variant (Compare's pill, named in code as one constant): Clone, Share, Discard, Open, Thread, the version picker. The picker carries a chevron and `role=combobox`.
- **W8. The header.** The Publish spot never moves or collapses (§2 and S3.3 stand).
  - **≥1280, one line:** ← · name ✎ · [vN ▾] · state · Share · Clone (published) · Thread (panel closed) · Publish spot.
  - **<1280, row 1:** ← · name ✎ (truncates first) · [vN ▾] · state · Publish spot.
  - **<1280, row 2:** the switcher · Share (labelled down to 320) · Clone (published).
  - **Removed:** the "Clarity Canvas" label goes. The header height is identical for draft and published.
  - **Rename** changes a display title only. A new nullable `canvases.title`, set by an owner-only RPC (≤60 chars, trimmed, non-empty), is read wherever `canvasTitle(canvasName)` is today (`canvas-draft-service.ts:228`), falling back to it. The address tag `canvas_N` and version names never change (`20261029100000_p1536_canvas_draft_versions.sql:169`). Enter or blur saves, Escape reverts, and an empty name reverts.
- **W9. Hide empty hints:** no "No position yet" when a point has no positions.
- **W10. Card drag-to-reorder: later.** Moving cards up and down already works.
- **Access is by ownership, not by role.** Any canvas's owner (an event attendee on their own canvas included) gets W1-W8. Anyone else (a shared reader, an attendee reading someone else's canvas, a signed-out visitor) gets none of: panel, Thread, switcher, ✎, Clone, Discard, the Draft state. Their picker lists published versions only. P1515 reader links (`event-shared-canvases.tsx:50`) and P1529 round threads are unchanged.

**Bugs found in the walkthrough. Each gets a reproduction and a failing test first.**
- **B1.** "That did not go through. Try again." appeared although the update landed.
  - Candidates: `use-canvas-uploads.ts:89` (an unsuccessful upload result) and `:94` (the catch). The path through `:81` is success.
  - Hypothesis to test: an upload is refused (for example a duplicate or "running") while the run it belongs to succeeds.
  - **Reproduced (2026-11-01):** the only toast with this sentence is the upload's fallback (`use-canvas-uploads.ts:89`). The one path where an upload is refused while its run succeeds: the first post's answer is lost, `postFile` posts again (`use-canvas-uploads.ts:31-41`), the run has already finished, and the server answers 409 GONE with `state: done` (`canvas-handlers.ts:56-62`). `uploadCanvasMaterial` dropped that state (`canvas-draft-calls.ts:165`), and GONE has no sentence, so it fell to the generic one. A still-running run (the usual repeat) was already handled; the `:94` catch only fires when the announce call itself throws, which lands nothing. Test `src/tests/p1536-b1-upload-refused-after-run-done.test.tsx`; fix `src/app/data/canvas-draft-calls.ts` (GONE with a done run counts as applied; failed, capped, cancelled stay refusals). NOT confirmed as the founder's exact path: it needs the POST statuses of `canvas-draft` from his session and that run's state (TEST database).
- **B2.** After Update draft: "Creating your canvas…", then "Draft not available", with no way out.
  - Reproduce on the old thread first.
  - If the cause is in the run or the read (not the retired tray), the test moves to the workspace.
  - **Reproduced (2026-11-01):** the cause is in the retired tray, and the workspace chat mounts the same tray, so the test mounts the workspace's thread panel. In v6 a file is kept by its own run, after that run began, so `hasNewSinceRun` (`canvas-items.ts:146`) called every file "new since the last canvas" and offered Update draft on a finished canvas. Update draft starts "the queued run", a v6 draft has none, `startQueuedCanvasRun` answered NOT_AVAILABLE (`canvas-draft-calls.ts:148`) and the tray printed "This draft is not available." (`use-canvas-actions.ts:111`), with Update draft still on offer. The progress did clear (the busy flag ends with the request); the dead end is the false offer plus the false sentence. Test `src/tests/p1536-b2-update-draft-dead-end.test.tsx` (includes the poll check: Updating… ends within `RUN_POLL_MS` after the run settles); fix `canvas-items.ts` (a file is new only when the newest run did not finish well) and `use-canvas-actions.ts` (nothing queued is not an error). Both go with the tray at W0. One older test changed premise: `p1536-canvas-thread-ui.test.tsx` C2 "a file kept after the canvas was made" had a finished newest run plus a later file, which v6 cannot produce; it now uses a failed newest run.
- **B3.** The "N messages from you" row goes with the old tray (W0).
- **B4.** On phones, Share is an unlabelled lock icon (now W8).

**Prompt quality (S2 follow-up):**
- **Q1.** Customer Segments must name who, specifically. Each point needs a role or title, plus at least two of: industry, company size, demographics, psychographics.
- The founder's Canvas 4 gave vague segments spread over several cards.

**Process for this slice:**
- Before the founder's UAT, the agent walks J-W1 to J-W5 in a real browser at 1440 and 375, as a signed-in owner with no canvases.
- Screenshots go to a separate visual-QA subagent (`.claude/rules/visual-qa.md`).

#### J-W1. New canvas, 1440
1. Artifacts → New canvas → `/p/:handle/canvas/canvas_N?ws=1`: `Canvas N ✎ · Draft`, empty boxes, the spot "Not published yet", and the panel open with the opener and **Copy prompt** (primary).
2. Send material. The spot and the send slot show Updating…, and the boxes fill in place. The path never changes.
3. Run done: the spot becomes **Publish** (primary; Copy prompt secondary). Publish → the same path with `?v=v1`, no `ws=1`, the panel closed, the header `· Published`, the spot "Published · v1", Clone shown, and a toast "Published v1…".

#### J-W2. New canvas, 375
As J-W1, opening on Thread. The first reply's box chips flip to Canvas.

#### J-W3. Clone a published version
On published v2, tap Clone. Same path, `ws=1` added; the thread opens empty, the header reads `[v2 ▾] New draft from v2`, nothing is written. The first Send creates the draft. Discard (confirm) returns to v2.

#### J-W4. Find and continue a draft
Artifacts → Canvases → **Drafts** → a row opens `?ws=1` on Canvas, with the panel open at ≥1280.

#### J-W5. From the mirror chat, or an old link
A card shows `Canvas 4 · v2 · Draft` + Open → as J-W4. An old canvas-thread address resolves per W0.

```
1440, draft, panel open
+------+---------------------------------------------------------------------------------+
| side | ← Canvas 4 ✎  [v3 ▾] Draft · from v2                     [Share]   [Publish]   |
| bar  |-------------------------------------------------+-------------------------------|
|      | Customer Segments          Problem              | Draft · v3   [Discard]     ×  |
|      | +------------------+ +------------------+       |  ┌ From v2 · 27 Oct ┐         |
|      | | Ops leads, 50-200| | Every deadline…  |       |  You: shorter wording         |
|      | +------------------+ +------------------+       |  Updated: [Problem]    Undo   |
|      |                                                 | (📎) Write…            (🎤)(➤)|
+------+-------------------------------------------------+-------------------------------+

375, draft                                375, published
+-------------------------------------+   +-------------------------------------+
| ← Canvas 4 ✎ [v3 ▾] Draft [Publish] |   | ← Canvas 4 ✎ [v2 ▾]  Published · v2 |
| [■ Canvas ][ Thread ]      [Share]  |   |                   [Share] [⧉ Clone] |
+-------------------------------------+   +-------------------------------------+
```

---

### 3b. Build record: S3b.11 (2026-11-02)

**Status:** built on the feature branch, on both TEST servers' schema, not on prod. Walked on hosted TEST (drafting on) at the dev server, with the real model. Screenshots: `.private/evidence/p1536-s3b11/`. The numbers: one spec, `e2e/p1536-walkthrough.spec.ts`, 674 recorded checks merged from one full run and a re-run of its 7 failed cells: 627 pass, 47 observations or not reached, 0 fail.

| Journey | 1440 | 375 |
|---|---|---|
| J-W1 New canvas | PASS, `J-W1-1440-published-v1.png` | runs at 375 as J-W2 |
| J-W2 New canvas, phone | runs at 1440 as J-W1 | PASS except box chips (not built), `J-W2-375-published-v1.png` |
| J-W3 Clone | PASS, `J-W3-1440-draft-after-first-send.png` | PASS, `J-W3-375-draft-after-first-send.png` |
| J-W4 Find a draft | PASS, `J-W4-1440-draft-row-opened.png` | PASS, `J-W4-375-draft-row-opened.png` |
| J-W5 Mirror chat, old links | PASS, `J-W5-1440-mirror-chat-cards.png` | PASS, `J-W5-375-mirror-chat-cards.png` |

**The 7 cells that failed on the first full run** all passed on re-run. The walker put them down to hosted slowness (database statement timeouts, `57014`, and cleanup timeouts), network flaps on the walking machine, and its own test's timing assumptions; none was reproduced as an app defect. One further cell (the slot's status up to the reply) was flaky under a check that measured to the reply being shown; measured to the reply being stored it is 8 of 8. Once in a slow run (27s to Publish) a toast appeared during a Send; its text was not captured and it did not recur in 12 further runs, so it is unexplained. After a run ends, the composer is free up to about 1.8s before the reply shows in the thread on a slow host.

**Database proofs (S3b.4, S3b.7), live on hosted TEST.** Clone tapped, and Clone cancelled, each leave all four tables identical, and a real write makes the comparison differ (the control). `canvas_rename`: 42501 for a non-owner and signed out, 22023 for empty and for 61 characters, 60 accepted and trimmed.

**Defects the browser found that reviews and unit tests did not:** a Send before the first read stored as a plain message; the mirror asked to answer a Clone's first Send; a plain thread reply refused in an ordinary mirror chat (a regression from a fix in this slice); the spot flashing a stale state at a run's end; the state tag collapsing to nothing at 320; a page stuck on skeletons after picking a version from a bare `?ws=1`; the composer clipping restored text in development. All fixed, each with a test that failed first.

**Reports received:** code review: 3 of 3 on the first round (Gemini, Codex, Opus), 2 of 2 (Gemini, Codex) on each of the next five rounds, then 1 of 1 (Gemini) on each of the last small diffs. The Codex lens was not run on those last diffs. Browser walk: 1 of 1, one agent resumed for each re-walk. Visual QA: 4 of 4, a separate agent each time, every listed screenshot read.

**Final visual QA: FAIL, four MEDIUM, each set aside with a reason:**
- 320: no ✎ and a three-letter name. Decided: below 360 the name is the way to rename (tapping it works). For the founder, below.
- A published version with a draft open and `ws=1`: no Clone, and at 375 the Canvas tab does not name the draft. Follows W1 (Clone only with nothing being edited); the picker lists the draft and the panel says "Go to draft".
- Rename below 1280: the field covers the picker and state while typing. Chosen so the name can be read; 45px otherwise. They return on save.
- A failure toast still showing after Retry succeeds: it is about the Send that did fail, and it times out. Toast placement is existing behaviour.

LOW, recorded and not changed: toast over header row 2 at 375; Share absent on a never-published draft (nothing to share yet); "Published" twice at 1440 (W4 and W8 both ask for it); the signed-out "← Back" alignment; two cards with the same words when two threads started from one version.

**Reviewer findings set aside:** a held Send landing in the wrong thread (false: the panel is keyed by thread); the composer's remeasure on a remounted field (old code had the same gap, the observer improves it); `COMPOSER_MAX` removed (no importer); a failed private-mode Send dropped when that slot has newer text (existing, deliberate never-overwrite); a mirror thread whose read failed with no root still sends plain (only an old `/chat` address reaches it).

**Not built, by design of the slices:** Add to chat, inline tags and reply chips (S4), Undo (D7). So J-W2's chip flip and S3b.3's last line cannot be walked yet.

**Known limitations:** the Q1 detector is a keyword list, proven on labelled fixtures; the real-model eval has not run. The 30-update cap is walked with 30 seeded runs. Hosted TEST was slow enough at times to fail a read; the page shows its load error and Retry.

### 3c. Founder walkthrough 2, 2026-11-02 (binding; supersedes §1, §2, §3, §3b and S3, S3b where it says so)

**Scope ruling (founder, 2026-11-02): P1536 ships whole.** Nothing the spec already decided is postponed. In scope:
- Add to chat, inline tags and reply chips (D5, J2, S4).
- Undo (D7).
- Mixed material: offer rows, focus switch, fork, dismiss, retention (D10, J7 to J10, S5).
- The design-rule gates (S6).
- The real-model evals (S2, Q1).
- Follow-ups INBOX-259, 260, 261 and 263.
- Everything below.

Only W2 and W10 stay out, as the founder already ruled.

**Every criterion gets a verdict before /ship.** Gate 2.5 counts any unticked box, so each one in §5 and in the older `## Acceptance Criteria` block ends ticked with evidence, or deleted with its replacement named in prose. A box only the founder can settle is settled by the founder, then ticked or deleted. Ticked S3b boxes that 3c makes false (S3b.5, S3b.6, S3b.7) are rewritten or deleted the same way. J-W1 to J-W5 are read through the header table below wherever their text names a removed state.

#### B5. A draft started from a version can start empty (reproduced)
- **Evidence (hosted TEST, read-only, 2026-11-02):** the founder's `canvas_4` v1 holds 18 points. Its open draft v2 has no run, no message and 0 points. All nine boxes read "Empty" and "Changed", and the spot says "Not published yet" although v1 exists.
- **Control:** `canvas_5` v2, made by Clone then Send, kept its points and marked only Solution.
- **Cause (hypothesis, from reading the code; the failing test decides):** `canvas_draft_open(p_from_version)` (`20261029100000`) puts no base points in the draft. v6's `_canvas_draft_new` does, and v6 did not restate the opener.
- **Still reachable today:** paperclip → Canvases → pick a version (`useCanvasEntry.onPickCanvas` → `useStartCanvas` → `startCanvasThread`, `canvas-draft-calls.ts:272`).
- **Fix, failing test first:**
  1. An RPC-level test: opening from a published version with points gives a draft holding those points, with no box Changed.
  2. A migration keeps the opener's wrapper and JSON response and replaces only its construction with `_canvas_draft_new(uid, canvas_id, base_id, NULL, NULL)`. Regression tests cover: untouched-draft reuse, `open_elsewhere`, authorization, the open-draft cap, zero initial runs, the root attachment, inherited focus, private point identity and legacy public-point copying.
  3. X3 moves the client off this path.
- **Existing empty drafts:** prod has none (drafting is unreleased). The founder discards the TEST one.

#### Decisions

**X1. Navigation.** The desktop sidebar becomes Home, Chats, Events, Artifacts, My Profile: the phone bar's destinations plus My Profile. Partners and Groups move under the avatar.
- The shared entry list stays complete; the sidebar gets its own list of visible ids.
- `shellMenuOmissions` is passed only those ids, so Groups appears in the avatar menu by itself. Partners has no menu row, so the avatar menu gets one with its badge, as the phone's Me sheet does by hand.
- The pending-partner-invitation count shows on the avatar, with the count in its accessible name.
- On `/groups` and `/p/:slug/partners` the avatar shows the active state, since no sidebar entry owns them.

**X2. Chat list +.** Secondary at every width: the blue outline pill's colours on the round button. The list rows are that page's content. Artifacts' New canvas and New letter stay filled.

**X3. + means create, the paperclip means attach.**
- The owner's mirror chat's main composer gets a + beside the paperclip, while drafting is on, hidden where the paperclip is hidden (`privateTo`). No other composer gets one: not threads, not other chats. Its menu:
  - **New canvas:** today's opener with no base.
  - **Clone a version:** pick a version, navigate to it, then run the same `clone()` decision as the Clone button, consumed once the version has loaded. No draft: pending. Same base: opens that draft. Other base with ≥1 message: the J4 sheet. Other base untouched: pending, replaced in the first Send's transaction.
- The paperclip keeps Points and Stories only. The Attach dialog's Canvases tab goes, and "New canvas" leaves the "…" menu.
- In a canvas thread, "+ Upload" becomes the paperclip icon, opening the file picker: attaching something to the message, the same meaning as in the mirror chat. D15's status in that spot stays.
- Letters and points join the + menu in their own specs.

**X4. One rule for the header: the main action is the furthest-right button, filled blue.** Publish on a draft, Share on a published version. The table below is the whole rule; S3c.4 iterates it. Supersedes W4's "Draft or Published is always named", W7's table and "Share is secondary", W6's position and W8's order.
- Clone, Thread and the version picker use the one named secondary pill. Compare stays where it is.
- Discard follows design-system rule 5: red text, no box, then the existing confirm. Cancel follows rule 3: ghost.
- Only Updating… and Publishing… replace the main action. A failed update stays on its message with Try again, and the cap line stays in the composer, both per §2. Publish still shows if its guard passes.
- The spot's box keeps its width in every state and holds Publish, Share or a status, so nothing beside it moves. Amends S3.3: a button in the Publish and Share states only.

| State | Beside the name | Right side, left to right (last = the spot) |
|---|---|---|
| Published, owner, no draft | `[vN ▾]` | Clone, **Share** |
| Published, owner, draft open, reached by View (no `ws=1`) | `[vN ▾]` | Clone (W3, J4), **Share** |
| Published, owner, draft open, picked from the picker (`ws=1`) | `[vN ▾]` | Thread*, **Share**; the panel keeps Go to draft |
| Pending Clone | (New draft) | Thread*, Cancel, "Nothing to publish yet" |
| Never published, no points | (Draft), no picker | Thread*, Discard, "Nothing to publish yet" |
| Never published, with points (also newest run failed, or at the cap) | (Draft), no picker | Thread*, Discard, **Publish** |
| Draft with a base, no points left, or no difference from base | `[vN ▾]` (Draft) | Thread*, Discard, "Nothing to publish yet" |
| Draft with a base, points and a difference, including newest run failed, or at the cap | `[vN ▾]` (Draft) | Thread*, Discard, **Publish** |
| Updating or Publishing | (Draft) with no picker if never published; otherwise `[vN ▾]` (Draft). A pending Clone's number and picker appear when its first Send creates the draft | Thread*, status in the spot; no Discard (the RPC refuses `busy`) |
| At the cap, nothing to publish | (Draft), plus `[vN ▾]` if it has a base | Thread*, "Nothing to publish yet"; Start over in the composer only |
| A run on another canvas (`busy_elsewhere`) | as the draft | Thread*, Discard, **Publish** if this draft has points and differs, else "Nothing to publish yet" (both RPCs check only this draft's run: `_canvas_draft_busy_code(..., false)`, v6 engine `:2674`, `:2790`; §2's "idle" wording for Discard is corrected here); the composer says why Send waits |
| Reader or signed out | `[vN ▾]` published versions only | nothing filled, no W-controls |
| Drafting off, published, owner | `[vN ▾]` | **Share** |
| Drafting off, draft, owner | (Draft), plus `[vN ▾]` if it has a base | nothing |

*Thread shows only at ≥1280 while the panel is closed. Bold is the one filled action. Where two rows fit, the more specific wins: "At the cap, nothing to publish" overrides the no-points and no-difference rows, because Start over replaces Discard there.

**X5. Published needs no word.** "Published" and "Published · vN" leave the header for owner and reader: a version with no Draft tag is published. The version sits beside the name. The name belongs to the canvas, and versions are not renamed (D8).

**X6. Draft is a tag.**
- **(Draft)** is one tag component, visible at a glance, in: the header, the picker's draft row, the mirror-chat card, and a Mine row. A pending Clone uses the same tag reading **New draft**, with no number until the first Send and no picker (Cancel first to read another version).
- The closed picker shows the number only, never the tag.
- Share is absent on every draft; the access dialog stays on the published view. "from vN" leaves the header; D8's origin stays in the picker rows.
- Discard moves to the page header so it is there with the panel closed. Its behaviour stays as W6. Cancel sits in the same place on a pending Clone, as well as the panel's ×, so a closed panel or the Canvas tab never traps the owner.
- The picker stays on a draft (the founder questioned this): reading v1 is how the owner compares and reaches Share. A version picked from a draft loses the (Draft) tag, and the panel keeps Go to draft.

**X7. Before there is anything to publish, the spot says so.** Founder, 2026-11-02 (decisions.md [product]), replacing the hide default: a hidden Publish leaves people not knowing publishing exists. So the spot shows the status "Nothing to publish yet" in the same box. It is a status, not a disabled button, so D3, rule 9 and the p955-gate stand with no exception.
- Publish shows only when the draft has points AND (it has no base, or it differs from its base), and nothing blocks it. The server's `no_changes` and `draft_empty` refusals stay, and both return the spot to "Nothing to publish yet" and re-read.
- The texts "No changes yet", "Not published yet", "Published · vN" and "Nothing published yet" go; the state distinctions and the settled-read hold stay.
- Supersedes the §2 spot table's last three rows, S3.3's five states, J1 step 1 and J3 step 2.

**X8. The mirror agent is visibly there.**
- The panel header becomes the mirror agent's face and name with "Your mirror agent", as the mirror chat's header does, plus ×. "New draft from v1" and "Draft · v2" leave it. The name is read from the owner's mirror, never written in the code. This amends D14 on the panel header: the owner's own named mirror is shown there; the fixed wording stays everywhere else in canvas surfaces.
- A thread of a draft with a base opens, before and after the first Send, with a line from the mirror agent (face, name): "This is a new draft from v1. Tell me what to change. Readers keep seeing v1 until you publish." It takes the place of the owner-authored "v1 · Published" root card and of "Clone v1. Nothing changes for readers until you publish." Supersedes J3's base card.
- The line is drawn on screen from the base's number. It is not stored, not given to the model, and not counted as a message.
- A new canvas keeps its opener and Copy prompt, under the same header.

**X9. Voice notes in every canvas thread: a new path, not a switch.** Flipping `!canvasRoot` alone would post a plain note with no run, so nothing would happen.
- The round voice button shows on a draft, a pending Clone and a new canvas, as in every other chat. Copy prompt is secondary everywhere (supersedes W7's Copy prompt row).
- The `chat-voice` commit gets a canvas mode: it validates the stored bytes as today and uses the upload key's id as the client id. `chat-voice` calls the database with the service role and `canvas_workspace_send` reads `auth.uid()`, so this needs a new service-only function that takes the verified caller's id and shares the send's one transaction (no second copy of its logic). It is not callable by users, and a test proves it cannot act for another owner. Transcription then starts as today. Upload receipts and idempotency survive a lost response. A first voice note on a pending Clone creates the draft (S4.4).
- The run starts when the transcript lands, whether or not the tab is open, by the pattern P1576 uses for mirror replies (decisions.md: the server owns the trigger when it can). A trigger on `transcript_status`: on `done` it calls `canvas-draft`'s begin for the queued run over an internal, service-only authenticated route; on `failed` it settles the run in the database, with no model call and no charge. The URL and secret are provisioned on both TEST servers and in the Pre-deploy Checklist for prod. A dispatch that fails or never arrives is recovered by the existing lease expiry and the client's invoke, which stays as a harmless retry.

**X10. A card says what its thread is.**
- A card's state comes from the draft whose `thread_root_id` is this message, never from the attached version: a clone's root attaches its BASE, so today a live draft's card reads "v1 · Published". A root with no draft row uses the attached version as today.
- **Open:** (Draft) tag, `v2`, **Open draft**, going to the workspace. **Published:** `v2 · date` (the version that draft became), **View**, going to `?v=<that version>` with no `ws=1`, even while another draft is open. **Discarded:** says so, no button.
- Supersedes W4's named state on published cards and W1's "a card's Open lands in workspace mode when a draft is open". The pill look stays (W4, a recorded exception to design rule 4).

**X11. The thread looks like a thread.**
- A canvas thread root shows the same "N replies" link as every other thread in the chat (`RepliesLink`, now not suppressed for them), hidden at 0.
- On a draft it opens the workspace with the thread showing (below 1280, the Thread tab).
- On a published or discarded card it opens the mirror chat's own thread panel, in place: the history, no composer, upload or voice, J11's closed line in their place, and live J10 offer rows. No new state on the canvas page. W0 narrows: only an open draft's thread address redirects; a published or discarded one stays readable here. W0's tests for those two change premise.
- A root with no resolvable draft shows no link.

**X12. No text where the boxes already say it, and Changed means something.**
- "Nothing is drafted yet." goes. "You can still change who has access above." goes for everyone. A reader of an empty canvas keeps "This canvas has no points yet."
- **Changed** means: differs from the version this draft started from. With B5 fixed, a box can only be empty against a base that had points if an update emptied it, and hiding that would hide a removal before Publish. Founder confirmed 2026-11-02: such a box reads Empty with a **Removed** tag; other changed boxes read Changed. A first canvas shows neither (D6).

**X13. Phone header (<1280).** Supersedes W8's rows.
- Row 1: `← · name ✎ · [vN ▾] · (Draft)`. Row 2: the switcher, then the table's actions right-aligned, labelled down to 320. Discard is never icon-only.
- The switcher's active side uses the app's selected look (the Artifacts filter pill's blue outline and tint), so the header keeps one filled button.
- A pending Clone is two rows: `← · name ✎ · (New draft)`, then the switcher, Cancel, "Nothing to publish yet".
- A published version picked from a draft (`ws=1`) keeps the switcher, and row 2 adds **Go to draft** before Share, so the way back is on the Canvas tab too. The Thread tab stays the open draft's thread, with today's line above it.
- Published with nothing being edited has no switcher, so row 2 is `Clone, Share`. The founder asked whether one row would do: build measures name, picker, Clone and Share on one row at 375. If the fixed title shows at least 12 characters there, one row; otherwise two. The result is reported. A reader's header is one row, and so is an owner's with drafting off (`← · name ✎ · [vN ▾] · Share`, or `(Draft)` and nothing). Header height stays equal for owner draft and owner published when both are two rows; S3b.7's rule otherwise goes.
- A pending Clone (including Start over from the J4 sheet) opens on Thread, because typing is next. Anything that opens an existing draft (Open draft, Clone or Clone a version landing on one, Add to my draft) opens on Canvas, because the owner came to look. Supersedes W1 and S3b.3 here. The line from X8 must stay visible with the phone keyboard up, or the composer does not take focus on landing.

**X14. Artifacts.**
- Canvases is the first tab and bare `/artifacts`'s default. The default list stays Mine. The Letters tab keeps its unread dot. A person with no canvases sees the existing empty state.
- Every letter flow that links to bare `/artifacts` today (14 sites: letter results, reading, preview, completion, explain-back, session ended, and the `/letters` redirect) names `?tab=letters`, so finishing a letter still lands on Letters. Only the nav entries stay bare.
- Rows stay per canvas, and the picker holds the versions. A draft is the next unpublished version, shown under its canvas, so the list keeps the name Drafts.
- Mine: newest PUBLISHED number, plus the (Draft) tag when one is open (replaces "Draft open"). Drafts: the draft's number, no tag, since the list says it.

**X15. Publish toast.** It is the reply's first line (W1, D17 stand), and with an open offer it carries **See offer**, opening the thread as X11. This withdraws the earlier recommendation of a short fixed toast: the panel closes at Publish, so the toast is the only place the retention sentence is seen without opening anything. A rename goes live to readers at once, and saving says so (wording below).

#### Wording to approve at UAT [FOUNDER DECISION: all of these are defaults, built as written]
| Where | Default |
|---|---|
| + menu | New canvas · Clone a version |
| Pending tag | New draft |
| Line from the mirror agent | This is a new draft from v1. Tell me what to change. Readers keep seeing v1 until you publish. |
| Cards | Open draft · View |
| Emptied box | Removed |
| The spot with nothing to publish | Nothing to publish yet |
| Rename saved | Name updated for everyone. |
| An update changed nothing (J11; supersedes "No box changed." in §2, J11 and S1.13) | Nothing changed on the canvas. I noted: … (without the note when there is none) |
| A discarded thread's closed line | This draft was discarded. |

#### V. Visual revision, a stage of this spec (before UAT)
The founder's complaint was not broken behaviour. It was order, redundancy and buttons in the wrong rank, and the last QA round saw "Published twice" and closed it as LOW because the spec asked for it. So this stage has its own critics, its own control and its own exit.

1. **Image route first (build step 0).** `ask-model-gemini` is text-only today. Add image input to `~/.agents/bin/ask-model` (its own history, outside this repo), keeping served-model verification. Critic A has no text-only fallback.
2. **Control before trusting a critic.** Both critics get the founder's ten 2026-11-02 screenshots, with the browser chrome cropped off and the annotations masked, and must independently report: Published twice; "New draft from v1" twice; Share on a draft; Changed on Empty; text above empty boxes. A critic that misses one has its prompt changed and re-runs before its verdicts count.
3. **Shots.** Real browser, real model, TEST fixture accounts only, at 1440, 1280, 1279, 1024, 768, 390, 375 and 320, with the resize verified. Every row of the header table, plus: failed run; read-only thread; panel closed; Canvas and Thread tabs; phone keyboard open; the + menu; Add to chat with tags; reply chips; Undo; offer rows; J4 sheet; Discard confirm; open picker; stance control (D20); rename; cards (draft, published, discarded); Artifacts tabs and rows; sidebar and avatar menu; chat list.
4. **Critic A: Gemini Argon on the images. Critic B: a separate visual-QA subagent** with the screenshots and `.claude/rules/visual-qa.md`, never the diff. Both are asked, per screen:
   - What is the one main action? Name every other filled element. Only the send slot may be one.
   - For each element: what would be lost if it were removed?
   - Does the same fact appear in the header, the panel and the card?
   - Is the order what a person needs first, next, last?
   - Is draft or published clear within a second?
   - Does the same thing look and read the same on every screen, on desktop and phone?
   - Does each button's label say where it goes?
   - Touch targets ≥44px; no element jumps between states; the fixed title's visible length against the baseline.
5. **Exit.** The critic assigns severity and the builder may not lower it. Every finding is FIXED or goes to the founder with one line on why not; "the spec asks for it" escalates, it does not close, and any redundancy finding goes to the founder at any severity. After fixes, re-shoot and re-critique the changed screens. The stage ends when a round has no open HIGH or MEDIUM.

#### Baseline: title visibility before the header change (build step 0)
Measured on commit `738418664fd844392ac38016d840b979df71aa4f`, hosted TEST, before any header change. Title `Acme Bakery Plan for the Northern Region` (40 characters), the owner's canvas with a published v1 and an open draft from it. Font Inter 16px, weight 600 (the title's own style), browser default, zoom 100%. Chromium; phone widths (390, 375, 320) in a touch, mobile-emulated context, the rest in a desktop one. Each resize verified with `window.innerWidth`.

"Visible" is per-character Range rects inside the title's visible box (its own box, clipped by clipping ancestors and the viewport, with an ellipsis's width taken off the right edge), not string length. Controls through the same probe: an unclipped box reads every character, a 90px clipped box reads under its length and above 0, and the real title reads under 40 at the three phone widths. Checked against the screenshots at 320 draft ("Acm…", 3), 390 published ("Acme Bakery …", 12) and 1280 draft (whole title).

| Width | Draft view (`?v=<draft>&ws=1`) | Published view (`?v=<v1>`) |
|---|---|---|
| 1440 | 40 of 40 | 40 of 40 |
| 1280 | 40 of 40 | 40 of 40 |
| 1279 | 40 of 40 | 40 of 40 |
| 1024 | 40 of 40 | 40 of 40 |
| 768 | 40 of 40 | 40 of 40 |
| 390 | 7 of 40 | 12 of 40 |
| 375 | 5 of 40 | 10 of 40 |
| 320 | 3 of 40 | 7 of 40 |

S3c.10's comparison re-runs `e2e/p1536-title-baseline.spec.ts` with `P1536_COMPARE=1`, which fails any cell below this table (the table is stored in the spec file as `BASELINE`). Screenshots: `.private/evidence/p1536-s3c/baseline/`. The 40-character title fits whole from 768 up, so those cells guard against a regression and say nothing about how a longer title behaves there; the phone cells carry the information.

#### Build order (each X gets its own failing test first)
0. The image route and the V control. A baseline table: one fixed title, font and zoom, visible characters and a screenshot per width, committed before the header changes.
1. B5.
2. X9 voice.
3. X10 and X11 (card read by thread).
4. S6.1's rule 9 and the gate changes, then X4 to X8 and X12, X13, X15.
5. X3, X14, X1, X2.
6. Undo (D7, client; the server's `canvas_draft_undo` exists).
7. S4: Add to chat, tags, chips.
8. S5: offers, switch, fork, dismiss, publish reply (the server functions exist).
9. The rest of S6, with S6.5's phases changed to X7's states.
10. Follow-ups 259, 261 and 263, then the real-model evals (S2, Q1 as INBOX-260, S5.1).
11. A verdict for every box.
12. J and J-W walks, then stage V, then the founder's UAT.

**S6.1's rule 9 becomes** [FOUNDER DECISION: wording, already pending in the design system]: "A button's look changes only when its meaning changes. Typing changes only the composer's Send. A page's single main action in a top bar (Publish, Share) is filled, auto width, furthest right, and may sit beside a filled Send; everything else in that bar is the secondary pill or rule 5. When an action is waiting, a status takes its spot. When there is nothing to act on, a status says so in the same spot. Never disabled." Rule 6's Share icon stays for cards.

**Tests that change premise here** (each noted in its commit): the W7 table test, the state-tag and spot tests, the Discard position, S3b.3's card and phone Clone cells, the Attach dialog's Canvases tab, W0's published and discarded cases, the Artifacts default tab, and the walkthrough spec's spot text.

### 4. Box definitions and Copy prompt (S2)

The v4 definitions below, with these fixes from review:

- **S2.3 fixture:** "a price with no unit or cadence", not "no customer count". The gap question asks for the missing part.
- **S2.4 fixture:** "I expected HR teams to renew after the pilot; 0 of 4 renewed, so I stopped selling to HR." It yields a Hypotheses I've falsified point and no HR Customer Segments point.
- **Copy prompt pasted back:**
  - The pasted text is an owner message (material) like any other.
  - The run reads its sections; the first becomes the focus.
  - Each further section becomes an offer (`other_canvases` entry).
  - A fork copies the owner's messages (J7), so the section text travels without a new field.


**One source.** A single module holds the nine definitions; the drafting prompt (`canvas-prompt.ts`), the
empty-box questions and the Copy prompt all read it. Today three places hold box text (`BOX_GUIDE`,
`BOX_BRIEF`, `DRAFT_RULES`) and they already diverge (w1 still says "How I'll know it's working" / "My values"
while main says "My next milestone" / "Guiding values", `main:src/lib/canvas-boxes.ts:24-25` [code]).

**Global rules (replace "every point is a falsifiable bet" and the competitor-swap test):**
1. **Grounding.** Every factual clause traces to the owner's material. Never invent numbers, dates, prices,
   motives or obstacles.
2. **Specificity.** Name observable actors, conditions, actions or terms. Reject category words ("small
   businesses", "social media", "affordable", "integrity").
3. **Differentiation only where claimed.** Write a competitive difference only when the owner claims one and
   gives evidence. A true sentence a competitor could also say is allowed.
4. **Statement type per box** (below): a fact stays a fact, a plan stays a plan, a target stays a target.
   Keep the owner's modality: considering, quoted, paid; planned, piloted, live.
5. **Partial beats empty.** Keep a supported part of a box and put the missing part in the box's gap question
   (`questions[box]`, shown to the owner under the box). A box is empty only when nothing in it is supported.
6. **Voice per box** (below). Customer Segments describes the customer and never starts with "I", "We",
   "My customers" or "I sell to".
7. **One sale loop** (D9): every customer-facing box is about this canvas's segment (or its roles). The three
   founder-fit boxes may hold business-wide points.

| Box (tag) | Type · voice | Definition | Shape | Good | Not | Empty / gap question |
|---|---|---|---|---|---|---|
| **Customer Segments** (`canvas:segments`) | Description · noun phrase about the customer | The specific people who have the problem and pay (or will), named by role, size or stage, what they do today and what makes it urgent now. Roles in one sale get one point each, starting "Pays:", "Uses:", "Approves:". | `<role + qualifier> who <do X today> <when trigger>` | "Owners of 1-3 independent cafés who do their own books after closing" | "I sell to small businesses" | "Who exactly has this problem, and what are they doing about it today?" |
| **Problem** (`canvas:problem`) | Observation about the customer · their perspective | Where the customer is now and what it costs (A), what they want (B), and what stops them (obstacle), before they have heard of you. | "Today <customer> <A + cost>; they want <B>, but <obstacle>." The obstacle is a barrier, not a missing product. A, B, obstacle may be partial. | "Today café owners sort a quarter of receipts in the week before the deadline; they want their books closed without losing evenings, but receipts pile up during 14-hour shifts." | "There is no simple bookkeeping app for cafés." | "Where are your customers stuck today, what do they want instead, and what stops them?" |
| **Solution** (`canvas:solution`) | Mechanism · first person, with status | What you do or hand over, and how it removes the Problem's obstacle. Untested effect says "intended to". | "I <do X>, which removes <obstacle> so they reach <B>." Status: planned / piloted / live. | "Owners photograph each receipt into a chat thread when they pay; I log it the same night, so nothing piles up before the deadline." | "Seamless AI-powered bookkeeping." | Gap if the obstacle link is missing: "Which obstacle in the Problem does this remove?" |
| **Go-to-market strategy** (`canvas:channels`) | Acquisition path · first person | Where this segment can be reached, the first action you take there, and which paths have brought customers vs. which are plans. Public platform names allowed; private people and firms by role only. | "<place> + <first action>; <result so far or 'not tried yet'>" | "I answer tax questions weekly in two café-owner Facebook groups; 4 of my 6 clients came via an espresso-machine technician who refers me." | "Social media and word of mouth." | "How did your last customer find you, and where do the next ones gather?" |
| **Offers & Pricing** (`canvas:revenue`) | Commercial terms · terms or "I charge" | What the customer buys, for how much, per what unit, how often, and its state (considering / quoted / paid by N). | "<offer>: <price + currency> per <unit> <cadence>; <state>" | "Monthly books and tax filing: 2,500 baht per shop per month; 6 shops pay this today." | "Affordable packages." | "What exactly does a customer buy, for how much, and has anyone paid it yet?" |
| **My next milestone** (`canvas:metrics`) | Target · first person | The next result customers produce (pay, renew, refer), with a number and a date. What you will change if you miss it, only if the owner says. | "I aim for <number> <customer action> by <date>[; if not, I <change>]." | "I aim for 10 cafés paying monthly by 31 March 2027." | "Launch the new website and grow." | "What number, by what date, would show this is working?" |
| **Guiding values** (`canvas:love`) | Decision policy · as written | A rule your business and partners live by, saying which good thing you give up when two good things conflict, and why. Both X and Y are good. Business culture, not a personal habit. | "X over Y, because Z." | "Intellectual honesty over winning the argument, because decisions built on hidden misunderstandings fail later." (P1589) | "Integrity and customer focus." / "I keep weekends for family." | "What does your business choose over something else it cares about, and why? Write it as 'X over Y, because Z'." (P1589) |
| **My current biggest challenge** (`canvas:good-at`) | Owner's constraint · first person | The obstacle you see as most likely to stop this working now: where you are (A, a number where the material has one), where you want to be (B), and what is in the way. Causes the material does not state are written as "I think". | "I'm at <A>, I want <B>, and the obstacle is <barrier>." | "I'm at 3 replies from my last 20 messages to café owners, I want 10 first calls this month, and I think strangers writing about money look like scams to them." | "Finding time." / a copy of the customer's Problem | "Where are you now, where do you want to be, and what is in the way?" |
| **Hypotheses I've falsified** (`canvas:world-needs`) | Evidence · first person, past | Something you expected, how you tested it, what happened against it, and what you changed (if you have). Old pivots land here only with what the owner says happened. | "I expected <X>; I <test + sample>; <result>; so I <change>." Decision may be missing (gap). | "I expected owners to want per-receipt pricing; I offered both to 5 prospects; all 5 chose the flat fee, so I dropped per-receipt." | "I learned customers value relationships." | "What did you expect that turned out wrong, and how did you find out?" |

**Copy prompt (D11).** One markdown file. Head: the global rules and the one-sale-loop rule in plain words.
Body: for each canvas, a section starting `This canvas is about <group>.` followed by the nine headings in
order, each with its definition and shape from the module above. Several businesses → several sections, first
the owner's stated focus. Pasted back, the first section drafts this canvas; every further section is recorded
as an other canvas (J7 buttons) with its section text kept as that canvas's material.

**Drafting prompt additions:** the D9 rule and focus order (text from [`features/research/one-canvas-cases-for-p1536.md`](../../research/one-canvas-cases-for-p1536.md) §4(i), with "Draft
a canvas for" replaced by D10's two actions); the scope rule (section 2); "later messages about a box win over
earlier ones"; schema order `focus, other_canvases, scope, actions, questions`.

---

### 5. Acceptance criteria

#### S1 Engine
- [ ] **S1.1 Send is atomic.**
  - One Send in an idle draft creates exactly one message and one `queued` `message` run in one transaction (fault-inject between the inserts: both or neither exist).
  - A repeat with the same `p_client_id` returns the first result and writes nothing.
  - The returned `run_id` is invoked by the client and moves to `running`.
- [ ] **S1.2 Transition table (§2), SQL tests per row.**
  - Every user RPC refuses with `busy` while a run is active.
  - A second canvas's Send refuses with `busy_elsewhere`.
  - Worker calls succeed on their own run: begin claims, complete/fail settle.
  - Worker calls return `gone` on a failed, expired or cancelled run and write nothing.
  - Concurrency: Send concurrent with completion (both orders), and Publish concurrent with Undo from two sessions. The loser gets `busy` or `stale_view`, never a partial write.
- [ ] **S1.3** A tagged message on box X changes only X. The model stub also returns:
  - an action for an untagged box;
  - a move whose source box is out of scope;
  - a question for an out-of-scope box.

  All are dropped and counted. Every other box's point ids, questions and pending links are identical before and after.
- [ ] **S1.4** An untagged message the stub scopes to Y changes only Y. A first draft fills across all nine boxes.
- [ ] **S1.5 Cap.**
  - The 30th used run applies. After it, Send refuses with `cap_reached` and writes no message.
  - Failed runs do not count; undone runs do.
  - At the cap with nothing to publish, the composer offers **Start over** (Discard), and the next Send opens a fresh draft.
- [ ] **S1.6 Inputs.**
  - Voice: begin returns `not_ready` until `transcript_status = 'done'`, then reads the transcript. `failed` fails the run with no model call and no charge.
  - Upload, in order, in one invocation: claim → extract → material written with `message_id` → the stub's request contains the extracted text.
  - An extraction failure fails the run in the same invocation (`unreadable` / `too_large`), and the spot leaves "Updating…" without waiting for a lease.
  - Try again after an extraction failure, and after a reload before the file was posted, returns `not_retryable`; the bubble reads "Send the file again."
  - Try again after a drafting failure re-uses the written material (assert on the request).
  - A material write for a failed run is refused (`gone`).
- [ ] **S1.7 Draft starts as its base.**
  - A draft opened from v2 holds v2's point ids before any run.
  - After a run touching one box, then Publish, v3 keeps the other eight boxes' point ids and other users' positions on them.
  - v2's `get_canvas` output is byte-identical before and after, except `superseded_by` on exactly the points v3 reworded
    (the version chain, P800) and v3's own tag on the points v3 kept (versions share a kept point). No `updated_at`,
    statement, story or position changes.
- [ ] **S1.8 Undo.**
  - After applied run N, Undo restores exactly the point set, questions, pending links and focus from before N, and the run's reply reads "Undone.". A second Undo restores before N-1.
  - A stale `p_expected_run` or revision refuses with `stale_view` and changes nothing.
  - **Regression (Codex 4):** set the price to €500, Undo, then send "add a yearly plan" tagged Offers & Pricing → the stub's request contains neither the undone message nor its reply, and no point contains 500.
- [ ] **S1.9 Focus eval** (a report, not a release gate).
  - 21 packs from [`features/research/one-canvas-cases-for-p1536.md`](../../research/one-canvas-cases-for-p1536.md), 3 real-model runs each. The oracle is the Codex blind labels.
  - The current `DRAFT_RULES` prompt is the known-bad control.
  - If the control scores within 2 of the new prompt, the eval is blind: change the packs.
  - The founder sees the numbers before release.
- [ ] **S1.10 J9.** On a draft about café owners, an upload about agencies (stubbed) moves no customer-facing box toward agencies, and focus stays café (a `message` run never changes focus). Founder-fit boxes may change.
- [ ] **S1.11 Origin for readers.**
  - Readers see `v3 · 29 Oct · from v1`.
  - A signed-out `get_canvas` returns `from_seq` for published versions only.
  - A first version shows no "from".
- [ ] **S1.12 Cleanup.**
  - After Publish (following a reword and an Undo), every ledger point is tagged v3 or deleted.
  - Engine stories of deleted ledger points are deleted; owner stories and v1/v2 points are untouched.
  - The same after Discard.
  - Steps are gone at both. SQL counts pasted.
- [ ] **S1.13 Replies.**
  - "Draft ready: N of 9 boxes." / "Updated:" + chips / "No box changed." + note.
  - No reply contains "What I decided on my own" or an empty-box question.
  - Unit test over `buildDraftReply`.
- [ ] **S1.14 Stale runs.**
  - A queued run past 3 minutes, or a running run past 5 minutes, is failed by the expire step at the start of any RPC or state read. The spot leaves "Updating…".
  - `canvas_draft_retry` creates one new run of the same kind: tested for a `message`, a `focus` and a `fork_first` run.
  - A second invoke of a running run makes no second model call.
- [ ] **S1.15 Authorization matrix** (SQL tests). Actors: the owner, another signed-in user, a shared-link reader and anonymous.
  - Tables and columns: `canvas_drafts` (new columns), `canvas_draft_runs`, `canvas_draft_steps`, `canvas_draft_points`, `canvas_draft_offers`, `canvas_draft_material` (incl. `message_id`, `source_material_id`), held points, `chat_messages.box_refs`.
  - User RPCs: `canvas_workspace_send`, `canvas_draft_retry`, `canvas_draft_undo`, `canvas_draft_switch_focus`, `canvas_draft_fork`, `canvas_draft_offer_dismiss`, `get_canvas_draft_state`, publish, discard.
  - Worker RPCs: not executable by `authenticated` or `anon` at all.
  - Only the owner reads or acts. Readers get `from_seq` only.
- [ ] **S1.16 Names filter** (§2 rule).
  - Owner-message cases: "Anna from Café Luna pays me" → no point, story, focus, offer, question, note or reply contains "Anna".
  - Other cases: lowercase "anna", a non-Latin given name on the list, and a label "Anna:".
  - The owner's own brand ("ClarityPledge helps…") and platforms ("Facebook groups") survive.
  - A failing focus is not stored; a failing offer is dropped.
  - On the S2.2 packs, report the count of points dropped by the filter, so false positives are measured, not guessed.
  - Known limitation stays in the spec.
- [ ] **S1.17** Context fitting never drops the trigger message: a pack at the token limit still carries it (assert on the request).
- [ ] **S1.18 Publish guards.** The server refuses `draft_empty` and `no_changes` (a draft undone back to its base) even when called directly.

#### S2 Box definitions + Copy prompt
- [ ] **S2.1** One module is the only source of box text. Prompt, questions and Copy prompt are byte-equal to it; titles equal `CANVAS_BOXES`.
- [ ] **S2.2** Real-model eval, 10 packs:
  - no Customer Segments point starts with "I", "We", "My customers" or "I sell to";
  - every Guiding values point matches `X over Y, because Z`;
  - every number in every point appears in the material.
- [ ] **S2.3** A price with no unit or cadence → an Offers & Pricing point with the price + a gap question.
- [ ] **S2.4** The renewal fixture (§4) → a Hypotheses I've falsified point, no HR segment point.
- [ ] **S2.5** A pasted two-section Copy-prompt file drafts section 1's group and records section 2 as an offer. Forking it drafts section 2's group from the copied messages.
- [ ] **S2.6** Founder signs off every §4 user-facing string (spec checkbox).

#### S3 Workspace + Publish bar
- [ ] **S3.1** At 1440 and 1280, canvas and chat sit on one screen. Add to chat, Send, Undo, chips and Publish never change `location.pathname`. Exception: fork landing goes to the new canvas.
- [ ] **S3.2** At 1279, 768 and 375:
  - `Canvas │ Chat` switch; both panes stay mounted;
  - scroll position, caret and unsent text survive switches;
  - BottomNav and the strip are absent;
  - ← per §2, including direct entry and reload.
- [ ] **S3.3** The Publish spot has the same bounding box (±1px) in both views and all five states, at 375 and 1440. It is a `<button>` only in the Publish state and never `disabled`.
- [ ] **S3.4** Typing changes no button except the send slot (S6.2).
- [ ] **S3.5** No empty band: the pane top equals the bar's bottom at scroll 0 and after scrolling.
- [ ] **S3.6** The byline holds no buttons. At 375 and 320 the name breaks only between words, and long box headers with Add to chat do not overflow at 320.
- [ ] **S3.7** Columns follow the container: <520 → 1, 520-719 → 2, ≥720 → 3.
- [ ] **S3.8** Changed shows per D6, on owner draft views only.
- [ ] **S3.9** Screenshots at 1440, 1280, 1024, 375, 320 of:
  - published (owner);
  - Chat composing;
  - Canvas updating;
  - mixed reply;
  - J4 sheet;
  - J10 publish reply;
  - Chat with the keyboard open (WebKit mobile emulation).

  A separate visual-QA subagent checks them.

#### S3b Founder walkthrough fixes (§3b)
- [x] **S3b.1 (B1, B2)** Each bug is reproduced first, with the reproduction recorded in the spec. Each gets a test that fails before the fix and passes after:
  - B1: a fixture with a successful run plus the reproduced upload result shows no failure toast;
  - B2: after the run settles (stub), the surface leaves "Creating your canvas…" within the existing poll interval and never shows "Draft not available" for an open draft.
- [x] **S3b.2 (W0)** No owner route renders the old tray controls: Create canvas, Update draft, "Creating your canvas…", "N messages from you", or the "…" Discard (render test over the workspace and the mirror chat).
  - Old `/chat` canvas-thread addresses resolve per W0, with one test for each of the five cases.
  - Forwarded/clarify copies still reach a run (an existing engine test stays green).
- [ ] **S3b.3 (W1)** (All verified except one line: Add to chat and reply chips have no client UI yet, S4, so "flip the switcher" cannot be walked. See the §3b build record.) Each entry point ends with pathname `/p/:handle/canvas/:tag`, with `ws=1` exactly per W1 and the expected version selected (asserted separately for New canvas, mirror + Canvas, Clone, Drafts row, card Open with/without a draft, old address, Mine).
  - A published view with nothing being edited has no panel, Thread button or switcher.
  - After Publish, the URL is `?v=<new>` with no `ws=1`.
  - At 1440 the panel is open; closing and reopening it keeps the unsent text.
  - At 375 the switcher selects Thread for a new canvas and Canvas otherwise.
  - Add to chat and chips flip the switcher at 375 and open a closed panel at 1440.
  - ← without in-app history goes to Artifacts › Canvases.
- [x] **S3b.4 (W3)** Clone shows only on an owner's published version.
  - **Tap, then cancel:** no row in `canvas_drafts`, `canvas_versions`, `chat_messages` or `canvas_draft_runs` is created or changed for that owner (compare `count(*)` and `max(updated_at)`/revision before and after).
  - **First Send:** creates the draft.
  - **Same-base draft:** Clone opens it. **Other-base draft:** J4 applies, including its threshold.
- [x] **S3b.5 (W4, W5)**
  - Header and card show the state; the card has Open; the panel has no Open.
  - Drafts / Mine / Shared with me follow W5; a canvas with neither is in no tab.
- [x] **S3b.6 (W6, W7)** For each row of the W7 table, the rendered primary buttons equal the table's. Copy prompt counts as the Thread pane's primary, so a closed panel or the Canvas tab shows zero primaries, never two. The p955-gate passes.
  - Clone, Share, Discard, Open, Thread and the picker use the one named secondary constant.
  - The picker has a chevron and `role=combobox`.
  - Discard sits in the panel header and follows W6 for both cases.
- [x] **S3b.7 (W8)** The header follows W8 at 1440, 375 and 320: no horizontal overflow, Share labelled, no "Clarity Canvas", height equal ±1px for draft and published, and the Publish spot's box unchanged.
  - **Rename:** the RPC refuses non-owners and empty or >60-char titles. The new title shows in the header, Artifacts and cards, and the URL is unchanged.
- [x] **S3b.8 (W9)** A point with no positions renders no "No position yet".
- [x] **S3b.9 (access)** An owner-attendee gets W1-W8 on their own canvas. A shared reader, an attendee on another's canvas and a signed-out visitor get none of the W-controls, and their picker lists published versions only.
- [x] **S3b.10 (Q1)** A labelled fixture set in the S2 eval, with one case per dimension, scored by the existing S2 checker extended with a Q1 rule:
  - segments missing the role, or carrying fewer than two other dimensions, fail;
  - complete ones pass.
- [x] **S3b.11** Before UAT: a table of J-W1 to J-W5 × {1440, 375} with pass/fail and a screenshot path per cell; the visual-QA subagent's findings with a disposition for each; and `<received> of <spawned>`.

#### S3c Founder walkthrough 2 (§3c)
- [ ] **S3c.1 (B5)** The RPC test fails before the fix and passes after. A draft opened from a version with points holds them and shows no Changed. Each regression case in B5 has a test. Control: a new canvas with no base is still empty.
- [ ] **S3c.2 (X1, X2)** Sidebar entries and order as X1 at ≥1024, expanded and collapsed. Partners and Groups appear after opening the avatar menu; both pages show the avatar active. A pending invitation shows on the avatar, with the count in its accessible name. The phone bar and Me sheet are unchanged. The chat-list + has the secondary look at 1440 and 375.
- [ ] **S3c.3 (X3)** The + shows beside the paperclip on the mirror's main composer at 1440, 375 and 320 with no overflow, and on no thread or other chat. New canvas lands as J-W1. Clone a version has one test each for: no draft, same-base draft, other base touched (J4 sheet), other base untouched (replaced only in the first Send's transaction, with stale revision recovery). Tap then cancel writes nothing (table compare as S3b.4). The paperclip dialog has no Canvases tab, the "…" menu has no New canvas, and a canvas thread's upload is the paperclip.
- [ ] **S3c.4 (X4 to X7)** A render test iterates every row of the header table, asserting items, order and which one is filled. The spot's box staying put across rows is checked in Playwright. Publish cases: points and a difference shows it; all points removed does not; failed newest run with a difference does; at the cap with a difference does; draft A with a run active on draft B does. `no_changes` and `draft_empty` return the spot to "Nothing to publish yet". Every row marked so in the table shows that text in the spot. Share never renders on a draft. "No changes yet", "Not published yet", "Published · vN", "Nothing published yet" and "from vN" do not render in the header. The p955-gate passes.
- [ ] **S3c.5 (X8)** The panel header shows the mirror's face and name with "Your mirror agent", read from the owner's mirror: a grep finds no hard-coded mirror name in the canvas surfaces, and a fixture whose mirror has a different name shows that name. The line shows on a pending Clone and after first Send, with no root card in the panel. After cancel and after first Send, `chat_messages` holds no such row.
- [ ] **S3c.6 (X9)** The voice button shows on a draft, a pending Clone and a new canvas; Copy prompt renders secondary. A first voice note creates exactly one draft, thread, message, run and transcription, including after a lost response and on concurrent commits. Invalid or missing audio is refused and writes nothing. A control where a note posts with no run fails the test. The new function refuses a call that is not the service role, and cannot act for another owner. The run begins only after the transcript is done, with the tab closed as well. A failed transcript fails the run with no model call and no charge, also with the tab closed. A failed dispatch recovers. Walked once with a real recording on hosted TEST.
- [ ] **S3c.7 (X10)** Fixture: Clone v1, Send. The card reads (Draft) v2 and Open draft opens the workspace. After Publish it reads v2 and View opens v2 with no `ws=1`, also while another draft is open. Two threads cloned from one base, one discarded and one published, each show their own state. A root with no draft row uses the attached version.
- [ ] **S3c.8 (X11)** "N replies" shows on a canvas root with replies, singular at 1, hidden at 0. A draft's opens the workspace thread. A published or discarded one opens the chat's own panel in place with no composer, upload or voice, the closed line, and working offer rows. An open draft's old address still redirects; a published or discarded one's stays readable. Another viewer gets the existing unavailable state.
- [ ] **S3c.9 (X12)** The removed sentences do not render; a reader of an empty canvas sees "This canvas has no points yet." An update that empties a box the base had shows Empty and Removed; a changed box with points shows Changed; a first canvas shows neither.
- [ ] **S3c.10 (X13)** At 375 and 320: rows as X13 (including a pending Clone and a version picked from a draft, whose row 2 has Go to draft), no overflow, Discard labelled, the switcher's active side in the selected look, and equal height for owner draft and published when both are two rows ±1px. The one-row measurement is reported. A reader's header is one row. A pending Clone opens on Thread with the line visible and the composer not focused on landing, so no keyboard opens by itself (X13's fallback), proven in Chromium at phone widths and a keyboard-sized screen; landing on an existing draft opens on Canvas. Founder, 2026-11-02: the WebKit shot is withdrawn, because Playwright's WebKit cannot show a real iOS keyboard. Real iPhone Safari stays unchecked, a known limit. The fixed title shows no fewer characters than step 0's baseline at any width, and rename stays reachable.
- [ ] **S3c.11 (X14)** Bare `/artifacts` opens Canvases > Mine; `?tab=letters` opens Letters. A grep finds no letter page linking to bare `/artifacts`; `/letters` and back from letter results land on Letters. Mine and Drafts rows read as X14.
- [ ] **S3c.12 (X15, wording)** The Publish toast is the reply's first line. With an offer, the retention sentence is visible without opening anything and See offer opens the thread. Saving a rename shows its line. Each row of the wording table renders as written.
- [ ] **S3c.13 (V)** The control's results for both critics; the state × viewport table; both critics' findings with the critic's severity and a disposition each; proof Gemini received images (served model, image count, and that it reported things only visible in them); `<received> of <spawned>`.
- [ ] **S3c.15 (J11, W4; the founder's "I need a button to go there")** From the mirror chat, the Publish reply carries **Open canvas**, and a closed thread's "Published as v3." carries it too. Each goes to that published version with no `ws=1`, at 1440 and 375.
- [ ] **S3c.14 (scope)** Gate 2.5 passes: no unticked box remains in the spec, and every deleted one has its replacement named in prose.

#### S4 Add to chat tags
- [ ] **S4.1** The owner sees Add to chat (≥44px) on nine boxes, on draft and published. A viewer and a signed-out visitor see none.
- [ ] **S4.2** Tag behaviour:
  - A tap inserts the tag at the saved caret and focuses the composer synchronously in the tap handler.
  - Two taps give two tags. Backspace after a tag removes the whole tag.
  - Verified in Playwright WebKit + Chromium mobile; the founder checks on a real phone at UAT.
- [ ] **S4.3** A sent message stores `box_refs` (validated subset of `_canvas_box_tags()`) and renders tags as chips. A forged value is refused.
- [ ] **S4.4** On a published canvas:
  - Tap and leave → `canvas_drafts`, `canvas_versions`, `chat_messages` counts unchanged.
  - The first Send → one draft, one thread, one message, one run.
  - Same for a first upload and a first voice note.
- [ ] **S4.5** J4: the sheet appears only for a different base with ≥1 message. "Start over" discards inside the first Send's transaction. A stale revision → `stale_view` with the text kept.
- [ ] **S4.6** `grep -rniE "new version" src/app` over user-facing strings returns 0. `canvas-new-version-button.tsx` and its importers are removed.

#### S5 Mixed material and the second canvas
- [ ] **S5.1 Offer row (real model).**
  - A two-business pack: the first line names both groups, the chosen one and why, then exactly one offer row.
  - A referrer/investor-only pack shows no offer.
- [ ] **S5.2 Focus switch.**
  - Same draft, one `focus` run.
  - A malicious stub that `keep`s café points in Offers & Pricing has them refused. After the run, no customer-facing box holds a point from before the switch.
  - Café becomes an offer.
  - Undo restores café as focus, its points, and deletes the café offer row.
  - A failed focus run leaves focus, offers and points untouched.
  - Switch → Undo → switch again works.
  - Switch → Undo → fork agencies works; the agencies offer is `offered` again after the Undo.
- [ ] **S5.3 Fork.**
  - Creates a new canvas, draft and thread, and a queued `fork_first` run (its `run_id` is returned and invoked). The owner lands in the new workspace.
  - Its input is `_canvas_draft_effective_input` of the source:
    - owner files, links and done messages (voice as transcript);
    - never a failed or undone message;
    - never a forward/clarify copy (assert on the copied rows).
  - **The fork's first run request contains the seed material** (assert on the stub's request, not only on the copied rows). A later run in the fork and a second-generation fork include it too.
  - The offer becomes `started` with Open. A second tap or a second tab opens the same canvas and never forks twice.
- [ ] **S5.4** A three-business pack → one row per other group, max 3. A later run naming "agencies" again adds no second offer.
- [ ] **S5.5** = S1.10.
- [ ] **S5.6 Retention (moved clock).**
  - Publish with an open offer sets `material_until = published_at + 30 days − 1 hour`, and the publish reply carries the offer.
  - At `material_until` + 1 minute, a fork refuses `expired` and the state read shows `material_expired` before the job runs.
  - The hourly job then deletes the rows.
  - Start or dismiss of the last offer deletes at once.
  - With no offer, Publish deletes as today.
- [ ] **S5.7 Offers survive.**
  - Scoped runs, Undo of later runs and focus switches never change a `started` or `dismissed` offer.
  - Fork → Undo → tap again opens the existing canvas.
  - Dismiss while a run is active refuses with `busy` (S1.2). A focus run whose target is no longer `offered` at complete fails `not_offered` and changes nothing.
- [ ] **S5.8 Erasure by construction.**
  - A source thread with a clarify copy from person X → fork. The fork's material and first run's `derived_refs` contain nothing of X.
  - `erase_chat_data_for(X)` leaves the fork untouched and cancels X-derived runs in the source (existing).

#### S6 Design-rule codification
- [ ] **S6.1** `docs/design-system.md` Button Decision Rules gains rule 9 (text below). No `.claude/rules` edit is needed.
- [ ] **S6.2** `assertStableVariantsOnInput(container, composer)`:
  - keys buttons by DOM node identity;
  - excludes the element marked `data-composer-send` (the send slot, including the P1576 mic/Send swap);
  - fails if any other button changes variant, mounts or unmounts on composer input.
- [ ] **S6.3** Gate 7 proof on the REAL `canvas-thread` fixture, with `openerIsPrimary`'s `!composing` restored (mutation of real code): non-zero. Fixed code: zero. Exit codes pasted.
- [ ] **S6.4** Gate 7c: run over every `/tree/_gate/*` phase that renders a composer. Existing violators are fixed; no other fixture newly fails.
- [ ] **S6.5** New gate phases: workspace Canvas, Chat composing, busy, Published status, No changes yet, J4 sheet, mixed reply, J10 reply.


**Rule 9 text (design-system.md):** "A button's look changes only when its meaning changes. Typing changes only
the composer's Send. A screen's main action pinned in a sticky top bar (Publish) is filled, auto width, and may
sit beside a filled Send. When an action cannot run, replace it with a status in the same spot; never disable
it."

---

### 6. Database and migration changes

**Verified facts (2026-10-29):**
- Today `_canvas_draft_run_complete` clears and re-inserts every point; every action INSERTs a new point (reword migration `:166-168` [code]).
- `_canvas_draft_clear_points` finds created points by draft tag (versions `:403-445` [code]).
- Material rows are only the owner's files and links: `kind IN ('file','link')` (versions `:276` [code]).
- Copied chats are read from the thread at run begin (runs `:362`, `:402` [code]).
- One active run per owner is a unique index (versions `:257` [code]).

| Slice | Change |
|---|---|
| S1 | **`canvas_drafts`** gains `revision integer NOT NULL DEFAULT 0`, `focus text`, `material_until timestamptz`, `source_draft_id uuid`. `focus` joins the owner column grant. `decided`/`tensions` are no longer written. |
| S1 | **`canvas_draft_runs`** gains `trigger_message_id uuid REFERENCES chat_messages ON DELETE SET NULL`, `scope text[]`, `target_offer_id uuid`, `client_id uuid` (unique per owner, for idempotency), `reply_message_id uuid`. `kind` becomes `message \| focus \| fork_first` (old rows `draft`/`extract`/`tensions` stay readable). State gains `'undone'`. **The one-active-per-owner index is kept.** |
| S1 | **New `canvas_draft_steps`** `(draft_id, run_id, point_ids uuid[], questions jsonb, pending_links jsonb, focus text, new_offer_ids uuid[], created_at)`. Closed to clients. Deleted at Publish/Discard. |
| S1 | **New `canvas_draft_points`** `(draft_id, run_id, point_id, story_ids uuid[])`. Closed to clients. Never deleted by Undo. |
| S1 | **New `canvas_draft_offers`** `(id, draft_id, group_label, why, state CHECK (state IN ('offered','focused','started','dismissed')), started_canvas_id, created_run_id, created_at)`. Read only through `get_canvas_draft_state`. |
| S1 | **`canvas_draft_material`** gains `message_id uuid REFERENCES chat_messages ON DELETE CASCADE`, `source_material_id uuid`, `origin text NOT NULL DEFAULT 'message' CHECK (origin IN ('message','fork_seed'))`. `kind` gains `'messages'` (the fork's "Your messages" row). |
| S1 | **New `canvas_workspace_send(p_canvas, p_from_version, p_expected_draft, p_expected_revision, p_replace, p_body, p_box_refs, p_attachment, p_client_id)`**. Atomic and idempotent. Text, upload and voice; voice calls P1576's voice insert helper (refactor `send_voice_note` to share it if none exists). Replaces the client's `canvas_draft_open` + send pair. Inside it, a new draft tags every private base point (legacy public points: existing private-copy rule). |
| S1 | **New `_canvas_draft_effective_input(p_draft, p_run)`**: the one selector for runs and forks (§2). |
| S1 | **`_canvas_draft_run_begin`** works by `p_run`: readiness check (`not_ready`), claim, spend reservation, input via the selector. `c_revisions` 5 → 30 over used runs. |
| S1 | **`_canvas_draft_add_material`** takes `p_run` and `p_message`. It writes only for a `running` run of that draft (existing late-write rule). |
| S1 | **`_canvas_draft_run_complete`** gains `p_scope`, `p_focus`, `p_other_canvases`, `p_note`. Order: step, then scoped apply (focus-run rebuild), then per-box merge, then offer merge, then ledger, then reply with `run_id`, then revision. It no longer calls `_canvas_draft_clear_points`. |
| S1 | **New user RPCs** (signatures in the §2 transition table): `canvas_draft_retry`, `canvas_draft_undo`, `canvas_draft_switch_focus`, `canvas_draft_fork`, `canvas_draft_offer_dismiss`, `get_canvas_draft_state(p_canvas)`. **Replaced:** `canvas_draft_publish(p_draft, p_expected_revision)`, `canvas_draft_discard(p_draft, p_expected_revision)`. `canvas_draft_run_expire` is internal only: the expire step runs at the start of every RPC listed in §2. |
| S1 | **Publish** sets `canvas_versions.from_seq`, cleans up by the ledger, applies the retention rule and posts the publish reply (D17). |
| S1 | **Caps (D18)** in `_mirror_limits`: `person_canvas_daily_count` 60, `person_canvas_daily_usd` 6.00, `global_canvas_daily_usd` 45.00. `global_reply_daily_usd` (5.00) and `global_total_daily_usd` (50.00) unchanged (runs `:67-81` [code]). |
| S1 | **`get_canvas`** returns `from_seq` for published versions to every reader. |
| S1 | **Names filter** (`canvas-names.ts`): owner messages feed `strong` via a bundled given-name list (new data file, no dependency) and the three patterns in §2. |
| S4 | `chat_messages.box_refs text[]` (null, or a non-empty subset of `_canvas_box_tags()`). Written only by `canvas_workspace_send`. `forward_chat_message` drops it. |
| S5 | **pg_cron hourly** `_canvas_draft_material_expire()` (pattern: `20260909120000_p1283…` [code]). |

**House rule:**
- Every replaced function restates its grants and is diffed against its latest live body.
- The guard test in `p1536-draft-versions-migration.test.ts` ("newest definition keeps the P1536 edits") is extended to every function replaced here.

#### Review ledger

**v4 reviews:** Gemini 4 Argon 6 HIGH + 6 MEDIUM; Codex 13 HIGH + 5 MEDIUM. Answered in v5.

**v5 reviews:** Gemini 4 Argon 7 HIGH, 5 MEDIUM, 3 LOW; Codex 7 HIGH, 5 MEDIUM, 13 earlier re-checked. Answered here.

| v5 finding | Answer in v6 |
|---|---|
| C-1: the universal busy refusal blocks the worker | §2 transition table: user vs worker rows, own-run checks. |
| C-2: late conversion writes after expiry | Late writes refused for a non-running run (existing pattern, now for upload and voice). Extraction runs inside the run's invocation. |
| C-3, G-H7: Undo or later runs erase offer state | `canvas_draft_offers` relation; merge rule; Undo never changes started/dismissed (S5.7). |
| C-4: daily job breaks 30 days; fork copies | Time-enforced expiry on read/fork, hourly job; a fork's copy is the new canvas's own material (§2 Retention, S5.6). |
| C-5: owner-message names bypass | Given-name list + patterns on owner messages; brands kept; drops measured (S1.16). |
| C-6, G-H3: fork provenance | By construction: a fork copies only owner text via the one selector; no forward/clarify (S5.8). Gemini's premise (copied chats stored as material, `kind='message'`) is false: material is `file`/`link` only (versions `:276` [code]). |
| C-7: focus switch leaves mixed focus | Customer-facing rebuild; `keep` refused; malicious-stub test (S5.2). |
| C-8, G-L1: signatures disagree | One table in §2 with every parameter. |
| C-9: failed/undone input in forks | The one selector (§2). |
| C-10, G-M1: cap dead end; "applied" ambiguity | used vs applied defined; Start over at cap; empty scope mutates nothing. |
| C-11, G-M2-v4: admission after queueing | One active run per owner, checked at enqueue (`busy_elsewhere`). |
| C-12: `?ws=1` premise false | S3 changes the predicate explicitly. Composer revealed then focused in the same gesture (S4.2). |
| G-H1: upload/voice outside send | Both go through `canvas_workspace_send` (§2 Inputs). |
| G-H2: stale deadlock; retry for focus/fork runs | Expire step inside every RPC; retry by failed run id (S1.14). |
| G-H4: Publish of an empty or unchanged draft | Server `draft_empty` / `no_changes` (S1.18). |
| G-H5: undone replies in context | Replies are never model context; undone replies rewritten (S1.8). |
| G-H6: orphan engine stories | Ledger carries `story_ids`; cleanup at Publish and Discard (S1.12). |
| G-M3: unfiltered focus persisted | Focus stored only after the filter. |
| G-M4: offers on a closed draft | `get_canvas_draft_state(p_canvas)` returns the newest closed draft's offers. |
| G-M5: "no separate $5 chat bucket" | False: `global_reply_daily_usd` 5.00 exists (runs `:71` [code]). Monthly cap is F3. |
| G-L2: focus mutated before completion | `target_offer_id` on the run; applied at complete. |
| G-L3: untouched-draft definition | Drafts are created only by send or fork, so an open draft always has a message or a run; J4 checks `EXISTS(message OR run)`. |

**v6 reviews (round 3):** Gemini 4 Argon READY with 2 MEDIUM; Codex REVISE with 2 HIGH + 3 MEDIUM. All folded in:

| v6 finding | Answer |
|---|---|
| Gemini 1: failed transcript waits for the lease | The expire step and begin fail it at once (§2 Lifecycle). |
| Gemini 2, Codex 11: retry/focus/fork lack `busy_elsewhere` | Added to every row that creates a run. |
| Codex N1: upload readiness is circular | Upload invocation claims, then extracts, then writes material, then drafts (§2 Inputs, S1.6). |
| Codex N2: the selector cannot see fork seed rows | `origin = 'fork_seed'` rows always included; first-run request asserted (S5.3). |
| Codex N3: failed upload has no retry payload | `not_retryable` + "Send the file again." when no material was written; otherwise retry re-uses it (S1.6). |
| Codex N4: dismiss contradicts the busy rule | Dismiss follows the lock protocol; focus re-checks its target at complete (S5.7). |
| Codex N5: Undo consumes the switch target | `focused` state, reversible by Undo (§2 Offers, S5.2). |
| Codex: 30-day deletion can overrun by an hour | `material_until = published_at + 30 days − 1 hour`. |
| Codex: names guarantee is not absolute | Kept as a Known limitation; privacy wording softened (F2). |
| Codex C1: Publish after a failed message | Allowed; that message is not in the version (§2 Publish spot). |

**Round 4 (narrow Codex check of the round-3 fixes):** N1-N4 and three items CLOSED; N5 and the 30-day AC were PARTLY because of two text mismatches (offer state domain missing `focused`; S5.6 still said 30 days). Both fixed.

---

### 7. Risks and non-goals

| Risk | Label | Note |
|---|---|---|
| A ~30-60 s wait before the next Send (UNVERIFIED latency) | ACCEPT | Founder D15. Owner keeps typing. Measure real latency on TEST in /dev. |
| A run left queued when the client closes, until the next open | ACCEPT | Owner-only state. Lease expiry on read (S1.14). No cron needed. |
| Model scopes an untagged message wrongly | MITIGATE | Server enforces scope. Undo is one tap. |
| Names filter is heuristic | MITIGATE | Applied to every generated surface (S1.16). Known limitation stays in the spec. |
| Kept material after Publish (≤30 days, only with an open offer) | MITIGATE | Time-enforced expiry plus an hourly job, deletion on start/dismiss, privacy sentence updated (F2). |
| Publish filled beside a filled Send | ACCEPT | Founder D3; neither is full width. |
| Origin shown to everyone reveals restarts | ACCEPT | Founder D8. |

**Non-goals:**
- on-screen point editing;
- redo;
- per-box diff view;
- version naming or deletion;
- drag and drop;
- an Artifacts menu entry for offers (v4 J10);
- batching messages;
- server-dispatched runs (pg_net);
- per-box threads;
- removing the tension functions (later migration);
- keeping material for every canvas (INBOX-239).

---

### 8. Open founder decisions (minimal)

- **F1** [FOUNDER DECISION: every quoted user-facing string in §3–§5.]
- **F2** [FOUNDER DECISION: privacy wording.]
  - The current draft sentence (Open Question 2) says drafts "do not quote or name other people". The filter is a heuristic (S1.16 Known limitation), so the proposed wording is "are written to avoid naming other people".
  - Retention addition to Open Question 2: "If your material covers another business, the text read from your files is kept privately until you start or dismiss that canvas, for at most 30 days after you publish, then deleted."]
- **F3** [FOUNDER DECISION: the monthly Google spend cap on the prod canvas key.] Read 2026-10-29 with `ai-keys --collect-budgets`:
  - Canvas drafting has its own key, `CANVAS_DRAFT_GEMINI_API_KEY` (`supabase/functions/canvas-draft/index.ts:46` [code]).
  - TEST key `cp-canvas-test`: monthly cap CONFIGURED (amount in `.private/`).
  - Prod has no canvas key yet; the Pre-deploy checklist issues one.
  - The mirror chat runs on a separate key (`cp-mirror`, with its own cap), so a tripped canvas cap never stops chat replies.
  - Proposed: a monthly cap on the prod canvas key that covers two fully used event days plus normal use (amount in `.private/`). When it trips, drafting pauses until the 1st with the existing "capped" reply.
- **Before the S1.9/S2.2 real-model evals:** raise the TEST canvas cap enough for about 160 runs (amount in `.private/`). The agent sets it in the Cloud console per `/slava:util:ai-keys`, then runs `--confirm-cap`.

---

### 9. Cost budget delta

**Enforced limits (the bound):**
- Per run, a $0.27 reservation, settled to actual (existing).
- Per person, 60 runs and $6.00 a day.
- Shared canvas bucket, $45 a day; whole mirror, $50 a day.
- Per draft, 30 used runs (undone runs count; Undo does not restore capacity).
- Per owner, 1 run at a time.

**Charging rules:**
- Extraction and transcription are charged in their own buckets, as today.
- A failed call is charged its actual cost, or the full reservation when it may have been billed (existing `failureUsd`, `supabase/functions/_shared/canvas-run.ts:80` [code]).
- Retries are new runs.

**Expected (UNVERIFIED, measure on TEST in /dev):**
- ≈ $0.10 per run, so ≤ $3 per fully used draft.
- An event of 20 owners × 6 runs ≈ $12.

**Test traffic per run (metered-services rule 6):**
- The live v6 suite (`src/tests/integration/p1536-v6-engine.test.ts`) runs on the active TEST server, which is the self-hosted one today, so it spends no Supabase organisation quota. Run against hosted TEST (opt-in), it counts against TEST's free quota.
- The two live files create and delete 68 test owners (57 in the v6 suite, 11 in the legacy suite); their auth calls are inside the counts below.
- The two cap tests drive 30 runs each and are bounded at 40 iterations; they fail on any worker status other than ok.
- Bulk setup is one request per batch (rule 1): ageing a draft's runs is one upsert, not one PATCH per run, and each file deletes all its test users in one call.
- **Measured, one full run (2026-10-30, after the P1592 merge, self-hosted TEST).** Each live file imports the counting fetch wrapper first, so every client is
  counted, user setup and teardown included. Vitest isolates files, so each file prints its own line:
  - v6 suite: 1,972 requests, 115 of them auth, 2,863,231 response bytes, 115 failed responses (status ≥ 400).
  - Legacy suite: 434 requests, 19 auth, 204,277 bytes, 44 failed.
  - Together: 2,406 requests and 3,067,508 bytes (≈3.1 MB, ≈1.3 KB per response). The model is stubbed, so $0.
- **Log lines (rule 5):** one access line per request, plus about one error line per failed response (the suites
  provoke refusals on purpose). That is 2,406 + 159 ≈ 2,570 lines per run.
- **Against hosted TEST's free plan** (egress 5 GB/month, metered-services registry):
  - One run is 3.1 MB / 5 GB ≈ 0.06% of the month's egress.
  - Runs per month × 3.1 MB: 100 runs ≈ 310 MB ≈ 6%. That fits today, and fits at 10x (≈62%).
  - On the self-hosted TEST server the run spends no Supabase quota, and its logs stay on that server.
  - Log ingestion on hosted TEST cannot be checked: the registry row gives no ingestion figure (P1530 reads it from the
    dashboard). So the live suite runs on the self-hosted server by default, and a hosted-TEST run stays opt-in until
    P1530 supplies the limit.
- The real-model evals (S1.9, S2.2) ran on hosted TEST with the canvas test key: 21 packs × 3 runs × 2 prompts + 10 packs ≈ 136 runs, inside the raised test cap (F3).

## Solution

> **Superseded where it conflicts with "Design v6" above.** Kept as the v1-v3 history.

1. **Input.** The owner gives any mix of: files (PDF, deck, document, markdown, text), links
   (website, offer post, profile), and a free-text note ("what I sell, to whom"). Everything is
   converted to text (markdown) before the agent reads it.
2. **Draft.** *Amended 2026-10-28 (founder): points only, no stories. A story under each point would be the
   model's paraphrase signed as the owner's; the owner adds their own stories on the canvas. The quote check below
   is unchanged.* The agent drafts the P1535 nine boxes as the owner's points, each with the owner's
   story in their voice, quoting or paraphrasing only what the material says. It writes **bets, not
   marketing**: "Agency owners with 5-20 staff will pay X for Y" rather than the site's slogan
   (P1535 found that self-description invites fluff). A box the material says nothing about stays
   empty and is shown to the owner as a question.
3. **Write.** One server-side call creates the canvas (P1515's canvas record) and its points,
   stories and the owner's own positions as **private**, in the owner's account, in one batch. This
   is the seed script's write logic moved server-side; P1515's w11 branch already has a private-points
   version of the seed (commit `1d7119934`).
4. **Review.** *Amended 2026-10-26: see "Versions, drafts and updates" below.* The draft is a
   **draft version**, visible only to its owner. The owner revises it in the thread; **Publish**
   makes it a version the canvas's audience reads. Re-running before Publish replaces the draft's points.

**Where: amended 2026-10-22 (founder). The draft happens in a thread with your mirror.**
Steps 1-4 above (the engine) are unchanged; only the entry point and the input path move.

- **+ Canvas** (the Artifacts page's create menu, P1545) and the event preparation's "Draft my
  canvas" step both open a **new thread with the owner's mirror** (threads in the mirror: P1546).
  The mirror opens the thread by asking for material: files, links, a note.
  *P1545 (founder, 2026-10-23):* the Artifacts page shipped its **New artifact** menu with Letter only; Canvas was left out because no create path existed. This spec adds the **Canvas** item to that menu (`src/app/pages/artifacts/artifacts-header.tsx`). The label stays "New artifact".
- **Upload in chat.** The composer gets an upload control next to the existing paperclip
  (`src/app/pages/chat/Composer.tsx:188`, today "Attach a point or story"), available in mirror
  threads. Files are converted to text (markdown) server-side and the originals are not kept
  (Invariant). Links and the note are ordinary messages in the thread.
- **The mirror runs the draft** when the owner says so in the thread (a "Draft my canvas" action
  under the mirror's reply, not a keyword), and replies with the result: a link to the canvas,
  the boxes left empty as questions, and any input it could not read.
- **Corrections after the first draft** are further messages in the same thread. Re-running before
  sharing replaces the draft (step 4).

> Founder, 2026-10-22: "when a person says new Clarity Canvas it opens a new thread with your Mirror
> Agent and the Mirror Agent says, hey, you know, upload stuff ... upload button near the paperclip
> where you can attach things or upload markdowns or whatever."

**Depends on P1544** (the mirror on prod and its privacy text) **and P1546** (threads in the mirror). Founder,
2026-10-22: "make the mirror launch before". The engine (steps 1-3) can be built and tested on the
test database in parallel; nothing goes live before P1544 is live.

[FOUNDER DECISION: the mirror's opening line in a new canvas thread, the upload control's label,
and what the thread says about where the material goes.]

## Versions, drafts and updates (founder, 2026-10-26)

> **Superseded where it conflicts with "Design v6" above.**

Creating and updating are one engine: every run makes a new **draft version** of the canvas.

1. **Draft, then publish.** A draft version is readable only by its owner. **Publish** turns it
   into a version the canvas's audience reads (P1515: sharing belongs to the canvas, so no
   re-sharing). Before publishing, the owner revises in the thread and each revision replaces the
   draft's points. A draft that is never published stays private. Deleting versions is out of scope.
2. **One thread per draft.** After Publish, a further change request in that thread gets: "This
   version is published. Start a new version?" with a button. The button opens a **new mirror
   thread** with the published version already attached, exactly as if the owner had picked it from
   the paperclip. Nothing starts quietly.
3. **Paperclip lists canvas versions** next to points and stories, so a new thread can start from
   any version, not only the newest.
4. **Version labels are automatic** ("v1", "v2", … plus the date). The owner never names a version.
5. **Two speeds, chosen by the owner each time.** *Superseded 2026-10-28 (founder, after testing v2): one button
   that drafts straight away (the fast speed below), and the mirror's reply lists "What I decided on my own". The
   owner corrects by replying and tapping Update draft. The question round confused him in testing ("Create new
   version" answered with questions instead of a canvas) and costs a second model call.*
   - *Fast:* "make your own decisions". The mirror drafts, and the draft ends with **"What I decided
     on my own"**, listing each conflict and the choice made. Publishing is still one tap. This is
     the event's between-rounds path (2.5-hour event: no time for a slow pass).
   - *Slow (default):* before drafting, the mirror shows each tension between the current version and
     the new material as an option with its pick and why ("simplify" style: options to correct, not
     open questions). The owner answers or says "just decide".
   - Either speed can take, as material, a thread elsewhere that the owner can read, e.g. the event
     transcript thread, instead of uploads.
6. **Points never change.** This is already enforced (no update path for users on `points`). Each
   version is built from:
   - **unchanged point** (same words, same box): **reused**. The version tag is added to the
     existing point, so its positions and stories carry over. *This changes P1515 phase 5 "each
     version keeps its own positions" for unchanged points; agreed 2026-10-26.*
   - **reworded point** (clearly the same claim): a new point that **supersedes** the old one, so
     the positions that pushed the change stay reachable (P800).
   - **same words, moved box**: a new point (the box lives on the point) that supersedes the old
     one, so its positions stay reachable.
   - **anything else** (new claim, split, merge, unsure): a new point, with no link.
     Bias rule: when unsure, don't link. A missing link only loses a breadcrumb. A wrong link points
     earlier supporters at a claim they never backed. Every link appears in the draft ("Problem:
     reworded from v1"); the slow speed lets the owner correct links, and the fast speed lists them
     under "What I decided on my own".
   - A canvas reads **only its owner's own points**. Reusing another person's identical point is out
     of scope (see Non-Goals).
7. **A version shows its own points, superseded or not.** Today the canvas read filters
   `superseded_by IS NULL` (`20261022170000_p1515_canvas_versions.sql:165`). With supersede between
   versions, opening v1 would show empty boxes. Opening a specific version must show exactly the
   points carrying that version's tag.

8. **Data rules (from the 2026-10-26 Gemini review, each checked against the migrations).**
   - **A version has a published state.** `canvas_versions` has no such column today
     (`20261022170000_p1515_canvas_versions.sql:32-40`). Readers other than the owner see only
     published versions, through the canvas read and through any point link.
   - **Supersede links are written at Publish, never during drafting.** Otherwise an abandoned or
     revised draft leaves a published point superseded by a private one (hidden on every
     heads-only list, pointing nowhere for readers).
   - **Link only to a head.** If the old point is already superseded (e.g. a draft started from v1
     after v2 reworded it), make a new point with no link. One successor per point stays true.
   - **Revising or discarding a draft** deletes only the points that draft created, and removes the
     draft's version tag from reused points. It never deletes a reused point.
   - **One open draft per canvas.** Opening a second draft thread while one is open continues the
     open one. The label (v2, v3…) is assigned at Publish, so abandoned drafts leave no gaps.
   - **From someone else's words, no facts.** Material from a transcript or a copy of another
     person's message can challenge or reshape the owner's bets. It never becomes a point stating a
     fact about that person or their business (e.g. their churn figure), in fast speed too.

9. **Rules from the Gemini 4 Argon review (2026-10-26, each checked).**
   - **Link fetching is locked down (SSRF).** https only; refuse private, loopback and link-local
     addresses, re-checked after every redirect (≤3 redirects); cap response size and time. A refused
     link is named as unreadable.
   - **Extracted text lives with the draft.** Converted text is stored privately with the thread
     from upload until the draft is published or discarded, so a reload or a slow-speed question
     loses nothing. Original files are deleted once converted. Keeping the text *after* Publish is
     still Open Question 1.
   - **Paperclip with an open draft:** the mirror asks "You have an open draft (from vN) in another
     thread. Continue it there, or discard it and start from the version you picked?" Never silent.
   - **Draft-only data is stored with the draft version, not on points:** the pending supersede
     pairs (old → new) chosen in the draft, and each empty box's question. Questions are shown to the
     owner only; readers see an empty box.
   - **Name vs label.** `canvas_versions.name` is required at insert and keys `?v=`; a draft gets an
     internal name, and a separate label (v1, v2…) is set at Publish.
   - **Sharing an unpublished canvas.** With no published version, readers see "Nothing published
     yet", and the owner's share flow says "Publish first". The first canvas follows the same
     draft → Publish path.
   - **Runs as a background job**, like the mirror's replies, not one synchronous request; progress
     survives a reload. Slow speed costs two model calls per draft. Revisions per draft are capped
     (cap set in /dev, UNVERIFIED today).

## Box guide (v1, the drafting agent's brief)

> **Superseded where it conflicts with "Design v6" above.**

What each P1535 box means and what a good draft point looks like. The agent's prompt is built from
this table; the founder edits it here first. Every point is a bet someone could disagree with.

| Box | What it means | A good point | Not this |
|---|---|---|---|
| Customer Segments | The specific people who pay, narrow enough to find ten of them | "Café owners with 1-3 shops who do their own books" | "Small businesses" |
| Problem | What hurts them today, in their words | "Every tax deadline turns into a panic" | A list of features |
| Solution | What you do about it | "Receipts by chat, books done monthly" | A slogan |
| Go-to-market strategy | Where these people are and how they first hear of you | "Two owner groups online plus one supplier's referrals" | "Social media" |
| Offers & Pricing | What they buy and for how much | "2,500 baht a month per shop" | "Affordable" |
| My next milestone (P1589 title) | A number and a date that would prove you wrong | "10 paying shops in three months" | "Growth" |
| Guiding values (P1589 title) | **Something you give something up for.** Proof is a cost you keep paying for it (founder, 2026-10-23: a value is "something you sacrifice for"; e.g. honesty that costs you long discussions with strangers, and you have them anyway) | "Intellectual honesty: I correct myself in public even when it loses the argument" | A word with no cost behind it ("integrity") |
| My current biggest challenge (P1581 title) | The one obstacle you see as most likely to stop this working right now, with the number that shows it | "Getting café owners to a first call: only 3 of my last 20 messages got a reply" | A complaint with no number ("finding time", "scaling") |
| Hypotheses I've falsified (P1581 title) | Something you expected about the business, tested, and found wrong: what you expected, what happened, what you changed | "I expected owners to want per-receipt pricing; all five I offered it to chose a flat monthly fee, so I dropped it" | A lesson with no test behind it |

*2026-10-28: the last two rows were rewritten for P1581's new titles (the old meanings, "strengths become
weaknesses" and "who else wins", no longer match the boxes). Founder may edit. The copy-prompt's per-box text
(`canvas-thread-copy.ts`) was reviewed by Gemini 4 Argon and Codex the same day.*

Material that shows no cost behind a value leaves Values empty and asks the owner the question
("What do you keep doing even when it costs you?").

## Invariants

- **Nothing invented.** Every point and story traces to the material or the owner's note. A box with
  no source stays empty. The seed format's `NO SOURCE FOUND` rule carries over.
- **Private until the owner shares.** A draft is never public and is readable only by its owner until
  the owner shares the canvas (P1515: no public switch, shared content only through checked functions).
- **`canvas:` system tags are written only by the service role** (decisions.md 2026-10-19).
- **Material is data, never instructions.** Text from a website or file cannot change what the agent
  does or where it writes. Proven by a real-model red-team test with a control, as P1520 did, not by
  unit tests.
- **No material goes to an AI provider in prod until the privacy policy names it.** Today
  `src/app/content/privacy.md:387` lists Gemini for the story guide, generated banners and
  transcription; canvas material is not among them. Same gate pattern as P1520:
  the server reports availability, and the client shows no draft control when it is off.
- **Original files are not kept** after the draft is written.
- **Other people's words never appear under their name in a canvas.** Material can include other
  people's words (an event transcript, Clarify copies). The draft writes the owner's own bets in the
  owner's voice. It never quotes or names another person, because a canvas can be shared by public
  link. Why a point changed, and a story in a partner's name only once the partner confirms it,
  belong to P1574 (reframed 2026-10-30, decisions.md "Recognising reasons that changed a canvas").

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Login-walled links (LinkedIn) return nothing | MITIGATE | Say which link could not be read; ask for a PDF export or pasted text |
| Draft echoes marketing copy instead of bets | MITIGATE | Prompt writes falsifiable bets; checked on 3 real attendees' material before the event |
| Wrong box for a point | ACCEPT | Owners correct it in session 1, in pairs; that correction is the design input for the mirror |
| Prompt injection through material | MITIGATE | Invariant above; red-team suite |
| Supabase organisation over plan (P1530) | ACCEPT | Net-additive traffic is tiny (Cost Budget); counts as over the limit until the founder accepts the upgrade |
| Event 1 runs before this ships | ACCEPT | Fallback by hand: founder runs an agent locally and loads the result with the P1515 private seed, pointed at prod |
| Large decks exceed the request size | MITIGATE | Convert to text before sending; cap file size (limit set in /dev, UNVERIFIED today) |

**Non-Goals**
- Updates ARE in scope (amended 2026-10-26): a new draft version from thread material, including an
  event transcript thread the owner can read. Automatic per-event pipelines stay in P1500.
- Do NOT reuse another person's identical point in a canvas. Whether identical public statements are
  one point app-wide is a separate open question.
- Do NOT draft stories on a partner's behalf here (P1574).
- Do NOT add version deletion, owner-chosen version names, or a visible point author.
- Do NOT add file upload outside mirror threads in this spec (amended 2026-10-22: upload in
  mirror threads is now IN scope; direct messages and channels stay out).
- Do NOT add canvas editing on screen (decisions.md 2026-10-19: owners edit through their agent).
- Do NOT change the event room or pairing (P1529).

## UX Notes

- Happy path: material in → progress while it runs (duration UNVERIFIED until measured) → canvas
  page with filled boxes and empty boxes marked as questions.
- Works on a phone at 375px: latecomers do it at the door.
- Error: per input, say what could not be read; the draft still runs on the rest.
- Empty: no material and no note → the button is not offered (no disabled primary, P955).
- Loading: shows progress and survives a page reload; a second press does not start a second draft.

## Acceptance Criteria

> **Superseded where it conflicts with "Design v6" above.**

- [x] An owner with a website link and one PDF gets a canvas whose points all trace to those inputs. *(Rewritten 2026-11-04 (founder ruling, same day): real-material testing happens on production after deploy, so the "3 real attendees on test" half moves to the clause below. Verified pre-deploy: the tracing rule is enforced in code, a point whose quote is not in the material is dropped before anything is written (`src/tests/p1536-canvas-draft.test.ts` "a point whose quote is not in the material is dropped before anything is written"), a readable link is kept as material and an unreadable one is named (same file, "an unreadable link is named in the reply and the rest is still drafted"); real-model walks and evals on the self-hosted and hosted TEST servers (`e2e/p1536-walkthrough.spec.ts`, `.private/evidence/p1536-s3c/journeys-selfhosted/walkthrough-2.txt`; evals `.private/evidence/p1536-s3c/evals/after-s19-a.summary`, 21 packs x 3 runs). Limit: the eval harness stubs link reading as unreachable (`scripts/p1536-real-model-eval.ts:127,233`), so no run read a real website link plus a real PDF before deploy.)* `[post-deploy]` founder tests on production with their own real material (a website link and a PDF) and checks every point against it.
- [x] A box with no source in the material is empty and shown as a question. *(Evidence 2026-11-04: `src/tests/p1536-canvas-page-draft.test.tsx`, "the owner on the draft sees ... the question inside the empty box", passing.)*
- [x] The draft is invisible to a signed-out visitor, another signed-in user and an event attendee
      until the owner shares it (curl + browser evidence on test). *(Evidence 2026-11-04, live TEST lane, passing: `p1536-v6-engine.test.ts` "S1.15 held points" (stranger, link reader, anonymous, with a link-reader control) and `p1536-canvas-draft-write.test.ts` "A12" (stranger, attendee, link holder and signed-out read no draft row). Test evidence only; no browser run was done this session.)*
- [x] After sharing with the event, an attendee reads it and takes positions (P1515 path). *(Evidence 2026-11-04: `e2e/p1515-canvas-sharing.spec.ts` AC2 and AC3, passing on self-hosted TEST.)*
- [x] A link that cannot be read is named in the result; the rest is still drafted. *(Evidence 2026-11-04: `src/tests/p1536-canvas-draft.test.ts` "a first draft says how many boxes it filled", passing: the reply names the unreadable link beside "Draft ready: 7 of 9 boxes.")*
- [x] A run changes only the boxes the message is about; every other box keeps its exact points (same point ids), so no duplicate points remain. *(Rewritten 2026-11-04 to what was built: superseded by Design v6 D2, "A run changes only the boxes the message is about", which supersedes "each revision replaces the draft's points". Evidence, passing: live `p1536-v6-engine.test.ts` "a tagged message changes only its box ..." and unit `p1536-s1-edge.test.ts` S1.3 block.)*
- [x] A draft version is invisible to everyone the canvas is shared with until Publish; after
      Publish they read it with no new share (curl + browser evidence on test). *(Evidence 2026-11-04, live TEST lane, passing: `p1536-v6-engine.test.ts` "S1.15 held points" for the invisible half; `p1536-canvas-draft-write.test.ts` "AC4/AC7: after Publish the audience reads it with no new share" for the other. Test evidence only; no browser run this session.)*
- [x] On a published version, Clone starts a draft and opens its workspace thread; the "Start a new version?" question and its button are gone. *(Rewritten 2026-11-04 to what was built: the spec's W3/X3 Clone entry ("The words 'New version' leave the UI") lists "Versions §2 'Start a new version?'" and `canvas-new-version-button.tsx` as superseded. Evidence, passing: `p1536-w3-clone.test.tsx` (asserts the button's file is removed and nothing imports it) and `p1536-x3-clone-a-version.test.tsx`.)*
- [x] The paperclip keeps Points and Stories only; an older version is picked with "Clone a version" in the + menu, which starts the draft from it. *(Rewritten 2026-11-04 to what was built: X3, "The paperclip keeps Points and Stories only. The Attach dialog's Canvases tab goes", and the "§9 paperclip-with-open-draft question" superseded line. Evidence, passing: `p1536-x3-upload-paperclip.test.tsx`, `p1536-x3-clone-a-version.test.tsx`, `p1536-x3-plus-menu.test.tsx`.)*
- [x] Unchanged points are reused (positions on them show in the new version); reworded points
      supersede their predecessor; other changes are new points with no link. *(Last sentence "Every link is named in the draft" removed 2026-11-04: Design v6 D13 drops "What I decided on my own", where the fast speed listed the links (Versions section: "the fast speed lists them under 'What I decided on my own'"). Evidence, passing, live `p1536-v6-engine.test.ts`: "a draft opened from v1 holds v1's point ids ..." (reuse) and "S1.12 cleanup ... reword chain".)*
- [x] Opening v1 after v2 superseded some of its points still shows all of v1's points. *(Evidence 2026-11-04: live `p1536-v6-engine.test.ts` "a draft opened from v1 ..." asserts v1's point ids are unchanged after draft work, passing.)*
- [x] No reply contains "What I decided on my own" or an empty-box question. *(Rewritten 2026-11-04 to what was built: Design v6 D13, "No 'What I decided on my own'", and S1.13. Evidence, passing: `src/tests/p1536-canvas-draft.test.ts` "no reply holds 'What I decided on my own' or an empty-box question".)*
- [x] A draft built from an event transcript thread names no other person in its points. *(Evidence 2026-11-04, unit level through a transcript-shaped thread, passing: `src/tests/p1536-canvas-draft.test.ts` "a transcript copy: the owner's lines are quotable, the other person's are not, and the name filter holds" (the run's written actions and reply contain neither the other person's name nor their line), plus the uploaded-transcript block at line 1016 ("MUST FAIL: a point naming a speaker of an uploaded transcript is dropped", with a CONTROL that keeps the same quote without the name). Limit: the filter is a heuristic (Known limitations: lower-case names and a lone first name get through).)* `[post-deploy]` founder reads a canvas drafted from a real event transcript on production and confirms no other person is named.
- [x] Injection control: material containing instructions to write elsewhere or make content *(2026-11-04, HEAD 2749f0307, real model: file defended 0/8, all-defences-removed control 3/8, earlier 7/8; label defended 0/14, control 2/14, a weak control using a payload over the 80-character cap. The model has no tools and one service-role write path, `_canvas_draft_run_complete`; link reads block private and metadata hosts. Evidence: .private a14-head. Independent reader not obtained: Gemini blocked the prompt, Codex was out of quota.)*
      public changes nothing outside the owner's private draft (real-model test, with a control that
      shows the test can fail).
- [x] With AI availability off, no draft control is shown. *(Evidence 2026-11-04: `src/tests/p1536-x3-plus-menu.test.tsx` "is not there while drafting is off", passing, and `p1536-x4-header-bar.test.tsx` passing in the same run.)*
- [x] + Canvas opens a new mirror thread that asks for material; a PDF uploaded in that thread is drafted, and the original file is not stored afterwards. *(Rewritten 2026-11-04 to what was built: no "preparation step" entry exists. `grep -rn "Draft my" src e2e` finds nothing, and `useStartCanvas` has no caller under `src/app/prototypes/events/prep/`. The only entry points are Artifacts New canvas, mirror + Canvas, Clone and a Drafts row (spec line 689). The spec's earlier line 1501 ("the event preparation's 'Draft my canvas' step") was never built and is not claimed. Evidence, passing: `src/tests/p1536-w0-start-entries.test.tsx`, `p1536-x3-plus-menu.test.tsx`, `p1536-x3-upload-paperclip.test.tsx` (21 tests, run 2026-11-04); not stored: `p1536-canvas-draft.test.ts` "uses no storage API: uploaded bytes are never stored, only the extracted text".)* [FOUNDER DECISION: build a preparation-step entry in a follow-up, or drop it from the spec.]
- [x] The mirror's reply in the thread links the canvas and names empty boxes and unreadable inputs. *(Superseded 2026-11-04 by Design v6 D13 ("Empty-box questions are not repeated in chat") and S1.13: the reply names unreadable inputs, carries no address and no empty-box list; the link is the draft card (X10). Evidence, passing: `p1536-canvas-draft.test.ts` (the two reply tests above) and `p1536-x10-card-ui.test.tsx`.)* *(2026-10-29, visual QA: the
      link is the draft card's Open under the reply; the reply text carries no address, since chat text is plain and an
      address showed as unclickable noise.)*
- [x] Works at 375px and 320px (screenshots). *(Evidence 2026-11-04: self-hosted walkthrough `e2e/p1536-walkthrough.spec.ts`, 28 passed in `.private/evidence/p1536-s3c/journeys-selfhosted/walkthrough-2.txt` (375 cases N3, N4, J-W3 and the 320/360/400 widths walk) plus the three cases that failed there re-run by -g after their stale premises were fixed, all passing. Screenshots are written by the walkthrough's `shot()`; not re-viewed this session.)*

## Cost Budget

> **Superseded where it conflicts with "Design v6" above.**

Model for the budget: `gemini-3.8-flash` (registry: $0.75 input, $3.75 output per 1M tokens through
2026-12-31). Founder, 2026-10-21: "gemini 3.8 is ok for this".

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests (Supabase) | 1 edge call + 1 batched write inside it = 2 per draft x ≤3 drafts = ≤6 | event-prep peak: 20 attendees x 2 = 40 | superseded: measured per run in "Design v6" §9, Test traffic per run (both live files, users created and deleted included) |
| Egress (bytes) | response ≈1 KB x ≤3 = ≈3 KB; the canvas page load afterwards is P1508's existing read (size UNVERIFIED) | 20 x 1 KB = 20 KB | superseded: §9 (measured) |
| Log lines | 1 per draft + ≤6 per failing draft (5 unreadable links + 1 model error) = ≤7 per draft x 3 = ≤21 | 20 x 7 = ≤140 | superseded: §9 (requests + failed responses) |
| Gemini tokens x price | input ≤63k (60k material cap + 3k prompt) x $0.75/1M = $0.047; output ≤14.5k (9 boxes x 3 points x 240 tokens ≈ 6.5k + 8k thinking) x $3.75/1M = $0.054; ≈$0.10 per draft x ≤3 = ≤$0.30 | 20 x $0.10 = $2.00 | stubbed: $0; real-model red-team: 5 drafts x $0.10 = $0.50 |
| Slow speed and revisions (v1-v3, superseded) | v6 has no tension pass; caps are D18: 60 runs and $6.00 per person a day, $45.00 canvas a day (§6). Per-run cost ≈$0.10 as above | 20 x $0.10 = $2.00 | stubbed: $0 |

1. **Fits the plan limit today?** Edge invocations: drafts per month = active preparers x ≤3, against
   the registry's 500,000. Gemini: monthly cost = drafts per month x $0.10, on a dedicated
   budget-capped key (`/slava:util:ai-keys`). Supabase: the organisation is over plan (P1530), so by
   the 2026-10-21 ruling this is over the limit until the upgrade is accepted, even though it adds
   little traffic.
2. **Fits at 10x?** 200 drafts per hour = 400 requests and $20 per hour: Supabase limits fit; the
   Gemini cost fits only within the key's cap.
3. **Upgrade:** Supabase Pro, from $25/month (registry).

**3c X10/X11 (the mirror chat's canvas cards and "N replies" links).** One shared read of the chat's canvas thread roots, not a read per card and per link
(`src/app/pages/chat/canvas-root-store.ts`; the counts are pinned by `p1536-x11-root-store.test.ts` and `p1536-x10-card-refresh.test.tsx`, and measured in
`e2e/p1536-x10-x11.spec.ts`). Inputs: N = canvas thread roots in the chat's loaded messages, N_open = those whose draft is open, F = changed-state roots on a signal,
M = chat mounts per person per hour, T = tab returns per person per hour, R = replies arriving on a canvas root per person per hour.

| Measure | Per mount | Per tab return | Before (per card and per link) |
|---|---|---|---|
| Requests | 1 drafts query (`thread_root_id` in a list, 50 ids per query) + 1 versions read = **2**, at any N ≤ 50; +1 only when the chat does not know the viewer's slug, +1 only when a card's canvas has no published version | 1 drafts query for the N_open roots (none when N_open = 0) + 1 versions read only when F ≥ 1, however large F is = **1 to 2** | N x (drafts + versions + slug = 3) cards + N x (drafts + slug = 2) links = 5N, **50 at N = 10**, up to 60 with titles |
| Egress | 250 B x N (drafts) + 200 B x V (the viewer's V versions) = 2.5 KB + 4 KB at N = 10, V = 20 | 250 B x N_open = 2.5 KB at N_open = 10; + 200 B x V = 4 KB only when F ≥ 1 | 5N x ≈1.5 KB = 75 KB per mount and per tab return at N = 10 |
| Log lines | 2 access lines | 1 to 2 access lines | 5N = 50 |

A hidden tab makes zero requests, on mount too: what is due waits and is read when the tab returns (metered-services rule 3). No timer polls (rule 2), a failed read waits for the next
signal or the person's Retry (rule 4), and a read is a fresh query every time. A closed (published or discarded) draft never changes, so it drops out of every signal's query.
A reply on a root reads that root alone; replies in one moment are one query. Per hour per person: requests = M x 2 + T x (1 + [F ≥ 1]) + R x 1, at most 2M + 2T + R.

1. **Fits the plan limit today?** Egress per person per hour = M x 6.5 KB + T x 6.5 KB + R x 0.3 KB at N = 10, V = 20 (a closed draft's rows are in the mount only);
   the monthly figure is that x active hours x active owners with canvases, compared with the registry's 5 GB egress on the dashboard's reading (the values stay private, the
   verdict is: fits; this reduces the net traffic of the previous design, 5N requests per return, by about 25x at N = 10).
2. **Fits at 10x?** N = 100 roots: ceil(100 / 50) = 2 drafts queries + 1 versions read at a mount; a tab return still asks only the open ones (one query while N_open ≤ 50).
   Fits.
3. **Upgrade:** none needed for this step; the over-plan standing of the organisation (P1530) is unchanged by it.

**3c X14 (the Artifacts page's canvas reads).** The page refreshes on a 15 s timer while visible and on every tab return (a poll that predates X14: "today's inbox/sent behaviour" in the hook's header; the page has
no push channel, so its written reason is on-demand reads cannot show a letter or share that arrives while the tab is open). X14 added a Mine number per row, which first cost a second versions read per refresh (two per poll) and ran on the Letters tab too, where nothing uses it.
Now: ONE `list_my_canvas_versions` read feeds both the draft numbers and the Mine numbers (`listMyCanvasDraftState`, one snapshot, so a publish cannot make them disagree), and the
Letters tab reads no canvases at all, because its dots come from the letters and from what is shared with me (`useArtifactsData`'s `canvasesOpen`). A tab that mounts hidden reads nothing until it
becomes visible (metered-services rule 3; the mount read was unguarded before X14, a one-line fix made here). Inputs: P = refreshes per visible hour = 3600 / 15 = 240, T = tab returns per person per hour,
V = versions the person has published = 20, D = open drafts = 3, C = canvases = 10 (sizes as in the X10 figures; the 150 B per canvas row is UNVERIFIED).

| Measure | Canvases tab, per refresh | Per visible hour (P = 240, T = 0) | Before (versions read twice, Letters tab too) |
|---|---|---|---|
| Canvas requests | 1 canvases RPC + 1 drafts query + 1 versions read = **3**; the Letters tab **0** | 240 x 3 = **720** on Canvases, **0** on Letters (+ 3 per tab return) | 4 per refresh = 240 x 4 = **960**, on either tab |
| Egress | 200 B x V (4 KB) + 250 B x D (0.75 KB) + 150 B x C (1.5 KB) = **6.25 KB** | 240 x 6.25 KB = **1.5 MB** | 10.25 KB per refresh = 2.46 MB |
| Log lines | 3 access lines | 720 | 960 |

The five letter reads (drafts, sent letters with their deliveries, received, activity, shared) are the page's existing poll and are unchanged here.

1. **Fits the plan limit today?** The limit that binds is egress, 5 GB per month on the Free plan (registry). 1.5 MB per owner per visible hour x 40 visible hours per owner per month = 60 MB; for 10 owners with
   canvases that is 600 MB, 12% of 5 GB. Verdict: fits, as a share of the page's reads, on the dashboard's reading (the values stay private). Request counts have no registry cap; they are shown for the idle-request test.
2. **Fits at 10x?** 100 owners x 60 MB = 6,000 MB = 6 GB, over the 5 GB, so at 10x the canvas reads alone would not fit on the Free plan; before this change it would have been 100 x 98 MB = 9.8 GB.
3. **Upgrade:** Supabase Pro, from $25/month (registry), at the point more than about 80 owners poll the Canvases tab (5,000 MB / 60 MB = 83).

## Pre-deploy Checklist

- [x] Spend-capped Gemini key `cp-canvas-prod` issued; monthly cap read back from Google's list, restricted to the Gemini API.
- [x] Privacy policy names canvas material as sent to the AI provider; terms v1.7 notice written. Live with the push.
- [x] Everything else needs the merge or the push, and is in After deploy below. Drafting stays off on prod until step 3 there. Founder ruling 2026-11-04.

## After deploy

> Not part of the Pre-deploy Checklist: each item needs the production deploy to have happened, so ship-gates 3.5 does not read this section. Run after `/push` deploys.

- **In this order, on prod. Until step 3, no owner can start a draft.**
  1. `/push` applies the P1536 and terms migrations and deploys `chat-voice` and `canvas-draft` (migrations before functions).
  2. Secrets on `canvas-draft`, names only, never values: `CANVAS_DRAFT_GEMINI_API_KEY` from `cp-canvas-prod`; `CANVAS_DRAFT_INTERNAL_SECRET`, with the same value in the vault as `canvas_draft_internal_secret`; vault row `canvas_draft_url`; `chat_voice_anon_key` is reused. Check the voice bucket's CORS lists the prod origin.
  3. Confirm the amended privacy policy is live, then set `CANVAS_DRAFT_AI_ENABLED`.
- X9 secret probe, on each project, because a wrong or missing secret is otherwise SILENT (the database never reads its call's answer):
      POST `canvas-draft` with header `x-canvas-draft-internal` set to a WRONG value expects 401; with the RIGHT value (the vault's
      `canvas_draft_internal_secret`) and a body of all-zero `run_id` and `owner_id` expects 409 `TERMS_NOT_ACCEPTED` (it reached the terms gate).
      A 401 on the right value means the function's `CANVAS_DRAFT_INTERNAL_SECRET` and the vault row differ; a 404 or 5xx means `canvas_draft_url` is wrong.
- X9 end to end, once per project: one real voice note (or `P1536_X9_DEPLOYED=1` on the test projects) leaves the run `queued` within seconds of
      its transcript, with no client request.
- One real draft on prod from the founder's own material; canvas private until shared.
- Sentry shows no new errors from the function in the first 10 minutes.

- Founder tests on production with real material (website link plus PDF; an event transcript) per the two `[post-deploy]` clauses in Acceptance Criteria.

## Resolved Decisions

- 2026-10-29 (founder): the v6 design decisions D1-D19 ("Design v6" §1), including one update at a time (D15),
  the second canvas offered again after Publish with material kept at most 30 days while an offer is open (D16),
  and permanent daily caps of 60 runs / $6 per person, $45 canvas, $50 total (D18).
- 2026-10-29: Open Question 1 is answered for this spec by D16 (material kept only while an offer is open). Keeping
  material for every canvas is a separate future spec (inbox item INBOX-239).
- 2026-10-26 (founder): Open Question 0 is resolved. P1535, P1515, P1544 and P1546 have shipped. A
  re-run creates a new **draft version**, not a replacement of a shared one (see "Versions, drafts and
  updates").
- 2026-10-26: changes after publishing go through a new draft version in a new thread. A published
  version never changes.
- 2026-10-26: build directly on main's shipped P1535/P1515 (old Q3 is moot).

## Open Questions

1. ~~Keep the extracted text after Publish?~~ Answered by D16 for this spec; long-term retention is INBOX-239.
2. [FOUNDER DECISION: privacy-policy sentence, a soft update (no re-acceptance).] Draft for the
   mirror section: "Your mirror agent can turn what you give it (messages, files, links, and copies
   of other chats you can read) into a draft of your Clarity Canvas. The draft is visible only to
   you until you publish it; a published version is visible to whoever you shared the canvas with,
   including anyone with its link. Drafts state your own views and do not quote or name other
   people." Uploaded files are listed in the processor table as sent to Gemini and not kept.

## Known limitations (from /dev review, 2026-10-26)

> **Superseded where it conflicts with "Design v6" above.**

Accepted after three review rounds (Gemini 4 Argon, Codex, Opus adversary); each is a shape the
reviewers reproduced but that is exotic or costs more than it saves now.

- **A stance on a kept point is live at once.** A kept (unchanged) draft point is the same row as the published point, so a stance the owner sets on it while drafting shows on the live published version at once.
- **Names are a heuristic.** Points naming another person are dropped when the name appears as a
  speaker label or a mid-sentence run of capitalised words in a file, link or someone else's lines.
  Lower-case names, a lone first name and one-word speaker labels get through; a place name only a
  file used can cause a false drop.
- **"Nothing invented" is a heuristic.** A point must share two content words with an owner quote
  and every number must appear in owner material. It is not a semantic truth check; the real-model
  red-team (AC14) is still owed.
- **DNS rebinding** between the address check and the fetch is not closed (the edge runtime cannot
  pin the address). Bounded: https only, ≤5 links, 1 MB and 8 s each.
- **A reworded point whose old point is no longer a head** carries no link into the next revision,
  and a moved point reworded later from its base words can be refused as unverified.
- **A dead run** blocks drafting for 5 minutes and is charged its full reservation.
- **Canvas names over 56 characters** list a canvas whose page is not found.
- **Mirror replies in an open draft thread:** the mirror answers each owner message (spec places
  "Draft my canvas" under its reply), one model call per message.

- **Message grouping after the opener (update threads):** the owner's first message can group visually with
  the base-version card above it, because grouping skips the opener drawn between them (LOW, v2 review).
- **P1576 overlap on the shared test database:** P1576's `mirror_request_reply` (applied after P1536's) dropped the
  "no mirror job in a canvas thread" rule there. The client never requests a reply in a canvas thread, so the app is
  unaffected; whichever of P1536/P1576 ships second rebuilds that function on the other's body.
- **The question round is gone from the engine, not from the database (v3, 2026-10-28):** `_canvas_draft_run_begin`
  still accepts a tensions run and `_canvas_draft_tensions_complete` still exists. Both are service-role only and no
  code calls them; an old tab that asks for the slow speed gets a normal draft. Remove them in a later migration.
- **Self-hosted TEST had no canvas secrets until 2026-11-03:** they were never added. No rule prevented it: decisions.md 2026-10-29 allows TEST-only AI keys on that server. Add secrets to the server's function env file directly; `deploy-functions.sh --secrets` replaces the whole file from a Mac copy that does not exist. Testing for this feature moved to self-hosted on the founder's decision, 2026-11-03.

## Related

- [P1508](p1508_clarity_canvas_owner_artifact.md) canvas page ·
  P1535 nine boxes (branch `feature/p1535-canvas-nine-boxes`) ·
  [P1515](p1515_artifact_sharing_events_and_groups.md) sharing ·
  [P1500](../../p1500_clarity_chat_canvas_from_event_threads.md) updates from event threads ·
  [P1529](../../p1529_canvas_event_host_coordination.md) host and pairing ·
  [P1457](../../p1457_clarity_chat_data_import.md) chat data import ·
  [P1332](../../p1332_canvas_to_letter_skill.md) canvas to letter ·
  P1520 mirror (availability-gate pattern, spend-capped key) ·
  [P1544](p1544_mirror_launch_on_prod.md) mirror on prod (blocks go-live) ·
  [P1546](p1546_threads_in_every_chat.md) threads in the mirror (blocks the entry point) ·
  [P1545](p1545_menu_and_artifacts.md) Artifacts page, + Canvas
