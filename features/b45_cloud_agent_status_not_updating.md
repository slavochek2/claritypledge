# B45: Cloud Agent Doesn't Update Worktree Status

**Status:** Open
**Priority:** MEDIUM
**Type:** Bug
**Created:** 2026-01-07

---

## Problem

Cloud agent sends Telegram notifications but never updates `worktree_status` table. Status queries return stale data.

---

## Root Cause

`cloud-agent.sh` calls `telegram-bot.sh complete` which only sends messages — no Supabase update.

---

## Fix

Add status updates to `cloud-agent.sh` at task start and end.

### Code to Add

```bash
# Near other config vars (around line 50)
SUPABASE_URL="https://besjtuodziykmjidubzw.supabase.co"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-}"  # Set in environment

update_status() {
    [ -z "$SUPABASE_ANON_KEY" ] && return  # Skip if no key
    curl -sf -X PATCH \
        "${SUPABASE_URL}/rest/v1/worktree_status?id=eq.cloud-wt${WORKTREE}" \
        -H "apikey: ${SUPABASE_ANON_KEY}" \
        -H "Content-Type: application/json" \
        -d "{\"status\":\"$1\",\"last_task\":\"$2\",\"branch\":\"$3\",\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"updated_by\":\"cloud-agent\"}" \
        || echo "Warning: Status update failed (non-critical)"
}

# On task start (after branch creation)
update_status "running" "$TASK" "$FEATURE_BRANCH"

# On task end (before telegram notification)
update_status "done" "$TASK" "$FEATURE_BRANCH"
```

### Status Values

| Status | Meaning |
|--------|---------|
| `running` | Agent currently executing |
| `done` | Task finished |

The `last_task` field provides context. No need for `error`, `stale`, etc.

---

## Implementation

1. [ ] Add `update_status` function to `cloud-agent.sh`
2. [ ] Add `SUPABASE_ANON_KEY` to cloud VM environment (`~/.bashrc`)
3. [ ] Call on task start and end
4. [ ] Test locally (see below)
5. [ ] Deploy to cloud VM and test real task

---

## Testing

### 1. Test the curl locally first

```bash
# Set your anon key
export SUPABASE_ANON_KEY="eyJ..."  # Get from .env.local

# Simulate what the script will do
WORKTREE="main"
curl -sf -X PATCH \
    "https://besjtuodziykmjidubzw.supabase.co/rest/v1/worktree_status?id=eq.cloud-wt${WORKTREE}" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"status":"running","last_task":"test-task","branch":"test-branch","updated_at":"2026-01-07T12:00:00Z","updated_by":"cloud-agent"}'

# Check it worked
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/worktree_status?id=eq.cloud-wtmain&select=status,last_task" \
    -H "apikey: ${SUPABASE_ANON_KEY}"
```

**Expected:** Returns `[{"status":"running","last_task":"test-task"}]`

### 2. Test in cloud-agent.sh dry run

After adding the function, test without running a full task:

```bash
# SSH to cloud VM
ssh clarity-cloud

# Source the updated script to get the function
source ~/cloud-agent.sh  # or wherever it lives

# Test the function directly
WORKTREE="main"
TASK="manual-test"
FEATURE_BRANCH="test-branch"
update_status "running" "$TASK" "$FEATURE_BRANCH"

# Verify
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/worktree_status?id=eq.cloud-wtmain&select=status,last_task,branch" \
    -H "apikey: ${SUPABASE_ANON_KEY}"
```

### 3. Full integration test

```bash
# Run a trivial cloud task
/c claude "echo hello world"

# Check status updated to "running" then "done"
# Query from local:
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/worktree_status?id=like.cloud*&select=id,status,last_task" \
    -H "apikey: ${SUPABASE_ANON_KEY}" | jq
```

### 4. Verify Telegram /status works

After implementation, `/status` command in Telegram should show current data from the table.

---

## Known Limitations

**Script killed mid-run:** Status stays `running`. Acceptable — use `ps aux | grep claude` for real-time checks. Status table is a log, not live state.

**Network failure:** Logged and ignored. Telegram notification is primary feedback.

---

## Related

- [cloud-agent.md](../docs/technical/cloud-agent.md)
- `worktree_status` table in prod Supabase
