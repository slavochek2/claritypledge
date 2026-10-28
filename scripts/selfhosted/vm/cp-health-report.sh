#!/usr/bin/env bash
# Runs ON the self-hosted TEST VM, as root, every 10 min (cp-health-report.timer). P1584.
#
# Publishes disk and WAL as guest attributes (cp-health/disk, cp-health/wal, cp-health/ts) through the
# metadata server, so the scheduled workflow can read them with compute.instances.getGuestAttributes
# alone, an account that can neither SSH nor change anything. A reading that fails is not written:
# the reader sees the old ts age past its limit and reports "unknown", never a stale "ok".
# Installed by scripts/selfhosted/install-health-reporter.sh; never edited on the VM by hand.
set -uo pipefail
MD="http://metadata.google.internal/computeMetadata/v1/instance/guest-attributes/cp-health"
put() { curl -sf -m 5 -X PUT -H 'Metadata-Flavor: Google' --data "$2" "$MD/$1" >/dev/null; }

disk="$(df --output=pcent / | tail -1 | tr -dc 0-9)"
wal="$(docker exec supabase-db psql -U postgres -At -c 'select (coalesce(sum(size),0)/1048576)::bigint from pg_ls_waldir()' 2>/dev/null | tr -dc 0-9)"
case "$disk" in ''|*[!0-9]*) echo "no disk reading" >&2; exit 1 ;; esac
case "$wal" in ''|*[!0-9]*) echo "no WAL reading" >&2; exit 1 ;; esac
# ts last, so a reader never pairs a fresh ts with a value from the previous run.
put disk "$disk" && put wal "$wal" && put ts "$(date +%s)" || { echo "metadata server refused the write" >&2; exit 1; }
