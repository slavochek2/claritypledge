#!/usr/bin/env bash
# scripts/selfhosted/install-health-reporter.sh — install the VM's disk/WAL reporter (P1584)
#
#   install-health-reporter.sh            enable guest attributes, copy vm/ files, start the timer, read back
#   install-health-reporter.sh --check    read back only (no change)
#
# Run from the Mac with a gcloud login that can SSH over IAP. Idempotent: re-running reinstalls the
# same files. Proof of success is the read-back: a fresh cp-health/ts written by the VM itself.
# Output contract (shell-safety.md): no redirect or pipe tokens in status lines.
set -euo pipefail
GCP_PROJECT="gen-lang-client-0869694595"; VM="cp-test-supabase"; ZONE="asia-southeast1-a"
HERE="$(cd "$(dirname "$0")" && pwd)"
command -v gcloud >/dev/null 2>&1 || PATH="/opt/homebrew/share/google-cloud-sdk/bin:$PATH"
G=(--project="$GCP_PROJECT" --zone="$ZONE")

if [ "${1:-}" != "--check" ]; then
  # Guest attributes are off by default; this metadata key turns them on without a restart.
  gcloud compute instances add-metadata "$VM" "${G[@]}" --metadata=enable-guest-attributes=TRUE
  gcloud compute scp "${G[@]}" --tunnel-through-iap --quiet \
    "$HERE/vm/cp-health-report.sh" "$HERE/vm/cp-health-report.service" "$HERE/vm/cp-health-report.timer" "$VM":/tmp/
  gcloud compute ssh "$VM" "${G[@]}" --tunnel-through-iap --quiet --command '
    set -e
    sudo install -m 755 -o root -g root /tmp/cp-health-report.sh /usr/local/sbin/cp-health-report.sh
    sudo install -m 644 -o root -g root /tmp/cp-health-report.service /tmp/cp-health-report.timer /etc/systemd/system/
    rm -f /tmp/cp-health-report.sh /tmp/cp-health-report.service /tmp/cp-health-report.timer
    sudo systemctl daemon-reload
    sudo systemctl enable --now cp-health-report.timer
    sudo systemctl start cp-health-report.service'
fi

gcloud compute instances get-guest-attributes "$VM" "${G[@]}" --query-path=cp-health/ --format='csv[no-heading](key,value)'
