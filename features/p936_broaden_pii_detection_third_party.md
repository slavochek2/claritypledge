---
status: qa
type: task
rank: 1000932.0
created_date: '2026-06-15'
tags: [privacy, security, audit-privacy, pii]
feature_type: backend
delivery_stage: ship
pipeline_ran: [create-spec, challenge-prd, architect, spec-review, dev, ship]
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
- [x] An **address-level** allowlist mechanism is added to `audit-privacy.sh` (`.privacy-email-allowlist`, diff-only `scan_unknown_emails`) and seeded (~24 recurring safe domain/address entries; existing fixtures grandfathered — only added lines are scanned).
- [x] The scanner catches a **synthetic** third-party email not on the allowlist (11 cases in `scripts/test-audit-privacy.sh`; 28/28 pass). Covers `range`, `--staged` (pre-commit path), every grammar form, path-allowlist interaction, fail-open, and the **diff-only guard** (an unknown email in `--msg`/commit-message mode is NOT flagged — they carry Co-Authored-By trailers; this guard test was **mutation-verified**: removing the guard makes it fail). **Deferred (review MEDIUM-3):** the co-commit-attack test needs the base-SHA re-scan, which is P919's CI mechanism (the local scanner only sees the working-tree allowlist) — it lands with the `privacy-scan.yml` extension below.
- [~] All existing founder-identifier tests still pass (no regression) — **macOS BSD: 26/26 pass.** GNU CI runner pending (waits for P919's `privacy-scan.yml` on `main`; new patterns are `@`-delimited with no BSD-only constructs).
- [ ] New patterns are POSIX-portable (no BSD-only constructs) — verified locally via `bash scripts/test-audit-privacy.sh`, AND green in the P919 `privacy-scan` CI parity step. **If P936 lands before P919's `privacy-scan.yml` is on `main`, the local run is the interim verification; do not mark this item complete until the CI parity step has actually run green.**
- [ ] P919's CI co-commit guard (`privacy-scan.yml`) is extended to also diff and re-scan `.privacy-email-allowlist` at the base SHA when it changes in the pushed range (Security Review co-commit mitigation; Build Sequence step 6).
- [x] The address-allowlist mechanism + a "how to maintain it" note is documented (in the `.privacy-email-allowlist` header: grammar + "prefer @example.com for new fixtures").

**Names (authoring-layer, write-time prevention):**
- [x] *(already present — verify only)* `/create-bug` (lines 199-203 + quality gate) and `/reproduce` (lines 137-139) carry a "redact real participant names → roles" authoring step. Architect confirmed both exist (added post-2026-06-12). **Net-new name work is the rules-file strengthening below, not a skill step.**
- [x] `.claude/rules/features.md`'s "PII in Specs" rule is strengthened — names the role-vocabulary (`creator/joiner/host/partner/founder`), cites the scanner blind spot, references P929/P933/P934, and states it applies to ALL `features/` authoring (not just `/create-bug`). Ran the `/slava:maintain:claude-md` gate first (verdict: ADD, apply directly).
- [x] Documented that names are a **local + authoring-layer** control, NOT server-enforced — in D4, Security Review, and the strengthened `features.md` rule itself.

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd [BLOCK] | A `.private/` names watchlist is invisible to CI, so P919's server check enforces nothing for names — emails and names are NOT equivalent in enforceability, contradicting "every detection improvement becomes un-bypassable." | **Split by enforceability:** emails → scanner (server-enforced); names → write-time redaction in `/create-bug` + `/reproduce`. | Names cannot be server-enforced without committing a names list (itself a PII leak). Prevent names at write-time instead — that is the actual failure mode (P929/P933/P934). |
| 2 | /challenge-prd [BLOCK] | Approach (a) claims to "reuse the existing `.privacy-allowlist`," but that is a **file-path** allowlist, not an **address** allowlist — (a) needs a new mechanism built. | **Build a new address-level allowlist** (`.privacy-email-allowlist` or equivalent); seed from the measured ~170 addresses. Corrected in §Approach Resolution. | Confirmed by reading `audit-privacy.sh` — the allowlist exempts file paths, not addresses. ~50 lines + one tracked file. |
| 3 | /challenge-prd [WARN] | The motivating decision (2026-06-12) co-names a **skill-authoring** "redact names→roles" fix alongside the scanner watchlist; the spec silently dropped it. | **In scope for P936** (both halves) — founder decision 2026-06-15. | It is the only control that delivers third-party *name* coverage — the spec's stated purpose — which the scanner cannot server-enforce. |
| 4 | /challenge-prd [WARN] | FP baseline (the spec's own first deliverable) had not been recorded. | **Recorded** — see §False-Positive Baseline. | Done-When #1 satisfied. |
| 5 | /challenge-prd [WARN] | `*@silomails.com` and other real third-party emails already exist in the public tree (predate this spec). | **DEFER to /architect** — decide allowlist-vs-remediate per address during seeding. | Bounded set; not a blocker. Some are vendored library author credits (keep + allowlist), some are stale test data (candidate to scrub). |

**Verdict at resolution:** CHALLENGE → resolved. Ready for `/architect`.

## Technical Architecture

### Technical Analysis

**Current state (`scripts/audit-privacy.sh`, 150 lines — verified by code read 2026-06-15):**

- **Three scan modes:** `--staged` (pre-commit; `git diff --cached`), `--msg <file>` (commit-msg; whole file), `<range>` (pre-push / CI; `git log -p <range>` for the diff + `git log --format=%B` for commit messages). Range/staged modes scan **added (`+`) lines only**; `--msg` scans the whole file. Exit `0`=clean, `1`=hits, `2`=bad input. No internal severity levels — the WARNING-vs-ERROR demotion (`CP_ALLOW_PII_COMMIT=1`) lives in the caller `pre-commit-checks.sh`.
- **`HARD_PATTERNS`** (lines 17-22): four founder-only patterns (the personal `@googlemail/@gmail` address, its `+alias` variant, the numeric username, the `/Users/<founder>/` path — literals withheld here; they live in the allowlisted scanner script). Plus two non-HARD checks (lines 24-26, 128-132): a founder-name fixed-string grep, and **the `@inguro.com` "allow-one-block-rest" idiom** — flag any `…@inguro.com` address except the one allowlisted founder address. **This idiom is the architectural seed for this spec** (see D1).
- **`.privacy-allowlist`** is a **file-PATH** allowlist (exact-path OR directory-prefix match, NOT substring — its own header comment wrongly says "substring"; code at lines 96-98 is authoritative). It exempts whole files from scanning. There is **no address-level allowlist** — confirming Resolved Decision 2. It currently lists only the two scanner scripts. A `--- `/`+++ b/` diff-header state guard (`PREV_KIND`) blocks the content-injection bypass.
- **No `.private/` read anywhere** in the script — it only reads repo-relative paths. This is the mechanical reason a `.private/` names watchlist cannot be enforced by the CI re-scan (Resolved Decision 1): the scanner would have to read outside the checked-out public tree, which it never does.
- **Portability (P919 carryover):** on `main` the boundaries are still BSD-only `[[:<:]]`/`[[:>:]]` (the GNU-portable fix `(^|[^[:alnum:]_])` is on the unmerged P919 branch, commit `98d857c0`). Email patterns are `@`-delimited and need no word boundary, so the email work is **not blocked** by the portability fix — but any new patterns must use the portable construct, and P936's first round should land after (or alongside) P919's portability fix reaching `main`.

**Test harness (`scripts/test-audit-privacy.sh`, 17 assertions):** `assert_blocks`/`assert_allows` (`--msg` mode), `assert_range_blocks`/`assert_range_allows` (isolated `mktemp` git repo, `HEAD~1..HEAD`, optional 5th arg injects `.privacy-allowlist`). Covers founder-identifiers, allowlist exact-match, sibling-`.bak` rejection, content-injection. Pass/fail counted, exits non-zero on any fail.

**Call sites:** `pre-commit-checks.sh:867` (`--staged`), `pre-push-checks.sh:59` (`<range>`, non-bypassable). **No GitHub Actions workflow runs it yet** (the `privacy-scan.yml` server check is on the unmerged P919 branch — confirms P936 composes on top of P919, not the reverse).

**Reuse inventory:**
| Asset | Path | Reuse role |
|-------|------|-----------|
| `@inguro.com` allow-one idiom | `audit-privacy.sh:24-26,128-132` | **Generalize** into the all-domain email-allowlist check (D1) — the shape already exists |
| `scan_content` + `HITS` pipeline | `audit-privacy.sh` | New email check appends to `local_hits` like the existing checks |
| Path allowlist loader | `audit-privacy.sh:77-117` | Pattern to mirror for the **new** address-allowlist file load (separate mechanism) |
| `assert_range_*` / `assert_*` | `test-audit-privacy.sh:9-116` | New email cases reuse these directly (block-unknown / allow-listed / --msg + range) |
| **Existing names-redaction steps** | `/create-bug` (lines 199-203, QG 357), `/reproduce` (lines 137-139) | **ALREADY IMPLEMENTED** post-2026-06-12 — names half is verify-not-build (see D4) |
| Blanket PII rule | `.claude/rules/features.md:180-182` | Auto-loaded on ALL `features/` edits — the higher-leverage names lever (D4) |
| Soft name warning | `pre-commit-checks.sh` ("⚠ Possible personal identifier in docs/features") | Existing heuristic features/ warning — already a partial names signal |

> **Scope discovery (founder decision pending — flagged 2026-06-15):** the names-half authoring step the founder approved "adding" to `/create-bug` + `/reproduce` **already exists** (added as the direct fix for the 2026-06-12 / P934 decision). So the names half is **smaller and refocused**: verify the existing skill steps, and strengthen the auto-loaded `.claude/rules/features.md` rule (the real gap — it fires on EVERY `features/` edit, including non-bug specs and agent-written specs, which is where P929 and the 2026-06-15 P936-baseline near-miss actually happened — *not* inside `/create-bug`). Net-new name work shrinks to one rules-file edit + verification.

### Architecture Decisions

**D1 — Email detection: generalize the `@inguro.com` idiom to all domains, gated by a committed address-allowlist.**
- **Chosen:** Add a check that flags **any** email-shaped token whose address is not on a committed allowlist — structurally identical to the existing `INGURO_EXTRA` minus `INGURO_ALLOW`, widened from one domain to all. Append hits to the existing `local_hits` pipeline.
- **Interaction with the existing `@inguro.com` check (resolves spec-review BLOCK):** the existing `INGURO_EXTRA`/`INGURO_HITS` block (lines 130-132) is **preserved as-is** — the new general check **supplements**, never replaces, it. To keep both checks in agreement, inguro is allowlisted as the **specific address** `slava@inguro.com`, NOT as the whole domain `inguro.com` — so both the old check and the new general check treat only `slava@inguro.com` as safe at that domain (a whole-domain `inguro.com` entry would make the new check pass a non-`slava` `@inguro.com` address while the old check still blocks it — contradictory intent, avoided).
- **Rationale:** The scanner already does exactly this for one domain; generalizing reuses a proven idiom rather than inventing a mechanism. Email tokens are `@`-delimited (self-bounding) so no fragile word-boundary regex.
- **Trade-off:** Broad match (483 raw hits today) → the allowlist must be seeded before the check is enabled, or every existing safe fixture blocks. Mitigated by D3.
- **Alternative rejected:** Per-known-bad-domain patterns (like the `@inguro` one-off) — does not scale and only catches domains you already thought of; the point is to catch *unknown* third-party addresses.

**D2 — New `.privacy-email-allowlist` file (address + domain allow), committed to the public tree.**
- **Chosen:** A new tracked file, **one entry per line** (grammar mirrors `.gitignore`/`.privacy-allowlist` conventions; resolves spec-review BLOCK on undefined format):
  - **Domain entry** — a bare domain, no `@` (e.g. `example.com`, `claritypledge.com`): matches any email whose domain part equals it, case-insensitive.
  - **Domain-suffix wildcard** — leading `*.` (e.g. `*.test`): matches any email whose domain ends with that suffix (`foo.test`, `a.b.test`).
  - **Local-part wildcard** — trailing `@*` (e.g. `noreply@*`): matches any email whose local part equals it, any domain.
  - **Full-address entry** — contains `@`, no wildcard (e.g. `slava@inguro.com`, a vendored library author credit): exact case-insensitive match of the whole token.
  - `#`-prefixed lines are comments; blank lines ignored.

  An email token extracted from the scanned `+`-lines is **SAFE iff it matches at least one entry**; otherwise it is a hit. Matched against the **email token**, not the file path (the inverse of `.privacy-allowlist`). Use the **bare-domain** form consistently — `claritypledge.com`, never `@claritypledge.com` (the §FP Baseline's `@claritypledge.com` is shorthand; the file uses `claritypledge.com`). `inguro.com` is NOT a domain entry — see D1 (it is the full-address entry `slava@inguro.com`).
  - **Edge cases (fail-OPEN — implemented; revised from "fail-closed" during dev):** the email check is active only when `.privacy-email-allowlist` exists and is non-empty (guarded by `[ -s ]`, mirroring the existing path allowlist). If it is missing/empty the check is **skipped**. *Why the change:* the spec originally said fail-**closed**; after reading the scanner, fail-open was chosen because (a) it matches the existing `.privacy-allowlist` `[ -s ]` convention, (b) fail-closed-on-missing would flag *every* email in *every* diff — the catastrophic over-block the #1 CRITICAL risk warns against, and (c) the deleted-allowlist threat is the same visible-diff residual P919 already accepts (deleting `.privacy-email-allowlist` is itself a reviewable diff). A malformed line (matches no recognized form) is treated as a literal full-address entry — it matches nothing, never widens coverage.
  - **Interaction with the path `.privacy-allowlist`:** the path allowlist runs first (filters whole files out of `$DIFF` before `scan_content`), so an address inside a path-allowlisted file is exempt from the email check too — by design (those files, e.g. the scanner's own fixtures, are already trusted). This is an existing-behavior consequence, not new logic.
- **Rationale (load-bearing):** A list of *safe* addresses is **non-sensitive** — committing it leaks nothing. This is exactly why emails are server-enforceable and names are not (Resolved Decision 1): the email-allowlist can live in the public tree and CI reads it; a names watchlist cannot.
- **Trade-off:** A committed allowlist is itself an attack surface (co-commit bypass) — see Security Review; mitigated by P919's base-SHA re-scan.
- **Alternative rejected:** Reuse `.privacy-allowlist` (path-based) — confirmed incompatible; it exempts whole files, which would blanket-exempt any future PII added to those files.

**D3 — Seed the allowlist from the measured baseline before enabling the check.**
- **Chosen:** Allowlist the ~145 convention-safe domains/addresses wholesale; manually triage the ~25 oddballs (allowlist vendored author credits; **remediate** stale temp-mail test fixtures and the legacy personal address in the done spec where cheap). Enable the blocking check only after the seed, so day-one FP ≈ 0.
- **Rationale:** Directly addresses the CRITICAL over-blocking→`--no-verify` risk. The baseline (§False-Positive Baseline) sized this as bounded.
- **Trade-off:** One-time triage effort; ongoing one allowlist line per new safe address (same maintenance shape as `.privacy-allowlist`).

**D4 — Names: strengthen the auto-loaded rule; keep the existing skill steps; NO scanner names-watchlist.**
- **Chosen:** (1) Verify the existing `/create-bug` + `/reproduce` redaction steps (already present). (2) Strengthen `.claude/rules/features.md`'s "PII in Specs" rule (lines 180-182) to name the role-vocabulary (`creator/joiner/host/partner/founder`), cite the scanner's blind spot, and reference P929/P933/P934 — because that rule auto-loads on **every** `features/` edit, closing the agent-written-spec gap the skill steps miss. (3) Document names as a **local + authoring-layer** control. No committed or `.private/` names list.
- **Rationale:** The recurrences happened in non-`/create-bug` authoring paths (a subagent writing a PII spec; this session's own baseline near-miss). The auto-loaded rule is the only lever that fires there. Scanner name-matching is structurally impossible without a sensitive list (Resolved Decision 1).
- **Trade-off:** Names remain prevention-not-enforcement — accepted; it is the only achievable control without leaking a names list. The existing `pre-commit-checks.sh` "⚠ Possible personal identifier in docs/features" soft warning stays as a backstop heuristic.
- **Constraint:** `.claude/rules/features.md` is a rules file → its edit MUST run the `/slava:maintain:claude-md` gate first (per `.claude/rules/rules.md`). This is a build-step prerequisite, not done at architect time.

**D5 — Parity & portability.** Every new email pattern gets a `test-audit-privacy.sh` case so the P919 CI parity step re-runs them on GNU grep. Email regex is `@`-delimited (no BSD boundary needed); any non-email pattern uses the portable `(^|[^[:alnum:]_])` construct. **Email-allowlist test cases (distinct from the existing path-allowlist injection tests — resolves spec-review WARN):**
- **Block-unknown:** a synthetic unknown address (a local part `@` a domain not on the allowlist) is a hit in range and `--staged` (diff) modes. (Diff-only — never `--msg`; see Refinement-2 note.)
- **Allow-listed:** an address matching each grammar form (domain, `*.`-suffix, `@*`-local, full-address) passes.
- **Path-allowlist interaction:** an unknown address inside a path-`.privacy-allowlist`ed file is exempt (path filter runs first) — assert it passes; the same address in a non-allowlisted file is a hit.
- **Co-commit attack (range mode):** adding the address to `.privacy-email-allowlist` AND the PII in the same range is caught when the scan uses the **base-SHA** allowlist (the P919 CI guard, Build step 6) — assert the base-allowlist re-scan still blocks.

### Security Review

*(Surface is the scanner's own integrity — there is no DB, RLS, auth surface, route, external API, LLM, secret, or env var in this change. The relevant threat model is "the enforced party can edit the scanner/allowlist," inherited from P919.)*

**Allowlist integrity (the decisive question):**
- ⚠️ **Co-commit bypass** — adding a safe-looking allowlist line **and** a real third-party address in the same commit would let it through the local scanner, identical to the `.privacy-allowlist` co-commit class. MITIGATION: extend P919's **base-SHA allowlist re-scan** (privacy-scan.yml, D2/§Security in P919) to also re-scan with `.privacy-email-allowlist` at the base SHA. **This must be added to P919's CI guard when P936's email-allowlist lands** — flagged as a cross-spec build dependency in the Build Sequence.
- ✅ **Committing the email-allowlist is not itself a leak** — it lists only non-sensitive safe addresses (the inverse of the names-watchlist problem). This is what makes D1/D2 server-enforceable.

**Coverage honesty:**
- ⚠️ **Names are NOT server-enforced** — D4 is prevention (authoring-layer) only. Done-When and the spec state this explicitly. A reviewer must not read "P936 catches third-party PII" as "the server blocks third-party names." It blocks third-party **emails**; it **prevents** third-party **names** at write-time.
- ⚠️ **Legacy PII is grandfathered** — range/staged scans see added lines only, so pre-existing addresses (e.g. the personal gmail in a done spec, `silomails.com` fixtures) are not re-flagged by future unrelated commits. Remediating them is a separate pass (Resolved Decision 5, deferred to this build's seeding step). Until remediated, they remain in the public history.

**Scanner-edits-own-scanner:** the email-allowlist is *data*, not code; P919's "fetch scanner from trusted base" protects the script, and the base-SHA re-scan (above) protects the allowlist. No new exposure beyond P919's accepted residual.

**Data protection / secrets / input validation:** ✅ No new secrets, env vars, user input, DB writes, or network calls. The scanner reads git diffs locally. No `VITE_*` change. No Pre-deploy Checklist needed (no external service/secret introduced).

### Implementation Approach

**Worktree recommended:** touches `.claude/rules/features.md` and `scripts/` — and the `.claude/rules/` edit must pass the `/slava:maintain:claude-md` gate.

#### Build Sequence
1. **Seed first (D3):** generate the distinct-address list locally (`git grep` per §Baseline), build `.privacy-email-allowlist` with safe domains + vetted addresses; triage the ~25 oddballs by a **decidable rule** (resolves spec-review WARN): **remediate** addresses in **live, editable** files (e.g. the `silomails.com` fixtures in `src/tests/` → replace with `@example.com` synthetics); **allowlist** addresses in `features/done/` (immutable history — leave the text, allowlist the address) and genuine vendored author credits. Do NOT enable the blocking check yet.
2. **Email check (D1/D2):** add the generalized allowlist-gated email check to `audit-privacy.sh` (model on `INGURO_EXTRA`/`INGURO_ALLOW`; load `.privacy-email-allowlist`; append to `local_hits`).
3. **Tests (D5):** add `test-audit-privacy.sh` cases — synthetic unknown email blocks (`--msg` + range), allowlisted address passes, allowlisted-path still works, co-commit/sibling cases. Run on macOS; confirm green.
4. **Falsify the gate (epistemic gate 7):** confirm a synthetic unknown address makes the check exit non-zero (paste it) — a green run alone is not proof.
5. **Names (D4):** verify existing `/create-bug` + `/reproduce` steps; run `/slava:maintain:claude-md "strengthen features.md PII-in-specs rule…"` THEN edit `.claude/rules/features.md`; document names as local/authoring-layer.
6. **Cross-spec (P919):** when this lands relative to P919, extend `privacy-scan.yml`'s base-SHA re-scan to cover `.privacy-email-allowlist` (Security Review co-commit mitigation). Sequence the email round to reach `main` with/after P919's portability fix.

#### Files to Create
- `.privacy-email-allowlist` — committed safe-domain + safe-address allowlist (D2).

#### Files to Modify
- `scripts/audit-privacy.sh` — generalized allowlist-gated email check (D1); load the new allowlist file.
- `scripts/test-audit-privacy.sh` — email-detection assertions (D5).
- `.claude/rules/features.md` — strengthen "PII in Specs" rule (D4; **via `/slava:maintain:claude-md` gate**).
- `.privacy-allowlist` — fix the incorrect "substring" header comment to "exact-path or directory-prefix" (opportunistic correctness; the code is exact/prefix).
- `.github/workflows/privacy-scan.yml` (on the P919 branch / once on `main`) — extend the base-SHA allowlist co-commit guard to also diff and re-scan with `.privacy-email-allowlist` at the base SHA (Build Sequence step 6; Security Review co-commit mitigation). **Resolves spec-review BLOCK — this security-critical step was missing from Files to Modify.** Cross-spec: coordinate with P919 (the file is not yet on `main`).
- A maintenance note (in the new allowlist file header or `docs/technical/`) — "how to add a safe address."

#### Not Modified (scope discovery)
- `/create-bug`, `/reproduce` — names-redaction steps **already present** (verify only, per D4). No net-new skill step.
