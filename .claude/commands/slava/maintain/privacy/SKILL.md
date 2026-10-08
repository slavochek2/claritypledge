---
name: privacy
description: Privacy review — scan staged and recently modified public files for personal identifiers, sensitive business info, or anything that could be harmful if publicly visible on GitHub.
when_to_use: Run before committing a batch of docs/infra changes, or as part of /day when working with docs. The pre-commit hook catches mechanical patterns; this skill applies judgment.
version: 1.1.0
---

# Privacy Review

Scan staged and recently modified files for content that shouldn't be in a public repo.

This is a **privacy + personal harm** scan: things that are technically safe to commit but could hurt the owner if widely seen. It also covers live-vulnerability disclosure — see the red flag below — because that class of content reaches this reviewer and no other (`docs/decisions.md` 2026-08-13 [process]).

---

## What to look for

### Guiding principle

> **Would this harm someone — anyone — if they found it?**

Don't match patterns. Read with judgment. Ask: "If this person googled themselves and found this page, would they be hurt, embarrassed, or angry?" If yes, flag it. The categories below are examples, not an exhaustive list.

### Why this needs a reader, not just the scanner

`scripts/audit-privacy.sh` blocks what has a shape (emails, phone numbers with a `+CC`/`tel:`/keyword mark, the founder's own identifiers) and the names `.private/` already holds — the seed `.private/docs/privacy-names.txt`, CRM `name:` fields, and business person files. It cannot block a person it has never been told about, a company named only in conversation, or a sentence that identifies someone **without naming them**. In CI `.private/` does not exist, so the server-side check knows no names at all. Everything below is your job.

**The test is identifiability, not the presence of a name.** A fact becomes personal data when a reader who knows the community could work out who it is about. Two harmless facts can combine into one identifying one: "an operations lead at a school" is no one; "the operations lead at the only language school in <town>" is one person. So read for **combinations**: role + organisation, role + place + date, a quote + an event someone attended.

**Worked examples** (all names are synthetic):

A rewrite removes the direct identifier; it does not make the paragraph anonymous. After rewriting, re-read the surrounding paragraph and the commit message as one text — the date, venue or role you kept next to it can re-identify the person.

| Draft line | Problem | Safer rewrite (then re-read in context) |
|---|---|---|
| "Met Zorbalina Quextor of Acme Fixture Ltd; she wants a pilot." | Third-party name + employer + intent | "A distribution partner wants a pilot." Name goes to `.private/crm/`. |
| "The pilot with Acme Fixture stalled because their CFO resisted." | Company name identifies the contact; behavioural claim about a findable person | "One partner pilot stalled at budget approval." |
| "The operations lead at the only language school in town replied." | No name, still one person — role + org + place | "A school contact replied." |
| "Partner fee: 30% rev-share, €4k floor, Acme signs by Friday." | Deal terms + counterparty — useful to competitors, embarrassing to the partner | Keep the decision ("we offer rev-share to host partners"); terms go to `.private/docs/business/`. |
| "Interviewed a co-founder pair at the Tuesday meetup in <small town>; one said they're splitting up." | Place + date + group size pin the people; private relationship detail | Drop place and date; keep the learning ("conflict between co-founders came up unprompted"). |
| "Hosted at a public coworking space in Lisbon." (a business acting publicly) | Public business acting publicly — fine | Leave it. |

**Places:** a city or country alone is not personal data — the founder's own work is public and so are public venues. A place becomes a flag when it **narrows a private person down**: a small venue + a date, a neighbourhood + a role, a home or street address (always a hard flag). That judgment is why places are left to you rather than to the scanner: no regex separates "Lisbon" in a market note from "the café on <street> where she works".

**Company and account names** are a flag when the company *is* the contact (a one-person business, a small partner, a named prospect in a pipeline) or when it's paired with a deal stage, terms or a quote. A large public company mentioned as market context ("Slack has threads") is not.

**When you find a new real name or company** in a draft, after moving it out: add it to `.private/docs/privacy-names.txt` (one per line) so the scanner blocks it next time — that's how the deterministic layer learns.

### Hard red flags (must flag, definitely move to `.private/`)
- Personal email addresses (non-project addresses)
- Phone numbers, home addresses, passport/ID info
- Credentials, passwords, tokens (should also be caught by security scan)
- Account usernames for personal services
- **Third-party personal information** — real names of clients, session participants, leads, or partners alongside identifying context (profession, relationship status, behavioral observations, health details, financial situation)
- **Behavioral observations about identifiable people** — "resists paraphrasing", "didn't see the point", "gets defensive when..." — even with first names only, context makes people identifiable
- **Session/meeting content** — what someone said, how they reacted, private disagreements revealed during facilitated sessions
- **Live-vulnerability disclosure** — reproduction detail, current grant/permission state, or an exploit path for a vulnerability that is unpatched or whose patch isn't yet verified live. Redirect: move the reproduction/exploit detail to `.private/docs/security-log.md`; the public artifact may state what was fixed and why it is now safe, not how it was broken.

### Soft flags (use judgment — flag if in doubt)
- **Private business strategy** that could help competitors if read (customer acquisition tactics, pricing rationale, pivot options not yet announced)
- **Personal struggles or vulnerabilities** — founder reflections, health mentions, financial stress, relationship context
- **Negative opinions about specific named people** (investors, partners, customers, collaborators)
- **Unannounced product decisions** that could affect stakeholder trust if leaked
- **Personal financial details** — living costs, salary expectations, burn rate specifics
- **Funder targeting details** — named funders with strategic reasoning (awkward if they see it before being approached)
- **Anything you'd be uncomfortable seeing quoted** in a critical article about you or the company

### Not a concern
- General product strategy already on the website
- Historical decisions that are already public via commits
- `ops@claritypledge.com` and `slava@claritypledge.com` — project emails, fine to mention

---

## Workflow

1. **Get files to review:**
   ```bash
   git diff --cached --name-only        # staged (about to commit)
   git diff --name-only HEAD~1          # last commit (if reviewing after)
   ```
   Filter to public files only (exclude `.private/`, `.env*`, anything gitignored).

1b. **Check the commit envelope, not only the file contents.** File-content review cannot see identity metadata, and metadata is permanent once pushed — no later edit removes it. Run:
   ```bash
   git log --format='%ae %ce' --all | tr ' ' '\n' | sort -u   # every author/committer email in history
   git for-each-ref --format='%(refname)' | grep original      # filter-branch backup refs still holding old commits
   ```
   Every address must be a `@users.noreply.github.com` or project address. A personal address here is a **hard red flag** — stop, do not push. Fix by rewriting the affected commits' author/committer fields, deleting any `refs/original/*` backup ref, and re-running this check before proceeding.

   **This step is mandatory for a first push to a new remote**, where nothing has forced the identity to be correct yet: a fresh repo inherits the global git identity, which is the one place no per-repo override protects. Incident 2026-08-14 — two clean content scans passed while both commits carried a personal address; only GitHub's `GH007` push protection caught it.

2. **Read each file** — don't just grep, read the content with judgment.
   Focus on: `docs/`, `features/`, `.claude/commands/`, `CLAUDE.md`, `README.md`, `content/articles/`, `content/sifter/`, `supabase/migrations/`
   Note: `content/articles/`, `content/sifter/`, and `supabase/migrations/` are watched paths — any commits to these directories require a /privacy stamp before pushing.
   Skip: `src/`, `e2e/` (code rarely contains personal content); `supabase/migrations/` is watched, not skipped — read migration headers for the live-vulnerability red flag above.
   Note: `content/articles/` drafts may contain outreach tracking, contact info, or approval notes mixed in with article content — a known risk zone.
   Note: `content/sifter/` should contain no session files (those belong in `.private/sifter/sessions/`). Only structural files with no personal content are valid here (e.g., `README.md`, schema templates). Any `.md` file that contains user-entered content, names, or brain dump material is a misplaced session file — flag immediately and move to `.private/sifter/sessions/`.

3. **Flag findings** — for each finding, state:
   - File + approximate location
   - What was found
   - Category (hard red flag / soft flag)
   - Suggested action (move to `.private/`, redact, or leave with rationale)

4. **Fix hard red flags immediately** — resolve without asking (choose the resolution per the guide below).
   For soft flags — present to user and ask (name which resolution you'd pick).

   **Three resolutions, not two — pick by content type:**
   - **Reframe (preferred for the founder's *own* personal-reason framing in a public strategy/goals doc):** rewrite to product-decision altitude — the *what/why of the decision*, not the personal circumstance behind it (e.g. "funds survival" → "funds the runway"; "need €2-3k to feel safe" → drop the personal figure, keep the decision). Keeps the fact in its **one CHARTER home**; no fragmentation. This beats moving when the sensitive part is the *framing*, not the fact.
   - **Move to `.private/`:** for irreducibly-personal residue — names, exact personal finances, behavioral observations about identifiable people — that can't be reframed without losing the point.
   - **Redact:** delete outright if neither home fits.

5. **Output summary:**
   ```
   Privacy review complete.
   Hard flags fixed: N
   Soft flags for review: N
   Clean: N files reviewed, nothing found
   ```

6. **Stamp the review** — after completing the review (whether clean or after fixes applied):
   ```bash
   git rev-parse HEAD > "$(git rev-parse --git-common-dir)/.privacy-reviewed"
   ```
   This SHA is checked by the pre-push hook (Layer 2). Without a stamp covering all watched-path commits in the push range, pushes that include changes to docs/, features/, .claude/commands/, CLAUDE.md, README.md, content/articles/, content/sifter/, supabase/migrations/ are blocked.

---

## Notes

- The pre-commit hook (section 17 of `scripts/pre-commit-checks.sh`, which runs `scripts/audit-privacy.sh`) catches shaped identifiers and names `.private/` already holds. This skill catches what it misses — see "Why this needs a reader" above.
- When in doubt: if you'd hesitate to show it to a journalist writing a profile of the founder, flag it.
- `.private/` is double-gitignored (`*` in `.private/.gitignore` + `.private/` in root `.gitignore`). Always move sensitive content there, never delete it — the owner still needs it.
