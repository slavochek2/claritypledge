#!/usr/bin/env bash
#
# auth-canary.sh — is Google sign-in actually reachable?
#
# Walks the same redirect chain a real user walks when they click "Continue with
# Google": Supabase /auth/v1/authorize → accounts.google.com. If Google bounces
# that request to its error page, sign-in is dead for every user and this exits
# non-zero.
#
# Why this exists (P1031): on 2026-08-06 the OAuth client our Supabase projects
# point at was deleted from the GCP project that hosted it. Sign-in was fully
# broken on prod AND test for 3 days 14 hours and nothing noticed — the failure
# happens on Google's origin, so there is no Sentry error, no failed DB write,
# no 5xx anywhere in our stack. This one request is the whole detector.
#
# Usage:
#   ./scripts/auth-canary.sh                 # check prod + test
#   ./scripts/auth-canary.sh --url <URL>     # check one authorize URL (Supabase or Google)
#
# Exit codes: 0 = every checked environment reaches a consent screen
#             1 = at least one is broken
#             2 = usage / config error (no environment could be resolved)

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REDIRECT_TO="https://claritypledge.com/auth/callback"
TIMEOUT=15
FAILED=0
CHECKED=0

# Pull VITE_SUPABASE_URL out of an env file without sourcing it (these files hold
# secrets we have no business loading into this shell).
supabase_url_from() {
  local env_file="$REPO_ROOT/$1"
  [[ -f "$env_file" ]] || return 1
  grep -m1 '^VITE_SUPABASE_URL=' "$env_file" | cut -d= -f2- | tr -d '"'"'"' \r'
}

# Google encodes the reason as a base64 protobuf in ?authError=. We only want the
# human-readable strings out of it, so strip to printable and collapse runs.
decode_auth_error() {
  local url="$1" blob
  blob="$(sed -n 's/.*[?&]authError=\([^&]*\).*/\1/p' <<<"$url")"
  [[ -n "$blob" ]] || return 0
  # URL-safe base64 → standard, then pad to a multiple of 4.
  blob="${blob//-/+}"; blob="${blob//_//}"
  while (( ${#blob} % 4 )); do blob+="="; done
  # LC_ALL=C: the decoded protobuf carries raw bytes, and a UTF-8 locale makes
  # BSD tr abort on them with "Illegal byte sequence" instead of filtering.
  printf '%s' "$blob" | base64 -d 2>/dev/null \
    | LC_ALL=C tr -c '[:print:]' '\n' | grep -v '^$' | paste -sd' ' -
}

# One environment. Accepts either a Supabase authorize URL (one extra hop) or a
# Google authorize URL directly.
check() {
  local label="$1" url="$2" google_url hop reason
  CHECKED=$((CHECKED + 1))

  if [[ "$url" == *"accounts.google.com"* ]]; then
    google_url="$url"
  else
    google_url="$(curl -sS -o /dev/null -w '%{redirect_url}' --max-time "$TIMEOUT" "$url" 2>/dev/null)"
    if [[ -z "$google_url" ]]; then
      echo "❌ ${label}: /auth/v1/authorize returned no redirect — provider misconfigured or endpoint down"
      FAILED=1; return
    fi
    if [[ "$google_url" != *"accounts.google.com"* ]]; then
      echo "❌ ${label}: authorize redirected somewhere unexpected → ${google_url%%\?*}"
      FAILED=1; return
    fi
  fi

  hop="$(curl -sS -o /dev/null -w '%{redirect_url}' --max-time "$TIMEOUT" "$google_url" 2>/dev/null)"

  if [[ "$hop" == *"/signin/oauth/error"* ]]; then
    reason="$(decode_auth_error "$hop")"
    echo "❌ ${label}: Google rejected the OAuth client — ${reason:-no reason given}"
    echo "   client_id=$(sed -n 's/.*[?&]client_id=\([^&]*\).*/\1/p' <<<"$google_url")"
    FAILED=1; return
  fi

  # No error redirect: Google is serving the sign-in/consent flow. Either it
  # answered 200 directly, or it bounced us within its own sign-in flow — both
  # mean the client is alive.
  echo "✅ ${label}: reaches Google consent flow"
}

if [[ "${1:-}" == "--url" ]]; then
  [[ -n "${2:-}" ]] || { echo "usage: $0 --url <authorize-url>" >&2; exit 2; }
  check "custom" "$2"
else
  for env_pair in "prod:.env.prod" "test:.env.test.local"; do
    label="${env_pair%%:*}"
    base="$(supabase_url_from "${env_pair#*:}")"
    if [[ -z "$base" ]]; then
      echo "⚠️  ${label}: no VITE_SUPABASE_URL found in ${env_pair#*:} — skipped"
      continue
    fi
    check "$label" "${base}/auth/v1/authorize?provider=google&redirect_to=$(printf '%s' "$REDIRECT_TO" | sed 's|:|%3A|g; s|/|%2F|g')"
  done

  if (( CHECKED == 0 )); then
    echo "❌ no environments could be resolved — check .env.prod / .env.test.local" >&2
    exit 2
  fi
fi

exit "$FAILED"
