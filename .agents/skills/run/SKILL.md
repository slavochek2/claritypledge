---
name: run
description: "One-command orchestrator over the existing event-lifecycle skills — create, assets, promote (platforms), promote (groups) — with one combined resume view. Modeled on /video-publish."
when_to_use: "Running the full event pipeline end to end in one pass, or checking combined status/resume state across a past run. Individual stages stay independently invocable — use this only when you want the sequenced view."
version: 1.2.0
---

# /slava:events:run

The end-to-end conductor for the event pipeline. It does not contain pipeline logic — it **sequences the existing skills in order** and provides one combined status/resume view over their state. Each stage skill's own file is the source of truth for that stage; this skill only sequences them and enforces where the human is asked.

**Canonical process:** `docs/events/process.md` (repo root). Read it if any stage's I/O is unclear.

**Reuse, don't reimplement.** If a stage skill's behavior needs to change, fix it in that stage skill and update the one reference here — never fork its logic into this file. This mirrors the rule `docs/video-process.md` states for `/video-publish`.

---

## The human touches — five, and every one is a decision only he can make

Superseding the earlier four-gate contract. The count did not grow; it got honest and it got
re-ordered. What changed on 2026-08-31 is that the per-platform stops collapsed into one
sweep, and the chat copy review went away.

1. **Pick the trail** — from open Chrome tabs, not a chat list.
2. **Pick the meeting cafe** — from open Google Maps tabs, same rule.
3. **Approve the created event** — on the live event page, not as text in chat.
4. **Publish the platforms** — one sweep, all tabs filled and open, he clicks Publish in each.
5. **Confirm the group send** — one confirmation covering the Facebook groups and the chat groups.

**Copy is no longer reviewed in chat.** Founder, 2026-08-31: *"no need to show me text, i can
correct it on live event."* So the old combined copy review is gone as an approval turn. He
reviews the description by looking at the published event page (touch 3) and the platform copy
by looking at the filled forms (touch 4) — both are the real artifact rather than a paragraph
describing it, so this is a stronger review, not a weaker one.

**What is NOT a copy review and therefore still runs, silently, every time.** These are
mechanical assertions, not requests for an opinion, and none of them costs a turn unless it
fails:

- the group-blurb **staleness check** (every language's text must contain this event's date and venue token),
- the promo-blurb **freshness guard** (same idea, defined in the hike series doc),
- the **link-liveness** check (the event URL resolves before anything links to it),
- the **transport probe** (the messaging bridge is actually connected before a send is claimed),
- the **auth preflight** (every platform confirmed logged in as the operator, in one pass, before any form is touched),
- the **do_not_post enforcement** (a blocked group present in the send list refuses the run).

A failure in any of these stops and asks — that is the point of them. Silence means they
passed. Never suppress one because "the founder already approved the copy": he approved
wording, and these check facts.

**The blast-radius confirmation stays** and is folded into touch 5: he sees the group count
and the platforms in one message and confirms once, rather than confirming Facebook groups and
chat groups separately.

## The four stages

```
CREATE                      ASSETS          PROMOTE (platforms)     PROMOTE (groups)     OPTIONAL
──────                      ──────          ───────────────────     ────────────────     ────────
Gate 1 — which               /slava:        /slava:events:          /slava:events:       promote-dm
creation path?                content:       promote-all             promote-groups       promote-whatsapp
 · publish-event          →   gen-poster  →  (todo.today, FB      →  (WhatsApp /       →  promote-email
 · publish-run (AllTrails)                    personal, Luma,         Telegram chats)      — NOT auto-chained;
 · re-create-event (clone)                    Eventbrite, Sola)                             separate opt-in
```

**This skill never publishes.** *"Every Publish/Create click is the user's, never the skill's."* (`docs/decisions.md` 2026-05-12 [process]) Applies here exactly as it applies to `promote-all` — this orchestrator adds sequencing and a combined view, nothing that clicks Publish or Create.

**The optional DM/WhatsApp/email stage is never auto-chained.** Offer it after Stage 3 completes; run it only on explicit opt-in.

---

## Run record — the actual fix (read this before touching state)

Two existing caches have an asymmetry that matters:

- `~/.private/event-state/<slug>.json` (owned by `promote-all`) initializes a **fixed five-key `status` map, all `pending`**, before any platform runs. Done-vs-pending is genuinely derivable from this file alone.
- `~/.private/event-state/<slug>.groups.json` (owned by `promote-groups`) is created **inside its own Step 6, the per-group send**, after the blast-radius confirmation. There is no initialization step — an abandoned groups leg leaves **no file at all**, byte-identical to an event that legitimately never had a groups leg.

**An orchestrator that only reads both caches cannot tell those two cases apart — which is the July 5 failure this spec exists to fix.** So this skill writes its **own third file, at kickoff, before any stage executes**:

`~/.private/event-state/<slug>.run.json`

```json
{
  "slug": "<event-slug>",
  "created_at": "<ISO timestamp, kickoff>",
  "kickoff_path": "publish-event | publish-run | re-create-event",
  "stages_in_scope": ["create", "assets", "promote_platforms", "promote_groups"],
  "updated_at": "<ISO timestamp>"
}
```

- **`stages_in_scope`** declares, at kickoff, which stages this run intends to execute. A stage the operator explicitly opts out of at Gate 1 (e.g. "skip posters this time") is left out of the list — its absence from a result is then a deliberate skip, not ambiguity.
- **Never a field appended to either existing cache.** This is a strictly separate, additive file — read-only intent for the orchestrator's own bookkeeping. `promote-all.json` and `<slug>.groups.json` keep their existing owners and schemas unchanged.
- **Absence of a stage's result, cross-referenced against `stages_in_scope`, is what reports abandonment** — not absence of a file alone. If `promote_groups` is in scope and `<slug>.groups.json` does not exist (or exists with no matching-slug entries), the groups stage is **pending**, not "never had a groups leg." If `promote_groups` was never in scope for this run (operator said "platforms only" at kickoff), the same missing file means exactly that — an intentional exclusion.
- **`stages_in_scope` is not immutable — update it the moment scope actually changes.** If the operator changes their mind mid-run (e.g. "let's do groups too" after excluding it at Gate 1), append the newly-added stage to `stages_in_scope` and bump `updated_at` **before** invoking that stage — do this in the same turn as the scope change, not retroactively. Skipping this update means the combined status report (step 9) will later show that stage as `n/a` even though it genuinely ran, actively contradicting the `.json`/`.groups.json` state it should agree with. This file exists specifically to avoid reporting states that contradict observable fact — this is that same discipline applied to a scope change, not just to a stage's own completion.

---

## Steps

### 1. Resolve or start a run record

If invoked with no slug (or a slug that has no run record), this is a new run: skip to step 2 (Gate 1).

If invoked with a slug and `~/.private/event-state/<slug>.run.json` exists, read it and cross-reference its `stages_in_scope` against each in-scope stage's own state:

- **Every in-scope stage has a completed result** (per its own cache — `promote-all.json` all `done`/`skipped`, `promote-groups.json` present with all groups `sent`/`skipped_declined` where `promote_groups` was in scope): this is a **completed run**. Go straight to step 9 (Combined status report) and stop — do not re-invoke any stage skill. This is what satisfies "invoked against a past completed event, reports all four stages done, attempts no re-promotion."
- **At least one in-scope stage has no result yet, or an incomplete one**: this is a **resume**. Report which stage(s) are pending, then continue the stage sequence (steps 3–8) starting from the first pending stage — do not re-run a stage whose own cache already shows it complete, and never re-run Gate 1's creation choice (the event already exists). If the operator only wants the read-only view without resuming, say so up front and this behaves like the completed-run case above (report only, no invocation).
- **What "asking for a status check" alone means:** if the operator's request is explicitly a status/resume check ("what's the state of `<slug>`?") rather than "finish promoting `<slug>`," always go to step 9 and report — never infer an intent to resume from a bare status question.

### 2. Gate 1 — Kickoff

Ask, in one message:

1. **Which creation path?**
   - `select-hike` → `publish-run` — **the default for a hike with no trail chosen yet.** Runs `/slava:events:select-hike` first: it applies the never-again exclusions, opens trail and cafe candidates as Chrome tabs for the founder to pick from, collects the banner photo, and feeds all of it into `publish-run`. Adds no approval turn beyond the two choices the founder has to make anyway (which trail, which cafe).
   - `publish-event` — general-purpose, operator-safe, own account (form-driven)
   - `publish-run` — trail run/hike/walk from an AllTrails link the founder already has
   - `re-create-event` — clone the most recent occurrence of a recurring series (founder-only DB automation; requires at least one prior event in the series)
2. That path's own founder-only inputs (see the chosen skill's own Input section — do not re-derive them here).
3. **Which stages are in scope for this run?** Default: all four (create, assets, promote platforms, promote groups). The operator may explicitly narrow this (e.g. "skip posters," "platforms only, I'll do groups by hand later").

**Ask for the banner photo here if the path is not `select-hike`** (which asks for it itself, at
step 6). One line: *"Photo for the banner? Path, or skip."* This is the founder's own request —
*"next time i guess i can be asked automatically for a photo — or reminded, to upload one?"* — and
asking at kickoff is what keeps it from becoming a mid-promotion detour: on 2026-08-31 the crop,
upload, prod PATCH and two-viewport verification all happened *after* platform promotion had begun.
A `skip` is final for the run; do not re-raise it later.

Write the run record (schema above) **before invoking the chosen creation skill** — this is the "before any stage executes" requirement above.

### 3. Stage: Create

Invoke the chosen creation skill (`slava:events:publish-event`, `slava:events:publish-run`, or `slava:events:re-create-event`) via the Skill tool with the Gate-1 inputs. That skill owns its own approval flow for publishing the event — this orchestrator adds no gate here; the event-creation skill's own "review, then you click Publish" stop is not duplicated or suppressed.

On completion, extract the resulting `slug` (if not already known) and update the run record's `updated_at`.

### 4. Stage: Assets (if in scope)

Invoke `slava:content:gen-poster` with the slug. This runs autonomously (self-review loop is internal to that skill) — no additional gate here.

### 5. Resolve all copy — silently, no approval turn

Resolve everything both downstream stages need, in one pass, before either runs. **Do not show
it and do not ask.** The founder reviews the description on the live event page (touch 3) and
the platform copy in the filled forms (touch 4).

1. Resolve the platform promo blurb from the series doc's `## Promo blurb` block (for hikes,
   `docs/events/series/social-hike.md`), or the generated fallback if the series has none.
2. Resolve every distinct-language group blurb (matched type entry, per-language sourcing,
   placeholder resolution).
3. **Run the mechanical checks and stop only if one fails:** the promo-blurb freshness guard
   (resolved text contains this event's date and cafe name), the group-blurb staleness check
   (each language contains the date and venue token), and any unresolved `{placeholder}`.

A failure here is a real stop with a specific message — name the language, the missing token,
and the file to fix. Passing is silent. Carry the resolved copy into stages 6 and 7 so neither
re-resolves it.

**Why this is not a weakening.** The thing these guards protect against is saved copy that
silently describes a past event — the July 5 failure, which had zero unresolved placeholders
and would have passed a human skim. That risk is unchanged and still mechanically checked.
What was removed is asking the founder to approve wording he has told us he would rather fix
on the live page.

### 6. Stage: Promote platforms (if in scope)

Before invoking, update the run record's `updated_at` to now (so the "from this session" freshness check the stage skills perform is satisfiable) and confirm `"promote_platforms"` is in `stages_in_scope`. Invoke `slava:events:promote-all` with the slug, the resolved platform blurb from step 5, **and the run-record path `~/.private/event-state/<slug>.run.json`** — this is what lets `promote-all` verify (not just trust) that its skip-branches apply, per the "invoked by the orchestrator" checks added to its own step 3b and step 5. `promote-all`'s own fan-out now fills every platform and collects the founder's Publish clicks in **one** Phase B sweep (touch 4) — this orchestrator adds no wrapper around it and no extra turn.

**`promote-all`'s own step 5 (WhatsApp blurb suggestion) is skipped when `promote_groups` is also in scope for this run** — see the "invoked by the events orchestrator" branch added to `promote-all.md` step 5. That step exists in `promote-all` as a standalone fallback for operators who never run `promote-groups`; when this orchestrator's Stage 7 is about to run `promote-groups` anyway, `promote-all` step 5 asking for its own WhatsApp-blurb approval would be an extra turn re-covering ground Stage 7's combined confirmation already covers. If `promote_groups` was explicitly excluded from this run's scope, `promote-all` step 5 runs normally as the operator's only group-copy path for that run.

On completion (all platforms `done` or `skipped`), update the run record.

**Hard requirement if `promote_groups` is in scope: do not end this turn without either running Stage 7 or explicitly deferring it.** Stage 6 above skipped `promote-all`'s own step-5 WhatsApp-blurb fallback specifically because Stage 7 was promised to cover that copy — if this session stops after Stage 6 (interruption, compaction, the operator assuming "platforms done" means "done"), that promise is broken and the groups leg is never generated anywhere, which is the July 5 failure recreated through a designed skip rather than an oversight. Before ending this turn, either proceed to Stage 7 now, or say explicitly: "Groups stage is still pending — `promote-all`'s own WhatsApp-blurb step was skipped on the assumption Stage 7 runs. Resume with `/slava:events:run <slug>` to complete it, or it will stay silently unresolved." Never let this go unstated.

### 7. Stage: Promote groups — Facebook groups and chat groups, one confirmation

Founder, 2026-08-31: *"i see the confirmation to promote simultaneously on facebook groups and
beeper and i confirm both and its done."* So this stage covers both surfaces and asks **once**.

1. Resolve the Facebook group targets (`slava:events:promote-facebook`) and the chat-group
   targets (`slava:events:promote-groups`) — including the `do_not_post` enforcement, which
   refuses the run if a blocked chat ID is also listed as a target.
2. Run `promote-groups`'s transport probe and link-liveness check. A dead bridge or a dead
   link stops here; do not ask for confirmation on a send that cannot succeed.
3. **One combined confirmation** listing both: the Facebook groups by name, the chat groups by
   name and language, the total count, and any group excluded with its reason. This is the
   blast-radius confirmation — for 6+ chat groups it still requires typing the exact count,
   unchanged.
4. On confirmation, send. Verify each send by **reading the message back out of the chat**,
   not by a timestamp or an absent error — the messaging bridge's search index lags, so fall
   back to reading the chat directly when a search comes back empty (measured 2026-08-31).

Facebook groups posting keeps its own per-post human click where the platform requires it;
that is a platform constraint, not an approval turn added here.

On completion, update the run record.

### 8. Optional stage — never auto-chained

After Stage 7 (or after Stage 6 if groups was out of scope), ask once: "Also send personal DMs / WhatsApp / email for this event? (y/n)" On yes, invoke `slava:events:promote-dm` (which itself branches to `promote-whatsapp` / `promote-email`). On no or no reply, stop here — this is opt-in per run, never a default.

### 9. Combined status report

Read all three files (`<slug>.json`, `<slug>.groups.json`, `<slug>.run.json`) and print one view:

```
Event: <slug> — <title>
Run scope: create ✓ | assets {✓|skipped} | promote_platforms {✓ n/a} | promote_groups {✓ n/a}

Platforms (promote-all.json):
  todo.today:        <done | skipped | pending>
  Facebook personal: <done | skipped | pending>
  Luma:              <done | skipped | pending>
  Eventbrite:        <done | skipped | pending>
  Social Layer:      <done | skipped | pending | n/a>

Groups (promote-groups.json):
  <N posted, N skipped (declined), N skipped (verify failed), N failed>
  — OR —
  PENDING (in scope per run record, no state file yet — this is the July 5 shape: don't read this as "no groups leg needed")
  — OR —
  n/a (not in scope for this run)
```

**A read-only status check** (invoking this skill against a slug with an existing run record and no new work requested) never re-invokes any stage skill — it only reads the three files and reports. This is what satisfies "invoked against a past completed event, reports all four stages done, attempts no re-promotion."

---

## Conventions

- **Sequences existing skills; never reimplements them.** A weak result in any stage (a bad blurb, a missed platform, a wrong-city Facebook default) is fixed in that stage's own skill file, never patched here. Same rule `docs/video-process.md` states for `/video-publish`.
- **Never publishes.** No stage of this orchestrator clicks Publish or Create — every such click is the user's, inherited from the stage skill that owns it.
- **Writes only its own run record.** `<slug>.json` and `<slug>.groups.json` stay exactly as their owning skills define them — this skill never appends to or reshapes either.
- **`promote-facebook` (groups) and `promote-facebook-personal` stay separate invocations** — nothing in this orchestrator merges them into one call.
- **Copy resolution replaces the downstream wording stops** — by having the downstream skills skip only their *wording* stop when the orchestrator supplies resolved text (see `promote-all.md` step 3b), never by bypassing their fact checks, and never when run standalone.

---

## Honest ceiling

- **The five touches are the floor, not a default that can be trimmed further.** Trail and cafe are judgments no tool makes; the event approval, the platform sweep and the group confirmation exist because publishing and fanning out to groups are public, hard-to-retract actions. Removing any of them trades correctness for autonomy — out of scope. The mechanical checks listed in the touches section are not touches and are never removed.
- **This skill sequences; it does not improve any stage.** A wrong-city Facebook default, a stale blurb, a missed auth wall are fixed in the owning stage skill, not here.
- **A stage failure stops the chain.** On any non-zero exit or unresolved gate, report which stage failed and stop — do not limp forward. Re-run resumes from the failed stage forward, using each stage's own cache to avoid re-doing completed work; it never re-runs Gate 1's creation choice.
