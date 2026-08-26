#!/usr/bin/env python3
"""Codex-native PreToolUse gate for shared instruction edits."""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

MARKER = Path("/tmp/.codex-instruction-gate-ok")
MAX_AGE_SECONDS = 1800
PATCH_PATH_RE = re.compile(r"^\*\*\* (?:Update|Add|Delete) File: (.+)$", re.MULTILINE)


def emit(payload=None):
    print(json.dumps(payload or {}, separators=(",", ":")))


def paths(data):
    tool_input = data.get("tool_input")
    if not isinstance(tool_input, dict):
        return []
    direct = tool_input.get("file_path") or tool_input.get("path")
    if isinstance(direct, str) and direct:
        return [direct]
    command = tool_input.get("command")
    if not isinstance(command, str):
        return []
    return [item.strip() for item in PATCH_PATH_RE.findall(command)]


def guarded(path):
    normalized = path.replace("\\", "/")
    return bool(
        re.search(r"(^|/)AGENTS\.md$", normalized)
        or re.search(r"(^|/)CLAUDE\.md$", normalized)
        or re.search(r"(^|/)\.claude/rules/[^/]+\.md$", normalized)
    )


def marker_valid():
    try:
        return MARKER.is_file() and time.time() - MARKER.stat().st_mtime < MAX_AGE_SECONDS
    except Exception:
        return False


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        emit()
        return
    if not isinstance(data, dict) or not any(guarded(path) for path in paths(data)):
        emit()
        return
    if marker_valid():
        try:
            MARKER.unlink()
        except Exception:
            pass
        emit()
        return
    emit(
        {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": "Run the applicable AGENTS/CLAUDE instruction-file gate, then create /tmp/.codex-instruction-gate-ok and retry. The marker is single-use and expires after 30 minutes.",
            }
        }
    )


if __name__ == "__main__":
    main()
