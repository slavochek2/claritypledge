#!/usr/bin/env bash
# classify-dirty-files.sh — decide, without asking the human, what to do with every
# dirty file on the shared main checkout.
#
# P1287. Background: /push step 2 classified bystander dirty files into three buckets
# (P1264) and bucket 3 fell through to "list them once and ask" — so every /push with an
# unattributed dirty file cost the founder a decision he had no evidence to make better
# than the agent could. This script supplies the missing evidence (who actually wrote the
# file) and encodes the one safe default (commit only your own; leave everything else and
# say so), so the ask is never needed.
#
# Every check here is READ-ONLY. The script never stages, commits, resets or deletes —
# it prints a verdict and the caller acts. That is deliberate: an oracle that mutates the
# state it is judging destroys its own evidence (.claude/rules/epistemic.md gate 2b).
#
# Usage:
#   scripts/classify-dirty-files.sh [--session-id <uuid>] [--json] [path...]
#
# With no paths, classifies every dirty path reported by `git status --porcelain
# --no-renames` at the repo root. --session-id names the CURRENT session's transcript so
# its own writes classify as MINE (default: $CLAUDE_SESSION_ID).
#
# Output: one TAB-separated record per path —
#   <verdict>\t<path>\t<action>\t<evidence>
#
# Verdicts and the action each one licenses:
#   MINE       this session wrote it            → stage and commit it
#   NOOP       staged content identical to HEAD → git reset HEAD -- <path>
#   GENERATED  tool-regenerated artifact        → leave; never commit from /push
#   WORKTREE   dirty in a live worktree too     → leave; report the exposure
#   SESSION    another LIVE session wrote it    → leave; report the owner
#   ORPHAN     written by a session now idle    → leave; report the age
#   UNKNOWN    no evidence either way           → leave; report it
#
# Only MINE is committable. Everything else is left untouched — the safe default, since
# leaving a file uncommitted loses no work, while committing another session's in-flight
# edit under your message does (.claude/rules/git.md, 2026-08-28 and 2026-09-03).

set -uo pipefail

# Resolve the helper against THIS script, not the repo root: the canary runs the script
# against a throwaway repo that has no scripts/ of its own.
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT" || exit 1

SESSION_ID="${CLAUDE_SESSION_ID:-}"
EMIT_JSON=0
PATHS=()

while (( $# )); do
  case "$1" in
    --session-id) SESSION_ID="${2:-}"; shift 2 ;;
    --json)       EMIT_JSON=1; shift ;;
    -h|--help)    sed -n '2,40p' "$0"; exit 0 ;;
    *)            PATHS+=("$1"); shift ;;
  esac
done

# A session is "live" if its transcript was appended to within this many minutes.
LIVE_MINUTES="${CLASSIFY_LIVE_MINUTES:-45}"
# How far back to look for transcripts that could hold the write.
TRANSCRIPT_DAYS="${CLASSIFY_TRANSCRIPT_DAYS:-14}"

# Paths whose content is written by a tool, not a person: committing them from /push
# attributes a machine stamp to whoever happened to push. Kept deliberately short — an
# over-broad list here silently swallows real edits.
is_generated() {
  case "$1" in
    supabase/.temp/*|.privacy-reviewed|supabase/deploy-manifest.json) return 0 ;;
    *) return 1 ;;
  esac
}

# ---- collect the dirty set -------------------------------------------------
if (( ${#PATHS[@]} == 0 )); then
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    entry="${line:3}"
    # git quotes any path containing a tab, newline, quote or non-ASCII byte. Parsing the
    # quoted form as a literal path silently classifies the WRONG file — report it instead.
    if [[ "$entry" == '"'* ]]; then
      emit UNKNOWN "$entry" "leave uncommitted" "filename is quoted by git (contains a tab, newline or quote); not classified — resolve by hand"
      continue
    fi
    PATHS+=("$entry")
  done < <(git status --porcelain --no-renames)
fi
(( ${#PATHS[@]} == 0 )) && exit 0

# ---- transcript index ------------------------------------------------------
# Every Claude Code session in this repo (main checkout and worktrees) writes a .jsonl
# transcript under ~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl. The transcripts
# are the only record of WHO wrote a file that does not depend on a peer session being
# awake and willing to answer.
TRANSCRIPTS=()
while IFS= read -r t; do TRANSCRIPTS+=("$t"); done < <(
  find "${CLASSIFY_TRANSCRIPT_ROOT:-$HOME/.claude/projects}" -maxdepth 2 -name '*.jsonl' \
       -mtime "-${TRANSCRIPT_DAYS}" -path "*${CLASSIFY_PROJECT_MATCH:-claritypledge}*" 2>/dev/null
)

# Attribution runs as ONE pass over the transcripts for ALL paths, in a JSON parser rather
# than a regex — see scripts/lib/attribute-writes.py for why (a hostile review reproduced two
# cross-session misattributions in the regex version; parsing binds each file_path to the tool
# call it belongs to). Results land in a temp file of
# "<path>\t<mtime>\t<session>\t<project>\t<STRONG|WEAK>" records.
OWNERS="$(mktemp)"
trap 'rm -f "$OWNERS"' EXIT

build_attribution() {
  printf '%s\n' "${TRANSCRIPTS[@]:-}" \
    | python3 "$SELF_DIR/lib/attribute-writes.py" "${PATHS[@]}" > "$OWNERS"
}

# ---- worktree index --------------------------------------------------------
WORKTREES=()
while IFS= read -r w; do
  [[ "$w" == "$ROOT" ]] && continue
  WORKTREES+=("$w")
done < <(git worktree list --porcelain | awk '/^worktree /{print $2}')

# Is $1 dirty in some other worktree, at the SAME relative path? A shared basename is a
# coincidence, not ownership (P1264) — so this compares full relative paths only.
worktree_owner() {
  local p="$1" w
  for w in "${WORKTREES[@]:-}"; do
    [[ -z "$w" ]] && continue
    if [[ -n "$(git -C "$w" status --porcelain --no-renames -- "$p" 2>/dev/null)" ]]; then
      printf '%s\n' "$w"
      return 0
    fi
  done
  return 1
}

emit() { # verdict path action evidence
  if (( EMIT_JSON )); then
    printf '{"verdict":"%s","path":"%s","action":"%s","evidence":"%s"}\n' "$1" "$2" "$3" "$4"
  else
    printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4"
  fi
}

build_attribution

now=$(date +%s)

for p in "${PATHS[@]}"; do
  # 1. Stale no-op index entry: staged content already matches HEAD. --no-renames on both
  #    checks, since rename detection can collapse a real change into a fake no-op (git.md).
  if [[ -n "$(git diff --cached --no-renames --name-only -- "$p")" ]] \
     && [[ -z "$(git diff --no-renames HEAD -- "$p")" ]]; then
    emit NOOP "$p" "git reset HEAD -- $p" "staged content identical to HEAD"
    continue
  fi

  # 2. Tool-regenerated artifact.
  if is_generated "$p"; then
    emit GENERATED "$p" "leave uncommitted" "tool-regenerated artifact, not authored content"
    continue
  fi

  # 2b. Generated skill mirror. `.agents/skills/<name>/SKILL.md` is produced by
  # scripts/sync-agent-skills.sh from the skill of the same name, and pre-commit check "Agent
  # skills sync" BLOCKS a commit that moves one without the other — so unlike the other
  # generated artifacts this one must ship WITH its source, and only when that source is ours.
  case "$p" in
    .agents/skills/*/SKILL.md)
      mirror_name="${p#.agents/skills/}"; mirror_name="${mirror_name%/SKILL.md}"
      src="$(find .claude/commands -name "${mirror_name}.md" -o -path "*/${mirror_name}/SKILL.md" 2>/dev/null | head -1)"
      # Claim the mirror only if we wrote its source AND no other session wrote the mirror
      # itself — otherwise a peer's regenerated mirror rides out under our authorship.
      mirror_claimed_by_peer=0
      if [[ -n "$SESSION_ID" ]] && awk -F'\t' -v m="$p" '$1==m && $5=="STRONG"' "$OWNERS" \
           | grep -qv -- "$SESSION_ID" ; then mirror_claimed_by_peer=1; fi
      if [[ -n "$src" ]] && (( ! mirror_claimed_by_peer )) \
         && awk -F'\t' -v s="$src" '$1==s && $5=="STRONG"' "$OWNERS" | grep -qF "$SESSION_ID"; then
        emit MINE "$p" "stage and commit" "generated mirror of ${src}, which this session wrote"
      else
        emit GENERATED "$p" "leave uncommitted" \
          "generated mirror of ${src:-an unknown skill}; regenerate with scripts/sync-agent-skills.sh and commit it with that skill, not on its own"
      fi
      continue
      ;;
  esac

  # 3. Transcript attribution — the evidence that used to be missing.
  # Ownership is decided by STRONG evidence only. WEAK evidence — the path appears in a
  # command that mutates something, with the mutation aimed elsewhere — never names an owner
  # and never licenses a commit; it is reported as a hint inside UNKNOWN. Naming an owner on
  # weak evidence produced a confident, wrong attribution in review (a peer that had only run
  # `grep file 2>/dev/null` was reported as the writer).
  owner_rec="$(awk -F'\t' -v p="$p" '$1==p && $5=="STRONG"' "$OWNERS" | sort -t"$(printf '\t')" -k2,2n | tail -1)"
  if [[ -n "$owner_rec" ]]; then
    o_mtime="$(cut -f2 <<<"$owner_rec")"; o_sid="$(cut -f3 <<<"$owner_rec")"; o_proj="$(cut -f4 <<<"$owner_rec")"
    # A transcript being appended to right now can carry an mtime a second ahead of our
    # clock read; clamp rather than print a negative age.
    age_min=$(( (now - o_mtime) / 60 )); (( age_min < 0 )) && age_min=0
    where="${o_proj##*claritypledge}"; where="${where:-/ (main checkout)}"
    if [[ -n "$SESSION_ID" && "$o_sid" == "$SESSION_ID" ]]; then
      emit MINE "$p" "stage and commit" "written by this session (${o_sid:0:8})"
    elif (( age_min <= LIVE_MINUTES )); then
      emit SESSION "$p" "leave uncommitted" \
        "written by LIVE session ${o_sid:0:8} in ${where}, active ${age_min}m ago; exposed on shared main until that session commits it"
    else
      # An idle session's write is only the CURRENT state if the file has not changed since.
      # Compare the file's mtime against the transcript's: a file modified well after its last
      # recorded write has been edited by something we could not attribute — reporting the old
      # writer as its owner would outrank a live session's own knowledge of what it just did.
      f_mtime="$(stat -f %m "$p" 2>/dev/null || echo 0)"
      if (( f_mtime > o_mtime + 300 )); then
        emit UNKNOWN "$p" "leave uncommitted" \
          "last recorded write was session ${o_sid:0:8} (idle ${age_min}m), but the file changed $(( (f_mtime - o_mtime) / 60 ))m after that — writer of the current content unknown"
      else
        emit ORPHAN "$p" "leave uncommitted" \
          "written by session ${o_sid:0:8} in ${where}, idle ${age_min}m; no live owner"
      fi
    fi
    continue
  fi
  weak_rec="$(awk -F'\t' -v p="$p" '$1==p' "$OWNERS" | sort -t"$(printf '\t')" -k2,2n | tail -1)"

  # 4. Live worktree artifact (the documented migration / deploy-manifest exception).
  if w="$(worktree_owner "$p")"; then
    emit WORKTREE "$p" "leave uncommitted" \
      "same path dirty in ${w##*/} ($(git -C "$w" rev-parse --abbrev-ref HEAD 2>/dev/null)); exposed on shared main until that session commits it"
    continue
  fi

  # 5. No evidence either way — report with an age so the human can act LATER if it matters.
  hint=""
  if [[ -n "$weak_rec" ]]; then
    ws="$(cut -f3 <<<"$weak_rec")"
    hint=" (session ${ws:0:8} named it in a mutating command, but no write to it was recorded)"
  fi
  if git ls-files --error-unmatch -- "$p" >/dev/null 2>&1; then
    age="$(git log -1 --format=%cr -- "$p" 2>/dev/null)"
    emit UNKNOWN "$p" "leave uncommitted" "tracked, last committed ${age:-unknown}; no write found in ${TRANSCRIPT_DAYS}d of transcripts${hint}"
  else
    age="$(stat -f '%Sm' -t '%Y-%m-%d %H:%M' "$p" 2>/dev/null)"
    emit UNKNOWN "$p" "leave uncommitted" "untracked, mtime ${age:-unknown}; no write found in ${TRANSCRIPT_DAYS}d of transcripts${hint}"
  fi
done
