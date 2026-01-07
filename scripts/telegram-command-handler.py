#!/usr/bin/env python3
"""
Telegram Cloud Agent Handler v6 - Simplified
- Tracks agents across worktrees 0-3 (cloud)
- Git branches are source of truth (no more Supabase status table)
- Completion notifications with worktree context
- Forward user messages to specific agents

v6 changes:
- Removed worktree_status Supabase table integration
- Simplified /status to show tmux + git info only
- Removed /worktrees command (use git commands instead)
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
# CONFIGURATION
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
MAX_WORKTREES = 4  # 0-3
HOME_DIR = Path.home()
STATE_FILE = Path("/tmp/cloud-agent-multi-state.json")
LAST_UPDATE_FILE = Path("/tmp/telegram_last_update")

# Timeouts and limits
REQUEST_TIMEOUT_SEC = 10
LONG_POLL_TIMEOUT_SEC = 15
CMD_TIMEOUT_SEC = 30
LOG_TAIL_BYTES = 5000
LOG_DISPLAY_CHARS = 1500
TASK_PREVIEW_CHARS = 60
PROACTIVE_CHECK_INTERVAL_SEC = 30


# =============================================================================
# WORKTREE HELPERS
# =============================================================================
def get_project_dir(wt):
    """Get project directory for worktree"""
    if wt == 0:
        return HOME_DIR / "claritypledge"
    return HOME_DIR / f"claritypledge-{wt}"


def get_tmux_session(wt):
    """Get tmux session name for worktree"""
    return f"agent-{wt}"


def get_task_file(wt):
    """Get task file path for worktree"""
    return Path(f"/tmp/current-task-{wt}.txt")


def get_log_file(wt):
    """Get log file path for worktree"""
    return Path(f"/tmp/agent-output-{wt}.log")


def get_feedback_file(wt):
    """Get feedback file path for worktree"""
    return Path(f"/tmp/user-feedback-{wt}.txt")


# =============================================================================
# STATE MANAGEMENT
# =============================================================================
def load_state():
    """Load persistent state from file."""
    try:
        return json.loads(STATE_FILE.read_text())
    except (FileNotFoundError, json.JSONDecodeError, PermissionError):
        # Initialize state for all worktrees
        state = {}
        for wt in range(MAX_WORKTREES):
            state[str(wt)] = {
                "last_checkpoint": None,
                "last_commit": None,
                "task_started": None,
                "was_running": False
            }
        return state


def save_state(state):
    """Persist state to file."""
    STATE_FILE.write_text(json.dumps(state))


# =============================================================================
# TELEGRAM API
# =============================================================================
def escape_markdown(text):
    """Escape special Markdown characters in user-provided text.

    Note: This escapes for Telegram's LEGACY Markdown mode (parse_mode="Markdown"),
    NOT MarkdownV2. Legacy Markdown only requires escaping: _ * ` [
    """
    if not text:
        return text
    # Legacy Markdown special chars only: _ * ` [
    # Do NOT escape ! | . etc - those are only needed for MarkdownV2
    special_chars = ['_', '*', '`', '[']
    for char in special_chars:
        text = text.replace(char, f'\\{char}')
    return text


def send_message(text, parse_mode="Markdown"):
    """Send a message to the configured Telegram chat."""
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    try:
        resp = requests.post(url, data={"chat_id": CHAT_ID, "text": text, "parse_mode": parse_mode}, timeout=REQUEST_TIMEOUT_SEC)
        # If markdown parsing fails, retry without formatting
        if resp.status_code == 400 and "parse" in resp.text.lower():
            print(f"[Telegram] Markdown parse error, retrying as plain text")
            requests.post(url, data={"chat_id": CHAT_ID, "text": text}, timeout=REQUEST_TIMEOUT_SEC)
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


def is_agent_running(wt):
    """Check if agent is running on specific worktree"""
    session = get_tmux_session(wt)
    return "yes" in run_cmd(f"tmux has-session -t {session} 2>/dev/null && echo yes || echo no")


def get_running_worktrees():
    """Get list of worktrees with running agents"""
    running = []
    for wt in range(MAX_WORKTREES):
        if is_agent_running(wt):
            running.append(wt)
    return running


def get_task_info(wt):
    """Get human-readable task info for a worktree."""
    try:
        task_file = get_task_file(wt)
        if task_file.exists():
            full_task = task_file.read_text().strip()
            short = full_task[:TASK_PREVIEW_CHARS] + "..." if len(full_task) > TASK_PREVIEW_CHARS else full_task
            return short, full_task
    except (FileNotFoundError, PermissionError, OSError) as e:
        print(f"[Task] Failed to read task file for WT{wt}: {e}")
    return "Unknown", "Unknown"


def get_checkpoint_progress(wt):
    """Parse commits to find checkpoint progress"""
    project_dir = get_project_dir(wt)
    if not project_dir.exists():
        return None, None, 0

    commits = run_cmd("git log --oneline -20", cwd=project_dir)

    checkpoints_done = []
    for line in commits.split('\n'):
        match = re.search(r'checkpoint-(\d+):', line.lower())
        if match:
            cp_num = int(match.group(1))
            desc_match = re.search(r'checkpoint-\d+:\s*(.+)', line, re.IGNORECASE)
            desc = desc_match.group(1)[:40] if desc_match else ""
            checkpoints_done.append((cp_num, desc))

    if checkpoints_done:
        checkpoints_done.sort(key=lambda x: x[0], reverse=True)
        latest = checkpoints_done[0]
        return latest[0], latest[1], len(checkpoints_done)

    return None, None, 0


def get_recent_activity(wt):
    """Get what the agent is doing based on recent output."""
    log_file = get_log_file(wt)
    if not log_file.exists():
        return "Starting..."

    try:
        logs = log_file.read_text()[-LOG_TAIL_BYTES:]

        patterns = [
            (r'✓ Generating static pages', "Building pages..."),
            (r'✓ Compiled', "Compiled successfully"),
            (r'FAIL|FAILED|Error:', "Tests failing"),
            (r'✓.*tests? passed', "Tests passing"),
            (r'Running.*test', "Running tests..."),
            (r'npm run build', "Building..."),
            (r'npm install', "Installing deps..."),
            (r'Creating.*\.tsx?', "Creating files..."),
            (r'Editing.*\.tsx?', "Editing files..."),
        ]

        for pattern, msg in patterns:
            if re.search(pattern, logs, re.IGNORECASE):
                return msg

        files_created = len(re.findall(r'create mode \d+ (.+)', logs))
        if files_created > 0:
            return f"Created {files_created} files"

        return "Working..."
    except (FileNotFoundError, PermissionError, OSError) as e:
        print(f"[Activity] Failed to read log file for WT{wt}: {e}")
        return "Working..."


# =============================================================================
# HEALTH MONITORING
# =============================================================================
def get_system_health():
    """Get VM health metrics"""
    # Memory usage
    mem_output = run_cmd("free -m | awk '/Mem:/ {printf \"%.0f\", $3/$2*100}'")
    mem_pct = int(mem_output) if mem_output.isdigit() else 0

    # CPU usage (1 min load average vs cores)
    load_output = run_cmd("cat /proc/loadavg | awk '{print $1}'")
    cores_output = run_cmd("nproc")
    try:
        load = float(load_output)
        cores = int(cores_output)
        cpu_pct = int((load / cores) * 100)
    except (ValueError, ZeroDivisionError):
        cpu_pct = 0

    return mem_pct, cpu_pct


def get_agent_memory(wt):
    """Get memory usage for agent process"""
    session = get_tmux_session(wt)
    # Get PIDs in tmux session
    pids = run_cmd(f"tmux list-panes -t {session} -F '#{{pane_pid}}' 2>/dev/null")
    if not pids:
        return 0

    total_mem = 0
    for pid in pids.strip().split('\n'):
        if pid:
            mem = run_cmd(f"ps -o rss= -p {pid} 2>/dev/null")
            if mem.strip().isdigit():
                total_mem += int(mem.strip()) // 1024  # Convert KB to MB

    return total_mem


def format_health():
    """Format health status for /health command"""
    mem_pct, cpu_pct = get_system_health()

    # Status indicators
    mem_status = "🟢" if mem_pct < 70 else ("🟡" if mem_pct < 85 else "🔴")
    cpu_status = "🟢" if cpu_pct < 70 else ("🟡" if cpu_pct < 85 else "🔴")

    msg = f"*VM Health*\n"
    msg += f"━━━━━━━━━━━━━━━━━━━\n"
    msg += f"{mem_status} RAM: {mem_pct}%\n"
    msg += f"{cpu_status} CPU: {cpu_pct}%\n"
    msg += f"━━━━━━━━━━━━━━━━━━━\n"

    for wt in range(MAX_WORKTREES):
        if is_agent_running(wt):
            agent_mem = get_agent_memory(wt)
            msg += f"WT{wt}: 🟢 running ({agent_mem}MB)\n"
        else:
            project_dir = get_project_dir(wt)
            if project_dir.exists():
                msg += f"WT{wt}: ⚪ idle\n"
            else:
                msg += f"WT{wt}: ⚫ not setup\n"

    return msg


# =============================================================================
# STATUS FORMATTING
# =============================================================================
def format_worktree_status(wt):
    """Format status for a single worktree"""
    running = is_agent_running(wt)
    task_short, _ = get_task_info(wt)

    status_emoji = "🟢" if running else "⚪"
    status_text = "RUNNING" if running else "idle"

    msg = f"*WT{wt}* {status_emoji} {status_text}\n"

    if running:
        msg += f"📋 {task_short}\n"
        cp_num, cp_desc, _ = get_checkpoint_progress(wt)
        if cp_num is not None:
            msg += f"✅ CP{cp_num}"
            if cp_desc:
                msg += f": {cp_desc[:30]}"
            msg += "\n"
        activity = get_recent_activity(wt)
        msg += f"🔄 {activity}\n"
    else:
        project_dir = get_project_dir(wt)
        if project_dir.exists():
            branch = run_cmd("git branch --show-current", cwd=project_dir) or "unknown"
            msg += f"📂 {branch[:25]}\n"

    return msg


def format_all_status():
    """Format status for all worktrees"""
    running = get_running_worktrees()

    if not running:
        return "⚪ *No agents running*\n\n💡 Start with: `/c claude \"task\"`"

    msg = f"*{len(running)} agent(s) running:*\n\n"

    for wt in range(MAX_WORKTREES):
        if wt in running:
            msg += format_worktree_status(wt) + "\n"

    msg += "💡 `/c pull N` to get work"
    return msg


def format_logs(wt):
    """Get readable recent logs for a worktree."""
    session = get_tmux_session(wt)
    logs = run_cmd(f"tmux capture-pane -t {session} -p 2>/dev/null | tail -30")

    if not logs.strip():
        log_file = get_log_file(wt)
        if log_file.exists():
            try:
                logs = log_file.read_text()[-LOG_DISPLAY_CHARS * 2:]
            except (PermissionError, OSError) as e:
                print(f"[Logs] Failed to read log file for WT{wt}: {e}")
                return f"No logs available for WT{wt}"

    if logs.strip():
        logs = re.sub(r'\x1b\[[0-9;]*m', '', logs)
        return f"*WT{wt} Logs:*\n```\n{logs[-LOG_DISPLAY_CHARS:]}\n```"
    return f"No logs available for WT{wt}"


# =============================================================================
# COMMAND HANDLING
# =============================================================================

# Pending confirmation state (for destructive actions)
PENDING_CONFIRMATION = {"action": None, "data": None, "expires": 0}


def parse_worktree_arg(text):
    """Parse worktree number from command like '/s2', '/l1', 'status 2'"""
    match = re.search(r'(\d)$', text.strip())
    if match:
        wt = int(match.group(1))
        if 0 <= wt < MAX_WORKTREES:
            return wt
    return None


# =============================================================================
# COMMAND HANDLERS (each returns a string or None)
# =============================================================================
def cmd_status(args):
    """Handle status command with optional worktree arg"""
    wt = parse_worktree_arg(args) if args else None
    if wt is not None:
        return format_worktree_status(wt)
    return format_all_status()


def cmd_logs(args):
    """Handle logs command with optional worktree arg"""
    wt = parse_worktree_arg(args) if args else None
    if wt is not None:
        if is_agent_running(wt):
            return format_logs(wt)
        return f"⚪ WT{wt} not running\n\n💡 Check `/status` for active agents"
    running = get_running_worktrees()
    if running:
        return format_logs(running[0])
    return "⚪ No agents running\n\n💡 Start one: `/c claude \"your task\"`"


def cmd_stop(args):
    """Handle stop command with optional worktree arg or 'all'"""
    global PENDING_CONFIRMATION

    # stop all - requires confirmation
    if args and args.strip().lower() == "all":
        running = get_running_worktrees()
        if not running:
            return "⚪ No agents running"
        preview = ""
        for wt in running:
            task_short, _ = get_task_info(wt)
            preview += f"  • WT{wt}: {escape_markdown(task_short)}\n"
        PENDING_CONFIRMATION = {
            "action": "stop_all",
            "data": running,
            "expires": time.time() + 30
        }
        return f"⚠️ *Stop {len(running)} agent(s)?*\n\n{preview}\nReply *yes* to confirm or *no* to cancel"

    # stop N - specific worktree
    wt = parse_worktree_arg(args) if args else None
    if wt is not None:
        if not is_agent_running(wt):
            return f"⚪ WT{wt} not running\n\n💡 Check `/status` for active agents"
        task_short, _ = get_task_info(wt)
        session = get_tmux_session(wt)
        run_cmd(f"tmux kill-session -t {session} 2>/dev/null")
        return f"🛑 *Stopped WT{wt}*\nTask was: _{escape_markdown(task_short)}_"

    # stop (no arg) - stop first running
    running = get_running_worktrees()
    if not running:
        return "⚪ No agents running"
    wt = running[0]
    task_short, _ = get_task_info(wt)
    session = get_tmux_session(wt)
    run_cmd(f"tmux kill-session -t {session} 2>/dev/null")
    return f"🛑 *Stopped WT{wt}*\nTask was: _{escape_markdown(task_short)}_"


def cmd_commit(args):
    """Handle commit/save command"""
    running = get_running_worktrees()
    if not running:
        return "⚪ No agents running\n\n💡 Nothing to commit"

    results = []
    for wt in running:
        project_dir = get_project_dir(wt)
        branch = run_cmd("git branch --show-current", cwd=project_dir) or "unknown"

        status = run_cmd("git status --porcelain", cwd=project_dir)
        if not status.strip():
            results.append(f"WT{wt} (`{escape_markdown(branch)}`): no changes")
            continue

        output = run_cmd("git add -A && git commit -m 'manual checkpoint' 2>&1", cwd=project_dir)
        output_lower = output.lower()
        if "nothing to commit" in output_lower:
            results.append(f"WT{wt} (`{escape_markdown(branch)}`): no changes")
        elif "error" in output_lower or "fatal" in output_lower or "failed" in output_lower:
            error_preview = output[:80].replace('\n', ' ')
            results.append(f"WT{wt} (`{escape_markdown(branch)}`): ❌ commit failed: {escape_markdown(error_preview)}")
        else:
            commit_hash = run_cmd("git rev-parse --short HEAD", cwd=project_dir)
            push_result = run_cmd("git push 2>&1", cwd=project_dir)
            if "error" in push_result.lower() or "rejected" in push_result.lower() or "fatal" in push_result.lower():
                results.append(f"WT{wt} (`{escape_markdown(branch)}`): ✅ `{commit_hash}` ⚠️ push failed")
            else:
                results.append(f"WT{wt} (`{escape_markdown(branch)}`): ✅ `{commit_hash}` pushed")

    return "💾 *Commit Results:*\n" + "\n".join(results)


def cmd_health(args):
    """Handle health command"""
    return format_health()


def cmd_help(args):
    """Handle help command"""
    return """📊 *Status*
`s` or `/status` — All agents
`s2` — WT2 only
`health` — VM resources

📋 *Logs*
`l` or `/logs` — First agent
`l1` — WT1 logs

🛑 *Control*
`stop` — Stop first agent
`stop 2` — Stop WT2
`stop all` — Stop all (asks confirm)
`commit` — Save + push all

💬 *Feedback*
Just type text → sent to running agent(s)

💡 Start agent: `/c claude "task"`"""


def cmd_forward_feedback(text):
    """Forward text to all running agents"""
    running = get_running_worktrees()
    if not running:
        return "⚠️ No agents running\n\n💡 Start one: `/c claude \"your task\"`"

    ts = time.strftime("%H:%M")
    sent_to = []

    for wt in running:
        feedback_file = get_feedback_file(wt)
        project_dir = get_project_dir(wt)
        branch = run_cmd("git branch --show-current", cwd=project_dir) or "unknown"

        with open(feedback_file, "a") as f:
            f.write(f"[{ts}] [{branch}] {text}\n")

        sent_to.append(f"WT{wt} (`{branch[:15]}`)")

    escaped_text = escape_markdown(text[:50])
    if len(running) == 1:
        return f"📝 Sent to {sent_to[0]}:\n_{escaped_text}_"
    return f"📝 Sent to {len(running)} agents:\n" + ", ".join(sent_to) + f"\n_{escaped_text}_"


# =============================================================================
# CONFIRMATION HANDLER (separate from command dispatch)
# =============================================================================
def handle_confirmation(text_lower):
    """Handle pending confirmation responses. Returns response string or None to continue."""
    global PENDING_CONFIRMATION

    if text_lower in ["yes", "y", "confirm"]:
        action = PENDING_CONFIRMATION["action"]
        data = PENDING_CONFIRMATION["data"]
        PENDING_CONFIRMATION = {"action": None, "data": None, "expires": 0}

        # Dispatch confirmed actions
        if action == "stop_all":
            for wt in data:
                session = get_tmux_session(wt)
                run_cmd(f"tmux kill-session -t {session} 2>/dev/null")
            return f"🛑 Stopped {len(data)} agent(s): WT{', WT'.join(map(str, data))}"

        # Unknown action - should never happen, but handle gracefully
        return f"⚠️ Unknown action: {action}"

    if text_lower in ["no", "n", "cancel"]:
        PENDING_CONFIRMATION = {"action": None, "data": None, "expires": 0}
        return "❌ Cancelled"

    # Block other input during confirmation
    return "⚠️ Confirmation pending. Reply *yes* or *no*."


# =============================================================================
# COMMAND DISPATCH TABLE
# =============================================================================
# Format: "command": {"aliases": [...], "handler": func, "has_args": bool}
COMMAND_TABLE = {
    "status": {
        "aliases": ["/status", "status", "/s", "s"],
        "handler": cmd_status,
        "arg_pattern": r"^(?:/s|s|status)\s*(\d)?$",  # s, s2, status, status 2
    },
    "logs": {
        "aliases": ["/logs", "logs", "/l", "l"],
        "handler": cmd_logs,
        "arg_pattern": r"^(?:/l|l|logs)\s*(\d)?$",  # l, l2, logs, logs 2
    },
    "stop": {
        "aliases": ["/stop", "stop"],
        "handler": cmd_stop,
        "arg_pattern": r"^(?:/stop|stop)\s*(.+)?$",  # stop, stop 2, stop all
    },
    "commit": {
        "aliases": ["/commit", "commit", "save"],
        "handler": cmd_commit,
        "arg_pattern": None,
    },
    "health": {
        "aliases": ["/health", "health"],
        "handler": cmd_health,
        "arg_pattern": None,
    },
    "help": {
        "aliases": ["/help", "help", "/h", "h", "?"],
        "handler": cmd_help,
        "arg_pattern": None,
    },
}


def dispatch_command(text_lower, text_original):
    """Match text against command table and dispatch to handler."""
    for cmd_name, cmd_info in COMMAND_TABLE.items():
        # Check exact alias match first
        if text_lower in cmd_info["aliases"]:
            return cmd_info["handler"](None)

        # Check pattern match for commands with args
        if cmd_info.get("arg_pattern"):
            match = re.match(cmd_info["arg_pattern"], text_lower)
            if match:
                args = match.group(1) if match.lastindex else None
                return cmd_info["handler"](args)

    # No command matched - forward as feedback if not a slash command
    if text_original and not text_original.startswith("/"):
        return cmd_forward_feedback(text_original)

    return None


# =============================================================================
# MAIN COMMAND HANDLER
# =============================================================================
def handle_command(text):
    """Main entry point for handling user commands."""
    global PENDING_CONFIRMATION
    text_lower = text.strip().lower()
    text_original = text.strip()

    # Step 1: Check for pending confirmation (takes priority)
    if PENDING_CONFIRMATION["action"] and time.time() < PENDING_CONFIRMATION["expires"]:
        return handle_confirmation(text_lower)

    # Step 2: Clear expired confirmation
    if time.time() >= PENDING_CONFIRMATION.get("expires", 0):
        PENDING_CONFIRMATION = {"action": None, "data": None, "expires": 0}

    # Step 3: Dispatch to command handler
    return dispatch_command(text_lower, text_original)


# =============================================================================
# PROACTIVE NOTIFICATIONS
# =============================================================================
def check_for_updates():
    """Proactive notifications for all worktrees"""
    state = load_state()

    for wt in range(MAX_WORKTREES):
        wt_key = str(wt)
        if wt_key not in state:
            state[wt_key] = {
                "last_checkpoint": None,
                "task_started": None,
                "was_running": False
            }

        wt_state = state[wt_key]
        running = is_agent_running(wt)
        project_dir = get_project_dir(wt)

        # Detect task completion or crash
        if wt_state.get("was_running") and not running:
            task_short, _ = get_task_info(wt)
            cp_num, cp_desc, _ = get_checkpoint_progress(wt)

            # Check if it was a clean exit or crash
            log_file = get_log_file(wt)
            clean_exit = False
            last_lines = ""
            if log_file.exists():
                try:
                    last_lines = log_file.read_text()[-500:]
                    if "TASK COMPLETE" in last_lines or "task completed" in last_lines.lower():
                        clean_exit = True
                except (PermissionError, OSError):
                    pass

            if clean_exit:
                msg = f"✅ *WT{wt} Complete!*\n"
                msg += f"📋 {escape_markdown(task_short)}\n"
                if cp_num is not None:
                    msg += f"📍 Reached checkpoint {cp_num}\n"
                msg += f"\n💡 `/c pull {wt}` to get work"
            else:
                # Likely a crash
                mem_pct, cpu_pct = get_system_health()
                msg = f"⚠️ *WT{wt} CRASHED!*\n"
                msg += f"📋 {escape_markdown(task_short)}\n"
                if cp_num is not None:
                    msg += f"📍 Last checkpoint: {cp_num}\n"
                msg += f"💾 RAM: {mem_pct}% | CPU: {cpu_pct}%\n"
                # Show last activity
                if last_lines:
                    last_line = last_lines.strip().split('\n')[-1][:60]
                    msg += f"📝 Last: _{escape_markdown(last_line)}_\n"
                msg += f"\n💡 Check `/c logs {wt}` or restart"

            send_message(msg)

        # Detect new checkpoint
        if running:
            cp_num, cp_desc, _ = get_checkpoint_progress(wt)
            if cp_num is not None and cp_num != wt_state.get("last_checkpoint"):
                msg = f"📍 *WT{wt} Checkpoint {cp_num}*"
                if cp_desc:
                    msg += f": {escape_markdown(cp_desc[:40])}"
                send_message(msg)
                wt_state["last_checkpoint"] = cp_num

        # Detect task start
        try:
            task_file = get_task_file(wt)
            if task_file.exists():
                mtime = task_file.stat().st_mtime
                if mtime != wt_state.get("task_started") and running:
                    task_short, _ = get_task_info(wt)
                    send_message(f"🚀 *WT{wt} Started:* {escape_markdown(task_short)}")
                    wt_state["task_started"] = mtime
                    wt_state["last_checkpoint"] = None
        except (FileNotFoundError, PermissionError, OSError) as e:
            print(f"[Updates] Failed to check task file for WT{wt}: {e}")

        wt_state["was_running"] = running
        state[wt_key] = wt_state

    save_state(state)


# =============================================================================
# MAIN LOOP
# =============================================================================
def main():
    print("Telegram Handler v6 (Simplified) started")
    send_message("🤖 *Handler ready* (v6)\n\nType `?` for commands")

    last_id = 0
    try:
        last_id = int(LAST_UPDATE_FILE.read_text().strip() or 0)
    except (FileNotFoundError, ValueError, PermissionError):
        pass

    last_proactive_check = time.time()

    while True:
        # Handle incoming messages
        updates = get_updates(last_id + 1)

        for u in updates:
            uid = u.get("update_id", 0)

            # CRITICAL: Update offset BEFORE processing to prevent double-messages
            # If processing crashes, we won't re-fetch this message on restart
            last_id = max(last_id, uid)
            try:
                LAST_UPDATE_FILE.write_text(str(last_id))
            except (PermissionError, OSError) as e:
                print(f"[Main] Failed to save last update ID: {e}")

            # Now process the message
            txt = u.get("message", {}).get("text", "")
            cid = str(u.get("message", {}).get("chat", {}).get("id", ""))

            if cid == CHAT_ID and txt:
                resp = handle_command(txt)
                if resp:
                    send_message(resp)

        # Proactive updates
        if time.time() - last_proactive_check > PROACTIVE_CHECK_INTERVAL_SEC:
            check_for_updates()
            last_proactive_check = time.time()

        time.sleep(2)


if __name__ == "__main__":
    main()
