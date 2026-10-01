---
status: backlog
type: task
rank: 310
workstream: infrastructure
created_date: '2026-10-01'
tags: [csp, storage, media, guard]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
related:
  - p1336
  - p1005
  - p906
---

# P1385: Public media goes to Google Cloud Storage by default, and a test proves the live site can load it

## Problem

> Founder, verbatim (2026-10-01): "its a repeated mistake uploading to supabase.. i guess we can
> brainstorm a fix that is sustainable.. so next time its google per default?"

**Situation:** The site's public media (the landing page's founder clip, story images) lives in
`gs://claritypledge-story-images`, and production's CSP allows `media-src` from
`storage.googleapis.com` only. The dev server sends no CSP.
**Complication:** P1336 put four preparation videos in a new Supabase Storage bucket. Every local test
passed; on claritypledge.com every video would have been blocked. Caught by hand the day before the
push. Supabase buckets have been created three earlier times (event banners ×2, agent avatars —
images, which `img-src` happens to allow), and the P904 architect chose a Supabase bucket until the
founder redirected it. Prod-only CSP blocks have now happened 7 times (P805, P863, P865, P906, P1005,
P1285, P1336). The only written rule is one line in `docs/technical/infrastructure.md` ("Prefer GCS
over Supabase Storage", bucket name still `[TBD]`), which nothing loads at the moment a migration or a
`<video>` is written.
**Question:** How do we make GCS the path of least resistance for public media, and make a host the
live site would block fail a test instead of the founder's eye?

## Appetite

Blast radius: one helper and one test; touches only code that builds public media URLs.
Reversibility: plain revert. Decision density: zero — the GCS convention and CSP exist.

## Solution

1. **One helper builds every public media URL** (e.g. `publicMediaUrl(path)`) and points at
   `https://storage.googleapis.com/claritypledge-story-images/…`. P1336's `clipUrl` and the landing
   page's founder clip use it.
2. **One test** derives allowed origins from `vercel.json`'s CSP and asserts the helper's origin is in
   `media-src` and `img-src`; the same test scans `src/` for Supabase Storage URL literals
   (`storage/v1/object/public`, `.supabase.co/storage`) outside an explicit allowlist (today's
   banner/avatar image uploads), so a new one fails with a message naming the rule. P1336's CSP test
   (`src/tests/p1336-prep-pieces.test.tsx`) is the starting point.
3. **Two rule lines where they load:** `.claude/rules/database.md` (fires when writing a migration)
   and `.claude/rules/src.md` (fires when writing `src/`): *public media → `gs://claritypledge-story-images`;
   prod `media-src` allows only `storage.googleapis.com`; dev has no CSP, so a wrong host passes
   locally.* Edit through `/slava:maintain:claude-md` (rules gate).
4. Replace the `[TBD]` bucket name in `docs/technical/infrastructure.md` and say that it covers curated
   static media, not only uploads.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A legitimate private Supabase bucket (signed URLs) trips the scan | MITIGATE | Allowlist with a reason per entry; the scan targets public-object URLs only |
| New third-party origins (YouTube etc.) are not covered | ACCEPT | Per-directive canaries + post-deploy csp-smoke already own that class |
| Existing banner/avatar uploads stay on Supabase | ACCEPT | They are user uploads, `img-src` allows them; moving them is out of scope |

**Non-Goals**
- Do NOT migrate existing Supabase buckets or their files.
- Do NOT add a prod-like CSP server to e2e (real runtime cost; revisit if a CSP block slips past this test).
- Do NOT drop P1336's unused `p1336-clips` bucket here (destructive; separate decision).

## Done-When

- [ ] Every public media URL in `src/` comes from the helper (grep shows no other construction of GCS or Supabase-storage media URLs outside the allowlist)
- [ ] The test fails when the helper's origin is removed from `media-src` (shown red, then green) and when a new Supabase Storage URL literal is added to `src/` (shown red, then green)
- [ ] The rule lines exist in `database.md` and `src.md`, passed through the rules gate
- [ ] `infrastructure.md` names the bucket

## Related

[P1336](p1336_registration_carries_opt_in_prep_and_survey.md) (the incident) · P1005 (founder clip on
GCS + `media-src`) · P906 (missing-directive class, decisions.md 2026-06-06)
