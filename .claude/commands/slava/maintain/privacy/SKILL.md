---
name: privacy
description: Privacy review — scan staged and recently modified public files for personal identifiers, sensitive business info, or anything that could be harmful if publicly visible on GitHub.
when_to_use: Run before committing a batch of docs/infra changes, or as part of /day-end when working with docs. The pre-commit hook catches mechanical patterns; this skill applies judgment.
version: 1.0.0
---

# Privacy Review

Scan staged and recently modified files for content that shouldn't be in a public repo.

This is **not** a security scan (that's gitleaks + section 5 of pre-commit-checks.sh).
This is a **privacy + personal harm** scan: things that are technically safe to commit but could hurt the owner if widely seen.

---

## What to look for

### Hard red flags (must flag, definitely move to `.private/`)
- Personal email addresses (non-project addresses)
- Phone numbers, home addresses, passport/ID info
- Credentials, passwords, tokens (should also be caught by security scan)
- Account usernames for personal services

### Soft flags (use judgment — flag if in doubt)
- **Private business strategy** that could help competitors if read (customer acquisition tactics, pricing rationale, pivot options not yet announced)
- **Personal struggles or vulnerabilities** — founder reflections, health mentions, financial stress, relationship context
- **Negative opinions about specific named people** (investors, partners, customers, collaborators)
- **Unannounced product decisions** that could affect stakeholder trust if leaked
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
   Focus on: `docs/`, `features/`, `.claude/commands/`, `CLAUDE.md`, `README.md`, `content/articles/`
   Skip: `src/`, `e2e/`, `supabase/` (code rarely contains personal content)
   Note: `content/articles/` drafts may contain outreach tracking, contact info, or approval notes mixed in with article content — a known risk zone.

3. **Flag findings** — for each finding, state:
   - File + approximate location
   - What was found
   - Category (hard red flag / soft flag)
   - Suggested action (move to `.private/`, redact, or leave with rationale)

4. **Fix hard red flags immediately** — move or redact without asking.
   For soft flags — present to user and ask.

5. **Output summary:**
   ```
   Privacy review complete.
   Hard flags fixed: N
   Soft flags for review: N
   Clean: N files reviewed, nothing found
   ```

---

## Notes

- The pre-commit hook (section 16 of `scripts/pre-commit-checks.sh`) catches known email patterns mechanically. This skill catches what the hook misses — nuanced content that requires reading.
- When in doubt: if you'd hesitate to show it to a journalist writing a profile of the founder, flag it.
- `.private/` is double-gitignored (`*` in `.private/.gitignore` + `.private/` in root `.gitignore`). Always move sensitive content there, never delete it — the owner still needs it.
