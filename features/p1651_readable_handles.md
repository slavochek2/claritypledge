---
status: week
type: story
rank: 115
workstream: clarity-chat
created_date: '2026-11-07'
tags: [profiles, handles, settings]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
spec_review_hash: 72d77828b199d7ed5e432f91362d5852e64aa1252f97c297ceb0d83c051d0dc0
spec_review_vendors: [codex, gemini, openrouter]
---

# P1651: Readable handles: one rule for every handle, and people can change theirs

## Problem

**Situation (verified 2026-11-07 against main):**
- A handle (`profiles.slug`, the `/p/<handle>` address) is made by the client. The auth callback romanizes the name
  (P985, since 2026-07-09: a Chinese name becomes `zhang-wei`, a Thai name `hnuu`) and falls back to
  `user-<timestamp>` (`AuthCallbackPage.tsx:280-291`). Accepting an agreement then replaces a placeholder handle
  with one made by `ensureUniqueSlug`, which does **not** romanize (`accept-agreement-page.tsx:51-53,231-236`,
  `api.ts:687-701`). Live migration inserts profiles too (`p1490_live_migration_keeps_profile_date.sql:116-117`).
- No minimum, maximum or case rule exists. Uniqueness is case-sensitive (`initial_schema.sql:7`) while
  `find_profile_by_handle` compares lowercase and takes `LIMIT 1` (`p1556_contact_codes.sql:228-237`).
- The server rejects the reserved `agent-` and `machine-` forms when a slug changes (P1104/P1212,
  `p1321_profile_email_follows_auth.sql:62-67`); agent provisioning writes exactly those forms.
- Handles are read in places beyond `/p/` routes: a canvas link secret is stored under a key built from the handle
  in the address (`canvas-link-token.ts:42`, written before React by the `index.html` head script); the badge
  letter shortcodes resolve the founder by an exact handle (`offline-reads-letters.ts:14,22`); link-preview
  crawlers get `/p/:slug` cards from `api/og` (`vercel.json:217-225`, `api/og.ts:307-342`); account erasure scrubs
  stored live-session data by the current handle (`p520_erasure_hardening.sql:277-280`).

**Complication:** A one-letter name produced the handle `d` (2026-11-02, prod); one pre-P985 account has `-2`. Since
P1556 (2026-11-06) handles are shown and searchable, so an unreadable handle is visible and its owner cannot fix it.
P1556 left changing handles out of v1 because they are printed in letters, badges and shared links, and noted the
way to build it: redirects from the old handle.

> Founder, verbatim: "Some people, they get like really shitty names because they put like one letter, and
> then they get like a handle that is just like one letter". "we shouldn't allow a handle with Chinese
> characters right I mean we always give normal handles or not and if they change that should be like you
> know some rules on what they can and cannot do"

**Question:** One server-enforced rule for every new handle, every creation path producing a valid one, and a
Settings change that never breaks an address already shared.

Promoted from the task inbox, 2026-11-07.

## Appetite

Blast radius: high (profile addresses, canvas link secrets, badge letters, link previews, erasure).
Reversibility: medium (migration adds a handle-history table; a changed handle stays changed). Decision density:
low; the values marked below are founder calls.

## Decisions already made (founder, 2026-11-06)

- **Rules apply to every new or changed handle.** Names stay free (any script, any length).
- **Existing handles are not renamed.** Their owners may change them; nobody else does.
- **Handle search stays exact** and does not open a chat (P1556).

## Solution

1. **The rule:** lowercase `a-z`, `0-9` and single dashes; 3 to 30 characters; starts and ends with a letter or
   digit; at least one letter; not reserved (the `agent-` and `machine-` forms, plus an app-word list
   (founder, 2026-11-07: admin, support, help, settings, api, www, clarity)); not held now or
   before by anyone else. Agent provisioning keeps its reserved forms through its existing server path only.
2. **One namespace, enforced at the table.** Every handle, current or former, lives in one handle table with a
   lowercase unique index, so a handle belongs to one profile forever and a signup racing a rename cannot take it.
   Every write to a profile's handle, by any path, passes the rule and records history in the same transaction;
   writes that leave the handle unchanged are not re-checked, so legacy handles (`d`, `-2`) keep working.
3. **Initial set versus change.** Two cases are an initial set (no limit, no history): a profile's first handle, and
   replacing a placeholder (`user-<n>`, `anonymous`/`unknown`, empty) on a profile still inside the existing fresh
   window (`isFreshProfile`, `accept-agreement-page.tsx:233`). Everything else is a change, including an older
   placeholder and a `member-` fallback, which may already be shared. Both go through one server function; the
   client never writes the slug column directly.
4. **Settings: change your handle.** A field showing `@handle` with the address below, live rule feedback, an
   availability check, and Save. Limit (founder, 2026-11-07): one change per 30 days; returning to a former
   handle counts as a change.
5. **One generator for every creation path** (auth callback, accept-agreement, live migration). The client
   romanizes the name (the transliteration library is client-side) and passes it as a suggestion; a server function
   finalizes it: lowercase, apply the rule, truncate so the result with any `-N` suffix fits 30, pad a too-short
   result with digits (`d` → `d42`), pick the first suffix free in the whole handle namespace, and fall back to
   (founder, 2026-11-07) `member-` plus 6 random digits when nothing usable remains. Live migration, which has no
   client, passes no suggestion and gets the fallback or a server-side ASCII fold. The client stops probing
   `profiles` for availability. A refusal never ends signup.
6. **Old addresses keep working.** `/p/<former>/...` (profile, badge, pledge, partners, canvas) resolves to the
   profile and replaces the address with the current handle, keeping the path, query (`?v=`) and fragment. On a cold
   load the canvas secret stored under the former handle (sessionStorage and the in-memory fallback) is moved to the
   new key before the canvas reads it. The resolver open to signed-out visitors returns only the current handle
   for a former one (no name or photo), allows 30 lookups a minute per caller (by IP at the edge for signed-out
   visitors), and returns nothing for handles never held. All handle lookups compare lowercase, `api/og` included. Link previews (`api/og`) and
   badge letter shortcodes resolve former handles too.
7. **Search stays on current handles.** `find_profile_by_handle` does not resolve former handles, so someone who
   changed their handle is not found by the old one through search.
8. **Erasure.** Erasing an account scrubs stored data by every handle it held, and deletes its handle history
   except a bare reservation of each handle (no link to the person), so no handle is ever reused. Former-handle
   addresses then show "not found".

## Invariants

- **No shared address breaks** while the account exists, including canvas links with their `#k=` secret on a cold
  load with storage blocked.
- **A handle, current or former, belongs to one profile forever** (compared lowercase); after erasure it is
  reserved and assigned to no one.
- **Reserved-identity defences stay** (P1104/P1212).
- **Handle search stays exact, current-only and grants no messaging** (decisions.md 2026-11-06, P1556).
- **Legacy handles are never re-validated** on login or unrelated profile saves.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A changed handle can look like another person's name | ACCEPT | Names already can; the reserved list covers app words. Revisit with a report button |
| A former-handle link reveals the current handle of the person it belonged to | ACCEPT | Old links already pointed there; search does not (7) |
| Case collisions under the lowercase index | ACCEPT | Prod 2026-11-07: 0 uppercase slugs, 0 case duplicates, 0 empty, 0 placeholders. Re-count at migration time; abort the migration if any appear |

**Non-Goals**
- Do NOT rename any existing handle.
- Do NOT change how names are stored or displayed.
- Do NOT add open handle search or messaging by handle.
- Do NOT change sharing (P1650).

## Acceptance Criteria

- [ ] An old placeholder (outside the fresh window) replaced through accept-agreement keeps redirecting.
- [ ] New profiles via the auth callback, accept-agreement and live migration: the name "D" gives a 3+ character
      handle passing the rule; "张伟" gives `zhang-wei`; "🙂" gives the fallback; a 40-letter name gives 30 or fewer.
- [ ] In Settings, each is refused with a reason: `ab`, `-ab`, `ab-`, `a--b`, `张伟`, `123`, a 31-character
      handle, a reserved word, `agent-x`, another person's current handle, another person's former handle.
      Typing `Ana-Lee` saves `ana-lee`.
- [ ] After `old` → `new`: `/p/old`, `/p/old/badge`, `/p/old/pledge`, `/p/old/partners` and
      `/p/old/canvas/<name>?v=2#k=<secret>` (cold, signed out, storage blocked) land on the same page under `new`
      and the canvas opens. A link preview of `/p/old` shows the profile card.
- [ ] After `new` → `newer` (past the limit): `/p/old` lands on `newer`.
- [ ] Handle search for `old` finds no one; for `newer` finds the profile.
- [ ] A change inside the limit is refused with the date it becomes possible.
- [ ] Accounts with handles `d` and `-2` log in and save their bio without error.
- [ ] A direct table write to an existing profile's slug is refused on test; only the server handle function
      changes it, under (3) and the limit.
- [ ] Two signups and a rename racing for the same handle: exactly one holds it.
- [ ] After erasing an account that changed its handle, nothing but the bare reservation carries either handle,
      neither links to the erased person, and neither can be taken.
- [ ] If the founder account changes its handle, `/letter/st1` still opens its letter.

## Related

- done/p1556 (visible handles, exact-handle search) · done/p985 (romanized handles) · done/p1104 (reserved forms) ·
  done/p1515 (canvas link secrets) · done/p520 (erasure) · p1650 (sharing)
- decisions.md 2026-11-06 (P1556)
