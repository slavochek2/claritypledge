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
# Every git command below rewrites the repo it runs in (reset --hard, clean), so refuse to
# start anywhere but a fresh scratch directory: `cd ""` succeeds and would stay put.
TMP="$(mktemp -d)" || exit 1
[ -n "$TMP" ] && [ -d "$TMP" ] || exit 1
trap 'rm -rf "$TMP"' EXIT
cd "$TMP" || exit 1
[ "$(pwd -P)" = "$(cd "$TMP" && pwd -P)" ] || exit 1
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

gen 450 dcts > src/app/data/legacy.d.cts; git add src/app/data/legacy.d.cts
expect 0 "a .d.cts declaration file is out of scope like .d.ts (final check)" --staged
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
expect_text "laundering message" "moved 100 lines into other files but gained 100 new lines" --staged
reset_to_base

node -e "
const fs=require('fs');const p='src/app/data/big.ts';const l=fs.readFileSync(p,'utf8').trim().split('\n');
fs.writeFileSync('src/app/data/moved.ts', l.slice(0,100).join('\n')+'\n');
const wiring=[];for(let i=0;i<10;i++)wiring.push('export const wire'+i+' = '+i+';');
fs.writeFileSync(p, wiring.concat(l.slice(100)).join('\n')+'\n');"
git add src/app/data/big.ts src/app/data/moved.ts
expect 0 "extraction with wiring inside the allowance" --staged
reset_to_base

echo "== review round 1 (P1566 /finish): bypasses and false positives found by reviewers"
gen 30 h > src/app/data/helper.ts; git add src/app/data/helper.ts; git commit -qm helper; git tag -f base >/dev/null
node -e "
const fs=require('fs');const l=fs.readFileSync('src/app/data/big.ts','utf8').trim().split('\\n');
fs.appendFileSync('src/app/data/helper.ts', l.slice(0,100).join('\\n')+'\\n');
const add=[];for(let i=0;i<100;i++)add.push('export const laundered'+i+' = '+i+';');
fs.writeFileSync('src/app/data/big.ts', l.slice(100).concat(add).join('\\n')+'\\n');"
git add src/app/data/big.ts src/app/data/helper.ts
expect 1 "laundering through an EXISTING file (Gemini 1, Codex 2)" --staged
reset_to_base
node -e "
const fs=require('fs');const p='src/app/data/big.ts';let s=fs.readFileSync(p,'utf8');
for(let i=0;i<20;i++)s=s.replace('export const big'+i+' = '+i+';','export const big'+i+' = '+(i*7)+' + 1;');fs.writeFileSync(p,s);"
gen 20 unrelated >> src/app/data/helper.ts; git add src/app/data/big.ts src/app/data/helper.ts
expect 0 "in-place rewrite of an over-limit file plus unrelated growth elsewhere" --staged
reset_to_base
node -e "const fs=require('fs');const p='src/app/data/big.ts';const l=fs.readFileSync(p,'utf8').trim().split('\\n');const more=[];for(let i=0;i<60;i++)more.push('console.warn('+i+')');fs.writeFileSync(p,l.slice(0,440).join('\\n')+'\\n'+more.join(', ')+';\\n')"
git add src/app/data/big.ts
expect 1 "growth hidden in one comma-joined statement (Codex 1)" --staged
reset_to_base
printf 'export function broken( {\n' >> src/app/data/near.ts; git add src/app/data/near.ts
expect 2 "a file that does not parse is a tool error, never a measurement (Codex 4)" --staged
reset_to_base
printf '/* eslint-disable\n   complexity */\n' >> src/app/data/near.ts; git add src/app/data/near.ts
expect 1 "eslint-disable split over two comment lines (Gemini 8)" --staged
reset_to_base
printf 'export const doc = "// eslint-disable complexity";\n' >> src/app/data/near.ts; git add src/app/data/near.ts
expect 0 "directive-like text inside a string is not a directive (Gemini 8)" --staged
reset_to_base
expect 2 "a three-dot range is refused, not misread (Gemini 9)" --range HEAD~1...HEAD
node -e "const fs=require('fs');const p='src/app/data/big.ts';const l=fs.readFileSync(p,'utf8').trim().split('\\n');const more=[];for(let i=0;i<60;i++)more.push('console.warn('+i+')');fs.writeFileSync(p,l.slice(0,440).join('\\n')+'\\nvoid ('+more.join(', ')+');\\n')"
git add src/app/data/big.ts
expect 1 "growth hidden in a comma sequence inside void (...) (Opus 2)" --staged
reset_to_base
node -e "const fs=require('fs');const p='src/app/data/big.ts';const l=fs.readFileSync(p,'utf8').trim().split('\\n');const d=[];for(let i=0;i<60;i++)d.push('folded'+i+' = '+i);fs.writeFileSync(p,l.slice(0,440).join('\\n')+'\\nexport const '+d.join(', ')+';\\n')"
git add src/app/data/big.ts
expect 1 "growth hidden in one multi-declarator const (Opus 2)" --staged
reset_to_base
gen 401 jsx > src/app/data/new-big.jsx; git add src/app/data/new-big.jsx
expect 1 "a .jsx file is in scope like a .tsx one (Opus 5)" --staged
reset_to_base
printf '/* eslint-disable */\n' >> src/app/data/near.ts; git add src/app/data/near.ts
expect 1 "a new blanket eslint-disable turns complexity off too (Opus 9)" --staged
reset_to_base
printf '/* eslint complexity: "off" */\n' >> src/app/data/near.ts; git add src/app/data/near.ts
expect 1 "a new inline config comment turning complexity off (Opus 9)" --staged
reset_to_base
expect 2 "an empty --metrics list is refused (Opus 8)" --staged --metrics ""
git mv src/app/data/big.ts src/app/data/big-cut.ts
node -e "const fs=require('fs');const p='src/app/data/big-cut.ts';const l=fs.readFileSync(p,'utf8').trim().split('\\n');fs.writeFileSync(p,l.slice(0,410).join('\\n')+'\\n'+Array.from({length:30},(_,i)=>'export const fresh'+i+' = '+i+';').join('\\n')+'\\n')"
gen 40 extra > src/app/data/sibling.ts
git add src/app/data/big-cut.ts src/app/data/sibling.ts
expect 0 "rename that also cut the file below git's similarity is paired back, not a new oversize file (Opus 10)" --staged
reset_to_base
{ cat src/app/data/big.ts; bigfn oldFn 90; } > src/app/data/bigf.ts && git add src/app/data/bigf.ts && git commit -qm bigf && git tag -f base >/dev/null
git mv src/app/data/bigf.ts src/app/data/bigf-cut.ts
node -e "const fs=require('fs');const p='src/app/data/bigf-cut.ts';let s=fs.readFileSync(p,'utf8');const l=s.split('\\n');s=l.slice(0,180).join('\\n')+'\\n'+l.slice(450).join('\\n');s=s.replace('function oldFn()','function newFn()');fs.writeFileSync(p,s)"
git add src/app/data/bigf-cut.ts
expect 0 "heavy-cut rename that also renames an over-limit function inside it (fix round, Gemini R6)" --staged
reset_to_base

# R5: two over-limit files both "move" the same lines to one helper copy and both add new code back.
gen 450 twin | sed 's/twin/big/' > src/app/data/big2.ts; git add src/app/data/big2.ts; git commit -qm big2; git tag -f base >/dev/null
node -e "
const fs=require('fs');const l=fs.readFileSync('src/app/data/big.ts','utf8').trim().split('\\n');
fs.appendFileSync('src/app/data/helper.ts', l.slice(0,100).join('\\n')+'\\n');
for (const f of ['src/app/data/big.ts','src/app/data/big2.ts']) { const m=fs.readFileSync(f,'utf8').trim().split('\\n'); const add=[]; for(let i=0;i<100;i++)add.push('export const l_'+f.length+'_'+i+' = '+i+';'); fs.writeFileSync(f, m.slice(100).concat(add).join('\\n')+'\\n'); }"
git add src/app/data/big.ts src/app/data/big2.ts src/app/data/helper.ts
expect 1 "one copy of moved lines cannot pay for new code in two over-limit files (fix round, Gemini R5)" --staged
reset_to_base
git rm -q --cached src/app/data/big2.ts; rm -f src/app/data/big2.ts; git commit -qm drop-big2; git tag -f base >/dev/null

echo "== functions"
node -e "const fs=require('fs');const p='src/app/data/fns.ts';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('console.warn(\"line 0\");','console.warn(\"line 0\");\n  console.warn(\"grown\");'))"
git add src/app/data/fns.ts
expect 1 "over-limit function grows" --staged
reset_to_base

node -e "const fs=require('fs');const p='src/app/data/fns.ts';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('if (x === 0) return 0;','if (x === 0 || x === -5) return 0;'))"
git add src/app/data/fns.ts
expect 1 "over-limit function gets more complex" --staged
reset_to_base

{ gen 5 h; bigfn unrelatedFn 95 | sed 's/"line /"unrelated /'; branchy branchyFn 25; } > src/app/data/fns.ts; git add src/app/data/fns.ts
expect 1 "deleting one long function does not license an unrelated new one (Gemini 2)" --staged
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
# R2: an over-limit outer function with a long nested helper; extract the helper AND rename the outer.
{ echo 'export function outerFn() {'; for i in $(seq 1 85); do echo "  console.warn('outer $i');"; done
  echo '  const helper = () => {'; for i in $(seq 1 90); do echo "    console.warn('inner $i');"; done; echo '  };'; echo '  helper();'; echo '}'; } > src/app/data/outer.ts
git add src/app/data/outer.ts && git commit -qm outer && git tag -f base >/dev/null
{ echo 'export function renamedOuter() {'; for i in $(seq 1 85); do echo "  console.warn('outer $i');"; done; echo '  helper();'; echo '}'
  echo 'function helper() {'; for i in $(seq 1 90); do echo "  console.warn('inner $i');"; done; echo '}'; } > src/app/data/outer.ts
git add src/app/data/outer.ts
expect 0 "extracting a nested helper and renaming the outer function is a rename, not two new functions (fix round, Gemini R2)" --staged
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
# Two same-key callbacks: a long simple one and a short branchy one.
{ echo 'declare function useEffect(f: () => void): void;'; echo 'declare function x(n: number): void;'; echo 'export function Two() {'
  echo '  useEffect(() => {'; for i in $(seq 1 90); do echo "    x($i);"; done; echo '  });'
  echo '  useEffect(() => {'; for i in $(seq 1 22); do echo "    if (Math.random() > 0.$i) x(-$i);"; done; echo '  });'; echo '}'; } > src/app/data/two.tsx
git add src/app/data/two.tsx && git commit -qm two && git tag -f base >/dev/null
node -e "const fs=require('fs');const p='src/app/data/two.tsx';let s=fs.readFileSync(p,'utf8');const a=s.indexOf('  useEffect(() => {\\n    x(1);');const b=s.indexOf('  });\\n',a)+6;fs.writeFileSync(p,s.slice(0,a)+s.slice(b))"
git add src/app/data/two.tsx
expect 0 "deleting one same-key callback does not blame the untouched other (Gemini 3, Codex 3)" --staged
reset_to_base
node -e "const fs=require('fs');const p='src/app/data/two.tsx';let s=fs.readFileSync(p,'utf8');for(let i=1;i<=50;i++)s=s.replace('    x('+i+');\\n','');fs.writeFileSync(p,s)"
git add src/app/data/two.tsx
expect 0 "shrinking one same-key callback below the other does not swap their yardsticks (Codex 3)" --staged
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
# --ci: the range comes from the GitHub event (the exact command test.yml runs).
LAST="$(git rev-parse HEAD~1)"
GROWN="$(git rev-parse HEAD)"
ci() { env GITHUB_EVENT_NAME="$1" GITHUB_REF="$2" PUSH_BEFORE="$3" node "$RATCHET" --ci --metrics size >/dev/null 2>&1; echo $?; }
check_ci() { if [ "$1" = "$2" ]; then PASS=$((PASS + 1)); echo "  ok   [$1] $3"; else FAIL=$((FAIL + 1)); echo "  FAIL [got $1, want $2] $3"; fi; }
check_ci "$(ci push refs/heads/main "$LAST")" 1 "--ci push to main judges before..after and sees the regression"
check_ci "$(ci push refs/heads/main 0000000000000000000000000000000000000000)" 2 "--ci push with a zero before SHA refuses (would be an empty range)"
check_ci "$(ci push refs/heads/main "$(git rev-parse base)")" 1 "--ci push from an older ancestor still judges the whole range"
git update-ref refs/remotes/origin/main "$LAST"
check_ci "$(ci pull_request refs/pull/1/merge "")" 1 "--ci pull_request judges merge-base(origin/main)..HEAD"
git update-ref refs/remotes/origin/main "$GROWN"
check_ci "$(ci pull_request refs/pull/1/merge "")" 0 "--ci pull_request with nothing new since origin/main"
git update-ref -d refs/remotes/origin/main
check_ci "$(ci pull_request refs/pull/1/merge "")" 2 "--ci pull_request without origin/main refuses (shallow or unfetched)"
git checkout -q --detach "$LAST" 2>/dev/null
check_ci "$(ci push refs/heads/main "$GROWN")" 2 "--ci push whose before is not an ancestor (force push) refuses"
git checkout -q - 2>/dev/null
expect_text "--measure prints a file's numbers" "src/app/data/big.ts: 451 normalized lines (limit 400)" --measure src/app/data/big.ts
expect 2 "no mode is a tool error" --bogus
reset_to_base

echo "== import cycles (range mode)"
cat > tsconfig.app.json <<'JSON'
{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] }, "moduleResolution": "bundler", "module": "ESNext", "jsx": "react-jsx" }, "include": ["src"] }
JSON
mkdir -p src/cyc
printf "import { b } from '@/cyc/b';\nexport const a = () => b;\n" > src/cyc/a.ts
printf "export const b = 1;\n" > src/cyc/b.ts
printf "import { y } from './y';\nexport const x = () => y;\n" > src/cyc/x.ts
printf "import { z } from './z';\nimport { x } from './x';\nexport const y = () => [x, z];\n" > src/cyc/y.ts
printf "export const z = 1;\n" > src/cyc/z.ts
git add -A && git commit -qm cyc-base && git tag -f base >/dev/null
printf "import { a } from './a';\nexport const b = () => a;\n" > src/cyc/b.ts; git add src/cyc/b.ts; git commit -qm cyc-new
expect 1 "new runtime cycle through an @/ alias" --range HEAD~1..HEAD --metrics cycles
expect_text "cycle message states the limit" "0 allowed" --range HEAD~1..HEAD --metrics cycles
reset_to_base
printf '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } } }\n' > tsconfig.json
printf '{ "extends": "./tsconfig.json", "compilerOptions": { "moduleResolution": "bundler", "module": "ESNext", "jsx": "react-jsx" }, "include": ["src"] }\n' > tsconfig.app.json
git add tsconfig.json tsconfig.app.json; git commit -qm extends
printf "import { a } from '@/cyc/a';\nexport const b = () => a;\n" > src/cyc/b.ts; git add src/cyc/b.ts; git commit -qm cyc-extends
expect 1 "aliases inherited through tsconfig extends still resolve (Gemini 4)" --range HEAD~1..HEAD --metrics cycles
reset_to_base
printf "import type { a } from './a';\nexport const b = 1 as unknown as typeof a;\n" > src/cyc/b.ts; git add src/cyc/b.ts; git commit -qm cyc-type
expect 0 "type-only import back is not a runtime cycle" --range HEAD~1..HEAD --metrics cycles
reset_to_base
git mv src/cyc/y.ts src/cyc/y2.ts && sed -i.bak "s#'./y'#'./y2'#" src/cyc/x.ts && rm -f src/cyc/x.ts.bak && git add src/cyc/x.ts && git commit -qm cyc-mv
expect 0 "git mv of a file inside an existing cycle" --range HEAD~1..HEAD --metrics cycles
reset_to_base
printf "import { x } from './x';\nexport const y = () => [x];\n" > src/cyc/y.ts; git add src/cyc/y.ts; git commit -qm cyc-shrink
expect 0 "an existing cycle loses an edge" --range HEAD~1..HEAD --metrics cycles
reset_to_base
printf "import { Shape } from './a';\nexport const b = 1;\nexport function show(s: Shape) { return s.id; }\n" > src/cyc/b.ts
printf "import { b } from '@/cyc/b';\nexport interface Shape { id: string }\nexport const a = () => b;\n" > src/cyc/a.ts
git add src/cyc/a.ts src/cyc/b.ts; git commit -qm cyc-typeuse
expect 0 "an import used only as a type, without the type keyword, is no runtime cycle (Opus 7)" --range HEAD~1..HEAD --metrics cycles
reset_to_base
printf "import { Shape } from './a';\nexport const b = { Shape: 'circle', other: { Shape: 1 } };\nexport function show(s: Shape) { return s.id; }\n" > src/cyc/b.ts
printf "import { b } from '@/cyc/b';\nexport interface Shape { id: string }\nexport const a = () => b;\n" > src/cyc/a.ts
git add src/cyc/a.ts src/cyc/b.ts; git commit -qm cyc-propname
expect 0 "a property NAMED like a type-only import is not a value use (fix round, Gemini R3)" --range HEAD~1..HEAD --metrics cycles
reset_to_base
printf "import { Shape } from './a';\nexport type { Shape };\nexport { type Shape as Shape2 };\nexport const b = 1;\n" > src/cyc/b.ts
printf "import { b } from '@/cyc/b';\nexport interface Shape { id: string }\nexport const a = () => b;\n" > src/cyc/a.ts
git add src/cyc/a.ts src/cyc/b.ts; git commit -qm cyc-type-reexport
expect 0 "re-exporting an unmarked type import with export type { } is no runtime edge (final check)" --range HEAD~1..HEAD --metrics cycles
reset_to_base
printf "import w from '@/cyc/z?worker';\nimport u from './z?url';\nexport const x = () => [w, u];\n" > src/cyc/x.ts
git add src/cyc/x.ts; git commit -qm cyc-vite-query
expect 0 "Vite ?worker / ?url imports do not trip the resolution guard (fix round, Gemini R4)" --range HEAD~1..HEAD --metrics cycles
reset_to_base
printf "import { a } from './a';\nexport class Base { static from = a; }\n" > src/cyc/b.ts
printf "import { Base } from '@/cyc/b';\nexport class Child extends Base {}\nexport const a = 1;\n" > src/cyc/a.ts
git add src/cyc/a.ts src/cyc/b.ts; git commit -qm cyc-extends-class
expect 1 "class Child extends Base is a runtime use of Base (fix round, Codex K1)" --range HEAD~1..HEAD --metrics cycles
reset_to_base
printf "import { q } from './jq';\nexport const p = 1;\n" > src/cyc/jp.js
printf "import { p } from './jp';\nexport const q = p;\n" > src/cyc/jq.js
git add src/cyc/jp.js src/cyc/jq.js; git commit -qm cyc-js
expect 1 "an unused named import in a .js file still loads (fix round, Codex K3)" --range HEAD~1..HEAD --metrics cycles
reset_to_base
mkdir -p supabase/functions/_shared
printf "import { b } from '../../../src/cyc/b';\nexport const s = () => b;\n" > supabase/functions/_shared/s.ts
printf "import { s } from '../../supabase/functions/_shared/s';\nexport const b = () => s;\n" > src/cyc/b.ts
git add supabase/functions/_shared/s.ts src/cyc/b.ts; git commit -qm cyc-shared
expect 1 "a cycle through supabase/functions/_shared is seen (Opus 6)" --range HEAD~1..HEAD --metrics cycles
reset_to_base

echo "== exact duplicates (range mode)"
# block NAME — 12 lines of real code, enough for one duplicate window
block() { node -e "console.log('export function $1(items: Array<{ id: string; total: number }>) {'); for (let i = 0; i < 10; i++) console.log('  const value' + i + ' = items.filter((item) => item.total > ' + i + ').length;'); console.log('  return value0 + value9;'); console.log('}')"; }
mkdir -p src/dup
block original > src/dup/one.ts
git add -A && git commit -qm dup-base && git tag -f base >/dev/null
block original | sed 's/function original/function pasted/' > src/dup/two.ts; git add src/dup/two.ts; git commit -qm dup-paste
expect 1 "a pasted copy of an existing block" --range HEAD~1..HEAD --metrics duplicates
expect_text "duplicate message names the other copy and the counts" "now occur 2 times (was 1" --range HEAD~1..HEAD --metrics duplicates
expect_text "duplicate message names the other copy" "Also in: src/dup/one.ts" --range HEAD~1..HEAD --metrics duplicates
reset_to_base
block original | sed 's/function original/function third/' > src/dup/three.ts; printf '// touched\n' >> src/dup/one.ts
git add src/dup/three.ts src/dup/one.ts; git commit -qm dup-third
DUPS="$(node "$RATCHET" --range HEAD~1..HEAD --metrics duplicates 2>&1 | grep -c '\[duplicates\]')"
if [ "$DUPS" = 1 ]; then PASS=$((PASS + 1)); echo "  ok   a copy is blamed where it was added, not in a touched file holding an old copy (Gemini 7)"
else FAIL=$((FAIL + 1)); echo "  FAIL expected 1 duplicate finding, got $DUPS (Gemini 7)"; fi
reset_to_base
block original | sed 's/function original/function second/' > src/dup/two.ts; git add src/dup/two.ts; git commit -qm dup-two; git tag -f base >/dev/null
git mv src/dup/one.ts src/dup/one-renamed.ts; block original | sed 's/function original/function third/' > src/dup/three.ts
git add src/dup/three.ts; git commit -qm dup-rename-third
DUPS="$(node "$RATCHET" --range HEAD~1..HEAD --metrics duplicates 2>&1 | grep '\[duplicates\]' | tr '\n' ' ')"
case "$DUPS" in *one-renamed*) FAIL=$((FAIL + 1)); echo "  FAIL a renamed file holding an old copy is blamed (fix round, Gemini R1): $DUPS" ;;
  *three.ts*) PASS=$((PASS + 1)); echo "  ok   a renamed file holding an old copy is not blamed; the new copy is (fix round, Gemini R1)" ;;
  *) FAIL=$((FAIL + 1)); echo "  FAIL expected a finding in three.ts (fix round, Gemini R1): $DUPS" ;; esac
reset_to_base
git mv src/dup/one.ts src/dup/moved.ts && git commit -qm dup-move
expect 0 "moving a block to another file" --range HEAD~1..HEAD --metrics duplicates
reset_to_base
expect 2 "whole-graph metrics refuse staged mode" --staged --metrics duplicates

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
: > src/app/data/CLAUDE.md; git add src/app/data/CLAUDE.md
expect_guides 1 "an empty guide (Gemini 10)"
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
