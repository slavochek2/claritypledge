#!/usr/bin/env bash
# Build a past-attendee email list for an event; prints counts only, sends nothing.
# Usage: scripts/events/email-audience.sh <event-slug> <series-word, e.g. hike>
# Writes .private/campaigns/<slug>/audience.md (private). One keychain dialog per key.
set -euo pipefail
[ $# -eq 2 ] || { echo "usage: $0 <slug> <series-word>" >&2; exit 2; }
source "$(git rev-parse --show-toplevel)/scripts/keyring.sh"
KEYRING_REASON="email audience for $1: read-only on prod" keyring_require PROD_SUPABASE_SERVICE_ROLE_KEY || exit 1
KEYRING_REASON="email audience for $1: read Mailgun suppressions" keyring_require MAILGUN_API_KEY || exit 1
exec python3 "$(dirname "$0")/email-audience.py" "$1" "$2"
