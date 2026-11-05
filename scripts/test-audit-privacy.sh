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
    printf "%s" "$ADDED"
    exit ${INPUT_FAIL:+3}' "$1" 2>/dev/null
}
p1617_write() { # name, printf format for the diff
  printf -- "$2" > "$P1617_DIR/$1.diff"
}
H='--- a/x\n+++ b/'
p1617_write order        "${H}plain.md\n@@ -0,0 +1,3 @@\n+one\n+two\n+three\n"
p1617_write cr           "${H}plain.md\n@@ -0,0 +1,2 @@\n+one\r\n+two\r\n"
p1617_write exact        "${H}exact.md\n@@ -0,0 +1 @@\n+dropped\n--- a/y\n+++ b/plain.md\n@@ -0,0 +1 @@\n+kept\n"
p1617_write prefix       "${H}docs/allowed/a.md\n@@ -0,0 +1 @@\n+dropped\n--- a/y\n+++ b/docs/allowedx/a.md\n@@ -0,0 +1 @@\n+kept\n"
p1617_write bak          "${H}exact.md.bak\n@@ -0,0 +1 @@\n+kept\n"
p1617_write comment      "${H}#comment\n@@ -0,0 +1 @@\n+kept\n--- a/y\n+++ b/\n@@ -0,0 +1 @@\n+kept2\n"
p1617_write noeol        "${H}last/entry\n@@ -0,0 +1 @@\n+kept because an unterminated entry is ignored\n"
p1617_write nonutf8      "${H}plain.md\n@@ -0,0 +1 @@\n+caf\377 \303\251 end\n"
p1617_write nul          "${H}plain.md\n@@ -0,0 +1,2 @@\n+be\000fore\n+next\n"
p1617_write numeric      "${H}1e3\n@@ -0,0 +1 @@\n+dropped\n--- a/y\n+++ b/1000\n@@ -0,0 +1 @@\n+kept\n"
p1617_write space        "${H}has space.md\t\n@@ -0,0 +1 @@\n+kept\n"
p1617_write specials     "${H}plain.md\n@@ -0,0 +1,3 @@\n+back\\\\slash \\\\n %%s %%d * ? [a]\n+trailing space \n+\n"
p1617_write glob         "${H}doc*/a.md\n@@ -0,0 +1 @@\n+kept\n--- a/y\n+++ b/gl[o]b.md\n@@ -0,0 +1 @@\n+dropped\n"
p1617_write deleted      "${H}exact.md\n@@ -0,0 +1 @@\n+dropped\n--- a/z\n+++ /dev/null\n@@ -1 +0,0 @@\n-gone\n"
p1617_write allkept0     "${H}exact.md\n@@ -0,0 +1,2 @@\n+dropped\n+dropped2\n"
p1617_write contentline  "${H}plain.md\n@@ -0,0 +1,2 @@\n+++ b/exact.md\n+kept\n"
p1617_write empty        ""
# Cases A and B: the only two fixtures whose output is expected to differ from the frozen filter.
p1617_write mal_a       "${H}plain.md\n@@ -1 +1,2 @@\n--- x\n+++ b/exact.md\n+leak\n"
p1617_write mal_b       "${H}exact.md\n@@ -0,0 +1 @@\n+dropped\n--- a/y\n+++ \"b/q\"\n@@ -0,0 +1 @@\n+leak\n"
AL="$P1617_DIR/al"; printf 'exact.md\ndocs/allowed\n# comment\n\n1e3\ngl[o]b.md\n' > "$AL"
ALN="$P1617_DIR/aln"; printf 'exact.md\nlast/entry' > "$ALN"
ALE="$P1617_DIR/ale"; : > "$ALE"
p1617_cases() {
  for n in order cr exact prefix bak comment nonutf8 nul numeric space specials glob deleted allkept0 contentline empty mal_a mal_b; do echo "$n $AL C"; done
  echo "nonutf8 $AL UTF8"; echo "specials $AL UTF8"
  echo "noeol $ALN C"; echo "exact $ALE C"; echo "exact $P1617_DIR/absent C"
}
P1617_UTF8=C; for _l in en_US.UTF-8 C.UTF-8 C.utf8; do if locale -a 2>/dev/null | grep -qix "$_l"; then P1617_UTF8="$_l"; break; fi; done
[ "$P1617_UTF8" = C ] && echo "  note: no UTF-8 locale here, so the UTF8 fixtures ran under C"
p1617_hashes() { # $1 script copy to cut the region from
  p1617_region "$1" > "$P1617_DIR/region.sh"
  p1617_cases | while read -r n a l; do
    label="$l"; [ "$l" = UTF8 ] && l="$P1617_UTF8"
    al="$(basename "$a")"
    # A crash prints nothing, which would match the fixtures whose expected output is empty.
    rc=0; p1617_run "$P1617_DIR/region.sh" "$P1617_DIR/$n.diff" "$a" "$l" > "$P1617_DIR/out" || rc=$?
    if [ "$rc" != 0 ]; then echo "$n/$al/$label exit-$rc"; else echo "$n/$al/$label $(p1617_sha < "$P1617_DIR/out")"; fi
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
mal_a/al/C bcabd7d2f749574a8c1fd7365615686dd30cb0979ab7bfcfb7329eab51a289d9
mal_b/al/C 433c521af56c39ea864ee25d1de3c00b493c6f87d47c0623020eb9f5727e16ec
EXPECTED
# The last two entries are the only ones that differ from the frozen filter. Their values are the
# hashes of the literal expected text, not of any scanner output (the frozen filter yields empty output
# for both, e3b0c442...). The reason for each is recorded with the change that introduced them.
p1617_hashes "$AUDIT" > "$P1617_DIR/actual"
while read -r key want; do
  got="$(grep -F "$key " "$P1617_DIR/actual" | head -1 | cut -d' ' -f2)"
  if [ "$got" = "$want" ]; then PASS=$((PASS+1)); else echo "  ✗ p1617 bytes differ: $key"; FAIL=$((FAIL+1)); fi
done < "$P1617_DIR/expected"
echo "  $(wc -l < "$P1617_DIR/expected" | tr -d ' ') byte fixtures compared"
# A comparison made only of empty outputs would prove nothing: at least one fixture must come out non-empty.
P1617_EMPTY="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
if grep -v " $P1617_EMPTY\$" "$P1617_DIR/actual" | grep -q 'al/C [0-9a-f]\{64\}$'; then echo "  ✓ at least one fixture yields non-empty filter output"; PASS=$((PASS+1)); else echo "  ✗ every fixture output is empty"; FAIL=$((FAIL+1)); fi

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
p1617_repo; printf 'scripts/exact.sh\n' > "$P1617_R/.privacy-allowlist"; { seq 1 200000; printf '%s\n' "$P1617_CANARY"; } > "$P1617_R/big.md"; p1617_commit big.md
( cd "$P1617_R" && exec bash "$AUDIT" HEAD~1..HEAD >/dev/null 2>&1 ) & P1617_PID=$!
sleep 0.5; kill -TERM "$P1617_PID" 2>/dev/null || true
rc=0; wait "$P1617_PID" || rc=$?
# Exactly 143: the canary alone gives 1 on an unkilled run, so "non-zero" would prove nothing.
p1617_expect "scan killed mid-run" 143 "$rc"
# The filter must run in the scan's own shell. Inside a capture, its death would not end the scan.
if grep -qx '  filter_added_lines' "$P1617_DIR/region.sh" && ! grep -q '[$(][^)]*filter_added_lines' "$P1617_DIR/region.sh"; then echo "  ✓ filter runs outside any capture"; PASS=$((PASS+1)); else echo "  ✗ filter call is not a plain call"; FAIL=$((FAIL+1)); fi

# Hunk-count parsing. Valid input must yield the expected lines; counts that do not match the
# lines present must exit 3 and never resynchronise. Both locales, since the parser must not depend on it.
p1617_write hunk_short  "${H}plain.md\n@@ -0,0 +1,3 @@\n+one\n+two\n"
p1617_write hunk_long   "${H}plain.md\n@@ -0,0 +1 @@\n+one\n+two\n"
p1617_write hunk_junk   "${H}plain.md\n@@ -0,0 +1,2 @@\n+one\njunk\n"
p1617_write hunk_badhdr "${H}plain.md\n@@ -x +1 @@\n+one\n"
p1617_write hunk_stray  "${H}plain.md\n@@ -0,0 +1 @@\n+one\n+two\n--- a/y\n+++ b/exact.md\n@@ -0,0 +1 @@\n+three\n"
p1617_write hunk_omit   "${H}plain.md\n@@ -1 +1 @@\n-old\n+new\n"
p1617_write hunk_nonl   "${H}plain.md\n@@ -1 +1 @@\n-old\n\\\\ No newline at end of file\n+new\n\\\\ No newline at end of file\n"
p1617_write hunk_ctx    "${H}plain.md\n@@ -1,3 +1,3 @@\n same\n-old\n+new\n same2\n"
p1617_write hunk_hdrtext "${H}plain.md\n@@ -0,0 +1,2 @@ context text\n+new\n+newer\n"
p1617_write hunk_hdrbytes "${H}plain.md\n@@ -0,0 +1 @@ \377ctx \303\251\n+new\n"
p1617_write hunk_unknown "${H}plain.md\n+++ b/exact.md\n+kept\n"
p1617_parse() { # label file want_rc want_text
  local got rc=0 loc
  for loc in C "$P1617_UTF8"; do
    rc=0; got="$(p1617_run "$P1617_DIR/region.sh" "$P1617_DIR/$2.diff" "$AL" "$loc")" || rc=$?
    if [ "$rc" = "$3" ] && [ "$got" = "$4" ]; then echo "  ✓ $1 ($loc) — exit $rc"; PASS=$((PASS+1)); else echo "  ✗ $1 ($loc) — want exit $3, got $rc"; FAIL=$((FAIL+1)); fi
  done
}
p1617_parse "malformed input: counts, short"        hunk_short 3 "+one
+two"
p1617_parse "malformed input: counts, long"         hunk_long 3 "+one"
p1617_parse "malformed input: counts, stray line"    hunk_junk 3 "+one"
p1617_parse "malformed input: counts, header"            hunk_badhdr 3 ""
p1617_parse "malformed input: counts, trailing" hunk_stray 3 "+one"
p1617_parse "hunk counts: omitted counts mean one"                hunk_omit 0 "+new"
p1617_parse "hunk counts: no-newline marker is not counted"       hunk_nonl 0 "+new"
p1617_parse "hunk counts: context lines are counted"              hunk_ctx 0 "+new"
p1617_parse "hunk counts: text after the header is ignored"       hunk_hdrtext 0 "+new
+newer"
p1617_parse "hunk counts: invalid bytes after the header are ignored" hunk_hdrbytes 0 "+new"
p1617_parse "malformed input: counts, position"  hunk_unknown 3 ""
rm -rf "$P1617_R" "$P1617_DIR"

echo ""
echo "=== malformed input ==="
MI_DIR="$(mktemp -d)"
MI_CANARY="CLARITYPLEDGE-CANARY-DO-NOT-MERGE"
MI_LOCS="C"; if [ "$P1617_UTF8" != C ]; then MI_LOCS="C $P1617_UTF8"; fi
MI_ENV=""; MI_LOC=""
mi_repo() {
  MI_R="$(mktemp -d "$MI_DIR/r.XXXXXX")"
  git -C "$MI_R" init -q
  git -C "$MI_R" config user.email t@example.com
  git -C "$MI_R" config user.name t
  git -C "$MI_R" config commit.gpgsign false
  printf 'seed\n' > "$MI_R/seed"
  git -C "$MI_R" add seed
  git -C "$MI_R" commit -qm seed
}
mi_fixtures() { # private names, literals and an email allowlist inside the throwaway repo
  mkdir -p "$MI_R/.private/docs"
  printf 'Zorblat Quenwick\n' > "$MI_R/.private/docs/privacy-names.txt"
  printf 'LIT-7Q3X-FIXTURE\n' > "$MI_R/.private/docs/privacy-literals.txt"
  printf 'example.com\n' > "$MI_R/.privacy-email-allowlist"
}
mi_commit() { git -C "$MI_R" add -- "$@"; git -C "$MI_R" commit -qm change; }
mi_run() { # scanner args; sets MI_RC and MI_OUT
  MI_RC=0
  MI_OUT="$(cd "$MI_R/${MI_SUB:-}" && env ${MI_LOC:+LC_ALL=$MI_LOC} ${MI_ENV:+PATH=$MI_DIR/stub:$PATH $MI_ENV} bash "$AUDIT" "$@" 2>&1)" || MI_RC=$?
}
mi_expect() { # label want
  if [ "$MI_RC" = "$2" ]; then echo "  ✓ $1 — exit $MI_RC"; PASS=$((PASS+1)); else echo "  ✗ $1 — want exit $2, got $MI_RC"; FAIL=$((FAIL+1)); fi
}
# Range and staged variants of one fixture: $1 label, $2 want, $3 function that builds the repo content
# (leaves the last change uncommitted-staged when the second argument to it is "staged").
mi_both() {
  local label="$1" want="$2" build="$3"
  mi_repo; "$build" range; mi_run HEAD~1..HEAD; mi_expect "$label: range" "$want"
  mi_repo; "$build" staged; mi_run --staged; mi_expect "$label: staged" "$want"
}
mi_finish() { if [ "$1" = range ]; then git -C "$MI_R" commit -qm change; fi; }

# --- case A
build_a() {
  printf 'docs/allowed.md\n' > "$MI_R/.privacy-allowlist"
  printf -- '-- x\n' > "$MI_R/f.md"; git -C "$MI_R" add f.md; git -C "$MI_R" commit -qm base
  printf '++ b/docs/allowed.md\n%s\n' "$MI_CANARY" > "$MI_R/f.md"; git -C "$MI_R" add f.md; mi_finish "$1"
}
build_a_ctl_allowed() {
  printf 'docs/allowed.md\n' > "$MI_R/.privacy-allowlist"
  mkdir -p "$MI_R/docs"; printf '%s\n' "$MI_CANARY" > "$MI_R/docs/allowed.md"; git -C "$MI_R" add docs/allowed.md; mi_finish "$1"
}
build_a_ctl_plain() {
  printf 'docs/allowed.md\n' > "$MI_R/.privacy-allowlist"
  mkdir -p "$MI_R/docs"; printf '%s\n' "$MI_CANARY" > "$MI_R/docs/plain.md"; git -C "$MI_R" add docs/plain.md; mi_finish "$1"
}
mi_both "malformed input, case A" 1 build_a
mi_both "control: allowlisted file with the canary, well-formed input" 0 build_a_ctl_allowed
mi_both "control: plain file with the canary" 1 build_a_ctl_plain

# --- case B
build_b() {
  printf 'docs/allowed.md\n' > "$MI_R/.privacy-allowlist"
  mkdir -p "$MI_R/docs"
  printf '%s\n' "$MI_CANARY" > "$MI_R/docs/allowed.md"
  printf '%s\n' "$MI_CANARY" > "$MI_R/docs/$(printf '\303\251').md"
  git -C "$MI_R" add docs; mi_finish "$1"
}
build_b_tab() {
  printf 'docs/allowed.md\n' > "$MI_R/.privacy-allowlist"
  mkdir -p "$MI_R/docs"
  printf '%s\n' "$MI_CANARY" > "$MI_R/docs/allowed.md"
  printf '%s\n' "$MI_CANARY" > "$MI_R/docs/zz$(printf '\t')x.md"
  git -C "$MI_R" add docs; mi_finish "$1"
}
build_b_ctl() { # non-ASCII name outside the allowlist, clean content
  printf 'docs/allowed.md\n' > "$MI_R/.privacy-allowlist"
  mkdir -p "$MI_R/docs"
  printf 'clean\n' > "$MI_R/docs/$(printf '\303\251').md"
  git -C "$MI_R" add docs; mi_finish "$1"
}
mi_both "malformed input, case B" 1 build_b
mi_both "malformed input, case B, variant 2" 1 build_b_tab
mi_both "control: non-ASCII file name, clean content" 0 build_b_ctl

# --- cases C and K
mi_payload() { # check position; sets MI_TEXT
  local t
  case "$1" in
    hard) t="$MI_CANARY";; name) t='Zorblat Quenwick';; literal) t='LIT-7Q3X-FIXTURE';;
    email) t='stranger@notlisted.invalid';; phone) t='+990 1234 5678';; none) t='';;
  esac
  case "$2" in
    before) MI_TEXT="$(printf 'a\377b\n%s' "$t")";;
    same)   MI_TEXT="$(printf '\377%s\376' "$t")";;
  esac
}
mi_mode_run() { # label want mode text
  local label="$1" want="$2" mode="$3" text="$4"
  mi_repo; mi_fixtures
  case "$mode" in
    range)    printf '%s\n' "$text" > "$MI_R/n.md"; mi_commit n.md; mi_run HEAD~1..HEAD;;
    staged)   printf '%s\n' "$text" > "$MI_R/n.md"; git -C "$MI_R" add n.md; mi_run --staged;;
    msg)      printf '%s\n' "$text" > "$MI_R/msg.txt"; mi_run --msg msg.txt;;
    rangemsg) printf '%s\n' "$text" > "$MI_R/m.txt"; git -C "$MI_R" commit -q --allow-empty -F m.txt 2>/dev/null; mi_run HEAD~1..HEAD;;
  esac
  mi_expect "$label ($mode, locale $MI_LOC)" "$want"
}
for MI_LOC in $MI_LOCS; do
  for _chk in hard name literal email phone; do
    case "$_chk" in name) _case=K;; *) _case=C;; esac
    for _pos in before same; do
      mi_payload "$_chk" "$_pos"
      for _mode in range staged msg; do
        mi_mode_run "malformed input, case $_case: $_chk, $_pos" 1 "$_mode" "$MI_TEXT"
      done
    done
  done
  # Git re-encodes a commit message when it prints it; this exercises the message path of range mode.
  for _chk in hard name; do
    mi_payload "$_chk" before
    mi_mode_run "message path: $_chk" 1 rangemsg "$MI_TEXT"
  done
  mi_payload none before
  for _mode in range staged msg; do
    mi_mode_run "control: invalid bytes only" 0 "$_mode" "$MI_TEXT"
  done
done
MI_LOC=""

# --- case D
mkdir -p "$MI_DIR/stub"
MI_REAL_GIT="$(command -v git)"; MI_REAL_TR="$(command -v tr)"; MI_REAL_GREP="$(command -v grep)"
for _t in git tr grep; do
  case "$_t" in git) _real="$MI_REAL_GIT";; tr) _real="$MI_REAL_TR";; grep) _real="$MI_REAL_GREP";; esac
  cat > "$MI_DIR/stub/$_t" <<STUBEOF
#!/bin/bash
if [ "\${STUB_TOOL:-}" = "$_t" ] && [ -n "\${STUB_MATCH:-}" ]; then
  case " \$* " in
    *"\$STUB_MATCH"*)
      if [ "\$STUB_TOOL" = grep ]; then exit 2; fi
      if [ "\${STUB_WHEN:-before}" = after ]; then "$_real" "\$@" | head -n 3; fi
      exit 1;;
  esac
fi
exec "$_real" "\$@"
STUBEOF
  chmod +x "$MI_DIR/stub/$_t"
done
build_d() { # a range with a text file and a binary file
  printf 'docs/allowed.md\n' > "$MI_R/.privacy-allowlist"
  mkdir -p "$MI_R/docs"
  printf 'text one\ntext two\ntext three\ntext four\n' > "$MI_R/docs/t.md"
  printf 'bin\000ary data here\n' > "$MI_R/docs/b.dat"
  git -C "$MI_R" add docs; mi_finish "$1"
}
mi_d_case() { # label tool match mode(range|staged|msg) when
  mi_repo; mi_fixtures
  case "$4" in
    range)  build_d range; MI_ENV="STUB_TOOL=$2 STUB_MATCH=$3 STUB_WHEN=$5"; mi_run HEAD~1..HEAD;;
    staged) build_d staged; MI_ENV="STUB_TOOL=$2 STUB_MATCH=$3 STUB_WHEN=$5"; mi_run --staged;;
    msg)    printf 'a\nb\nc\nd\n' > "$MI_R/msg.txt"; MI_ENV="STUB_TOOL=$2 STUB_MATCH=$3 STUB_WHEN=$5"; mi_run --msg msg.txt;;
  esac
  MI_ENV=""
  mi_expect "malformed input, case D: $1 ($4, $5)" 3
}
for _when in before after; do
  mi_d_case "paths step"    git --name-only range  "$_when"
  mi_d_case "patch step"    git --src-prefix range "$_when"
  mi_d_case "message step"  git --format=%B range  "$_when"
  mi_d_case "author step"   git %an range          "$_when"
  mi_d_case "blob step"     git cat-file range     "$_when"
  mi_d_case "paths step"    git --name-only staged "$_when"
  mi_d_case "patch step"    git --src-prefix staged "$_when"
  mi_d_case "blob step"     git cat-file staged    "$_when"
  mi_d_case "message read"  tr '\000' msg         "$_when"
done
# Hits found by the steps that did finish are still printed when another step failed.
mi_repo; mi_fixtures
printf '%s\n' "$MI_CANARY" > "$MI_R/c.md"; mi_commit c.md
MI_ENV="STUB_TOOL=git STUB_MATCH=%an STUB_WHEN=before"; mi_run HEAD~1..HEAD; MI_ENV=""
mi_expect "malformed input, case D: failure with a hit present" 3
case "$MI_OUT" in *"$MI_CANARY"*) echo "  ✓ the hit is still printed"; PASS=$((PASS+1));; *) echo "  ✗ the hit was not printed"; FAIL=$((FAIL+1));; esac
# Matching-tool error: a scan that could not run its matcher must not report clean.
mi_repo; mi_fixtures
printf '%s\n' "$MI_CANARY" > "$MI_R/c.md"; git -C "$MI_R" add c.md
MI_ENV="STUB_TOOL=grep STUB_MATCH=CANARY"; mi_run --staged; MI_ENV=""
mi_expect "matching tool failure fails closed" 3
mi_run --staged; mi_expect "control: same input, matcher healthy" 1

# --- case E
mi_merge_setup() { # leaves the main branch checked out, side branch merged with --no-commit
  MI_MAIN="$(git -C "$MI_R" rev-parse --abbrev-ref HEAD)"
  printf 'shared\n' > "$MI_R/shared.md"; git -C "$MI_R" add shared.md; git -C "$MI_R" commit -qm base
  MI_BASE="$(git -C "$MI_R" rev-parse HEAD)"
  git -C "$MI_R" checkout -q -b side
  printf 'side\n' > "$MI_R/side.md"; git -C "$MI_R" add side.md; git -C "$MI_R" commit -qm side
  git -C "$MI_R" checkout -q "$MI_MAIN"
  printf 'main\n' > "$MI_R/main.md"; git -C "$MI_R" add main.md; git -C "$MI_R" commit -qm main
  git -C "$MI_R" merge -q --no-ff --no-commit side >/dev/null 2>&1
}
mi_repo; mi_merge_setup
printf '%s\n' "$MI_CANARY" > "$MI_R/evil.md"; git -C "$MI_R" add evil.md; git -C "$MI_R" commit -qm merge
mi_run "$MI_BASE..HEAD"; mi_expect "malformed input, case E, variant 1" 1
mi_repo; mi_merge_setup
printf 'shared\n%s\n' "$MI_CANARY" > "$MI_R/shared.md"; git -C "$MI_R" add shared.md; git -C "$MI_R" commit -qm merge
mi_run "$MI_BASE..HEAD"; mi_expect "malformed input, case E, variant 2" 1
mi_repo; mi_merge_setup; git -C "$MI_R" commit -qm merge
mi_run "$MI_BASE..HEAD"; mi_expect "control: clean merge" 0
mi_repo; printf 'docs/allowed.md\n' > "$MI_R/.privacy-allowlist"
MI_MAIN="$(git -C "$MI_R" rev-parse --abbrev-ref HEAD)"; MI_BASE="$(git -C "$MI_R" rev-parse HEAD)"
git -C "$MI_R" checkout -q -b side; mkdir -p "$MI_R/docs"; printf '%s\n' "$MI_CANARY" > "$MI_R/docs/allowed.md"
git -C "$MI_R" add docs; git -C "$MI_R" commit -qm side; git -C "$MI_R" checkout -q "$MI_MAIN"
printf 'main\n' > "$MI_R/main.md"; git -C "$MI_R" add main.md; git -C "$MI_R" commit -qm main
git -C "$MI_R" merge -q --no-ff -m merge side >/dev/null 2>&1
mi_run "$MI_BASE..HEAD"; mi_expect "control: merge carrying an allowlisted file" 0

# --- case F
build_f_nul() { printf 'bin\000 %s\n' "$MI_CANARY" > "$MI_R/b.dat"; git -C "$MI_R" add b.dat; mi_finish "$1"; }
build_f_attr() {
  printf '*.md -diff\n' > "$MI_R/.gitattributes"
  printf '%s\n' "$MI_CANARY" > "$MI_R/x.md"; git -C "$MI_R" add .gitattributes x.md; mi_finish "$1"
}
build_f_attr2() {
  printf '*.txt binary\n' > "$MI_R/.gitattributes"
  printf '%s\n' "$MI_CANARY" > "$MI_R/x.txt"; git -C "$MI_R" add .gitattributes x.txt; mi_finish "$1"
}
build_f_ctl_allowed() {
  printf 'allowed.dat\n' > "$MI_R/.privacy-allowlist"
  printf 'bin\000 %s\n' "$MI_CANARY" > "$MI_R/allowed.dat"; git -C "$MI_R" add allowed.dat; mi_finish "$1"
}
build_f_ctl_clean() { # random-looking bytes with phone-shaped digits: not a finding
  printf '\000\001\002 +990 1234 5678 \003\377\376 (415) 555-2671 \000' > "$MI_R/c.dat"; git -C "$MI_R" add c.dat; mi_finish "$1"
}
mi_both "malformed input, case F, variant 1" 1 build_f_nul
mi_both "malformed input, case F, variant 2" 1 build_f_attr
mi_both "malformed input, case F, variant 3" 1 build_f_attr2
mi_both "control: allowlisted binary with the canary" 0 build_f_ctl_allowed
mi_both "control: binary without a finding" 0 build_f_ctl_clean

# --- case G
build_g() {
  printf '%s\n' "$MI_CANARY" > "$MI_R/notes.lock"; mkdir -p "$MI_R/sub"; printf '%s\n' "$MI_CANARY" > "$MI_R/sub/other.lock"
  git -C "$MI_R" add notes.lock sub; mi_finish "$1"
}
build_g_ctl() { # the two lockfile names actually tracked stay excluded, at any depth
  mkdir -p "$MI_R/sub"
  for f in package-lock.json deno.lock sub/package-lock.json sub/deno.lock; do printf '%s\n' "$MI_CANARY" > "$MI_R/$f"; done
  git -C "$MI_R" add package-lock.json deno.lock sub; mi_finish "$1"
}
mi_both "malformed input, case G" 1 build_g
mi_both "control: two lockfile names excluded" 0 build_g_ctl

# --- case H
build_h() { printf '++ %s\n' "$MI_CANARY" > "$MI_R/h.md"; git -C "$MI_R" add h.md; mi_finish "$1"; }
mi_both "malformed input, case H" 1 build_h

# --- case I
mi_repo; printf '%s\n' "$MI_CANARY" > "$MI_R/i.md"; git -C "$MI_R" add i.md
git -C "$MI_R" config diff.external "$(command -v true)"
mi_run --staged; mi_expect "malformed input, case I, variant 1" 1
mi_repo; printf 'docs/allowed.md\n' > "$MI_R/.privacy-allowlist"; mkdir -p "$MI_R/docs"
printf '%s\n' "$MI_CANARY" > "$MI_R/docs/allowed.md"; git -C "$MI_R" add docs
git -C "$MI_R" config diff.noprefix true
mi_run --staged; mi_expect "malformed input, case I, variant 2" 0
git -C "$MI_R" commit -qm change; git -C "$MI_R" config diff.noprefix false; git -C "$MI_R" config diff.mnemonicPrefix true
printf '%s\n' "$MI_CANARY" >> "$MI_R/docs/allowed.md"; git -C "$MI_R" add docs; mi_run --staged
mi_expect "malformed input, case I, variant 3" 0
git -C "$MI_R" commit -qm change2; git -C "$MI_R" config diff.mnemonicPrefix false; git -C "$MI_R" config diff.noprefix true
printf '%s\n' "$MI_CANARY" >> "$MI_R/docs/allowed.md"; git -C "$MI_R" add docs; git -C "$MI_R" commit -qm change3
mi_run HEAD~1..HEAD; mi_expect "malformed input, case I, variant 4" 0
mi_repo; printf 'x\n' > "$MI_R/s.md"; git -C "$MI_R" add s.md; git -C "$MI_R" config diff.suppressBlankEmpty true
printf 'x\n\ny\n' > "$MI_R/s.md"; git -C "$MI_R" commit -qam c1; printf 'x\n\ny\nz\n' > "$MI_R/s.md"; git -C "$MI_R" commit -qam c2
mi_run HEAD~1..HEAD; mi_expect "malformed input, case I, variant 5" 0

# --- case J
for _f in AUTHOR_NAME AUTHOR_EMAIL COMMITTER_NAME COMMITTER_EMAIL; do
  mi_repo; mi_fixtures
  case "$_f" in *EMAIL) _v="${MI_CANARY}@example.com";; *) _v="$MI_CANARY";; esac
  printf 'clean\n' > "$MI_R/j.md"; git -C "$MI_R" add j.md
  env "GIT_$_f=$_v" git -C "$MI_R" commit -qm change
  mi_run HEAD~1..HEAD; mi_expect "malformed input, case J: $_f" 1
done
mi_repo; mi_fixtures; printf 'clean\n' > "$MI_R/j.md"; mi_commit j.md
mi_run HEAD~1..HEAD; mi_expect "control: ordinary author and committer" 0

# --- gate 7c: workflows the tool already supports must still pass clean
mi_repo; mi_fixtures
printf 'docs/allowed.md\n' > "$MI_R/.privacy-allowlist"
mkdir -p "$MI_R/docs"
printf 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n' > "$MI_R/docs/old.md"
printf 'to delete\n' > "$MI_R/docs/gone.md"
git -C "$MI_R" add docs; git -C "$MI_R" commit -qm base
git -C "$MI_R" mv docs/old.md docs/renamed.md
printf 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\n' > "$MI_R/docs/renamed.md"
git -C "$MI_R" rm -q docs/gone.md
printf '\000\001binary\002\003 payload\000' > "$MI_R/docs/blob.bin"
printf 'clean text\n' > "$MI_R/docs/$(printf 'caf\303\251').md"
git -C "$MI_R" add docs
mi_run --staged; mi_expect "clean workflow: rename, deletion, binary, non-ASCII name, staged" 0
git -C "$MI_R" commit -qm "clean change"
mi_run HEAD~1..HEAD; mi_expect "clean workflow: same change, range" 0
printf 'a clean message\n' > "$MI_R/msg.txt"; mi_run --msg msg.txt; mi_expect "clean workflow: message file" 0

# --- scan range computation: the workflow step's function, executed
RANGE_LIB="$(git rev-parse --show-toplevel)/scripts/lib/privacy-scan-range.sh"
mi_range_case() { # label want args(event before after pr_base pr_head ref)
  local label="$1" want="$2" got; shift 2
  got="$(cd "$MI_R" && bash -c '. "$0" && privacy_scan_range "$@"' "$RANGE_LIB" "$@" 2>&1)" || true
  if [ "$got" = "$want" ]; then echo "  ✓ $label"; PASS=$((PASS+1)); else echo "  ✗ $label (got '$got', want '$want')"; FAIL=$((FAIL+1)); fi
}
mi_repo
git -C "$MI_R" update-ref refs/remotes/origin/main HEAD
MI_RB="$(git -C "$MI_R" rev-parse HEAD)"
echo one > "$MI_R/f1"; git -C "$MI_R" add f1; git -C "$MI_R" commit -qm c1; MI_R1="$(git -C "$MI_R" rev-parse HEAD)"
echo two > "$MI_R/f2"; git -C "$MI_R" add f2; git -C "$MI_R" commit -qm c2; MI_R2="$(git -C "$MI_R" rev-parse HEAD)"
MI_Z=0000000000000000000000000000000000000000
mi_range_case "range: branch push is scanned against the trusted base" "origin/main..$MI_R2" push "$MI_R1" "$MI_R2" "" "" refs/heads/topic
mi_range_case "range: new branch push" "origin/main..$MI_R2" push "$MI_Z" "$MI_R2" "" "" refs/heads/topic
mi_range_case "range: branch push, previous tip unknown locally" "origin/main..$MI_R2" push 1111111111111111111111111111111111111111 "$MI_R2" "" "" refs/heads/topic
mi_range_case "range: main push keeps the pushed range" "$MI_R1..$MI_R2" push "$MI_R1" "$MI_R2" "" "" refs/heads/main
mi_range_case "range: main push with unknown previous tip" "origin/main..$MI_R2" push 1111111111111111111111111111111111111111 "$MI_R2" "" "" refs/heads/main
mi_range_case "range: branch delete is skipped" "SKIP" push "$MI_R1" "$MI_Z" "" "" refs/heads/topic
mi_range_case "range: pull request" "$MI_RB..$MI_R2" pull_request "" "" "$MI_RB" "$MI_R2" ""

# --- private literals: Unicode case folding and the error policy
for MI_LOC in $MI_LOCS; do
  mi_repo; mkdir -p "$MI_R/.private/docs"
  printf 'caf\303\251\n' > "$MI_R/.private/docs/privacy-literals.txt"
  printf 'CAF\303\211 menu\n' > "$MI_R/n.md"; git -C "$MI_R" add n.md; mi_run --staged
  if [ "$P1617_UTF8" = C ]; then echo "  - literal case folding skipped: no UTF-8 locale here"; else mi_expect "private literal: accented, uppercase content (locale $MI_LOC)" 1; fi
done
MI_LOC=""
mi_repo; mi_fixtures; printf 'LIT-7Q3X-FIXTURE\n' > "$MI_R/n.md"; git -C "$MI_R" add n.md
MI_ENV="STUB_TOOL=grep STUB_MATCH=privacy-literals"; mi_run --staged; MI_ENV=""; mi_expect "private literal: file load failure fails closed" 3
MI_ENV="STUB_TOOL=grep STUB_MATCH=LIT-7Q3X"; mi_run --staged; MI_ENV=""; mi_expect "private literal: matcher failure fails closed" 3

# --- case R: moves
build_r_out() { # out of an allowlisted path
  printf 'docs/allowed.md\n' > "$MI_R/.privacy-allowlist"; mkdir -p "$MI_R/docs"
  printf 'line one\nline two\nline three\n%s\n' "$MI_CANARY" > "$MI_R/docs/allowed.md"; git -C "$MI_R" add docs; git -C "$MI_R" commit -qm base
  git -C "$MI_R" mv docs/allowed.md docs/moved.md; mi_finish "$1"
}
build_r_out_bin() {
  printf 'allowed.dat\n' > "$MI_R/.privacy-allowlist"
  printf 'bin\000 %s \001\n' "$MI_CANARY" > "$MI_R/allowed.dat"; git -C "$MI_R" add allowed.dat; git -C "$MI_R" commit -qm base
  git -C "$MI_R" mv allowed.dat moved.dat; mi_finish "$1"
}
build_r_in() { # into an allowlisted path
  printf 'docs/allowed.md\n' > "$MI_R/.privacy-allowlist"; mkdir -p "$MI_R/docs"
  printf 'line one\nline two\nline three\n%s\n' "$MI_CANARY" > "$MI_R/docs/plain.md"; git -C "$MI_R" add docs; git -C "$MI_R" commit -qm base
  git -C "$MI_R" mv docs/plain.md docs/allowed.md; mi_finish "$1"
}
mi_both "malformed input, case R, variant 1" 1 build_r_out
mi_both "malformed input, case R, variant 2" 1 build_r_out_bin
mi_both "control: move into an allowlisted path" 0 build_r_in

# --- case S: scanning from a subdirectory
build_s() {
  mkdir -p "$MI_R/sub"; echo ok > "$MI_R/sub/a.md"; printf '%s\n' "$MI_CANARY" > "$MI_R/top.md"
  git -C "$MI_R" config diff.relative true; git -C "$MI_R" add sub top.md; mi_finish "$1"
}
MI_SUB=sub; mi_both "malformed input, case S" 1 build_s; MI_SUB=""

# --- case T: a merge that discards a side branch still publishes its commits
mi_repo; MI_MAIN="$(git -C "$MI_R" rev-parse --abbrev-ref HEAD)"; MI_BASE="$(git -C "$MI_R" rev-parse HEAD)"
git -C "$MI_R" checkout -q -b side; printf '%s\n' "$MI_CANARY" > "$MI_R/side.md"; git -C "$MI_R" add side.md; git -C "$MI_R" commit -qm side
git -C "$MI_R" checkout -q "$MI_MAIN"; echo m > "$MI_R/m.md"; git -C "$MI_R" add m.md; git -C "$MI_R" commit -qm main
git -C "$MI_R" merge -q -s ours --no-edit side >/dev/null 2>&1
mi_run "$MI_BASE..HEAD"; mi_expect "malformed input, case T" 1

# --- binary strings
build_b16() { perl -e 'print "\000\001\002", join("\000", split //, $ARGV[0]), "\000\003"' "$MI_CANARY" > "$MI_R/u16.dat"; git -C "$MI_R" add u16.dat; mi_finish "$1"; }
build_bname() { printf '\000\001 Zorblat Quenwick \002\000' > "$MI_R/n.dat"; git -C "$MI_R" add n.dat; mi_finish "$1"; }
build_blarge() { perl -e 'srand(4); print join("", map { chr(int(rand(256))) } 1..10485760)' > "$MI_R/big.dat"; git -C "$MI_R" add big.dat; mi_finish "$1"; }
for _m in range staged; do
  mi_repo; mi_fixtures; build_b16 "$_m"; if [ "$_m" = range ]; then mi_run HEAD~1..HEAD; else mi_run --staged; fi; mi_expect "malformed input, case F, variant 4 ($_m)" 1
  mi_repo; mi_fixtures; build_bname "$_m"; if [ "$_m" = range ]; then mi_run HEAD~1..HEAD; else mi_run --staged; fi; mi_expect "name with a space in a binary ($_m)" 1
done
mi_repo; mi_fixtures; build_blarge range; mi_run HEAD~1..HEAD; mi_expect "control: 10 MB of random bytes" 0

# --- callers: the real pre-commit and pre-push code, with a stub scanner
mi_caller_repo() { # stub exit code
  MI_C="$(mktemp -d "$MI_DIR/c.XXXXXX")"
  git -C "$MI_C" init -q; git -C "$MI_C" config user.email t@example.com; git -C "$MI_C" config user.name t
  cp -a "$(git rev-parse --show-toplevel)/scripts" "$MI_C/scripts"
  printf '#!/bin/bash\necho "audit-privacy: stub"\nexit %s\n' "$1" > "$MI_C/scripts/audit-privacy.sh"; chmod +x "$MI_C/scripts/audit-privacy.sh"
  echo seed > "$MI_C/seed"; git -C "$MI_C" add seed; git -C "$MI_C" commit -qm seed
  echo x > "$MI_C/x.txt"; git -C "$MI_C" add x.txt
}
mi_pc() { # stub exit, override(0|1); prints "errors=N scanfail=Y|N proceeding=Y|N"
  mi_caller_repo "$1"
  local out n sf pr
  out="$(cd "$MI_C" && env ${2:+CP_ALLOW_PII_COMMIT=1} bash scripts/pre-commit-checks.sh 2>&1)" || true
  n="$(printf '%s' "$out" | grep -ao '[0-9]* error(s)' | head -1 | tr -cd 0-9)"; [ -n "$n" ] || n=0
  case "$out" in *"could not read its input"*) sf=Y;; *) sf=N;; esac
  case "$out" in *"proceeding (WARN)"*) pr=Y;; *) pr=N;; esac
  echo "errors=$n scanfail=$sf proceeding=$pr"
}
mi_got="$(mi_pc 3 "")"; mi_got_ov="$(mi_pc 3 1)"; mi_got_f="$(mi_pc 1 "")"; mi_got_f_ov="$(mi_pc 1 1)"
case "$mi_got" in *"scanfail=Y proceeding=N"*) echo "  ✓ pre-commit: exit 3 names a scan failure"; PASS=$((PASS+1));; *) echo "  ✗ pre-commit: exit 3 output ($mi_got)"; FAIL=$((FAIL+1));; esac
case "$mi_got_ov" in *"scanfail=Y proceeding=N"*) echo "  ✓ pre-commit: the override does not apply to exit 3"; PASS=$((PASS+1));; *) echo "  ✗ pre-commit: override with exit 3 ($mi_got_ov)"; FAIL=$((FAIL+1));; esac
case "$mi_got_f_ov" in *"scanfail=N proceeding=Y"*) echo "  ✓ control: the override still applies to exit 1"; PASS=$((PASS+1));; *) echo "  ✗ control: override with exit 1 ($mi_got_f_ov)"; FAIL=$((FAIL+1));; esac
mi_ec() { v="${1#errors=}"; echo "${v%% *}"; }
if [ "$(mi_ec "$mi_got_ov")" = "$(mi_ec "$mi_got")" ] && [ "$(mi_ec "$mi_got_f_ov")" -lt "$(mi_ec "$mi_got_f")" ]; then echo "  ✓ pre-commit: error counts differ only when the override applies"; PASS=$((PASS+1)); else echo "  ✗ pre-commit error counts ($mi_got / $mi_got_ov / $mi_got_f / $mi_got_f_ov)"; FAIL=$((FAIL+1)); fi
for _rc in 3 1 0; do
  mi_caller_repo "$_rc"
  echo y > "$MI_C/y.txt"; git -C "$MI_C" add y.txt; git -C "$MI_C" commit -qm y
  _a="$(git -C "$MI_C" rev-parse HEAD~1)"; _b="$(git -C "$MI_C" rev-parse HEAD)"
  _out="$(cd "$MI_C" && printf 'refs/heads/main %s refs/heads/main %s\n' "$_b" "$_a" | bash scripts/pre-push-checks.sh origin 2>&1)" || true
  case "$_rc:$_out" in
    3:*"could not read its input"*) echo "  ✓ pre-push: exit 3 reported as a scan failure"; PASS=$((PASS+1));;
    1:*"personal identifiers in range"*) echo "  ✓ pre-push: exit 1 reported as a finding"; PASS=$((PASS+1));;
    0:*"could not read its input"*|0:*"personal identifiers in range"*) echo "  ✗ pre-push: exit 0 reported as a scan problem"; FAIL=$((FAIL+1));;
    0:*) echo "  ✓ pre-push: exit 0 not reported as a scan problem"; PASS=$((PASS+1));;
    *) echo "  ✗ pre-push: exit $_rc output unexpected"; FAIL=$((FAIL+1));;
  esac
done
rm -rf "$MI_DIR"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"
[ "$FAIL" = "0" ]
