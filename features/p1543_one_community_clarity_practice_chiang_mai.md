---
status: today
type: story
rank: 6
workstream: events
created_date: '2026-10-22'
tags: [groups, copy, navigation]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
---

# P1543: One community: "Clarity Practice Community · Chiang Mai", online group hidden, Events tab on phones

## Problem

**Situation:** There are two groups. `cm` is "Communication Activism Community · Chiang Mai": free, in person, where every hike and evening lives. `online` is "Clarity Practice Community · Online", where nothing runs today. On phones the bottom tabs carry Groups, which opens a directory of those two.

**Complication:** The founder will not say the `cm` name out loud in Chiang Mai:

> Founder, verbatim: "in Chiang Mai I want to be open to say hey I am leading this community but if I say activism is a bad word … and I don't want to be associated with this, even though I guess it's activism."

The online group has no events and no audience defined yet. A Groups tab that opens a two-row directory, where one row is dead, costs a tab on the phone.

**Question:** Merge to one community with the name the founder will say, keep the "carry it outward" ask in its text, hide the empty group, and give the phone tab to Events.

## Appetite

Blast radius: low. Copy, one org's visibility, one nav entry, one default. Reversibility: high. Every change is an UPDATE back or a one-line revert. Decision density: zero. Every call below was made by the founder on 2026-10-22.

## Founder decisions (2026-10-22, this conversation)

1. Rename `cm` to **Clarity Practice Community · Chiang Mai**. The activism ask lives in the text ("carry this practice outside of our community"), not the name.
2. Replace `cm`'s subtitle and About with the approved 7-paragraph text below, word for word. The founder approved it after a Gemini plus Codex pass.
3. **Hide** the online group (visibility `private`), never delete it. Its one member stays a member, and it can be reopened later.
4. Phone bottom nav: **Events replaces Groups**, pointing at the events list.

## Solution

- **One migration, guarded like `20260908100000`.** It is written against the exact live row and raises if the row has drifted. Live rows were checked on test and prod on 2026-10-22: they match the 2026-09-08 migrations. It does three things:
  1. `cm`: set name, blurb and description to the text below.
  2. `online`: set `visibility = 'private'`.
  3. No membership row is touched.
- **Online events default to no group.** `resolveOrg` currently files an online location under `online`. With `online` hidden it should return "loose" (unaffiliated), and an explicit `org_slug: "online"` should become an unknown slug that is asked about. `docs/events/org-defaults.md` gets the same change.
- **Close page copy.** "Join the Communication Activism Community" becomes "Join the Clarity Practice Community" (`EventClosePage.tsx`).
- **Phone bottom nav.** The Groups tab becomes Events (`EVENTS_LIST_TO`, calendar icon). The desktop menu and the footer are unchanged; both already carry Events and Groups.
- Comments and docs that name "Communication Activism" as the current name are updated; history entries in decisions.md are not.

### Approved text (verbatim)

Subtitle:
Practise revealing and bridging gaps in cognitive understanding with people across different interests, opinions, values and industries.

About:
This community is for people who get curious rather than defensive when they spot a gap in their own cognitive understanding of other people. In every conversation between two people there's a hidden number: how much, from 0 to 10, do you understand each other's intended meaning? It is here right now. Your interpreted meaning of what you read might not fully match my intended meaning.

Most people never reveal gaps in their assumed understanding. Ask a colleague what they understood from your words and it reads as disrespect. Admit you did not understand them and they might think you are stupid. So the room nods and moves on. The gap in understanding of each other doesn't go away though. Everything built on top of it inherits the error.

Cognitive understanding is knowing what the other person means, and both of you knowing that the other knows it. It is not agreement. You can fully understand someone and still disagree. Knowing where you both actually stand is deeply satisfying, especially when the stakes are high.

Bridging these gaps helps you avoid preventable mistakes, learn faster, build trust faster, become more trustworthy, reduce conflicts that get emotionally stuck, and strengthen your professional and personal relationships.

We also try to carry this practice outside of our community, and to find out how to spread it faster and cheaper. Cognitive scientists, communication researchers, psychotherapists and B2B salespeople already use these ideas. Most people don't have five years to learn them. We are looking for the shorter journey.

The founder believes belonging does not have to come from a nation or a place. A lasting home is not a place. It is the people who share the value of integrity, and who practise intellectual honesty to help each other catch their own mistakes.

Joining needs no skill, only the will to improve your own communication and other people's. Everything is public: what we are testing, what we tried, what failed. To go deeper, point Claude or ChatGPT at our open source repository: https://github.com/slavochek2/claritypledge. Your critical feedback is very welcome.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The paid membership level was also going to be called "Clarity Practice Community" | DEFER | Founder names the paid level separately (P1183); nothing paid is live |
| Hiding `online` breaks a page someone bookmarked | ACCEPT | Only its one member could have it; the group can be reopened |
| A past online event still points at the hidden group | MITIGATE | `/dev` counts events with `org = online`; if any exist, report before shipping |

**Non-Goals**
- Do NOT delete the online group or any membership.
- Do NOT change the Clarity Group Terms.
- Do NOT change the desktop menu, the footer, or the `/events` → `/groups/cm` redirect.
- Do NOT add the Chiang Mai calendar block to the events page (separate decision, menu spec).

## Acceptance Criteria

- [ ] `/groups/cm` shows "Clarity Practice Community · Chiang Mai" with the approved subtitle and About text, word for word (test DB screenshot; prod after ship).
- [ ] `/groups/online` no longer loads for a signed-out visitor or a non-member, and the directory lists one group.
- [ ] The online group's membership row still exists (count before and after).
- [ ] An event created with an online location gets no group by default; one in Chiang Mai still gets `cm`.
- [ ] The close page's community step says "Join the Clarity Practice Community".
- [ ] Phone bottom nav shows Events instead of Groups and opens the events list (375px screenshot).
- [ ] The migration raises when run against drifted copy (control: run it twice; the second run must raise or no-op, never double-apply).

## Related

P1183 (membership levels; paid-level name) · P1415 (home rail shows `cm` by slug) · decisions.md 2026-09-07 and 2026-09-08 (the activism name, now superseded by the founder's 2026-10-22 call)
