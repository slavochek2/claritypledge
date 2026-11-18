# High-Stakes Meetings and Decisions: Examples

> **Charter:** a maintained list of **examples** of high-stakes meetings and decisions, each with the
> conditions it usually meets. The conditions themselves (the entry condition, the modes, the
> interface disqualifier, the falsifiers) live only in
> [arbiter-failure-model.md](arbiter-failure-model.md); the glossary entry is
> [definitions.md](definitions.md) §High Stakes. Started 2026-11-18
> ([decisions.md](decisions.md) 2026-11-18 [product]).

**Why this is a separate file.** Consumer skills read the conditions file as a rubric. Examples
inside a rubric get matched instead of the conditions, so a "kickoff" gets flagged because it is
called a kickoff, and a real high-stakes item with an unfamiliar name gets missed (the detect
skill's rule: "a rubric that names what it once found stops measuring and starts confirming",
`.claude/commands/slava/understanding/detect.md`). **Never copy this list into a skill or a prompt.** It is
for people: copy, pages, films, sales conversations, and checking that the conditions still read
right against real cases.

**What a row means.** A row says what the conditions *usually* look like for that kind of meeting
or decision. It does not make any particular instance high-stakes. Each real case is checked
against the conditions, together with the person whose meeting or decision it is.

**Condition names** (defined in [arbiter-failure-model.md](arbiter-failure-model.md)): *entry* =
success depends on shared understanding; *fuzzy intent* = too vague to settle; *delayed feedback* =
you find out too late; *concentrated consequences* = being wrong lands on specific people;
*irreversible* = it cannot be undone; *explanatory divergence* = each side explains the result its
own way, so nobody calls it a misunderstanding.

---

## Meetings

| meeting | why success depends on shared understanding | conditions it usually meets |
|---|---|---|
| Project kickoff | everyone builds from what they think was agreed | delayed feedback (the wrong thing shows up months later), explanatory divergence (each side blames the other's part), concentrated consequences |
| Pre-mortem | the team must mean the same thing by "failure" and by each risk | fuzzy intent, delayed feedback |
| Hiring decision meeting | the panel decides on one shared reading of what the role needs | concentrated consequences (the candidate, the team), delayed feedback (fit shows months later), costly to reverse, fuzzy intent ("strong candidate") |
| Onboarding a new employee | the new person acts on what they think is expected | fuzzy intent, delayed feedback |
| Rollout kickoff (people leading change: an AI rollout, a reorganisation) | many people change how they work based on one explanation | delayed feedback (adoption shows months later, and at a distance), concentrated consequences, explanatory divergence |
| Post-mortem | the fix depends on agreeing what actually happened | explanatory divergence (the core case), delayed feedback |
| Quarterly or yearly review | pay, role and next goals rest on what "met expectations" meant | fuzzy intent, concentrated consequences, delayed feedback |
| Firing meeting | the person leaves with one account of why | irreversible, concentrated consequences |

## Decisions often reserved by a shareholder agreement

Shareholder agreements and articles of association commonly reserve some decisions for special
approval (a higher majority, or named shareholders' consent). The list below is the usual set, as
general knowledge, **not legal advice**; a company's own agreement is the only real list.

| decision | conditions it usually meets |
|---|---|
| Issuing new shares | irreversible (dilution), concentrated consequences |
| Amending the articles of association | irreversible in practice, concentrated consequences, delayed feedback |
| Sale of the company or a merger | irreversible, concentrated consequences |
| Taking on major debt or giving security | concentrated consequences, delayed feedback |
| Approving the annual budget or business plan | fuzzy intent, delayed feedback |
| Appointing or removing directors or the CEO | concentrated consequences, costly to reverse, delayed feedback |
| Paying dividends | concentrated consequences |
| Related-party transactions | concentrated consequences, explanatory divergence |
| Winding up the company | irreversible, concentrated consequences |

A company that writes the clarity process into this list is the proposed fifth stage of a Clarity
Organization ([definitions.md](definitions.md) §Clarity Organization, maturity ladder).

---

## Keeping it current

Add a row when a real case shows a kind of meeting or decision that is missing; name the conditions
it usually meets, using only the condition names above. If a row seems to need a condition that does
not exist, change [arbiter-failure-model.md](arbiter-failure-model.md) first, through
`/slava:maintain:docs-strategy-update`, never here.
