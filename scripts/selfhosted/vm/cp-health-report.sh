#!/usr/bin/env bash
# Runs ON the self-hosted TEST VM, as root, every 10 min (cp-health-report.timer). P1584.
#
# Publishes disk, WAL and service health as guest attributes (cp-health/disk, wal, down, ts) through
# the metadata server, so the scheduled workflow can read them with compute.instances.getGuestAttributes
# alone, an account that can neither SSH nor change anything. A reading that fails is not written:
# the reader sees ts age past its limit and reports "unknown", never a stale "ok".
# Installed by scripts/selfhosted/install-health-reporter.sh; never edited on the VM by hand.
set -uo pipefail
MD_IP=169.254.169.254
MD="http://metadata.google.internal/computeMetadata/v1/instance/guest-attributes/cp-health"
put() { curl -sf -m 5 -X PUT -H 'Metadata-Flavor: Google' --data "$2" "$MD/$1" >/dev/null; }

# 0. The channel's integrity. Guest attributes need no IAM to write: anything that reaches the
# metadata server can write them, and Docker forwards container traffic there by default. Keep every
# bridged container off it (it also keeps them from reading the VM's account token). Re-asserted on
# every run, because a Docker restart can rebuild its chains. Host-network containers (Caddy) and the
# host itself are not forwarded, so they are unaffected. TCP only, and never port 53: on GCE the same
# address is the DNS resolver Docker forwards container lookups to, so blocking it all breaks DNS.
RULE=(-d "$MD_IP" -p tcp ! --dport 53 -j DROP)
iptables -C DOCKER-USER "${RULE[@]}" 2>/dev/null || iptables -I DOCKER-USER "${RULE[@]}" \
  || { echo "could not block containers from the metadata server; not reporting" >&2; exit 1; }

disk="$(df --output=pcent / | tail -1 | tr -dc 0-9)"
wal="$(docker exec supabase-db psql -U postgres -At -c 'select (coalesce(sum(size),0)/1048576)::bigint from pg_ls_waldir()' 2>/dev/null | tr -dc 0-9)"
# Every compose service of the stack that is not running, or is running but unhealthy/restarting.
ps_out="$(docker ps -a --filter label=com.docker.compose.project=supabase --filter label=com.docker.compose.oneoff=False \
  --format '{{.Label "com.docker.compose.service"}} {{.State}} {{.Status}}' 2>/dev/null)" || ps_out=""
down="$(printf '%s\n' "$ps_out" | awk 'NF && ($2 != "running" || /\(unhealthy\)/) {printf "%s%s", sep, $1; sep=","}')"
case "$disk" in ''|*[!0-9]*) echo "no disk reading" >&2; exit 1 ;; esac
case "$wal" in ''|*[!0-9]*) echo "no WAL reading" >&2; exit 1 ;; esac
[ -n "$ps_out" ] || { echo "no container list" >&2; exit 1; }
# ts last, so a reader never pairs a fresh ts with a value from the previous run.
put disk "$disk" && put wal "$wal" && put down "${down:-none}" && put ts "$(date +%s)" \
  || { echo "metadata server refused the write" >&2; exit 1; }
