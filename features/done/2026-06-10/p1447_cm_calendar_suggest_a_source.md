---
status: all-done
type: story
rank: 26
workstream: events
created_date: '2026-10-09'
tags: [cm, events, anon-write, calendar]
disclosure: public
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
completed_at: 2026-10-09
---

# P1447: "Suggest a source" on the Chiang Mai events calendar

## Problem

**Situation:** `/cm` shows the Chiang Mai events calendar, filled by a private pipeline from a fixed
list of sources (chat groups, one Sola page, Todo.Today, Facebook, a few Luma calendars). Adding a
source today means someone messages the founder in a chat, and the founder edits the pipeline.

**Complication:** On 2026-10-07 a member of a Chiang Mai nomad chat asked in the group to add a
Sola page. The request sat unanswered for two days, and was then found to be already covered.
Requests like this arrive in chats the founder skims, with no record and no queue.

**Question:** Give people a place on the calendar page itself to suggest a source, stored for the
founder to review, and make the daily run show new suggestions.

> Founder framing, verbatim: "people can input links, and then it will be saved somewhere, and at
> some point we'll process and see which of them, of the suggested ones, we want to include."

Founder decisions already made (2026-10-09): open to anyone, signed in or not, with guards; the
daily review reads new submissions.

## Appetite

Blast radius: one public page plus one new anonymous write path. Reversibility: high (a new table
and RPC; drop both). Decision density: low — copy is the only open call, plus confirming the
override of the P1347 ruling below.

## Invariants

- **Write-only for anonymous callers.** Anon can call exactly one function, the submit RPC. No
  table grant, no RLS policy, no read path. Reading is through an `assert_admin()` RPC only
  (P1347 pattern; P1321 found nine anon-executable functions on prod — this must not add a tenth
  that reads).
- **Nothing is fetched or published from a suggestion.** A submitted link is text for the founder
  to read. No server-side request to it, no preview, no unfurl, no automatic source add.
- **Rate limited** (ruling 2026-09-09, P1278: an anonymous write path needs a rate limit). Postgres
  cannot see the client IP behind PostgREST (ruling 2026-10-01, P1347), so the cap is global per hour.

## Solution

1. **Store:** one table for suggestions (url, optional note, created_at, a status the founder sets:
   new / added / declined). RLS on, no policies, grants revoked from anon and authenticated.
2. **Submit RPC** (SECURITY DEFINER, executable by anon and authenticated): accepts only an
   `http(s)` URL up to 500 characters and a note up to 280; normalises and de-duplicates by URL
   (a repeat returns success without a new row); enforces a global cap of new rows per hour;
   records the caller's user id when signed in.
3. **Page:** on `/cm`, a small "Suggest a source" entry that opens a one-field form (link, optional
   note) with a clear confirmation. Signed-out visitors can use it.
4. **Founder read:** an admin RPC listing suggestions by status; the daily run (`/day`) shows one
   card when there are new suggestions since the last run (silent otherwise), listing each link.
   Marking a suggestion added or declined is a founder action through the admin RPC.

[FOUNDER DECISION: button label, form heading, placeholder and confirmation text]

[FOUNDER DECISION: confirm overriding the P1347 ruling (2026-10-01) that "typed suggestions and
links need sign-in" because "the abuse risk sits in free text". The proposal keeps anon submission
and contains that risk differently: the text is never shown publicly, the note is capped at 280
characters, and only the founder reads it. Residual risk: spam or a malicious link in the
founder's queue.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Spam flood fills the queue | MITIGATE | Global hourly cap; URL-only validation; de-dupe by URL |
| Malicious link reaches the founder | ACCEPT | Founder reads links as text; nothing auto-opens or fetches them |
| A script mints submissions up to the cap | ACCEPT | Same posture as P1347 votes; the cap bounds it |
| Free-text note used to send abuse | MITIGATE | 280-character cap; never displayed publicly |

**Non-Goals**
- Do NOT add the suggested source to the pipeline automatically, or touch the private events pipeline.
- Do NOT show suggestions publicly or to other signed-in users.
- Do NOT add a CAPTCHA or email capture.

## Acceptance Criteria

- [x] A signed-out visitor on `/cm` can submit a link and sees a confirmation — anon submit 204 on test (canary); confirmation screen verified in browser (server reply stubbed while the test cap was full) and by unit test
- [x] A non-link (e.g. `hello`, `javascript:…`) is refused with a readable message, and nothing is stored — canary + unit + browser at 320px
- [x] Submitting the same link twice stores one row — canary (www / trailing-slash repeat), and path case kept distinct
- [x] A signed-out caller cannot read suggestions through any API path (anon REST select and RPC probe both refused) — verified on **test**; canary proven to fail when the admin list is opened to anon. `[post-deploy]` re-verify on prod.
- [x] Beyond the hourly cap, further submissions are refused with a readable message — canary incl. concurrent submits never overshooting, and a full cap answering known and unseen links alike
- [x] The next `/day` run after a submission shows one card listing the new link; with no new submissions, no card — `cp.sources` check run against **test** (lists new links; a missing table reads 'query failed', never ok). `[post-deploy]` first prod /day run.

## UX Notes

States: closed (link-style entry), open (field + optional note + submit), saving, saved
(confirmation, form resets), error (validation or cap message; input kept). Mobile at 320px.

## Migration Plan

One migration: table, submit RPC, admin read/update RPCs, revokes from anon and PUBLIC on the
admin RPCs (both forms, P1066). Client-safe (additive). Apply to test, then prod with the founder's go.

## Related

- P1347 (topic voting: RPC-only anon writes, global cap) — the pattern this copies
- P1278 (anon write paths need a rate limit) · P1321 (anon-executable function audit)
