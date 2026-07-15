"""Shared JSONL transcript helpers for hook scripts under .claude/hooks/.

Not itself a hook — imported by verify-before-stop.py and
verify-screenshot-before-reedit.py to avoid drift between two copies of the
same parsing logic.
"""
import json

# Bound worst-case parse time on very long sessions — only the tail of the
# transcript is relevant to "since the last Edit" / "since the last complaint"
# checks anyway.
MAX_LINES = 2000


def iter_transcript(path):
    try:
        with open(path) as f:
            lines = f.readlines()[-MAX_LINES:]
        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except Exception:
                continue
    except Exception:
        return


def extract_text(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(
            block.get("text", "")
            for block in content
            if isinstance(block, dict) and block.get("type") == "text"
        )
    return ""


def extract_tool_uses(content):
    if not isinstance(content, list):
        return []
    return [b for b in content if isinstance(b, dict) and b.get("type") == "tool_use"]


def get_message_content(entry):
    message = entry.get("message")
    if not isinstance(message, dict):
        return None
    return message.get("content")
