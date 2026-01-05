#!/usr/bin/env python3
"""
Telegram Cloud Agent Handler v2
- Task-focused status (not git noise)
- Checkpoint progress detection
- Completion notifications
- Forward user messages to agent
- Multi-worktree support
"""
import os
import subprocess
import time
import requests
import re
import json
import sys
from pathlib import Path

# =============================================================================
# CONFIGURATION - Load from environment variables
# =============================================================================
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")

if not TELEGRAM_TOKEN or not CHAT_ID:
    print("ERROR: Missing required environment variables:")
    print("  - TELEGRAM_BOT_TOKEN: Your Telegram bot token from @BotFather")
    print("  - TELEGRAM_CHAT_ID: Your Telegram chat ID")
    print("")
    print("Set them in your shell profile (~/.bashrc or ~/.zshrc):")
    print('  export TELEGRAM_BOT_TOKEN="your-token-here"')
    print('  export TELEGRAM_CHAT_ID="your-chat-id"')
    sys.exit(1)

# =============================================================================
# CONSTANTS
# =============================================================================
BASE_DIR = Path.home() / "claritypledge"
STATE_FILE = Path("/tmp/cloud-agent-state.json")
FEEDBACK_FILE = Path("/tmp/user-feedback.txt")
LAST_UPDATE_FILE = Path("/tmp/telegram_last_update")

# Timeouts and limits
REQUEST_TIMEOUT_SEC = 10
LONG_POLL_TIMEOUT_SEC = 15
CMD_TIMEOUT_SEC = 30
LOG_TAIL_BYTES = 5000
LOG_DISPLAY_CHARS = 1500
TASK_PREVIEW_CHARS = 80
PROACTIVE_CHECK_INTERVAL_SEC = 30

# =============================================================================
# STATE MANAGEMENT
# =============================================================================
def load_state():
    """Load persistent state from file. Returns defaults if file missing or corrupt."""
    try:
        return json.loads(STATE_FILE.read_text())
    except (FileNotFoundError, json.JSONDecodeError, PermissionError) as e:
        # Expected cases: file doesn't exist yet, or was corrupted
        return {"last_checkpoint": None, "last_commit": None, "task_started": None, "was_running": False}

def save_state(state):
    """Persist state to file."""
    STATE_FILE.write_text(json.dumps(state))

# =============================================================================
# TELEGRAM API
# =============================================================================
def send_message(text, parse_mode="Markdown"):
    """Send a message to the configured Telegram chat."""
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    try:
        requests.post(url, data={"chat_id": CHAT_ID, "text": text, "parse_mode": parse_mode}, timeout=REQUEST_TIMEOUT_SEC)
    except requests.RequestException as e:
        print(f"[Telegram] Failed to send message: {e}")

def get_updates(offset=0):
    """Poll Telegram for new messages."""
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/getUpdates"
    try:
        r = requests.get(url, params={"offset": offset, "timeout": REQUEST_TIMEOUT_SEC}, timeout=LONG_POLL_TIMEOUT_SEC)
        return r.json().get("result", [])
    except requests.RequestException as e:
        print(f"[Telegram] Failed to get updates: {e}")
        return []

# =============================================================================
# SHELL UTILITIES
# =============================================================================
def run_cmd(cmd, cwd=None, timeout=None):
    """Run a shell command and return combined stdout+stderr."""
    if timeout is None:
        timeout = CMD_TIMEOUT_SEC
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=cwd, timeout=timeout)
        return (result.stdout + result.stderr).strip()
    except subprocess.TimeoutExpired:
        print(f"[Shell] Command timed out after {timeout}s: {cmd[:50]}...")
        return ""
    except subprocess.SubprocessError as e:
        print(f"[Shell] Command failed: {e}")
        return ""

def is_agent_running():
    return "yes" in run_cmd("tmux has-session -t agent 2>/dev/null && echo yes || echo no")

def get_active_worktree():
    """Find which worktree has an active agent"""
    # Check main project first
    if is_agent_running():
        # Check tmux pane's cwd
        cwd = run_cmd("tmux display-message -t agent -p '#{pane_current_path}' 2>/dev/null")
        if cwd:
            return Path(cwd)
    return BASE_DIR

def get_task_info():
    """Get human-readable task info from the current task file."""
    try:
        task_file = Path("/tmp/current-task.txt")
        if task_file.exists():
            full_task = task_file.read_text().strip()
            # Shorten for display
            short = full_task[:TASK_PREVIEW_CHARS] + "..." if len(full_task) > TASK_PREVIEW_CHARS else full_task
            return short, full_task
    except (FileNotFoundError, PermissionError, OSError) as e:
        print(f"[Task] Failed to read task file: {e}")
    return "Unknown", "Unknown"

def get_checkpoint_progress(project_dir):
    """Parse commits to find checkpoint progress"""
    commits = run_cmd("git log --oneline -20", cwd=project_dir)

    checkpoints_done = []
    total_checkpoints = None

    for line in commits.split('\n'):
        # Match "checkpoint-N:" pattern
        match = re.search(r'checkpoint-(\d+):', line.lower())
        if match:
            cp_num = int(match.group(1))
            # Extract description
            desc_match = re.search(r'checkpoint-\d+:\s*(.+)', line, re.IGNORECASE)
            desc = desc_match.group(1)[:40] if desc_match else ""
            checkpoints_done.append((cp_num, desc))

    if checkpoints_done:
        checkpoints_done.sort(key=lambda x: x[0], reverse=True)
        latest = checkpoints_done[0]
        return latest[0], latest[1], len(checkpoints_done)

    return None, None, 0

def get_recent_activity(project_dir):
    """Get what the agent is doing based on recent output."""
    log_file = Path("/tmp/agent-output.log")
    if not log_file.exists():
        return "Starting..."

    try:
        logs = log_file.read_text()[-LOG_TAIL_BYTES:]  # Last N bytes

        # Look for meaningful patterns
        patterns = [
            (r'✓ Generating static pages', "Building pages..."),
            (r'✓ Compiled', "Compiled successfully"),
            (r'FAIL|FAILED|Error:', "⚠️ Tests failing"),
            (r'✓.*tests? passed', "✅ Tests passing"),
            (r'Running.*test', "Running tests..."),
            (r'npm run build', "Building..."),
            (r'npm install', "Installing deps..."),
            (r'Creating.*\.tsx?', "Creating files..."),
            (r'Editing.*\.tsx?', "Editing files..."),
        ]

        for pattern, msg in patterns:
            if re.search(pattern, logs, re.IGNORECASE):
                return msg

        # Count recent file changes
        files_created = len(re.findall(r'create mode \d+ (.+)', logs))
        if files_created > 0:
            return f"Created {files_created} files"

        return "Working..."
    except (FileNotFoundError, PermissionError, OSError) as e:
        print(f"[Activity] Failed to read log file: {e}")
        return "Working..."

def format_status():
    """Format a useful status message"""
    project_dir = get_active_worktree()
    running = is_agent_running()
    task_short, task_full = get_task_info()

    status_emoji = "🟢" if running else "⚪"
    status_text = "RUNNING" if running else "Stopped"

    msg = f"{status_emoji} *{status_text}*\n"
    msg += f"📋 {task_short}\n"

    if running:
        # Get checkpoint progress
        cp_num, cp_desc, cp_count = get_checkpoint_progress(project_dir)
        if cp_num is not None:
            msg += f"\n✅ Checkpoint {cp_num} done"
            if cp_desc:
                msg += f": {cp_desc}"
            msg += "\n"

        # Get current activity
        activity = get_recent_activity(project_dir)
        msg += f"🔄 {activity}\n"
    else:
        # Show last checkpoint if stopped
        cp_num, cp_desc, cp_count = get_checkpoint_progress(project_dir)
        if cp_num is not None:
            msg += f"\nLast: Checkpoint {cp_num}"
            if cp_desc:
                msg += f" - {cp_desc}"
            msg += "\n"
        msg += "\n💡 Run `/c pull` to get the work"

    return msg

def format_logs():
    """Get readable recent logs for display."""
    logs = run_cmd("tmux capture-pane -t agent -p 2>/dev/null | tail -30")
    if not logs.strip():
        # Try log file as fallback
        log_file = Path("/tmp/agent-output.log")
        if log_file.exists():
            try:
                logs = log_file.read_text()[-LOG_DISPLAY_CHARS * 2:]
            except (PermissionError, OSError) as e:
                print(f"[Logs] Failed to read log file: {e}")
                return "No logs available"

    if logs.strip():
        # Clean up ANSI codes for readability
        logs = re.sub(r'\x1b\[[0-9;]*m', '', logs)
        return f"```\n{logs[-LOG_DISPLAY_CHARS:]}\n```"
    return "No logs available"

def handle_command(text):
    text = text.strip().lower()

    if text in ["/status", "status", "s", "/s"]:
        return format_status()

    elif text in ["/logs", "logs", "l", "/l"]:
        return format_logs()

    elif text in ["/stop", "stop"]:
        run_cmd("tmux kill-session -t agent 2>/dev/null")
        return "🛑 Agent stopped"

    elif text in ["/commit", "commit", "save"]:
        project_dir = get_active_worktree()
        run_cmd("git add -A && git commit -m 'manual checkpoint' && git push", cwd=project_dir)
        return "💾 Saved and pushed"

    elif text in ["/help", "help", "h", "/h", "?"]:
        return """*Commands:*
/status (s) - Task progress
/logs (l) - Recent output
/stop - Stop agent
/commit - Save checkpoint

*Send text* = instruction to agent
(Agent will see it on next loop)"""

    else:
        # Forward as instruction to agent
        if text and not text.startswith("/"):
            ts = time.strftime("%H:%M")
            task_short, _ = get_task_info()
            project_dir = get_active_worktree()
            branch = run_cmd("git branch --show-current", cwd=project_dir) or "unknown"

            # Include context in feedback file
            with open(FEEDBACK_FILE, "a") as f:
                f.write(f"[{ts}] [{branch}] {text}\n")

            # Confirm to user with context
            return f"📝 Noted for *{branch}*:\n_{text[:50]}_\n\n📋 Task: {task_short}\n(Agent will see on next checkpoint)"
        return None

def check_for_updates():
    """Proactive notifications"""
    state = load_state()
    running = is_agent_running()
    project_dir = get_active_worktree()

    # Detect task completion
    if state.get("was_running") and not running:
        task_short, _ = get_task_info()
        cp_num, cp_desc, _ = get_checkpoint_progress(project_dir)

        msg = "✅ *Task Complete!*\n"
        msg += f"📋 {task_short}\n"
        if cp_num is not None:
            msg += f"📍 Reached checkpoint {cp_num}\n"
        msg += "\n💡 Run `/c pull` to get the work"
        send_message(msg)

    # Detect new checkpoint
    if running:
        cp_num, cp_desc, _ = get_checkpoint_progress(project_dir)
        if cp_num is not None and cp_num != state.get("last_checkpoint"):
            msg = f"📍 *Checkpoint {cp_num}*"
            if cp_desc:
                msg += f": {cp_desc}"
            send_message(msg)
            state["last_checkpoint"] = cp_num

    # Detect task start (new task file)
    try:
        task_file = Path("/tmp/current-task.txt")
        if task_file.exists():
            mtime = task_file.stat().st_mtime
            if mtime != state.get("task_started") and running:
                task_short, _ = get_task_info()
                send_message(f"🚀 *Started:* {task_short}")
                state["task_started"] = mtime
                state["last_checkpoint"] = None
    except (FileNotFoundError, PermissionError, OSError) as e:
        print(f"[Updates] Failed to check task file: {e}")

    state["was_running"] = running
    save_state(state)

def main():
    print("Telegram Handler v2 started")
    send_message("🤖 Handler ready. /help for commands")

    last_id = 0
    try:
        last_id = int(LAST_UPDATE_FILE.read_text().strip() or 0)
    except (FileNotFoundError, ValueError, PermissionError):
        # File doesn't exist yet, or contains invalid data - start from 0
        pass

    last_proactive_check = time.time()

    while True:
        # Handle incoming messages
        for u in get_updates(last_id + 1):
            uid = u.get("update_id", 0)
            txt = u.get("message", {}).get("text", "")
            cid = str(u.get("message", {}).get("chat", {}).get("id", ""))

            if cid == CHAT_ID and txt:
                resp = handle_command(txt)
                if resp:
                    send_message(resp)

            last_id = max(last_id, uid)
            try:
                LAST_UPDATE_FILE.write_text(str(last_id))
            except (PermissionError, OSError) as e:
                print(f"[Main] Failed to save last update ID: {e}")

        # Proactive updates at configured interval
        if time.time() - last_proactive_check > PROACTIVE_CHECK_INTERVAL_SEC:
            check_for_updates()
            last_proactive_check = time.time()

        time.sleep(2)

if __name__ == "__main__":
    main()
