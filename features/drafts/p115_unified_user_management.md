---
status: backlog
type: story
---

# P115: Unified User Management (Ghost + Supabase)

## Problem

Blog subscribers (Ghost members) and app users (Supabase auth) are separate systems. If overlap grows, we'll want a single source of truth for user identity.

## Desired Outcome

A subscriber who signs up for the blog newsletter is recognized as the same person if they later create an app account (and vice versa). Users can unsubscribe from the blog while keeping their app account.

## Technical Options (to evaluate later)

1. **Ghost webhooks → Supabase sync** — `member.added` webhook creates a lightweight Supabase record. Supabase is source of truth.
2. **Supabase → Ghost Admin API sync** — App signup also creates a Ghost member. Ghost handles newsletter delivery.
3. **Custom subscribe form** — Replace Ghost's subscribe widget with a form that hits Supabase first, then creates Ghost member via API.
4. **Keep separate, link by email** — No sync infrastructure. Just match by email when needed (e.g., personalized onboarding: "Welcome back from the blog!").

## Constraints

- Ghost cannot use external auth — its member system is built-in and tightly coupled to newsletter delivery
- Any sync adds complexity: webhook handlers, error handling, conflict resolution
- Ghost enforces double opt-in on its side regardless

## When to Revisit

- Blog subscriber count exceeds ~100
- Evidence of blog readers converting to app users (or wanting to)
- Need to gate blog content behind app membership

## Signup Flow Inconsistencies (captured from /simplify review)

Currently two parallel signup flows with different behavior:

| Aspect | `/signup` | `/sign-pledge` |
|--------|-----------|----------------|
| Purpose | Account without pledging | Account + pledge commitment |
| Terms acceptance | Checkbox (enforced) | Passive text ("By signing, you agree...") |
| Google OAuth terms | **None** — users bypass checkbox entirely | N/A (no Google OAuth) |
| Empty field prevention | Button disabled until all fields + checkbox | Relies on HTML `required` attributes |

### Issues to Address

1. **Google OAuth terms gap.** Users who click "Continue with Google" on `/signup` never see or accept terms. This is the biggest gap — every other path at least mentions terms.

2. **Checkbox vs passive text.** Industry standard (Substack, Stripe, etc.) is passive acceptance: "By continuing, you agree to Terms & Privacy." GDPR (we're Estonian entity) requires consent checkboxes for *marketing emails*, not for terms acceptance. Recommendation: switch `/signup` to passive text to match `/sign-pledge` and reduce friction.

3. **Two flows, twice the maintenance.** Both flows need to stay for now — coaches may want accounts without personally pledging. But worth revisiting after coach hypothesis validation: if everyone pledges anyway, merge into one flow.

### Inspiration

Substack's subscribe widget: email field + passive terms text + "I'll subscribe later" bypass. Clean, low-friction, legally sufficient.

## Decision

Not yet. Keep systems separate until data shows unification adds value.

The signup flow inconsistencies (terms, OAuth gap) are low-priority cleanup — address when next touching auth flows.
