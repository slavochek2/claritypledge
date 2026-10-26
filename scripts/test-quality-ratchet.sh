#!/bin/bash
# scripts/test-quality-ratchet.sh — P1566 hermetic canary for the quality ratchet.
#
# Builds a throwaway git repo and drives scripts/quality-ratchet.cjs through every
# rule BOTH ways (epistemic gates 7 and 7c): each rule must fail on the regression it
# exists for AND pass the ordinary workflow next to it (touching an over-limit file
# without growing it, a git mv, an extraction, a rename, a comment).
#
# Exit 0 = all scenarios behave, 1 = at least one did not.

set -u
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR

REPO_ROOT="$(git rev-parse --show-toplevel)"
RATCHET="$REPO_ROOT/scripts/quality-ratchet.cjs"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cd "$TMP" || exit 1
git init -q
git config user.email canary@example.com
git config user.name canary
git config commit.gpgsign false

PASS=0
FAIL=0

# expect EXITCODE "label" -- args to the ratchet
expect() {
    local want="$1" label="$2"
    shift 2
    local out rc
    out="$(node "$RATCHET" "$@" 2>&1)"
    rc=$?
    if [ "$rc" = "$want" ]; then
        PASS=$((PASS + 1))
        echo "  ok   [$rc] $label"
    else
        FAIL=$((FAIL + 1))
        echo "  FAIL [got $rc, want $want] $label"
        echo "$out" | sed 's/^/       /'
    fi
}

# expect_text "label" "pattern" -- args: the output must contain the pattern
expect_text() {
    local label="$1" pattern="$2"
    shift 2
    local out
    out="$(node "$RATCHET" "$@" 2>&1)"
    if grep -qF -- "$pattern" <<< "$out"; then
        PASS=$((PASS + 1))
        echo "  ok   $label"
    else
        FAIL=$((FAIL + 1))
        echo "  FAIL $label — missing: $pattern"
        echo "$out" | sed 's/^/       /'
    fi
}

# gen N PREFIX — N one-statement lines (each one normalized line)
gen() { node -e "for (let i = 0; i < $1; i++) console.log('export const $2' + i + ' = ' + i + ';')"; }

# bigfn NAME LINES — a function NAME with LINES own statements
bigfn() { node -e "console.log('export function $1() {'); for (let i = 0; i < $2; i++) console.log('  console.warn(\"line ' + i + '\");'); console.log('}')"; }

# branchy NAME N — a function with complexity 1 + N
branchy() { node -e "console.log('export function $1(x: number) {'); for (let i = 0; i < $2; i++) console.log('  if (x === ' + i + ') return ' + i + ';'); console.log('  return -1;'); console.log('}')"; }

reset_to_base() { git reset -q --hard base; git clean -qfd; }

mkdir -p src/app/data src/app/prototypes src/tests
gen 450 big > src/app/data/big.ts                       # over the 400-line file limit
gen 390 near > src/app/data/near.ts                     # just under it
{ gen 5 h; bigfn longFn 100; branchy branchyFn 25; } > src/app/data/fns.ts
gen 450 proto > src/app/prototypes/proto.ts             # exempt
gen 450 t > src/tests/big.test.ts                       # out of scope
{ echo '/* eslint-disable max-lines -- legacy */'; gen 10 d; } > src/app/data/legacy-directive.ts
git add -A && git commit -qm base && git tag base

echo "== file size"
gen 1 extra >> src/app/data/big.ts; git add src/app/data/big.ts
expect 1 "over-limit file grows by one statement" --staged
expect_text "message names value, limit and remedy" "450 to 451 normalized lines (limit 400)" --staged
reset_to_base

sed -i.bak 's/export const big7 = 7;/export const big7 = 8;/' src/app/data/big.ts && rm -f src/app/data/big.ts.bak
git add src/app/data/big.ts
expect 0 "over-limit file edited without growing" --staged
reset_to_base

printf '// a comment\n\n/* another\n   comment */\n' >> src/app/data/big.ts; git add src/app/data/big.ts
expect 0 "over-limit file gains only comments and blank lines" --staged
reset_to_base

node -e "const fs=require('fs');const p='src/app/data/big.ts';fs.writeFileSync(p,fs.readFileSync(p,'utf8').split('\n').join(' '))"
gen 1 extra >> src/app/data/big.ts; git add src/app/data/big.ts
expect 1 "compacting the whole file onto one line does not hide growth" --staged
reset_to_base

git mv src/app/data/big.ts src/app/data/big-renamed.ts
expect 0 "git mv of an over-limit file" --staged
reset_to_base

gen 401 n > src/app/data/new-big.ts; git add src/app/data/new-big.ts
expect 1 "new file over the limit" --staged
reset_to_base

gen 20 more >> src/app/data/near.ts; git add src/app/data/near.ts
expect 1 "file crosses the limit" --staged
reset_to_base

gen 450 p2 >> src/app/prototypes/proto.ts; gen 450 t2 >> src/tests/big.test.ts
git add src/app/prototypes/proto.ts src/tests/big.test.ts
expect 0 "exempt prototype and out-of-scope test file grow" --staged
reset_to_base

echo "== split laundering"
# Move 100 statements out of big.ts into a new file, then add 100 new ones back.
node -e "
const fs=require('fs');const p='src/app/data/big.ts';const l=fs.readFileSync(p,'utf8').trim().split('\n');
fs.writeFileSync('src/app/data/moved.ts', l.slice(0,100).join('\n')+'\n');
const add=[];for(let i=0;i<100;i++)add.push('export const laundered'+i+' = '+i+';');
fs.writeFileSync(p, l.slice(100).concat(add).join('\n')+'\n');"
git add src/app/data/big.ts src/app/data/moved.ts
expect 1 "extraction that adds the same amount of new code back" --staged
expect_text "laundering message" "moved 100 lines into new files but gained 100 new lines" --staged
reset_to_base

node -e "
const fs=require('fs');const p='src/app/data/big.ts';const l=fs.readFileSync(p,'utf8').trim().split('\n');
fs.writeFileSync('src/app/data/moved.ts', l.slice(0,100).join('\n')+'\n');
const wiring=[];for(let i=0;i<10;i++)wiring.push('export const wire'+i+' = '+i+';');
fs.writeFileSync(p, wiring.concat(l.slice(100)).join('\n')+'\n');"
git add src/app/data/big.ts src/app/data/moved.ts
expect 0 "extraction with wiring inside the allowance" --staged
reset_to_base

echo "== functions"
node -e "const fs=require('fs');const p='src/app/data/fns.ts';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('console.warn(\"line 0\");','console.warn(\"line 0\");\n  console.warn(\"grown\");'))"
git add src/app/data/fns.ts
expect 1 "over-limit function grows" --staged
reset_to_base

node -e "const fs=require('fs');const p='src/app/data/fns.ts';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('if (x === 0) return 0;','if (x === 0 || x === -5) return 0;'))"
git add src/app/data/fns.ts
expect 1 "over-limit function gets more complex" --staged
reset_to_base

branchy freshFn 21 > src/app/data/fresh.ts; git add src/app/data/fresh.ts
expect 1 "new function over the complexity limit" --staged
reset_to_base

sed -i.bak 's/export function longFn()/export function longFnRenamed()/' src/app/data/fns.ts && rm -f src/app/data/fns.ts.bak
git add src/app/data/fns.ts
expect 0 "over-limit function renamed in place" --staged
reset_to_base

node -e "
const fs=require('fs');const p='src/app/data/fns.ts';const s=fs.readFileSync(p,'utf8');
const start=s.indexOf('export function longFn()');const end=s.indexOf('export function branchyFn');
fs.writeFileSync('src/app/data/long-fn.ts', s.slice(start,end));fs.writeFileSync(p, s.slice(0,start)+s.slice(end));"
git add src/app/data/fns.ts src/app/data/long-fn.ts
expect 0 "over-limit function moved to a new file under the same name" --staged
reset_to_base

# Two anonymous callbacks share a key; inserting a small one above the big one must not
# shift the big one onto a "new" key.
{ echo 'declare function useEffect(f: () => void): void;'; echo 'export function Comp() {'
  echo '  useEffect(() => {'; for i in $(seq 1 90); do echo "    console.warn('a$i');"; done; echo '  });'; echo '}'; } > src/app/data/comp.tsx
git add src/app/data/comp.tsx && git commit -qm comp && git tag -f base >/dev/null
node -e "const fs=require('fs');const p='src/app/data/comp.tsx';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('export function Comp() {','export function Comp() {\n  useEffect(() => { console.warn(\"small\"); });'))"
git add src/app/data/comp.tsx
expect 0 "new small sibling callback inserted above an over-limit one" --staged
reset_to_base

echo "== disable directives"
{ echo '// eslint-disable-next-line complexity'; cat src/app/data/near.ts; } > src/app/data/near.tmp && mv src/app/data/near.tmp src/app/data/near.ts
git add src/app/data/near.ts
expect 1 "newly added eslint-disable for a ratchet rule" --staged
reset_to_base

gen 1 x >> src/app/data/legacy-directive.ts; git add src/app/data/legacy-directive.ts
expect 0 "file with a pre-existing directive, directive unchanged" --staged
reset_to_base

echo "== index, not working tree"
sed -i.bak 's/export const big7 = 7;/export const big7 = 8;/' src/app/data/big.ts && rm -f src/app/data/big.ts.bak
git add src/app/data/big.ts
gen 50 unstaged >> src/app/data/big.ts
expect 0 "unstaged growth on top of a clean staged edit is not judged" --staged
reset_to_base

gen 5 staged >> src/app/data/big.ts; git add src/app/data/big.ts
git show HEAD:src/app/data/big.ts > src/app/data/big.ts
expect 1 "staged growth is judged even when the working tree is reverted" --staged
reset_to_base

echo "== range mode and tool errors"
sed -i.bak 's/export const big7 = 7;/export const big7 = 8;/' src/app/data/big.ts && rm -f src/app/data/big.ts.bak
git add src/app/data/big.ts; git commit -qm edit
expect 0 "range mode, no regression" --range HEAD~1..HEAD --metrics size
gen 1 extra >> src/app/data/big.ts; git add src/app/data/big.ts; git commit -qm grow
expect 1 "range mode sees a committed regression" --range HEAD~1..HEAD --metrics size
expect 2 "unknown revision is a tool error, never a pass" --range nosuchref..HEAD
expect 2 "no mode is a tool error" --bogus
reset_to_base

echo "== nested guides"
GUIDES="$REPO_ROOT/scripts/check-nested-guides.cjs"
# expect_guides EXITCODE "label" [args] — the guide check against this scratch repo's index
expect_guides() {
    local want="$1" label="$2"
    shift 2
    local out rc
    out="$(node "$GUIDES" "$@" 2>&1)"
    rc=$?
    if [ "$rc" = "$want" ]; then PASS=$((PASS + 1)); echo "  ok   [$rc] $label"
    else FAIL=$((FAIL + 1)); echo "  FAIL [got $rc, want $want] $label"; echo "$out" | sed 's/^/       /'; fi
}
for d in src/app/data src/app/pages src/app/components; do
    mkdir -p "$d"; printf '# guide\n' > "$d/CLAUDE.md"; (cd "$d" && ln -s CLAUDE.md AGENTS.md)
done
git add src/app && git commit -qm guides && git tag -f base >/dev/null
expect_guides 0 "three guides, each with an AGENTS.md symlink"
expect_guides 0 "same check against a commit (the CI form)" --rev HEAD
git rm -q --cached src/app/pages/CLAUDE.md
expect_guides 1 "a hot folder's guide is missing"
reset_to_base
node -e "console.log(Array.from({length: 41}, (_, i) => 'line ' + i).join('\n'))" > src/app/data/CLAUDE.md; git add src/app/data/CLAUDE.md
expect_guides 1 "a guide over 40 lines"
reset_to_base
rm src/app/data/AGENTS.md && cp src/app/data/CLAUDE.md src/app/data/AGENTS.md && git add src/app/data/AGENTS.md
expect_guides 1 "AGENTS.md is a copy, not a symlink"
reset_to_base
mkdir -p src/app/hooks && (cd src/app/hooks && ln -s CLAUDE.md AGENTS.md) && git add src/app/hooks/AGENTS.md
expect_guides 1 "an AGENTS.md with no CLAUDE.md beside it"
reset_to_base

echo
echo "test-quality-ratchet: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
