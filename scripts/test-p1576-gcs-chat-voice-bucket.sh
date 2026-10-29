#!/usr/bin/env bash
# scripts/test-p1576-gcs-chat-voice-bucket.sh — hermetic canary for scripts/gcs-chat-voice-bucket.sh.
#
# A fake `gcloud` (GCLOUD_BIN) stands in for the cloud: it answers `buckets describe` from a fixture and
# records every other call. Nothing here can reach Google. Each drift the checker is meant to catch is
# built by mutating a copy of the known-good fixture, and a mutant that still exits 0 FAILS the canary
# (a checker that passes everything would otherwise look identical to a working one).
#
#   A. --check: the good fixture passes; each of 16 mutants and 3 IAM fixtures (no binding, weaker role,
#      condition-only) exits 1 and names its drift; an unreadable
#      bucket exits 3.
#   B. apply on an existing bucket: no `create`, one `update` with every flag, lifecycle age 31, CORS lists
#      every header by name with no glob, and a second run produces the same calls (idempotent).
#   C. apply on a missing bucket: refuses without GCS_LOCATION (and creates nothing); with it, creates
#      private with uniform access and enforced public-access prevention.
#   D. the legacy camelCase JSON shape of the describe output is read the same way.
set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/gcs-chat-voice-bucket.sh"
PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  PASS  $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }

T="$(mktemp -d "${TMPDIR:-/tmp}/test-p1576-bucket.XXXXXX")"
trap 'rm -rf "$T"' EXIT

cat >"$T/gcloud" <<'FAKE'
#!/usr/bin/env bash
echo "$*" >>"$FAKE_LOG"
case "$*" in
  "storage buckets describe"*) [ -f "$FAKE_STATE/exists" ] && { cat "$FAKE_JSON"; exit 0; } || exit 1 ;;
  "storage buckets get-iam-policy"*) [ -f "$FAKE_STATE/exists" ] && { cat "$FAKE_IAM"; exit 0; } || exit 1 ;;
  "storage buckets add-iam-policy-binding"*) exit 0 ;;
  "storage buckets create"*) touch "$FAKE_STATE/exists"; exit 0 ;;
  "storage buckets update"*)
    for a in "$@"; do
      case "$a" in
        --lifecycle-file=*) cp "${a#*=}" "$FAKE_STATE/lifecycle.json" ;;
        --cors-file=*) cp "${a#*=}" "$FAKE_STATE/cors.json" ;;
      esac
    done; exit 0 ;;
esac
exit 9
FAKE
chmod +x "$T/gcloud"

python3 -I - "$T" "$SCRIPT" <<'PY'
import json, re, sys
t = sys.argv[1]
# Origins are DERIVED from the script's ORIGINS block, never retyped here (a hand copy drifted once already).
block = re.search(r"^ORIGINS=\((.*?)^\)", open(sys.argv[2]).read(), re.S | re.M).group(1)
origins = re.findall(r'"(https?://[^"]+)"', block)
for known in ("https://claritypledge.com", "http://localhost:5001", "http://localhost:6400"):
    assert known in origins, "origin parser lost %s: %s" % (known, origins)
signer = "serviceAccount:cp-chat-voice-signer@gen-lang-client-0869694595.iam.gserviceaccount.com"
iam = {"bindings": [{"role": "roles/storage.objectUser", "members": [signer]},
                    {"role": "roles/storage.legacyBucketOwner", "members": ["projectOwner:x"]}]}
json.dump(iam, open("%s/iam-good.json" % t, "w"))
json.dump({"bindings": [iam["bindings"][1]]}, open("%s/iam-missing.json" % t, "w"))
json.dump({"bindings": [{"role": "roles/storage.objectViewer", "members": [signer]}]}, open("%s/iam-wrongrole.json" % t, "w"))
json.dump({"bindings": [dict(iam["bindings"][0], condition={"title": "c", "expression": "resource.name.startsWith('x')"})]}, open("%s/iam-conditional.json" % t, "w"))
good = {
    "name": "claritypledge-chat-voice", "location": "EU",
    "uniform_bucket_level_access": True, "public_access_prevention": "enforced",
    "lifecycle_config": {"rule": [{"action": {"type": "Delete"}, "condition": {"age": 31}}]},
    "cors_config": [{"origin": origins, "method": ["PUT", "GET", "HEAD"],
                     "responseHeader": ["Content-Type", "x-goog-content-length-range", "x-goog-if-generation-match", "Range"],
                     "maxAgeSeconds": 3600}],
    "versioning_enabled": False,
}
def dump(name, obj): json.dump(obj, open("%s/%s.json" % (t, name), "w"))
dump("good", good)

def mutant(name, fn):
    import copy
    m = copy.deepcopy(good); fn(m); dump("mut-" + name, m)

mutant("ubla", lambda m: m.update(uniform_bucket_level_access=False))
mutant("pap", lambda m: m.update(public_access_prevention="inherited"))
mutant("nolife", lambda m: m.update(lifecycle_config={}))
mutant("age30", lambda m: m["lifecycle_config"]["rule"][0]["condition"].update(age=30))
mutant("extrarule", lambda m: m["lifecycle_config"]["rule"].append({"action": {"type": "SetStorageClass"}, "condition": {"age": 1}}))
mutant("prefixonly", lambda m: m["lifecycle_config"]["rule"][0]["condition"].update(matchesPrefix=["never-a-voice-path/"]))
mutant("classonly", lambda m: m["lifecycle_config"]["rule"][0]["condition"].update(matchesStorageClass=["COLDLINE"]))
mutant("notlive", lambda m: m["lifecycle_config"]["rule"][0]["condition"].update(isLive=False))
mutant("actionclass", lambda m: m["lifecycle_config"]["rule"][0]["action"].update(storageClass="NEARLINE"))
mutant("nocors", lambda m: m.update(cors_config=[]))
mutant("noprecond", lambda m: m["cors_config"][0].update(responseHeader=["Content-Type", "x-goog-content-length-range", "Range"]))
mutant("glob", lambda m: m["cors_config"][0].update(responseHeader=["Content-Type", "x-goog-*", "Range"]))
mutant("origin", lambda m: m["cors_config"][0].update(origin=origins[1:]))
mutant("wildcardorigin", lambda m: m["cors_config"][0].update(origin=origins + ["*"]))
mutant("versioning", lambda m: m.update(versioning_enabled=True))
mutant("softdelete", lambda m: m.update(soft_delete_policy={"retentionDurationSeconds": "604800"}))

legacy = {
    "name": "claritypledge-chat-voice", "location": "EU",
    "iamConfiguration": {"uniformBucketLevelAccess": {"enabled": True}, "publicAccessPrevention": "enforced"},
    "lifecycle": good["lifecycle_config"], "cors": good["cors_config"], "versioning": {"enabled": False},
    "softDeletePolicy": {"retentionDurationSeconds": "0"},
}
dump("legacy", legacy)
import copy
nulls = copy.deepcopy(good)
nulls["lifecycle_config"]["rule"][0]["condition"].update(matchesPrefix=None, isLive=None)
nulls["lifecycle_config"]["rule"][0]["action"].update(storageClass=None)
dump("nullextras", nulls)
PY

run() { # run <fixture> <args...>; sets RC and OUT. Fresh state each call.
  local fixture="$1"; shift
  rm -rf "$T/state"; mkdir -p "$T/state"; : >"$T/calls.log"
  [ "${EXISTS:-1}" = 1 ] && touch "$T/state/exists"
  OUT="$(GCLOUD_BIN="$T/gcloud" FAKE_LOG="$T/calls.log" FAKE_STATE="$T/state" FAKE_JSON="$T/$fixture.json" FAKE_IAM="$T/${IAM:-iam-good}.json" \
        GCS_CHAT_VOICE_BUCKET=claritypledge-chat-voice bash "$SCRIPT" "$@" 2>&1)"; RC=$?
}

# ── A. --check ───────────────────────────────────────────────────────────────
run good --check
[ "$RC" = 0 ] && echo "$OUT" | grep -q '^OK:' && ok "A: the good fixture passes --check" || bad "A: good fixture should pass (rc=$RC): $OUT"

check_mutant() { # check_mutant <name> <expected text>
  run "mut-$1" --check
  if [ "$RC" = 1 ] && echo "$OUT" | grep -qi "$2"; then ok "A: mutant $1 is reported ($2)"; else bad "A: mutant $1 should exit 1 naming '$2' (rc=$RC): $OUT"; fi
}
check_mutant ubla "uniform bucket-level access"
check_mutant pap "public access prevention"
check_mutant nolife "exactly one rule"
check_mutant age30 "Delete at age 31"
check_mutant extrarule "exactly one rule"
check_mutant prefixonly "matchesPrefix"
check_mutant classonly "matchesStorageClass"
check_mutant notlive "isLive"
check_mutant actionclass "storageClass"
check_mutant nocors "exactly one entry"
check_mutant noprecond "x-goog-if-generation-match"
check_mutant glob "glob"
check_mutant origin "origins differ"
check_mutant wildcardorigin "origins differ"
check_mutant versioning "versioning"
check_mutant softdelete "soft delete"

IAM=iam-missing run good --check
[ "$RC" = 1 ] && echo "$OUT" | grep -q "does not hold roles/storage.objectUser" && ok "A: a missing signer binding is reported" || bad "A: missing signer binding should exit 1 (rc=$RC): $OUT"
IAM=iam-wrongrole run good --check
[ "$RC" = 1 ] && echo "$OUT" | grep -q "does not hold" && ok "A: the signer on a weaker role is reported" || bad "A: wrong role should exit 1 (rc=$RC): $OUT"
IAM=iam-conditional run good --check
[ "$RC" = 1 ] && echo "$OUT" | grep -q "IAM condition" && ok "A: a conditional-only binding is reported" || bad "A: conditional binding should exit 1 (rc=$RC): $OUT"
GCS_CHAT_VOICE_SIGNER=other@x.iam.gserviceaccount.com run good --check
[ "$RC" = 1 ] && echo "$OUT" | grep -q "other@x" && ok "A: GCS_CHAT_VOICE_SIGNER overrides the checked account" || bad "A: signer override (rc=$RC): $OUT"

EXISTS=0 run good --check
[ "$RC" = 3 ] && ok "A: an unreadable bucket exits 3" || bad "A: unreadable bucket should exit 3 (rc=$RC): $OUT"

run nullextras --check
[ "$RC" = 0 ] && ok "A: unset (null) condition fields are not drift" || bad "A: null extras should pass (rc=$RC): $OUT"

# ── D. the legacy JSON shape ─────────────────────────────────────────────────
run legacy --check
[ "$RC" = 0 ] && ok "D: the camelCase describe shape passes --check" || bad "D: legacy shape should pass (rc=$RC): $OUT"

# ── B. apply on an existing bucket ───────────────────────────────────────────
run good
if [ "$RC" = 0 ] && ! grep -q 'buckets create' "$T/calls.log" && [ "$(grep -c 'buckets update' "$T/calls.log")" = 1 ]; then
  ok "B: an existing bucket is updated once and never re-created"
else bad "B: apply on an existing bucket (rc=$RC): $(cat "$T/calls.log")"; fi
grep 'add-iam-policy-binding' "$T/calls.log" | grep -q -- '--member=serviceAccount:cp-chat-voice-signer@gen-lang-client-0869694595.iam.gserviceaccount.com --role=roles/storage.objectUser' \
  && ok "B: apply grants the signer roles/storage.objectUser on the bucket" || bad "B: apply did not grant the signer: $(cat "$T/calls.log")"
UPD="$(grep 'buckets update' "$T/calls.log")"
for flag in --uniform-bucket-level-access --public-access-prevention --no-versioning --clear-soft-delete --lifecycle-file= --cors-file=; do
  echo "$UPD" | grep -q -- "$flag" && ok "B: update passes $flag" || bad "B: update is missing $flag"
done
python3 -I - "$T/state/lifecycle.json" "$T/state/cors.json" <<'PY' && ok "B: applied lifecycle is Delete at 31 days and CORS lists every header by name with no glob" || bad "B: applied lifecycle/CORS content is wrong"
import json, sys
life = json.load(open(sys.argv[1])); cors = json.load(open(sys.argv[2]))
assert life == {"rule": [{"action": {"type": "Delete"}, "condition": {"age": 31}}]}, life
assert len(cors) == 1
c = cors[0]
assert set(c["method"]) == {"PUT", "GET", "HEAD"}
assert "https://claritypledge.com" in c["origin"] and "*" not in c["origin"]
need = {"content-type", "x-goog-content-length-range", "x-goog-if-generation-match", "range"}
assert need <= {h.lower() for h in c["responseHeader"]}, c["responseHeader"]
assert not any("*" in h for h in c["responseHeader"])
PY
cp "$T/calls.log" "$T/first.log"
run good
# calls carry a per-run temp dir in the file flags; compare with that removed
norm() { sed -E 's#--(lifecycle|cors)-file=[^ ]+#--\1-file=F#g' "$1"; }
[ "$(norm "$T/first.log")" = "$(norm "$T/calls.log")" ] && ok "B: a second run makes exactly the same calls (idempotent)" || bad "B: second run differs"

# ── C. apply on a missing bucket ─────────────────────────────────────────────
EXISTS=0 run good
if [ "$RC" = 2 ] && echo "$OUT" | grep -q '^REFUSED:' && ! grep -q 'buckets create' "$T/calls.log"; then
  ok "C: no GCS_LOCATION means refused, nothing created"
else bad "C: should refuse without a location (rc=$RC): $OUT"; fi

EXISTS=0 GCS_LOCATION=EU run good
if [ "$RC" = 0 ] && grep 'buckets create' "$T/calls.log" | grep -q -- '--uniform-bucket-level-access' \
   && grep 'buckets create' "$T/calls.log" | grep -q -- '--public-access-prevention' \
   && grep 'buckets create' "$T/calls.log" | grep -q -- '--location=EU'; then
  ok "C: with a location the bucket is created private (uniform access, public access prevention)"
else bad "C: create call (rc=$RC): $(cat "$T/calls.log") $OUT"; fi

# ── the script never prints redirect characters (shell-safety.md output contract) ──
run good
echo "$OUT" | grep -q '[<>|]' && bad "output contains a redirect character: $OUT" || ok "output has no redirect characters"

echo
echo "p1576 chat-voice bucket canary: $PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
