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
# Two matchers, both case-insensitive:
#   A. a usage/billing word within 60 chars of a number carrying a unit (GB MB TB % $ EUR-sign)
#   B. a known token prefix followed by a body of 4+ token chars, or by a length ("40 chars")
# Perl, not grep: BSD grep has no \b and its bracket expressions behave differently from GNU.

privacy_figure_scan() {
  perl -ne '
    chomp;
    next unless /^([^:]+):(\d+):(.*)$/;
    my ($f, $n, $t) = ($1, $2, $3);
    my $unit = qr/(?:\d[\d.,]*\s*(?:[KMGT]i?B|%)|(?:\$|\xE2\x82\xAC)\s*\d|\d[\d.,]*\s*(?:USD|EUR|\xE2\x82\xAC))/i;
    my $word = qr/\b(?:egress|bandwidth|usage|quota|spend|spent|bill(?:ing|ed)?|invoice|cap|budget|credits?)\b/i;
    my $hit = 0;
    $hit = 1 if $t =~ /$word.{0,60}$unit/ || $t =~ /$unit.{0,60}$word/;
    $hit = 1 if $t =~ /(?:sbp_|github_pat_|ghp_|gho_|sk-ant-)[A-Za-z0-9_-]{4,}/;
    $hit = 1 if $t =~ /(?:sbp_|github_pat_|ghp_|gho_|sk-ant-).{0,60}\b\d+[- ]?(?:char|chars|characters|length|long)\b/i;
    print "$f:$n\n" if $hit;
  '
}

# privacy_figure_added_lines <path-prefix>...   -> `path:lineno:text` for lines ADDED in the index.
# Added lines only (the P1526 invariant): existing lines never appear.
privacy_figure_added_lines() {
  git diff --cached -U0 --no-renames -- "$@" | awk '
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
