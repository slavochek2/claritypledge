#!/usr/bin/env bash
#
# check-stranded-signups.sh — P1257
#
# Finds people who started signup and never got in: an auth user whose
# email_confirmed_at is still NULL more than GRACE_HOURS after they were created.
#
# WHY THIS EXISTS. Someone tried to register for an event three times and never got
# in. Every send was accepted by the receiving mail server, so nothing in our stack
# looked wrong: the provider showed Sent -> Delivered, Supabase showed the user row,
# and the UI had shown a green "Check Your Email" screen. The mail was simply never
# found — it was in Junk with its links disabled. We only learned about it because
# they told the founder in person, and by then the provider's 7-day log retention had
# already erased six older cases beyond recovery.
#
# So this check does not test whether mail was ACCEPTED — that signal is what misled
# everyone. It tests the only thing that actually matters: did the person get in.
#
# PRIVACY — the reason this does not open a GitHub issue like the other gates do.
# The rows here are user email addresses and this repo is public (AGPL-3.0). All six
# existing scheduled gates alert by opening a GitHub issue; this one must never do
# that. The split: stdout carries a COUNT and nothing else, which is safe to publish
# and is what CI reports. Addresses are written only to a gitignored file under
# .private/, and only when --emails is passed on a human's own machine.
#
# Exit codes:
#   0  nothing stranded in the window
#   1  at least one stranded signup (the alerting condition)
#   2  could not run the check (missing credentials, API error) — never confused
#      with "found nothing", because a check that cannot run must not report clean
#
# Usage:
#   ./scripts/check-stranded-signups.sh                # count only
#   ./scripts/check-stranded-signups.sh --emails       # also write addresses to .private/
#   GRACE_HOURS=48 WINDOW_DAYS=14 ./scripts/check-stranded-signups.sh

set -euo pipefail

# WINDOW_DAYS is deliberately narrow, and the consequence is worth stating: a person who
# signs up and never confirms shows up for roughly WINDOW_DAYS minus GRACE_HOURS, then
# ages out of the count silently. Widening it is not the fix — a wide window re-includes
# every historical abandonment and the check would alert forever, which is how a monitor
# stops being read. Persistence is meant to come from the alert, not from this window:
# the scheduled workflow opens ONE issue and appends to it, so a fired alert stays open
# after the row leaves the window. Until that workflow ships, this script is manual and
# has no long-tail escalation — do not assume an unreported stranded signup was seen.
GRACE_HOURS="${GRACE_HOURS:-24}"
WINDOW_DAYS="${WINDOW_DAYS:-7}"
WRITE_EMAILS=0
[ "${1:-}" = "--emails" ] && WRITE_EMAILS=1

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Credentials come from .env.local (gitignored) locally, or the environment in CI.
#
# Read the two keys BY NAME rather than sourcing the file. `set -a; . .env.local`
# executes it as shell, so any value containing shell metacharacters is a syntax
# error that kills the script — .env.local carries at least one such value today,
# and the failure surfaced as a bare "syntax error near unexpected token `('"
# with no hint that the env file was the cause.
env_value() {
  [ -f "$REPO_ROOT/.env.local" ] || return 0
  sed -n "s/^${1}=//p" "$REPO_ROOT/.env.local" \
    | tail -n 1 \
    | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

# Exit-2 means "the check could not run", which is NOT a clean result. The reason has
# always been printed to stderr — but the CI caller drops stderr on purpose (it can carry
# user email addresses and the repo is public), so for three days the only signal that
# reached anyone was an issue body that GUESSED at the cause: "usually the prod
# service-role secret is missing or was rotated". Nobody could tell which of the five
# exit-2 paths had fired.
#
# So each one also emits a REASON CODE on stdout. Codes are fixed strings chosen to carry
# no user data, no addresses and no key material, which is what makes them safe to publish
# into a public GitHub issue verbatim. Never interpolate $response, an email, or a key into
# one. Separator is `=` and never a shell redirect character (.claude/rules/shell-safety.md).
cannot_run() {
  printf 'stranded_check_error=%s\n' "$1"
  exit 2
}

PROD_URL="${PROD_SUPABASE_URL:-$(env_value PROD_SUPABASE_URL)}"
PROD_URL="${PROD_URL:-https://besjtuodziykmjidubzw.supabase.co}"
PROD_REF="${PROD_SUPABASE_REF:-$(printf '%s' "$PROD_URL" | sed -E 's|https://([a-z0-9]+)\..*|\1|')}"

if ! command -v jq >/dev/null 2>&1; then
  echo "check-stranded-signups: jq is required but not installed." >&2
  cannot_run jq_not_installed
fi

# CREDENTIAL (P1214). This check only READS auth.users, so it prefers the scoped
# `Database: Read` token over the prod master key. Measured 2026-09-15: that token runs as
# supabase_read_only_user, which bypasses RLS and reads auth.users in full.
#
# The master-key path stays ONLY as a visible fallback while the CI secret is being
# provisioned. Two rules keep the fallback from quietly becoming permanent:
#   - it is taken only when NO scoped token is present — a scoped token that FAILS is
#     exit 2, never a silent retry on the stronger credential;
#   - the stdout summary names the credential used, so a CI run still on the fallback says
#     so in the issue body rather than only on the stderr that CI drops.
RO_TOKEN="${SUPABASE_READONLY_TOKEN:-$(env_value SUPABASE_READONLY_TOKEN)}"
CREDENTIAL=""

if [ -n "$RO_TOKEN" ]; then
  CREDENTIAL="scoped-read-only"
  # Shaped like the GoTrue admin response ({"users":[...]}) so the filter below is shared.
  # created_at is rendered with fractional seconds and a Z, the exact GoTrue shape the
  # `ts` helper was written for; Postgres' native "+00:00" offset would fail to parse.
  # rolbypassrls travels in the same request: without it every count over auth.users
  # could shrink silently, and a shrunk count reads as "nobody is stranded".
  sql="SELECT (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass,
    json_build_object('users', coalesce(json_agg(json_build_object(
      'id', id,
      'email', email,
      'created_at', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'),
      'email_confirmed_at', email_confirmed_at)), '[]'::json)) AS r
    FROM auth.users"
  # The token goes in a header read from a process substitution, never in argv (ps).
  raw="$(jq -cn --arg q "$sql" '{query: $q}' | curl -sS -f -X POST \
    "https://api.supabase.com/v1/projects/${PROD_REF}/database/query/read-only" \
    -H @<(printf 'Authorization: Bearer %s\n' "$RO_TOKEN") \
    -H 'Content-Type: application/json' \
    --data-binary @- 2>&1)" || {
    echo "check-stranded-signups: read-only query failed (NOT retried on the master key):" >&2
    echo "$raw" >&2
    cannot_run readonly_query_failed
  }
  if [ "$(printf '%s' "$raw" | jq -r '.[0].bypass // false' 2>/dev/null)" != "true" ]; then
    echo "check-stranded-signups: the read-only role does not bypass RLS — the auth.users read would be incomplete." >&2
    cannot_run readonly_role_cannot_see_all_rows
  fi
  response="$(printf '%s' "$raw" | jq -c '.[0].r')" || cannot_run unparseable_api_response
else
  CREDENTIAL="service-role-FALLBACK"
  SERVICE_KEY="${PROD_SUPABASE_SERVICE_ROLE_KEY:-$(env_value PROD_SUPABASE_SERVICE_ROLE_KEY)}"
  if [ -z "$SERVICE_KEY" ]; then
    echo "check-stranded-signups: neither SUPABASE_READONLY_TOKEN nor PROD_SUPABASE_SERVICE_ROLE_KEY is set — cannot query auth users." >&2
    echo "This is NOT a clean result. Set SUPABASE_READONLY_TOKEN in .env.local (local) or as a secret (CI)." >&2
    cannot_run missing_credential
  fi
  echo "check-stranded-signups: WARNING — no SUPABASE_READONLY_TOKEN; reading auth.users with the prod MASTER key (P1214 fallback)." >&2

  # The admin users endpoint is the only read of auth.users available over REST.
  # per_page is capped at 1000 by GoTrue; the window below keeps us far under that,
  # and pagination is asserted rather than assumed (see the total check further down).
  response="$(curl -sS -f -X GET \
    "${PROD_URL}/auth/v1/admin/users?per_page=1000" \
    -H "apikey: ${SERVICE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" 2>&1)" || {
    echo "check-stranded-signups: prod auth API call failed:" >&2
    echo "$response" >&2
    cannot_run auth_api_call_failed
  }
fi

# A signup is "stranded" when all of:
#   - email_confirmed_at is null   (never got in)
#   - created_at older than GRACE_HOURS (not simply mid-signup right now)
#   - created_at within WINDOW_DAYS (recent enough to still act on; without this
#     the count would include every historical abandonment and alert forever)
# Deliberately NOT filtered on last_sign_in_at: a person who never confirmed has
# never signed in, so that field adds nothing and would mask an odd row worth seeing.
#
# `ts` strips fractional seconds before parsing. GoTrue emits
# "2026-09-07T09:05:41.612817Z", which jq's fromdateiso8601 rejects outright — it
# accepts only whole seconds. The first version of this filter was validated against
# a hand-written fixture using whole-second timestamps, passed, and then failed on
# the first real row. Any fixture for this script must carry fractional seconds.
filter='
  def ts: sub("\\.[0-9]+";"") | fromdateiso8601;
  [ .users[]
    | select(.email_confirmed_at == null)
    | select((.created_at | ts) < (now - ($grace | tonumber) * 3600))
    | select((.created_at | ts) > (now - ($window | tonumber) * 86400))
  ]'

stranded="$(printf '%s' "$response" | jq --arg grace "$GRACE_HOURS" --arg window "$WINDOW_DAYS" "$filter")" || {
  echo "check-stranded-signups: could not parse the auth API response." >&2
  cannot_run unparseable_api_response
}
count="$(printf '%s' "$stranded" | jq 'length')"

# Guard against the silent-truncation failure mode: if GoTrue returned a full page,
# the window may extend past what we actually looked at, and a "0 stranded" answer
# would be a false negative rather than a result. Only the GoTrue path pages — the SQL
# path reads every row, so applying the cap there would fail a healthy run at 1000 users.
returned="$(printf '%s' "$response" | jq '.users | length')"
if [ "$CREDENTIAL" = "service-role-FALLBACK" ] && [ "$returned" -ge 1000 ]; then
  echo "check-stranded-signups: the API returned a full page (${returned} users); this check does not paginate, so the window is not fully covered." >&2
  cannot_run page_limit_reached_window_incomplete
fi

if [ "$WRITE_EMAILS" -eq 1 ]; then
  out_dir="$REPO_ROOT/.private/reports"
  mkdir -p "$out_dir"
  out_file="$out_dir/stranded-signups-$(date +%Y-%m-%d).json"
  printf '%s\n' "$stranded" | jq '[.[] | {id, email, created_at}]' > "$out_file"
  echo "Addresses written to ${out_file} (gitignored)." >&2
fi

# stdout is the publishable half: a count, never an address.
echo "stranded_signups=${count} (grace=${GRACE_HOURS}h window=${WINDOW_DAYS}d of ${returned} users scanned, credential=${CREDENTIAL})"

if [ "$count" -gt 0 ]; then
  echo "check-stranded-signups: ${count} person(s) started signup and never got in." >&2
  echo "Re-run with --emails to write the addresses to .private/reports/ and follow up." >&2
  exit 1
fi

exit 0
