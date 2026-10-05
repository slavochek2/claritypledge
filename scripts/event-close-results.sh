#!/usr/bin/env bash
# P1389: the evening close's answers for one event — feedback, and the one personal ask each
# person answered. Founder-only by construction: it reads through supabase-readonly-sql.py
# (read-only token, no write authority) and nothing in the app shows these rows to anyone.
#
# Usage:
#   ./scripts/event-close-results.sh <event-slug> [--env prod|test]   (default: prod)
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
SELECT p.name, f.score, f.liked, f.quote_ok, f.improve,
       (SELECT string_agg(a.ask || '=' || a.answer || COALESCE(' (' || a.detail || ')', ''), '; ' ORDER BY a.answered_at)
          FROM public.personal_ask_answers a WHERE a.event_id = e.id AND a.user_id = f.user_id) AS asks
FROM public.events e
JOIN public.event_feedback f ON f.event_id = e.id
JOIN public.profiles p ON p.id = f.user_id
WHERE e.slug = '$SLUG'
ORDER BY f.created_at" | python3 -c '
import json, re, sys
rows = json.load(sys.stdin)
# Attendee text is untrusted: control characters (terminal escapes) never reach the terminal.
def clean(v):
    return "-" if v is None else re.sub(r"[\x00-\x08\x0b-\x1f\x7f-\x9f]", "?", str(v)).replace("\n", "\n           ")
if not isinstance(rows, list):
    sys.exit("query failed: %s" % rows)
print(f"{len(rows)} answers")
scores = [r["score"] for r in rows if r["score"] is not None]
if scores:
    print(f"average recommend score: {sum(scores) / len(scores):.1f} / 10")
for r in rows:
    print()
    print("%s: %s/10" % (clean(r["name"]), clean(r["score"])))
    if r["liked"]:
        print("  %-8s %s" % ("quote:", "may be used" if r["quote_ok"] else "private"))
    for key in ("liked", "improve", "asks"):
        if r[key]:
            print("  %-8s %s" % (key + ":", clean(r[key])))
'
