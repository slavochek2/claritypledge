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

## The four human gates (and no more)

`/video-publish`'s principle is "only two gates, everything else autonomous." Events genuinely need more, because the platform browser-clicks cannot be automated (confirmed live in the session that produced this spec) — but the count is capped at four:

1. **Kickoff** — which creation path, plus that path's founder-only inputs.
2. **One combined copy review** — resolve *all* copy up front (the platform promo blurb + every language's group blurb) and show it on one screen before any send touches anything.
3. **Per-platform browser gates** — *inherited from `promote-all`*, not added. This skill wraps `promote-all`'s existing per-platform stops and adds zero approval turns around them.
4. **Group-send blast-radius confirmation** — already in `promote-groups` (type the exact count for 6+ groups). Unchanged.

Everything else — resolving state, reading caches, sequencing stage invocations — happens with no ask.

---

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
   - `publish-event` — general-purpose, operator-safe, own account (form-driven)
   - `publish-run` — trail run/hike/walk from an AllTrails link
   - `re-create-event` — clone the most recent occurrence of a recurring series (founder-only DB automation; requires at least one prior event in the series)
2. That path's own founder-only inputs (see the chosen skill's own Input section — do not re-derive them here).
3. **Which stages are in scope for this run?** Default: all four (create, assets, promote platforms, promote groups). The operator may explicitly narrow this (e.g. "skip posters," "platforms only, I'll do groups by hand later").

Write the run record (schema above) **before invoking the chosen creation skill** — this is the "before any stage executes" requirement above.

### 3. Stage: Create

Invoke the chosen creation skill (`slava:events:publish-event`, `slava:events:publish-run`, or `slava:events:re-create-event`) via the Skill tool with the Gate-1 inputs. That skill owns its own approval flow for publishing the event — this orchestrator adds no gate here; the event-creation skill's own "review, then you click Publish" stop is not duplicated or suppressed.

On completion, extract the resulting `slug` (if not already known) and update the run record's `updated_at`.

### 4. Stage: Assets (if in scope)

Invoke `slava:content:gen-poster` with the slug. This runs autonomously (self-review loop is internal to that skill) — no additional gate here.

### 5. Gate 2 — Combined copy review (if `promote_platforms` and/or `promote_groups` are in scope)

Resolve **all** copy that either downstream stage will need, in one pass, before either stage runs:

1. Resolve the platform promo blurb exactly as `promote-all` step 3b would (series-doc `## Promo blurb` or generated fallback) — but do it **here**, not inside `promote-all`.
2. Resolve every distinct-language group blurb exactly as `promote-groups` step 3 would (matched type entry, per-language sourcing, placeholder resolution, staleness token check) — but do it **here**, not inside `promote-groups`.
3. Show both in one message: the platform blurb, and each language's group blurb (same copy-paste-ready format `promote-groups` step 5 uses).
4. Wait for approval or edits. On edits, re-resolve and re-show before proceeding — never carry an unapproved edit forward.

**This is the one gate that is not free.** `promote-all` step 3b already stops for its own blurb review, and `promote-groups` step 5 already stops for its own copy approval. Passing the approved text into each stage and having each stage **skip its own duplicate wording-approval stop** is a defect if missed, not a shortcut — see the "invoked by the events orchestrator" branch added to `promote-all.md` step 3b and to `promote-groups.md` step 5.

**What each stage still keeps, even when orchestrated:** `promote-all`'s per-platform browser stops (Gate 3) and `promote-groups`'s staleness check, transport probe, link-liveness check, and blast-radius group-count confirmation (Gate 4) all run unmodified. Only the *wording*-approval turns collapse into this one combined review — the safety checks that don't depend on wording (probe proving Beeper is live, staleness proving the text isn't stale, blast-radius proving the operator meant to send to N groups) are not wording approvals and are never suppressed.

Count approval turns across a full run to confirm: exactly one combined *wording* review here, and none of `promote-all`'s step 3b stop, `promote-all`'s step 5 WhatsApp-blurb stop, or `promote-groups`'s step 5 copy-display also fires.

### 6. Stage: Promote platforms (if in scope)

Before invoking, update the run record's `updated_at` to now (so the "from this session" freshness check the stage skills perform is satisfiable) and confirm `"promote_platforms"` is in `stages_in_scope`. Invoke `slava:events:promote-all` with the slug, the approved platform blurb from Gate 2, **and the run-record path `~/.private/event-state/<slug>.run.json`** — this is what lets `promote-all` verify (not just trust) that its skip-branches apply, per the "invoked by the orchestrator" checks added to its own step 3b and step 5. `promote-all`'s own per-platform stops (Gate 3, inherited) run as that skill already implements them — this orchestrator adds no wrapper around them.

**`promote-all`'s own step 5 (WhatsApp blurb suggestion) is skipped when `promote_groups` is also in scope for this run** — see the "invoked by the events orchestrator" branch added to `promote-all.md` step 5. That step exists in `promote-all` as a standalone fallback for operators who never run `promote-groups`; when this orchestrator's Stage 7 is about to run `promote-groups` anyway, `promote-all` step 5 asking for its own WhatsApp-blurb approval would be an extra, un-inherited approval turn re-covering ground Gate 2 already covered. If `promote_groups` was explicitly excluded from this run's scope, `promote-all` step 5 runs normally as the operator's only group-copy path for that run.

On completion (all platforms `done` or `skipped`), update the run record.

**Hard requirement if `promote_groups` is in scope: do not end this turn without either running Stage 7 or explicitly deferring it.** Stage 6 above skipped `promote-all`'s own step-5 WhatsApp-blurb fallback specifically because Stage 7 was promised to cover that copy — if this session stops after Stage 6 (interruption, compaction, the operator assuming "platforms done" means "done"), that promise is broken and the groups leg is never generated anywhere, which is the July 5 failure recreated through a designed skip rather than an oversight. Before ending this turn, either proceed to Stage 7 now, or say explicitly: "Groups stage is still pending — `promote-all`'s own WhatsApp-blurb step was skipped on the assumption Stage 7 runs. Resume with `/slava:events:run <slug>` to complete it, or it will stay silently unresolved." Never let this go unstated.

### 7. Stage: Promote groups (if in scope)

Invoke `slava:events:promote-groups` with the slug and the run-record path `~/.private/event-state/<slug>.run.json` (same reason as Stage 6 — lets `promote-groups` verify, not trust, the "invoked by the orchestrator" skip in its own step 5). Its own probe, staleness check, and blast-radius confirmation (Gate 4, inherited) run unchanged.

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
- **The combined copy review replaces two separate stops with one** — but it does so by having the downstream skills skip their own duplicate stop when the orchestrator supplies pre-approved text (see `promote-all.md` step 3b), not by bypassing their gates when run standalone.

---

## Honest ceiling

- **Four gates are the floor, not a default that can be removed.** Kickoff and the combined copy review are meaning-judgments no tool makes; the per-platform and blast-radius gates exist because the underlying browser actions and group-fan-out risk cannot be automated safely. Removing any of them trades correctness for autonomy — out of scope.
- **This skill sequences; it does not improve any stage.** A wrong-city Facebook default, a stale blurb, a missed auth wall are fixed in the owning stage skill, not here.
- **A stage failure stops the chain.** On any non-zero exit or unresolved gate, report which stage failed and stop — do not limp forward. Re-run resumes from the failed stage forward, using each stage's own cache to avoid re-doing completed work; it never re-runs Gate 1's creation choice.
