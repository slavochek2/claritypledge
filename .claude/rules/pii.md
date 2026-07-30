---
description: Third-party names in public prose — authoring-layer control (P936)
paths:
  - "features/**/*.md"
  - "docs/**/*.md"
  - "content/**/*.md"
---

# Third-Party Names in Public Prose — Anonymize, Reference Private

This repo is public (AGPL-3.0). Applies to **all** authoring on these paths — feature specs (bug, incident, design), `docs/` strategy and decision logs, and `content/` articles — and to **agent-written** prose specifically: every recurrence so far came from an agent drafting, not a human typing.

## The rule

Never name a **private individual** encountered through the work — a user, customer, interviewee, partner, peer practitioner, or contact — nor their email or Supabase UUID.

Write **roles, not names** — `creator` / `joiner` / `host` / `partner` / `a peer practitioner`. Anonymize the characterizing detail too ("a user with a corporate Microsoft 365 email"), because a role plus a description of someone's business re-identifies them as effectively as the name does. That combination is the 2026-07-30 leak. Put identifiable detail in `.private/incidents/YYYY-MM-DD-slug.md` (or `.private/docs/`) and reference the path.

### What this does NOT forbid

The test is **consent and public standing**, not the presence of a proper noun. These are fine and appear throughout `docs/` and `content/` by design:

- **Published or public figures cited as thinkers** — Popper, Deutsch, Kahneman, Dalio. Citing public work is not disclosure.
- **Consented, published endorsements** — a testimonial the person agreed to publish under their own name (see the landing-page testimonials).
- **Organizations, products, and tools** — Supabase, Ghost, Vercel.
- **The founder's own name** — he publishes under it; it is the git author and appears in article filenames deliberately.

If you are unsure whether someone is a private individual or a public figure, treat them as private and use a role. Ask rather than guess.

## This is NOT commit-enforced — do not expect the gate to catch it

The pre-commit privacy gate (`audit-privacy.sh`) is allowlist/pattern-based and will **not** flag an arbitrary third-party name. Its `HARD_PATTERNS` cover the founder's own identifiers plus one literal test-fixture name — nothing that generalizes to a person you just met.

**Commit messages are the weakest surface, and no rules file can reach them.** `paths:` globs match files, never messages; and the gate deliberately skips the third-party-email check in `--msg` mode (`audit-privacy.sh` ~L196) because `Co-Authored-By` trailers would false-positive. A commit message describing *why* a de-identification happened can re-publish the very detail the diff removed — that happened on 2026-07-30. Write the message in roles too.

P936 split third-party PII by what can be enforced where: **emails** are scanner-detected and server-enforced; **names** are an authoring-layer control, because auto-detection was rejected against a measured false-positive baseline (`Page` 3,766 hits, `Mark` 302) and a committed names watchlist would itself be the disclosure.

**A green gate is not evidence that this rule was followed.** Authoring in roles is the only prevention on this path.

## Remedy is limited — prevention is the whole control

A name committed to a public repo is already public: GitHub holds it, clones hold it, and `git revert` does not remove it from history. There is no cleanup step that undoes a leak here — only disclosure. Get it right at write time.

**History:** `docs/decisions.md` 2026-06-12 (P929/P933/P934) · 2026-06-15 [technical] (P936) · 2026-07-30 (P1014 — a name reached `docs/decisions.md` and `content/articles/` because this rule loaded only on `features/`).
