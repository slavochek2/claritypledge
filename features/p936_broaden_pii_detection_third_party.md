---
status: week
type: task
rank: 1000932.0
created_date: '2026-06-15'
tags: [privacy, security, audit-privacy, pii]
delivery_stage: challenge-prd
pipeline_ran: [create-spec, challenge-prd]
---

# P936: Broaden audit-privacy.sh PII detection to third-party PII (not just the founder's identifiers)

## Problem

**Situation:** The privacy scanner `scripts/audit-privacy.sh` — now enforced server-side by P919's required check — matches only a **curated set of the founder's own identifiers** (personal gmail/googlemail + aliases, the founder username, `/Users/<founder>/` paths, one specific name, non-`slava` `@inguro.com` emails, the P919 test sentinel). It does **not** detect third-party PII: a customer's name, a contact's email, an interviewee's personal data.

**Complication:** This repo is **public (AGPL)** and the founder engages with real people — customers, partners, interviewees. Leaking **their** PII is at least as serious as leaking the founder's, and currently nothing automated catches it. The curated coverage exists because the 297-commit historical leak (decisions.md) was the founder's own identifiers; the threat model has since expanded to third parties.

**Question:** How do we broaden detection to catch third-party PII (unknown emails, names of people engaged with) **without** so many false positives that the gate becomes unusable or contributors route around it?

**Relationship to P919 (keep separate):** P919 delivered the **enforcement layer** (server-side, agent-unbypassable). This spec is about **detection breadth** (which patterns match). They compose: because P919 enforces *whatever scanner is on `main`*, every detection improvement **that is committed to the public tree** (the email patterns + address allowlist) becomes immediately un-bypassable. **Names are the exception** — a names watchlist cannot be committed (it would itself be a PII leak) and `.private/` is invisible to CI, so name coverage is an **authoring-layer** control, not server-enforced (see §Approach "Resolution" + Resolved Decision 1). P919 ships as-is; this is additive and can land iteratively.

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

### Resolution (post-`/challenge-prd`, founder decision 2026-06-15) — split by enforceability

The challenge measured the FP baseline (below) and surfaced a load-bearing asymmetry: **emails can be server-enforced; names cannot.** A names watchlist must live in `.private/` (a committed list of customer names is itself a PII leak), but `.private/` is gitignored, so the P919 CI re-scan never sees it — a scanner names-watchlist would enforce nothing at the server boundary. P936 therefore splits into two complementary controls (both in scope):

- **Emails → scanner, server-enforced.** Approach (a): flag any email not on a committed address allowlist. **Correction:** the existing `.privacy-allowlist` is a *file-path* allowlist, not an *address* allowlist — (a) requires **building a new address-level allowlist mechanism** (`.privacy-email-allowlist` or equivalent), not reusing the path allowlist. Seed it from the ~170 distinct addresses already in the tree (below) before enabling.
- **Names → write-time prevention, authoring-layer.** A "redact participant names → roles" step added to `/create-bug` and `/reproduce` — the OTHER backstop the motivating decision (decisions.md 2026-06-12) co-named alongside the scanner. This prevents real names from being *written* into a public spec, which is the actual failure mode (P929/P933/P934). A scanner names-watchlist is **demoted** to an optional local-only catch, NOT the primary name control — it cannot be server-enforced.
- **(c) Maximal NER — REJECTED by the baseline.** Common names that are also ordinary words/code tokens drown any auto-detector (`Page` 3,766 hits, `Mark` 302, `Grace`/`Will` ~100 each).
- **(d) Process layer** complements both as the human backstop.

`/architect` designs the address-allowlist mechanism + the two skill-authoring edits together.

## False-Positive Baseline (measured 2026-06-15)

Produced during `/challenge-prd` against the live tracked tree (satisfies Done-When #1).

- **170 distinct email addresses** in the tracked tree; **483 raw line-hits** per scan (`git grep -rIhoE '<email-regex>' -- ':!*.lock' ':!package-lock.json'`).
- Of the 170: **~145 obviously safe by naming convention** (`example.com`, `*.test`, `pN-fixture@…`, `@claritypledge.com`, `noreply@…`); **~25 require manual inspection** before allowlisting.
- **Real third-party / personal emails already committed** (allowlist-or-remediate during seeding — addresses themselves withheld here to avoid re-leaking them into this public spec; the seeding pass will enumerate them locally): a vendored GSAP library author credit, a Claude-plugin author credit in `.claude-plugin/plugin.json`, temp-mail (`silomails.com`) test fixtures in `src/tests/p839-parity-email.test.ts`, a bot-persona identity in `docs/decisions.md`, and the **founder's own personal gmail address** in a done spec — the last is **currently undetected** by the scanner (it is not a `slavochek@` variant) and is itself an instance of the gap.
- **NER name-token noise (why approach (c) is rejected):** `Page` 3,766 · `Mark` 302 · `Will` 98 · `Grace` 97 · `Rich` 29 · `Bill` 21 · `Major` 16 — all ordinary words/tokens.

**Implication:** approach (a) email allowlist is viable with a bounded one-time seed (~170 entries, ~25 needing judgment) and low ongoing cost (one entry per new safe address). Confirmed by reading the source: the scanner's current `HARD_PATTERNS` is founder-identifiers only, and `.privacy-allowlist` currently contains only the two scanner scripts (path entries) — there is no address-level allowlist to reuse.

## Risks / Non-Goals

### Risks
- **Over-blocking drives `--no-verify` habit (CRITICAL).** If the gate fires on legitimate commits, contributors learn to bypass it, defeating the entire boundary. MITIGATE: the FP baseline gates the design; seed the allowlist before enabling; prefer allowlist-managed precision over broad heuristics.
- **CI/local parity (P919 carryover).** The server check runs the scanner on GNU grep; new patterns must be POSIX-portable (P919 already fixed `[[:<:]]` → `(^|[^[:alnum:]_])`). MITIGATE: every new pattern gets a `test-audit-privacy.sh` case; CI parity step re-runs it on the Linux runner.
- **A names watchlist is itself sensitive.** A committed list of customer names IS a PII disclosure. **RESOLVED (Decision 1):** names move to an **authoring-layer redaction** control (`/create-bug` + `/reproduce` rewrite names→roles at write-time), NOT a committed or CI-read watchlist. A real watchlist could only live in `.private/` (gitignored), which is invisible to the P919 CI re-scan — so a scanner watchlist cannot be the server-enforced name control. Prevent-at-write replaces catch-after-commit for names.

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

**Resolved (challenge-prd, 2026-06-15):**
- [x] A false-positive baseline against the repo is produced (170 distinct emails / 483 raw hits) and recorded in the spec (see §False-Positive Baseline).
- [x] An approach is chosen with explicit founder sign-off, justified against the FP baseline (emails→scanner + names→authoring-layer; see §Resolution + Resolved Decisions).

**Emails (scanner, server-enforced via P919):**
- [ ] An **address-level** allowlist mechanism is added to `audit-privacy.sh` (the existing `.privacy-allowlist` is path-only) and seeded with the existing safe addresses.
- [ ] The scanner catches a **synthetic** third-party email not on the allowlist (cases added to `scripts/test-audit-privacy.sh`, both `--msg` and range modes).
- [ ] All existing founder-identifier tests still pass (no regression), on both macOS BSD grep and the GNU CI runner.
- [ ] New patterns are POSIX-portable (no BSD-only constructs) — verified green in the P919 `privacy-scan` CI parity step.
- [ ] The address-allowlist mechanism + a "how to maintain it" note is documented.

**Names (authoring-layer, write-time prevention):**
- [ ] `/create-bug` and `/reproduce` gain a "redact real participant names → roles" authoring step, applied before the spec is written.
- [ ] The skill change is exercised: a spec authored through the updated skill renders a real name as a role (synthetic example), demonstrating prevention at write-time.
- [ ] Documented that names are a **local + authoring-layer** control, NOT server-enforced — and why (a real names watchlist cannot live in the public tree, and `.private/` is invisible to CI).

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd [BLOCK] | A `.private/` names watchlist is invisible to CI, so P919's server check enforces nothing for names — emails and names are NOT equivalent in enforceability, contradicting "every detection improvement becomes un-bypassable." | **Split by enforceability:** emails → scanner (server-enforced); names → write-time redaction in `/create-bug` + `/reproduce`. | Names cannot be server-enforced without committing a names list (itself a PII leak). Prevent names at write-time instead — that is the actual failure mode (P929/P933/P934). |
| 2 | /challenge-prd [BLOCK] | Approach (a) claims to "reuse the existing `.privacy-allowlist`," but that is a **file-path** allowlist, not an **address** allowlist — (a) needs a new mechanism built. | **Build a new address-level allowlist** (`.privacy-email-allowlist` or equivalent); seed from the measured ~170 addresses. Corrected in §Approach Resolution. | Confirmed by reading `audit-privacy.sh` — the allowlist exempts file paths, not addresses. ~50 lines + one tracked file. |
| 3 | /challenge-prd [WARN] | The motivating decision (2026-06-12) co-names a **skill-authoring** "redact names→roles" fix alongside the scanner watchlist; the spec silently dropped it. | **In scope for P936** (both halves) — founder decision 2026-06-15. | It is the only control that delivers third-party *name* coverage — the spec's stated purpose — which the scanner cannot server-enforce. |
| 4 | /challenge-prd [WARN] | FP baseline (the spec's own first deliverable) had not been recorded. | **Recorded** — see §False-Positive Baseline. | Done-When #1 satisfied. |
| 5 | /challenge-prd [WARN] | `*@silomails.com` and other real third-party emails already exist in the public tree (predate this spec). | **DEFER to /architect** — decide allowlist-vs-remediate per address during seeding. | Bounded set; not a blocker. Some are vendored library author credits (keep + allowlist), some are stale test data (candidate to scrub). |

**Verdict at resolution:** CHALLENGE → resolved. Ready for `/architect`.
