#!/usr/bin/env python3
"""
Telegram Cloud Agent Handler v5 - UX Improvements
- Tracks agents across worktrees 0-3 (cloud) and 1-7 (local)
- Syncs status to Supabase worktree_status table
- /worktrees command shows all worktrees (local + cloud)
- Completion notifications with worktree context
- Forward user messages to specific agents

v5 changes:
- Fixed double-message bug (update offset before processing)
- Added markdown escaping for user content
- Better error messages with actionable hints
- Confirmation for destructive /stop all
- Show commit result details
- Cleaner /worktrees layout
- Reorganized /help into categories
"""
import os
import subprocess
import time
import requests
import re
import json
import sys
from pathlib import Path
from datetime import datetime

# =============================================================================
# CONFIGURATION
# =============================================================================
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")

# Supabase config - read from environment (set in ~/.bashrc on cloud VM)
SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("VITE_SUPABASE_ANON_KEY", "")

if not TELEGRAM_TOKEN or not CHAT_ID:
    print("ERROR: Missing required environment variables:")
    print("  - TELEGRAM_BOT_TOKEN: Your Telegram bot token from @BotFather")
    print("  - TELEGRAM_CHAT_ID: Your Telegram chat ID")
    print("")
    print("Set them in your shell profile (~/.bashrc or ~/.zshrc):")
    print('  export TELEGRAM_BOT_TOKEN="your-token-here"')
    print('  export TELEGRAM_CHAT_ID="your-chat-id"')
    sys.exit(1)

# Warn if Supabase config is missing (non-fatal - Telegram still works)
if not SUPABASE_URL or not SUPABASE_ANON_KEY:
    print("WARNING: Supabase env vars not set - /worktrees command will not work")
    print("  Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in ~/.bashrc")

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
# SUPABASE WORKTREE STATUS
# =============================================================================
def supabase_get_worktrees():
    """Fetch all worktree statuses from Supabase"""
    url = f"{SUPABASE_URL}/rest/v1/worktree_status?order=id"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}"
    }
    try:
        r = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT_SEC)
        if r.status_code == 200:
            return r.json()
    except requests.RequestException as e:
        print(f"[Supabase] Failed to fetch worktrees: {e}")
    return []


def supabase_update_worktree(wt_id, data):
    """Update a worktree status in Supabase"""
    url = f"{SUPABASE_URL}/rest/v1/worktree_status?id=eq.{wt_id}"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }
    data["updated_at"] = datetime.utcnow().isoformat()
    data["updated_by"] = "telegram-handler"
    try:
        r = requests.patch(url, headers=headers, json=data, timeout=REQUEST_TIMEOUT_SEC)
        return r.status_code in [200, 204]
    except requests.RequestException as e:
        print(f"[Supabase] Failed to update worktree {wt_id}: {e}")
    return False


def format_worktrees_from_supabase():
    """Format all worktrees status from Supabase for /worktrees command"""
    worktrees = supabase_get_worktrees()
    if not worktrees:
        return "⚠️ Could not fetch worktree status\n\n💡 Check Supabase connection"

    # Group by type
    local_wts = [w for w in worktrees if w['id'].startswith('wt')]
    cloud_wts = [w for w in worktrees if w['id'].startswith('cloud')]

    # Count by status
    active_count = sum(1 for w in worktrees if w.get('status') in ['active', 'running', 'in-progress'])
    idle_count = sum(1 for w in worktrees if w.get('status') in ['idle', 'empty'])

    msg = f"*Worktrees* ({active_count} active, {idle_count} idle)\n\n"

    # Local worktrees - grouped by status
    if local_wts:
        msg += "📁 *Local*\n"

        # Sort: active first, then idle, then empty/not-setup
        status_order = {'active': 0, 'in-progress': 0, 'idle': 1, 'empty': 2, 'not-setup': 3, 'stale': 1}
        sorted_local = sorted(local_wts, key=lambda x: (status_order.get(x.get('status', 'unknown'), 4), x['id']))

        for wt in sorted_local:
            status = wt.get('status', 'unknown')
            status_emoji = {
                'active': '🟢',
                'in-progress': '🔵',
                'idle': '⚪',
                'empty': '⚫',
                'stale': '🟡',
                'not-setup': '⚫'
            }.get(status, '❓')

            wt_num = wt['id'].replace('wt', '')
            branch = wt.get('branch', '')[:18] if wt.get('branch') else ''
            purpose = wt.get('purpose', '')[:25] if wt.get('purpose') else ''

            # Compact format: emoji wt# branch (purpose)
            if branch and purpose:
                msg += f"{status_emoji} `{wt_num}` {escape_markdown(branch)} _{escape_markdown(purpose)}_\n"
            elif branch:
                msg += f"{status_emoji} `{wt_num}` {escape_markdown(branch)}\n"
            else:
                msg += f"{status_emoji} `{wt_num}` —\n"

    # Cloud worktrees
    if cloud_wts:
        msg += "\n☁️ *Cloud*\n"

        status_order = {'running': 0, 'in-progress': 0, 'active': 0, 'idle': 1, 'empty': 2, 'not-setup': 3}
        sorted_cloud = sorted(cloud_wts, key=lambda x: (status_order.get(x.get('status', 'unknown'), 4), x['id']))

        for wt in sorted_cloud:
            status = wt.get('status', 'unknown')
            status_emoji = {
                'running': '🟢',
                'in-progress': '🔵',
                'active': '🟢',
                'idle': '⚪',
                'empty': '⚫',
                'not-setup': '⚫'
            }.get(status, '❓')

            # Simplify cloud-main -> main, cloud-wt2 -> wt2
            wt_label = wt['id'].replace('cloud-', '')
            branch = wt.get('branch', '')[:18] if wt.get('branch') else ''
            last_task = wt.get('last_task', '')[:25] if wt.get('last_task') else ''

            if branch and last_task:
                msg += f"{status_emoji} `{wt_label}` {escape_markdown(branch)}\n   _{escape_markdown(last_task)}_\n"
            elif branch:
                msg += f"{status_emoji} `{wt_label}` {escape_markdown(branch)}\n"
            else:
                msg += f"{status_emoji} `{wt_label}` —\n"

    msg += "\n💡 `/c pull N` to get work"
    return msg


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
    # Match patterns like: s2, l1, status 2, logs 1
    match = re.search(r'(\d)$', text.strip())
    if match:
        wt = int(match.group(1))
        if 0 <= wt < MAX_WORKTREES:
            return wt
    return None


def handle_command(text):
    global PENDING_CONFIRMATION
    text_lower = text.strip().lower()
    text_original = text.strip()

    # Check for pending confirmation
    if PENDING_CONFIRMATION["action"] and time.time() < PENDING_CONFIRMATION["expires"]:
        if text_lower in ["yes", "y", "confirm"]:
            action = PENDING_CONFIRMATION["action"]
            data = PENDING_CONFIRMATION["data"]
            PENDING_CONFIRMATION = {"action": None, "data": None, "expires": 0}

            if action == "stop_all":
                for wt in data:
                    session = get_tmux_session(wt)
                    run_cmd(f"tmux kill-session -t {session} 2>/dev/null")
                return f"🛑 Stopped {len(data)} agent(s): WT{', WT'.join(map(str, data))}"

        elif text_lower in ["no", "n", "cancel"]:
            PENDING_CONFIRMATION = {"action": None, "data": None, "expires": 0}
            return "❌ Cancelled"

        else:
            # Block all other input until user confirms or cancels
            return "⚠️ Confirmation pending. Reply *yes* or *no*."

    # Clear expired confirmation
    if time.time() >= PENDING_CONFIRMATION.get("expires", 0):
        PENDING_CONFIRMATION = {"action": None, "data": None, "expires": 0}

    # Status commands
    if text_lower in ["/status", "status", "s", "/s"]:
        return format_all_status()

    # Status with worktree: /s2, status 2
    # Exclude "stop" commands which also start with "s"
    if text_lower.startswith(("/s", "s", "status")) and not text_lower.startswith(("stop", "/stop")):
        wt = parse_worktree_arg(text_lower)
        if wt is not None:
            return format_worktree_status(wt)
        return format_all_status()

    # Logs commands
    if text_lower in ["/logs", "logs", "l", "/l"]:
        running = get_running_worktrees()
        if running:
            return format_logs(running[0])
        return "⚪ No agents running\n\n💡 Start one: `/c claude \"your task\"`"

    # Logs with worktree: /l2, logs 2
    if text_lower.startswith(("/l", "l", "logs")):
        wt = parse_worktree_arg(text_lower)
        if wt is not None:
            if is_agent_running(wt):
                return format_logs(wt)
            return f"⚪ WT{wt} not running\n\n💡 Check `/status` for active agents"
        running = get_running_worktrees()
        if running:
            return format_logs(running[0])
        return "⚪ No agents running\n\n💡 Start one: `/c claude \"your task\"`"

    # Stop commands
    if text_lower in ["/stop", "stop"]:
        running = get_running_worktrees()
        if not running:
            return "⚪ No agents running"
        # Stop first running agent
        wt = running[0]
        task_short, _ = get_task_info(wt)
        session = get_tmux_session(wt)
        run_cmd(f"tmux kill-session -t {session} 2>/dev/null")
        return f"🛑 *Stopped WT{wt}*\nTask was: _{escape_markdown(task_short)}_"

    # Stop with worktree: stop 2, /stop 2
    if text_lower.startswith(("stop ", "/stop ")):
        wt = parse_worktree_arg(text_lower)
        if wt is not None:
            if not is_agent_running(wt):
                return f"⚪ WT{wt} not running\n\n💡 Check `/status` for active agents"
            task_short, _ = get_task_info(wt)
            session = get_tmux_session(wt)
            run_cmd(f"tmux kill-session -t {session} 2>/dev/null")
            return f"🛑 *Stopped WT{wt}*\nTask was: _{escape_markdown(task_short)}_"
        return "⚠️ Usage: `stop N` where N is 0-3\n\nExample: `stop 2`"

    # Stop all - requires confirmation
    if text_lower in ["/stop all", "stop all"]:
        running = get_running_worktrees()
        if not running:
            return "⚪ No agents running"

        # Build preview of what will be stopped
        preview = ""
        for wt in running:
            task_short, _ = get_task_info(wt)
            preview += f"  • WT{wt}: {escape_markdown(task_short)}\n"

        # Set pending confirmation (expires in 30 seconds)
        PENDING_CONFIRMATION = {
            "action": "stop_all",
            "data": running,
            "expires": time.time() + 30
        }

        return f"⚠️ *Stop {len(running)} agent(s)?*\n\n{preview}\nReply *yes* to confirm or *no* to cancel"

    # Commit/save
    if text_lower in ["/commit", "commit", "save"]:
        running = get_running_worktrees()
        if not running:
            return "⚪ No agents running\n\n💡 Nothing to commit"

        results = []
        for wt in running:
            project_dir = get_project_dir(wt)
            branch = run_cmd("git branch --show-current", cwd=project_dir) or "unknown"

            # Check if there are changes
            status = run_cmd("git status --porcelain", cwd=project_dir)
            if not status.strip():
                results.append(f"WT{wt} (`{escape_markdown(branch)}`): no changes")
                continue

            # Commit and push
            output = run_cmd("git add -A && git commit -m 'manual checkpoint' 2>&1", cwd=project_dir)
            if "nothing to commit" in output.lower():
                results.append(f"WT{wt} (`{escape_markdown(branch)}`): no changes")
            else:
                # Get short commit hash
                commit_hash = run_cmd("git rev-parse --short HEAD", cwd=project_dir)
                push_result = run_cmd("git push 2>&1", cwd=project_dir)
                if "error" in push_result.lower() or "rejected" in push_result.lower():
                    results.append(f"WT{wt} (`{escape_markdown(branch)}`): ✅ `{commit_hash}` ⚠️ push failed")
                else:
                    results.append(f"WT{wt} (`{escape_markdown(branch)}`): ✅ `{commit_hash}` pushed")

        return "💾 *Commit Results:*\n" + "\n".join(results)

    # Health
    if text_lower in ["/health", "health"]:
        return format_health()

    # Worktrees (from Supabase)
    if text_lower in ["/worktrees", "worktrees", "/wt", "wt"]:
        return format_worktrees_from_supabase()

    # Help - reorganized into categories
    if text_lower in ["/help", "help", "h", "/h", "?"]:
        return """📊 *Status*
`s` or `/status` — All agents
`s2` — WT2 only
`wt` — All worktrees (local+cloud)
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

    # Forward as instruction to active agents
    if text_original and not text_original.startswith("/"):
        running = get_running_worktrees()
        if not running:
            return "⚠️ No agents running\n\n💡 Start one: `/c claude \"your task\"`"

        ts = time.strftime("%H:%M")
        sent_to = []

        # Write to all running agents' feedback files
        for wt in running:
            feedback_file = get_feedback_file(wt)
            project_dir = get_project_dir(wt)
            branch = run_cmd("git branch --show-current", cwd=project_dir) or "unknown"

            with open(feedback_file, "a") as f:
                f.write(f"[{ts}] [{branch}] {text_original}\n")

            sent_to.append(f"WT{wt} (`{branch[:15]}`)")

        escaped_text = escape_markdown(text_original[:50])
        if len(running) == 1:
            return f"📝 Sent to {sent_to[0]}:\n_{escaped_text}_"
        else:
            return f"📝 Sent to {len(running)} agents:\n" + ", ".join(sent_to) + f"\n_{escaped_text}_"

    return None


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
    print("Telegram Handler v5 (UX Improvements) started")
    send_message("🤖 *Handler ready* (v5)\n\nType `?` for commands")

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
