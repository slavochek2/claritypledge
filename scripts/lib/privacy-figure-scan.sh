#!/usr/bin/env bash
# privacy-figure-scan.sh — P1526: warn-only matcher for account figures and token shapes.
#
# Incident (2026-10-20): a spec was committed with an account's usage totals and a management
# token's prefix and length. audit-privacy.sh matches only shaped identifiers, so nothing flagged it.
#
# Usage:  privacy_figure_scan < records       (sourced)   or   privacy-figure-scan.sh < records
# Input:  one record per line, `path:lineno:text`  (use `privacy_figure_added_lines` to build it)
# Output: `path:lineno` for each record that matches, NEVER the matched text (the text is the
#         thing being kept out of logs). Exit 0 always: this is advisory, never a gate.
#
# Three matchers, all case-insensitive:
#   A. a usage/billing word within 60 chars of a number carrying a unit (GB MB TB % $ EUR-sign)
#   B. a known token prefix followed by a body of 4+ token chars, or by a length ("40 chars")
#   C. (P1561) a bare number (cents allowed) directly before a cadence/pocket phrase (per|a month/year, /mo, /yr,
#      monthly, yearly, out of pocket) AND a spend word (pay*, cost*, pric*, subscription, plan,
#      bill*, spend*/spent) within 60 chars. Dates, versions and P-numbers never count as the number.
# Perl, not grep: BSD grep has no \b and its bracket expressions behave differently from GNU.

privacy_figure_scan() {
  perl -ne '
    chomp;
    next unless /^([^:]+):(\d+):(.*)$/;
    my ($f, $n, $t) = ($1, $2, $3);
    my $unit = qr/(?:\d[\d.,]*\s*(?:[KMGT]i?B|%)|(?:\$|\xE2\x82\xAC|\b(?:USD|EUR)\s?)\s*\d|\d[\d.,]*\s*(?:USD|EUR|\xE2\x82\xAC))/i;
    my $word = qr/\b(?:egress|bandwidth|usage|quota|logs?|storage|volume|database size|disk|spend|spent|bill(?:ing|ed)?|invoice|cap|budget|credits?)\b/i;
    my $hit = 0;
    $hit = 1 if $t =~ /$word.{0,60}$unit/ || $t =~ /$unit.{0,60}$word/;
    my $pfx = qr/(?:sbp_|github_pat_|ghp_|gho_|ghs_|sb_secret_|sk-ant-)/;
    my $lw = qr/(?:chars?|characters|length|long)/i;
    my $len = qr/(?:\b\d+[- ]?$lw\b|\b$lw\W{0,3}\d+\b)/;
    $hit = 1 if $t =~ /$pfx[A-Za-z0-9_-]{4,}/;
    $hit = 1 if $t =~ /$pfx.{0,60}$len/ || $t =~ /$len.{0,60}$pfx/;
    my $num = qr/(?<![\w.\-:\/])\d[\d,]*(?:\.\d{2})?(?![\d]|[.\-\/]\d)/;
    my $cad = qr/(?:(?:per\s+|a\s+|\/\s?)(?:month|mo|year|yr)\b|\b(?:monthly|yearly)\b|\bout of pocket\b)/i;
    my $sw = qr/\b(?:pay(?:s|ing|ment)?|paid|cost(?:s|ing)?|pric(?:e|ed|ing)|subscription|plan|bill(?:s|ed|ing)?|spen(?:d|ds|ding|t))\b/i;
    my $c = qr/$num\s{0,2}$cad/;
    $hit = 1 if $t =~ /$c/ && ($t =~ /$sw.{0,60}$c/ || $t =~ /$c.{0,60}$sw/);
    print "$f:$n\n" if $hit;
  '
}

# privacy_spend_scan < records   -> `path:lineno` for our OWN measured spend: a nonzero currency
# amount (either order: "EUR 37", "37 EUR", "€37", "$37") within 80 chars of an own-account word
# (measured, billed, billing export, invoice, spent, we pay, out of pocket, balance).
# BLOCKING in pre-commit, unlike privacy_figure_scan. Incident 2026-10-26 (P1565): an agent wrote
# the measured non-prod Gemini bill into a spec; the warn-only matcher missed "EUR 37.04" and the
# figure fanned out into a co-tenant branch before the push-time review saw it, so it could no
# longer be rewritten and the founder had to decide. Narrow on purpose (epistemic.md gate 7c):
# over the 300 prior commits to features/ and docs/ it hit 5 lines, all real leaks, and no
# public price or plan limit. Zero amounts ("$0", "€0") never count.
privacy_spend_scan() {
  perl -ne '
    chomp;
    next unless /^([^:]+):(\d+):(.*)$/;
    my ($f, $n, $t) = ($1, $2, $3);
    my $nz = qr/(?!0(?:\.0+)?(?![\d.]))/;
    my $amt = qr/(?:(?:\$|\xE2\x82\xAC|\b(?:EUR|USD)\s?)$nz\d[\d,]*(?:\.\d+)?|\b$nz\d[\d,]*(?:\.\d+)?\s?(?:EUR|USD|\xE2\x82\xAC)(?![A-Za-z]))/;
    my $own = qr/\b(?:measured|billed|billing (?:export|for)|invoiced?|our bill|the bill|we (?:pay|paid|spend|spent)|spent|out of pocket|actual(?:ly)? (?:spend|cost|bill)|(?:credit|account) balance|credits? (?:left|remaining))\b/i;
    print "$f:$n\n" if $t =~ /$own.{0,80}$amt/ || $t =~ /$amt.{0,80}$own/;
  '
}

# privacy_figure_added_lines <path-prefix>...   -> `path:lineno:text` for lines ADDED in the index.
# Added lines only (the P1526 invariant): existing lines never appear.
privacy_figure_added_lines() {
  git -c core.quotePath=false diff --cached -U0 --no-renames -- "$@" | awk '
    /^\+\+\+ "b\// { file = substr($0, 8); sub(/"$/, "", file); next }
    /^\+\+\+ b\// { file = substr($0, 7); next }
    /^\+\+\+ / { file = ""; next }
    /^@@ / {
      match($0, /\+[0-9]+/); n = substr($0, RSTART + 1, RLENGTH - 1) + 0; next
    }
    /^\+/ { if (file != "") { print file ":" n ":" substr($0, 2) } n++ }
  '
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  privacy_figure_scan
fi
