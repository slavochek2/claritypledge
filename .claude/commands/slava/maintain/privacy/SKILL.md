---
name: privacy
description: Privacy review — scan staged and recently modified public files for personal identifiers, sensitive business info, or anything that could be harmful if publicly visible on GitHub.
when_to_use: Run before committing a batch of docs/infra changes, or as part of /day when working with docs. The pre-commit hook catches mechanical patterns; this skill applies judgment.
version: 1.1.0
---

# Privacy Review

Scan staged and recently modified files for content that shouldn't be in a public repo.

This is **not** a security scan (that's gitleaks + section 5 of pre-commit-checks.sh).
This is a **privacy + personal harm** scan: things that are technically safe to commit but could hurt the owner if widely seen.

---

## What to look for

### Guiding principle

> **Would this harm someone — anyone — if they found it?**

Don't match patterns. Read with judgment. Ask: "If this person googled themselves and found this page, would they be hurt, embarrassed, or angry?" If yes, flag it. The categories below are examples, not an exhaustive list.

### Hard red flags (must flag, definitely move to `.private/`)
- Personal email addresses (non-project addresses)
- Phone numbers, home addresses, passport/ID info
- Credentials, passwords, tokens (should also be caught by security scan)
- Account usernames for personal services
- **Third-party personal information** — real names of clients, session participants, leads, or partners alongside identifying context (profession, relationship status, behavioral observations, health details, financial situation)
- **Behavioral observations about identifiable people** — "resists paraphrasing", "didn't see the point", "gets defensive when..." — even with first names only, context makes people identifiable
- **Session/meeting content** — what someone said, how they reacted, private disagreements revealed during facilitated sessions

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
- Technical architecture decisions
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

2. **Read each file** — don't just grep, read the content with judgment.
   Focus on: `docs/`, `features/`, `.claude/commands/`, `CLAUDE.md`, `README.md`, `content/articles/`, `content/sifter/`
   Note: `content/articles/` and `content/sifter/` are watched paths — any commits to these directories require a /privacy stamp before pushing.
   Skip: `src/`, `e2e/`, `supabase/` (code rarely contains personal content)
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
   This SHA is checked by the pre-push hook (Layer 2). Without a stamp covering all watched-path commits in the push range, pushes that include changes to docs/, features/, .claude/commands/, CLAUDE.md, README.md, content/articles/, content/sifter/ are blocked.

---

## Notes

- The pre-commit hook (section 16 of `scripts/pre-commit-checks.sh`) catches known email patterns mechanically. This skill catches what the hook misses — nuanced content that requires reading.
- When in doubt: if you'd hesitate to show it to a journalist writing a profile of the founder, flag it.
- `.private/` is double-gitignored (`*` in `.private/.gitignore` + `.private/` in root `.gitignore`). Always move sensitive content there, never delete it — the owner still needs it.
