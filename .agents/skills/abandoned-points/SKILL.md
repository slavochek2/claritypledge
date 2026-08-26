---
name: abandoned-points
description: "Find points in prod with zero positions (abandoned). Lists them with creator info for manual deletion confirmation."
version: 1.0.0
when_to_use: "Run periodically to audit and clean up abandoned points that have no positions taken on them."
---

# Abandoned Points Audit

Find points in production that have no positions taken on them — "abandoned" points that clutter the database.

## Steps

### 1. Query prod for abandoned points

Use Supabase MCP if available (main conversation context):

```sql
SELECT p.id, p.statement, p.context, p.created_at,
       pr.name, pr.slug
FROM points p
LEFT JOIN profiles pr ON pr.id = p.first_validator_id
WHERE NOT EXISTS (SELECT 1 FROM point_positions pp WHERE pp.point_id = p.id)
ORDER BY p.created_at ASC;
```

Fallback (subagent / no MCP):

```bash
source "$(git rev-parse --show-toplevel)/.env.local"
PROD_URL="https://besjtuodziykmjidubzw.supabase.co/rest/v1"
H1="apikey: $PROD_SUPABASE_SERVICE_ROLE_KEY"
H2="Authorization: Bearer $PROD_SUPABASE_SERVICE_ROLE_KEY"

# Get all points with creator info — use RPC or filter server-side
# IMPORTANT: PostgREST has a 1000-row default limit. Use pagination headers
# (Range: 0-999, then 1000-1999, etc.) if point_positions exceeds 1000 rows.
curl -s "$PROD_URL/points?select=id,statement,context,first_validator_id,created_at,profiles!points_first_validator_id_fkey(name,slug),point_positions(count)&point_positions.count=eq.0&order=created_at.asc" \
  -H "$H1" -H "$H2" -H "Prefer: count=exact"
```

### 2. Present results

Present abandoned points as a table:

```
| # | Point ID (short) | Statement (first 60 chars) | Creator | Created | Age |
```

Show the table and **stop**. Wait for explicit user confirmation before any deletion.

> **Found N abandoned points** (zero positions taken).
>
> [table]
>
> Options:
> - **Delete all** — remove all N points
> - **Delete specific** — tell me which numbers to delete (e.g., "1, 3, 5")
> - **Skip** — do nothing

**Do NOT proceed to step 3 until the user explicitly confirms which points to delete.**

### 3. Backup confirmed points (only after user says so)

Before deleting anything, export the confirmed point rows and all their child data as JSON:

```bash
source "$(git rev-parse --show-toplevel)/.env.local"
PROD_URL="https://besjtuodziykmjidubzw.supabase.co/rest/v1"
H1="apikey: $PROD_SUPABASE_SERVICE_ROLE_KEY"
H2="Authorization: Bearer $PROD_SUPABASE_SERVICE_ROLE_KEY"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="$(git rev-parse --show-toplevel)/.private/backups"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/abandoned-points-${TIMESTAMP}.json"

# Export each confirmed point + all FK children
echo "[" > "$BACKUP_FILE"
for POINT_ID in $CONFIRMED_IDS; do
  echo "{\"point\":" >> "$BACKUP_FILE"
  curl -s "$PROD_URL/points?id=eq.$POINT_ID" -H "$H1" -H "$H2" >> "$BACKUP_FILE"
  echo ",\"point_positions\":" >> "$BACKUP_FILE"
  curl -s "$PROD_URL/point_positions?point_id=eq.$POINT_ID" -H "$H1" -H "$H2" >> "$BACKUP_FILE"
  echo ",\"point_position_history\":" >> "$BACKUP_FILE"
  curl -s "$PROD_URL/point_position_history?point_id=eq.$POINT_ID" -H "$H1" -H "$H2" >> "$BACKUP_FILE"
  echo ",\"story_points\":" >> "$BACKUP_FILE"
  curl -s "$PROD_URL/story_points?point_id=eq.$POINT_ID" -H "$H1" -H "$H2" >> "$BACKUP_FILE"
  echo ",\"story_point_history\":" >> "$BACKUP_FILE"
  curl -s "$PROD_URL/story_point_history?point_id=eq.$POINT_ID" -H "$H1" -H "$H2" >> "$BACKUP_FILE"
  echo "}," >> "$BACKUP_FILE"
done
echo "]" >> "$BACKUP_FILE"
```

Report backup location and file size before proceeding to deletion.

### 4. Delete confirmed points

All FK children use `ON DELETE CASCADE`, so a single DELETE on `points` cascades to:
- `point_positions`
- `point_position_history`
- `story_points`
- `story_point_history`

```bash
for POINT_ID in $CONFIRMED_IDS; do
  curl -s -X DELETE "$PROD_URL/points?id=eq.$POINT_ID" \
    -H "$H1" -H "$H2" -H "Prefer: return=representation"
done
```

Report what was deleted and where the backup file is.

## Notes

- This queries **prod** (`besjtuodziykmjidubzw`), not test.
- Points are hidden from feeds by P543 zero-position filter, but still exist in the database.
- Deletion is irreversible — JSON backup is created in `.private/backups/` before any DELETE (gitignored, survives reboots, included in encrypted system backup).
- Daily full DB backup also runs via GitHub Actions to `gs://claritypledge-db-backups/` (7-day retention).
- Never execute steps 3-4 without explicit user confirmation.
- FK child tables: `point_positions`, `point_position_history`, `story_points`, `story_point_history` — all CASCADE on delete.
