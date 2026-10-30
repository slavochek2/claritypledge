---
status: qa
type: change-request
changes: p1542
rank: 1
workstream: events
created_date: '2026-10-30'
tags: [events, social-hike, close, reviews, consent]
disclosure: public
pipeline_ran: [create-spec, dev]
delivery_stage: dev
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1594: Hike quotes, writing is the consent

## Problem

P1542 shipped a "Quote me" tickbox on the Social Hike close. A review found that unticking it never reached the published review, so a quote the founder had approved stayed public after the person withdrew. The founder questioned the box itself:

> "It's not a tick. If they don't want to write anything, they don't write. It's not like, for example, on Google recommendation, they don't tick stuff. They just, if you give recommendation, obviously it's published."

## Solution

On the hike close, the written recommendation is the consent. The tickbox is gone, and a line under the text box says: "By sharing, you agree we may publish your words with your name on the series page." The founder still approves every quote before it is public.

- Clearing the words rejects the review, which leaves public view at once.
- Changing the words sends the review back to pending with the new words.
- Words added after an empty finish queue a pending review. A rejected review is never revived.
- The old box write is refused on a hike. Clarity Night keeps its box unchanged.
- The founder's approve command only publishes the exact words it checked, and refuses otherwise.

Review rounds also bounded the event room's reconcile retry (metered rules 3, 4, 6), gated its follow-up join, logged failed RSVP batches, and honoured reduced motion on the loader. Cost Budget rows are in the P1542 spec.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Privacy policy still describes consent as ticking a box | DEFER | Legal wording is the founder's call; asked |
| Room exhausted-state copy "That didn't save." may be false when the write committed | DEFER | Founder asked for wording |
| One p1114 room e2e fails on main against the self-hosted TEST too | DEFER | Filed in the task inbox; not caused by this change |

Non-goals: do NOT change Clarity Night consent; do NOT touch prod data.

## Acceptance Criteria

- [x] A hiker sees the consent line and no tickbox on the close (browser e2e, 3/3)
- [x] Approved quote, then cleared words: the quote leaves the public read (integration e2e on TEST, 11/11)
- [x] Changed words go back to pending and out of public view (integration e2e)
- [x] The founder approve refuses when words change between check and write (unit test, fails with the guard removed)
- [x] Room retry makes at most 9 re-reads per outage, none while hidden (fake-timer tests)

## Pre-deploy Checklist

- [x] Migrations 20261030120000 and 20261030130000 applied to the active TEST; prod is applied by /push
