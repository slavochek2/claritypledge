---
status: in-progress
type: change-request
rank: 252
tags:
  - redesign
  - p1060
  - organizations
changes: p1060
flow: dev
drafted_by: opus
exec_model: opus
exec_effort: high
delivery_stage: dev
pipeline_ran: [dev]
---

# P1193 — Clarity Groups: the rename, the organizer role on screen, and the last-organizer leave guard

## Why this is a change request, and what it is a change to

**SUPERSEDED BY EVENTS, 2026-08-31.** When this spec was drafted, P1060 was in
flight on `feature/p1060-events-org` in worktree `w2`, and this spec instructed
the implementer to build on that branch rather than off `main`.

**P1060 has since shipped.** It merged as `fdefa5cd` ("chore: close p1060") and
its spec now sits at
`features/done/2026-06-10/p1060_link_events_to_organizations.md`. Neither
`feature/p1060-events-org` nor worktree `w2` still exists. Therefore:

> **Implement this in a fresh worktree off `main`, via `git-ops.sh claim 1193`.**
> Every `file:line` reference below was written against the pre-merge branch and
> is **stale** — re-derive each one by grep against `main` before acting on it.
> The named files and symbols are still correct; only the line numbers moved.
> One path has also moved: `org-header.tsx` is at
> `src/app/components/organizations/org-header.tsx`, not `src/app/components/`.

The `superseded_by: p1193` filing action this spec originally owed against the
P1060 spec is **moot** — P1060 is closed, not superseded.

## Problem

Three concepts exist in this product, and only two of them reach the screen:

| Concept | Meaning | Modelled? | Rendered? |
|---|---|---|---|
| Member | Accepted the Clarity Organization Terms; the membership row **is** the acceptance record (`accepted_at`, `terms_version`) | yes | yes |
| Participant | RSVP'd to one of this org's events, no terms accepted | yes (`OrgParticipant`) | yes (`OrgParticipantRow`) |
| Organizer | Can host events into the org | **yes, in the DB and the service** | **no** |

The last row is the correction to the brief this spec was written from. The role
is **not** missing from the model:

- `membership.role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','organizer'))`
  — `supabase/migrations/20260724120000_p1010_organizations_membership.sql:64`
- `export type OrgRole = 'member' | 'organizer'` and `getMyMembership(orgId):
  Promise<{ role: OrgRole } | null>` — `src/app/data/organizations-service.interface.ts`
- `org-page.tsx:79-83` already computes both `isMember` and
  `canHost = myRole === "organizer"`, and passes `canHost` to `EventsList`
  (`org-page.tsx:329`)
- the Members tab already badges organizers: `org-page.tsx:232`
  (`badge: m.role === "organizer" ? "Organizer" : undefined`)

**The gap is that the role stops at the tab list.** Two concrete wrongs follow.

**(a) The organizer of a group is greeted as an ordinary member.** `org-page.tsx:294`
passes `isMember={isMember}` into `OrgHeader` and nothing else; `OrgHeader` has
no role prop at all (`org-header.tsx:24-38`), so it renders the same "Manage
membership" dropdown for the person who runs the group as for someone who joined
yesterday. The founder, who is the seeded organizer of `cm`, reads "you're a
member" where he expects to read that he organizes it.

**(b) `Co-create` is offered only to people who already have hosting rights.**
In org context `showActions = canHost && !loading`
(`EventsList.tsx:116-118`), and `actionButtons` renders `Co-create` and
`Host Event` as a pair (`EventsList.tsx:129-142`). `Co-create` routes to
`/co-create` (`App.tsx:727`), the P62 collaborate page — the way to *find*
someone to build an event with. An organizer of this org can already host into
it directly. The button is aimed at exactly the people who do not need it.

**(c) The only organizer of a group can leave it, and nothing stops them.** The
membership DELETE policy is `USING (user_id = auth.uid())`
(`…p1010_organizations_membership.sql:90-91`) — self-deletion, no role
condition. `leaveOrganization(orgId)` deletes unconditionally
(`organizations-service.interface.ts`, `organizations-service.ts`), and
`OrgHeader`'s Leave item is offered to every member including the sole
organizer. The resulting state — a group with participants, zero organizers, and
nobody who can schedule an event — is not rendered anywhere in the product,
because nobody designed it. It is also not self-healing: `membership_insert`
forces `role = 'member'` (line 82-86), so **nobody can become an organizer
through the product at all**; organizer rows exist only because the P1010
migration seeded them by hand (lines 176+), and there is no org-creation surface
(P1010 Non-Goal, p1010 spec line 65 — NOT Decision 7, which is the /events redirect).

## Founder decisions — RESOLVED 2026-08-31, do not re-ask

| Call | Decision |
|---|---|
| The visible noun | **Organizer.** Same word in the header badge, the Members-tab badge (`org-page.tsx:232`, already correct), and the leave-block line. DB value `organizer` unchanged. |
| The treatment | **Badge beside the group name** in the header, similar weight to the directory card's membership badge. |
| Co-create on group pages | **Remove from the org-scoped list.** Group list shows `Host Event` alone. Standalone list keeps both, untouched. Reversible. |
| Degraded roster path | **Block leaving and say why.** If the roster failed to load the organizer count is unknown; the Leave control is unavailable with a retry line. The server trigger remains the authoritative guard, so this only governs the button's appearance, never correctness. |
| The blocking line | "You're the only organizer of this group." Degraded variant: "Can't check group organizers right now — reload and try again." |
| Nav item after the rename | **One item, labelled "Groups", pointing at `/groups`** (2026-08-31). The word "Events" leaves the public menu; events are reached through a group. Active-state matcher covers `/groups*` and `/events*`. The standalone `/events` list stays live and unchanged — it simply has no nav entry, exactly as `/events/list` already does not. |
| COA terms title | **Add COA version 6 titled "Clarity Group Terms", bump `CURRENT_COA_VERSION` to 6, and migrate `membership.terms_version`'s CHECK/DEFAULT to allow 6** (2026-08-31). Founder was shown that this costs a prod schema migration for a title-only change and chose it anyway, so vocabulary stays consistent. Versions 4 and 5 keep their existing title untouched — prior acceptances stay pinned to what their holders actually accepted. The oath body is a shared constant (`VERIFIED_UNDERSTANDING_OATH[5]`) and is **copied by reference into v6, not reworded**: v6 differs from v5 in `title` alone. |

## Scope change 2026-08-31 — the Groups rename is folded IN, not filed separately

Originally planned as its own spec. Folded in at the founder's call, and the
reason is not convenience: **the rename and the role work touch the same
strings.** Shipping the role badge first would mean authoring the header, the
badge and the leave-block copy against "Clarity Organization", then rewriting
all three a week later — and running a product that says "Organization" in one
place and "Group" in another in between. One vocabulary, one change.

### The naming rule (binding on every string in this spec)

| Thing | Value |
|---|---|
| The product noun | **Clarity Group** (plural: Clarity Groups). "Organization" disappears from every user-visible string. |
| The role label | **Organizer** — the badge, the Members-tab badge, and any chip. On a group page the context already supplies "group", so the label is not "Group organizer". |
| The role in prose | "group organizer" is fine in a sentence ("You're the only organizer of this group."). It is prose, never a label. |
| The word `lead` | **Never user-visible.** Founder's own word in session; not the product's. |
| The DB value | `membership.role = 'organizer'` — UNCHANGED. Renaming it is a migration with no user-visible benefit. |
| The table name | `public.membership`, `organizations` etc. — UNCHANGED, same reason. |

### What the rename covers

1. **Every user-visible string** across the org surfaces: directory heading, card
   copy, header, join page, nav label, empty states, dialogs, SEO titles and
   descriptions.
2. **The route:** `/org` → `/groups`, `/org/:slug` → `/groups/:slug`,
   `/org/:slug/join` → `/groups/:slug/join`. **`/org*` must keep working
   permanently** as a redirect — invite links carrying `?from=` attribution have
   already been shared, and P1076 says the parameter must survive the hop.
3. **The nav item:** `EVENTS_NAV_TO` currently points at `/org/cm` — a one-group
   hack documented as such. It becomes `/groups`, label "Groups", with the
   active-state matcher widened to cover `/groups*` and `/events*`.
4. **A back link** from a single group to the directory (`/groups`).

### The one carve-out, and it is NOT optional

`src/app/content/coa-versions.ts` holds the **Clarity Organization Terms**, a
VERSIONED legal record. Existing membership rows store `terms_version` pointing
at what their holder actually accepted. **Do not edit an existing version's title
in place** — that would retroactively change the text people are recorded as
having agreed to. Add a NEW version entry titled "Clarity Group Terms" and let
prior acceptances keep pointing at the old one.

**RESOLVED 2026-08-31 — the founder chose the version bump, informed of its
cost.** The terms *text* does not change: the only occurrence of "Organization"
in the record is the `title` field; `yourRight` / `myPromise` / `exception` are
shared references into `VERIFIED_UNDERSTANDING_OATH[5]` and are carried into v6
**by the same reference, unmodified**. So v6 differs from v5 in `title` alone,
and the "stop and ask about the terms text" branch does not fire.

What it does cost, and what the original draft did not know: per the file's own
header comment, bumping `CURRENT_COA_VERSION` **also requires the
`membership.terms_version` CHECK constraint and DEFAULT to allow the new value**
(set by the P1010 migration). So this carve-out carries a **second migration**
beyond the leave-guard trigger:

- add `6` to the `terms_version` CHECK constraint on `public.membership`
- move the column DEFAULT from `5` to `6`
- **do not backfill** — every existing row keeps the version it accepted

Both migrations ship in this spec. The trigger migration and the terms_version
migration are independent; author them as separate files.

## Solution

Three changes on the same branch. Founder chose the KISS option on (3)
explicitly: **block, don't hand over.**

### 1. Surface the organizer role in the org header

`OrgHeader` takes the caller's role, not just a boolean. Suggested shape,
matching what the page already holds:

```ts
/** The signed-in caller's own role in this org; null when not a member. */
myRole?: OrgRole | null;
```

`org-page.tsx` already has `myRole` in state (`:79`) — pass it through.

What changes on screen for an organizer: the header states the role rather than
implying plain membership, and the "Manage membership" dropdown reads as
managing an organizer's relationship to the group rather than a member's.

**RESOLVED — the noun is `organizer`, everywhere a person can read it.** The
founder said in session *"I'm the organizer, I'm the — I don't know how to call
it — the lead."* and then chose `Organizer` when asked directly (2026-08-31).
The DB value `organizer` is unchanged (a rename would be a migration and is not
in this spec), and the Members-tab badge at `org-page.tsx:232` already renders
`Organizer`, so it needs no edit. **`lead` must not appear in any user-visible
string.** Header badge, Members-tab badge and the leave-block line all read
`organizer`.

**RESOLVED — the treatment is a badge beside the group name**, similar visual
weight to the membership badge on the directory cards. Not a meta-row line, not
a CTA-label-only change.

Non-member and plain-member rendering must be byte-identical to today.

### 2. Take `Co-create` out of the org-scoped action set

In `EventsList.tsx`, `actionButtons` is used in both the org-scoped and the
standalone list. Split it: org-scoped (`isOrgScoped === true`) renders
`Host Event` alone; the standalone list keeps `Co-create` + `Host Event`
unchanged. **There are THREE call sites of `actionButtons`, not two** (verified
`grep -n actionButtons` on the w2 worktree): `:188` the top row beside the
filters, `:268` the org-scoped empty block, and `:289` the standalone empty
block under the P77 comment.

**`:289` MUST NOT CHANGE.** It is the empty-list action surface of the
STANDALONE list — the screen a first-time host with no group lands on. Stripping
`Co-create` there breaks the no-group hosting funnel, which this spec elsewhere
names as the most expensive possible outcome. Only the two org-scoped sites
(`:188` when `isOrgScoped`, and `:268`) get the treatment — the comment at `:120-127` claiming "Co-create travels with it
everywhere, embedded included" is the thing being reversed, so update it rather
than leaving a comment that contradicts the code.

**RESOLVED — remove `Co-create` from the org-scoped list** (founder, 2026-08-31).
The group list renders `Host Event` alone; the standalone list keeps both
buttons exactly as today. The founder considered showing `Co-create` to plain
members instead and declined for now — that inversion stays available as a
later change, so remove the button rather than deleting the concept.

### 3. Block the last remaining organizer from leaving

**Rule:** a member whose role is `organizer`, and who is the **only** organizer
of that org, cannot leave. The Leave control is unavailable to them, with one
visible line saying why. Everyone else's leave flow is untouched, including an
organizer where a second organizer exists.

Two layers, and both are in scope:

- **UI (the founder-visible half).** The org page already loads the full roster
  into `members` with roles on it (`OrgMember.role`), so
  `members.filter(m => m.role === 'organizer').length` gives the count without a
  new query. Note the roster load is fault-tolerant and swallows its error
  (`org-page.tsx`, `loadRoster`) — **if the roster failed to load, `members` is
  empty and the count is 0, which must not be read as "no other organizers"
  and must not silently unblock or block the wrong person.** Decide the
  degraded-path behaviour explicitly and state it in the PR.
- **Server (the authoritative half).** A UI-only guard is a suggestion: the
  DELETE policy permits any self-delete, so the state is still reachable from
  the API. Add a `BEFORE DELETE` trigger on `public.membership` that raises when
  `OLD.role = 'organizer'` and no other organizer row exists for `OLD.org_id`.
  A trigger, not an RLS change: RLS returning zero rows deleted is
  indistinguishable from "already left", which `leaveOrganization`'s
  `{ left: false }` contract already means.

**RESOLVED — the blocking line** (founder, 2026-08-31):

- Normal block: **"You're the only organizer of this group."**
- Degraded (roster failed to load, count unknown): **"Can't check group
  organizers right now — reload and try again."**

Explicitly **not** in this change: any handover flow, member picker, promote/demote,
or org deletion. Deferred by the founder in the same session.

## Non-goals

Discussed in the same session, being handled separately — do not fold in:

- ~~Renaming "Clarity Organizations" to "Clarity Groups"~~ — **FOLDED IN
  2026-08-31, see "Scope change" above.** This spec now owns the rename,
  including the route change and the permanent `/org*` redirect.
- Directory copy and visual polish, still deferred BY CHOICE even though the
  founder decided each in session: dropping the subtitle, dropping the
  "First event coming" badge, removing the decorative `Open` link on cards, and
  restyling the green "You're a member" badge (`org-directory-page.tsx:239-246`).
  These are independent of both the rename and the role, and folding them in
  would make the diff unreviewable. File as a follow-up. **Including the
  role on the directory cards** — the directory only fetches
  `getMyMembershipOrgIds()` (`:76`), which carries no role, so a role-aware
  badge there is a service change and belongs with that work.
- ~~Pointing the Events nav item at `/org` instead of `/org/cm`~~ — **FOLDED IN
  2026-08-31** as item 3 of the rename: it becomes `/groups`, labelled "Groups".
- Any user-facing org-creation flow (P1010 Non-Goal, p1010 spec line 65 — NOT Decision 7, which is the /events redirect) or a way to *become* an
  organizer. Both remain absent by design.

## Risks

### This guard is not new scope — P1010 deferred it, and the premise it was deferred on has now failed

P1010's own Risks section accepted this exact failure and deferred this exact
guard. Verbatim, from `features/.../p1010_clarity_organizations_community_container.md`
(Risks, "Sole-organizer self-orphan"):

> **Sole-organizer self-orphan (ACCEPT for v1):** `membership_delete` RLS is
> `USING (user_id = auth.uid())` with no role carve-out, so the seeded organizer
> can click Leave and strand the org with zero organizers (Decision 6 requires
> the organizer be surfaced). ACCEPT for v1 — orgs are Wizard-of-Oz /
> founder-managed and the organizer is founder-designated (won't self-remove);
> recovery is a one-row admin/migration re-seed. DEFER a client-side "last
> organizer can't leave" guard until self-serve org creation ships.

Two things follow, and both change how this spec should be read:

1. **The deferral premise was "the organizer won't self-remove."** The founder
   falsified it directly in review — *"I think we should give it to the leader to
   leave... it's a very different experience that we didn't create."* The
   accepted risk is the observed defect. This spec is the deferred decision
   coming due, not a new requirement.
2. **The stated release condition ("until self-serve org creation ships") has NOT
   been met** — there is still no org-creation flow. So the guard is being pulled
   forward ahead of its own trigger, deliberately. That is a founder call already
   made in session; do not re-litigate it, but do not silently drop the fact
   either.

P1010 also names the recovery path if the guard ships wrong: a one-row
admin/migration re-seed. That is the fallback if an organizer is locked out.


- **Locking the founder out of his own leave path.** `cm` has exactly one
  seeded organizer — the founder. After this ships he cannot leave `cm` through
  the product at all. That is the intended behaviour, and it is also the entire
  reason a handover flow is now a real backlog item rather than a nice-to-have.
- **Zero-organizer orgs may already exist.** The guard prevents new occurrences;
  it does not repair an org that is already there. Check before shipping:
  are there orgs with members and no `role = 'organizer'` row? If yes, that is a
  data fix, not this spec.

  **CHECKED 2026-08-31 — PROD IS CLEAN, TEST IS NOT.**
  - **Prod:** one organization, `cm`, with 1 member and 1 organizer. No
    zero-organizer org exists, so no data fix is owed and the guard is safe to
    ship. (`online` is not on prod yet — P1060 merged to `main` but has not been
    deployed.) Note the consequence this makes concrete: prod's only organizer is
    the founder, so after this ships he cannot leave `cm` through the product.
    That is the intended behaviour and the reason a handover flow is now a real
    backlog item.
  - **Test DB:** `cm` has **11 memberships and ZERO organizer rows.** Nobody can
    host into it there. This is not a P1193 defect — the P1010 migration seeds the
    organizer row from a founder profile slug that need not exist in test — but it
    had already silently invalidated an assertion in
    `e2e/p1010-organizations.spec.ts` ("a logged-in visitor gets BOTH Co-create and
    Host Event"), which P1060 D4 made false and which kept failing on its Co-create
    line, so the real cause never surfaced. Corrected in this branch; the test now
    pins the non-organizer negative, and the organizer case lives in
    `p1060-org-scoped-events.spec.ts`, which seeds a controlled organizer.
- **A trigger on `membership` DELETE also fires on cascade deletes.** `org_id`
  and `user_id` are both `ON DELETE CASCADE` (lines 62-63) — deleting a profile
  or an organization will run this trigger. It must not block those.

## Open questions the founder raised — verify, do not assume

He flagged these as things he does not know still work. They are not claims in
this spec; they are checks this spec should not ship without.

1. An event hosted in group A must not appear in group B's list. `EventsList`
   is org-scoped via `orgId` and there is an existing e2e file
   (`e2e/p1060-org-scoped-events.spec.ts`) — confirm it actually asserts the
   cross-org negative, and add it if it does not.
2. **Hosting an event with no group at all must still work.** This is the funnel
   for a first-time host who belongs to no group, and change (2) above touches
   the exact component that renders that path's buttons. Regression here is the
   most expensive possible outcome of this spec.

## Done-When

- [x] An organizer viewing their org page sees their role named in the header;
      the noun and treatment are the founder's, and match the Members-tab badge.
      *(`src/tests/p1193-org-header.test.tsx` — badge renders "Organizer"; classes
      copied from the Members-tab badge in `pledger-card.tsx`.)*
- [x] A plain member's and a signed-out visitor's org page render unchanged from
      before this spec. **Read as: unchanged with respect to the ROLE work.** The
      rename deliberately changes copy on those same screens, so "byte-identical"
      is not achievable and was not attempted; what is asserted is that neither
      sees a role badge and neither's leave flow is touched.
- [x] `Co-create` no longer appears in the org-scoped events list, in either the
      populated (beside filters) or empty (centered block) position.
      *(source contract + `p1060-org-scoped-events` + `p1010-organizations`.)*
- [x] `Co-create` still appears in the standalone `/events` list, unchanged.
      *(new test in `p1060-org-scoped-events.spec.ts`.)*
- [x] Hosting an event with no org selected still works end to end — verified by
      running it, not by reading the diff.
      *(`e2e/p1193-no-group-hosting.spec.ts` — drives `/events/new` to submit and
      asserts the stored row has `org_id` NULL.)*
- [x] The sole organizer of an org cannot reach Leave in the UI, and sees one
      line explaining why. *(`p1193-org-header.test.tsx`; the line is withheld-and-
      explained, not a disabled control.)*
- [x] An organizer with a co-organizer, and any plain member, can still leave.
      *(component test + `p1193-last-organizer-guard.spec.ts`, which also proves
      the guard re-arms once the co-organizer is gone.)*
- [x] `leaveOrganization` on a sole organizer is rejected **server-side**, proven
      by a call that bypasses the UI (integration test against test DB, in the
      style of `e2e/integration/p1010-organizations-membership-migration.spec.ts`).
      *(`e2e/integration/p1193-last-organizer-guard.spec.ts`, user-scoped JWT.)*
- [x] Deleting a profile or an organization still cascades — the new trigger does
      not block it. Exercised, not reasoned about. *(Both directions, same file.
      The PROFILE case is the one that proves `pg_trigger_depth()` works: the
      organization still exists there, so the stand-aside clause cannot be what
      saves it.)*
- [x] The cross-org event-leakage assertion exists and passes. **Answered the
      founder's open question 1: it already existed** —
      `p1060-org-scoped-events.spec.ts` asserts Org B's event is absent from Org
      A's Upcoming AND Past tabs, with the standalone list as the positive control.
      Nothing needed adding.
- [x] `EventsList.tsx`'s comment (the one at `:120-127` pre-merge) no longer
      claims Co-create travels everywhere.
- [x] `/org`, `/org/:slug` and `/org/:slug/join` all still resolve, permanently,
      and a `?from=` parameter survives the hop to `/groups/...` — asserted by a
      test, not by reading the route table (P1076).
      *(`e2e/p1193-groups-rename.spec.ts`, 9/9, incl. `?from=` on both the group
      and the join path. Two further dependents were found and fixed that the
      spec had not anticipated: `ALLOWED_REDIRECT_PREFIXES` needed `/groups`
      ADDED while KEEPING `/org` — it is checked before any router redirect runs
      — and the auto-join path regex was `/^\/org\/[^/]+\/join$/`, which would
      have silently stopped auto-joining every post-rename invite.)*
- [x] No user-visible string anywhere in `src/` reads "Organization" or
      "Organizations" — proven by a grep whose only surviving hits are the COA
      v4/v5 titles, internal identifiers, and code comments.
      **The first version of this gate was case-sensitive and shipped past three
      real strings**; it now matches case-insensitively, strips HTML entities
      before deciding what is prose (`hasn&apos;t` made a sentence look like
      code), and is proven against a known-good plus two known-bad controls.
- [x] The nav renders one item labelled "Groups" pointing at `/groups`, and its
      active state lights on both `/groups*` and `/events*`. *(A second gate
      sweeps `components/layout/` for hardcoded "Events" labels — the desktop
      top-nav link is hand-written and was missed by the nav-links-only check.)*
- [x] `COA_VERSIONS[6]` exists, is titled "Clarity Group Terms", and its
      `yourRight`/`myPromise`/`exception` are the **same object references** as
      v5 — asserted by identity, not by string comparison.
- [x] `CURRENT_COA_VERSION` is `6`, the `membership.terms_version` CHECK admits
      `6`, the DEFAULT is `6`, and **no existing membership row's
      `terms_version` changed** — the migration contains no UPDATE and no
      backfill; `coa-versions.test.ts` binds the registry to the CHECK list and
      the DEFAULT so a future version added in code without the migration fails
      the suite instead of failing at runtime.
- [x] A join performed after the migration records `terms_version = 6`.
      *(`p1010-organizations.spec.ts` join flow now reads the stored
      `terms_version` back after a real UI join. This is the only end-to-end bind
      between `CURRENT_COA_VERSION = 6` and the column DEFAULT — they live in
      different files and nothing else fails if only one of them ships.)*
