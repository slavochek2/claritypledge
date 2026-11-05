#!/bin/bash
# Verifies scripts/audit-privacy.sh catches known patterns and ignores safe ones.
set -e

AUDIT="$(git rev-parse --show-toplevel)/scripts/audit-privacy.sh"
PASS=0
FAIL=0

assert_blocks() {
  local label="$1"
  local content="$2"
  local tmpfile
  tmpfile=$(mktemp)
  echo "$content" > "$tmpfile"
  if "$AUDIT" --msg "$tmpfile" >/dev/null 2>&1; then
    echo "  ✗ $label — expected block, got pass"
    FAIL=$((FAIL+1))
  else
    echo "  ✓ $label — blocked"
    PASS=$((PASS+1))
  fi
  rm -f "$tmpfile"
}

assert_allows() {
  local label="$1"
  local content="$2"
  local tmpfile
  tmpfile=$(mktemp)
  echo "$content" > "$tmpfile"
  if "$AUDIT" --msg "$tmpfile" >/dev/null 2>&1; then
    echo "  ✓ $label — allowed"
    PASS=$((PASS+1))
  else
    echo "  ✗ $label — expected pass, got block"
    FAIL=$((FAIL+1))
  fi
  rm -f "$tmpfile"
}

# Run audit script in range mode inside a throwaway git repo
# Usage: assert_range_blocks <label> <commit-msg> <file-path> <file-content>
# Creates a repo, commits a file, runs audit on HEAD~1..HEAD
TMPDIR_REPO=""

setup_tmp_repo() {
  TMPDIR_REPO=$(mktemp -d)
  git -C "$TMPDIR_REPO" init -q
  git -C "$TMPDIR_REPO" config user.email "test@example.com"
  git -C "$TMPDIR_REPO" config user.name "Test"
  # Initial empty commit so we can use HEAD~1..HEAD
  git -C "$TMPDIR_REPO" commit -q --allow-empty -m "init"
}

teardown_tmp_repo() {
  rm -rf "$TMPDIR_REPO"
  TMPDIR_REPO=""
}

assert_range_blocks() {
  local label="$1"
  local commit_msg="$2"
  local file_path="$3"
  local file_content="$4"
  local allowlist_content="${5:-}"
  local email_allowlist_content="${6:-}"

  setup_tmp_repo
  # Copy audit script into the tmp repo so it can find itself
  cp "$AUDIT" "$TMPDIR_REPO/audit-privacy.sh"
  chmod +x "$TMPDIR_REPO/audit-privacy.sh"
  if [ -n "$allowlist_content" ]; then
    printf '%s\n' "$allowlist_content" > "$TMPDIR_REPO/.privacy-allowlist"
  fi
  if [ -n "$email_allowlist_content" ]; then
    printf '%s\n' "$email_allowlist_content" > "$TMPDIR_REPO/.privacy-email-allowlist"
  fi
  mkdir -p "$TMPDIR_REPO/$(dirname "$file_path")"
  printf '%s\n' "$file_content" > "$TMPDIR_REPO/$file_path"
  git -C "$TMPDIR_REPO" add "$file_path" 2>/dev/null
  git -C "$TMPDIR_REPO" commit -q --allow-empty -m "$commit_msg"

  # Run audit from inside the tmp repo
  if (cd "$TMPDIR_REPO" && bash audit-privacy.sh "HEAD~1..HEAD" >/dev/null 2>&1); then
    echo "  ✗ $label — expected block, got pass"
    FAIL=$((FAIL+1))
  else
    echo "  ✓ $label — blocked"
    PASS=$((PASS+1))
  fi
  teardown_tmp_repo
}

assert_range_allows() {
  local label="$1"
  local commit_msg="$2"
  local file_path="$3"
  local file_content="$4"
  local allowlist_content="${5:-}"
  local email_allowlist_content="${6:-}"

  setup_tmp_repo
  cp "$AUDIT" "$TMPDIR_REPO/audit-privacy.sh"
  chmod +x "$TMPDIR_REPO/audit-privacy.sh"
  if [ -n "$allowlist_content" ]; then
    printf '%s\n' "$allowlist_content" > "$TMPDIR_REPO/.privacy-allowlist"
  fi
  if [ -n "$email_allowlist_content" ]; then
    printf '%s\n' "$email_allowlist_content" > "$TMPDIR_REPO/.privacy-email-allowlist"
  fi
  mkdir -p "$TMPDIR_REPO/$(dirname "$file_path")"
  printf '%s\n' "$file_content" > "$TMPDIR_REPO/$file_path"
  git -C "$TMPDIR_REPO" add "$file_path" 2>/dev/null
  git -C "$TMPDIR_REPO" commit -q --allow-empty -m "$commit_msg"

  if (cd "$TMPDIR_REPO" && bash audit-privacy.sh "HEAD~1..HEAD" >/dev/null 2>&1); then
    echo "  ✓ $label — allowed"
    PASS=$((PASS+1))
  else
    echo "  ✗ $label — expected pass, got block"
    FAIL=$((FAIL+1))
  fi
  teardown_tmp_repo
}

# Run audit in --staged mode (the pre-commit path) inside a throwaway repo with a STAGED
# (uncommitted) change. Usage: assert_staged_blocks <label> <file-path> <content> [email-allowlist]
assert_staged_blocks() {
  local label="$1" file_path="$2" file_content="$3" email_allowlist_content="${4:-}"
  setup_tmp_repo
  cp "$AUDIT" "$TMPDIR_REPO/audit-privacy.sh"
  chmod +x "$TMPDIR_REPO/audit-privacy.sh"
  if [ -n "$email_allowlist_content" ]; then
    printf '%s\n' "$email_allowlist_content" > "$TMPDIR_REPO/.privacy-email-allowlist"
  fi
  mkdir -p "$TMPDIR_REPO/$(dirname "$file_path")"
  printf '%s\n' "$file_content" > "$TMPDIR_REPO/$file_path"
  git -C "$TMPDIR_REPO" add "$file_path" 2>/dev/null
  # staged but NOT committed — --staged scans `git diff --cached`
  if (cd "$TMPDIR_REPO" && bash audit-privacy.sh --staged >/dev/null 2>&1); then
    echo "  ✗ $label — expected block, got pass"
    FAIL=$((FAIL+1))
  else
    echo "  ✓ $label — blocked"
    PASS=$((PASS+1))
  fi
  teardown_tmp_repo
}

# Run audit in --msg mode inside a throwaway repo that HAS an email-allowlist — proves the
# email check is SKIPPED on commit messages even when an unknown email + a populated allowlist
# are both present (i.e. the pass is the --msg guard, not fail-open).
assert_msg_allows() {
  local label="$1" msg_content="$2" email_allowlist_content="${3:-}"
  setup_tmp_repo
  cp "$AUDIT" "$TMPDIR_REPO/audit-privacy.sh"
  chmod +x "$TMPDIR_REPO/audit-privacy.sh"
  if [ -n "$email_allowlist_content" ]; then
    printf '%s\n' "$email_allowlist_content" > "$TMPDIR_REPO/.privacy-email-allowlist"
  fi
  printf '%s\n' "$msg_content" > "$TMPDIR_REPO/msg.txt"
  if (cd "$TMPDIR_REPO" && bash audit-privacy.sh --msg msg.txt >/dev/null 2>&1); then
    echo "  ✓ $label — allowed"
    PASS=$((PASS+1))
  else
    echo "  ✗ $label — expected pass, got block"
    FAIL=$((FAIL+1))
  fi
  teardown_tmp_repo
}

echo "=== Hard blocks (--msg mode) ==="
assert_blocks "bare googlemail" "see slavochek@googlemail.com"
assert_blocks "alias +98723" "fixture: slavochek+98723@googlemail.com"
assert_blocks "slavochek246 username" "recipient slavochek246 logged in"
assert_blocks "Kaka Mukaka literal" "test fixture: Kaka Mukaka"
assert_blocks "absolute path" "see /Users/slavochek/Projects/foo"
assert_blocks "@inguro extra" "contact bob@inguro.com"
assert_blocks "P919 synthetic canary sentinel" "marker CLARITYPLEDGE-CANARY-DO-NOT-MERGE present"

echo ""
echo "=== Safe allows (--msg mode) ==="
assert_allows "github URL" "repo at github.com/slavochek2/claritypledge"
assert_allows "slava@inguro.com allowed" "mail slava@inguro.com"
assert_allows "synthetic fixture" "receiver: test-recipient@example.com"
assert_allows "slavochek2 bounded (not 246)" "github.com/slavochek2/foo"
assert_allows "empty" ""

echo ""
echo "=== Range mode: file content ==="
assert_range_blocks "range: PII in file content" \
  "add file" "docs/notes.md" "contact slavochek@googlemail.com"

assert_range_blocks "range: commit message PII" \
  "fix slavochek246 login bug" "docs/notes.md" "safe content"

assert_range_allows "range: safe file + safe message" \
  "add doc" "docs/notes.md" "safe content here"

assert_range_blocks "range: P919 synthetic canary sentinel in file" \
  "add canary" "test/p919-canary.txt" "CLARITYPLEDGE-CANARY-DO-NOT-MERGE"

echo ""
echo "=== Allowlist: correct behavior ==="
assert_range_allows "allowlist: exact file match allows PII" \
  "add script" "scripts/audit-privacy.sh" "pattern: slavochek@googlemail.com" \
  "scripts/audit-privacy.sh"

assert_range_blocks "allowlist: sibling .bak is NOT allowed" \
  "add backup" "scripts/audit-privacy.sh.bak" "pattern: slavochek@googlemail.com" \
  "scripts/audit-privacy.sh"

assert_range_blocks "allowlist: content injection attack blocked" \
  "add poison" "docs/poison.md" "+++ b/scripts/audit-privacy.sh
slavochek@googlemail.com" \
  "scripts/audit-privacy.sh"

# P919/D2 co-commit guard — the two-state invariant the workflow's allowlist SWAP
# exploits. The attack: allowlist a path AND add PII to it in one push. privacy-scan.yml
# defeats it by re-running the scan with the allowlist as it exists at the BASE SHA.
# These two cases assert BOTH halves on the SAME commit (same file/content/path),
# differing only in the allowlist — so a regression to the swap's premise is caught
# here, not by an attacker later getting a false GREEN:
#   (1) HEAD allowlist HAS the new entry  → scan PASSES  (this is the bypass; workflow step 3)
#   (2) BASE allowlist LACKS the entry    → scan BLOCKS  (the guard's re-scan; workflow step 4)
assert_range_allows "co-commit guard [HEAD allowlist has entry]: step-3 scan passes (the bypass)" \
  "add newly-allowlisted file with PII" "docs/freshly-allowlisted.md" "contact slavochek@googlemail.com" \
  "docs/freshly-allowlisted.md"

assert_range_blocks "co-commit guard [BASE allowlist lacks entry]: step-4 re-scan blocks" \
  "add newly-allowlisted file with PII" "docs/freshly-allowlisted.md" "contact slavochek@googlemail.com"

echo ""
echo "=== P936: third-party email allowlist (diff-only) ==="
EMAIL_AL='example.com
*.example.com
noreply@*
slava@inguro.com
jack@greensock.com'

assert_range_blocks "email: unknown third-party email blocks" \
  "add file" "docs/notes.md" "contact stranger@notlisted.invalid for info" "" "$EMAIL_AL"
assert_range_allows "email: allowlisted bare domain passes" \
  "add file" "docs/notes.md" "fixture jane@example.com" "" "$EMAIL_AL"
assert_range_allows "email: *.suffix wildcard passes" \
  "add file" "docs/notes.md" "deliver x@mail.example.com" "" "$EMAIL_AL"
assert_range_allows "email: local-part wildcard passes" \
  "add file" "docs/notes.md" "system noreply@anywhere.org sends" "" "$EMAIL_AL"
assert_range_allows "email: full-address entry passes" \
  "add file" "docs/notes.md" "credit jack@greensock.com" "" "$EMAIL_AL"
assert_range_blocks "email: address not on allowlist blocks (allowlist is load-bearing)" \
  "add file" "docs/notes.md" "author jeremy@jezweb.net" "" "$EMAIL_AL"
assert_range_allows "email: unknown email in path-allowlisted file is exempt (path filter runs first)" \
  "add script" "scripts/audit-privacy.sh" "stranger@notlisted.invalid" "scripts/audit-privacy.sh" "$EMAIL_AL"
# Commit messages ARE email-scanned since the P1438 follow-up (was diff-only): the old exemption
# existed for Co-Authored-By trailers, which noreply@* already allowlists.
assert_range_blocks "email: unknown email in commit MESSAGE blocks (messages scanned)" \
  "contact stranger@notlisted.invalid please" "docs/notes.md" "safe content here" "" "$EMAIL_AL"
assert_range_allows "email: Co-Authored-By noreply trailer in commit MESSAGE passes" \
  "add doc

Co-Authored-By: Bot <noreply@vendor-fixture.example>" "docs/notes.md" "safe content here" "" "$EMAIL_AL"
assert_range_allows "email: no email-allowlist => check skipped (fail-open)" \
  "add file" "docs/notes.md" "stranger@notlisted.invalid for info"
assert_staged_blocks "email: --staged unknown email blocks (pre-commit path)" \
  "docs/notes.md" "contact stranger@notlisted.invalid" "$EMAIL_AL"
assert_msg_allows "email: --msg with allowlisted trailer only passes" \
  "Co-Authored-By: Bot <noreply@vendor-fixture.example>" "$EMAIL_AL"
# --msg with an unknown email now BLOCKS (the commit-msg hook path) — inverse of the old guard test.
_msgrepo=$(mktemp -d); git -C "$_msgrepo" init -q
printf '%s\n' "$EMAIL_AL" > "$_msgrepo/.privacy-email-allowlist"
printf 'contact stranger@notlisted.invalid please\n' > "$_msgrepo/msg.txt"
set +e; (cd "$_msgrepo" && bash "$AUDIT" --msg msg.txt >/dev/null 2>&1); _rc=$?; set -e
rm -rf "$_msgrepo"
if [ "$_rc" = "1" ]; then echo "  ✓ email: --msg unknown email blocks (commit-msg hook path)"; PASS=$((PASS+1)); else echo "  ✗ email: --msg unknown email blocks (exit $_rc, wanted 1)"; FAIL=$((FAIL+1)); fi

# P919/D2 email co-commit guard — mirrors the path co-commit guard above for the P936
# email allowlist. privacy-scan.yml swaps .privacy-email-allowlist to its base-SHA copy
# and re-scans, so an address allowlisted in THIS push cannot also be added as content.
# ASYMMETRY vs the path guard: the email check is fail-OPEN (empty/absent allowlist => check
# skipped), so the base re-scan only blocks when the base list is NON-EMPTY-but-lacking the
# new entry. A first-ever creation of the email allowlist inherits fail-open (accepted, P936 D2).
#   (1) HEAD email-allowlist HAS the new entry          → scan PASSES (the bypass; workflow step 3)
#   (2) BASE email-allowlist NON-EMPTY but LACKS it     → re-scan BLOCKS (the guard; workflow step 4)
assert_range_allows "email co-commit guard [HEAD email-allowlist has entry]: step-3 scan passes (the bypass)" \
  "add file with newly-allowlisted third-party email" "docs/notes.md" "contact stranger@notlisted.invalid" "" \
  "example.com
notlisted.invalid"
assert_range_blocks "email co-commit guard [BASE email-allowlist non-empty, lacks entry]: step-4 re-scan blocks" \
  "add file with newly-allowlisted third-party email" "docs/notes.md" "contact stranger@notlisted.invalid" "" \
  "example.com"

# Known-names check (P1438): a throwaway repo with its own .private/ fixture. Fake names only.
# One known member per derivation path (seed file, CRM filename) so a source that silently yields
# nothing cannot pass green (epistemic.md gate 7e); plus clean and substring controls.
names_case() {
  # mode: staged (content staged as a file) | range (content as a commit MESSAGE, HEAD~1..HEAD)
  # seed: "full" (seed + CRM file) | "none" (.private/ exists, no name sources)
  local label="$1" content="$2" want="$3" mode="${4:-staged}" seed="${5:-full}" repo rc
  repo=$(mktemp -d)
  git -C "$repo" init -q
  git -C "$repo" config user.email "test@example.com"; git -C "$repo" config user.name "Test"
  mkdir -p "$repo/.private/docs" "$repo/.private/crm/opportunities"
  if [ "$seed" = "full" ]; then
    printf '# seed\n  Zorblat Quenwick  \n' > "$repo/.private/docs/privacy-names.txt"
    : > "$repo/.private/crm/opportunities/pelmora-vashti.md"
    : > "$repo/.private/crm/opportunities/solo.md"
  fi
  # Registry derivation (P1438 follow-up): CRM `name:` frontmatter + business person-file H1s.
  if [ "$seed" = "full" ] || [ "$seed" = "generic" ]; then
    mkdir -p "$repo/.private/docs/business/partners"
    printf -- '---\nname: Quillan Brostrup — Vandermint Fixture / Orblex Labs CNX (head of ops)\nstage: lead\n---\n# body\n' \
      > "$repo/.private/crm/opportunities/quillan-vandermint.md"
    printf -- '---\nname: Ostrava Pell — Commonterm Widget\n---\n' > "$repo/.private/crm/opportunities/ostrava.md"
    printf '# Marrow Teslin — Glimmerhaus partner (warm)\n' > "$repo/.private/docs/business/partners/marrow-teslin-partner.md"
    printf '# Deep Fixturewords — Analysis\n' > "$repo/.private/docs/business/partners/marrow-teslin-analysis-2026-01-01.md"
    # Round-1 review regressions: quoted YAML value, no-space em dash, name particle, accented initial.
    printf -- '---\nname: "Tobrin Halvask — Quorrel Systems"\n---\n' > "$repo/.private/crm/opportunities/tobrin.md"
    printf -- '---\nname: Ysolde van Brackel—Pintervale\n---\n' > "$repo/.private/crm/opportunities/ysolde.md"
    printf '# \xc3\x89mrik Dovanne — advisor\n' > "$repo/.private/docs/business/partners/emrik-dovanne.md"
    # Final-review regressions: comma-separated legal suffix; planning-note titles in business/.
    printf -- '---\nname: Pelko Strandvik — Fernquay, Inc.\n---\n' > "$repo/.private/crm/opportunities/pelko.md"
    printf '# Growth Fixturestrategy — Notes\n' > "$repo/.private/docs/business/partners/growth-plan.md"
    printf '# Q3 Fixtureroadmap — Draft\n' > "$repo/.private/docs/business/partners/q3-fixtureroadmap.md"
  fi
  if [ "$seed" = "generic" ]; then
    # 3 tracked public files already use the derived company term => it is skipped as generic.
    for g in g1 g2 g3; do echo "the Commonterm Widget pattern" > "$repo/$g.md"; done
    git -C "$repo" add g1.md g2.md g3.md; git -C "$repo" commit -qm generic
  fi
  if [ "$mode" = "range" ]; then
    echo base > "$repo/a.md"; git -C "$repo" add a.md; git -C "$repo" commit -qm base
    echo next > "$repo/a.md"; git -C "$repo" add a.md; git -C "$repo" commit -qm "$content"
    (cd "$repo" && "$AUDIT" HEAD~1..HEAD >/dev/null 2>&1); rc=$?
  else
    printf '%s\n' "$content" > "$repo/note.md"
    git -C "$repo" add note.md
    (cd "$repo" && "$AUDIT" --staged >/dev/null 2>&1); rc=$?
  fi
  rm -rf "$repo"
  # Exact exit code: 1 = blocked, 0 = clean. Exit 2 (script error) never counts as a block.
  if [ "$rc" = "$want" ]; then echo "  ✓ $label"; PASS=$((PASS+1)); else echo "  ✗ $label (exit $rc, wanted $want)"; FAIL=$((FAIL+1)); fi
}
set +e
names_case "known name from seed file blocks (seed line padded with spaces)" "met Zorblat Quenwick today" 1
names_case "hyphenated spelling blocks" "see zorblat-quenwick notes" 1
names_case "comma-separated spelling blocks" "Zorblat, Quenwick said" 1
names_case "tab-separated spelling blocks" "$(printf 'Zorblat\tQuenwick')" 1
names_case "en-dash spelling blocks" "Zorblat–Quenwick" 1
names_case "NBSP spelling blocks" "$(printf 'Zorblat\xc2\xa0Quenwick')" 1
names_case "name derived from CRM filename blocks" "talked to Pelmora Vashti" 1
names_case "known name in a COMMIT MESSAGE blocks (range mode)" "notes from Zorblat Quenwick call" 1 range
names_case "single-token CRM filename is NOT derived" "solo work today" 0
names_case "name-free text passes" "a local event organiser" 0
names_case "name embedded in a longer word passes" "Zorblat Quenwickshire" 0
names_case "no name sources: passes (warns on stderr)" "met Zorblat Quenwick today" 0 staged none
# Non-ASCII name, uppercased, under LC_ALL=C (a hook launcher without a UTF-8 locale).
nonascii_repo=$(mktemp -d); git -C "$nonascii_repo" init -q
mkdir -p "$nonascii_repo/.private/docs"; printf 'Östen Müllerby\n' > "$nonascii_repo/.private/docs/privacy-names.txt"
echo "met ÖSTEN MÜLLERBY" > "$nonascii_repo/n.md"; git -C "$nonascii_repo" add n.md
(cd "$nonascii_repo" && LC_ALL=C "$AUDIT" --staged >/dev/null 2>&1); rc=$?; rm -rf "$nonascii_repo"
if [ "$rc" = 1 ]; then echo "  ✓ non-ASCII name blocks under LC_ALL=C"; PASS=$((PASS+1)); else echo "  ✗ non-ASCII name under LC_ALL=C (exit $rc, wanted 1)"; FAIL=$((FAIL+1)); fi
# Registry derivation — one known member per derivation path (gate 7e) plus must-allow controls.
names_case "registry: person from CRM name: field blocks" "lunch with Quillan Brostrup" 1
names_case "registry: company from CRM name: field blocks" "the Vandermint Fixture pilot stalled" 1
names_case "registry: company with acronym suffix stripped blocks" "Orblex Labs replied" 1
names_case "registry: company in a COMMIT MESSAGE blocks (range)" "notes: Vandermint Fixture call" 1 range
names_case "registry: person from business-file H1 blocks" "Marrow Teslin agreed" 1
names_case "registry: parenthesised role is NOT derived" "the head of ops role" 0
names_case "registry: free-text H1 tail is NOT derived" "Glimmerhaus style" 0
names_case "registry: analysis-file H1 is NOT derived" "a Deep Fixturewords pass" 0
names_case "registry: company in 3+ public files skipped as generic" "the Commonterm Widget pattern again" 0 staged generic
names_case "registry: person is never generic-filtered" "Ostrava Pell said" 1 staged generic
names_case "r1: quoted YAML name: person blocks" "Tobrin Halvask wrote" 1
names_case "r1: quoted YAML name: company blocks (no stray quote)" "the Quorrel Systems deal" 1
names_case "r1: em dash without spaces + particle: person blocks" "Ysolde van Brackel agreed" 1
names_case "r1: em dash without spaces: company blocks" "Pintervale pilot" 1
names_case "r1: accented initial person blocks" "$(printf '\xc3\x89mrik Dovanne joined')" 1
names_case "r2: reversed 'Last, First' blocks" "attendees: Quenwick, Zorblat" 1
names_case "r3: company before ', Inc.' blocks" "the Fernquay renewal" 1
names_case "r3: lone legal suffix after a comma is NOT derived" "Example Widgets Inc. filed" 0
names_case "r3: business title not matching its filename is NOT a person" "our Growth Fixturestrategy" 0
names_case "r3: title with digits is NOT a person" "the Q3 Fixtureroadmap" 0
names_case "r2: name padded with 4 spaces blocks" "Zorblat    Quenwick" 1
set -e

# r2: an email in an ADDED FILE PATH blocks (paths run through the email check, not only names).
_er=$(mktemp -d); git -C "$_er" init -q
printf 'example.com\n' > "$_er/.privacy-email-allowlist"
mkdir -p "$_er/docs"; echo neutral > "$_er/docs/contact-stranger@notlisted.invalid.md"
git -C "$_er" add .privacy-email-allowlist docs
set +e; (cd "$_er" && bash "$AUDIT" --staged >/dev/null 2>&1); _rc=$?; set -e; rm -rf "$_er"
if [ "$_rc" = "1" ]; then echo "  ✓ r2: email in an added file path blocks"; PASS=$((PASS+1)); else echo "  ✗ r2: email in path (exit $_rc, wanted 1)"; FAIL=$((FAIL+1)); fi

# r3: a phone number in a RENAMED file path blocks (content-preserving rename adds no content line);
# a dated filename is the must-allow control (Codex final F1).
_pr=$(mktemp -d); git -C "$_pr" init -q; git -C "$_pr" config user.email t@t.invalid; git -C "$_pr" config user.name t
mkdir -p "$_pr/docs"; echo neutral > "$_pr/docs/a.md"; git -C "$_pr" add docs; git -C "$_pr" commit -qm base
git -C "$_pr" mv docs/a.md "docs/tel:+99012345678.md"
set +e; (cd "$_pr" && bash "$AUDIT" --staged >/dev/null 2>&1); _rc=$?; set -e
if [ "$_rc" = "1" ]; then echo "  ✓ r3: phone number in a renamed file path blocks"; PASS=$((PASS+1)); else echo "  ✗ r3: phone in path (exit $_rc, wanted 1)"; FAIL=$((FAIL+1)); fi
git -C "$_pr" mv "docs/tel:+99012345678.md" docs/notes-2026-10-08-build-20261008.1234.md
set +e; (cd "$_pr" && bash "$AUDIT" --staged >/dev/null 2>&1); _rc=$?; set -e; rm -rf "$_pr"
if [ "$_rc" = "0" ]; then echo "  ✓ r3: dated file path is not a phone"; PASS=$((PASS+1)); else echo "  ✗ r3: dated path flagged (exit $_rc, wanted 0)"; FAIL=$((FAIL+1)); fi

# r2: three-dot range resolves a real base (merge-base), so the generic guard still holds.
_tr=$(mktemp -d); git -C "$_tr" init -q -b main
git -C "$_tr" config user.email t@example.com; git -C "$_tr" config user.name T
mkdir -p "$_tr/.private/crm/opportunities"
printf -- '---\nname: Halder Moss — Brindlecove Partners\n---\n' > "$_tr/.private/crm/opportunities/h.md"
echo base > "$_tr/a.md"; git -C "$_tr" add a.md; git -C "$_tr" commit -qm base
git -C "$_tr" checkout -q -b topic
for g in g1 g2 g3; do echo "Brindlecove Partners note" > "$_tr/$g.md"; done
git -C "$_tr" add g1.md g2.md g3.md; git -C "$_tr" commit -qm "add three"
set +e; (cd "$_tr" && bash "$AUDIT" main...topic >/dev/null 2>&1); _rc=$?; set -e; rm -rf "$_tr"
# A...B is rejected by the range validator (exit 2) — it must never come back clean (exit 0).
if [ "$_rc" != "0" ]; then echo "  ✓ r2: three-dot range fails closed (exit $_rc)"; PASS=$((PASS+1)); else echo "  ✗ r2: three-dot range passed clean"; FAIL=$((FAIL+1)); fi

# r1: the generic filter counts at the range BASE, so a push that adds a company term to 3 files
# cannot make its own term "generic" (Codex round 1).
_gr=$(mktemp -d); git -C "$_gr" init -q
git -C "$_gr" config user.email t@example.com; git -C "$_gr" config user.name T
mkdir -p "$_gr/.private/crm/opportunities"
printf -- '---\nname: Halder Moss — Brindlecove Partners\n---\n' > "$_gr/.private/crm/opportunities/h.md"
echo base > "$_gr/a.md"; git -C "$_gr" add a.md; git -C "$_gr" commit -qm base
for g in g1 g2 g3; do echo "Brindlecove Partners note" > "$_gr/$g.md"; done
git -C "$_gr" add g1.md g2.md g3.md; git -C "$_gr" commit -qm "add three"
set +e; (cd "$_gr" && bash "$AUDIT" HEAD~1..HEAD >/dev/null 2>&1); _rc=$?; set -e; rm -rf "$_gr"
if [ "$_rc" = "1" ]; then echo "  ✓ r1: leak in 3 files of the SAME push is still blocked"; PASS=$((PASS+1)); else echo "  ✗ r1: same-push generic self-disable (exit $_rc, wanted 1)"; FAIL=$((FAIL+1)); fi

# r1: a known name in a RENAMED/ADDED file path blocks (no content line carries it).
_pr=$(mktemp -d); git -C "$_pr" init -q
git -C "$_pr" config user.email t@example.com; git -C "$_pr" config user.name T
mkdir -p "$_pr/.private/docs" "$_pr/docs"; printf 'Zorblat Quenwick\n' > "$_pr/.private/docs/privacy-names.txt"
echo "neutral" > "$_pr/docs/a.md"; git -C "$_pr" add docs/a.md; git -C "$_pr" commit -qm base
git -C "$_pr" mv docs/a.md docs/zorblat-quenwick.md
set +e; (cd "$_pr" && bash "$AUDIT" --staged >/dev/null 2>&1); _rc=$?; set -e; rm -rf "$_pr"
if [ "$_rc" = "1" ]; then echo "  ✓ r1: known name in a renamed file path blocks"; PASS=$((PASS+1)); else echo "  ✗ r1: name in renamed path (exit $_rc, wanted 1)"; FAIL=$((FAIL+1)); fi

# r1: output never carries redirect/pipe tokens (shell-safety.md).
_sr=$(mktemp -d); printf 'see /Users/slavochek/x > out.txt | tee\n' > "$_sr/m.txt"
set +e; _out=$(bash "$AUDIT" --msg "$_sr/m.txt" 2>/dev/null); _rc=$?; set -e; rm -rf "$_sr"
[ "$_rc" = "1" ] || { echo "  ✗ r1: shell-safety probe did not block (exit $_rc) — probe is blind"; FAIL=$((FAIL+1)); }
if printf '%s' "$_out" | grep -q '[<>|]'; then echo "  ✗ r1: output contains a redirect/pipe token"; FAIL=$((FAIL+1)); else echo "  ✓ r1: output has no redirect/pipe tokens"; PASS=$((PASS+1)); fi

echo ""
echo "=== Phone numbers (--msg and diff) ==="
assert_blocks "phone: +CC international" "reach me on +990 1234 5678"
assert_blocks "phone: +CC dashed" "ring +990-12-3456789"
assert_blocks "phone: tel: URI" '<a href="tel:+99012345678">call</a>'
assert_blocks "phone: keyword + local number" "WhatsApp: 0900 000 0000"
assert_allows "phone: ISO date + build id (no phone mark)" "shipped 2026-10-08, build 20261008.1234"
assert_allows "phone: verb 'call' + date is not a phone" "call 2026-10-08 with the team"
assert_allows "phone: arithmetic plus" "count 3+12345678"
assert_allows "phone: allowlisted fictional NANP range" "demo +1 555 0100 123"
assert_allows "phone: bare local digits without a mark (accepted residual)" "ring 0900 000 0000"
assert_staged_blocks "phone: --staged diff, +CC number blocks (diff '+' marker not mistaken)" \
  "docs/notes.md" "office line +990 1234 5678"
assert_blocks "r1 phone: number + adjacent digits cannot escape via a length ceiling" "+990 30 12345678 123456"
assert_blocks "r1 phone: JSON \"phone\": \"...\" blocks" '{"phone": "0900000000"}'
assert_allows "r1 phone: signed 8-digit code literal is not a phone" "int x = +10000000;"
assert_allows "r1 phone: signed coordinate is not a phone" "lat: +12.345678"
assert_allows "r1 phone: keyword + ISO date is not a phone" "Phone: 2026-10-08"
assert_allows "r1 phone: keyword + build id is not a phone" "mobile 20261008.1234"
assert_blocks "r2 phone: keyword number followed by a date still blocks" "Phone: 0900000000 2026-10-08"
assert_blocks "r2 phone: keyword number with dotted extension blocks" "phone: 0900000000.1234"
assert_blocks "r3 phone: number whose last 8 digits are date-shaped still blocks" "Phone: +990 20 2026-10-08"
assert_blocks "r3 phone: keyword number whose tail is date-shaped still blocks" "mobile 0900 2026-10-08"
assert_blocks "r4 phone: a date BEFORE the number does not hide it" "Phone: 2026-10-08 0900000000"
assert_blocks "r4 phone: an allowlisted number does not vouch for its ' / ' neighbour" "Phone: +1 555 0100 123 / 0900000000"
assert_blocks "r4 phone: an allowlist prefix does not vouch for a 16+ digit run" "Phone: +1 555 0100 123/0900000000"
assert_blocks "r2 phone: North American (NXX) NXX-XXXX shape blocks" "Reach out at (415) 555-2671"
assert_blocks "r2 phone: North American NXX-NXX-XXXX shape blocks" "Reach out at 212-555-2671"
assert_allows "r2 phone: unary-plus 10-digit epoch is not a phone" "const epoch = +1700000000;"
assert_allows "r2 phone: signed 20-digit literal is not a phone" "score +12345678901234567890"
assert_allows "r2 phone: UUID-ish dashed hex is not NANP" "id 123e4567-e89b-12d3-a456-426614174000"
assert_range_allows "phone: diff line starting with digits is not read as +CC via the diff marker" \
  "add file" "docs/notes.md" "20261008 12345678 tally"

# P1617: the allowlist filter must stay byte-identical to the filter at 7df461be2 while growing
# linearly. Expected hashes below were generated ONCE from that frozen filter, so this cannot pass by
# comparing the new code with itself. The region tested is cut from the shipped script, with no
# test switch in the scanner. Regenerate only by running this file with P1617_PRINT_FROM=<old copy>.
echo ""
echo "=== P1617 filter byte equivalence ==="
P1617_DIR="$(mktemp -d)"
p1617_region() { sed -n '/^# For --msg mode/,/^# Scan helper/p' "$1"; }
p1617_sha() { if command -v sha256sum >/dev/null 2>&1; then sha256sum | cut -d' ' -f1; else shasum -a 256 | cut -d' ' -f1; fi; }
# $1 region file, $2 diff file, $3 allowlist path, $4 locale. Output: raw ADDED bytes, no shell capture.
p1617_run() {
  ALLOWLIST="$3" MODE=x P1617_DIFF_FILE="$2" LC_ALL="$4" bash -c '
    DIFF=$(LC_ALL=C tr -d "\r" < "$P1617_DIFF_FILE")
    . "$0"
    printf "%s" "$ADDED"' "$1" 2>/dev/null
}
p1617_write() { # name, printf format for the diff
  printf -- "$2" > "$P1617_DIR/$1.diff"
}
H='--- a/x\n+++ b/'
p1617_write order        "${H}plain.md\n+one\n+two\n+three\n"
p1617_write cr           "${H}plain.md\n+one\r\n+two\r\n"
p1617_write exact        "${H}exact.md\n+dropped\n--- a/y\n+++ b/plain.md\n+kept\n"
p1617_write prefix       "${H}docs/allowed/a.md\n+dropped\n--- a/y\n+++ b/docs/allowedx/a.md\n+kept\n"
p1617_write bak          "${H}exact.md.bak\n+kept\n"
p1617_write comment      "${H}#comment\n+kept\n--- a/y\n+++ b/\n+kept2\n"
p1617_write noeol        "${H}last/entry\n+kept because an unterminated entry is ignored\n"
p1617_write nonutf8      "${H}plain.md\n+caf\377 \303\251 end\n"
p1617_write nul          "${H}plain.md\n+be\000fore\n+next\n"
p1617_write numeric      "${H}1e3\n+dropped\n--- a/y\n+++ b/1000\n+kept\n"
p1617_write space        "${H}has space.md\t\n+kept\n"
p1617_write specials     "${H}plain.md\n+back\\\\slash \\\\n %%s %%d * ? [a]\n+trailing space \n+\n"
p1617_write glob         "${H}doc*/a.md\n+kept\n--- a/y\n+++ b/gl[o]b.md\n+dropped\n"
p1617_write deleted      "${H}exact.md\n+dropped\n--- a/z\n+++ /dev/null\n-gone\n"
p1617_write allkept0     "${H}exact.md\n+dropped\n+dropped2\n"
p1617_write contentline  "${H}plain.md\n+++ b/exact.md\n+kept\n"
p1617_write empty        ""
AL="$P1617_DIR/al"; printf 'exact.md\ndocs/allowed\n# comment\n\n1e3\ngl[o]b.md\n' > "$AL"
ALN="$P1617_DIR/aln"; printf 'exact.md\nlast/entry' > "$ALN"
ALE="$P1617_DIR/ale"; : > "$ALE"
p1617_cases() {
  for n in order cr exact prefix bak comment nonutf8 nul numeric space specials glob deleted allkept0 contentline empty; do echo "$n $AL C"; done
  echo "nonutf8 $AL UTF8"; echo "specials $AL UTF8"
  echo "noeol $ALN C"; echo "exact $ALE C"; echo "exact $P1617_DIR/absent C"
}
P1617_UTF8=C; for _l in en_US.UTF-8 C.UTF-8 C.utf8; do if locale -a 2>/dev/null | grep -qix "$_l"; then P1617_UTF8="$_l"; break; fi; done
p1617_hashes() { # $1 script copy to cut the region from
  p1617_region "$1" > "$P1617_DIR/region.sh"
  p1617_cases | while read -r n a l; do
    label="$l"; [ "$l" = UTF8 ] && l="$P1617_UTF8"
    al="$(basename "$a")"
    echo "$n/$al/$label $(p1617_run "$P1617_DIR/region.sh" "$P1617_DIR/$n.diff" "$a" "$l" | p1617_sha)"
  done
}
if [ -n "${P1617_PRINT_FROM:-}" ]; then p1617_hashes "$P1617_PRINT_FROM"; exit 0; fi
cat > "$P1617_DIR/expected" <<'EXPECTED'
order/al/C e17f4e7d17dd32a99311fceecbe77e77b3c45c4f6bc7613f15d8168ab60d698a
cr/al/C 0ab884c827aa02c092b780e8375a80a5e678002fb54b567db9f2f652beeab29b
exact/al/C ed8a760afd05cfcea6dc673b8b523c21ea1cdd9bfe6c9a8fdc082e12681d2365
prefix/al/C ed8a760afd05cfcea6dc673b8b523c21ea1cdd9bfe6c9a8fdc082e12681d2365
bak/al/C ed8a760afd05cfcea6dc673b8b523c21ea1cdd9bfe6c9a8fdc082e12681d2365
comment/al/C cb002da4fe704f996ed3dc7ef7ca46e4e37967a0c259d059b67cb7a32c5e95f7
nonutf8/al/C 742ad18ff023576e92d428c565dda54b51c8020da4eac9a6fd62d5b3c5c4ce4d
nul/al/C 77cc1f77125e52f4a92989de193d01ab552a0f1f5c23880b73ecd77bde989435
numeric/al/C ed8a760afd05cfcea6dc673b8b523c21ea1cdd9bfe6c9a8fdc082e12681d2365
space/al/C ed8a760afd05cfcea6dc673b8b523c21ea1cdd9bfe6c9a8fdc082e12681d2365
specials/al/C df027a500cc706c05edcdf32b1e0af2106a6b50e4f44d6b14adcc3fc8a833cc6
glob/al/C ed8a760afd05cfcea6dc673b8b523c21ea1cdd9bfe6c9a8fdc082e12681d2365
deleted/al/C e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
allkept0/al/C e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
contentline/al/C 07915223852372082b83ffc99cbaa73bf1df81444c8096d4d5a26633be0095b7
empty/al/C e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
nonutf8/al/UTF8 742ad18ff023576e92d428c565dda54b51c8020da4eac9a6fd62d5b3c5c4ce4d
specials/al/UTF8 df027a500cc706c05edcdf32b1e0af2106a6b50e4f44d6b14adcc3fc8a833cc6
noeol/aln/C 996e6ff3c9e12e57aee4c0d40348001a86f1f15b12826f13fe30b9ecdaa389a1
exact/ale/C ae47e3eae624be1ad8d78791674b6a1f90f8f9caa6238c8aed3729782f00a24e
exact/absent/C ae47e3eae624be1ad8d78791674b6a1f90f8f9caa6238c8aed3729782f00a24e
EXPECTED
p1617_hashes "$AUDIT" > "$P1617_DIR/actual"
while read -r key want; do
  got="$(grep -F "$key " "$P1617_DIR/actual" | head -1 | cut -d' ' -f2)"
  if [ "$got" = "$want" ]; then PASS=$((PASS+1)); else echo "  ✗ p1617 bytes differ: $key"; FAIL=$((FAIL+1)); fi
done < "$P1617_DIR/expected"
echo "  $(wc -l < "$P1617_DIR/expected" | tr -d ' ') byte fixtures compared"

# Exit codes are exact here: the helpers above accept any non-zero, so a scanner that always
# failed would satisfy them.
p1617_repo() {
  P1617_R="$(mktemp -d)"; git -C "$P1617_R" init -q; git -C "$P1617_R" config user.email t@example.com; git -C "$P1617_R" config user.name t
  printf 'seed\n' > "$P1617_R/seed"; git -C "$P1617_R" add seed; git -C "$P1617_R" commit -qm seed
}
p1617_commit() { git -C "$P1617_R" add "$1"; git -C "$P1617_R" commit -qm change; }
p1617_scan() { ( cd "$P1617_R" && bash "$AUDIT" HEAD~1..HEAD >/dev/null 2>&1 ); }
p1617_expect() { # label want got
  if [ "$2" = "$3" ]; then echo "  ✓ $1 — exit $3"; PASS=$((PASS+1)); else echo "  ✗ $1 — want exit $2, got $3"; FAIL=$((FAIL+1)); fi
}
P1617_CANARY="CLARITYPLEDGE-CANARY-DO-NOT-MERGE"
p1617_repo; printf 'x\n%s\n' "$P1617_CANARY" > "$P1617_R/f.md"; p1617_commit f.md
rc=0; p1617_scan || rc=$?; p1617_expect "canary in an ordinary file" 1 "$rc"; rm -rf "$P1617_R"
p1617_repo; printf 'scripts/exact.sh\n' > "$P1617_R/.privacy-allowlist"; printf '+++ b/scripts/exact.sh\n%s\n' "$P1617_CANARY" > "$P1617_R/poison.md"; p1617_commit poison.md
rc=0; p1617_scan || rc=$?; p1617_expect "content line shaped like a header grants nothing" 1 "$rc"; rm -rf "$P1617_R"
p1617_repo; printf 'scripts/exact.sh\n' > "$P1617_R/.privacy-allowlist"; printf 'x\r\n%s\r\n' "$P1617_CANARY" > "$P1617_R/crlf.md"; p1617_commit crlf.md
rc=0; p1617_scan || rc=$?; p1617_expect "canary on a CRLF line" 1 "$rc"; rm -rf "$P1617_R"
# A NUL before byte 8000 renders as a binary diff and would test nothing.
p1617_repo; printf 'scripts/exact.sh\n' > "$P1617_R/.privacy-allowlist"; { i=0; while [ $i -lt 5000 ]; do printf 'x\n'; i=$((i+1)); done; printf 'be\000fore %s\n' "$P1617_CANARY"; } > "$P1617_R/nul.md"; p1617_commit nul.md
rc=0; p1617_scan || rc=$?; p1617_expect "canary after a NUL in a text diff" 1 "$rc"; rm -rf "$P1617_R"
p1617_repo; printf 'x\n' > "$P1617_R/clean.md"; printf 'scripts/exact.sh\n' > "$P1617_R/.privacy-allowlist"; p1617_commit clean.md
rc=0; p1617_scan || rc=$?; p1617_expect "clean range" 0 "$rc"; rm -rf "$P1617_R"

# Fail closed. Early end-of-input: the same region with its writer cut short must exit 3.
p1617_region "$AUDIT" > "$P1617_DIR/region.sh"
sed "s/< <(printf '%s\\\\n' \"\$DIFF\")\$/< <(printf '%s\\\\n' \"\$DIFF\" | head -n 2)/" "$P1617_DIR/region.sh" > "$P1617_DIR/region-cut.sh"
if cmp -s "$P1617_DIR/region.sh" "$P1617_DIR/region-cut.sh"; then echo "  ✗ p1617 writer mutation did not apply"; FAIL=$((FAIL+1)); fi
rc=0; p1617_run "$P1617_DIR/region-cut.sh" "$P1617_DIR/order.diff" "$AL" C >/dev/null || rc=$?
p1617_expect "filter input ends early" 3 "$rc"
# Mid-run death: the scan must not report clean. The canary sits after the kill point.
p1617_repo; printf 'scripts/exact.sh\n' > "$P1617_R/.privacy-allowlist"; { i=0; while [ $i -lt 40000 ]; do printf 'line %s\n' "$i"; i=$((i+1)); done; printf '%s\n' "$P1617_CANARY"; } > "$P1617_R/big.md"; p1617_commit big.md
( cd "$P1617_R" && exec bash "$AUDIT" HEAD~1..HEAD >/dev/null 2>&1 ) & P1617_PID=$!
sleep 0.3; kill -TERM "$P1617_PID" 2>/dev/null || true
rc=0; wait "$P1617_PID" || rc=$?
if [ "$rc" != "0" ]; then echo "  ✓ scan killed mid-run — exit $rc"; PASS=$((PASS+1)); else echo "  ✗ scan killed mid-run reported clean"; FAIL=$((FAIL+1)); fi
rm -rf "$P1617_R" "$P1617_DIR"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"
[ "$FAIL" = "0" ]
