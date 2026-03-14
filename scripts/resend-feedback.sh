#!/usr/bin/env bash
# P509: Backfill feedback emails for a single event.
#
# Identifies participants who RSVPed but have no email_send_log row
# with email_type=feedback and status=sent, then sends them the feedback
# email via Mailgun EU.
#
# Usage:
#   ./scripts/resend-feedback.sh <event-id>
#
# Example:
#   ./scripts/resend-feedback.sh 123e4567-e89b-12d3-a456-426614174000

set -euo pipefail

# ── Args ──────────────────────────────────────────────────────────────────────

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <event-id>" >&2
  exit 1
fi

EVENT_ID="$1"

# Validate UUID format
if ! [[ "$EVENT_ID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  echo "Error: <event-id> must be a valid UUID" >&2
  exit 1
fi

# ── Env ───────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env.local not found at $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

: "${MAILGUN_API_KEY:?MAILGUN_API_KEY not set in .env.local}"
: "${MAILGUN_DOMAIN:?MAILGUN_DOMAIN not set in .env.local}"
: "${TALLY_FORM_ID:=wa7RRq}"

# Prod project credentials
: "${SUPABASE_PROD_URL:?SUPABASE_PROD_URL not set in .env.local}"
: "${SUPABASE_PROD_ANON_KEY:?SUPABASE_PROD_ANON_KEY not set in .env.local}"

MAILGUN_BASE="https://api.eu.mailgun.net/v3"
FROM="Clarity Pledge Events <events@${MAILGUN_DOMAIN}>"

# ── Fetch event details ────────────────────────────────────────────────────────

echo "Fetching event $EVENT_ID from prod..."

EVENT_JSON=$(curl -sf \
  "${SUPABASE_PROD_URL}/rest/v1/events?id=eq.${EVENT_ID}&select=id,title,datetime,duration_minutes,timezone,location,slug&limit=1" \
  -H "apikey: ${SUPABASE_PROD_ANON_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_PROD_ANON_KEY}")

EVENT_TITLE=$(echo "$EVENT_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['title'])" 2>/dev/null || echo "")

if [[ -z "$EVENT_TITLE" ]]; then
  echo "Error: event $EVENT_ID not found in prod" >&2
  exit 1
fi

echo "Event: $EVENT_TITLE"

# ── Fetch all RSVPs with email ─────────────────────────────────────────────────

RSVP_JSON=$(curl -sf \
  "${SUPABASE_PROD_URL}/rest/v1/event_rsvps?event_id=eq.${EVENT_ID}&select=profile_id,profiles(email,name)" \
  -H "apikey: ${SUPABASE_PROD_ANON_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_PROD_ANON_KEY}")

# ── Fetch profiles that already received a feedback email ─────────────────────

SENT_JSON=$(curl -sf \
  "${SUPABASE_PROD_URL}/rest/v1/email_send_log?event_id=eq.${EVENT_ID}&email_type=eq.feedback&status=eq.sent&select=profile_id" \
  -H "apikey: ${SUPABASE_PROD_ANON_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_PROD_ANON_KEY}")

# ── Compute missing and send ───────────────────────────────────────────────────

python3 - "$EVENT_ID" "$EVENT_JSON" "$RSVP_JSON" "$SENT_JSON" \
         "$MAILGUN_BASE" "$MAILGUN_DOMAIN" "$FROM" "$MAILGUN_API_KEY" \
         "$TALLY_FORM_ID" <<'PYEOF'
import sys
import json
import urllib.request
import urllib.parse

event_id   = sys.argv[1]
event_data = json.loads(sys.argv[2])
rsvp_data  = json.loads(sys.argv[3])
sent_data  = json.loads(sys.argv[4])
mg_base    = sys.argv[5]
mg_domain  = sys.argv[6]
from_addr  = sys.argv[7]
mg_api_key = sys.argv[8]
tally_id   = sys.argv[9]

event = event_data[0]

already_sent = {row["profile_id"] for row in sent_data}

missing = [
    r for r in rsvp_data
    if r["profile_id"] not in already_sent
    and r.get("profiles") and r["profiles"].get("email")
]

if not missing:
    print("All participants already have a feedback email — nothing to send.")
    sys.exit(0)

print(f"Found {len(missing)} participant(s) missing feedback email. Sending now...")

feedback_url = f"https://tally.so/r/{tally_id}?event_id={event_id}"

def send_feedback(to_email: str, name: str | None) -> str | None:
    first = name.strip().split()[0] if name and name.strip() else None
    greeting = f"Hi {first}," if first else "Hi,"
    subject  = f"How was {event['title']}?"
    text_body = (
        (f"Hi {first},\n\n" if first else "")
        + f"Thanks for joining {event['title']}!\n\n"
        + f"Share your feedback (1 min): {feedback_url}\n\n"
        + "Clarity Pledge"
    )
    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>{subject}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#2563eb;padding:24px 40px;">
  <span style="color:#fff;font-size:18px;font-weight:600;">Clarity Pledge</span>
</td></tr>
<tr><td style="padding:32px 40px 40px;">
  <p style="margin:0 0 16px;font-size:16px;color:#111827;">{greeting}</p>
  <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">Thanks for joining us!</h1>
  <p style="margin:0;font-size:16px;color:#4b5563;">
    We'd love to hear how <strong>{event['title']}</strong> went for you.
    It takes about 1 minute.
  </p>
  <a href="{feedback_url}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:500;margin-top:20px;">Share your feedback</a>
  <p style="margin:24px 0 0;font-size:14px;color:#6b7280;">Your feedback helps us make future events even better. Thank you!</p>
</td></tr>
<tr><td style="padding:20px 40px;border-top:1px solid #e5e7eb;">
  <p style="margin:0;font-size:12px;color:#9ca3af;">Clarity Pledge · <a href="https://claritypledge.com" style="color:#9ca3af;">claritypledge.com</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""

    data = urllib.parse.urlencode({
        "from":    from_addr,
        "to":      to_email,
        "subject": subject,
        "html":    html_body,
        "text":    text_body,
    }).encode()

    import base64
    token = base64.b64encode(f"api:{mg_api_key}".encode()).decode()
    req = urllib.request.Request(
        f"{mg_base}/{mg_domain}/messages",
        data=data,
        headers={"Authorization": f"Basic {token}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
            return result.get("id")
    except urllib.error.HTTPError as e:
        print(f"  Mailgun HTTP error {e.code}: {e.read().decode()}", file=sys.stderr)
        return None

sent_count   = 0
failed_count = 0

for rsvp in missing:
    profile = rsvp["profiles"]
    email   = profile["email"]
    name    = profile.get("name")
    print(f"  Sending to {email} ({name or 'no name'})...", end=" ")
    msg_id = send_feedback(email, name)
    if msg_id:
        print(f"OK ({msg_id})")
        sent_count += 1
    else:
        print("FAILED (see error above)")
        failed_count += 1

print(f"\nDone. Sent: {sent_count}, Failed: {failed_count}")
if failed_count:
    print("Note: failures are not logged to email_send_log by this script.")
    print("Re-run to retry failed sends.")
PYEOF
