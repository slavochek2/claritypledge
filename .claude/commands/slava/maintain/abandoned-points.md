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

A read, so it runs on the read-only helper — never the prod master key (P1214). It has no row cap and bypasses RLS (asserted on every call).

> Not the Supabase MCP: it points at the **test** project, so an earlier version of this step audited test while presenting the result as prod. And not `p.context`: that column was dropped (P1095), so the old query errored.

```bash
ro() { python3 "$(git rev-parse --show-toplevel)/scripts/supabase-readonly-sql.py" --env prod "$1"; }
ro "SELECT p.id, p.statement, p.created_at, pr.name, pr.slug
    FROM public.points p
    LEFT JOIN public.profiles pr ON pr.id = p.first_validator_id
    WHERE NOT EXISTS (SELECT 1 FROM public.point_positions pp WHERE pp.point_id = p.id)
    ORDER BY p.created_at ASC"
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

The backup is a read, so it also uses the read-only helper:

```bash
ro() { python3 "$(git rev-parse --show-toplevel)/scripts/supabase-readonly-sql.py" --env prod "$1"; }
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="$(git rev-parse --show-toplevel)/.private/backups"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/abandoned-points-${TIMESTAMP}.json"

# Export each confirmed point + all FK children as ONE JSON document, then prove it parses and
# holds every confirmed id. Only a verified backup writes the `.ok` marker, and step 4 refuses
# to run without it — a failed read can never leave a partial file that looks like a backup.
rm -f "$BACKUP_FILE.ok"
BACKUP_OK=1
{
  echo "["
  SEP=""
  for POINT_ID in $CONFIRMED_IDS; do
    printf '%s{"point_id":"%s"' "$SEP" "$POINT_ID"
    for T in points:id point_positions:point_id point_position_history:point_id story_points:point_id story_point_history:point_id; do
      ROWS=$(ro "SELECT * FROM public.${T%%:*} WHERE ${T##*:} = '$POINT_ID'") || { BACKUP_OK=0; break 2; }
      printf ',"%s":%s' "${T%%:*}" "$ROWS"
    done
    printf '}'
    SEP=","
  done
  echo "]"
} > "$BACKUP_FILE"
if [ "$BACKUP_OK" = 1 ] && python3 - "$BACKUP_FILE" $CONFIRMED_IDS <<'PY'
import json, sys
doc = json.load(open(sys.argv[1]))
ids = sys.argv[2:]
assert [d["point_id"] for d in doc] == ids, "backup does not cover every confirmed id"
assert all(len(d["points"]) == 1 for d in doc), "a confirmed point is missing from the backup"
PY
then
  touch "$BACKUP_FILE.ok"
  echo "BACKUP VERIFIED: $BACKUP_FILE ($(wc -c < "$BACKUP_FILE") bytes)"
else
  echo "BACKUP FAILED — nothing may be deleted. Partial file left for inspection: $BACKUP_FILE"
fi
```

Report backup location and file size before proceeding to deletion.

### 4. Delete confirmed points

All FK children use `ON DELETE CASCADE`, so a single DELETE on `points` cascades to:
- `point_positions`
- `point_position_history`
- `story_points`
- `story_point_history`

This is the only write in the skill, so it is the only step that reads the prod master key — through the locked keyring (P1239), which raises one authorization dialog for this run. Tell the founder to click **Allow**, never "Always Allow". A declined dialog stops here with nothing deleted.

```bash
# Refuse without a verified backup from step 3 — checked BEFORE the keyring dialog, so a failed
# backup never even asks for the master key.
[ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE.ok" ] || { echo "STOP: no verified backup (step 3) — nothing deleted"; exit 1; }
source "$(git rev-parse --show-toplevel)/scripts/keyring.sh"
KEYRING_REASON="abandoned-points: delete confirmed points on prod" \
  keyring_require PROD_SUPABASE_SERVICE_ROLE_KEY || exit 1
PROD_URL="https://besjtuodziykmjidubzw.supabase.co/rest/v1"
for POINT_ID in $CONFIRMED_IDS; do
  # Headers from a process substitution, so the key never appears in argv (ps).
  curl -s -X DELETE "$PROD_URL/points?id=eq.$POINT_ID" \
    -H @<(printf 'apikey: %s\nAuthorization: Bearer %s\n' "$PROD_SUPABASE_SERVICE_ROLE_KEY" "$PROD_SUPABASE_SERVICE_ROLE_KEY") \
    -H "Prefer: return=representation"
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
