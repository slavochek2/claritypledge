# Cloud Agent

Run AI coding tasks in the cloud. Close your laptop, come back later.

## Quick Start

```bash
/c setup                          # One-time login (run first!)
/c Add dark mode to settings      # Send a task
/c status                         # Check progress
/c pull                           # Get work back
```

## How It Works

```
Your Laptop ──push──> GitHub <──pull── Cloud VM
                                         │
                                    Claude Code
                                         │
                              commits & pushes back
```

1. Your code pushes to GitHub
2. Cloud VM pulls it
3. Claude runs your task
4. Cloud commits when done
5. You `pull` to get changes

## Commands

| Command | What it does |
|---------|--------------|
| `/c "task"` | Run a task in the cloud |
| `/c status` | Check if running, see output |
| `/c pull` | Get finished work back |
| `/c logs` | See full output |
| `/c stop` | Cancel task |
| `/c setup` | One-time authentication |

## One-Time Setup

First time only, authenticate Claude on the VM:

```bash
/c setup
# or manually:
gcloud compute ssh clarity-agent --zone=us-central1-a
claude    # Click the URL to log in
exit
```

## VM Management

```bash
# Stop VM (saves money, ~$0.13/hour when running)
gcloud compute instances stop clarity-agent --zone=us-central1-a

# Start VM
gcloud compute instances start clarity-agent --zone=us-central1-a
```

When stopped:
- ✅ All code preserved
- ✅ All tools preserved  
- ✅ Login preserved
- ❌ Running tasks stop

## Troubleshooting

**"Invalid API key" error**: Run `/c setup` to authenticate

**"Cannot connect to VM"**: VM might be stopped. Start it:
```bash
gcloud compute instances start clarity-agent --zone=us-central1-a
```

## Cost

- Running: ~$0.13/hour (~$100/month 24/7)
- Stopped: ~$1/month (disk only)
- Your credits: $25,000 = 20+ years of runtime

