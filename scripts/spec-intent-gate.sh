#!/usr/bin/env bash
# spec-intent-gate.sh — a spec written from a conversation must carry the
# founder's own words (P1246 gate 4).
#
# WHY THIS IS MECHANICAL AND COSTS THE FOUNDER NOTHING
# create-spec.md already says it: "quote it verbatim in Problem, attributed" —
# "Your paraphrase is a lossy re-encoding of the only authoritative sentence in
# the spec." Measured 2026-09-04 against specs created AFTER that rule landed
# (2026-08-26, 4f0d981e9): 37 of 106, i.e. 35%. Not a dead letter — a live rule
# that two thirds of runs skip. The agent already reads the conversation; only
# the check was missing. Nothing new is asked of the founder, which is why this
# is a gate rather than a new step (Non-Goals: "no new manual step").
#
# SCOPE — bug specs are EXEMPT. Founder decision, 2026-09-08: "Feature/story/task
# only — exempt bugs." A bug's authoritative artifact is the reproduction, not a
# stated intent; /create-bug deliberately skips /problemify for the same reason.
# Forcing a quote onto a spec where the honest answer is "nobody said anything,
# the alarm fired" would manufacture ceremony, and ceremony is what this whole
# spec is trying to delete.
#
# Usage: spec-intent-gate.sh <spec-file>
# Exit 0 = passes or not applicable. Exit 1 = refused (message on stderr).

set -uo pipefail

GREP=/usr/bin/grep
[[ -x "$GREP" ]] || GREP=grep

spec="${1:-}"
if [[ -z "$spec" ]]; then
  echo "usage: $0 <spec-file>" >&2
  exit 2
fi
# Fails CLOSED on an unreadable file (P1246 invariant). An intent gate that
# waves through anything it cannot parse is decoration.
if [[ ! -r "$spec" ]]; then
  echo "spec-intent-gate: cannot read '$spec' — refusing (fail-closed)." >&2
  exit 1
fi

content="$(cat "$spec")"

# --- Frontmatter ------------------------------------------------------------
fm="$(printf '%s\n' "$content" | awk 'NR==1 && $0=="---"{f=1;next} f && $0=="---"{exit} f{print}')"
spec_type="$(printf '%s\n' "$fm" | $GREP -m1 '^type:' | sed 's/^type:[[:space:]]*//; s/[[:space:]]*$//; s/^["'"'"']//; s/["'"'"']$//')"

case "$spec_type" in
  bug)
    echo "spec-intent-gate: SKIP — type '$spec_type' is exempt (a bug's artifact is its reproduction)."
    exit 0 ;;
esac

# Explicit cold-start declaration. create-spec.md sanctions this case — "If the
# conversation is empty (a cold /create-spec), say so in one clause" — so the
# gate must too, or it would refuse legitimate work on day one.
#
# Honest about its strength: an agent CAN write this line. It is not a security
# boundary and is not pretending to be one. What it buys is that a silent
# omission becomes a LOUD, greppable declaration sitting in frontmatter, visible
# on the kanban and in review. Converting "nobody noticed" into "someone claimed
# this" is the whole available win here; claiming more would be dishonest.
if printf '%s\n' "$fm" | $GREP -qE '^intent:[[:space:]]*cold-start[[:space:]]*$'; then
  echo "spec-intent-gate: PASS — declared 'intent: cold-start' (no conversation to mine)."
  exit 0
fi

# --- The artifact: a blockquote carrying a verbatim quote --------------------
# Matches the convention already in use across the repo (30 specs carry
# "> **Founder framing, verbatim:**" and its variants), but keys on the SHAPE
# rather than the label — a blockquote line containing a quoted span. Pinning
# the label would make the gate trivially defeatable by renaming, and would also
# refuse the several specs that legitimately word it differently ("Founder
# framing on scope, verbatim:", "Founder framing (from conversation):").
#
# 40 characters, not 1: a quote must be a sentence someone actually said. Short
# quoted fragments ("the gate", "done") appear all over normal spec prose and
# would make this pass vacuously.
quoted_len=0
while IFS= read -r line; do
  case "$line" in
    ">"*) ;;
    *) continue ;;
  esac
  # Strip blockquote markers and markdown emphasis, then measure the longest
  # run inside straight or typographic double quotes.
  stripped="$(printf '%s' "$line" | sed 's/^[[:space:]>]*//; s/\*\*//g; s/\*//g')"
  len="$(printf '%s' "$stripped" | awk '
    {
      n = 0
      # Longest span between a pair of double quotes (" or the curly forms).
      gsub(/[\xe2\x80\x9c\xe2\x80\x9d]/, "\"")
      split($0, parts, "\"")
      for (i = 2; i <= length(parts); i += 2) if (length(parts[i]) > n) n = length(parts[i])
      print n
    }')"
  [[ -n "$len" && "$len" -gt "$quoted_len" ]] && quoted_len="$len"
done <<< "$content"

if [[ "$quoted_len" -ge 40 ]]; then
  echo "spec-intent-gate: PASS — verbatim framing present (${quoted_len}-char quote in a blockquote)."
  exit 0
fi

cat >&2 <<MSG
spec-intent-gate: REFUSED — $(basename "$spec") (type: ${spec_type:-unset}) carries no verbatim founder framing.

  create-spec.md: "quote it verbatim in Problem, attributed" — "Your paraphrase
  is a lossy re-encoding of the only authoritative sentence in the spec."

  Add the founder's own sentence as a blockquote, e.g.

      > Founder framing, verbatim: *"I want the thing to stop asking me which
      > model every single time."*

  The quoted span must be at least 40 characters (found: ${quoted_len}).

  If there genuinely was no conversation to mine — a cold /create-spec from a
  one-line description — declare it in frontmatter instead:

      intent: cold-start
MSG
exit 1
