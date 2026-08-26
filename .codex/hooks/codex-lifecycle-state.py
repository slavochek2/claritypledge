#!/usr/bin/env python3
"""Codex-native lifecycle policy for P1157.

Consumes stable hook event fields only. It never parses transcript JSONL.
State is bounded to one small JSON file per session/turn plus one UI marker per
session, under the system temp directory.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shlex
import sys
import tempfile
from pathlib import Path
from typing import Any

CLAIM_RE = re.compile(
    r"\b(done|complete(?:d)?|fixed|implemented|shipped|ready|works|working|verified|"
    r"all tests pass(?:ed)?|live)\b",
    re.IGNORECASE,
)
NOT_SEEING_RE = re.compile(
    r"\b(don'?t see|do not see|not showing|nothing changed|still broken|doesn'?t show|"
    r"not working|didn'?t change|no visible change|looks the same)\b",
    re.IGNORECASE,
)
UI_PATH_RE = re.compile(r"\.(tsx|jsx|css)$", re.IGNORECASE)
PATCH_PATH_RE = re.compile(r"^\*\*\* (?:Update|Add|Delete) File: (.+)$", re.MULTILINE)
HTTP_FAILURE_RE = re.compile(r"\bHTTP(?:/\S+)?[ /:]([45]\d\d)\b", re.IGNORECASE)
# A browser tool that FAILED must not certify a turn as verified. Codex sends
# tool_response as a plain STRING even on failure (observed: a command exiting 7
# arrives as just its stdout), so `bool(response)` was true for
# "Error: No page selected" -- a failed screenshot satisfied the gate. Fail
# closed on anything that reads like an error, and apply the HTTP-failure check
# to this branch too, not only to Bash.
BROWSER_FAILURE_RE = re.compile(
    r"\b(error|errno|failed|failure|exception|traceback|cannot|could ?n[o']?t|"
    r"unable to|denied|refused|timed? ?out|timeout|not found|no such|"
    r"unreachable|disconnected|no page|not connected|invalid)\b",
    re.IGNORECASE,
)
BROWSER_PREFIXES = (
    "mcp__chrome",
    "mcp__playwright",
    "mcp__claude-in-chrome",
    "browser",
    "screenshot",
)
TEST_COMMAND_RE = re.compile(
    r"\b(npm test|npm run test|npx vitest|playwright test|npm run build|"
    r"sync-agent-skills\.sh --check|pre-commit-checks\.sh)\b",
    re.IGNORECASE,
)
VERIFIED_SENTINEL = "__CODEX_VERIFICATION_EXIT_0__"


def emit(payload: dict[str, Any] | None = None) -> None:
    print(json.dumps(payload or {}, separators=(",", ":")))


def load_input() -> dict[str, Any]:
    try:
        value = json.load(sys.stdin)
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def state_root() -> Path:
    configured = os.environ.get("CODEX_HOOK_STATE_DIR")
    return Path(configured) if configured else Path(tempfile.gettempdir()) / "claritypledge-codex-hooks"


def safe_key(*parts: str) -> str:
    return hashlib.sha256("\0".join(parts).encode("utf-8", "replace")).hexdigest()


def state_path(data: dict[str, Any]) -> Path | None:
    session = data.get("session_id")
    turn = data.get("turn_id")
    if not isinstance(session, str) or not session or not isinstance(turn, str) or not turn:
        return None
    return state_root() / f"turn-{safe_key(session, turn)}.json"


def ui_path(data: dict[str, Any]) -> Path | None:
    session = data.get("session_id")
    if not isinstance(session, str) or not session:
        return None
    return state_root() / f"ui-{safe_key(session)}.json"


def read_state(path: Path | None) -> dict[str, Any]:
    if path is None:
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def write_state(path: Path | None, value: dict[str, Any]) -> None:
    if path is None:
        return
    try:
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        temp = path.with_suffix(f".{os.getpid()}.tmp")
        temp.write_text(json.dumps(value, separators=(",", ":")), encoding="utf-8")
        os.chmod(temp, 0o600)
        os.replace(temp, path)
    except Exception:
        pass


def patch_paths(data: dict[str, Any]) -> list[str]:
    tool_input = data.get("tool_input")
    if not isinstance(tool_input, dict):
        return []
    direct = tool_input.get("file_path") or tool_input.get("path")
    if isinstance(direct, str) and direct:
        return [direct]
    command = tool_input.get("command")
    if not isinstance(command, str):
        return []
    return [match.strip() for match in PATCH_PATH_RE.findall(command) if match.strip()]


def response_text(response: Any) -> str:
    if isinstance(response, str):
        return response
    try:
        return json.dumps(response, separators=(",", ":"))
    except Exception:
        return ""


def response_succeeded(response: Any) -> bool:
    if response is None:
        return False
    if isinstance(response, dict):
        if response.get("isError") is True:
            return False
        for key in ("exit_code", "exitCode"):
            if key in response:
                return response.get(key) == 0
        if response.get("error"):
            return False
        return response.get("isError") is False or bool(response)
    return bool(response)


def browser_verification_succeeded(response: Any) -> bool:
    """A browser check certifies a turn only on an explicit, non-error result."""
    if isinstance(response, dict):
        if response.get("isError") is True or response.get("error"):
            return False
        for key in ("exit_code", "exitCode"):
            if key in response:
                return response.get(key) == 0
        if response.get("isError") is False:
            return not _browser_text_failed(response_text(response))
        return bool(response) and not _browser_text_failed(response_text(response))
    if isinstance(response, str):
        # The real, observed shape. A bare string is not proof of success, so
        # anything that reads like a failure is rejected outright.
        return bool(response.strip()) and not _browser_text_failed(response)
    return False


def _browser_text_failed(text: str) -> bool:
    return bool(BROWSER_FAILURE_RE.search(text) or HTTP_FAILURE_RE.search(text))


def apply_patch_succeeded(response: Any) -> bool:
    if isinstance(response, str):
        return bool(
            re.search(r"(?:^|\n)Exit code:\s*0(?:\n|$)", response)
            or "Success. Updated" in response
        )
    return response_succeeded(response)


def verified_runner_args(command: str) -> str | None:
    # The runner execs argv directly. Reject shell composition so a successful
    # `runner true` cannot borrow a test/curl token from an unrelated command.
    if any(token in command for token in (";", "&", "|", "`", "$(", "\n")):
        return None
    try:
        words = shlex.split(command)
    except ValueError:
        return None
    if len(words) < 2 or words[0] not in (
        ".codex/hooks/run-verified.sh",
        "./.codex/hooks/run-verified.sh",
    ):
        return None
    return " ".join(words[1:])


def verification_succeeded(data: dict[str, Any]) -> bool:
    tool_name = data.get("tool_name")
    tool_input = data.get("tool_input")
    response = data.get("tool_response")
    if not isinstance(tool_name, str) or not isinstance(tool_input, dict):
        return False
    if not response_succeeded(response):
        return False

    lowered_name = tool_name.lower()
    if any(lowered_name.startswith(prefix) for prefix in BROWSER_PREFIXES):
        return browser_verification_succeeded(response)
    # NOTE: an unconditional `if tool_name == "Agent": return True` used to sit
    # here -- an unverified bypass inside a verification gate. Codex ships no
    # tool by that name (it emits shell/apply_patch/update_plan/view_image, and
    # normalises shell -> Bash in hook payloads), so it certified nothing real,
    # but a delegated "I could not verify anything" would have satisfied the
    # gate had one ever appeared. Removed rather than left as dead code.
    if tool_name != "Bash":
        return False

    command = tool_input.get("command")
    if not isinstance(command, str):
        return False
    runner_args = verified_runner_args(command)
    if runner_args is None:
        return False
    output = response_text(response)
    if VERIFIED_SENTINEL not in output or HTTP_FAILURE_RE.search(output):
        return False
    if TEST_COMMAND_RE.search(runner_args):
        return True
    if not re.search(r"\bcurl\b", runner_args):
        return False
    return bool(re.search(r"(?:^|\s)(?:-f|--fail(?:-with-body)?)(?:\s|$)", runner_args))


def deny(reason: str) -> dict[str, Any]:
    return {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }


def main() -> None:
    data = load_input()
    event = data.get("hook_event_name")
    if not isinstance(event, str):
        emit()
        return

    if event == "UserPromptSubmit":
        prompt = data.get("prompt")
        if isinstance(prompt, str) and NOT_SEEING_RE.search(prompt):
            write_state(ui_path(data), {"pending": True})
        emit()
        return

    if event == "PreToolUse":
        if data.get("tool_name") == "apply_patch" and any(UI_PATH_RE.search(path) for path in patch_paths(data)):
            if read_state(ui_path(data)).get("pending") is True:
                emit(deny("Take a successful browser screenshot or run visual QA before re-editing this UI file."))
                return
        emit()
        return

    if event == "PostToolUse":
        turn_state_path = state_path(data)
        turn_state = read_state(turn_state_path)
        if data.get("tool_name") == "apply_patch" and apply_patch_succeeded(data.get("tool_response")):
            turn_state["edited"] = True
        if verification_succeeded(data):
            turn_state["verified"] = True
            current_ui = ui_path(data)
            if current_ui is not None:
                try:
                    current_ui.unlink(missing_ok=True)
                except Exception:
                    pass
        write_state(turn_state_path, turn_state)
        emit()
        return

    if event == "Stop":
        if data.get("stop_hook_active") is True:
            emit()
            return
        message = data.get("last_assistant_message")
        if not isinstance(message, str) or not CLAIM_RE.search(message):
            emit()
            return
        turn_state = read_state(state_path(data))
        if turn_state.get("edited") is True and turn_state.get("verified") is not True:
            emit(
                {
                    "decision": "block",
                    "reason": "A completion claim followed an edit without successful independent verification. Run `.codex/hooks/run-verified.sh <test command>` (or a fail-closed curl through that runner), or perform a browser check, then report its result.",
                }
            )
            return
        emit()
        return

    emit()


if __name__ == "__main__":
    main()
