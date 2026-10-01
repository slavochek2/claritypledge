---
status: all-done
type: story
rank: 15
created_date: '2026-10-01'
tags: [admin, profiles, search, privacy]
disclosure: public
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: heuristic
completed_at: 2026-10-01
---

# P1381: Founder-only user lookup (/admin/users)

## Problem

**Situation:** The founder regularly needs to find a specific user and open their profile, for example someone just met at a Clarity Night. The only list of people is `/pledgers`: public, verified pledgers only, no search. Unverified and non-pledged users cannot be found at all without a DB query.
**Complication:** Events now bring in new users weekly. Each lookup is a manual DB query or a guess at a slug.
**Question:** A founder-only page to search all users and open a profile, without creating a public directory.

> Founder framing, verbatim: "I find myself more and more into a need to find users."

## Appetite

Blast radius: low for UX (one new founder-only page), but **the read path exposes email and LinkedIn for every user**, so a broken gate is a full PII leak. Reversibility: high (new page + new RPC, nothing existing changes). Decision density: zero remaining. The design was approved in the prototype.

## Invariants

- The user list, emails and LinkedIn links are returned ONLY by a server-side function that checks `profiles.is_admin` for the caller inside the database. Non-admin and anon callers get an error or nothing. A client-side check alone is never the gate: `is_admin` is not readable by the client (decisions.md 2026-08-18).
- No public or non-admin search over all users. Discovery stays relationship-scoped (decisions.md 2026-06-06, P878).
- Email and LinkedIn never reach a non-admin browser (P877 invariant, decisions.md 2026-04-22).
- The admin function: `SET search_path = ''`, admin check `COALESCE(is_admin,false)` on `auth.uid()` (P975 pattern; NULL uid = not admin), RAISE when not admin, `RETURNS TABLE` with an explicit column list (never `SETOF profiles` / `auth.users`). From `auth.users` it reads `id` and `last_sign_in_at` only.
- EXECUTE revoked from `PUBLIC` **and `anon` explicitly**: Supabase default privileges grant new functions to `anon` as a role, which a PUBLIC revoke does not remove (p1093 migration comment, verified 2026-10-01).
- No SECURITY DEFINER function writes `profiles.is_admin`. The P880 guard trigger only pins it for `anon`/`authenticated` (`p1212...sql:76`), so definer functions bypass it; any new definer function writing `profiles` names its columns explicitly. Verified 2026-10-01: none writes it today.
- The user list is never persisted to localStorage, sessionStorage or a persisted query cache.

## Solution

Build the approved prototype `/tree/admin-users` (`src/app/pages/prototypes/admin-users-prototype.tsx`) as a real page at `/admin/users`, fed by one admin-gated server-side function.

- **Search** by name or email, plus filter chips All / Pledged / Verified / Unverified with counts. The counts are the only stats.
- **Row:** avatar (photo + standard pledger ring), name, email, status, last login, LinkedIn icon (new tab, scheme-checked) when present. The whole row opens `/p/:slug`. Users without a slug are shown but not linked.
- **Order:** most recent login first; never-logged-in users last, newest signup first. No sort controls.
- **Non-admins** visiting `/admin/users` see the normal not-found page. The page is not linked from anywhere public.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Admin function loses its `is_admin` guard in a later redefinition | MITIGATE | Integration test: non-admin and anon calls fail. Same class as P975 (decisions.md 2026-06-30) |
| Last login lives in the auth schema, not `profiles` | MITIGATE | Read inside the same admin-gated function; never exposed elsewhere |
| LinkedIn URL is user-typed; a `javascript:` link clicked in the founder's session runs with admin rights | MITIGATE | Render only if it parses as `https:`; otherwise no icon. Tested with `javascript:` and `data:` |
| Sentry replay records 100% of errored sessions; RPC response body could be captured | MITIGATE | Confirm network-body capture is off; RPC errors carry no row data; no Mixpanel events with query or emails |
| Full PII list held in the founder's browser memory for client-side search | ACCEPT | Small today. If pagination moves search server-side, that RPC needs the same gate |
| Whole-list load gets slow as users grow | ACCEPT | Hundreds of users today; paginate when it is measurably slow |

**Non-Goals**
- Do NOT add a public `/users` page or widen `search_profiles`.
- Do NOT add resend-verification or a send-login-link button (founder: say "go to /login", or show a QR code).
- Do NOT add progress columns (onboarding, events, cmp10, stake tags), analytics, sort controls, or edit/delete. Add them when a concrete follow-up decision needs them.
- Do NOT change `/pledgers`.

## Acceptance Criteria

- [x] Signed in as the founder, `/admin/users` lists all users, including unverified ones
- [x] Typing part of a name or email narrows the list instantly; the clear button resets it
- [x] Filter chips show correct counts and filter the list
- [x] Pledgers show the blue ring; Google photos show where available
- [x] The most recently logged-in user is first; never-logged-in users show "Never logged in" and sit at the bottom
- [x] The LinkedIn icon opens the profile in a new tab; users without one show no icon
- [x] Clicking a row with a profile opens `/p/:slug`
- [x] Signed in as a non-admin, or signed out, `/admin/users` shows not-found, and calling the function directly returns no data (verified on **test** by curl). `[post-deploy]` re-verify on prod.
- [x] `pg_proc.proacl` for the function, read after applying on **test**, shows no `anon` or `PUBLIC` execute. `[post-deploy]` re-check on prod.
- [x] Test: a non-admin calling every profile-writing RPC with `is_admin: true` in the payload leaves `is_admin` false
- [x] Test: a LinkedIn value of `javascript:...` or `data:...` renders no icon
- [x] On any function error the page shows the generic not-found page; `/admin/users` is not in the sitemap
- [x] Layout holds at 320px, 375px and desktop with no overflow (long names and emails truncate)

## UX Notes

- **Empty search:** "No one matches "{query}"."
- **Loading:** standard app loader. **Error:** standard error state, no partial list.
- The visual reference is the approved prototype; match it.

## Related

- Prototype: `/tree/admin-users` (approved 2026-10-01)
- [P878](../2026-04-22/p878_relationship_scoped_people_picker.md): added `is_admin` and the no-directory decision
- [P877](../2026-04-22/p877_profiles_directory_pii_exposure_anon_key.md): PII column lockdown
- `/pledgers` (`src/app/pages/clarity-pledgers-page.tsx`): public, unchanged
