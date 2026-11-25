---
status: all-done
type: task
rank: 356
workstream: infrastructure
created_date: '2026-11-24'
tags: [review, ask-model, credential-scan, finish]
disclosure: public
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
spec_review_hash: 608d418a9bea1b75663ced06e36944317c5aac79a93cb0eab0fc328d15c89394
spec_review_vendors: [gemini, openrouter]
completed_at: 2026-11-25
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
  value that is only a variable reference (which includes a single-case, letters-only string written as one,
  since it cannot be told from a name); a vendor prefix in the wrong case (real keys have one case); and a
  generic assignment value committed at HEAD on a line its author marked as a fixture.
- An issued-credential shape (private key, vendor prefix, non-public JWT) is never exemptable, by marker or
  otherwise.

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
- **Private keys:** a `BEGIN` or `END … PRIVATE KEY` marker refuses when the 1,000 characters on either side
  of it hold 40+ characters of key body. Body is counted three ways. A run or block counts only when it
  reads as random base64 (upper case, lower case and a digit) or begins a key structure (below):
  - runs of 40+ base64 characters that are not inside an assignment value, which the assignment rules judge;
  - blocks of consecutive lines that each carry one run of 12 to 39 base64 characters, two or more lines; a
    line of 40+ that a single space split is a block of its own, so lines failing the test cannot dilute a
    body beside them. Lines inside an assignment value are judged with the value;
  - assignment values that are key body: a whole key structure, or, when any value in the window or any
    base64 token of one (`base64:<body>`) begins one, every value in the window, in any order.

  Lines split at LF, CRLF and CR, and at the JSON escapes `\n`, `\r`, `\u000a` and `\u000d`. A base64
  character written as a JSON escape (`\/` from PHP's `json_encode`, `+`, `/`) counts as that
  character.

  A folded line is defined by shape, not by a list of prefixes. The line's last run that holds a letter or
  digit is the body piece, else the first run of 12+ followed by a comment of any words (`/* 3 */`,
  `// autogenerated`). Only
  residue may come before it: anything but letters and digits, so any comment, quote, diff or
  concatenation mark. Before the residue there may be a line number as `cat -n`, `grep -n`, `rg -n`
  (`path:N:`), `grep -C` (`path-N-`) or an editor (`N→`) prints it. A line with no letter or digit (`" +`,
  a lone quote, an empty line) does not end a block. Lines over 256 characters are not folded lines.

  A key structure is a DER SEQUENCE whose declared length covers the bytes exactly, or the OpenSSH key
  magic (`key_der`, for a whole value). A value *begins* one (`key_start`) when, at one of its first three
  characters, it carries the OpenSSH magic or a private key's DER head: a SEQUENCE whose length is in
  shortest form (32+ bytes in short form, 128+ in long form), then the version INTEGER 0 or 1, or an
  AlgorithmIdentifier (a SEQUENCE opening with an OID, as an encrypted key does). All-caps words and
  base64 of zeros also begin `30 81`, `30 82` or `30 30`; they do not continue that way. 87 of 87 real
  keys begin one (openssl and ssh-keygen formats, plain and encrypted). This is what keeps a short Ed25519 or X25519 body counted when
  its random part happens to fail the randomness test (about 2% of them), and what makes a body split
  over several marked assignments count. `\n` and `\r` escapes are removed from a value first. On
  200,000 random base64 strings of 40 to 200 characters, 2 pass the whole-structure test.

  So a body before or after the marker, far from it, behind armor headers, folded at 12 columns or wider, or
  written whole as `secret = "<body>"` refuses, even when that value is a marked, committed fixture. A marker in code or prose passes, because an import list, a camelCase identifier or a long
  lowercase path is not a body. (The first round used runs of 12+ characters anywhere in the window. The
  2026-11-25 review showed that this refused key-handling code with no key in it.)
- **JWTs:** a token whose payload is exactly the anon key's claim set passes, quoted or unquoted, in prose or
  as an assignment value. The claim set is `iss` = `supabase`, `role` = `anon`, a `ref` of 20 lower-case
  letters, and optional integer `iat` and `exp`. Every one of these refuses: a decode error, a duplicate key,
  any other claim (`sub`, `scope`, …), any other issuer, or a non-integer time.

  This is a family of tokens, not one key, and that is consistent with the invariant. A token with this
  claim set is either signed with a project's secret, which makes it that project's public anon key, or not
  validly signed, which makes it no credential at all. The scan cannot check signatures, and does not need to.
- **Assignments:** a value that is only a reference passes: `${NAME}`, `$UPPER_NAME`, `{NAME}`, `<name>`,
  `env(NAME)`, and `${NAME:-default}` when the default is empty or another reference. A literal default is
  judged as part of the whole value, as v1 judged it, so a short real password as the default still refuses. A name is how people write identifiers:
  snake_case, SCREAMING_CASE or camelCase words of at most 12 letters, with at most two trailing digits
  (`<phrase>` allows spaces and dashes between words of one case). Mixed case inside a word is not a name, so a
  random mixed-case string inside `$`, `{}`, `<>` or `env()` is still judged as a value and refuses. A
  single-case, letters-only string in that syntax passes: it is a name by every test available (Risks). There is no placeholder exemption: a `YOUR_API_KEY`-style value that trips the entropy
  rule is marked in source like any fixture.

### 3. Fixtures are declared in committed source, with the marker the repo already uses

The marker `gitleaks:allow` is honoured by cp's pre-commit gitleaks check and its CI secret scan, and is already
on 54 cp files. A matched value is exempt only when that **exact value appears, whole, in a file tracked at
`HEAD` of the repository `ask-model` runs in, on a line that carries the marker**. Whole means the assignment
rule itself, run over the marked line from every keyword position, extracts exactly that value there: an
arbitrary slice of a longer marked value exempts nothing, and neither does a value on a marked line with no
assignment keyword before it. One case follows from "every keyword position" and is accepted: a value that a
keyword itself delimits inside a longer marked value (`…&password=<v>&…` in a marked URL) is attested,
because that exact value is already committed on a line its author marked (2026-11-25 review). The marker in the payload itself
counts for nothing: typing it into a prompt, a marker in an untrusted log, or a marker elsewhere on a long JSON
line exempts nothing; only a reviewed, committed source line does. git is asked only for the marked lines at `HEAD`, so no
candidate value leaves the scan process; every inherited `GIT_*` variable is dropped first, so `GIT_DIR` cannot
point the lookup at another repository. git failures are classified:
- no repository, or an unborn `HEAD` (a new repo with no commit), attests nothing, and the match refuses
  under its own rule;
- a `HEAD` that names a missing or broken commit, a lookup that fails after `HEAD` resolves, and any stderr
  line other than git's `hint:` lines all refuse as `scan-error`.

Marked lines are split on `\n` and `\r` only, so a byte such as 0x85 inside a line cannot split a value,
and in a CR-only file a marker covers its own CR-delimited line, not the whole file. git runs with
`LC_ALL=C`, so a localized git cannot change the messages the scan classifies.

**Only generic assignment values are exemptable.** The trust anchor is whatever repository the caller runs in,
and a caller can create one. That is tolerable for an `api_key = "…"` value, which is ambiguous by nature, but
not for a shape that only issued credentials have: private keys, vendor prefixes and non-public JWTs refuse
even when marked and committed. A test that needs one builds it at run time (as the `~/.agents` suites and
`scripts/test-multi-harness-routing.sh` now do), so no such literal sits in committed source.

When a refusal fires, the message depends on the rule. For an `assign-*` rule: if that line is a synthetic
fixture in source, mark the source line, commit, and re-run; for any other rule: that shape is never exempt, so
build the fixture at run time; in both cases, otherwise do the work inline. A removed fixture line in a diff, absent from `HEAD`, still
refuses.

### 4. Mark today's fixtures

- **cp:** mark the fixture lines that remain at HEAD. The 2026-11-24 census found 66 refusing files, but
  attestation is by value across the whole repository, so one marked line per distinct fixture value clears
  every file that repeats it. Most of the 66 carry the shared e2e test-account password, which was already
  marked in other committed files. Shipped (verified by the HEAD scan in Done-When):
  - 16 files changed;
  - 12 gain a trailing marker comment and nothing else;
  - 4 are rewritten so they hold no committed issued-credential literal, because such a literal can never be
    exempted (§3), with the value preserved in three of them:
    - `e2e/p719-reproduce.spec.ts` joins its non-anon JWT from parts;
    - `scripts/audit-credential-drift.test.sh` writes its fixture with `echo` lines, producing a
      byte-identical file;
    - `scripts/test-multi-harness-routing.sh` builds a random key id at run time and asserts the refusal
      names `rule=aws-key-id`;
    - `scripts/test-token-usage-refresh.py` gains a case for the new refused-header format.
  
  `e2e/integration/migration-template.spec.ts` needed no change: its password value is attested by marked
  lines elsewhere.
- **`~/.agents`:** mark the fixture lines in `delegate-gemini.test.sh`, `ask-model-effort.test.sh` and
  `ask-model-image.test.sh`, and build vendor-shaped fixtures at run time. Refusal cases keep their payload
  values off marked committed lines, so they still refuse.
- **The transition costs one review round.** A diff that *removes* an issued-credential literal still
  carries it on the removed line. This package's own cp diff does that (`e2e/p719-reproduce.spec.ts`), so
  Gemini and GLM refused it, by design. Codex and Opus reviewed it. Once this lands, later diffs no longer
  contain the literal.

### Not changed

`/finish` Step 4b and the receipt: the fallback rules stay as written; there will simply be fewer refusals.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A real generic credential (an assignment value) is committed on a marked line, then sent | ACCEPT | Vendor-shaped keys and JWTs cannot be exempted this way (§3); what remains takes a deliberate commit of a secret labelled as a fixture, which stays in history; in cp gitleaks already honours the marker, so the commit is headed for a public repo anyway. `~/.agents` and the private repo run no gitleaks, so there the commit is the only record. Not reachable by editing a payload. |
| An agent under pressure commits a real secret with the marker to get its review | MITIGATE | The refusal message says synthetic fixtures only; the commit is a reviewed diff that `/finish` reviewers see. |
| A body rule drops a real key shape | MITIGATE | Recall harness (runtime-generated keys × leak contexts × wrappers: diff added/removed, quote, CRLF, ANSI, `\u000a`, URL userinfo, slash-joined, escaped JSONL), committed with the suite; v1 and v2 compared case by case, 0 regressions required. |
| A caller creates a throwaway repo, commits a marked value there and runs `ask-model` from it | ACCEPT (assignment values only) | Found by the 2026-11-24 security review. Closed for issued-credential shapes by making them never exemptable (suite M6, M7). For a generic assignment value it stays open: the scan cannot tell a project repo from a throwaway one without a configured allowlist, and it takes a deliberate act no payload edit can perform. |
| A random mixed-case string written inside `{}`, `<>` or `env()` passes as a reference | MITIGATE | Same review. Names must be snake, SCREAMING or camel case; on 15,000 random mixed-case letter-words in those wrappers, 0 pass. An entropy check on the inner name was measured and rejected: real names score 3.17–3.94 bits, overlapping random words. |
| A single-case, letters-only secret written as `$NAME`, `{name}`, `<name>` or `env(NAME)` passes | ACCEPT | Found by the 2026-11-25 build review (Codex, Opus). Nothing in the string separates it from a name: a word-likeness test (a vowel per segment, no run of 4+ consonants) still let 14,155 of 20,000 random four-segment upper-case strings through, so it was not shipped. No issued credential has this shape (they carry mixed case, digits or a prefix); what remains is a human-chosen letters-only password typed in variable syntax. |
| A private-key body folded under 40 columns, far from its header, or before it | MITIGATE | Same review. Both markers are checked and line blocks count as body (§2). Recall-harness rows cover bodies folded at 12, 16 and 32 columns, a JSON-escaped body folded at 32, a body folded with a diff-context space, a far body and a body before its header. |
| Key-handling code near a header string is refused as if it held a key | MITIGATE | 2026-11-25 second review (Opus, Codex): the first body rule counted any 12+ character run, so import lists and identifiers added up to 40. Now only runs of 40+ characters outside assignment values, or blocks of pure base64 lines, count, and each must read as random. Opus's precision probes all pass, and suite case `pemcode` holds the line. |
| A private-key body folded under 12 columns, grouped with spaces, truncated far from its header, or broken by a soft hyphen | ACCEPT | Same review. v1 refused all four; v2 passes them. Standard PEM output folds at 64 columns, and these shapes take deliberate mangling. A key mangled like that has to be reassembled before anyone can use it. |
| A short password as a `${NAME:-…}` default passes (too few characters for entropy) | MITIGATE | Same review. A literal default is judged with the whole value (§2); recall-harness row `short_default`. |
| Attestation trusts a substring of a marked value, or an inherited `GIT_DIR` | MITIGATE | Same review. Whole-value match, `GIT_*` dropped, suite cases M8 and M9. A `git` placed first on `PATH` by the caller is ACCEPTED: whoever controls the caller's `PATH` controls the wrapper and `python3` too. |
| Bytes 0x85 and 0xA0 inside UTF-8 letters read as whitespace in latin-1 and cut a value short | MITIGATE | Same review; present in v1 too. A value ends only at ASCII whitespace or a quote. Unicode spaces count only between keyword and value, matched as whole UTF-8 sequences. |
| A crafted payload makes the scan slow, or many candidates time `git grep` out | MITIGATE | Same review: 6.95 s for a 2 MB pathological header payload in the first build. The final review round (Opus) found two more: a dot-free run of `eyJ` made the JWT rule quadratic (17.2 s for 240 kB on e16d711), and packed headers with folded blocks took up to 6.3 s per 2 MB because each header re-walked its window. Now runs and folded blocks are scored once over the merged header windows and summed with prefix sums, and the JWT rule starts only at a run's beginning. Measured on the final build: 0.04 s for that 240 kB `eyJ` run, and at most 1.0 s for every 2 MB crafted payload tried (packed headers, folded blocks, assignments after headers, punctuation lines, escaped slashes). The folded-line parse is linear (a single-regex version backtracked quadratically). git is asked once for marked lines, whatever the candidate count. |
| A key body split over several marked assignments, a short Ed25519 body that fails the randomness test, a body with CR-only breaks, `\u000a` or `\/` escapes, a trailing comment per line, `grep -C` prefixes, empty lines between its lines or a stray space inside a line passes; in a CR-only committed file one marker attests every value | MITIGATE | Final review round, 2026-11-25 (Gemini, GLM, Opus). All were reproduced; v1 refused the body shapes, and the CR-only marker scope broke the "marked line" rule. Fixed by `key_start` and the line grammar in §2, and by splitting marked lines on `\r`. Suite cases M16 and its M16b control at 32 and 64 columns, M17, `cr32`, `trail32`, `space64` and the Ed25519 case, plus ten recall rows. The e16d711 scan fails 34 suite checks. |
| After the final round's fixes: hex lines next to a short folded body dilute it; all-caps paths, constants or base64 of zeros read as a key's start beside a header-only line; a split body written bottom to top, or a marked `base64:<body>` value, passes; a comment of words after each folded line hides the body; an Ed25519 body inside `cat -n` output inside JSON passes; an attested escaped fixture beside a header-only line refuses; then, from the fix itself, a small key encrypted under PBES1 split over marked assignments and `grep -n` output whose path holds `--` or `%` pass | MITIGATE | Reviews of `~/.agents` 6d8e9a1 and 2d53e2a, 2026-11-25 (Gemini, Opus). Gemini's runs stopped at the output limit, so each of its claims was reproduced by probe before it was fixed, and one of four claims on 2d53e2a did not reproduce. `key_start` now reads a private key's DER head (shortest-form length, then the version or an AlgorithmIdentifier): 87 of 87 real keys (openssl PKCS#8, traditional, PBES1, PBES2 and scrypt across RSA, EC, Ed25519, X25519, Ed448, X448; DSA; ssh-keygen), and 0 of 270,000 all-caps, `M`-led and random strings. Suite cases `hexfold`, `words32`, `path32`, `catnjson`, `grepdash`, `greppct`, M18–M20, `capsnear` and `zerosnear`, plus eight recall rows. The 6d8e9a1 scan fails 34 suite checks and 130 recall cases. |
| After 5570144: a marked value whose key body follows a prefix and an escaped newline (`v1.0\u000a<body>`, `kid=a\u000a<body>`) or is folded at 12 after `base64:` passes; `grep -n` output whose path holds `--` over body lines that each carry a comment passes; an encrypted traditional key (`Proc-Type`/`DEK-Info`) whose ciphertext is a marked value passes; a one-line body glued to `///` or `+++` passes 3–4% of the time | MITIGATE | Review of 5570144, 2026-11-25 (Opus adversary; all four reproduced by re-running its probes against both builds). Fixed in `~/.agents` 983bc34: a value is cut at its newlines, written or escaped, and a token ending a line runs on into the next; commented runs are tried from the end; a `DEK-Info` line in the window makes every value whose base64 looks random key body (66288db, after the Codex review of 983bc34 found that counting every value refused an identifier, `password = default_password_for_…`, in key-parser code; suite case `deknear`); `key_start` also strips a leading run of `+` and `/`. Suite cases M21a–c, `grepcmt`, M22 and `glued`, plus three recall rows; the 5570144 scan fails exactly those 20 suite checks and 75 recall cases. Real keys 84 of 84, glued forms included (5570144: 0 of 84 glued); 0 of 270,000 strings. An encrypted body split over marked assignments of 16 to 64 characters refuses 250 of 250 at each width under 66288db (with the `DEK-Info` line removed, 0 of 60: the line is what refuses them), which refutes the Gemini review of 66288db's claim that short random chunks escape. The same round's Gemini run claimed two HIGH gaps (a long-form PBES2 or scrypt head; a triple-quoted body folded at 12–39 columns); neither reproduced (all 12 real encrypted keys and every width refuse). |
| An attested random fixture within 1,000 characters of a key header and a `DEK-Info` line refuses | ACCEPT | Review of 983bc34 (Gemini; its exact input did not reproduce, a variant with a real `secret =` assignment did; an identifier or other non-random value no longer counts, 66288db). A precision loss that fails closed: ciphertext is random, so an encrypted body cannot be told from a random fixture by content. The cp HEAD census, the 83,954-payload corpus and the commit replay contain no instance. |
| A digit run followed by a UTF-8 letter, or by a byte 0x1c–0x1f, is judged as a word, not as digits | MITIGATE | Final review round (Opus): v1 stopped the digit run at byte 0x85 or 0xA0 inside the letter and refused it as digits. The digits rule now matches that; recall rows `digits_letter`, `digits_colon_letter` and, for the 0x1c–0x1f bytes v1 also read as whitespace (Gemini review of 2d53e2a), `digits_sep`. |
| A key body split over marked assignments without the part that begins the key, or with only the END marker in view, passes | ACCEPT | Reviews of 6d8e9a1 (Gemini). Without the part that carries the key's DER head the remaining pieces are random base64, indistinguishable from the marked fixtures §3 exists to pass, and the key cannot be used without the missing part. Same class as the truncated-body row above. |
| A list of random 12+ character IDs with trailing comments, blank lines or single spaces beside a header-only line refuses; a marked fixture with a CR inside its separator is no longer attested | ACCEPT | Review of 6d8e9a1 (Opus). Both are precision losses that fail closed. On 41,977 payloads built from every tracked text file in cp and `~/.agents`, with a header-only key line inserted every 40 lines, the final scan refuses exactly one that the e16d711 scan passed (cp's `.gitleaks.toml` with an inserted header line). |
| A private-key body folded inside `git blame` output, in `echo "…" >> file` lines, or with HTML `<br>` breaks passes | ACCEPT | Final review round (Opus). Each needs the body read back out of a tool's decoration, and a key in that form has to be reassembled by hand before use. Covering them would mean a grammar per tool, which is the prefix list §2 replaced. |
| The header and signature parts of a JWT whose claims are exactly the anon set are not judged, so they could carry other data | ACCEPT | Final review round (Opus). The scan's question is whether a credential leaves, and a token with the anon claim set is either the public anon key or not validly signed (§2). Hiding data in a token's header takes a deliberate act no accidental leak performs. |
| A long marked line in the repo makes attestation slow; a minified one-line file with a marker attests every assignment on it | ACCEPT | Final review round (Opus). Both need a committed, marked line in the caller's own repository, which is already the trust anchor (§3). |
| An unquoted public anon JWT is refused | MITIGATE | Second review (Sonnet): the unquoted value class stopped at the first dot. An unquoted value that starts `eyJ` is now taken whole; suite cases `anonu` and `anonu2`. |
| A forged token carries the anon claim set with a duplicate key or a non-integer time | MITIGATE | Second review (Codex): duplicate keys refuse, and so does a non-integer `iat`/`exp`; suite cases `jwtdup` and `jwtexp`. A token with the exact claim set is either a project's anon key or unsigned (§2). |
| A broken or missing `HEAD` commit is reported as a credential with the "mark the fixture" hint | MITIGATE | Second review (Gemini): a missing commit and a dangling ref refuse as `scan-error`, while an unborn repo attests nothing; suite cases M11 and M11b. |
| 0x85 or 0x1c–0x1f inside a marked line split it, or a separator byte or Unicode space between keyword and value hides an assignment | MITIGATE | Second review (Opus and others): marked lines are split on `\n` only. Between keyword and value, whitespace is what v1 counted: v1 read the payload as latin-1 and matched Unicode `\s`, so ASCII whitespace, 0x1c–0x1f, and raw 0x85 and 0xA0 bytes. The UTF-8 encodings of the Unicode spaces (NBSP, NEL, U+2000–200A, U+3000) are added beyond v1, which never matched them. Values stay ASCII-delimited. Suite case M12; recall rows `raw_nel_sep`, `raw_nbsp_sep`, `raw_nbsp_key` (parity) and `nbsp_sep`, `emsp_sep`, `nel_sep`, `ideo_sep`, `fs_sep`. |
| Benign git stderr (`hint:` lines) turns every attestation into `scan-error` | MITIGATE | Second review (GLM, Opus): `hint:` lines are ignored, and any other stderr still refuses. |
| A value that a keyword delimits inside a longer marked value is attested | ACCEPT | Second review (Opus). This follows from extracting at every keyword position (§3), and the value is already committed on a marked line. |
| A lowercase word as a literal default (`${X:-postgres}`) still refuses | ACCEPT | Same verdict as v1. The scan finds no instance in cp or `~/.agents`, and judging the default with the whole value is what keeps short real passwords refused. |
| The repo's `fsmonitor` hook runs when the scan calls git | ACCEPT | Raised by Gemini in the second review and checked: `git grep` on a tree does not invoke fsmonitor (only `git status` did), and whoever controls the repo's config already controls its hooks. |
| A one-line key body written as an assignment value is attested as a marked fixture and sent; a folded body behind comment prefixes, `cat -n` numbers or string concatenation passes | MITIGATE | Automated security review of `~/.agents` 7d0f57a. Both were reproduced and both were violations: the first broke the never-exemptable invariant, and v1 refused the second. Fixed by `key_der` and the wider line grammar (§2). Suite cases M14, the M14b control, `hash16`, `slash32`, `star32`, `catn16`, `jscat32` and `pycat32` cover them, plus six recall rows. |
| A key body as one quoted value whose 64-column lines are joined by `\n` escapes is attested and sent; a folded body printed by `grep -n`, `rg -n` or an editor, or behind `%` comments, passes | MITIGATE | Automated security review of `~/.agents` 1ac8be1. All reproduced, and v1 refused all of them. Fixed by removing escapes before `key_der` and by defining a folded line by shape rather than by a prefix list (§2). Suite cases M15, the M15b control, `grepn16`, `rgn16`, `arrow16` and `pct16`, plus four recall rows. The 1ac8be1 scan fails 27 suite checks. |
| A key whose body after `sk-` is lowercase letters and dashes only | ACCEPT | No issued key has that shape; it is the exact shape of the false positives. |
| `Authorization: Bearer <value>` with no colon is not caught (v1 does not catch it either) | DEFER | A recall widening, not this spec's question; filed to the task inbox for a separate measurement. |

**Non-Goals**
- Do NOT replace refusal with redaction (see Alternatives).
- Do NOT exempt fixtures by vocabulary (`test`, `fake`, `mock` in the value) or by file path.
- Do NOT touch Codex (it reads files itself; it has no payload scan) or the `--review` secret-file-name refusal.
- Do NOT change `/finish`, `review_receipt.py` or the spec-review roster.
- Do NOT widen recall in this spec.

## Cost Budget

The scan itself is local. What this spec changes on a metered service is that review payloads the scan
used to refuse are now sent to Gemini (`gemini-4-carbon`, the review model) and to OpenRouter (GLM-5.3),
instead of falling back to Codex, which is not metered, or being reported missing. Registry rows: Gemini
API (Carbon pricing read on 2026-11-25) and OpenRouter.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | n/a: developer tooling, no product user | n/a: sends happen per review, not on a timer | 0. All three `~/.agents` suites replace the network with `ASK_MODEL_*_FAKE_RESPONSE` and synthetic keys; the recall harness and replay are local |
| Egress (bytes) | n/a | n/a | 0 |
| Log lines | n/a | n/a | One local delegation-log line per refused send (unchanged; local file, not metered) |
| Service unit x registry price | n/a | n/a | 0 |

Per restored review send, the arithmetic is:
- **Input.** The median refused payload is 28,551 bytes (125 refusal headers in the delegation log), which
  at 4 bytes per token is about 7,100 input tokens.
- **Output.** A measured Gemini review reply is about 11,100 bytes, or about 2,800 tokens. Thinking tokens
  are not reported at low effort, so the budget assumes 10,000 output tokens.
- **Gemini, at the 2026-12-01 Carbon price:** 7,100 x $4.00/1M = $0.028, plus 10,000 x $20.00/1M = $0.20,
  which is about $0.23.
- **GLM, at the dearest zero-retention host:** 7,100 x $2.10/1M = $0.015, plus 10,000 x $6.60/1M = $0.066,
  which is about $0.08.
- **Per restored review: about $0.31.**
- **The largest refused payload,** 2,389,834 bytes or about 600,000 tokens, costs at most
  600,000 x $4.00/1M + $0.20 = $2.60 on Gemini, plus 600,000 x $2.10/1M + $0.07 = $1.33 on GLM.

Monthly: restored sends per month x $0.31, where "restored sends per month" is at most the refused
review sends per month (read from the `REFUSED:SECRET` headers in the delegation log).

1. **Fits the plan limit today? Fits.** Neither row has a cap: Gemini paid tier is pay-per-token, and
   OpenRouter is a prepaid balance that fails closed when empty (GLM is then reported missing). Restored
   sends are at most the refused sends, 85 of about 3,500 third-party sends since 2026-09-01 (Problem §1),
   or 2.4%. So the change adds at most 2.4% to the review spend the founder accepted on 2026-11-19
   (decisions.md, "The Gemini code reviewer stays on Gemini 4 Carbon through its December price
   doubling").
2. **Fits at 10x? Fits.** Ten times the refusal rate adds at most 24% to that accepted spend, and the
   prepaid OpenRouter balance still caps GLM.
3. No upgrade needed. Rules 1 to 6: no bulk operation, no timer, no browser, no retry change (`ask-model`'s
   bounded retries are untouched), no error-driven control flow against a vendor, and 0 vendor calls per
   test run.

## Done-When

- [x] The wrapper suite (`~/.agents/bin/delegate-gemini.test.sh`) passes, including:
      - every existing refusal case still refuses. The bare-header private-key case becomes header plus
        body, plus a header-only case that passes.
      - one passing case per structural false-positive class above.
      - the marker cases:
        - a committed marked fixture passes;
        - a marker typed only in the payload refuses;
        - committed-but-unmarked refuses;
        - staged-only refuses;
        - a marked private key refuses, and so does a marked key body written as an assignment value
          (M14, with the M14b control), including one whose lines are joined by `\n` escapes (M15, M15b);
        - a marked vendor key and a marked service_role JWT refuse;
        - a slice of a marked value refuses;
        - an inherited `GIT_DIR` attests nothing;
        - a missing `HEAD` commit or a git failure after `HEAD` refuses as `scan-error`.
      - the public anon JWT passes, quoted and unquoted. An anon JWT with an extra claim, a duplicate key
        or a non-integer time refuses.
      - these refuse: a short `${NAME:-…}` default, and private keys folded at 12 columns, behind comment
        prefixes, in `cat -n`, `grep -n`, `rg -n` or editor-numbered output, or as string concatenation.
      - random mixed-case letters in `{}` and `<>` refuse.
      - a forced scan failure refuses with `rule=scan-error`.
      - the refusal output names rule and line and never contains the value.
      - the suite fails when pointed at the old wrapper (`DG_SCRIPT` control), and the marker and
        false-positive cases fail there.

      Evidence 2026-11-25 (final build, `~/.agents` 66288db, run from `~/.agents`): 671 passed, 0 failed.
      The 983bc34 scan fails the 2 `deknear` checks, the 5570144 scan the 20 checks added for its review, the 6d8e9a1 scan fails 34 of the earlier ones and the e16d711 scan 58, all from the last three review rounds'
      cases; each fix commit's new cases fail on the commit before it (2d53e2a fails 14). At
      e16d711 the pre-P1726 wrapper (`220087a^`) gave 401 passed and 149 failed, including 27 marker or
      attestation checks and 41 pass-or-sent checks.
- [x] Recall: the committed recall harness reports 0 regressions against v1 on five seeds, and reports
      regressions when pointed at the first, boundary-based design (the control).
      Evidence: 2,706 cases per seed, 0 regressions on seeds 1, 2, 3, 7 and 42 (983bc34 and 66288db). The boundary
      design (`3b43e1c`) gave 118; on the current rows the 5570144 scan regresses on 75 cases (all from the
      three rows added for its review); on the rows before them the 6d8e9a1 scan regressed on 130 and the
      e16d711 scan on 355. The previous build (1ac8be1) regresses on the raw-separator rows and the
      four new folded-body rows, which shows those rows can fail. The v1 oracle reads the same latin-1
      view as the candidate, as v1 itself did.
- [x] Precision: replaying all commit diffs since 2026-08-25 (all branches) in cp, `~/.agents` and the
      private repo, v2 refuses no commit that v1 passed, and refuses fewer than v1 in each repo. After
      the sweep, cp HEAD (tracked files, the closed-spec archive excluded), scanned both raw and as an
      added-lines diff, has no file that would refuse.
      Evidence: cp 52 → 36, `~/.agents` 20 → 8, private 10 → 7, and 0 commits refused by v2 that v1
      passed (re-run on 66288db; the corpus grows with every commit). The nine late fixes (seven review rounds, two security reviews) changed no verdict in the corpus (0 flips against each previous build). cp HEAD: 6,589 files, 0
      refusals, while a generated key outside the tree refuses. The branch's added lines: 0 refusals.
- [x] `scripts/test-multi-harness-routing.sh` and `scripts/test-token-usage-refresh.py` still pass. The
      first now asserts `rule=aws-key-id` on a random key id generated at run time; the second is fed a
      new-format refused header. So do the `~/.agents` suites: `ask-model-effort`, which includes the
      OpenRouter path refusing a key and a forced scan failure without sending, and `ask-model-image`.
      Evidence: routing 27/0, and the credential case exits 99 when the scan is forced to fail
      (gate 7). Token-usage: all passed. The 15 real new-format refusal headers in the delegation log
      parse as 0 calls, against 3 real sends parsed as 3. Effort 80/0, image 24/0 (both re-run on 66288db).
- [x] This package's own `/finish` gets a valid Gemini run with no payload edit, although its tests carry
      secret-shaped fixtures (the falsifier recorded in decisions.md 2026-11-17).
      Evidence: the final-round review prompt (55 kB, the e16d711 diff of all three `~/.agents` files with
      13 marked fixtures) is refused by the v1 scan, passed `delegate-gemini --check` unedited, and Gemini
      returned a valid run on it (`verified=served exit=0`). The three later prompts are also refused by
      v1 and passed by v2 unedited; those Gemini runs ended at the output limit, not at the scan. The reviews
      of 5570144, 983bc34 and 66288db passed the scan unedited and returned valid runs (`verified=served exit=0`).
- [x] decisions.md records the answer to the 2026-11-17 open question, naming it as an agent choice under the
      founder's 2026-11-24 instruction, open to founder reversal. Evidence: entry 2026-11-25 [process] "Secret-shaped
      test fixtures reach every reviewer…" (KDD commit 847f79b91), with a pointer line added to the 2026-11-17 entry.

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

Revert the P1726 commits in `~/.agents` (`git log --grep P1726`), newest first; the v1 scan returns. In cp, the 12
marker-only files can stay, and so can the three value-preserving rewrites. `scripts/test-multi-harness-routing.sh`
must be reverted with the scan, because it asserts the `rule=` refusal output, which v1 does not print. The new
case in `scripts/test-token-usage-refresh.py` only reads a header format, and it can stay.

## Related

- [P1630](p1630_glm_extra_reviewer_in_finish_and_receipt_floor.md) — GLM shares this scan.
- decisions.md 2026-11-17 [process] "A package with no valid Gemini or Codex run is held".
- pp `tasks/done/p67_model_wrappers_any_model_strip_gemini_gate.md` — the scan's last redesign.
