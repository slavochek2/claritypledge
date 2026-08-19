#!/bin/bash
# UserPromptSubmit hook — fire the routing rules that were MEASURED not firing (P1116).
#
# WHY THIS EXISTS. Three always-on rules tell the agent to pre-empt exactly these asks.
# The founder typed them anyway, at this rate over the measured window:
#   "where are we / what now"     75 asks across 38 sessions   -> should have been /status
#   "which model / which effort"  14 asks across 12 sessions   -> should have been the
#                                                                 model+effort call
#   "do we need a review agent"   ~33 asks                     -> should have been /pick-flow
# A fourth class (compact / plan mode / subagents, ~60 occurrences) has no rule at all.
# The same repo already proved the remedy twice: block-pw-tail-pipe.sh, and the global
# decision-brief.sh, which reached ~95.8% recall on asks its advisory rule missed 0/30.
#
# SIBLING, NOT AN EDIT. P1116 explicitly allows extending decision-brief.sh "or add a
# sibling". Sibling, for three reasons: (1) decision-brief injects ONE contract whose
# wording is duplicated in five places across two repos and has already drifted once —
# P1116's non-goals forbid touching it; (2) these asks need routing, not that contract;
# (3) every target here (/status, /pick-flow, .claude/rules/model-effort.md) is a cp
# artifact, so a cp-scoped, version-controlled hook is strictly better than an untracked
# global one — it also retires this spec's "edits a file outside this repo" risk.
#
# TRIGGERS ARE SAMPLED FROM REAL TRANSCRIPTS, NOT INVENTED. Every pattern below was
# derived from prompts the founder actually typed (~/.claude/projects/*/*.jsonl, typed
# prompts only, same extraction path as decision-brief-rate.py). That is why the typo
# variants are here: transposition and dropped letters are this user's dominant error
# class (sonent, efofrt, agnet, companct, whtats), and a matcher trained on correct
# spelling is a matcher that does not fire.
#
# SAFETY INVARIANTS (inherited from decision-brief.sh — do not break these):
#   1. NEVER exit non-zero. On UserPromptSubmit, exit 2 BLOCKS AND ERASES the prompt;
#      any other non-zero shows a hook-error notice on every prompt. Hence the
#      unconditional `exit 0` on the last line.
#   2. NEVER build the JSON by string interpolation — use `jq -Rs`, which also makes
#      JSON breakout via attacker-supplied sibling keys impossible.
#   3. NEVER read the injected text from a mutable file at fire time. stdout here enters
#      the model context; a world-writable source would be a prompt-injection channel.
#   4. NEVER log any slice of the prompt. Fixed labels only — prompts routinely carry
#      private legal, financial and personal context.
#   5. NEVER put a literal apostrophe inside the awk program: it is a single-quoted shell
#      string, so one apostrophe terminates it and the script exits 2, erasing the prompt.
#
# Rollback: remove the UserPromptSubmit entry from .claude/settings.json (or delete this
# file). Canary: scripts/test-route-brief.sh — run it after ANY edit here.

JQ=/usr/bin/jq
# Overridable so the canary does not write into the log that measures this hook. It had
# been adding ~30 synthetic FIRE rows per run to the real file — ~570 of 621 rows were test
# noise, which would have corrupted the recall number that is this hook's whole
# justification. (P1116 adversarial review.)
LOG_DIR="${ROUTE_BRIEF_LOG_DIR:-$HOME/.claude/logs}"
LOG="$LOG_DIR/route-brief.log"
ALIVE="$LOG_DIR/route-brief.alive"

# NO CONCEALMENT CLAUSE. The first version ended "Route silently: never mention this note."
# That was wrong on its own terms: this hook fires on ~4.5% of real prompts with a
# substantial false-positive share, so roughly one prompt in 90 got a behaviour change the
# agent was forbidden to explain — directly against CLAUDE.md's Transparency Principle
# ("Never silently work around problems"). It also trained the model to act on injected
# directives without surfacing them, in a file that is agent-writable and ungated. An
# injected instruction must always stay attributable. (P1116 adversarial review.)
HEADER="[route-brief hook] This prompt matched an ask an always-on rule was supposed to
pre-empt and measurably did not. Do the routed thing FIRST, then answer. Name the route in
one short clause so the founder can see why you did it — and if the match looks wrong for
what they actually asked, say so plainly and answer the real question instead."

read -r -d '' R_STATUS <<'EOF'
- SITUATION ASK -> run /status (slava:maintain:status) and answer from ITS output.
  /status is a read-only snapshot of THIS conversation. Answering where-are-we or
  whats-next from memory is what produced 75 of these asks across 38 sessions: the
  founder re-asks because the previous answer was reconstructed, not read.
EOF

read -r -d '' R_MODEL <<'EOF'
- MODEL / EFFORT ASK -> give the call in one line, format `<task type> -> <model>,
  <effort>`, per .claude/rules/model-effort.md, plus one clause of why. Honest
  constraint: you cannot run /model or /effort — recommend, the user flips. Never claim
  to have switched either.
EOF

read -r -d '' R_FLOW <<'EOF'
- REVIEW / FLOW ASK -> run /pick-flow (slava:build:pick-flow) and answer with the flow it
  picks, including whether a review step is warranted. Pick the right review: an artifact
  that already EXISTS (a diff, a shipped mechanism, a design) is
  /slava:think:adversarial-review; a proposal not yet acted on is /slava:think:falsify;
  line-level bugs in a diff are /code-review. Do not answer "yes lets review" without
  naming which of the three.
EOF

read -r -d '' R_META <<'EOF'
- COMPACT / PLAN-MODE / SUBAGENT ASK -> answer concretely, never deflect back to the
  founder. Compaction: say yes or no, and if yes, name what must be re-gathered on the
  other side (CLAUDE.md, Post-Compaction Recovery). Plan mode or subagents: say which and
  why, or say plainly that it is not needed. Pair the answer with the model+effort call —
  in the transcripts these two asks arrive in the same breath.
EOF

# Returns a space-separated label list on stdout, or nothing. Never fails the script.
match_triggers() {
	printf '%s' "$1" | /usr/bin/awk '
	function sortletters(w,   a, n, i, j, t, s) {
		n = split(w, a, "")
		for (i = 2; i <= n; i++) {
			t = a[i]
			for (j = i - 1; j >= 1 && a[j] > t; j--) a[j + 1] = a[j]
			a[j + 1] = t
		}
		s = ""
		for (i = 1; i <= n; i++) s = s a[i]
		return s
	}
	{ full = full " " tolower($0) }
	END {
		# Normalized copy: every non-letter becomes a space, runs collapse. This is how
		# dont / don t / don-t and whats / what s all reach the same patterns, and it is
		# also how an apostrophe stays out of this single-quoted program entirely.
		norm = " " full " "
		# Every non-letter collapses to a space, so what[apostrophe]s next becomes
		# "what s next". The first shipped version matched only the adjacent form, so the
		# CANONICAL spelling of the single most-typed ask never fired -- ~6% of that class,
		# silently missed. Rather than deleting specific apostrophe bytes (an octal regex
		# escape for the curly form does not work in this awk, and there are several Unicode
		# quotes), the orphan " s" is folded back onto the preceding word AFTER collapsing.
		# That is byte-agnostic: straight, curly, and any other quote all reduce to the same
		# shape. The canary could never have caught the original: INVARIANT 5 forbids an
		# apostrophe in this program, so the fixture could not contain one.
		gsub(/[^a-z]+/, " ", norm)
		# POSIX awk gsub has NO capture-group backreferences (only &), so this is written
		# as a plain literal swap: " s " -> "s " re-attaches the orphan to the word before.
		gsub(/ s /, "s ", norm)
		gsub(/  +/, " ", norm)

		# --- letter-multiset pass: catches transposition typos, this users dominant
		# error class. Constants are the SORTED letters of each word. A wrong constant is
		# a SILENTLY DEAD matcher, not an error — re-derive them, never hand-type them.
		# COMMON ENGLISH THAT SHARES A LETTER-MULTISET. Two anchors collide, not one:
		#   ennost (sonnet, and the typo snonet) <- tenons
		#   enost  (the typo sonet)              <- notes, onset, stone, tones
		#   opsu   (opus)                        <- soup
		# Each fired the model/effort route on an ordinary sentence ("read my notes and tell
		# me how much effort the migration takes"). The multiset trick is right for typos and
		# wrong for real words, so real words are excluded by name. Every entry below is a
		# VERIFIED collision -- re-derive the sorted form before adding one. A stoplist word
		# whose multiset matches no anchor is dead weight that reads as coverage: `opts`
		# (opst) was exactly that, and `stonen` was not a word at all. (P1116 code review.)
		stop["notes"] = 1; stop["onset"] = 1; stop["stone"] = 1; stop["tones"] = 1
		stop["soup"] = 1; stop["tenons"] = 1
		n = split(norm, w, " ")
		for (i = 1; i <= n; i++) {
			if (w[i] in stop) continue
			s = sortletters(w[i])
			# sonnet/sonent/snonet all sort to ennost; sonet sorts to enost
			if (s == "ennost" || s == "enost") sonnet = 1
			# opus/opsu/opsu
			if (s == "opsu") opus = 1
			# effort/efofrt/effrot all sort to effort; efort sorts to efort
			if (s == "effort" || s == "efort") effort = 1
			# model/modle/mdoel all sort to delmo
			if (s == "delmo") model = 1
			# other model names the founder names in these asks
			if (w[i] == "haiku" || w[i] == "fable" || w[i] == "sonnet") model = 1
		}

		labels = ""

		# --- STATUS: situation / orientation asks.
		# `wh[a-z]{0,5} (next|now)` covers whats/what/wht/whtats next|now in one pattern.
		if (norm ~ / wh[a-z]{0,5} (next|now) /)              labels = labels " status"
		else if (norm ~ / wahts? (next|now) /)               labels = labels " status"
		else if (norm ~ / where (are|do) we /)               labels = labels " status"
		else if (norm ~ / where we (are|stand) /)            labels = labels " status"
		else if (norm ~ / are we (done|finished|ready) /)    labels = labels " status"
		else if (norm ~ / did we do all /)                   labels = labels " status"
		else if (norm ~ / ready to (close|clsoe|clse) /)     labels = labels " status"
		else if (norm ~ / remind me what we (did|have) /)    labels = labels " status"
		else if (norm ~ / whats (the )?status /)             labels = labels " status"

		# --- MODEL / EFFORT. Deliberately requires a MODEL word alongside effort:
		# the phrase "low effort" appears in this founders product writing about human
		# behaviour and must not route. Level words (high/medium/low/xhigh) are not
		# accepted as the model anchor for exactly that reason.
		# The generic word "model" does NOT satisfy the effort pairing. It is ambiguous —
		# business model, mental model, data model — and this founder writes about all three,
		# so "our pricing model requires low effort from the buyer" routed as a model+effort
		# ask. Only an actual LLM model NAME anchors it; the literal which/what forms below
		# still catch a genuine ask that names no model. (P1116 adversarial review.)
		if (opus && sonnet)                                  labels = labels " model"
		else if (effort && (opus || sonnet))                 labels = labels " model"
		else if (norm ~ / (which|what|whihc|witch) (model|effort) /) labels = labels " model"
		else if (norm ~ / (model|effort) and (effort|model) /)       labels = labels " model"

		# --- FLOW: review-agent asks. Anchored on the review word, so the many spellings
		# of agent (agnet, agent) and adversarial (adversrial, adverserial) do not matter.
		if (norm ~ / do we (need|want|run) (a |an |another |some )?(adversarial |adversrial |adverserial |advesarial )?(review|reviewe|reviewer|revie)/) labels = labels " flow"
		else if (norm ~ / advers[a-z]{0,5} (review|reviewer|revie)/)  labels = labels " flow"
		else if (norm ~ / (which|what) flow /)                        labels = labels " flow"
		else if (norm ~ / (do|should) we (need )?(run )?(a )?(code )?review (agent|agnet)/) labels = labels " flow"

		# --- META: compaction / plan mode / subagents. No rule covers these today.
		if (norm ~ / (can|should|shall) (i|we) (compact|companct|comapct|compct) /) labels = labels " meta"
		else if (norm ~ / compact (before|then|first|here|and) /)     labels = labels " meta"
		else if (norm ~ / (plan|planning) mode /)                     labels = labels " meta"
		# A bare mention of subagents is NOT a deliberation about them. Caught by the
		# canary: "we agreed on sonnet for the subagents already, just run it" fired here
		# on the first pass — a decided prompt does not need routing.
		else if (norm ~ / (as|in) (a |an )?sub ?agents? /)            labels = labels " meta"
		else if (norm ~ / (do|should|can|shall) (we|i) [a-z ]{0,30}sub ?agents? /) labels = labels " meta"
		else if (norm ~ / (spawn|parallel|fan out) (the |a |some )?agents? /) labels = labels " meta"

		if (labels != "") print substr(labels, 2)
	}
	' 2>/dev/null
}

main() {
	[ -x "$JQ" ] || return 0

	INPUT=$(cat 2>/dev/null) || return 0
	[ -n "$INPUT" ] || return 0

	PROMPT=$(printf '%s' "$INPUT" | "$JQ" -r '.prompt // empty' 2>/dev/null) || return 0
	[ -n "$PROMPT" ] || return 0

	# Size ceiling matches decision-brief.sh: 6000 keeps 99% of typed prompts (they are
	# dictated and long) while excluding pasted content, whose observed max is 278676.
	[ "${#PROMPT}" -le 6000 ] || return 0

	# Harness-generated prompts, not typed by the user.
	case "$PROMPT" in
		"This session is being continued"*) return 0 ;;
		"<"*) return 0 ;;
		"Caveat:"*) return 0 ;;
	esac

	LABELS=$(match_triggers "$PROMPT") || return 0
	[ -n "$LABELS" ] || return 0

	BODY="$HEADER"
	case " $LABELS " in *" status "*) BODY="$BODY
$R_STATUS" ;; esac
	case " $LABELS " in *" model "*)  BODY="$BODY
$R_MODEL" ;; esac
	case " $LABELS " in *" flow "*)   BODY="$BODY
$R_FLOW" ;; esac
	case " $LABELS " in *" meta "*)   BODY="$BODY
$R_META" ;; esac

	OUT=$(printf '%s' "$BODY" | "$JQ" -Rs \
		'{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:.}}' 2>/dev/null) || return 0
	printf '%s' "$OUT" | "$JQ" -e . >/dev/null 2>&1 || return 0

	printf '%s' "$OUT"

	# Fixed labels only — never any part of the prompt (INVARIANT 4).
	{ mkdir -p "$LOG_DIR" && printf '%s\tFIRE\t%s\n' "$(/bin/date -u +%FT%TZ)" "$LABELS" >>"$LOG"; } 2>/dev/null
	return 0
}

# Liveness sentinel: distinguishes "hook never loaded" from "triggers went stale". Both
# otherwise present as an empty log. One truncating write, no growth.
# `: >>"$ALIVE"` (the original, inherited from decision-brief.sh) appends ZERO bytes, and
# POSIX updates mtime only on write — so the sentinel never moved after creation and could
# not distinguish the two cases it exists for. Dead in decision-brief.sh for six days,
# measured. (P1116 adversarial review.)
{ mkdir -p "$LOG_DIR" && /bin/date -u +%FT%TZ >"$ALIVE"; } 2>/dev/null

main

# INVARIANT 1. Must be the last line. Do not remove.
exit 0
