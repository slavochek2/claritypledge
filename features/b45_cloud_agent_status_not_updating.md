# B45: Cloud Agent Doesn't Update Worktree Status on Completion

**Status:** Open
**Priority:** MEDIUM (Developer experience issue)
**Type:** Bug
**Created:** 2026-01-07
**Affects:** Cloud agent workflow, Telegram notifications, status tracking

---

## Summary

When cloud agent completes a task, it sends a Telegram notification but does NOT update the `worktree_status` table in Supabase. This causes the status tracker to show stale data, and Telegram status queries return outdated information.

---

## How to Reproduce

1. Run a cloud agent task:
   ```bash
   /c claude Execute features/_drafts/p24_nextjs_migration_v2.md
   ```

2. Wait for task to complete (agent finishes, pushes branch)

3. Check worktree status:
   ```sql
   select id, branch, status, purpose, last_task
   from worktree_status
   where id like 'cloud%';
   ```

4. **Expected:** Status shows the completed task, branch name, status = 'completed' or 'active'

5. **Actual:** Status shows stale data (e.g., still says "idle" or shows old task)

6. Telegram bot `/status` command also shows stale data

---

## Root Cause

The `cloud-agent.sh` script calls `telegram-bot.sh complete` which sends a notification but doesn't update Supabase:

```bash
# cloud-agent.sh line 522
~/telegram-bot.sh complete '$TASK' '$FEATURE_BRANCH'
```

The `telegram-bot.sh` only sends Telegram messages:

```bash
# telegram-bot.sh notify_complete function
notify_complete() {
    send_message "✅ *Cloud Agent Complete*
Task: $1
Branch: $2
Run \`/c pull\` to get the changes."
}
```

**Missing:** No call to update `worktree_status` table.

---

## Affected Files

| File | Location | Issue |
|------|----------|-------|
| `scripts/cloud-agent.sh` | Local repo | Doesn't update Supabase on start/complete |
| `~/telegram-bot.sh` | Cloud VM | Doesn't update Supabase |
| `worktree_status` table | Prod Supabase | Never gets updated by cloud agent |

---

## Proposed Fix

### Option A: Update cloud-agent.sh (Recommended)

Add Supabase update calls to `cloud-agent.sh` at task start and completion:

```bash
# Add near top of script
SUPABASE_URL="https://besjtuodziykmjidubzw.supabase.co"
SUPABASE_KEY="<service-role-key>"  # Or use anon key with proper RLS

update_worktree_status() {
    local worktree_id="$1"
    local branch="$2"
    local status="$3"
    local purpose="$4"
    local last_task="$5"

    curl -s -X PATCH \
        "${SUPABASE_URL}/rest/v1/worktree_status?id=eq.${worktree_id}" \
        -H "apikey: ${SUPABASE_KEY}" \
        -H "Authorization: Bearer ${SUPABASE_KEY}" \
        -H "Content-Type: application/json" \
        -d "{
            \"branch\": \"${branch}\",
            \"status\": \"${status}\",
            \"purpose\": \"${purpose}\",
            \"last_task\": \"${last_task}\",
            \"updated_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
            \"updated_by\": \"cloud-agent\"
        }"
}

# Call on task start (around line 490)
update_worktree_status "cloud-wt${WORKTREE}" "$FEATURE_BRANCH" "in-progress" "$TASK" "Starting task"

# Call on task complete (around line 522)
update_worktree_status "cloud-wt${WORKTREE}" "$FEATURE_BRANCH" "active" "Completed: $TASK" "$TASK"
```

### Option B: Update telegram-bot.sh on VM

Add the same logic to `telegram-bot.sh` on the cloud VM. Less ideal because:
- Requires SSH to update
- Duplicates logic if cloud-agent.sh also needs it

### Option C: Create dedicated status update script

Create `update-status.sh` that both scripts can call. More modular but adds another file to maintain.

---

## Implementation Steps

1. [ ] Add Supabase credentials to cloud-agent.sh (use env var or secrets)
2. [ ] Add `update_worktree_status` function to cloud-agent.sh
3. [ ] Call function on task start with status "in-progress"
4. [ ] Call function on task complete with status "active"
5. [ ] Call function on task error with status "stale" or "error"
6. [ ] Test with a real cloud agent run
7. [ ] Verify Telegram `/status` reflects updates

---

## Security Consideration

The Supabase key in the script should be:
- **Option 1:** Service role key (full access, store securely)
- **Option 2:** Anon key with RLS policy allowing updates from specific source

RLS policy for Option 2:
```sql
CREATE POLICY "Allow cloud agent updates"
ON worktree_status
FOR UPDATE
USING (true)  -- Or check for specific conditions
WITH CHECK (updated_by IN ('cloud-agent', 'local-agent'));
```

---

## Workaround (Manual)

Until fixed, manually update status after cloud tasks:

```sql
UPDATE worktree_status SET
  branch = 'cloud-agent/worktree-1-execute-2832',
  status = 'active',
  purpose = 'Next.js migration completed',
  last_task = 'P24 Next.js migration v2',
  updated_at = now(),
  updated_by = 'manual'
WHERE id = 'cloud-main';
```

---

## Related

- [cloud-agent.md](../docs/technical/cloud-agent.md) - Cloud agent documentation
- `worktree_status` table in prod Supabase (`besjtuodziykmjidubzw`)
- Telegram bot on cloud VM (`~/telegram-bot.sh`)
