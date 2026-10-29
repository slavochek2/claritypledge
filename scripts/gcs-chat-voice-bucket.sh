#!/usr/bin/env bash
# scripts/gcs-chat-voice-bucket.sh — P1576: the private GCS bucket behind chat voice notes, as code.
#
#   ./scripts/gcs-chat-voice-bucket.sh            apply: create the bucket if absent, then (re)apply every setting
#   ./scripts/gcs-chat-voice-bucket.sh --check    read-only: compare the LIVE bucket with the settings below;
#                                                 exit 1 on any drift, 3 when the bucket cannot be read
#
# Settings (all of them matter for the product's promises, so --check fails on any difference):
#   * private: uniform bucket-level access ON, public access prevention ENFORCED. Playback is only ever a
#     short-lived signed URL minted after a chat-membership check (supabase/functions/chat-voice).
#   * lifecycle: delete objects 31 days after creation. The app expires audio at 30 days and queues the
#     object for deletion; this rule is the backstop for what the app never queued: uploads that were never
#     committed, and objects left by a failed commit (the function never deletes on failure).
#   * no versioning and no soft delete: either would keep "deleted" private audio for days. Deleting a voice
#     note, erasing an account and the 30-day expiry must really remove the bytes.
#   * CORS: the browser PUTs the clip straight to storage with signed headers, so the preflight must echo
#     each of them BY NAME. A glob such as x-goog-* is accepted by the tooling and silently ignored by the
#     CORS handler (P807, scripts/canary-gcs-cors-preflight.sh), so no glob is ever written here.
#   * IAM: the service account that signs upload and playback URLs (supabase/functions/chat-voice) holds
#     roles/storage.objectUser on THIS bucket, unconditionally. A signed URL carries only the signer's own
#     rights, so without the binding every signed PUT returns 403 (a real send failed this way on TEST).
#
# Environment:
#   GCS_CHAT_VOICE_BUCKET   bucket name (default claritypledge-chat-voice; the same variable the edge function reads)
#   GCS_CHAT_VOICE_SIGNER   signing service account email (default cp-chat-voice-signer@gen-lang-client-0869694595.iam.gserviceaccount.com,
#                           the voice bucket's own account behind GCS_CHAT_VOICE_SERVICE_ACCOUNT_KEY)
#   GCS_LOCATION            REQUIRED when the bucket has to be created (e.g. EU or europe-west1); never guessed
#   GCP_PROJECT             optional project for every gcloud call (default: gcloud's configured project)
#   GCLOUD_BIN              the gcloud binary (default gcloud); the canary points it at a fake
#
# Run it by hand with a human watching: it changes cloud configuration. Nothing in CI or a hook calls it.
# Output contract (shell-safety.md): status lines use ':' separators; no redirect characters in output.
set -euo pipefail

BUCKET="${GCS_CHAT_VOICE_BUCKET:-claritypledge-chat-voice}"
GCLOUD="${GCLOUD_BIN:-gcloud}"
LIFECYCLE_AGE_DAYS=31
SIGNER="${GCS_CHAT_VOICE_SIGNER:-cp-chat-voice-signer@gen-lang-client-0869694595.iam.gserviceaccount.com}"
SIGNER_ROLE="roles/storage.objectUser"

# Origins that may PUT/GET: production and the local dev ports (same list as scripts/gcs-cors.json).
ORIGINS=(
  "https://claritypledge.com"
  "http://localhost:5001" "http://localhost:5100" "http://localhost:5200" "http://localhost:5300"
  "http://localhost:5400" "http://localhost:5500" "http://localhost:5600" "http://localhost:5700"
  # Worktree slots w8+ (scripts/lib/worktree-port.mjs; w10 is 6050, Chromium refuses 6000).
  "http://localhost:5800" "http://localhost:5900" "http://localhost:6050" "http://localhost:6100"
  "http://localhost:6200" "http://localhost:6300" "http://localhost:6400" "http://localhost:6500"
  "http://localhost:6600" "http://localhost:6700" "http://localhost:6800" "http://localhost:6900"
  "http://localhost:7000"
)
# Request headers the signed upload and playback use. Explicit names only.
RESPONSE_HEADERS=("Content-Type" "x-goog-content-length-range" "x-goog-if-generation-match" "Range")

MODE=apply
case "${1:-}" in
  "") ;;
  --check) MODE=check ;;
  *) echo "usage: $0 [--check]" >&2; exit 2 ;;
esac

gc() {
  if [ -n "${GCP_PROJECT:-}" ]; then "$GCLOUD" "$@" --project="$GCP_PROJECT"; else "$GCLOUD" "$@"; fi
}

json_array() { # json_array item item ... -> ["item","item"]
  local out="" item
  for item in "$@"; do out="${out:+$out,}\"$item\""; done
  printf '[%s]' "$out"
}

write_config() { # write_config DIR
  local dir="$1"
  printf '{"rule":[{"action":{"type":"Delete"},"condition":{"age":%s}}]}\n' "$LIFECYCLE_AGE_DAYS" >"$dir/lifecycle.json"
  printf '[{"origin":%s,"method":["PUT","GET","HEAD"],"responseHeader":%s,"maxAgeSeconds":3600}]\n' \
    "$(json_array "${ORIGINS[@]}")" "$(json_array "${RESPONSE_HEADERS[@]}")" >"$dir/cors.json"
}

# --check: read the live bucket and report every difference. Exit 0 clean, 1 drift, 3 unreadable.
check_live() {
  local live
  if ! live="$(gc storage buckets describe "gs://${BUCKET}" --format=json 2>/dev/null)"; then
    echo "UNREADABLE: gs://${BUCKET} does not exist or cannot be read"
    return 3
  fi
  local iam
  if ! iam="$(gc storage buckets get-iam-policy "gs://${BUCKET}" --format=json 2>/dev/null)"; then
    echo "UNREADABLE: the IAM policy of gs://${BUCKET} cannot be read"
    return 3
  fi
  LIVE_IAM="$iam" EXPECT_SIGNER="$SIGNER" EXPECT_ROLE="$SIGNER_ROLE" \
  EXPECT_BUCKET="$BUCKET" EXPECT_AGE="$LIFECYCLE_AGE_DAYS" EXPECT_LOCATION="${GCS_LOCATION:-}" \
    EXPECT_ORIGINS="${ORIGINS[*]}" EXPECT_HEADERS="${RESPONSE_HEADERS[*]}" \
    python3 -I -c '
import json, os, sys
j = json.load(sys.stdin)
drift = []

def first(*vals):
    for v in vals:
        if v is not None:
            return v
    return None

iam = j.get("iamConfiguration") or {}
ubla = first(j.get("uniform_bucket_level_access"), (iam.get("uniformBucketLevelAccess") or {}).get("enabled"))
pap = first(j.get("public_access_prevention"), iam.get("publicAccessPrevention"))
if ubla is not True:
    drift.append("uniform bucket-level access is not enabled")
if str(pap).lower() != "enforced":
    drift.append("public access prevention is not enforced (found %s)" % pap)

life = first(j.get("lifecycle_config"), j.get("lifecycle")) or {}
rules = life.get("rule") or []
want_age = int(os.environ["EXPECT_AGE"])
if len(rules) != 1:
    drift.append("lifecycle must be exactly one rule, found %d" % len(rules))
else:
    r = rules[0]
    # Exactly Delete at the age, and NOTHING else: a rule that also carries matchesPrefix, matchesStorageClass,
    # isLive and the like still reads as "Delete at 31" but protects only the objects it matches. Unset
    # fields (null) are not extras.
    action = {k: v for k, v in (r.get("action") or {}).items() if v is not None}
    cond = {k: v for k, v in (r.get("condition") or {}).items() if v is not None}
    for k in sorted(set(action) - {"type"}):
        drift.append("lifecycle action carries extra field %s" % k)
    if action.get("type") != "Delete":
        drift.append("lifecycle action is not Delete: %s" % json.dumps(action, sort_keys=True))
    for k in sorted(set(cond) - {"age"}):
        drift.append("lifecycle condition carries extra restriction %s, so it protects only some objects" % k)
    if cond.get("age") != want_age:
        drift.append("lifecycle rule is not Delete at age %d: %s" % (want_age, json.dumps(r, sort_keys=True)))

cors = first(j.get("cors_config"), j.get("cors")) or []
if len(cors) != 1:
    drift.append("CORS must be exactly one entry, found %d" % len(cors))
else:
    c = cors[0]
    have_origins = set(c.get("origin") or [])
    want_origins = set(os.environ["EXPECT_ORIGINS"].split())
    if have_origins != want_origins:
        drift.append("CORS origins differ: missing %s, extra %s" % (sorted(want_origins - have_origins), sorted(have_origins - want_origins)))
    methods = set(c.get("method") or [])
    for m in ("PUT", "GET", "HEAD"):
        if m not in methods:
            drift.append("CORS method %s is missing" % m)
    headers = [h for h in (c.get("responseHeader") or [])]
    lower = [h.lower() for h in headers]
    for h in os.environ["EXPECT_HEADERS"].split():
        if h.lower() not in lower:
            drift.append("CORS responseHeader %s is not listed by name" % h)
    for h in headers:
        if "*" in h:
            drift.append("CORS responseHeader %s is a glob; the CORS handler ignores globs (P807)" % h)

versioning = first(j.get("versioning_enabled"), (j.get("versioning") or {}).get("enabled"))
if versioning:
    drift.append("object versioning is on: deleted audio would be kept")
soft = first(j.get("soft_delete_policy"), j.get("softDeletePolicy")) or {}
secs = first(soft.get("retentionDurationSeconds"), soft.get("retention_duration_seconds"))
if secs not in (None, 0, "0"):
    drift.append("soft delete keeps deleted objects for %s seconds" % secs)

want_loc = os.environ.get("EXPECT_LOCATION", "")
if want_loc and str(j.get("location", "")).lower() != want_loc.lower():
    drift.append("location is %s, expected %s" % (j.get("location"), want_loc))

# The signer must hold the role unconditionally: a binding behind an IAM condition may not cover every object.
policy = json.loads(os.environ["LIVE_IAM"] or "{}")
member = "serviceAccount:" + os.environ["EXPECT_SIGNER"]
held = [b for b in policy.get("bindings") or [] if b.get("role") == os.environ["EXPECT_ROLE"] and member in (b.get("members") or [])]
if not held:
    drift.append("signer %s does not hold %s on the bucket" % (os.environ["EXPECT_SIGNER"], os.environ["EXPECT_ROLE"]))
elif all(b.get("condition") for b in held):
    drift.append("signer holds %s only under an IAM condition" % os.environ["EXPECT_ROLE"])

if drift:
    for d in drift:
        print("DRIFT: " + d)
    sys.exit(1)
print("OK: gs://%s matches the chat voice settings" % os.environ["EXPECT_BUCKET"])
' <<<"$live"
}

if [ "$MODE" = check ]; then
  check_live
  exit $?
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/chat-voice-bucket.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
write_config "$WORK"

if gc storage buckets describe "gs://${BUCKET}" --format=json >/dev/null 2>&1; then
  echo "EXISTS: gs://${BUCKET}"
else
  if [ -z "${GCS_LOCATION:-}" ]; then
    echo "REFUSED: gs://${BUCKET} does not exist and GCS_LOCATION is not set; set it (for example EU) and run again"
    exit 2
  fi
  gc storage buckets create "gs://${BUCKET}" --location="$GCS_LOCATION" \
    --uniform-bucket-level-access --public-access-prevention
  echo "CREATED: gs://${BUCKET} in ${GCS_LOCATION}"
fi

# Every setting is re-applied each run, so a hand edit in the console is undone and a re-run changes nothing.
gc storage buckets update "gs://${BUCKET}" \
  --uniform-bucket-level-access --public-access-prevention \
  --no-versioning --clear-soft-delete \
  --lifecycle-file="$WORK/lifecycle.json" --cors-file="$WORK/cors.json"
# Idempotent: adding a binding that already exists changes nothing.
gc storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${SIGNER}" --role="$SIGNER_ROLE" --format=none
echo "APPLIED: private, lifecycle ${LIFECYCLE_AGE_DAYS} days, CORS, no versioning, no soft delete, signer ${SIGNER} holds ${SIGNER_ROLE}"

check_live
