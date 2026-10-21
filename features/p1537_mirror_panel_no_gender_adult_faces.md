---
status: qa
type: story
rank: 54
workstream: clarity-chat
created_date: '2026-10-21'
tags: [mirror, chat, portrait, copy]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: heuristic
---

# P1537: Mirror panel without the gender picker or privacy line; portraits are adults aged 25–40

## Problem

Every user's mirror panel (the About panel of their mirror chat) carries two things the founder judged noise, and the generated faces skew older.

> Founder, verbatim: "'only you see this chat' - who cares? its normal?" · "why we need 'random' and 'neutral' - who cares? what is this? gendering or what?" · "i also think people prefer young faces.. i see it generates older women"

- "Only you see this chat." states the normal expectation of a personal assistant chat; saying it invites doubt.
- The Face row (Random / Female / Male / Neutral) is a four-button gender picker almost nobody needs, and asking about gender reads as odd.
- The portrait prompt names no age, so the model often paints older faces.

## Appetite

Blast radius: one panel and one prompt (all users' mirrors). Reversibility: git revert + function redeploy. Decision density: one open founder call (the description line), the rest decided this session.

## Invariants

- Faces are always explicitly **adult**. The prompt must never say just "young": it names an adult age range, so no output can read as a minor.

## Solution

1. Panel subtitle: drop "Only you see this chat."; keep only the role ("Your mirror") when the mirror has a custom name, nothing otherwise.
2. Remove the Face gender row from the panel. New face always picks a gender at random; the function ignores any previously stored choice so no user stays locked to an option they can no longer see.
3. Portrait prompt asks for an adult aged roughly 25 to 40.
4. The mirror's role label is "Your mirror agent" (founder: a stranger's face labelled "your mirror" reads wrong).
5. [FOUNDER DECISION: one-line description of what a mirror is, shown under the name. Until decided, no line.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Users who picked a gender lose that choice | ACCEPT | Founder decided no picker; New face again if a face is unwanted |
| Model still paints some older faces | ACCEPT | Prompt steers, does not guarantee; re-check after a few runs |

**Non-Goals**
- Do NOT drop the `portrait_gender` column or touch any migration.
- Do NOT change the spend accounting or daily limits (P1534).
- Do NOT add an age control.

## Acceptance Criteria

- [x] The mirror panel shows no "Only you see this chat." and no Face/gender row — p1533/p1520 UI tests
- [x] New face on **test** produces a portrait end to end — e2e `AI: New face paints a portrait` passed on old and new TEST; two post-change portraits viewed, both adult ~30–40
- [x] The portrait prompt names an adult 25–40 age range and no gender comes from a stored choice — p1520-mirror-agent tests
- [x] No console errors in the panel flow — e2e collects console errors; none
- [x] The mirror's role label reads "Your mirror agent" everywhere (founder, 2026-10-21) — p1512 chat UI tests

## Related

- P1520 (mirror v2), P1533 (panel copy), P1534 (portrait cost)
