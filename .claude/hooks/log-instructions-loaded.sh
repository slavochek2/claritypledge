#!/usr/bin/env bash
# Measurement instrument, not a gate.
#
# Logs every CLAUDE.md / .claude/rules/*.md load so the always-on context
# footprint can be measured instead of estimated. Answers: which instruction
# files actually load every session, which path-scoped rules ever fire, and
# which never do (= dead context, or a glob that does not match reality).
#
# Registered on InstructionsLoaded with no matcher, so it sees every load
# reason (session_start, nested_traversal, path_glob_match, include, compact).
# Exit code is ignored for this event by design — this can never block a load.
#
# Records the raw hook payload verbatim rather than naming fields: the
# event-specific schema is undocumented, so storing the whole object keeps the
# log correct even if field names differ from what we guessed.
#
# Log lives outside the repo (public) at ~/.claude/instructions-loaded.log.

set -uo pipefail

export LOG_PATH="${HOME}/.claude/instructions-loaded.log"

python3 -c '
import json, sys, datetime, pathlib, os
raw = sys.stdin.read()
try:
    payload = json.loads(raw)
except Exception:
    payload = {"unparsed": raw[:2000]}
entry = {"ts": datetime.datetime.now().astimezone().isoformat(), "payload": payload}
log = pathlib.Path(os.environ["LOG_PATH"])
log.parent.mkdir(parents=True, exist_ok=True)
with log.open("a") as fh:
    fh.write(json.dumps(entry) + "\n")
' || true

exit 0
