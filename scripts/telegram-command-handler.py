#!/usr/bin/env python3
import os, subprocess, time, requests, re

TELEGRAM_TOKEN = "8476935089:AAG_ThyQpgnyk6pYdJrZl8rngKtX4FCy_Kk"
CHAT_ID = "830020398"
PROJECT_DIR = os.path.expanduser("~/claritypledge")
LAST_UPDATE_FILE = "/tmp/telegram_last_update"
LAST_LOG_SIZE_FILE = "/tmp/telegram_last_log_size"

def send_message(text):
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    requests.post(url, data={"chat_id": CHAT_ID, "text": text, "parse_mode": "Markdown"})

def get_updates(offset=0):
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/getUpdates"
    try:
        r = requests.get(url, params={"offset": offset, "timeout": 10}, timeout=15)
        return r.json().get("result", [])
    except:
        return []

def run_command(cmd, cwd=None):
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=cwd, timeout=30)
        return result.stdout + result.stderr
    except:
        return ""

def is_agent_running():
    return "yes" in run_command("tmux has-session -t agent 2>/dev/null && echo yes || echo no")

def get_task_name():
    try:
        with open("/tmp/current-task.txt") as f:
            return f.read().strip()
    except:
        return "Unknown"

def get_activity():
    logs = run_command("tail -100 /tmp/agent-output.log 2>/dev/null")
    files = re.findall(r"create mode \d+ (.+)", logs)
    return "Created: " + ", ".join(files[-3:]) if files else "Working..."

def handle_command(text):
    text = text.strip().lower()

    if text in ["/status", "status"]:
        task = get_task_name()
        branch = run_command("git branch --show-current", cwd=PROJECT_DIR).strip()
        commit = run_command("git log -1 --oneline", cwd=PROJECT_DIR).strip()
        status = "RUNNING" if is_agent_running() else "Stopped"
        activity = get_activity()
        return f"*Status:* {status}\n*Task:* {task}\n*Branch:* {branch}\n*Commit:* {commit}\n\n{activity}"

    elif text in ["/logs", "logs"]:
        logs = run_command("tmux capture-pane -t agent -p 2>/dev/null | tail -20")
        return f"*Logs:*\n{logs[:2000]}" if logs.strip() else "No logs"

    elif text in ["/stop", "stop"]:
        run_command("tmux kill-session -t agent 2>/dev/null")
        return "Agent stopped"

    elif text in ["/branch", "branch"]:
        branch = run_command("git branch --show-current", cwd=PROJECT_DIR).strip()
        return f"Branch: {branch}"

    elif text in ["/commit", "commit"]:
        run_command("git add -A && git commit -m 'checkpoint' && git push", cwd=PROJECT_DIR)
        return "Committed"

    elif text in ["/help", "help"]:
        return "*Commands:*\n/status - Status\n/logs - Output\n/stop - Stop\n/commit - Save\n\nSend text = feedback"

    else:
        if text and not text.startswith("/"):
            ts = time.strftime("%H:%M")
            with open("/tmp/user-feedback.txt", "a") as f:
                f.write(f"{ts}: {text}\n")
            return "Feedback saved"
        return None

def check_proactive():
    if not is_agent_running():
        return
    try:
        size = os.path.getsize("/tmp/agent-output.log")
        last = 0
        try:
            with open(LAST_LOG_SIZE_FILE) as f:
                last = int(f.read().strip())
        except:
            pass
        if size - last > 3000:
            activity = get_activity()
            if activity != "Working...":
                send_message(f"Progress: {activity}")
            with open(LAST_LOG_SIZE_FILE, "w") as f:
                f.write(str(size))
    except:
        pass

def main():
    print("Handler started")
    send_message("Handler restarted. /help for commands")

    last_id = 0
    try:
        with open(LAST_UPDATE_FILE) as f:
            last_id = int(f.read().strip() or 0)
    except:
        pass

    last_check = time.time()

    while True:
        for u in get_updates(last_id + 1):
            uid = u.get("update_id", 0)
            txt = u.get("message", {}).get("text", "")
            cid = str(u.get("message", {}).get("chat", {}).get("id", ""))

            if cid == CHAT_ID and txt:
                resp = handle_command(txt)
                if resp:
                    send_message(resp)
            last_id = max(last_id, uid)
            with open(LAST_UPDATE_FILE, "w") as f:
                f.write(str(last_id))

        if time.time() - last_check > 120:
            check_proactive()
            last_check = time.time()

        time.sleep(2)

if __name__ == "__main__":
    main()
