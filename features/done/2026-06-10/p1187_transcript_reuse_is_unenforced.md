---
status: all-done
type: task
rank: 84
workstream: infrastructure
created_date: '2026-08-28'
tags: [transcripts, caching, points-pipeline, correctness, storage]
pipeline_ran: [create-spec, dev, finish, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
completed_at: 2026-08-31
---

# P1187 — Expensive work is redone because reuse is a convention, not a mechanism: one artifact ledger every tool consults

> **Scope changed 2026-08-28 (founder).** This spec opened as "fix the transcript store." It is
> now "build the reuse ledger and move the check inside the tools." The narrow fix is a strict
> subset; building it first and generalising later would do the work twice, which is the defect
> being fixed. Original problem statement retained below as Evidence.

## Problem

**Situation.** This pipeline repeatedly performs work that is slow, paid, or rate-limited: caption
fetches, audio downloads, speaker-labelled transcription, and (planned) model-run verification of
those transcripts. [P1140](p1140_transcript_retention_for_quote_reverification.md)
built a store for one of these so a published quote stays re-verifiable against the **exact bytes**
it was checked against.

**Complication.** Reuse is enforced nowhere. Measured 2026-08-27/28:

| Operation | Store | Reuse today |
|---|---|---|
| Caption fetch | `~/.local/share/yt-store/` | Consulted by the `yt` wrapper; served **zero** hits across ~15 fetches over two sessions |
| Speaker-labelling | `~/.local/share/diarize-store/` | **None.** `grep -n "store" ~/.agents/bin/diarize` returns only argparse `store_true`. Rescued by hand; the script neither reads nor writes it |
| Audio download | *none* | Every download repeats. ~40 min of downloading in one session; IP-gated |
| Verification pass over a transcript | *none* | Not built yet, and will inherit the same gap |

**The founder's framing is the requirement, verbatim:**

> *"If there is a risk that work can be redone again, then all agent skills need to know to go
> through a bottleneck and check. If YTDOT already transcribed something, no need to transcribe
> again. If I want to download audio, I need to check if we already downloaded it. If I want to
> diarize it, I want to check if we diarized it... how do we enforce it programmatically so that it
> actually happens and we don't hope that they do it."*

and, on scope:

> *"maybe this is bigger than just transcripts and audio... maybe this is our storage... there
> should be like a collection, a storage, and now it's a strategy how we do that, so we don't repeat
> actions."*

**Root cause — corrected 2026-08-28 by adversarial review, supersedes v1.** v1 blamed an `-o`
template shape and a `sub_langs` key mismatch. **Neither was ever reached.** The installed command is
a symlink:

```
~/.local/bin/yt -> pp/scripts/yt
```

but `scripts/yt:40` derives its own directory from `BASH_SOURCE[0]`, which stays the **symlink** path
and is never resolved. So `STORE_LIB` resolves to `~/.local/bin/yt-store-lib.py`, which does not
exist. Proven at runtime:

```
$ bash -x "$(command -v yt)" --version   → STORE_LIB=~/.local/bin/yt-store-lib.py
$ test -e ~/.local/bin/yt-store-lib.py   → exit 1
$ python3 ~/.local/bin/yt-store-lib.py try ...
  can't open file '.../.local/bin/yt-store-lib.py': [Errno 2] No such file or directory
```

That error is captured into `$STORE_ERR` and discarded; `save` is `|| true`. **The store is
split-brain: it works when invoked by repo path and is silently absent when invoked as `yt`** — which
is what every skill and `readfirst/server.mjs:56` (`YT_DLP || "yt"`) does. This is why the store holds
15 entries (written by repo-path callers) while serving the pipeline zero hits.

v1's causes 2 and 3 are now **UNPROVEN** and must be re-tested only after this is fixed.

**Second root cause — reuse is caller-remembered.** `diarize`'s own skill file names writing the store
as "the fix" and it was never done. A convention each new skill must remember is not a mechanism.
**The check must live inside the tool that spends.**

**Third root cause — every refusal is computed and discarded.** `yt:120` redirects the store control
line (`HIT`/`MISS`/`NOCACHE <reason>`) into a temp file never shown. Surfacing it would have exposed
all of the above on the first fetch.

## Appetite

Blast radius **high**. A wrong match serves one video's transcript as another's, silently, into
quote verification — and this pipeline publishes verbatim quotes under real people's names.
Reversibility: high for code (`git revert` → "always do the work", degraded but safe); **nil** for a
misattributed quote already published.

## Invariants

- **A quote must remain re-verifiable against the exact bytes it was verified against.** P1140's
  purpose; survives any redesign here.
- **Correctness before hit-rate. A store that misses is an expense; a store that lies is a published
  misattribution.** Where they conflict, miss.
- **Both caption tracks are retained, never one.** `decisions.md` 2026-08-25 measured that *"the raw
  caption file returns 0 hits for a genuine quote in every case"* — raw carries timecodes and turn
  boundaries, cleaned is what `grep -F` can search. Storing one is storing neither.
- **No skill may call the ledger directly.** Reuse is obtained by calling a wrapped tool. A new
  expensive operation earns a wrapper, never a paragraph of instructions.

## Solution

> Revised against an adversarial review (Codex GPT-5.6-Sol, max reasoning). 9 findings, 8 confirmed
> by command; the verification ledger is in Evidence. Every subsection below carries the finding it
> answers.

### 0. Fix the split-brain first — it gates everything (F7)

`scripts/yt` must resolve its own real path before deriving its directory, so the symlinked
`~/.local/bin/yt` finds the library. Until this lands, no reuse work is testable through the
command the pipeline actually calls.

**Test both spellings, always.** Every Done-When below runs against `command -v yt`, not the repo
path. A test suite that invokes `scripts/yt` passes while the installed command stays permanently
cold — the exact blind spot that hid this for weeks.

### 1. One ledger, many stores

A single SQLite index at `~/.local/share/agent-store/index.db` answers one question: *has this
precise work been done, and where are the bytes?* The **bytes stay as ordinary files** in the
existing per-kind directories. `sqlite3` is stdlib — verified 3.53.4, no install.

**One index, not several.** A single place to ask is the whole value; two indexes recreate today's
defect. "Multiple" is right for the *bytes*, wrong for the *question*.

### 2. Schema — revisions and multi-output artifacts (F2, F4)

A request does **not** resolve to a file. It resolves to an immutable **revision** that owns every
output member. This is forced by two confirmed defects: one caption fetch already produces two files
(`en.vtt` **and** `en-orig.vtt` — verified in a live manifest), and `INSERT OR IGNORE` silently
retains stale bytes when a refresh returns different ones.

```sql
CREATE TABLE revisions (
  revision_id  INTEGER PRIMARY KEY,
  source_kind  TEXT NOT NULL,      -- 'youtube' | 'file' | 'url'
  source_id    TEXT NOT NULL,      -- video id (VALIDATED, see §4); content-hash for local files
  operation    TEXT NOT NULL,      -- 'captions' | 'audio' | 'diarize' | 'diarize_verify'
  params_json  TEXT NOT NULL,      -- canonical JSON of EVERY parameter affecting the result
  params_hash  TEXT NOT NULL,      -- sha256(params_json) — index only, never the decision
  tool TEXT NOT NULL, tool_version TEXT, model TEXT,
  exit_code    INTEGER NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE TABLE outputs (                    -- every member of one revision
  revision_id  INTEGER NOT NULL REFERENCES revisions(revision_id),
  role         TEXT NOT NULL,             -- 'en', 'en-orig', 'info_json', 'audio', ...
  path         TEXT NOT NULL,
  bytes_sha256 TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  PRIMARY KEY (revision_id, role)
);

CREATE TABLE current (                    -- which revision a request resolves to NOW
  source_kind TEXT NOT NULL, source_id TEXT NOT NULL,
  operation TEXT NOT NULL, params_hash TEXT NOT NULL,
  revision_id INTEGER NOT NULL REFERENCES revisions(revision_id),
  PRIMARY KEY (source_kind, source_id, operation, params_hash)
) WITHOUT ROWID;
```

**Divergent results never lose (F2).** A refresh writes a **new revision** and moves the `current`
pointer with `INSERT ... ON CONFLICT DO UPDATE`. Old revisions stay readable, so a quote verified
against superseded bytes is still checkable. `INSERT OR IGNORE` is banned — it made the last writer's
bytes vanish while the caller had already received them.

**Concurrency (F2).** A writer that loses the pointer race must resolve the winning revision and
deliver **those** bytes to its caller, or fail loudly. It must never return bytes the ledger does not
record.

### 3. The lookup contract — Open Question 1, answered

**Cache on one axis, safety artifact on the other.** The lib's current *"fail open, always"* reads as
covering both and covers only the first.

| Question | Posture | Cost of being wrong |
|---|---|---|
| *Should I consult the ledger at all?* | **Fail OPEN.** Cannot canonicalize → do the work | One repeated fetch |
| *Is this revision the same work?* | **Fail CLOSED.** Exact key match **and** byte-equal `params_json` **and** every `outputs` row verified. Never the hash alone, never a subset | **A published misattribution** |

Resolves `decisions.md` **2026-08-16** — empty is permissive on axis 1 where that is safe, and is not
permissive on axis 2 where it is not.

**Verify the whole set, then deliver from what you verified (F3, F4).**

- **All members or MISS.** A revision hits only when *every* `outputs` row is present and hashes
  correct. Verifying one member leaves the others unguarded.
- **No hash-then-reopen.** The current lib hashes at `:252` and copies at `:338` — two separate opens,
  so a concurrent replace between them delivers bytes that were never verified. Hash and deliver from
  the **same** open file, or hash a private snapshot and deliver that snapshot.
- **Write the revision row last**, after bytes land and hash. A crashed run leaves no row.
- A revision failing verification is treated as absent and its pointer dropped.

### 4. Key derivation — the whole request, and a validated source (F1, F5)

**The key must cover every requested output, not just the byte-producing flags (F5).** Confirmed live:
today `classify()` returns the *identical* key with and without `--write-info-json`, so a request
needing extra metadata collides with one that does not, and a HIT returns success without the
requested file. Full `params_json` comparison cannot help — both inputs were discarded before the
JSON was built. **Canonical params must include the complete requested output set**, and every
accepted flag must be classified as deliberately equivalent or deliberately separating.

**`source_id` must be validated, not parsed (F1).** `diarize` passes a watch URL to `yt-dlp` with **no
`--no-playlist`** (`grep -c` → 0), while `yt`'s classifier already refuses such URLs without that
guard. A `watch?v=A&list=P&index=3` input canonicalizes to `A` while `yt-dlp` may write a *different*
playlist member into the fixed destination — indexing another video's audio under A. Required:
force single-video extraction, and **assert the resolved extractor ID equals `source_id` before any
insert**, else BYPASS.

### 5. The check lives in the tool

| Tool | Change |
|---|---|
| `scripts/yt` | Resolve real path (§0); rewire its hook to the ledger; **one parser owns both classification and delivery** (F8 — bash matches only `-o`/`--output` while python also accepts `--output=VALUE`, so a `--output=DIR/...` HIT copies to `$PWD` and exits 0) |
| `~/.agents/bin/diarize` | Lookup-before-spend and write-after-success **in the script**; `--no-playlist` + ID validation (§4); **safety re-run on HIT** (below) |
| audio download | Wrap; today every download repeats |

**Cache the expensive core only; re-run everything else on HIT (F6).** `diarize` has safety behaviour
that does not change the transcript bytes and would therefore be skipped by a naive cache: a source
over `MAX_DIARIZE_SEC` is refused without `--allow-truncate`, and `--speakers N` emits a warning when
the count differs. A HIT must still run admission checks, warnings, destination writes and
presentation — it may only skip the paid call.

Wire **only these three** now. Verification passes and step-state tags are new `operation` values
later, not a redesign.

### 6. Bypass is always visible, and streaming is not exempt (F9)

Every wrapped tool emits exactly one line on its own stderr — `[store] HIT <revision>` /
`[store] MISS` / `[store] BYPASS <reason>` — never swallowed into a temp file.

`yt:99` currently `exec`s raw `yt-dlp` for `-o -` / `--output=-` **before** any lookup, silently.
Move lookup ahead of the streaming branch where reuse is possible; where it is not, emit
`[store] BYPASS stdout-stream` rather than exiting mute. Direct `yt-dlp` invocation (still installed,
and `readfirst` supports `YT_DLP=yt-dlp`) must be mechanically detectable, not prevented by prose.

### 7. Backfill

Index existing caption and diarize directories by hashing what is on disk. **Only entries whose
parameters are unambiguously recoverable are indexed**; anything else is left out and redone once.
Never guess a key for existing bytes.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| **A canonicalization bug maps two genuinely different requests to one key** — the single failure that publishes a wrong quote | MITIGATE | `params_json` stored in full and compared byte-for-byte on read; the hash is an index, never the decision. Collision test below is a release gate |
| **The 2026-08-28 alias fix is safe VACUOUSLY, not structurally** — aliases agreed because nothing hit | MITIGATE | Untested, and becomes load-bearing the moment hits begin. The store has grown 11 → 15, so writes are already live |
| Backfill mis-attributes an existing directory → a wrong hit on day one | MITIGATE | Recoverable-only rule (§5); unrecoverable entries stay unindexed |
| Two sessions write the same key concurrently | ACCEPT | WAL + `INSERT OR IGNORE`; both sides hold valid bytes |
| A new guard refuses legitimate work | MITIGATE | epistemic gate 7c — run each tool's own documented workflows through it before shipping |
| Cleaning is still improvised prose, so "the cleaned track" is not a stable artifact | ACCEPT | Out of scope; bounds what the ledger can promise — raw stays authoritative |
| Spans two repos (`pp` code, `cp` consumer) | ACCEPT | Stated so the implementing session expects it |

**Non-Goals**

- Do **NOT** put artifact bytes in the database. It is an index; files stay files.
- Do **NOT** solve this with prose in a skill file. That is the failure mode, not the fix.
- Do **NOT** let skills call the ledger directly — see the fourth invariant.
- Do **NOT** wire operations with no measured waste in this pass.
- Do **NOT** weaken per-quote speaker confirmation or any Gate 0 threshold.
- Do **NOT** commit artifact **content** to any git-tracked path (P1140).

## Done-When

**Status 2026-08-28: implemented and gated. Every item below was run against `command -v yt` /
the installed `diarize`, never a repo path.** Code: `pp/scripts/{yt,yt-store-lib.py,agent_store.py,
ytaudio,agent-store-backfill.py}` (commit `f79c456`) and `~/.agents/bin/diarize` (not in a repo).

*Gate A — the split-brain (F7), which blocks all the rest*
- [x] `bash -x "$(command -v yt)" --version` resolves `STORE_LIB` to an existing file —
      before: `STORE_LIB=~/.local/bin/yt-store-lib.py`, `test -e` → 1. After:
      `STORE_LIB=/Users/…/pp/scripts/yt-store-lib.py`, file present
- [x] A fetch through the **installed** `yt` writes the ledger; a second identical fetch HITs it —
      cold 2.63s `[store] MISS` → warm 0.099s `[store] HIT rev=1 (1 file(s), no fetch)`,
      delivered bytes byte-identical (`6a78d6a7…`)

*Gate B — reuse actually happens*
- [x] A caption fetch in one session is served from the ledger in a later one — the strongest
      available form: a **backfilled** entry written by a PRIOR session's fetch served the
      disagreement `prepare` skill's own documented command, `[store] HIT rev=9 (2 file(s))`
- [x] A second identical `diarize` call makes zero paid calls — 8.69s → 0.075s, `[store] HIT
      rev=13 — 0 paid calls, 0 downloads`, turns and speakers identical. Paid calls counted by
      replacing `curl` (every Gemini call goes through it) with a logger: **0 lines**
- [x] An audio download is not repeated — 2 requests, 1 download. **Measured against a stub
      producer, not live YouTube**: live audio download is currently 403-walled on this machine
      (`unable to download video data: HTTP Error 403`), which is the pre-existing cookie/bot-wall
      condition, not a regression — `diarize` used the same direct+cookies path before
- [x] v1's causes 2 and 3 re-tested. **Cause 2 reproduces and is kept, now visible**: a natural
      `-o "harari.%(ext)s"` still refuses, and says `[store] BYPASS unsupported -o template
      shape…` instead of refusing mutely. **Cause 3 did NOT reproduce** — save-then-read across
      separate processes HIT on 3 of 3 fresh keys. **Not struck**: one run early in the session
      recorded nothing and said nothing, and the evidence was mutated before diagnosis. The write
      path is now instrumented (`[store] NOT-RECORDED <reason>`, `[store] SAVE-FAILED <exc>`),
      so a recurrence names itself. See the correction in `pp/docs/infra/youtube.md`

*Gate C — failure paths exercised (epistemic gate 7). Each was seen to FAIL.*
- [x] Three caption alias spellings → one `params_hash`, all three `HIT rev=1` through the
      installed `yt`; human-vs-auto, `en`-vs-`de`, `vtt`-vs-`srt` each `MISS`. Both halves
- [x] **(F5)** `classify(a)["key"] != classify(a + ["--write-info-json"])["key"]` → `fa3c74eb…`
      vs `6e9a9124…`. Enforced structurally: every accepted flag is now classified SEPARATING or
      EQUIVALENT, and an unclassified flag is refused
- [x] **(F4)** Tampering with `en.vtt` alone → MISS; restore; tamper `en-orig.vtt` alone → MISS;
      restore → HIT. Nothing delivered on either failure, and the pointer was dropped both times
- [x] **(F2)** fetch → `YT_STORE=refresh` → offline read returned **A, B, B**
      (`c3772c61`, `2f028c37`, `2f028c37`). Revision 1's bytes remain readable at `en.vtt` while
      revision 2 holds `en.2.vtt` — a quote verified against superseded bytes is still checkable
- [x] **(F3)** `copyfile` monkeypatched to overwrite the store file immediately before every copy:
      `sha256(delivered) == recorded` (delivered `BBBB-content`, not the substituted bytes)
- [x] **(F1)** `watch?v=AAAAAAAAAAA&list=PL1&index=3` where the producer resolves `OTHERvid123`:
      indexed under `audio/OTHERvid123`, warned, and **nothing** written under `AAAAAAAAAAA`.
      `--no-playlist` is now passed (it was absent: `grep -c` → 0)
- [x] **(F6)** Cached over-length transcript called without `--allow-truncate` → **exit 1**,
      0 paid calls; `--speakers 5` on a 2-speaker cached transcript → warning still emitted,
      0 paid calls. Total paid calls across the whole F6 sequence: **1** (the cold run).
      *Method note:* `MAX_DIARIZE_SEC` was lowered in-process so a 21s fixture exercises the
      truncation branch — paying for 30 minutes of audio to test a branch was not warranted
- [x] **(F8)** `--output=DIR/…` and `-o DIR/…` both delivered into their named directory against
      one seeded revision; the cwd stayed **empty** (the old bug delivered there)
- [x] A crashed run mid-write leaves no revision row — process killed after bytes landed:
      store file present, `revisions=0 current=0 outputs=0`, next lookup `MISS`

*Gate D — no false positives (epistemic gate 7c)*
- [x] Each tool's own documented workflows still succeed. `yt`: the `prepare` skill's captions
      line (HIT), its metadata line, `--proxy-status`, and its comments line with
      `--extractor-args` — all pass, and metadata + comments now HIT on repeat with the
      `info.json` byte-identical. `diarize`: all six documented shapes from its skill file
      (bare, `--json`, `--speakers`, `-q`, `--keep-audio`, `--allow-truncate`) → 6 HITs,
      **0 paid calls**; `--lang en-US` correctly MISSes as different work
- [x] **(F9)** `yt --output=- …` still streams correctly (byte-identical to plain `yt-dlp` with
      the same args — the control was run) **and** emits one `[store] BYPASS stdout-stream (…)`
- [x] Backfill indexes only unambiguously recoverable entries; count reported: **indexed 5,
      skipped 18**. The 5 were recovered by REPRODUCING the recorded key hash from a candidate
      list (`langs='en.*' fmt='vtt'`, uniquely), never guessed. Re-running is a no-op

*Gate E — visibility*
- [x] Exactly one `[store]` line per run, audited across 9 shapes (subs HIT, subs MISS, metadata,
      non-allowlisted `--print` field, `YT_STORE=off`, stdout stream, non-canonical `-o`,
      unclassified flag, non-YouTube host): **0 runs with none, 0 runs with more than one.**
      `diarize`'s refused-admission path also prints its line before exiting nonzero

### Review rounds (2026-08-28/29, after implementation)

`/finish` on this work found nothing in `cp` — **the code lives in `pp/scripts/` and
`~/.agents/bin/`, so the path-based classifier is blind to it.** Pointed at the real files, three
lenses on independent domains found **14 defects, all fixed and each re-proven by command**:

| Lens | Domain named before spawning | Found |
|---|---|---|
| sonnet | reuse-decision correctness — can a wrong result be served, or a right one lost? | 6 |
| sonnet | the process/argv boundary — quoting, arity, exec, exit codes | 5 (2 of them pre-existing) |
| Codex gpt-5.6-sol, high | the FIXES from the first two rounds — new, unreviewed code | 6 |

**Two rounds were needed on the same defect, and that is the finding worth keeping.** Round 1: the
cookie source was collapsed to a boolean, so `chrome:ProfileA`, `chrome:ProfileB` and a cookie file
all hashed to one key — one account's member-only captions could be served to another. Round 2
showed the fix was still wrong: naming the source is not establishing its identity. `--cookies
jar.txt` means a different file depending on the working directory. The key now carries the jar's
**content hash**, and `--cookies-from-browser` is refused outright because a live profile has no
stable identity. **This is the same defect as the one the whole spec was written about — a
parameter classified as key-relevant whose value never reached the key — and it survived one
adversarial round.**

Also fixed: a stored record missing or malformed crashed instead of missing; `materialize` reported
a HIT while delivering nothing; the v1→v2 migration aborted on an occupied pointer, which would
have left every remaining entry cold forever; the audio wrapper indexed any artifact matching its
glob without checking it was audio, and reported "produced no mp3" while deleting a usable file;
an exit status was validated as digits, so `exit 256` replayed a **failure as success**. Two
pre-existing issues were fixed while in the file: the token-bearing proxy config now clears on
INT/TERM, and a bare `-` is read as yt-dlp's stdin-URL syntax rather than output streaming.

Final state re-measured: captions, metadata, comments and diarize all HIT; **0 paid calls**; Gate E
clean at **7 shapes, exactly one `[store]` line each, none silent**.

### What is NOT proven

- **Live audio download reuse.** The ledger logic is proven; the live path is currently
  403-walled, so `ytaudio` has not fetched real YouTube audio end to end. First real run will
  exercise it.
- **The second review lens is still uncovered** (epistemic gate 9b). The design was attacked from
  one direction only — Codex GPT-5.6-Sol. An Opus lens was spawned twice and never reported, and
  this implementation has not been adversarially reviewed at all.
- **Open Question 2** (record failed attempts) remains unanswered and unimplemented; failures are
  not recorded, so a known-impossible fetch is still retried. **Open Question 3** is answered:
  `ytaudio` is its own command, so a future non-diarize audio consumer gets reuse for free.
- **`--keep-audio` on a HIT** has nothing to write. It now warns rather than silently no-opping.

## Alternatives Considered

- **Instruct callers in skill prose to check first.** Rejected — this exists today for `diarize` and
  is exactly the defect.
- **Separate index per operation.** Rejected — the single point of asking is the whole value;
  N indexes restore "which one do I check", today's bug.
- **Directory-naming conventions instead of an index.** Rejected — filenames as a key schema is what
  produced causes 2 and 3, and cannot express "was this step done" state or survive concurrent writes.
- **Bytes inside SQLite.** Rejected — artifacts must stay openable by ordinary tools.
- **Fix only the caption store now, generalise later.** Rejected by the founder — builds it twice.
- **Leave it; redoing work is cheap.** Rejected on the invariant, not cost: a re-fetch can return a
  *different* caption track than the one a published quote was verified against.

## Rollback Strategy

All code in `pp` (`scripts/yt`, `scripts/yt-store-lib.py`, `~/.agents/bin/diarize`). `git revert`
restores "always do the work" — degraded but safe. Existing stores stay readable; neither byte layout
changes. Dropping `index.db` costs hit-rate only.

## Evidence (original 2026-08-28 findings)

Three stacked causes in the caption store, in the order a caller met them:

| # | Cause | State |
|---|---|---|
| 1 | `classify()` knew `--write-auto-subs` but not `--write-auto-sub` (both accepted by yt-dlp) → `NOCACHE unrecognized flag`, bypassing the store in **both** directions | FIXED 2026-08-28 |
| 2 | Subs mode requires `-o` to be exactly `PREFIX%(id)s.%(ext)s`; undocumented anywhere a caller reads. A natural `-o "harari.%(ext)s"` → `NOCACHE unsupported -o template shape` | OPEN — subsumed by §2 (fail-open axis 1, but now *visibly*) |
| 3 | With cause 1 fixed and the canonical `-o` shape, a fetch of a stored video still re-fetched. Hypothesis: `sub_langs` key mismatch between saving and reading session | OPEN, untested — subsumed by the §1 explicit key |

Five speaker-labelled transcripts (~$2 of API spend, ~40 min of audio downloads) were produced into a
session scratchpad deleted on exit; rescued by hand. An adversarial review named the rescued store
*"a documented convention nothing enforces — the same defect class it claims to fix."*


### Adversarial review, 2026-08-28 — verification ledger

Reviewer: **Codex GPT-5.6-Sol**, max reasoning, 245,602 tokens, ~22 min. Verdict: *"Do not ship as
written."* 9 findings; **8 confirmed by command**, 1 analytic. A second (Opus) lens was spawned twice
and returned no report both times, then was stopped — **that lens is uncovered, not clean**
(epistemic gate 9b: 1 of 2 reports received).

| # | Finding | Verdict | Proof |
|---|---|---|---|
| F7 | Symlinked `yt` cannot find the store lib | **CONFIRMED** | `bash -x` → `STORE_LIB=~/.local/bin/yt-store-lib.py`; `test -e` → exit 1 |
| F5 | `--write-info-json` dropped from key → collision | **CONFIRMED** | `classify(a)["key"] == classify(a+["--write-info-json"])["key"]` → `True` |
| F4 | One fetch = 2 files; v1 schema held 1 | **CONFIRMED** | manifest `{'en-orig':'en-orig.vtt','en':'en.vtt'}` |
| F2 | `INSERT OR IGNORE` keeps stale bytes after refresh | **CONFIRMED** | sqlite K→A then K→B leaves `('A',)` |
| F1 | `diarize` lacks `yt`'s playlist guard | **CONFIRMED** | `grep -c "no-playlist" diarize` → 0 |
| F8 | bash misses `--output=VALUE`, python accepts it | **CONFIRMED** | `yt:105` vs `yt-store-lib.py:100` |
| F9 | `-o -` execs yt-dlp before lookup, silently | **CONFIRMED** | `yt:99` |
| F6 | diarize truncation refusal + speaker warning are not byte-affecting | **CONFIRMED** | `MAX_DIARIZE_SEC` branch; speaker-count warning |
| F3 | hash-then-reopen race between verify and deliver | ANALYTIC | lib hashes `:252`, copies `:338` — needs implementation to demo |

## Related

- **P1140** — shipped the caption store; its ticked Done-When box 1 is what this spec found false.
- `decisions.md` **2026-08-28 [technical]** — the measurements.
- `decisions.md` **2026-08-16 [technical]** — the empty-is-permissive ruling resolved in §2.
- `decisions.md` **2026-08-25** (P1140 planning) — raw returns 0 hits for genuine quotes.
- `pp/docs/infra/youtube.md` — the three causes and the required collision test.
- P1164 · P1167 · P1171 — the pipeline work that surfaced all of this.

## Open Questions

1. ~~Cache or safety artifact?~~ **Answered in §2** — cache on "consult?", safety artifact on "match?".
2. Should the ledger record **failed** attempts (so a known-impossible fetch is not retried nightly)?
   Not assessed. Leaning no: a failure is usually transient and caching it converts one bad night into
   a permanent hole.
3. Does the audio wrapper belong inside `diarize` or as its own tool? Affects whether a future
   non-diarize consumer of audio gets reuse for free.
