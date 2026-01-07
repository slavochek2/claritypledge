#!/bin/bash
# Cloud Agent - Run Claude Code tasks in the cloud from Cursor
# Supports parallel execution via worktrees (0-3)

set -e

VM_NAME="clarity-agent"
ZONE="us-central1-a"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Load gcloud
source "$(brew --prefix)/share/google-cloud-sdk/path.zsh.inc" 2>/dev/null || true

# =============================================================================
# WORKTREE CONFIGURATION
# =============================================================================
MAX_WORKTREES=4  # 0-3

get_project_dir() {
    local wt="$1"
    if [ "$wt" = "0" ]; then
        echo "claritypledge"
    else
        echo "claritypledge-$wt"
    fi
}

get_dev_port() {
    local wt="$1"
    if [ "$wt" = "0" ]; then
        echo "5001"
    else
        echo "5${wt}00"
    fi
}

get_tmux_session() {
    local wt="$1"
    echo "agent-$wt"
}

get_state_file() {
    local wt="$1"
    echo "/tmp/cloud-agent-state-$wt.json"
}

get_task_file() {
    local wt="$1"
    echo "/tmp/current-task-$wt.txt"
}

get_log_file() {
    local wt="$1"
    echo "/tmp/agent-output-$wt.log"
}

# =============================================================================
# ARGUMENT PARSING
# =============================================================================
WORKTREE=""
AUTO_DETECT=true

# Parse arguments
ARGS=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --worktree|-w)
            WORKTREE="$2"
            AUTO_DETECT=false
            shift 2
            ;;
        *)
            ARGS+=("$1")
            shift
            ;;
    esac
done

TASK="${ARGS[*]}"

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

# Check if Claude is authenticated on the VM
check_auth() {
    echo -e "${BLUE}Checking cloud agent...${NC}"
    AUTH_CHECK=$(gcloud compute ssh $VM_NAME --zone=$ZONE --command="cd claritypledge && claude -p 'hi' 2>&1 | head -5" 2>/dev/null || echo "VM_ERROR")

    if echo "$AUTH_CHECK" | grep -q "Invalid API key\|login\|API key"; then
        echo ""
        echo -e "${RED}Claude needs to be authenticated on the cloud VM${NC}"
        echo ""
        echo "Run this ONE TIME to fix:"
        echo ""
        echo -e "${GREEN}  gcloud compute ssh clarity-agent --zone=us-central1-a${NC}"
        echo ""
        echo "Then inside the VM, run:"
        echo -e "${GREEN}  claude${NC}"
        echo ""
        echo "Click the URL to log in, then type 'exit' to come back."
        echo ""
        exit 1
    fi

    if echo "$AUTH_CHECK" | grep -q "VM_ERROR\|ERROR\|Could not SSH"; then
        echo ""
        echo -e "${RED}Cannot connect to cloud VM${NC}"
        echo ""
        echo "The VM might be stopped. Start it with:"
        echo -e "${GREEN}  gcloud compute instances start clarity-agent --zone=us-central1-a${NC}"
        echo ""
        exit 1
    fi
}

# Find first available worktree (no running agent)
find_available_worktree() {
    local available
    available=$(gcloud compute ssh $VM_NAME --zone=$ZONE --command='
        for i in 0 1 2 3; do
            if ! tmux has-session -t agent-$i 2>/dev/null; then
                echo $i
                exit 0
            fi
        done
        echo "NONE"
    ' 2>/dev/null)
    echo "$available"
}

# Get list of worktrees with their status
get_worktree_list() {
    gcloud compute ssh $VM_NAME --zone=$ZONE --command='
        echo "WORKTREE | STATUS      | BRANCH                     | TASK"
        echo "---------|-------------|----------------------------|---------------------------"
        for i in 0 1 2 3; do
            if [ "$i" = "0" ]; then
                DIR=~/claritypledge
            else
                DIR=~/claritypledge-$i
            fi

            if [ ! -d "$DIR" ]; then
                echo "   $i     | NOT SETUP   | -                          | -"
                continue
            fi

            BRANCH=$(cd "$DIR" && git branch --show-current 2>/dev/null || echo "unknown")

            if tmux has-session -t agent-$i 2>/dev/null; then
                STATUS="RUNNING"
                TASK_FILE="/tmp/current-task-$i.txt"
                if [ -f "$TASK_FILE" ]; then
                    TASK=$(head -c 25 "$TASK_FILE" 2>/dev/null)...
                else
                    TASK="-"
                fi
            else
                STATUS="idle"
                TASK="-"
            fi

            printf "   %s     | %-11s | %-26s | %s\n" "$i" "$STATUS" "${BRANCH:0:26}" "$TASK"
        done
    ' 2>/dev/null
}

show_help() {
    echo ""
    echo -e "${BLUE}Cloud Agent - Run tasks in the cloud${NC}"
    echo ""
    echo "USAGE:  /c [command]"
    echo ""
    echo "RUN TASKS:"
    echo "  \"task\"                    Run with Gemini (default, no /loop or BMAD)"
    echo "  claude \"task\"             Run with Claude Opus 4.5 (uses /loop + BMAD)"
    echo "  claude --worktree N \"task\"  Run on specific worktree (0-3)"
    echo ""
    echo "MONITOR:"
    echo "  status                    Check ALL running agents"
    echo "  status N                  Check worktree N only"
    echo "  logs N                    See output for worktree N"
    echo "  --list                    Show all worktrees and their status"
    echo ""
    echo "CONTROL:"
    echo "  stop N                    Stop agent on worktree N"
    echo "  stop all                  Stop all running agents"
    echo "  reset N                   Reset worktree N to main (no running agent)"
    echo "  reset all                 Reset all idle worktrees to main"
    echo "  pull N                    Get work from worktree N"
    echo ""
    echo "VM CONTROL:"
    echo "  setup                     One-time login (run first!)"
    echo "  setup-mcp                 Install Playwright MCP"
    echo "  setup-worktrees           Create worktrees 1-3 on cloud VM"
    echo "  pause                     Stop VM (save \$)"
    echo "  resume                    Start VM"
    echo ""
    echo "EXAMPLES:"
    echo "  /c claude Add dark mode       # Auto-picks available worktree"
    echo "  /c claude -w 2 Fix auth bug   # Explicitly use worktree 2"
    echo "  /c status                     # See all running agents"
    echo "  /c --list                     # See worktree states"
    echo ""
}

# Sanitize task string for safe use in shell commands
sanitize_task() {
    local task="$1"
    echo "$task" | tr -d '`$();|<>&"'"'" | tr '\n' ' '
}

# Generate feature branch name from task
generate_branch_name() {
    local task="$1"
    local slug=$(echo "$task" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9 ]//g' | awk '{print $1"-"$2"-"$3}' | sed 's/-$//')
    echo "cloud-agent/${slug}-$(date +%s | tail -c 5)"
}

# =============================================================================
# COMMAND HANDLERS
# =============================================================================

if [ -z "$TASK" ]; then
    show_help
    exit 0
fi

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)

case "$TASK" in
    "help"|"-h"|"--help")
        show_help
        exit 0
        ;;

    "--list"|"list"|"-l")
        echo -e "${BLUE}Cloud Worktrees${NC}"
        echo ""
        get_worktree_list
        exit 0
        ;;

    "setup"|"login"|"auth")
        echo -e "${BLUE}Cloud Agent Setup${NC}"
        echo ""
        echo "Connecting you to the cloud VM..."
        echo "Once connected, run: claude"
        echo "Click the URL to authenticate, then type: exit"
        echo ""
        gcloud compute ssh $VM_NAME --zone=$ZONE
        exit 0
        ;;

    "setup-mcp"|"install-mcp"|"mcp-setup")
        echo -e "${BLUE}Installing Playwright MCP on cloud VM...${NC}"
        ./scripts/setup-cloud-mcp.sh
        exit 0
        ;;

    "setup-worktrees")
        ./scripts/setup-cloud-worktrees.sh
        exit 0
        ;;

    "pause"|"vm-stop"|"stop-vm")
        echo -e "${YELLOW}Pausing cloud VM (saves money)...${NC}"
        gcloud compute instances stop $VM_NAME --zone=$ZONE
        echo -e "${GREEN}VM paused. Use '/c resume' to start again.${NC}"
        exit 0
        ;;

    "resume"|"vm-start"|"start-vm")
        echo -e "${BLUE}Starting cloud VM...${NC}"
        gcloud compute instances start $VM_NAME --zone=$ZONE
        echo -e "${GREEN}VM started! Wait 30 seconds, then use /c${NC}"
        exit 0
        ;;

    status*)
        # Parse: "status" or "status 2"
        STATUS_ARG="${TASK#status}"
        STATUS_ARG="${STATUS_ARG# }"

        if [ -z "$STATUS_ARG" ]; then
            # Show all worktrees
            echo -e "${BLUE}Cloud Agent Status (All Worktrees)${NC}"
            echo ""

            gcloud compute ssh $VM_NAME --zone=$ZONE --command='
                found_any=false
                for i in 0 1 2 3; do
                    if [ "$i" = "0" ]; then
                        DIR=~/claritypledge
                    else
                        DIR=~/claritypledge-$i
                    fi

                    [ ! -d "$DIR" ] && continue

                    TASK_FILE="/tmp/current-task-$i.txt"

                    if tmux has-session -t agent-$i 2>/dev/null; then
                        found_any=true
                        echo "=== Worktree $i (RUNNING) ==="
                        if [ -f "$TASK_FILE" ]; then
                            echo "Task: $(cat "$TASK_FILE")"
                        fi
                        echo "Branch: $(cd "$DIR" && git branch --show-current)"
                        echo "Last commit: $(cd "$DIR" && git log -1 --oneline)"
                        echo ""
                        echo "Recent output:"
                        echo "─────────────────────────────────────"
                        tmux capture-pane -t agent-$i -p | tail -10
                        echo "─────────────────────────────────────"
                        echo ""
                    fi
                done

                if [ "$found_any" = false ]; then
                    echo "No agents running"
                    echo ""
                    echo "Start a task with: /c claude \"your task\""
                fi
            ' 2>/dev/null
        else
            # Show specific worktree
            WT="$STATUS_ARG"
            echo -e "${BLUE}Cloud Agent Status (Worktree $WT)${NC}"
            echo ""

            PROJECT_DIR=$(get_project_dir "$WT")
            TASK_FILE=$(get_task_file "$WT")
            TMUX_SESSION=$(get_tmux_session "$WT")

            gcloud compute ssh $VM_NAME --zone=$ZONE --command="
                DIR=~/$PROJECT_DIR

                if [ ! -d \"\$DIR\" ]; then
                    echo 'Worktree $WT not set up. Run: /c setup-worktrees'
                    exit 1
                fi

                cd \"\$DIR\"

                if [ -f $TASK_FILE ]; then
                    echo \"Task: \$(cat $TASK_FILE)\"
                    echo ''
                fi

                echo \"Branch: \$(git branch --show-current)\"
                echo \"Last commit: \$(git log -1 --oneline)\"
                echo ''

                if tmux has-session -t $TMUX_SESSION 2>/dev/null; then
                    echo 'Status: RUNNING'
                    echo ''
                    echo 'Recent output:'
                    echo '─────────────────────────────────────'
                    tmux capture-pane -t $TMUX_SESSION -p | tail -15
                    echo '─────────────────────────────────────'
                else
                    echo 'Status: idle'
                fi
            " 2>/dev/null
        fi
        exit 0
        ;;

    logs*)
        # Parse: "logs" or "logs 2"
        LOGS_ARG="${TASK#logs}"
        LOGS_ARG="${LOGS_ARG# }"

        WT="${LOGS_ARG:-0}"
        TMUX_SESSION=$(get_tmux_session "$WT")
        LOG_FILE=$(get_log_file "$WT")

        echo -e "${BLUE}Logs for Worktree $WT${NC}"
        gcloud compute ssh $VM_NAME --zone=$ZONE --command="
            if tmux has-session -t $TMUX_SESSION 2>/dev/null; then
                tmux capture-pane -t $TMUX_SESSION -p -S -500
            elif [ -f $LOG_FILE ]; then
                cat $LOG_FILE
            else
                echo 'No logs available'
            fi
        " 2>/dev/null
        exit 0
        ;;

    stop\ all)
        echo -e "${YELLOW}Stopping all cloud agents...${NC}"
        gcloud compute ssh $VM_NAME --zone=$ZONE --command='
            stopped=0
            for i in 0 1 2 3; do
                if tmux kill-session -t agent-$i 2>/dev/null; then
                    echo "Stopped agent-$i"
                    stopped=$((stopped + 1))
                fi
            done
            if [ $stopped -eq 0 ]; then
                echo "No agents were running"
            else
                echo "Stopped $stopped agent(s)"
            fi
        ' 2>/dev/null
        exit 0
        ;;

    stop*)
        # Parse: "stop" or "stop 2"
        STOP_ARG="${TASK#stop}"
        STOP_ARG="${STOP_ARG# }"

        WT="${STOP_ARG:-0}"
        TMUX_SESSION=$(get_tmux_session "$WT")

        echo -e "${YELLOW}Stopping agent on worktree $WT...${NC}"
        gcloud compute ssh $VM_NAME --zone=$ZONE --command="
            tmux kill-session -t $TMUX_SESSION 2>/dev/null && echo 'Agent stopped' || echo 'No agent was running on worktree $WT'
        " 2>/dev/null
        exit 0
        ;;

    reset\ all)
        echo -e "${YELLOW}Resetting all idle worktrees to main...${NC}"
        gcloud compute ssh $VM_NAME --zone=$ZONE --command='
            reset_count=0
            for i in 0 1 2 3; do
                if tmux has-session -t agent-$i 2>/dev/null; then
                    echo "Skipping worktree $i (agent running)"
                    continue
                fi

                if [ "$i" = "0" ]; then
                    DIR=~/claritypledge
                else
                    DIR=~/claritypledge-$i
                fi

                if [ ! -d "$DIR" ]; then
                    continue
                fi

                cd "$DIR"
                BRANCH=$(git branch --show-current)

                if [ "$BRANCH" = "main" ]; then
                    echo "Worktree $i already on main"
                    continue
                fi

                echo "Resetting worktree $i from $BRANCH to main..."
                git fetch origin main -q
                git checkout main -q
                git reset --hard origin/main -q
                git clean -fd -q
                reset_count=$((reset_count + 1))
            done

            if [ $reset_count -eq 0 ]; then
                echo "No worktrees needed resetting"
            else
                echo "Reset $reset_count worktree(s) to main"
            fi
        ' 2>/dev/null
        exit 0
        ;;

    reset*)
        # Parse: "reset 2"
        RESET_ARG="${TASK#reset}"
        RESET_ARG="${RESET_ARG# }"

        if [ -z "$RESET_ARG" ]; then
            echo -e "${RED}Usage: /c reset N  (where N is 0-3)${NC}"
            exit 1
        fi

        WT="$RESET_ARG"
        PROJECT_DIR=$(get_project_dir "$WT")
        TMUX_SESSION=$(get_tmux_session "$WT")

        echo -e "${YELLOW}Resetting worktree $WT to main...${NC}"

        gcloud compute ssh $VM_NAME --zone=$ZONE --command="
            # Check if agent is running
            if tmux has-session -t $TMUX_SESSION 2>/dev/null; then
                echo 'Error: Agent is running on worktree $WT'
                echo 'Stop it first with: /c stop $WT'
                exit 1
            fi

            DIR=~/$PROJECT_DIR
            if [ ! -d \"\$DIR\" ]; then
                echo 'Worktree $WT not set up. Run: /c setup-worktrees'
                exit 1
            fi

            cd \"\$DIR\"
            BRANCH=\$(git branch --show-current)

            echo \"Current branch: \$BRANCH\"
            echo \"Uncommitted changes:\"
            git status --short
            echo ''
            echo 'Resetting to main...'

            git fetch origin main -q
            git checkout main
            git reset --hard origin/main
            git clean -fd

            echo ''
            echo 'Worktree $WT reset to main'
        " 2>/dev/null
        exit 0
        ;;

    pull*)
        # Parse: "pull" or "pull 2"
        PULL_ARG="${TASK#pull}"
        PULL_ARG="${PULL_ARG# }"

        # Default to worktree 0 if not specified
        WT="${PULL_ARG:-0}"

        PROJECT_DIR=$(get_project_dir "$WT")

        # Find the local worktree path
        REPO_ROOT=$(git rev-parse --show-toplevel)
        PARENT_DIR=$(dirname "$REPO_ROOT")

        if [ "$WT" = "0" ]; then
            LOCAL_WORKTREE="$REPO_ROOT"
        else
            # Try different naming conventions
            if [ -d "$PARENT_DIR/claritypledge-$WT" ]; then
                LOCAL_WORKTREE="$PARENT_DIR/claritypledge-$WT"
            elif [ -d "$PARENT_DIR/worktree-$WT" ]; then
                LOCAL_WORKTREE="$PARENT_DIR/worktree-$WT"
            else
                echo -e "${RED}Error: No local worktree found for index $WT${NC}"
                echo ""
                echo "Available local worktrees:"
                git worktree list
                exit 1
            fi
        fi

        echo -e "${BLUE}Pulling work from cloud worktree $WT...${NC}"
        echo "Cloud: ~/$PROJECT_DIR"
        echo "Local: $LOCAL_WORKTREE"
        echo ""

        # Get the branch the cloud worktree is on
        CLOUD_BRANCH=$(gcloud compute ssh $VM_NAME --zone=$ZONE --command="cd $PROJECT_DIR && git branch --show-current" 2>/dev/null)
        echo "Cloud branch: $CLOUD_BRANCH"

        # Commit and push any work on the cloud
        gcloud compute ssh $VM_NAME --zone=$ZONE --command="
            cd $PROJECT_DIR
            git add -A
            git commit -m 'cloud-agent: work completed' --allow-empty
            git push -u origin \$(git branch --show-current)
        " 2>/dev/null

        # Fetch and merge locally
        git fetch --all

        cd "$LOCAL_WORKTREE"
        LOCAL_BRANCH=$(git branch --show-current)
        echo "Local branch: $LOCAL_BRANCH"

        echo ""
        echo "Merging $CLOUD_BRANCH into $LOCAL_BRANCH..."
        if ! git merge "origin/$CLOUD_BRANCH" -m "Merge cloud-agent work: $CLOUD_BRANCH"; then
            echo ""
            echo -e "${RED}Merge conflict! Resolve manually:${NC}"
            echo "  cd $LOCAL_WORKTREE"
            echo "  git status"
            echo "  # Fix conflicts, then: git add -A && git commit"
            exit 1
        fi

        echo ""
        echo -e "${GREEN}Cloud work merged!${NC}"
        echo ""
        echo "Recent commits:"
        git log --oneline -5
        exit 0
        ;;

    "attach"|attach*)
        ATTACH_ARG="${TASK#attach}"
        ATTACH_ARG="${ATTACH_ARG# }"
        WT="${ATTACH_ARG:-0}"
        TMUX_SESSION=$(get_tmux_session "$WT")
        PROJECT_DIR=$(get_project_dir "$WT")

        echo -e "${BLUE}Attaching to worktree $WT...${NC}"
        echo "Press Ctrl+B, then D to detach"
        echo ""
        gcloud compute ssh $VM_NAME --zone=$ZONE -- -t "cd $PROJECT_DIR && tmux attach -t $TMUX_SESSION 2>/dev/null || (echo 'No session. Starting claude...' && tmux new -s $TMUX_SESSION)"
        exit 0
        ;;

    "branch"|branch*)
        BRANCH_ARG="${TASK#branch}"
        BRANCH_ARG="${BRANCH_ARG# }"
        WT="${BRANCH_ARG:-0}"
        PROJECT_DIR=$(get_project_dir "$WT")

        gcloud compute ssh $VM_NAME --zone=$ZONE --command="
            cd $PROJECT_DIR && git branch --show-current
        " 2>/dev/null
        exit 0
        ;;
esac

# =============================================================================
# RUN A TASK
# =============================================================================

# Default is Gemini, use Claude only when specified
USE_CLAUDE=false
if [[ "$TASK" == claude* ]]; then
    USE_CLAUDE=true
    TASK="${TASK#claude }"
fi

# Auto-detect worktree if not specified
if [ "$AUTO_DETECT" = true ]; then
    echo -e "${BLUE}Finding available worktree...${NC}"
    WORKTREE=$(find_available_worktree)

    if [ "$WORKTREE" = "NONE" ]; then
        echo -e "${RED}All worktrees are busy!${NC}"
        echo ""
        echo "Running agents:"
        get_worktree_list | grep RUNNING
        echo ""
        echo "Options:"
        echo "  /c stop N              # Stop agent on worktree N"
        echo "  /c stop all            # Stop all agents"
        echo "  /c --worktree N task   # Force use worktree N (kills existing)"
        exit 1
    fi

    echo "Using worktree: $WORKTREE"
fi

# Validate worktree number
if ! [[ "$WORKTREE" =~ ^[0-3]$ ]]; then
    echo -e "${RED}Invalid worktree: $WORKTREE (must be 0-3)${NC}"
    exit 1
fi

# Set worktree-specific paths
PROJECT_DIR=$(get_project_dir "$WORKTREE")
TMUX_SESSION=$(get_tmux_session "$WORKTREE")
DEV_PORT=$(get_dev_port "$WORKTREE")
TASK_FILE=$(get_task_file "$WORKTREE")
LOG_FILE=$(get_log_file "$WORKTREE")
STATE_FILE=$(get_state_file "$WORKTREE")

# Sanitize task for safe use in shell commands
SAFE_TASK=$(sanitize_task "$TASK")

# Generate feature branch for this task
FEATURE_BRANCH=$(generate_branch_name "$TASK")

if [ "$USE_CLAUDE" = true ]; then
    echo -e "${BLUE}Cloud Agent (Claude Opus 4.5) - Worktree $WORKTREE${NC}"
else
    echo -e "${BLUE}Cloud Agent (Gemini 2.5 Pro) - Worktree $WORKTREE${NC}"
fi
echo ""

# Check auth first (only for Claude)
if [ "$USE_CLAUDE" = true ]; then
    check_auth
fi

# Step 1: Push local changes
echo "1. Pushing your code to GitHub..."
git add -A 2>/dev/null
if ! git commit -m "cloud-agent: starting task" --allow-empty 2>/dev/null; then
    echo -e "${YELLOW}   (No local changes to commit)${NC}"
fi
if ! git push 2>/dev/null; then
    echo -e "${YELLOW}   Warning: Could not push to remote${NC}"
fi

# Step 2: Pull on cloud, create feature branch
echo "2. Creating feature branch: $FEATURE_BRANCH on worktree $WORKTREE..."
gcloud compute ssh $VM_NAME --zone=$ZONE --command="
    cd $PROJECT_DIR || { echo 'Worktree $WORKTREE not set up. Run: /c setup-worktrees'; exit 1; }
    git fetch --all -q
    git checkout $CURRENT_BRANCH 2>/dev/null || git checkout -b $CURRENT_BRANCH origin/$CURRENT_BRANCH
    git pull -q
    git checkout -b $FEATURE_BRANCH
" 2>/dev/null

# Step 3: Start the task
echo "3. Starting task: \"$TASK\""
echo "   Worktree: $WORKTREE"
echo "   Dev port: $DEV_PORT"
if [ "$USE_CLAUDE" = true ]; then
    echo "   Model: Claude Opus 4.5"
else
    echo "   Model: Gemini 3 Pro via Aider"
fi
echo ""

if [ "$USE_CLAUDE" = false ]; then
    # Use Aider with Gemini
    gcloud compute ssh $VM_NAME --zone=$ZONE --command="
        cd $PROJECT_DIR

        # Kill existing session for this worktree
        tmux kill-session -t $TMUX_SESSION 2>/dev/null || true

        # Start new session with Aider + Gemini
        tmux new-session -d -s $TMUX_SESSION bash -c '
            source ~/aider-env/bin/activate
            aider --model gemini/gemini-3-pro-preview --message \"$SAFE_TASK\" --yes-always 2>&1 | tee $LOG_FILE
            echo \"\"
            echo \"=== TASK COMPLETE ===\"
            echo \"Committing work...\"
            git add -A
            git commit -m \"cloud-agent (gemini): task completed\" --allow-empty
            git push -u origin $FEATURE_BRANCH
            echo \"\"
            echo \"Work pushed to branch: $FEATURE_BRANCH\"
            echo \"Run /c pull $WORKTREE to get the changes\"
            echo \"Press Enter to close...\"
            read
        '
    " 2>/dev/null
else
    # Use Claude Code with periodic commits and Telegram notifications
    gcloud compute ssh $VM_NAME --zone=$ZONE --command="
        cd $PROJECT_DIR

        # Kill existing session for this worktree
        tmux kill-session -t $TMUX_SESSION 2>/dev/null || true

        # Create a commit helper script
        cat > /tmp/periodic-commit-$WORKTREE.sh << 'COMMIT_SCRIPT'
#!/bin/bash
cd \$PROJECT_DIR
while true; do
    sleep 300  # Every 5 minutes
    if [ -n \"\$(git status --porcelain)\" ]; then
        git add -A
        git commit -m \"cloud-agent: checkpoint [auto]\" --allow-empty 2>/dev/null
        git push -u origin \$(git branch --show-current) 2>/dev/null
    fi
done
COMMIT_SCRIPT
        chmod +x /tmp/periodic-commit-$WORKTREE.sh

        # Save task name for status display
        echo \"$SAFE_TASK\" > $TASK_FILE

        # Notify via Telegram that task started
        ~/telegram-bot.sh start \"[WT$WORKTREE] $SAFE_TASK\" \"$FEATURE_BRANCH\"

        # Start new session with task + periodic commits
        tmux new-session -d -s $TMUX_SESSION bash -c '
            # Start periodic commit in background
            PROJECT_DIR=$PROJECT_DIR /tmp/periodic-commit-$WORKTREE.sh &
            COMMIT_PID=\$!

            # Start dev server in background for /loop visual checks
            npm run dev -- --port $DEV_PORT &
            DEV_SERVER_PID=\$!
            sleep 5  # Wait for dev server to start

            # Start cloudflared tunnel for external access
            TUNNEL_LOG="/tmp/tunnel-$WORKTREE.log"
            cloudflared tunnel --url http://localhost:$DEV_PORT > "\$TUNNEL_LOG" 2>&1 &
            TUNNEL_PID=\$!
            sleep 3  # Wait for tunnel to establish

            # Extract and send tunnel URL to Telegram
            TUNNEL_URL=\$(grep -o "https://[a-z0-9-]*\.trycloudflare\.com" "\$TUNNEL_LOG" | head -1)
            if [ -n "\$TUNNEL_URL" ]; then
                ~/telegram-bot.sh url "[WT$WORKTREE] $SAFE_TASK" "\$TUNNEL_URL"
            fi

            # Run the main task using /loop workflow
            claude --dangerously-skip-permissions -p \"Execute this task using the /loop workflow:

$SAFE_TASK

AUTONOMOUS MODE INSTRUCTIONS:
- Follow /loop workflow steps (analyze -> implement -> test -> visual check if UI)
- Do NOT use AskUserQuestion - make reasonable decisions based on the spec
- If something is ambiguous, pick the simpler option
- For infrastructure setup (Supabase buckets, tables), document what needs manual creation
- Use Playwright MCP for visual checks (dev server is running on localhost:$DEV_PORT)
- Commit after each major step completion
- If truly blocked, write your question to /tmp/agent-question-$WORKTREE.txt and the human will check later
- BMAD workflows available: /bmad:bmm:workflows:dev-story, /bmad:bmm:agents:dev, etc.\" 2>&1 | tee $LOG_FILE

            # Stop tunnel
            kill \$TUNNEL_PID 2>/dev/null || true

            # Stop dev server
            kill \$DEV_SERVER_PID 2>/dev/null || true

            # Stop periodic commits
            kill \$COMMIT_PID 2>/dev/null

            echo \"\"
            echo \"=== TASK COMPLETE ===\"
            echo \"Committing final work...\"
            git add -A
            git commit -m \"cloud-agent: task completed\" --allow-empty
            git push -u origin $FEATURE_BRANCH

            # Notify via Telegram
            ~/telegram-bot.sh complete \"[WT$WORKTREE] $SAFE_TASK\" \"$FEATURE_BRANCH\"

            echo \"\"
            echo \"Work pushed to branch: $FEATURE_BRANCH\"
            echo \"Run /c pull $WORKTREE to get the changes\"
        '
    " 2>/dev/null
fi

echo ""
echo -e "${GREEN}Task is running in the cloud!${NC}"
echo ""
echo "Worktree: $WORKTREE"
echo "Feature branch: $FEATURE_BRANCH"
echo "Base branch: $CURRENT_BRANCH"
echo "Task: $SAFE_TASK"
if [ "$USE_CLAUDE" = true ]; then
    echo "Model: Claude Opus 4.5"
else
    echo "Model: Gemini 3 Pro"
fi
echo ""
echo -e "${YELLOW}What's next:${NC}"
echo "  /c status              # Check all agents"
echo "  /c status $WORKTREE            # Check this agent"
echo "  /c pull $WORKTREE              # Get work when done"
echo ""
echo "You can close your laptop now!"
