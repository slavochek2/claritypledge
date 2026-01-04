#!/bin/bash
# Cloud Agent - Run Claude Code tasks in the cloud from Cursor
# Full round-trip: Local → Cloud → Local

set -e

VM_NAME="clarity-agent"
ZONE="us-central1-a"
PROJECT_DIR="claritypledge"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Load gcloud
source "$(brew --prefix)/share/google-cloud-sdk/path.zsh.inc" 2>/dev/null || true

TASK="$*"

# Check if Claude is authenticated on the VM
check_auth() {
    echo -e "${BLUE}Checking cloud agent...${NC}"
    AUTH_CHECK=$(gcloud compute ssh $VM_NAME --zone=$ZONE --command="cd $PROJECT_DIR && claude -p 'hi' 2>&1 | head -5" 2>/dev/null || echo "VM_ERROR")
    
    if echo "$AUTH_CHECK" | grep -q "Invalid API key\|login\|API key"; then
        echo ""
        echo -e "${RED}⚠️  Claude needs to be authenticated on the cloud VM${NC}"
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
        echo -e "${RED}⚠️  Cannot connect to cloud VM${NC}"
        echo ""
        echo "The VM might be stopped. Start it with:"
        echo -e "${GREEN}  gcloud compute instances start clarity-agent --zone=us-central1-a${NC}"
        echo ""
        exit 1
    fi
}

show_help() {
    echo ""
    echo -e "${BLUE}☁️  Cloud Agent - Run tasks in the cloud${NC}"
    echo ""
    echo "USAGE:  /c [command]"
    echo ""
    echo "RUN TASKS:"
    echo "  \"task\"           Run with Claude Opus 4.5 (default)"
    echo "  gemini \"task\"    Run with Gemini 2.5 Pro"
    echo ""
    echo "MONITOR:"
    echo "  status           Check progress"
    echo "  logs             See full output"  
    echo "  pull             Get finished work back"
    echo "  stop             Cancel current task"
    echo ""
    echo "VM CONTROL:"
    echo "  setup            One-time login (run first!)"
    echo "  pause            Stop VM (save \$)"
    echo "  resume           Start VM"
    echo ""
    echo "EXAMPLES:"
    echo "  /c Add dark mode to settings"
    echo "  /c gemini Refactor the auth module"
    echo "  /c status"
    echo ""
}

if [ -z "$TASK" ]; then
    show_help
    exit 0
fi

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)

# Generate feature branch name from task
generate_branch_name() {
    local task="$1"
    # Extract first few words, lowercase, replace spaces with hyphens
    local slug=$(echo "$task" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9 ]//g' | awk '{print $1"-"$2"-"$3}' | sed 's/-$//')
    echo "cloud-agent/${slug}-$(date +%s | tail -c 5)"
}

case "$TASK" in
    "help"|"-h"|"--help")
        show_help
        exit 0
        ;;
        
    "setup"|"login"|"auth")
        echo -e "${BLUE}☁️  Cloud Agent Setup${NC}"
        echo ""
        echo "Connecting you to the cloud VM..."
        echo "Once connected, run: claude"
        echo "Click the URL to authenticate, then type: exit"
        echo ""
        gcloud compute ssh $VM_NAME --zone=$ZONE
        exit 0
        ;;
    
    "pause"|"vm-stop"|"stop-vm")
        echo -e "${YELLOW}⏸️  Pausing cloud VM (saves money)...${NC}"
        gcloud compute instances stop $VM_NAME --zone=$ZONE
        echo -e "${GREEN}✅ VM paused. Use '/c resume' to start again.${NC}"
        exit 0
        ;;
        
    "resume"|"vm-start"|"start-vm")
        echo -e "${BLUE}▶️  Starting cloud VM...${NC}"
        gcloud compute instances start $VM_NAME --zone=$ZONE
        echo -e "${GREEN}✅ VM started! Wait 30 seconds, then use /c${NC}"
        exit 0
        ;;
        
    "status")
        echo -e "${BLUE}📊 Cloud Agent Status${NC}"
        echo ""
        gcloud compute ssh $VM_NAME --zone=$ZONE --command="
            cd $PROJECT_DIR 2>/dev/null || { echo 'Project not found on VM'; exit 1; }
            
            echo \"Branch: \$(git branch --show-current)\"
            echo \"Last commit: \$(git log -1 --oneline)\"
            echo ''
            
            if tmux has-session -t agent 2>/dev/null; then
                echo '🟢 Agent is RUNNING'
                echo ''
                echo 'Recent output:'
                echo '─────────────────────────────────────'
                tmux capture-pane -t agent -p | tail -15
                echo '─────────────────────────────────────'
            else
                echo '⚪ No agent running'
            fi
        " 2>/dev/null
        exit 0
        ;;
        
    "logs")
        echo -e "${BLUE}📜 Full Agent Output${NC}"
        gcloud compute ssh $VM_NAME --zone=$ZONE --command="
            if tmux has-session -t agent 2>/dev/null; then
                tmux capture-pane -t agent -p -S -500
            elif [ -f /tmp/agent-output.log ]; then
                cat /tmp/agent-output.log
            else
                echo 'No logs available'
            fi
        " 2>/dev/null
        exit 0
        ;;
        
    "pull")
        echo -e "${BLUE}⬇️  Pulling work from cloud...${NC}"

        # Get the branch the cloud is on
        CLOUD_BRANCH=$(gcloud compute ssh $VM_NAME --zone=$ZONE --command="cd $PROJECT_DIR && git branch --show-current" 2>/dev/null)
        echo "Cloud is on branch: $CLOUD_BRANCH"

        # First, commit and push any work on the cloud
        gcloud compute ssh $VM_NAME --zone=$ZONE --command="
            cd $PROJECT_DIR
            git add -A
            git commit -m 'cloud-agent: work completed' --allow-empty
            git push -u origin \$(git branch --show-current)
        " 2>/dev/null

        # Fetch all branches
        git fetch --all

        # Check if it's a feature branch
        if [[ "$CLOUD_BRANCH" == cloud-agent/* ]]; then
            echo ""
            echo -e "${YELLOW}Feature branch detected: $CLOUD_BRANCH${NC}"
            echo ""
            echo "Options:"
            echo "  1. Create PR: gh pr create --head $CLOUD_BRANCH"
            echo "  2. Merge locally: git checkout $CLOUD_BRANCH && git checkout $CURRENT_BRANCH && git merge $CLOUD_BRANCH"
            echo ""
            echo "Checking out feature branch locally..."
            git checkout "$CLOUD_BRANCH" 2>/dev/null || git checkout -b "$CLOUD_BRANCH" "origin/$CLOUD_BRANCH"
            echo ""
            echo -e "${GREEN}✅ You're now on: $CLOUD_BRANCH${NC}"
            echo ""
            echo "Review the changes, then either:"
            echo "  - Create PR: gh pr create"
            echo "  - Merge to main: git checkout main && git merge $CLOUD_BRANCH && git push"
        else
            # Regular branch, just pull
            echo -e "${BLUE}Pulling to local...${NC}"
            git pull
            echo ""
            echo -e "${GREEN}✅ Cloud work pulled!${NC}"
        fi

        echo ""
        echo "Recent commits:"
        git log --oneline -5
        exit 0
        ;;
        
    "stop")
        echo -e "${YELLOW}🛑 Stopping cloud agent...${NC}"
        gcloud compute ssh $VM_NAME --zone=$ZONE --command="
            tmux kill-session -t agent 2>/dev/null && echo '✅ Agent stopped' || echo 'No agent was running'
        " 2>/dev/null
        exit 0
        ;;
        
    "attach")
        echo -e "${BLUE}🔗 Attaching to cloud agent...${NC}"
        echo "Press Ctrl+B, then D to detach and leave it running"
        echo ""
        gcloud compute ssh $VM_NAME --zone=$ZONE -- -t "cd $PROJECT_DIR && tmux attach -t agent 2>/dev/null || (echo 'No session. Starting claude...' && tmux new -s agent)"
        exit 0
        ;;
        
    "branch")
        gcloud compute ssh $VM_NAME --zone=$ZONE --command="
            cd $PROJECT_DIR && git branch --show-current
        " 2>/dev/null
        exit 0
        ;;
        
    "handoff")
        echo -e "${BLUE}🤝 Handing off to cloud...${NC}"
        echo ""
        
        # Commit and push current work
        echo "1. Saving your local work..."
        git add -A
        git commit -m "handoff to cloud agent" --allow-empty
        git push
        
        # Pull on cloud and switch to same branch
        echo "2. Syncing cloud to branch: $CURRENT_BRANCH..."
        gcloud compute ssh $VM_NAME --zone=$ZONE --command="
            cd $PROJECT_DIR
            git fetch --all
            git checkout $CURRENT_BRANCH 2>/dev/null || git checkout -b $CURRENT_BRANCH origin/$CURRENT_BRANCH
            git pull
        " 2>/dev/null
        
        # Start interactive Claude
        echo ""
        echo -e "${GREEN}✅ Cloud is synced to branch: $CURRENT_BRANCH${NC}"
        echo ""
        echo "Now connecting you to the cloud agent..."
        echo "  - Work with Claude as usual"
        echo "  - Press Ctrl+B, D to detach (keeps running)"
        echo "  - Later run: ./scripts/cloud-agent.sh pull"
        echo ""
        gcloud compute ssh $VM_NAME --zone=$ZONE -- -t "cd $PROJECT_DIR && tmux new -s agent 'claude; bash'"
        exit 0
        ;;
esac

# Check if using Gemini
USE_GEMINI=false
if [[ "$TASK" == gemini* ]]; then
    USE_GEMINI=true
    TASK="${TASK#gemini }"  # Remove "gemini " prefix
fi

# Default: Start a task with a prompt
if [ "$USE_GEMINI" = true ]; then
    echo -e "${BLUE}☁️  Cloud Agent (Gemini 2.5 Pro)${NC}"
else
    echo -e "${BLUE}☁️  Cloud Agent (Claude Opus 4.5)${NC}"
fi
echo ""

# Check auth first (only for Claude)
if [ "$USE_GEMINI" = false ]; then
    check_auth
fi

# Generate feature branch for this task
FEATURE_BRANCH=$(generate_branch_name "$TASK")

# Step 1: Push local changes to current branch
echo "1. Pushing your code to GitHub..."
git add -A 2>/dev/null || true
git commit -m "cloud-agent: starting task" --allow-empty 2>/dev/null || true
git push 2>/dev/null || true

# Step 2: Pull on cloud, create feature branch from current branch
echo "2. Creating feature branch: $FEATURE_BRANCH (from $CURRENT_BRANCH)..."
gcloud compute ssh $VM_NAME --zone=$ZONE --command="
    cd $PROJECT_DIR
    git fetch --all -q
    git checkout $CURRENT_BRANCH 2>/dev/null || git checkout -b $CURRENT_BRANCH origin/$CURRENT_BRANCH
    git pull -q
    git checkout -b $FEATURE_BRANCH
" 2>/dev/null

# Step 3: Start the task
echo "3. Starting task: \"$TASK\""
if [ "$USE_GEMINI" = true ]; then
    echo "   Using: Gemini 2.5 Pro via Aider"
else
    echo "   Using: Claude Opus 4.5"
fi
echo ""

if [ "$USE_GEMINI" = true ]; then
    # Use Aider with Gemini
    gcloud compute ssh $VM_NAME --zone=$ZONE --command="
        cd $PROJECT_DIR

        # Kill existing session
        tmux kill-session -t agent 2>/dev/null || true

        # Start new session with Aider + Gemini
        tmux new-session -d -s agent bash -c '
            source ~/aider-env/bin/activate
            aider --model gemini/gemini-2.5-pro-preview-06-05 --message \"$TASK\" --yes-always 2>&1 | tee /tmp/agent-output.log
            echo \"\"
            echo \"=== TASK COMPLETE ===\"
            echo \"Committing work...\"
            git add -A
            git commit -m \"cloud-agent (gemini): $TASK\" --allow-empty
            git push -u origin $FEATURE_BRANCH
            echo \"\"
            echo \"✅ Work pushed to branch: $FEATURE_BRANCH\"
            echo \"\"
            echo \"Run /c pull to get the changes\"
            echo \"Press Enter to close...\"
            read
        '
    " 2>/dev/null
else
    # Use Claude Code with periodic commits and Telegram notifications
    gcloud compute ssh $VM_NAME --zone=$ZONE --command="
        cd $PROJECT_DIR

        # Kill existing session
        tmux kill-session -t agent 2>/dev/null || true

        # Create a commit helper script
        cat > /tmp/periodic-commit.sh << 'COMMIT_SCRIPT'
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
        chmod +x /tmp/periodic-commit.sh

        # Notify via Telegram that task started
        ~/telegram-bot.sh start '$TASK' '$FEATURE_BRANCH'

        # Start new session with task + periodic commits
        tmux new-session -d -s agent bash -c '
            # Start periodic commit in background
            PROJECT_DIR=$PROJECT_DIR /tmp/periodic-commit.sh &
            COMMIT_PID=\$!

            # Run the main task
            claude -p \"$TASK

IMPORTANT: You are running autonomously without a human present.
- Do NOT use AskUserQuestion - make reasonable decisions based on the spec
- If something is ambiguous, pick the simpler option
- For infrastructure setup (Supabase buckets, tables), document what needs manual creation
- Commit after each major step completion
- If truly blocked, write your question to /tmp/agent-question.txt and the human will check later\" 2>&1 | tee /tmp/agent-output.log

            # Stop periodic commits
            kill \$COMMIT_PID 2>/dev/null

            echo \"\"
            echo \"=== TASK COMPLETE ===\"
            echo \"Committing final work...\"
            git add -A
            git commit -m \"cloud-agent: $TASK\" --allow-empty
            git push -u origin $FEATURE_BRANCH

            # Notify via Telegram
            ~/telegram-bot.sh complete \"$TASK\" \"$FEATURE_BRANCH\"

            echo \"\"
            echo \"✅ Work pushed to branch: $FEATURE_BRANCH\"
            echo \"\"
            echo \"Run /c pull to get the changes\"
        '
    " 2>/dev/null
fi

echo ""
echo -e "${GREEN}✅ Task is running in the cloud!${NC}"
echo ""
echo "Feature branch: $FEATURE_BRANCH"
echo "Base branch: $CURRENT_BRANCH"
echo "Task: $TASK"
if [ "$USE_GEMINI" = true ]; then
    echo "Model: Gemini 2.5 Pro"
else
    echo "Model: Claude Opus 4.5"
fi
echo ""
echo -e "${YELLOW}What's next:${NC}"
echo "  /c status   # Check progress"
echo "  /c pull     # Get work when done (creates PR or merges)"
echo ""
echo "You can close your laptop now! ☕"
