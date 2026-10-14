# /day step 9r — grounded reflection statements with "Agent on Slava" (P1399, P1445)

The procedure `/day` step 9r follows. It lives next to the scripts it drives so the two ship together;
`~/.claude/commands/day.md` step 9r points here. Every path below is relative to the kanban checkout
`$KB` that step 9r resolves.

**Why it is shaped this way.** The statements must not be written by the agent that ran the checks —
it has spent the pass inside them. They must also know what is already known: earlier private and
public decisions, recent conversations, every story the founder told (P1445 finding 2: a statement
proposed a smaller event within 7 days while a post-event reflection held the day before was
ignored). And each statement carries the reasoning of one entity, **"Agent on Slava"** — its own
position, its own short story with sources — the way an arguer does in the Disagreement Pipeline
(`/slava:disagreement:positions`, `/slava:disagreement:story-draft`). The founder picks his own
position; the agent never picks it for him.

**Privacy.** Everything in the work folder is private (pp decisions, conversation turns). It stays
in `~/.claude-day/`; nothing from it goes into a cp file, fixture or commit message.

## 1. Inputs

```bash
set -o pipefail
W="$HOME/.claude-day/reflection-work/$(date -u +%Y-%m-%dT%H-%M-%SZ)"; mkdir -p "$W"; chmod 700 "$W"
~/.claude/scripts/day-step.sh findings | cut -f5 > "$W/findings.txt"        # this pass's issue-card titles
(cd "$KB" && npx tsx scripts/day-reflection-history.ts --day-dir "$HOME/.claude-day" --days 14) > "$W/history.txt"
(cd "$KB" && npx tsx scripts/day-reflection-context.ts --day-dir "$HOME/.claude-day" \
   --findings "$W/findings.txt" --sources-out "$W/sources0.json") > "$W/grounding0.txt"
```

`grounding0.txt` ends with a `Coverage:` line (shown / truncated per source class) and a `MISSING:`
line for any source it could not read. Both go into the pass evidence. A MISSING line is reported,
never worked around.

## 2. Draft (writer, round 1)

Spawn **one** agent (Agent tool, `subagent_type: general-purpose`, `model: "opus"`). Paste the facts,
`history.txt` and `grounding0.txt` **inline**, so the brief is one self-contained message. The writer
can read and write files (P1489: an earlier version of this file said it cannot, which was false), and
step 3 relies on that: its reply goes to a file, never only into a message.

> From these facts about one working day, draft 3 to 5 statements that each propose a CHANGE —
> something to stop, start or do differently. No "keep doing" statements. One sentence each, at most
> 140 characters, plain words, no ticket numbers, no names of private people (use roles). Prefix a
> statement with `[weekly]` or `[monthly]` when it is drawn from that review.
>
> Rules: strategy, not task micromanagement. Never restate an issue card already on today's board
> (the F lines). Never a statement about a personal activity (hikes, sport, holidays, family life):
> those are personal, not ClarityPledge. Each statement must be a real choice — say to yourself the
> strongest case for the opposite; if a reasonable founder could not take that side, drop it (the
> Disagreement Pipeline's contradiction test, applied to his own strategy). Use what is already known:
> where an earlier decision, conversation or story already answers a question, push past it rather
> than asking it again.
>
> Below: what the founder answered in the last 14 days (do not repeat a statement he answered; where
> he disagreed or told a story, push on that point from a new angle; never quote his stories back
> verbatim), then the grounding block.
>
> Reply with the draft statements only, one per line.

## 3. Ground the drafts, then write (writer, round 2)

The drafts' own words are the best query for what is already known about them:

```bash
cat > "$W/drafts.txt" <<'DRAFTS'
<the drafts, exactly as returned>
DRAFTS
# a heredoc inside $( ) is split into commands by zsh: read the drafts from the file instead
TERMS="$(tr 'A-Z' 'a-z' < "$W/drafts.txt" | grep -oE '[a-z]{5,}' | sort -u | paste -sd, -)"
(cd "$KB" && npx tsx scripts/day-reflection-context.ts --day-dir "$HOME/.claude-day" \
   --findings "$W/findings.txt" --terms "$TERMS" --sources-out "$W/sources.json") > "$W/grounding.txt"
```

Continue the **same** writer (SendMessage) with `grounding.txt` pasted inline:

> Here is what is known about your drafts. Rewrite them into the final 3 to 5 statements (same rules).
> For each, add the view of "Agent on Slava" — you, writing as the founder's mirror agent:
> - `position`: where you predict Slava stands on the statement, -3 (strongly disagree) to 3 (strongly
>   agree). It is your prediction, shown beside his own control; it never answers for him.
> - `story`: one short story (at most 900 characters) explaining why, in plain prose — no labels,
>   no headings, no "Fact:" / "Connection:" / "Speculation:" (P1449: the board shows it as CP shows a
>   story, prose with its supporting quotes under it). The Disagreement Pipeline's three-tier rule
>   still governs every sentence, as in its story-draft: (1) what a source says must map to one of
>   your `sources` quotes; (2) how it connects — your reasoning between the quotes — is allowed, it is
>   the story's job; (3) a fact about the world (a name, date, number, event) is banned unless a quote
>   carries it. A guess must read as a guess ("may", "probably"). No sentence that restates the
>   statement.
> - `sources`: 1 to 6 of the grounding lines you rely on, each `{"ref": "<its id, e.g. D3>", "quote":
>   "<words copied EXACTLY from that source>"}`. A quote that is not in its source fails the check.
>
> First line of your reply: `MODEL: <your exact model id>`. Then one JSON object, nothing else:
> `{"statements":[{"text":"…","review":"weekly"?,"agent":{"position":-3..3,"story":"…","sources":[{"ref":"D3","quote":"…"}]}}]}`
>
> Write that whole reply, exactly, to `<$W>/reply-1.txt` (the path given, expanded), and answer this
> message with only that path.

**The reply travels as a file (P1489).** A long reply that comes back only as a message can be cut
off (an idle notice carries about 4000 characters), and a cut reply fails `--parse` or, worse, loses
statements. So the writer writes it to the work folder, and step 4 reads the file. If the file is
missing or empty, ask the writer again; never rebuild it from a message.

## 4. Mechanical checks

```bash
(cd "$KB" && npx tsx scripts/day-reflection-check.ts --parse) < "$W/reply-1.txt" \
  | (cd "$KB" && npx tsx scripts/day-reflection-history.ts --reject-repeats --day-dir "$HOME/.claude-day" --findings "$W/findings.txt") \
  | (cd "$KB" && npx tsx scripts/day-reflection-check.ts --quotes --lenient --sources "$W/sources.json" --day-dir "$HOME/.claude-day") \
  > "$W/candidate.json" 2> "$W/quotes-1.txt"
cat "$W/quotes-1.txt"   # one line per quote that did not verify (kept: round 2 writes its own file)
```

Each stage refuses with exit 1 and names the problem on stderr: the shape (`--parse`), a repeat of an
answered statement, a repeat of an issue card on this board, a personal-activity statement
(`--reject-repeats`), a quote not found in its source or a source that cannot be read (`--quotes`).
A refusal by `--parse` or `--reject-repeats` stops the pipeline: send the writer the stderr lines
verbatim and ask for the whole reply again — **never edit its words yourself**, never trim a
statement, never fix a quote. A second refusal of the whole reply records nothing (say so in the
evidence). A quote that does not verify does **not** stop it (`--lenient`): that statement gets the
verdict `"fail: mechanical: <the quotes-1.txt line>"` and goes to the round-2 rewrite in step 5 like
any checker fail — so a statement that misses twice is dropped and named, while the others stand.

## 5. Checker (a separate agent)

Statements with a mechanical fail are not sent to the checker in round 1. Spawn a **second, separate** agent (`subagent_type: general-purpose`, `model: "opus"`) and paste
inline: each statement with the agent's position, story and sources (ref + quote, from
`candidate.json`), and this pass's issue-card titles (`findings.txt`). Brief:

> You check another agent's work; you succeed by finding what is wrong. For each statement, answer
> `rN: pass` or `rN: fail: <one-line reason>`. Fail it when: the story claims something its quoted
> sources do not support (judge only from the quotes given) — the story is plain prose with no tier
> labels, so classify each sentence yourself: a sentence that states what happened or what a source
> says must be backed by one of the quotes, reasoning between the quotes is fine, and a guess must read
> as a guess; the story carries tier labels ("Fact:", "Connection:", "Speculation:"); the statement repeats or paraphrases an issue card (the titles below); it is about a
> personal activity; it is task micromanagement rather than strategy; no reasonable founder could take
> the opposite side; or the story mostly restates the statement. One line per statement, nothing else.

Record the verdicts as `{"r1":["pass"],"r2":["fail: …"]}` in `$W/verdicts.json`. For every fail,
send the writer the checker's reasons and ask for **only those statements** again (round 2), in the
same JSON shape with each statement's `"id"` kept (`{"statements":[{"id":"r2","text":…,"agent":…}]}`),
written to `<$W>/reply-2.txt` the same way (the reply is the file; the message is only its path).
Run them through step 4 with `--parse --rewrite r2,…` in place of `--parse`, reading `$W/reply-2.txt`,
into `$W/rewrite.json`, and with stderr to `$W/quotes-2r.txt` instead of `quotes-1.txt` (round 1's
misses stay as they were), then merge and re-check the whole file:

```bash
(cd "$KB" && npx tsx scripts/day-reflection-check.ts --merge --base "$W/candidate.json") < "$W/rewrite.json" \
  | (cd "$KB" && npx tsx scripts/day-reflection-check.ts --quotes --lenient --sources "$W/sources.json" --day-dir "$HOME/.claude-day") \
  > "$W/candidate2.json" 2> "$W/quotes-2.txt" && mv "$W/candidate2.json" "$W/candidate.json"
cat "$W/quotes-2.txt"   # a rewritten statement listed here gets its second verdict "fail: mechanical: …"
# quotes-1.txt stays: a run's drops can be attributed afterwards (P1489)
```

Check the rewritten statements again with the **same** checker and append the second verdict
(`"r2":["fail: …","pass"]`). A statement gets at most two rounds. Quotes are copied from the source
text itself: a quote must not run across a `…` the grounding line added, and must be at least three
words, matched as whole words. A story quote is checked against the whole `S` line as shown, so a quote
of its bracket or of the statement it answers verifies too, but the reference then names that part
("the statement he answered", "his recorded position"): judge it as the earlier writer's words or as
his recorded position, never as his story (P1489).

## 6. Record

```bash
(cd "$KB" && npx tsx scripts/day-reflection-check.ts --finalize --verdicts "$W/verdicts.json" --sources "$W/sources.json" --day-dir "$HOME/.claude-day") \
  < "$W/candidate.json" > "$W/final.json" 2> "$W/dropped.txt"; FIN=$?
cat "$W/dropped.txt"   # exit 0: "dropped rN …" lines · exit 1: all dropped · exit 2: a REFUSAL (unchecked), not a drop
[ "$FIN" -eq 0 ] && ~/.claude/scripts/day-step.sh data reflection < "$W/final.json"
~/.claude/scripts/day-step.sh attest disp.9r --evidence "writer <MODEL line>; N kept, checker verdicts r1 pass …; <dropped.txt lines or 'none dropped'>; <the Coverage line>; <MISSING lines or 'nothing missing'>"
```

`--finalize` checks every kept quote again itself (it never trusts the file), refuses more than two
verdicts per statement, keeps a statement only when its last verdict is a pass, drops one that failed twice
(named on stderr — that line goes in the evidence), and refuses (exit 2) anything that failed once
and was not checked again: a statement is never published unchecked. When every statement is
dropped nothing is recorded, and the board shows no statements rather than unchecked ones; say so in
the evidence.
