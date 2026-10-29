# P1536 research: what counts as one canvas (21 material shapes)

Source for spec P1536 D9 and the S1.9 focus eval. Section 1's matrix gives the 21 cases; the blind labels at the end are the eval's oracle (written by a second model that saw only the cases, not this file's verdicts).


Author: Opus (independent pass). 2026-10-29. Grounded in the P1536 worktree (w1 @ `df205a8be` + uncommitted):
`supabase/functions/_shared/canvas-prompt.ts` (DRAFT_RULES, `conflicts` field, "owner chose speed over
discussion"), `canvas-reply.ts` ("What I decided on my own"), `canvas-draft.ts` (MAX_POINTS_PER_BOX = 3),
`src/app/pages/chat/canvas-thread-copy.ts` (CANVAS_OWN_AI_PROMPT). Founder constraint honoured: one button,
no question round (2026-10-28).

## 0. Verdict up front

- **The founder's hypothesis is wrong in both directions, and the reason is the same both times: "same
  problem" is not a stable test.** An LLM can phrase any two problems at a level where they match ("they
  are stressed", "they lose money"), or at a level where they differ. Marketplaces break it one way:
  different problems, one canvas. B2C and B2B versions of the same pain break it the other way: same
  problem, two canvases. It gets **8 of 21** rows wrong (section 2).
- **The unit of a canvas is one sale loop, not one problem.** Recommended rule (R3, "one sale loop"):
  two groups share a canvas only if **(a) they are roles in the same sale** (one pays, another uses,
  approves or benefits, or they are the sides of one marketplace whose value is each other), or **(b) they
  are one segment described twice** (same problem, same offer, same price, already sold that way).
  Everything else is a separate canvas. Before applying it, a fixed preamble removes things that are not
  groups at all: former customers, partners, places, and people quoted in transcripts. It gets **1 of 21**
  wrong as first stated, **0 of 21** after one clause ("groups you are still choosing between are
  separate"). That score is **not independent evidence**: see the caveat in 2.3.
- **Behaviour: (b+).** Draft the chosen canvas at once. The first line of the reply says who the canvas
  is about and why. Each other canvas gets one line and one button, "Draft a canvas for <group>", which
  starts a sibling draft. No question round, no extra model call, and nothing dropped silently. The
  decision goes into new `focus` / `other_canvases` fields in the same single call, ordered **before**
  `actions` in the schema, so the model commits to a focus before it writes points.

---

## 1. Case matrix (21 material shapes)

"Verdict" is my call. The three columns on the right are inputs to the rules in section 2.

| # | Material shape (realistic example) | Verdict | Why | Roles in one sale? | Same problem + offer + price? | Still choosing? |
|---|---|---|---|---|---|---|
| 1 | **Same problem, different segments, same offer.** Freelance designers and freelance copywriters both chase late invoices; both buy the same EUR 19/month reminder tool, found in the same freelancer groups | **ONE** | One segment described twice. Name it by what they share ("solo freelancers who invoice clients monthly") | no | **yes** | no |
| 2 | **Same problem, different buying conditions.** "Late tax filings" for cafe owners with 1-3 shops (owner buys, EUR 150/mo) and for 20-site restaurant groups (finance team, procurement, custom quote) | **SEVERAL** | Same words for the problem, but a different buyer, price, sales cycle and channel. Mixing them means a GTM line that reaches one group and a price only the other pays | no | no (price, offer) | no |
| 3 | **Different problems, different segments.** Bookkeeping for cafes plus Instagram coaching for yoga teachers | **SEVERAL** | Two businesses | no | no | no |
| 4 | **Two-sided marketplace.** Dog owners want a trusted sitter at short notice; sitters want steady bookings. Owner takes 15% per booking | **ONE** | Neither side's value exists without the other, and one transaction feeds both. Two segment cards, one problem card per side | **yes** | no | no |
| 5 | **Payer is not the user.** Parents of 15-year-olds pay EUR 240/mo; the teens attend maths sessions. The parent's problem (exam fear, nagging) differs from the teen's (doesn't follow the class) | **ONE** | The parent pays for the teen's outcome. Splitting them gives a canvas whose payer gets nothing, and one whose user pays nothing | **yes** | no | no |
| 6 | **B2B buyer, user and champion.** The HR head signs the budget, team leads use the feedback tool, and one enthusiastic team lead pushes it internally | **ONE** | One deal with three roles. At most 3 segment cards, and the payer always kept | **yes** | no | no |
| 7 | **One segment, several offers.** A coach sells new managers a EUR 49 workshop, a EUR 900 three-month programme and a EUR 4k retreat | **ONE** | An offer ladder: three cards in Offers & Pricing, one group | n/a (one group) | n/a | no |
| 8 | **Same offer, several channels.** Handmade candles sold to the same gift-buyers on Etsy, at weekend markets and on Instagram | **ONE** | Channels are Go-to-market cards, not groups | n/a | n/a | no |
| 9 | **Same product to consumers and to shops.** The same candles sold direct, and wholesale to 6 gift shops at 50% off | **SEVERAL** | A shop's problem is sell-through and margin; it buys at a different price through trade fairs. Direct sales don't need the shops, so they are not roles in one sale | no (direct sales don't need shops) | no (price) | no |
| 10 | **Pivot history.** A 2024 deck targets HR teams; 2026 notes say "since spring I only work with solo therapists; HR never renewed" | **ONE** (therapists) | The old group is history, not a candidate. It can become a "Hypotheses I've falsified" point **only** because the owner said what happened ("HR never renewed") | (old group excluded) | | |
| 11 | **Side business.** A UX consultancy for fintechs, plus weekend pottery classes | **SEVERAL** | Separate businesses. Values and the challenge may overlap; customer boxes never do | no | no | no |
| 12 | **Agency serving several industries.** Web agency builds the same EUR 3k booking-focused site for dentists, physios and lawyers. Dentists come via a dental-supplier referral, lawyers via a bar association talk | **ONE** | Same problem, offer and price: name the segment by its shared trait ("owner-run practices that live on booked appointments"). The industry-specific routes are GTM cards | no | **yes** | no |
| 13 | **Product plus services, same buyer.** A scheduling SaaS (EUR 49/mo) plus paid onboarding (EUR 600 once), both sold to the same clinics | **ONE** | Two offer cards for one group | n/a | n/a | no |
| 14 | **Services fund the product, different buyers.** Enterprise consulting contracts pay the bills; the SaaS is for SMBs | **SEVERAL** | Different buyer, price and decision process. The consulting is its own bet (often the one that actually pays) | no | no | no |
| 15 | **Geography.** A language school in Berlin and Munich, planning Vienna, with the same courses for expats in all three | **ONE** | Cities are GTM and milestone material, not segments | n/a (places aren't groups) | | no |
| 16 | **Franchisor.** Sells franchises to local operators (EUR 25k fee plus 6% royalty); the operators sell kids' coding classes to parents | **ONE** | The franchisee pays; the parents' purchases are what the franchisee is buying. This is a B2B2C chain where each level's value depends on the next, so they are roles in one sale | **yes** | no | no |
| 17 | **Early exploration, 3 candidates.** "AI note-taker, EUR 20/mo, maybe for therapists, lawyers or sales reps; no customers yet" | **SEVERAL** (draft 1) | Three bets the owner is choosing between. Merging them gives "professionals who take notes", the classic too-broad segment. Running Lean: one canvas per segment, start with the 2-3 you understand best | no | yes (same offer and price stated) | **yes** |
| 18 | **Transcript where customers speak.** Owner's notes say "cafe owners hate month-end"; a pasted call transcript has 3 cafe owners saying the real pain is supplier invoices | **ONE** | Customers are evidence about the owner's group, never a new group. The code already forbids points from `other_person` items, so the clash becomes a conflict line and a question | n/a | | no |
| 19 | **Too thin.** "I help people with money. 1:1 sessions." | **ONE** | Nothing to split. Draft what is supported and leave the rest empty with questions. Never offer a sibling canvas from a bare noun | n/a | | no |
| 20 | **Non-customer actors.** A coffee supplier refers cafes; an angel investor; a city grant for green businesses | **ONE** | Partners and referrers are GTM; funders are neither. None of them is a segment | n/a | | no |
| 21 | **B2C and B2B versions of one pain.** Meditation app at EUR 8/mo for individuals, plus yearly licences sold to HR for employees | **SEVERAL** | Same pain ("stress"), but a different buyer, price, channel and sales cycle. Inside the B2B canvas, HR (pays) and employees (use) are roles on **one** canvas | no (across); yes (within B2B) | no | no |

Disputable verdicts, named so nobody reads the matrix as settled: **12** (if the dental and legal
channels really are fully separate sales motions, two canvases is defensible), **16** (some would
give the franchisor's operator recruitment its own canvas), **17** (if the owner already has one paying
therapist, see hard case 3).

---

## 2. Candidate rules, tested against all 21 rows

### 2.0 Shared preamble P0 (scope, not discrimination)

Every rule below is better with this preamble, so I score each rule both as stated and with P0 added.
**Not groups:** (i) customers the owner says they stopped serving, which become history; (ii) partners,
suppliers, referrers, investors and funders; (iii) places and channels; (iv) people in other people's
material, which is evidence only; (v) a group that is only named, with no problem, price or route in the
owner's words.

### 2.1 The rules

- **R1, founder:** "Different segments with different problems get different canvases. Same problem
  across segments: one canvas, several segment cards."
- **R2, Strategyzer test (as in research.md section 5):** "Groups that would need a different problem,
  offer, price or channel are separate canvases. A payer and a user of the same offer are one model."
- **R3, one sale loop (recommended):** "Same canvas only if (a) roles in one sale (pays, uses, approves,
  benefits; or marketplace sides whose value is each other), or (b) same problem, same offer, same price,
  already sold that way. Everything else is separate." **R3+** adds: "Groups the owner is still choosing
  between are separate even with the same offer."
- **R4, one milestone number:** "One canvas if a single next-milestone number counting a customer action
  (not total revenue) measures progress for all the groups."
- **R5, never split (baseline):** "One canvas = whatever the owner calls their business. Split only when
  the owner says they are separate businesses."

### 2.2 Scoring (x = wrong against the section 1 verdict)

| # | Verdict | R1 | R2 | R3 | R4 | R5 |
|---|---|---|---|---|---|---|
| 1 | ONE | ok | ok | ok | ok | ok |
| 2 | SEV | **x** (same problem, so one) | ok | ok* | **x** ("10 paying businesses" counts both) | **x** |
| 3 | SEV | ok | ok | ok | ok | ok* (owner usually says "my other thing") |
| 4 | ONE | **x** | **x** (both sides pay; not "payer/user of same offer") | ok | ok ("200 completed bookings") | ok |
| 5 | ONE | **x** | ok | ok | ok | ok |
| 6 | ONE | **x** | ok* (champion is a stretch of "payer/user") | ok | ok | ok |
| 7 | ONE | ok | ok* (may split "workshop buyers" from "programme buyers") | ok | ok | ok |
| 8 | ONE | ok | ok* (channel difference could split) | ok | ok | ok |
| 9 | SEV | ok | ok | ok* (could be argued as "roles") | **x** ("300 candles sold") | **x** |
| 10 | ONE | **x** without P0 | ok (newest focus wins) | ok (P0) | ok | ok |
| 11 | SEV | ok | ok | ok | ok | ok* |
| 12 | ONE | ok | **x** (channels differ by industry) | ok | ok | ok |
| 13 | ONE | ok | ok* | ok | ok | ok |
| 14 | SEV | ok | ok | ok | ok | **x** |
| 15 | ONE | ok | **x** without P0 (channel per city) | ok (P0) | ok | ok |
| 16 | ONE | **x** | **x** (different problem, price, channel) | ok | ok | ok |
| 17 | SEV | **x** ("notes take time" for all) | **x** (same offer, price, unstated channels) | **x** (R3) / ok (R3+) | **x** ("10 paying pilots") | **x** |
| 18 | ONE | ok | ok | ok | ok | ok |
| 19 | ONE | ok | ok | ok | ok | ok |
| 20 | ONE | ok* without P0 | ok* | ok (P0) | ok | ok |
| 21 | SEV | **x** (same pain) | ok | ok | **x** ("1,000 paid seats") | **x** |
| **Wrong (as stated)** | | **8** (2,4,5,6,10,16,17,21) | **5** (4,12,15,16,17) | **1** (17) | **4** (2,9,17,21) | **5** (2,9,14,17,21) |
| **Wrong with P0** | | 7 | 4 | 1 (R3+: **0**) | 4 | 5 |

`ok*` = right as I read it, but the rule's wording leaves an LLM room to go the other way. That is a
consistency risk, not a counted error.

What the failures show:
- **R1** fails on every multi-role model (4, 5, 6, 16), because roles *always* have different problems.
  It also fails whenever one pain is sold two ways (2, 21). The founder's own counter-example
  (marketplaces) is one instance of a whole class: payer/user, B2B roles and franchises fail the same way.
- **R2** fixes the B2C/B2B split but turns channel and price differences into automatic splits. That is the
  circularity Codex flagged: a channel can't define a segment, because one segment uses many channels
  (12, 15). Its payer/user exception is too narrow for marketplaces and franchises (4, 16).
- **R4** is a good *check* (if no shared number exists, the canvas is incoherent), but a bad *rule*. An
  aggregate number can always be found, so it can never force a split (2, 9, 21). A human also can't
  predict which number the model will invent.
- **R5** looks safe, but it produces exactly the incoherent canvases the brief is about (segment from A,
  price from B).
- **R3** works because it asks a question the model can answer from facts in the material: *does one
  group's purchase require the other group?* and *is the offer and price literally the same?* It never
  asks "is the problem the same?", which is the abstraction-level trap.

### 2.3 Caveat on these scores (read before trusting them)

The verdict column is mine, and I wrote R3 after building the matrix. **R3's 1/21 is therefore partly
fitted to my own labels and is not independent evidence.** Before shipping, do this independent check:

1. The founder labels the 21 verdicts **blind**, from the shape column only.
2. Turn each row into 1-2 synthetic material packs, and run the new prompt 3 times per pack.
3. Score agreement with the founder's labels.
4. Run the **current** DRAFT_RULES (no rule) through the same packs as a known-bad control. If the control
   scores about the same as the new prompt, the test can't tell them apart.

Also compare `thinkingLevel: 'low'` with `'medium'`. The split decision is the only real reasoning step
in the call, and I have not verified that low is enough.

---

## 3. Behaviour when the material holds more than one canvas

Scale: 5 = best on every column, so for AI cost and build complexity, 5 = cheapest or simplest.
"Time" includes the revisions a wrong pick causes.

| Option | Time to first useful canvas | First-canvas quality | Owner effort | Surprise / trust | AI cost | Build | Total |
|---|---|---|---|---|---|---|---|
| (a) Silently pick one | 5 | 3 | 3 | **1** | 5 | 5 | 22 |
| (b) Pick, one line after drafting, one-tap sibling | 5 | 4 | 4 | 4 | 5 | 4 | 26 |
| **(b+) = (b) with the focus line FIRST in the reply, decided in-call before `actions`** | **5** | **4** | **4** | **5** | **5** | **4** | **27** |
| (c) Announce the pick before drafting, chance to override | 3 | 4 | 3 | 5 | 4 | 2 | 21 |
| (d) Ask first | 2 | 4 | 2 | 5 | 4 | 3 | 20 |
| (e) Draft all as separate drafts | 4 | 3 | 2 | 4 | 2 | 2 | 17 |
| (f) Confidence-gated: ask only when rules 1-2 don't decide | 4 | 4 | 3 | 5 | 4 | 2 | 22 |

When the owner learns, and what they tap or say:

- **(a)** Learns only when they notice a missing customer, often mid-event in front of peers. Next step:
  type a correction, then wait for a full redraft. The worst trust failure, because something was
  dropped with no trace. In the current code, `conflicts` is meant for *disagreements*, so a second group
  may never appear in "What I decided on my own".
- **(b)** Learns from the reply, about 30-60 s after tapping Create canvas, as one line inside "What I
  decided on my own", below the counts. Taps "Draft a canvas for restaurant groups". The risk is that the
  line is buried: owners read the canvas, not the list.
- **(b+)** Learns from the **first line of the reply**, at the same moment the draft appears:
  "This canvas is about cafe owners with 1-3 shops, because they already pay you." Then:
  "Your material also describes restaurant groups with 20+ sites. That is a separate bet (different price
  and buyer), so it is not on this canvas." A button follows: **[Draft a canvas for restaurant groups]**.
  To change *this* canvas's focus, they type "no, it's about restaurant groups". That runs the existing
  Update draft flow, and the owner's newest focus statement wins under rule 1. No new UI is needed for the
  swap.
- **(c)** Learns before any draft: "I'll draft this for cafe owners (they pay you). Tap to switch:
  [Restaurant groups]". It then auto-proceeds after N seconds, or on a tap. This adds a round trip and a
  second cheap call, and it is a question round in disguise. It contradicts the 2026-10-28 founder
  decision.
- **(d)** Learns immediately: "Your material describes 2 groups. Which is this canvas about?" At an event,
  a common answer is "both". The owner then gets either a mixed canvas or a second question. Slowest path
  to a canvas.
- **(e)** Learns when 2-3 drafts appear in Artifacts. They must open each one and discard the weak ones.
  Secondary canvases are usually built from thin side material, so they are mostly empty boxes plus
  noise. This costs N times the model calls, and in a 2.5-hour event it triples the review load.
- **(f)** Same as (b+) when the owner stated a focus or one group pays; otherwise (d). The model's own
  confidence is not reliable enough to gate a stop on, and it adds a state.

**Decision: (b+).** It is the only option that keeps the founder's single button and costs no extra model
call, while making the choice impossible to miss. A wrong pick costs one typed sentence or one tap,
never a silent loss.

Build items, inferred from the code and not yet built:
1. Add `focus` (string) and `other_canvases` (array of `{group, why}`) to DRAFT_SCHEMA, with
   `propertyOrdering: ['focus', 'other_canvases', 'actions', 'conflicts']`. This reuses the trick that
   fixed `quote`: the model commits to the decision before it writes points.
2. `canvas-reply.ts`: lead the reply with the focus line, before "Your canvas draft is ready". List other
   canvases separately from "What I decided on my own".
3. One button per other canvas. It starts a **sibling** canvas draft from the same thread material plus
   a UI-authored owner message, "This canvas is about <group>.", which rule 1 then honours.
   I found no sibling-from-thread action in `canvas-thread.tsx` (grep for "sibling" and "focus" returned
   nothing), so this is new.
4. Pass `other_canvases[].group` through the same `namesOther` filter that `conflicts` uses (roles only,
   never names).

---

## 4. Recommendation

**Rule: R3+ with preamble P0.** **Behaviour: (b+).** **Picking order** for which canvas to draft first.
This revises research.md's cascade to address Codex's objections: volume no longer counts, payment beats a
quote, and the time that counts is the time of the statement, not the file date.

1. The owner's own most recent statement of focus. If two statements conflict and their order is unclear,
   skip this step and say so.
2. A group that has paid or signed, then a group that was quoted a price.
3. The group for which the owner's words fill the most of Problem, Offers & Pricing and Go-to-market
   (count boxes, not words).
4. The narrower group.

**On a new version**, the current canvas's segment is the default focus. A new group appearing in new
material is an *other canvas*, not a takeover. This keeps "version" (the same canvas over time) separate
from "sibling" (another canvas), as the brief defines them.

**Business-wide boxes:** Guiding values, My current biggest challenge and Hypotheses I've falsified are
about the owner's business, and may hold points that apply across sibling canvases. Abandoned groups enter
only through Hypotheses I've falsified, and only with the owner's stated test and result.

### 4(i) Drafting prompt text (append to DRAFT_RULES)

Plain style, no dashes, matching the existing rules. `canvas:segments` etc. are the real tags.

```
One canvas is one bet. Decide which customer groups this canvas is about BEFORE writing any point, and fill "focus" and "other_canvases" first.

Step 1. Find the groups. These are NOT groups and never get a canvas: a group the owner says they stopped serving or moved away from (history: it may become a canvas:world-needs point only if the owner says what they tried and what happened); partners, suppliers, referrers, investors and funders (they may appear only in canvas:channels); cities, countries and sales channels (canvas:channels); the people in "other_person" items (they are evidence about the owner's groups, never a group); and a group the owner only names, with nothing in their words about its problem, its price or how they reach it.

Step 2. Two groups go on the SAME canvas only if one of these is true:
(a) They are roles in one sale: one pays and another uses, approves or benefits (a parent pays and a student attends; a manager buys and the team uses), or they are the sides of one marketplace or chain where each side's value is the other side (dog owners and dog sitters booking through one site; franchise operators and the parents who buy their classes).
(b) They are one segment described twice: the owner already sells them the same offer at the same price for the same problem (dentists and physiotherapists who both buy the same website to fill empty appointments). Write them as one segment, named by what they share.
Everything else is a separate canvas. That includes the same problem sold as a different offer or at a different price (individuals on a monthly app and companies on a yearly licence), the same product sold direct and wholesale, and groups the owner is still choosing between ("maybe therapists, maybe lawyers") even with the same offer. Do not decide by asking whether the problems sound the same.

Step 3. If there is more than one canvas, draft ONE. Choose by the first rule that decides: (1) the owner's own most recent statement of focus ("I now only work with", "my main customers are"); if two such statements conflict and you cannot tell which is newer, skip this rule; (2) the group that has already paid or signed, then the group that was quoted a price; (3) the group for which the owner's words fill the most of canvas:problem, canvas:revenue and canvas:channels; (4) the narrower group. When current points exist, this canvas is already about the group in its canvas:segments points: keep that focus unless the owner's newest words change it, and treat any other group as another canvas.

Step 4. Write every point for this canvas only. Never write a point about a group on another canvas. When the canvas has roles, write one canvas:segments point per role (at most 3, always including who pays), each starting with its role ("Pays: ...", "Uses: ...", "Approves: ..."), and start each canvas:problem point with the role it belongs to. canvas:love, canvas:good-at and canvas:world-needs are about the owner's business and may hold points true for every group.

"focus": one plain sentence saying who this canvas is about and which rule chose it ("you said this is your focus", "they already pay you", "most of what you wrote is about them", "it is the narrower group").
"other_canvases": for each other canvas, the group in a few words (a role, never a name) and one short reason it is a separate bet. Leave it empty when there is one canvas. Never list a former group, a partner, a place or a group that is only named.
```

Instruction-line change in `buildDraftRequest`: keep `speedNote`, and add: "Decide the focus first;
never mix groups from other canvases."

### 4(ii) Copy prompt text (insert into CANVAS_OWN_AI_PROMPT "Rules:", after the "Use exactly the nine headings" line)

The owner's own AI often knows several of their projects, which makes the mixing problem worse there
than in our call. The first line it outputs is pasted back as owner material, so our step-3 rule 1 picks
it up. The owner saw it before pasting, which is what makes treating it as owner intent acceptable.

```
- One canvas is one business bet. If you know about more than one of my businesses or projects, use only the one I name; if I named none, use the one I talked about most recently.
- If I sell to more than one group, put them on one canvas only if one pays and another uses or approves, if they are two sides of one marketplace, or if I sell them the same thing at the same price for the same problem. Otherwise choose one: the group I say I focus on, else the one that already pays me, else the one you know most about. Write every section for that group only.
- Start the document with one line: "This canvas is about [group]." If you left groups out, add: "Separate canvases: [groups]." Describe groups by role, never by name.
- Groups I stopped serving are not a canvas. If I told you what I tried with them and what happened, put it under Hypotheses I've falsified; otherwise leave them out.
```

[FOUNDER DECISION: exact reply wording and button label. The canvas-reply.ts header already marks reply
wording as the founder's. The lines in section 3 (b+) are proposals.]

### 4(iii) The 3 hardest cases where R3+ will still be wrong

1. **Hidden buying-condition split (row 2 with one stated price).** The owner quotes the same EUR 150/mo
   to cafes and restaurant groups because they haven't yet learned that groups need procurement, a custom
   quote and a finance-team buyer. Clause (b) fires (same problem, offer and price) and merges them. The
   canvas *looks* coherent, but its GTM line can't reach both. One model call cannot see a difference the
   material doesn't contain. This is the case the mastermind peers should catch ("who signs the cheque in
   a 20-site group?"), and the reason (b) requires "already sells that way" and not just "would sell".
2. **"Sides" rationalisation (rows 9, 14).** Clause (a) can be abused: "shops are a side because they
   reach consumers", "enterprise consulting is a side because it funds the product". Any two groups can
   be narrated as a chain. The guard is the wording "each side's value is the other side": direct
   consumers don't need shops, and SMBs don't need the enterprise client. An LLM at `thinkingLevel: low`
   will sometimes still merge them. Measure this in the fixture run, and if it shows up, add a counter-example
   for wholesale.
3. **Pivot in progress (between rows 10, 14 and 17).** The old segment still pays the bills ("HR clients
   still renew, but I'm moving to therapists; 2 therapists so far"). It is not abandoned, so P0 doesn't
   remove it. The owner's focus statement points to therapists, so rule 1 picks therapists, while rule 2
   (who pays) would pick HR. R3+ gives two canvases, which is right, but the *order* is contestable. At a
   sales mastermind, the bet the owner needs feedback on is arguably the new one, yet the evidence is in
   the old one. The rule follows owner intent, as Codex's critique also recommended. The `focus` line must
   then say "you said you are moving to therapists; HR still pays you and has its own canvas", so the
   owner sees the trade-off in one tap.

---

## Sources

- In-repo, read this session: `supabase/functions/_shared/canvas-prompt.ts`, `canvas-reply.ts`,
  `canvas-draft.ts`, `canvas-types.ts`; `src/app/pages/chat/canvas-thread-copy.ts` (w1 worktree).
- Background: `box-defs/research.md` sections 3 and 5 (Running Lean / LEANSTACK and Strategyzer wording
  relayed there; research.md flags Strategyzer's own page as HTTP 410, so that wording is unverified), and
  `box-defs/codex-critique.md` "The coherence rule needs redesign" (circular segment definition,
  role-aware coherence, distinguishing historical and adjacent groups, owner intent over volume).
- Web, this session. Neither search found an official LEANSTACK statement on multi-sided models, so the
  "two actors on one canvas" point relies on research.md [2] and is unverified here:
  - [UVic: How to create your Lean Canvas](https://www.uvic.ca/innovation/assets/docs/how-to-create-your-lean-canvas.pdf), relaying Running Lean: "Sketch a Lean Canvas for each customer segment... the elements of your business model can and will vary greatly by customer segment."
  - [Workshop: Lean Canvas (SlideShare)](https://www.slideshare.net/slideshow/workshop-lean-startup/60741039): "One Page Solution, even for multisided businesses"; MSP definition.
  - [skills.sh lean-canvas guide](https://skills.sh/kazdenc/builder-skills/lean-canvas) (community, not official): one canvas = one segment.
  - [leanspark.ai Lean Canvas](https://leanspark.ai/leancanvas): Customer Segments "Who has the problem and who will pay"; Early Adopters "The specific subset of customers you target first".
  - [Fiveable: multi-sided platforms](https://fiveable.me/key-terms/business-model-canvas/multi-sided-platforms), [thinkinsights BMC](https://thinkinsights.net/index.php/strategy/business-model-canvas): BMC multi-sided = interdependent segments that are all needed for the model to work.

## Blind labels (Codex, 2026-10-29, cases only, no verdicts shown)

1. **ONE** — Both segments share the problem, offer, price and acquisition channel.
2. **SEVERAL** — Owner purchases and enterprise procurement require distinct sales, pricing and validation models.
3. **SEVERAL** — These serve different customers with unrelated problems and solutions.
4. **ONE** — Both sides belong to one interdependent marketplace; represent each side’s needs explicitly.
5. **ONE** — Parents and teens are payer and user roles within the same purchase and delivery model.
6. **ONE** — Buyer, user and champion are roles within one organisational buying process.
7. **ONE** — Assuming the offers address the same managerial need, they form one offer portfolio.
8. **ONE** — Multiple channels for the same customers and offer belong in the go-to-market box.
9. **SEVERAL** — Direct retail and wholesale involve different customers, margins, buying criteria and sales processes.
10. **ONE** — Build the current therapist canvas; record HR non-renewal under falsified hypotheses and archive the old canvas.
11. **SEVERAL** — The consultancy and pottery classes are independently viable businesses with different customers and delivery.
12. **ONE** — Assuming the booking problem and delivery are comparable, industry-specific referral sources are channel variations.
13. **ONE** — Onboarding supports the same buyer’s adoption of the SaaS and belongs in its offers and pricing.
14. **SEVERAL** — Funding links the businesses financially, but their buyers and commercial models differ.
15. **ONE** — Assuming comparable local buying conditions, cities are operating locations and expansion milestones.
16. **ONE** — For the franchisor’s business, operators are customers and parent demand underpins franchise value; operator businesses can have their own canvases.
17. **OTHER: Three provisional candidate canvases** — Treat each segment as an alternative hypothesis to test, without implying three established businesses.
18. **ONE** — Customer testimony updates the problem evidence within the cafe business; speakers do not create separate canvases.
19. **OTHER: One incomplete canvas** — Preserve the known service and mark customer, problem and commercial assumptions as unknown.
20. **OTHER: Supporting actors on the relevant canvas** — Referrers, investors and grants are partners or funding sources, unless serving them is itself a business.
21. **SEVERAL** — Individual subscriptions and employer licences require distinct buyers, value propositions, pricing and acquisition processes.

