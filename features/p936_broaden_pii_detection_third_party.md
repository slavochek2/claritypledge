---
status: week
type: task
rank: 1000932.0
created_date: '2026-06-15'
tags: [privacy, security, audit-privacy, pii]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P936: Broaden audit-privacy.sh PII detection to third-party PII (not just the founder's identifiers)

## Problem

**Situation:** The privacy scanner `scripts/audit-privacy.sh` — now enforced server-side by P919's required check — matches only a **curated set of the founder's own identifiers** (personal gmail/googlemail + aliases, the founder username, `/Users/<founder>/` paths, one specific name, non-`slava` `@inguro.com` emails, the P919 test sentinel). It does **not** detect third-party PII: a customer's name, a contact's email, an interviewee's personal data.

**Complication:** This repo is **public (AGPL)** and the founder engages with real people — customers, partners, interviewees. Leaking **their** PII is at least as serious as leaking the founder's, and currently nothing automated catches it. The curated coverage exists because the 297-commit historical leak (decisions.md) was the founder's own identifiers; the threat model has since expanded to third parties.

**Question:** How do we broaden detection to catch third-party PII (unknown emails, names of people engaged with) **without** so many false positives that the gate becomes unusable or contributors route around it?

**Relationship to P919 (keep separate):** P919 delivered the **enforcement layer** (server-side, agent-unbypassable). This spec is about **detection breadth** (which patterns match). They compose: because P919 enforces *whatever scanner is on `main`*, every detection improvement here becomes immediately un-bypassable. P919 ships as-is; this is additive and can land iteratively.

## Appetite

**Blast radius — high.** `audit-privacy.sh` gates every commit and push (and, post-P919, the server check). A bad pattern either lets PII through (under-block) or blocks legitimate commits across the whole repo (over-block). **Reversibility — high** (patterns + allowlist are git-reverted; no data migration). **Decision density — high, and the reason the founder chose "design it first":** the coverage-vs-false-positive tradeoff is a genuine design decision that must be made against this repo's real content, not in the abstract.

## Approach

**Design-first (founder decision 2026-06-15).** Do NOT pick a pattern strategy up front. The design pipeline (`/challenge-prd` → `/architect`) must first produce a **false-positive baseline against THIS repo**, then compare options against it:

1. **FP baseline (first deliverable):** count distinct email addresses actually present in the tracked tree; estimate how many a naive "flag every email" regex would fire on; sample ordinary words that are also names. This number decides what is feasible.
2. **Candidate approaches to compare (with FP estimate each):**
   - **(a) Unknown-email detection + allowlist** — flag any email not on a committed allowlist of known-safe addresses (`ops@claritypledge.com`, test fixtures, `example.com`, `slava@inguro.com`). Catches all third-party emails; FP managed by seeding the allowlist once.
   - **(b) Names watchlist** — a committed list of specific people engaged with whose names must never appear. Near-zero FP, but requires the founder to add each new person (misses people not yet listed).
   - **(c) Maximal auto-detection** — generic name/phone/address detection (NER-style). Highest coverage, but expected high FP in a code repo; include only if the baseline justifies it.
   - **(d) Process layer (already exists)** — `.claude/rules/features.md` ("anonymize PII in specs; identifiable details → `.private/`") + human review. Document how the automated layers complement it.
3. **Reuse:** the existing `audit-privacy.sh` pattern engine + `.privacy-allowlist` mechanism + `scripts/test-audit-privacy.sh` harness (which already tests catch/allow in `--msg` and range modes inside isolated temp repos).

**Sequencing:** land at least a first round of broadening **before P919 Phase 2** (ruleset activation) so the server boundary enforces good coverage from day one — but it does **not** block P919's mechanism (the scanner improves iteratively; each improvement is enforced once on `main`).

## Risks / Non-Goals

### Risks
- **Over-blocking drives `--no-verify` habit (CRITICAL).** If the gate fires on legitimate commits, contributors learn to bypass it, defeating the entire boundary. MITIGATE: the FP baseline gates the design; seed the allowlist before enabling; prefer allowlist-managed precision over broad heuristics.
- **CI/local parity (P919 carryover).** The server check runs the scanner on GNU grep; new patterns must be POSIX-portable (P919 already fixed `[[:<:]]` → `(^|[^[:alnum:]_])`). MITIGATE: every new pattern gets a `test-audit-privacy.sh` case; CI parity step re-runs it on the Linux runner.
- **A names watchlist is itself sensitive.** A committed list of customer names IS a PII disclosure. MITIGATE: keep any real watchlist in `.private/` (gitignored) and have the scanner read it from there; never commit real names to the public tree.

### Non-Goals
- Do NOT build a general DLP product or external service — this stays a local + CI bash scanner.
- Do NOT add NER/name auto-detection unless the FP baseline justifies it (default: rejected as too noisy).
- Do NOT weaken or remove existing founder-identifier coverage.
- Do NOT commit any real third-party name or email into the public tree (including into tests or the watchlist) — use synthetic fixtures (mirror P919's synthetic-sentinel discipline).
- Do NOT change P919's enforcement mechanism (ruleset, staging hop, credential model) — this is detection only.

### Alternatives Considered
- **Do nothing / rely on process only** (features.md anonymize rule + review). REJECTED as the sole layer: the historical leak proved process alone fails; automation is the backstop.
- **Third-party DLP / secret-scanning service.** PARTIAL: GitHub secret-scanning catches credentials, not personal names/emails; keep as complementary, not a replacement.
- **Fold into P919.** REJECTED: P919's enforcement is nearly done and valuable; conflating it with the harder detection-breadth design would delay shipping the boundary.

### Rollback Strategy
Each pattern/allowlist change is independently `git revert`-able; no data migration. If a new pattern over-blocks, revert that pattern commit; the prior scanner coverage is restored immediately.

## Done-When

- [ ] A false-positive baseline against the repo is produced (distinct-email count; naive-regex hit count) and recorded in the spec.
- [ ] An approach is chosen with explicit founder sign-off, justified against the FP baseline.
- [ ] The scanner catches a **synthetic** third-party email and a **synthetic** watchlisted name (cases added to `scripts/test-audit-privacy.sh`, both `--msg` and range modes).
- [ ] All existing founder-identifier tests still pass (no regression), on both macOS BSD grep and the GNU CI runner.
- [ ] The allowlist/watchlist mechanism and a "how to maintain it" note are documented (and any real watchlist lives in `.private/`, never the public tree).
- [ ] New patterns are POSIX-portable (no BSD-only constructs) — verified green in the P919 `privacy-scan` CI parity step.
