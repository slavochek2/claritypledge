#!/usr/bin/env bash
# P1529: the sales mastermind's results for one event. Per Clarity Canvas owner: each version opened by each partner, per
# round, and how many POINTS their next versions created or reworded that carry the owner's own stance (optional, so this counts
# who chose to stand behind the mirror's changes, not a completion rate). A point carried over unchanged from the earlier version
# (a private copy of a legacy base point, `copied_from` set, made by no run) is not a change and is never counted. The spoken numbers are not here: they stay in the round threads (P1390).
# Founder-only by construction: it reads through supabase-readonly-sql.py (read-only, no write authority).
#
# Usage:
#   ./scripts/event-mastermind-results.sh <event-slug> [--env prod|test]   (default: prod)
set -euo pipefail

SLUG="${1:-}"
ENV="prod"
if [[ "${2:-}" == "--env" ]]; then ENV="${3:-prod}"; fi
if [[ -z "$SLUG" ]] || ! [[ "$SLUG" =~ ^[a-z0-9-]+$ ]]; then
  echo "Usage: $0 <event-slug> [--env prod|test]" >&2
  exit 1
fi
ROOT="$(git rev-parse --show-toplevel)"

# The slug is validated to [a-z0-9-] above, so it is safe inside the literal.
python3 "$ROOT/scripts/supabase-readonly-sql.py" --env "$ENV" "
WITH e AS (SELECT id FROM public.events WHERE slug = '$SLUG'),
rounds AS (
  SELECT r.id, CASE WHEN COALESCE(r.showcase, false) THEN 'Demo'
                    ELSE 'Round ' || row_number() OVER (PARTITION BY COALESCE(r.showcase, false) ORDER BY r.round_no) END AS label, r.round_no
    FROM public.event_rounds r JOIN e ON e.id = r.event_id
),
opens AS (
  SELECT o.owner_id, jsonb_agg(jsonb_build_object(
           'round', rd.label, 'partner', COALESCE(p.name, 'Deleted user'), 'version', v.published_seq,
           'opens', o.n, 'first', o.first_at) ORDER BY rd.round_no, p.name) AS rows
    FROM (SELECT owner_id, round_id, reader_id, version_id, count(*) AS n, min(opened_at) AS first_at
            FROM public.event_canvas_opens WHERE event_id = (SELECT id FROM e)
           GROUP BY owner_id, round_id, reader_id, version_id) o
    JOIN rounds rd ON rd.id = o.round_id
    LEFT JOIN public.profiles p ON p.id = o.reader_id
    LEFT JOIN public.canvas_versions v ON v.id = o.version_id
   GROUP BY o.owner_id
),
changed AS (
  SELECT t.profile_id AS owner_id, count(DISTINCT cp.point_id) AS points,
         count(DISTINCT cp.point_id) FILTER (WHERE pp.point_id IS NOT NULL) AS with_stance,
         count(DISTINCT t.draft_id) AS taps,
         count(DISTINCT t.draft_id) FILTER (WHERE d.state = 'published') AS published
    FROM public.event_next_version_taps t
    JOIN rounds rd ON rd.id = t.round_id
    JOIN public.canvas_drafts d ON d.id = t.draft_id
    LEFT JOIN public.canvas_draft_points cp ON cp.draft_id = t.draft_id AND cp.copied_from IS NULL
    LEFT JOIN public.point_positions pp ON pp.point_id = cp.point_id AND pp.user_id = t.profile_id
   GROUP BY t.profile_id
)
SELECT COALESCE(p.name, 'Deleted user') AS owner, COALESCE(c.taps, 0) AS taps, COALESCE(c.published, 0) AS published,
       COALESCE(c.points, 0) AS points, COALESCE(c.with_stance, 0) AS with_stance, COALESCE(o.rows, '[]'::jsonb) AS opens
  FROM (SELECT ec.profile_id FROM public.event_canvases ec JOIN e ON e.id = ec.event_id) ow
  LEFT JOIN public.profiles p ON p.id = ow.profile_id
  LEFT JOIN changed c ON c.owner_id = ow.profile_id
  LEFT JOIN opens o ON o.owner_id = ow.profile_id
 ORDER BY owner" | python3 -c '
import json, re, sys
rows = json.load(sys.stdin)
# Names are untrusted: control characters (terminal escapes) never reach the terminal.
def clean(v):
    return "-" if v is None else re.sub(r"[\x00-\x1f\x7f-\x9f]", "?", str(v))
if not isinstance(rows, list):
    sys.exit("query failed: %s" % rows)
print("%d Clarity Canvas owners" % len(rows))
for r in rows:
    print()
    print("%s: %s next versions asked, %s published; new or reworded points with their own stance: %s of %s" % (clean(r["owner"]), r["taps"], r["published"], r["with_stance"], r["points"]))
    if not r["opens"]:
        print("  no recorded opens")
    for o in r["opens"]:
        ver = "v%s" % o["version"] if o["version"] is not None else "version unknown"
        print("  %s: %s opened %s (%sx, first %s)" % (clean(o["round"]), clean(o["partner"]), ver, o["opens"], clean(o["first"])))
'
