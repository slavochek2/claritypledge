#!/bin/bash
# P1635 step 0 -- the pre-commit load workload, re-runnable so "before" and "after" use the same one.
#
#   scripts/bench-p1635-precommit-load.sh steps       [--out DIR] [--files "a b c"]
#   scripts/bench-p1635-precommit-load.sh concurrent  [--out DIR] [--n 3] [--files "a b c"] [--hook-from DIR]
#   scripts/bench-p1635-precommit-load.sh summary     --out DIR    (re-print a finished concurrent run's figures)
#
# steps       one scratch clone, each hook step run ALONE under /usr/bin/time -l (wall, user, sys), plus
#             the cost of the always-run disk-reading test group and of `vitest related` selection.
# concurrent  N scratch clones, each with one staged source edit, each running the REAL
#             scripts/pre-commit-checks.sh at the same moment. Records per-run wall/CPU, per-step wall
#             (from line timestamps), and a 2s sampler of peak test workers and machine load.
#
# --hook-from DIR copies DIR/scripts/pre-commit-checks.sh and DIR/scripts/lib/ over the clone's own,
# which is how the AFTER run exercises the working-tree hook without a commit (worktrees run main's hook).
#
# No real commit is made anywhere: the hook runs against a staged change in a throwaway clone under
# --out, and nothing is committed or pushed. Clones share node_modules with the source checkout via
# symlink (as worktrees do) and are named benchN so the vite cache dir is node_modules/.vite-benchN.
#
# HONESTY NOTE: this does not pause other sessions. Every figure it prints carries the machine's
# concurrent load (load average, and CPU percent of processes outside the workload), because a
# loaded shared machine inflates wall time and, less, CPU time.
set -u

REPO="$(cd "$(dirname "$0")/.." && pwd -P)"
MODE="${1:-}"
[ $# -gt 0 ] && shift
N=3
OUT=""
HOOK_FROM=""
FILES="src/lib/chunk-error.ts src/lib/canvas-hrefs.ts src/lib/banner-credit.ts"
WORKERS_CAP="${BENCH_WORKERS_CAP:-3}"

while [ $# -gt 0 ]; do
    case "$1" in
        --n) N="$2"; shift 2 ;;
        --out) OUT="$2"; shift 2 ;;
        --files) FILES="$2"; shift 2 ;;
        --hook-from) HOOK_FROM="$2"; shift 2 ;;
        *) echo "unknown arg: $1" >&2; exit 64 ;;
    esac
done
case "$MODE" in steps|concurrent|summary) ;; *) echo "usage: $0 steps|concurrent|summary [--out DIR] [--n N] [--files \"a b c\"] [--hook-from DIR]" >&2; exit 64 ;; esac
[ -n "$OUT" ] || OUT="$(mktemp -d "${TMPDIR:-/tmp}/p1635-bench.XXXXXX")"
mkdir -p "$OUT/worktrees"
NM="$(cd "$REPO/node_modules" && pwd -P)"

load1() { sysctl -n vm.loadavg | awk '{print $2}'; }

make_clone() { # $1 = index, $2 = file to touch
    local d="$OUT/worktrees/bench$1"
    rm -rf "$d"
    git clone -q --local "$REPO" "$d" || return 1
    git -C "$d" checkout -q -B main
    ln -s "$NM" "$d/node_modules"
    # env files, as setup-worktree.sh links them: the build refuses to run without VITE_SUPABASE_*.
    for e in .env.local .env.test.local .env.development.local; do
        [ -e "$REPO/$e" ] && ln -s "$(readlink "$REPO/$e" || echo "$REPO/$e")" "$d/$e"
    done
    if [ -n "$HOOK_FROM" ]; then
        cp "$HOOK_FROM/scripts/pre-commit-checks.sh" "$d/scripts/pre-commit-checks.sh"
        rm -rf "$d/scripts/lib" && cp -R "$HOOK_FROM/scripts/lib" "$d/scripts/lib"
    fi
    printf '\n// p1635 bench touch\n' >> "$d/$2"
    git -C "$d" add -- "$2"
    echo "$d"
}

# Sampler: every 2s, one line "epoch workers runners mine_cpu other_cpu load1".
#   workers = vitest fork workers under the workload, runners = vitest main processes,
#   mine_cpu / other_cpu = summed ps %cpu of the workload's process tree / everything else.
sampler() {
    while [ -e "$OUT/.sampling" ]; do
        roots=""
        for pf in "$OUT"/*/pid "$OUT"/pid.*; do [ -f "$pf" ] && roots="$roots $(cat "$pf")"; done
        ps -axo pid=,ppid=,pcpu=,command= | awk -v roots="$roots" -v now="$(date +%s)" -v ld="$(load1)" '
            { pid=$1; pp[pid]=$2; cpu[pid]=$3; $1=$2=$3=""; cmd[pid]=$0 }
            END { n=split(roots,r," "); for(i=1;i<=n;i++) mine[r[i]]=1
                  ch=1; while(ch){ch=0; for(p in pp) if(!(p in mine) && (pp[p] in mine)){mine[p]=1; ch=1}}
                  for(p in mine){ mc+=cpu[p]; if(cmd[p] ~ /workers\/forks|workers\/threads/) w++; else if(cmd[p] ~ /vitest\.mjs|vitest\/vitest/) rn++ }
                  for(p in pp) if(!(p in mine)) oc+=cpu[p]
                  printf "%s %d %d %.0f %.0f %s\n", now, w, rn, mc, oc, ld }' >> "$OUT/samples.txt"
        sleep 2
    done
}

start_sampler() { touch "$OUT/.sampling"; : > "$OUT/samples.txt"; sampler & SAMPLER_PID=$!; }
stop_sampler() { rm -f "$OUT/.sampling"; wait "$SAMPLER_PID" 2>/dev/null; }

sampler_summary() { # $1 = label, optional $2 $3 = first and last epoch to count
    awk -v l="$1" -v from="${2:-0}" -v to="${3:-9999999999}" 'NF==6 && $1>=from && $1<=to { if($2>pw)pw=$2; if($3>pr)pr=$3; if($4>pm)pm=$4; if($5>po)po=$5; if($6>pl)pl=$6; if(!lo||$6<lo)lo=$6; so+=$5; n++ }
        END { printf "%s sampler: samples=%d peak_test_workers=%d peak_vitest_runners=%d peak_workload_cpu%%=%d machine_load1 min/peak=%s/%s other_processes_cpu%% peak/mean=%d/%d\n", l,n,pw,pr,pm,lo,pl,po,(n?so/n:0) }' "$OUT/samples.txt"
}

timed() { # $1 label, rest = command (run in $CWD_FOR_TIMED); prints one summary line
    local label="$1"; shift
    local l0 t0 rc
    l0="$(load1)"; t0=$(date +%s)
    ( cd "$CWD_FOR_TIMED" && bash -c 'echo $$ > "$1"; tf="$2"; shift 2; exec /usr/bin/time -l -o "$tf" "$@"' x "$OUT/pid.$label" "$OUT/time.$label" "$@" < /dev/null > "$OUT/log.$label" 2>&1 )
    rc=$?
    rm -f "$OUT/pid.$label"
    awk -v l="$label" -v rc="$rc" -v l0="$l0" -v l1="$(load1)" \
        -v bg="$(awk -v t0="$t0" '$1>=t0{o+=$5;n++} END{printf "%d", n?o/n:0}' "$OUT/samples.txt")" \
        '/ real / {r=$1; u=$3; s=$5} /maximum resident/ {m=$1}
         END { printf "%-18s exit=%s wall=%ss user=%ss sys=%ss cpu=%.1fs maxrss=%dMB load1 start/end=%s/%s other_cpu%%_mean=%s\n", l, rc, r, u, s, u+s, m/1048576, l0, l1, bg }' "$OUT/time.$label"
}

disk_group() { # tests that read files or run commands -- derived at run time from the tracked tests
    git -C "$1" ls-files | grep -E '\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$' | grep -vE '^e2e/|^src/tests/integration/|^tools/|^supabase/functions/' \
        | while IFS= read -r f; do
            grep -qE 'readFileSync|readFile|readdirSync|readdir|execSync|execFileSync|spawnSync|spawn|child_process|node:fs|from .fs.|import\.meta\.glob|\?raw' "$1/$f" && printf '%s\n' "$f"
        done
}

# Figures of a finished concurrent run. $1 = epoch the runs started (the sampler window opens there).
# A run's wall is the last timestamp in its own output (each line carries seconds since its start),
# so this also works on a run summarized later with `summary`.
print_results() {
    local r n last t_end=0
    echo
    for r in "$OUT"/run*; do
        [ -d "$r" ] || continue
        n="$(basename "$r")"
        echo "--- $n exit=$(cat "$r/rc" 2>/dev/null) $(awk '/ real /{printf "wall=%ss user=%ss sys=%ss cpu=%.1fs", $1,$3,$5,$3+$5} /maximum resident/{printf " maxrss=%dMB", $1/1048576}' "$r/time" 2>/dev/null)"
        # per-step wall: a line's timestamp is when it ENDED, so a step costs the gap from the previous line
        awk '{ t=$1; if ($0 ~ />>> /) { line=$0; sub(/^ *[0-9.]+ /,"",line); printf "    %6.1fs  %s\n", t-prev, substr(line,1,90) } prev=t }' "$r/out.txt" | sort -rn | head -8
        last=$(tail -1 "$r/out.txt" 2>/dev/null | awk '{print int($1)}')
        [ "${last:-0}" -gt "$t_end" ] && t_end="${last:-0}"
    done
    echo "total wall for the concurrent hook runs: about ${t_end}s (the longest run)"
    sampler_summary concurrent "$1" "$(( $1 + t_end + 4 ))"
}

echo "== P1635 bench: mode=$MODE out=$OUT cores=$(sysctl -n hw.ncpu) start_load=$(load1) at $(date -u +%FT%TZ)"
echo "   DEVIATION: other sessions were NOT paused; see the load columns."

if [ "$MODE" = summary ]; then
    print_results "$(head -1 "$OUT/samples.txt" | awk '{print $1}')"
    exit 0
fi

if [ "$MODE" = steps ]; then
    f1="${FILES%% *}"
    D="$(make_clone 1 "$f1")" || exit 1
    CWD_FOR_TIMED="$D"
    start_sampler
    timed typecheck bash scripts/typecheck-gate.sh
    timed eslint npx eslint "$f1" --max-warnings 0 --no-warn-ignored
    timed build npm run build
    timed tests-full npm test
    disk_group "$D" > "$OUT/disk-group.txt"
    echo "disk-reading test files: $(wc -l < "$OUT/disk-group.txt" | tr -d ' ')"
    # shellcheck disable=SC2046
    timed tests-diskgroup npx vitest run "--maxWorkers=$WORKERS_CAP" $(cat "$OUT/disk-group.txt")
    timed tests-related npx vitest related --run "--maxWorkers=$WORKERS_CAP" "$f1"
    stop_sampler
    sampler_summary steps
    exit 0
fi

# concurrent
i=0
for f in $FILES; do
    i=$((i + 1))
    [ "$i" -gt "$N" ] && break
    D="$(make_clone "$i" "$f")" || exit 1
    mkdir -p "$OUT/run$i"
done
start_sampler
T0=$(date +%s)
RUN_PIDS=""
i=0
for f in $FILES; do
    i=$((i + 1))
    [ "$i" -gt "$N" ] && break
    (
        cd "$OUT/worktrees/bench$i" || exit 99
        bash -c 'echo $$ > "$1"; tf="$2"; shift 2; exec /usr/bin/time -l -o "$tf" "$@"' x "$OUT/run$i/pid" "$OUT/run$i/time" bash scripts/pre-commit-checks.sh < /dev/null 2>&1 \
            | perl -MTime::HiRes=time -e '$|=1; $t=time; while(<STDIN>){ printf "%7.1f %s", time-$t, $_ }' > "$OUT/run$i/out.txt"
        echo "${PIPESTATUS[0]}" > "$OUT/run$i/rc"
    ) &
    RUN_PIDS="$RUN_PIDS $!"
done
# NOT a bare `wait`: that also waits for the sampler loop, which only ends when it is stopped
# (a bare wait here hung the first "after" run after every hook had finished).
# shellcheck disable=SC2086
wait $RUN_PIDS
stop_sampler
print_results "$T0"
echo "out=$OUT"
