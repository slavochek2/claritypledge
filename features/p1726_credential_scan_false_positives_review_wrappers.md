---
status: in-progress
type: task
rank: 356
workstream: infrastructure
created_date: '2026-11-24'
tags: [review, ask-model, credential-scan, finish]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
spec_review_hash: 608d418a9bea1b75663ced06e36944317c5aac79a93cb0eab0fc328d15c89394
spec_review_vendors: [gemini, openrouter]
---

# P1726: The review wrappers' credential scan refuses test fixtures and code, not secrets

## Problem

**Situation:** `~/.agents/bin/ask-model` scans every payload it sends to a third party (`gemini`, which
`delegate-gemini` wraps, and `openrouter`, which carries GLM). A match exits 2, nothing is sent, and the
review standard (`/finish` Step 4b, decisions.md 2026-11-17 [process]) forbids editing the payload to get
past it: Gemini falls back to Codex, GLM is reported missing. The scan is the only content gate on those
sends, and it does catch real credentials.

**Complication:** In code review it fires almost only on things that are not secrets, and it fires hardest
on security work, whose tests are full of secret-shaped fixtures. Measured 2026-11-24 (method and private
details in `.private/docs/reviews/2026-11-24-p1726-scan-evidence.md`):

1. **The refusal log.** Since 2026-09-01, 85 refusals against about 3,500 third-party sends. In cp sessions,
   46 credential refusals across 21 sessions since 2026-10-08, 36 across 14 sessions after the last tightening
   (2026-10-23); from P1630 on each one costs GLM as well as Gemini. Every code-review refusal whose trigger
   the session recorded was a test fixture, a private-key header string inside parsing code, the public anon
   key, or a variable name. On 2026-11-17 two finished packages were held for want of any evidence reviewer
   (Codex was out of quota); a review round today lost Gemini and GLM the same way.
2. **The commit corpus.** All commit diffs of the last 90 days in cp, `~/.agents` and the private repo (about
   5,700 commits) through an exact mirror of the scan (agrees with the real wrapper on 181 of 181 payloads,
   61 refused and 120 clean): 61 commits would be refused. None holds a credential; one holds an arming phrase
   in a private repo, which should keep refusing.
3. **Structural false positives** — scanner defects, not judgment calls:
   - a key prefix matched **inside a word** (`ask-model`, `task-list`, `risk-assessment` read as a key; a key-id
     shape matched inside base64 image data);
   - a **private-key header with no key** after it (code that builds or strips the header);
   - the **public anon JWT**, which ships in every browser bundle by design;
   - **variable references and placeholders** as the assigned value (`"${SUPABASE_…:-}"`, `"$PROD_…"`,
     `"{POSTIZ_PASSWORD}"`, `env(OPENAI_API_KEY)`, `YOUR_GEMINI_API_KEY`).
4. **Fixtures** — a fixture is secret-shaped on purpose so the test exercises real redaction. No shape rule can
   tell it from a secret. At cp HEAD, 66 files would make any review that includes them refuse; most carry the
   e2e suites' shared test-account password literal.
5. **The assignment rule's refusal names the wrong sub-rule** — it prints the name regex whether the digits,
   mixed-value, entropy or passphrase test fired — so sessions misdiagnose the trigger (seen on P1677). The
   vendor-shape refusals print their own pattern.

> Founder, 2026-11-24, verbatim: "I noticed that our rappers are having a lot of false positives, and I don't
> know if we need them so strict and so on. Do we want to reflect, gather evidence, and then gather evidence,
> create a new spec to improve if needed, or just tell me no improvement needed, it's fine."

**Question:** How does the scan stop refusing fixtures and code while refusing every credential it refuses
today?

## Appetite

Blast radius: **high**. This is the only content gate before a payload leaves for Google or an OpenRouter host;
a credential it lets through cannot be recalled. It also decides whether every `/finish` and spec review gets
its Gemini and GLM lenses. Reversibility: the code is one revert in `~/.agents`; a leak is not reversible.
Decision density: low. The founder delegated the call; there is no `[FOUNDER DECISION]` in this spec, because
every choice below follows from the evidence or from an existing ruling.

## Invariants

Carried from rulings; a later spec may add, never remove without the founder.

- A refusal never prints or logs the matched value or the payload (pp decisions 2026-09-15, P67).
- The scan fails **closed**: any error in the scan refuses (exit 2), never sends.
- It reads the final payload bytes byte-safely, for every vendor that sends to a third party (`gemini`,
  `openrouter`). An invalid byte on a line must not hide a key on that line (P67 finding).
- Exit 2 from `delegate-gemini` means refused and nothing else (usage errors are 1).
- The agent never edits a payload to get past the scan, and never waives a review (2026-11-17 [process]).
- `ask-model`'s `ASK-MODEL:` header gains no field after `exit=` (`review_receipt.py` anchors on `exit=0`); the log's
  refused-send header never ends in `gemini-send` (`scripts/token-usage-refresh.py` counts on it).
- Every credential refused today is still refused, in every context in the recall harness, with exactly
  these exceptions, none of which is a usable secret: the Supabase anon key (public by design; a token whose
  claims were edited to look like it is not a valid credential); a private-key header with no key body; a
  value that is only a variable reference; a vendor prefix in the wrong case (real keys have one case); and a
  value committed at HEAD on a line its author marked as a fixture.
- A private key is never exemptable, by marker or otherwise.

## Solution

### 1. One scan, which says what it found

The shape list and the assignment rule run as **one Python pass** over the payload file (today a grep loop plus
a separate Python step), on the raw bytes decoded as latin-1. On a match the refusal names **the rule and the
payload line number** (1-based, counted on `\n`; the first match by position, plus a count of the others) and
the next step. The log header becomes `REFUSED:SECRET rule=<name> line=<n>`. Never the value.

Rule names: `private-key`, `sk-key`, `stripe-key`, `google-key`, `github-token`, `slack-token`, `aws-key-id`,
`jwt`, `gitlab-token`, `assign-digits`, `assign-alnum`, `assign-entropy`, `assign-passphrase`, and
`scan-error` for any failure inside the scan, which refuses (exit 2).

### 2. Fix the structural false positives — by the body of the match, never by what surrounds it

The 2026-11-24 spec review broke a first design that required a word boundary before each key prefix: escape
sequences, ANSI colour codes, URL parts, a `/` after a key id, and diff or quote prefixes all defeated it.
Context is not trustworthy, so v2 adds no context rules. Precision comes from:

- **Case:** each vendor prefix matches in its real case only (`sk-`, `AIza`, `ghp_`, `AKIA`, `eyJ`, `glpat-`,
  and so on). v1 matched case-insensitively, which is what made `akia…` inside base64 data look like a key id.
- **`sk-` body:** the 16+ characters after `sk-` must contain a digit, an uppercase letter or `_`. Real keys
  always do; `ask-model-image-test` and `task-list-for-the-weekly-run` never do.
- **Private keys:** the header refuses when a run of 40+ base64 characters containing upper case, lower case
  and a digit appears within the next 1,000 characters, whatever lies between (line prefixes like `+`, `-`,
  `> `, armor headers, escaped newlines). A header in code or prose with no key body passes.
- **JWTs:** a token whose payload decodes to `iss` = `supabase` and `role` = `anon` passes. Any decode error, a
  missing claim or any other issuer refuses.
- **Assignments:** a value that is only a reference passes: `${NAME}`, `$UPPER_NAME`, `{NAME}`, `<name>`,
  `env(NAME)`, and `${NAME:-default}` when the default is empty, another reference, or itself passes the same
  value rules (so a real password as the default still refuses). A name is short words (at most 12 letters
  each) joined by `_`, with at most two trailing digits; a random string inside `$`, `{}` or `<>` is not a name
  and still refuses. There is no placeholder exemption: a `YOUR_API_KEY`-style value that trips the entropy
  rule is marked in source like any fixture.

### 3. Fixtures are declared in committed source, with the marker the repo already uses

The marker `gitleaks:allow` is honoured by cp's pre-commit gitleaks check and its CI secret scan, and is already
on 54 cp files. A matched value is exempt only when that **exact value appears in a file tracked at `HEAD` of
the repository `ask-model` runs in, on a line that carries the marker**. The marker in the payload itself
counts for nothing: typing it into a prompt, a marker in an untrusted log, or a marker elsewhere on a long JSON
line exempts nothing; only a reviewed, committed source line does. Values reach `git grep` through a 600 temp
file, never argv. Private keys are never exemptable.

When a refusal fires, the message says: if that line is a synthetic fixture in source, mark the source line,
commit, and re-run; otherwise do the work inline. A removed fixture line in a diff, absent from `HEAD`, still
refuses.

### 4. Mark today's fixtures

- **cp:** add the marker to every remaining fixture line at HEAD (the census in the evidence file, about 60
  files, mostly the e2e test-account password), starting with `e2e/integration/migration-template.spec.ts` so
  new migration specs inherit it. Comment-only changes.
- **`~/.agents`:** mark the fixture lines in `delegate-gemini.test.sh`, `ask-model-effort.test.sh` and
  `ask-model-image.test.sh`. Refusal cases keep their payload values off marked committed lines, so they still
  refuse.

### Not changed

`/finish` Step 4b and the receipt: the fallback rules stay as written; there will simply be fewer refusals.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A real credential is committed on a marked line, then sent | ACCEPT | Takes a deliberate commit of a secret labelled as a fixture, which stays in history; in cp gitleaks already honours the marker, so the commit is headed for a public repo anyway. `~/.agents` and the private repo run no gitleaks, so there the commit is the only record. Not reachable by editing a payload. |
| An agent under pressure commits a real secret with the marker to get its review | MITIGATE | The refusal message says synthetic fixtures only; the commit is a reviewed diff that `/finish` reviewers see. |
| A body rule drops a real key shape | MITIGATE | Recall harness (runtime-generated keys × leak contexts × wrappers: diff added/removed, quote, CRLF, ANSI, `\u000a`, URL userinfo, slash-joined, escaped JSONL), committed with the suite; v1 and v2 compared case by case, 0 regressions required. |
| A key whose body after `sk-` is lowercase letters and dashes only | ACCEPT | No issued key has that shape; it is the exact shape of the false positives. |
| `Authorization: Bearer <value>` with no colon is not caught (v1 does not catch it either) | DEFER | A recall widening, not this spec's question; filed to the task inbox for a separate measurement. |

**Non-Goals**
- Do NOT replace refusal with redaction (see Alternatives).
- Do NOT exempt fixtures by vocabulary (`test`, `fake`, `mock` in the value) or by file path.
- Do NOT touch Codex (it reads files itself; it has no payload scan) or the `--review` secret-file-name refusal.
- Do NOT change `/finish`, `review_receipt.py` or the spec-review roster.
- Do NOT widen recall in this spec.

## Done-When

- [ ] The wrapper suite (`~/.agents/bin/delegate-gemini.test.sh`) passes, including: every existing refusal case
      still refuses (the bare-header private-key case becomes header-plus-body, plus a header-only case that
      passes); one passing case per structural false-positive class above; the marker cases — committed marked
      fixture passes, marker typed only in the payload refuses, committed-but-unmarked refuses, staged-only
      refuses, marked private key refuses; a forced scan failure refuses with `rule=scan-error`; the refusal
      output names rule and line and never contains the value; and the suite fails when the old wrapper is
      pointed at it (`DG_SCRIPT` control), with at least the marker and false-positive cases failing there.
- [ ] Recall: the committed recall harness reports 0 regressions against v1 on five seeds, and reports
      regressions when pointed at the first, boundary-based design (the control).
- [ ] Precision: replaying all commit diffs from 2026-08-25 to 2026-11-24 in cp, `~/.agents` and the private
      repo, v2 refuses no commit that v1 passed, and refuses fewer than v1 in each repo; after the sweep, cp
      HEAD (tracked files, the closed-spec archive excluded), scanned both raw and as an added-lines diff, has
      no file that would refuse.
- [ ] `scripts/test-multi-harness-routing.sh`, `scripts/test-token-usage-refresh.py` (fed a new-format refused
      header) and the `~/.agents` `ask-model-effort` and `ask-model-image` suites still pass.
- [ ] This package's own `/finish` gets a valid Gemini run with no payload edit, although its tests carry
      secret-shaped fixtures (the falsifier recorded in decisions.md 2026-11-17).
- [ ] decisions.md records the answer to the 2026-11-17 open question, naming it as an agent choice under the
      founder's 2026-11-24 instruction, open to founder reversal.

## Alternatives Considered

- **No change.** Rejected: 36 refusals in 14 cp sessions since the last tightening and two packages held, every
  code-review one a false positive, against zero credentials caught in code review.
- **Redact matches and send the rest.** Rejected: refusal protects the unmatched secret next to a matched one.
  Example: the access-key-id shape refuses, but the secret key on the next line is named in a way the
  assignment rule does not catch; redaction would send it.
- **Exempt values containing fixture words.** Rejected: staging and test-account passwords often start with
  exactly those words, it reverses the deliberate 2026-10-23 case that a fixture-shaped quoted value refuses,
  and nobody can audit which lines it let through.
- **A marker read from the payload line.** The first design. Rejected in review: the payload is agent-authored,
  so the marker would be a free pass for anything an agent or an injected log typed it next to.
- **Exempt test directories.** Rejected: review payloads are diffs and prose, not paths, and test files are
  where real staging credentials get hardcoded.
- **Generate fixtures at test time.** A good per-test option, but as the general fix it rewrites about 60 files'
  logic; the marker is uniform and already the repo's convention.
- **Remove the scan.** Rejected: it refuses real credentials in bulk delegation (private corpus).

## Rollback Strategy

Revert the single `~/.agents` commit; the v1 scan returns. The cp markers are comments and can stay.

## Related

- [P1630](done/2026-06-10/p1630_glm_extra_reviewer_in_finish_and_receipt_floor.md) — GLM shares this scan.
- decisions.md 2026-11-17 [process] "A package with no valid Gemini or Codex run is held".
- pp `tasks/done/p67_model_wrappers_any_model_strip_gemini_gate.md` — the scan's last redesign.
