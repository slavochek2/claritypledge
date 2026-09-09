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
    PATHS+=("${line:3}")
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

# Does a transcript line record a WRITE to a path (as opposed to a read, a grep hit, or an
# error message that merely names the file)? Two shapes count:
#   - a file-editing tool call:  "name":"Edit"|"Write"|"MultiEdit"|"NotebookEdit" + "file_path":"<path>"
#   - a Bash command that mutates the path: redirection, sed -i, tee, cp/mv onto it
#
# Attribution runs as ONE pass over the transcripts for ALL paths at once, not one pass per
# path: the per-path form took 80s on a 13-file dirty set, which is long enough that a
# caller would be tempted to skip it, and a check that gets skipped protects nothing.
esc_path() { printf '%s' "$1" | sed 's/[][\.*^$/|(){}+?]/\\&/g'; }

# macOS ships bash 3.2, which has no associative arrays — owners are kept in a temp file
# of "<path>\t<mtime>\t<session>\t<project>" records, newest write per path winning.
OWNERS="$(mktemp)"
trap 'rm -f "$OWNERS"' EXIT

build_attribution() {
  local -a esc=()
  local p
  for p in "${PATHS[@]:-}"; do [[ -z "$p" ]] && continue; esc+=("$(esc_path "$p")"); done
  local alt; alt="$(IFS='|'; printf '%s' "${esc[*]}")"
  # Evidence comes in two strengths, and the difference decides whether a file may be
  # COMMITTED or only left alone.
  #
  # STRONG — the record shows the path as the TARGET of a write:
  #   * an editing tool call (Edit/Write/MultiEdit/NotebookEdit) with a matching file_path
  #   * a redirect whose target is the path (`> path`, `>> path`) — the path must follow the
  #     operator directly, which is what separates `cat > a.md` from `grep 2>/dev/null … a.md`
  #   * tee / sed -i / cp / mv naming the path
  # WEAK — the path merely appears in a mutating command (it may be an argument being read,
  #   with the mutation aimed elsewhere; `2>/dev/null` is the common case).
  #
  # Only STRONG evidence from THIS session yields MINE, because MINE is the one verdict that
  # licenses a commit — and a file this session only inspected must never be committed on the
  # strength of a redirect that pointed at /dev/null. WEAK evidence still suffices to leave a
  # file alone and name a likely owner, which is the safe direction.
  #
  # Scoped with an escape-aware run — ([^"\]|\.)* — not `[^"]*` (stops at the first \" inside
  # a heredoc, missing real writes) and not `.*` (spans the whole record, so one tool call's
  # `git status` gets credited with another's path). Both were measured on the live tree.
  local jrun='([^"\\]|\\.)*'
  local edit_tools='"name":"(Edit|Write|MultiEdit|NotebookEdit)"'
  # A script-language rewrite (`python3 - <<PY … open(p,"w") … PY`) is a real write with no
  # redirect and no editing-tool call. It is STRONG when the command carries both the path and
  # a write idiom, in either order — the path is usually bound to a variable well above the
  # open(). Found by dogfooding: this skill's own edits classified as another session's ORPHAN.
  local wr='(open\(|write_text\(|\.write\(|writelines\()'
  local pat_strong="(${edit_tools}.*\"file_path\":\"[^\"]*(${alt})\")|(\"command\":\"${jrun}(>>?[[:space:]]*\"?|tee (-a )?|sed -i[^[:space:]]* |cp ${jrun} |mv ${jrun} )(${alt}))|(\"command\":\"${jrun}(${alt})${jrun}${wr})|(\"command\":\"${jrun}${wr}${jrun}(${alt}))"
  local pat_weak="\"command\":\"${jrun}(>|tee |sed -i|cp |mv )${jrun}(${alt})"

  local f mtime sid proj hit strength pat
  for f in "${TRANSCRIPTS[@]:-}"; do
    [[ -z "$f" ]] && continue
    grep -qE -- "$pat_weak" "$f" 2>/dev/null || grep -qE -- "$pat_strong" "$f" 2>/dev/null || continue
    mtime="$(stat -f %m "$f")"
    sid="$(basename "$f" .jsonl)"
    proj="$(basename "$(dirname "$f")")"
    for strength in STRONG WEAK; do
      [[ "$strength" == STRONG ]] && pat="$pat_strong" || pat="$pat_weak"
      while IFS= read -r hit; do
        for p in "${PATHS[@]:-}"; do
          [[ "$hit" == *"$p"* ]] || continue
          printf '%s\t%s\t%s\t%s\t%s\n' "$p" "$mtime" "$sid" "$proj" "$strength" >> "$OWNERS"
        done
      done < <(grep -ohE -- "$pat" "$f" 2>/dev/null)
    done
  done
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
      if [[ -n "$src" ]] && awk -F'\t' -v s="$src" '$1==s && $5=="STRONG"' "$OWNERS" \
           | grep -qF "$SESSION_ID"; then
        emit MINE "$p" "stage and commit" "generated mirror of ${src}, which this session wrote"
      else
        emit GENERATED "$p" "leave uncommitted" \
          "generated mirror of ${src:-an unknown skill}; regenerate with scripts/sync-agent-skills.sh and commit it with that skill, not on its own"
      fi
      continue
      ;;
  esac

  # 3. Transcript attribution — the evidence that used to be missing.
  # Strong evidence first; a weak-only match never licenses a commit.
  owner_rec="$(awk -F'\t' -v p="$p" '$1==p && $5=="STRONG"' "$OWNERS" | sort -t"$(printf '\t')" -k2,2n | tail -1)"
  weak_only=0
  if [[ -z "$owner_rec" ]]; then
    owner_rec="$(awk -F'\t' -v p="$p" '$1==p' "$OWNERS" | sort -t"$(printf '\t')" -k2,2n | tail -1)"
    weak_only=1
  fi
  if [[ -n "$owner_rec" ]]; then
    o_mtime="$(cut -f2 <<<"$owner_rec")"; o_sid="$(cut -f3 <<<"$owner_rec")"; o_proj="$(cut -f4 <<<"$owner_rec")"
    # A transcript being appended to right now can carry an mtime a second ahead of our
    # clock read; clamp rather than print a negative age.
    age_min=$(( (now - o_mtime) / 60 )); (( age_min < 0 )) && age_min=0
    where="${o_proj##*claritypledge}"; where="${where:-/ (main checkout)}"
    if [[ -n "$SESSION_ID" && "$o_sid" == "$SESSION_ID" ]]; then
      if (( weak_only )); then
        emit UNKNOWN "$p" "leave uncommitted" \
          "this session touched the path in a command, but no write to it was recorded — not committing on weak evidence"
      else
        emit MINE "$p" "stage and commit" "written by this session (${o_sid:0:8})"
      fi
      continue
    fi
    ev="$( (( weak_only )) && printf 'likely written by' || printf 'written by' )"
    if (( age_min <= LIVE_MINUTES )); then
      emit SESSION "$p" "leave uncommitted" \
        "${ev} LIVE session ${o_sid:0:8} in ${where}, active ${age_min}m ago; exposed on shared main until that session commits it"
      continue
    fi
    emit ORPHAN "$p" "leave uncommitted" \
      "${ev} session ${o_sid:0:8} in ${where}, idle ${age_min}m; no live owner"
    continue
  fi

  # 4. Live worktree artifact (the documented migration / deploy-manifest exception).
  if w="$(worktree_owner "$p")"; then
    emit WORKTREE "$p" "leave uncommitted" \
      "same path dirty in ${w##*/} ($(git -C "$w" rev-parse --abbrev-ref HEAD 2>/dev/null)); exposed on shared main until that session commits it"
    continue
  fi

  # 5. No evidence either way — report with an age so the human can act LATER if it matters.
  if git ls-files --error-unmatch -- "$p" >/dev/null 2>&1; then
    age="$(git log -1 --format=%cr -- "$p" 2>/dev/null)"
    emit UNKNOWN "$p" "leave uncommitted" "tracked, last committed ${age:-unknown}; no write found in ${TRANSCRIPT_DAYS}d of transcripts"
  else
    age="$(stat -f '%Sm' -t '%Y-%m-%d %H:%M' "$p" 2>/dev/null)"
    emit UNKNOWN "$p" "leave uncommitted" "untracked, mtime ${age:-unknown}; no write found in ${TRANSCRIPT_DAYS}d of transcripts"
  fi
done
