---
status: backlog
type: story
disclosure: public
rank: 1000099
workstream: clarity-chat
created_date: '2026-10-12'
tags:
  - clarity-chat
  - agent-on
  - theory-of-mind
  - calibration
delivery_stage: create-spec
pipeline_ran:
  - create-spec
---

# P1458: Agents on other people, operated by me — my model of them, and how calibrated it is

> **PLACEHOLDER spec.** Captures the idea and its boundary. Do NOT design the build yet.
> **Entity question decided 2026-10-12** (see the section below): the holder is a visible
> entity named **"Alice in Bob's eyes"**, not an agent. Its in-prototype form is built in P1437 v5.

> Founder framing, verbatim (2026-10-12): *"And this is interesting because I can basically have an agent on anybody operated by me, you know?"*

## Intention

Positions on points are held by entities. Bob's prediction of Alice's position needs a holder
that is not Bob. Production already has "AGENT on Arthur Brooks · Operated by ClarityPledge",
which holds positions and has "Their story". The idea: Bob can operate an **agent on Alice**:
his externalised theory of mind about her. Each time Alice rates its guesses, Bob learns how
well calibrated his model of her is.

## How the idea was born

2026-10-12. The founder: *"there is the founder, there is my projection of the founder... other people's
projection of the founder is their agent on the founder."* And: *"I can basically have an agent on anybody
operated by me... this is my view of that person... and then we can see how calibrated that
thing is."* And the constraint that forced it: *"we have entities and entities hold positions
on points. Either we do have an entity or we don't."*

## How it relates

- **P1437**: needs a holder for the predicted position now; may adopt option B in-prototype.
- **Production "agent on" profiles** (e.g. agent on a public figure): same entity type, new
  operator (a user instead of ClarityPledge).
- **Mirror agent** (definitions.md): the user's own agent drafts; the agent-on is the result.
- **Placeholder P1459 (clarity ledger)**: calibration history lives there.
- **Placeholder P1460 (connection levels)**: who may see an agent on them.

### Prerequisites found in review (Codex, 2026-10-12, checked against migrations)

- **Identity is one operator per subject today.** `agent_accounts.subject_key` is globally unique and
  `create_or_reuse_agent_account` raises "already registered to a different operator". Bob's model
  of Alice and Carol's model of Alice cannot both exist. Promotion needs identity scoped to
  operator + subject, with authenticated ownership.
- **The registry is public by design.** `profile_id` and `operator_name` of every agent account are
  readable by anyone (P1104 policy "agent_accounts are publicly readable"). That is right for public
  agents like the Arthur Brooks one and wrong for a private model of a contact. Promotion needs
  private agent metadata, not only private threads.
- **One story per author per point** (`story_points_author_point_unique`): the reason the guess
  cannot simply be a story by Bob, and why it needs its own holder.

## Decided 2026-10-12 (founder, after Codex falsify + prior-art + legal research) — do not re-ask

- **It is not an agent.** It cannot act. It is Bob's mental model of Alice, written down; every
  word is Bob's claim. Three kinds are kept apart by one test, *did a person approve it as their
  own belief?*: agents act (a mirror agent); machine readings of someone's public words are no
  one's belief ("AGENT on <public figure>", including transcripts an operator processed but never
  read); approved beliefs are the operator's ("Alice in Bob's eyes").
- **Name everywhere: "Alice in Bob's eyes".** Comparison row: "Alice: Agree · Alice in Bob's eyes:
  Disagree". Story author: "Alice in Bob's eyes", written in her voice. Page title (Bob only): the
  same. On-screen list of all of them: "How I see people"; docs term: "mental model".
  Rejected: "Bob's Alice" (reads as ownership), "AGENT on Alice · Bob's model" (lets Bob hide
  behind a machine), a label line on a story by Bob (no holder for the position; one story per
  author per point).
- **No "assumed" tag.** The name already says it. Draft = the mirror agent suggested it; approved =
  it belongs to "Alice in Bob's eyes"; Alice's rating appears once she answers. Whether her
  ratings change how the page looks is P1459.
- **Picture:** Alice's existing in-app avatar with a distinct frame and Bob's mark; initials for
  non-members; never a generated likeness of a private person. Variant choice in P1437 v5.
- **Visibility:** drafts are Bob's alone. Anything shared with anyone, Alice can always see, rate
  and correct. The page is Bob's only; Alice sees the items sent to her, never the page.
- **Sharing with trusted partners: a vision, not built.** Valuable because every item carries
  Alice's rating or none, so it is checked perception, not rumour. Rule if built: never hidden
  from Alice. Uncalibrated is not false: a low rating is Alice's claim, shown as hers; she may be
  wrong about herself.
- **Calibration:** people are calibrated today, mental models are not. A model can be calibrated
  against its subject through her ratings. Mirror agents differ (they predict under their
  owner's instructions); note only.
- **Later:** a person's page could one day show her own positions, her mirror agent's view, and
  others' views of her shared with her ("Alice as others see her"). Not designed.
- **Later:** whether production "AGENT on <public figure>" should be renamed under the same test.

## Legal and platform constraints (research memo 2026-10-12, corrected same day; not legal advice)

**Framing (founder, 2026-10-12):** these are **predictions to be corrected by their subject**, not
ratings or judgments of a person. Rating apps (Peeple, Lulu, Sarahah) judged people and failed
through backlash; this product says "I think you'd disagree, here is why", and the subject has the
final word. Risk lives in content (a motive-judgment dressed as a prediction), not in the format.

**Product rule that answers both the design and the legal question:** *every prediction about a
person is either a private note, or addressed to that person.* Partners may be in the audience;
she always is too.

| Case | Assessment | Why |
|---|---|---|
| Private note predicting her view | fine | purely personal; like any notes app |
| Sent to her | fine | a message to her about herself |
| Shared with a few trusted partners (she is in the audience) | very likely fine | like a group thread or email; mail and chat services store these |
| Public commentary on a public figure's views ("AGENT on <public figure>") | fine | freedom of expression; public figures get less protection |
| Public, searchable page guessing a private person's politics, religion, health or sex life | the real risk zone | private persons get more protection; those categories most of all, even when the guess is wrong (GDPR Art. 9; inferred data can count) |

- Confidence: principles are well established; their application to this product is untested.
  Have counsel confirm before launch.
- Platform obligations at scale (ordinary for any app storing messages and notes about people):
  answer what is stored about a person, let her correct or remove it.
- App Store rules do not apply: Clarity Pledge is a web app.

## Why it matters

Chain: **find the moment** and **show the gap**. A predicted position is what makes a crux
visible before Alice answers; a calibration score turns many checks into a trend.

## Deliberately out / trade-offs considered

- Public visibility of agents on private people: pair-only by default.
- Letting the modelled person edit "their" agent: they rate it, they do not own it.
- Creepiness risk: Alice may read it as "Bob built a bot of me". Naming and framing matter.
- Many entities: a user modelling 30 people creates 30 agents; listing and pruning needed.

## Open questions

- What happens when Alice has her own mirror agent, or sets her real position?
- What does the calibration score measure: position error, story rating, or both?

## Done-when for promoting out of placeholder

- P1437 v5 has run on at least one real pair, and the legal pre-production list has an owner.

## Update 2026-10-13 (from the v5 walk-through, see P1469)

- **Home: Bob's private card on a person ("My card").** It reuses the existing profile page with a "Private · only you" banner; sent items are tagged "Shared with <name>", unsent ones keep the Draft tag. Every contact can have one, user or not (a WhatsApp number, an email). For a contact who is a user, hovering offers **Profile** or **My card**, and each links to the other. Empty cards stay out of the list.
- **Value hypothesis (H-card, UNTESTED):** people keep notes on others all the time, but never ones the other person can grade. A card whose predictions the person can check gives a reason to come back: your picture of people gets better. Falsifier: users who complete a check do not return to the card.
- **Bob sets his own guess** of the other person's position; the agent never pre-fills it, or calibration measures the agent.
- **Each finished check** adds a Journey to Understanding entry to the card (P1459).

## Direction update 2026-10-16 (P1503, Clarity Chat v11)

In v11, Bob's guess of Alice's position is **private to Bob**: it sharpens the point (the agent offers to make the
point more polarising when his guess sits close to his own position) and, after she answers, Bob sees it next to her
position. Alice never sees it in v11; showing her how Bob sees her belongs with "their story" (P1497).
