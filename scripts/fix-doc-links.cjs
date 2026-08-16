#!/usr/bin/env node

/**
 * Repair dead relative markdown links whose target file still exists elsewhere.
 *
 * Why this exists (2026-08-15): specs move from features/<pN>.md into
 * features/done/<date>/<pN>.md when they close (git-ops.sh ship), and nothing
 * rewrites the links pointing at them. A repo-wide scan found 1,474 dead
 * relative links, the large majority of which name a file that still exists at
 * a different path. Those are mechanically repairable; this does that.
 *
 * It is deliberately conservative:
 *   - Only rewrites when the basename resolves to EXACTLY ONE file in the repo.
 *     Ambiguous (2+ candidates) and genuinely-missing (0 candidates) targets are
 *     reported and left alone — guessing would be worse than a dead link.
 *   - Preserves any #anchor / ?query suffix on the original link.
 *   - Dry-run by default. Nothing is written without --apply.
 *
 * Usage:
 *   ./scripts/fix-doc-links.cjs               # dry run: show what would change
 *   ./scripts/fix-doc-links.cjs --apply       # write the repairs
 *   ./scripts/fix-doc-links.cjs --verbose     # include unrepairable links
 *   ./scripts/fix-doc-links.cjs --files a.md  # limit to specific files
 *
 * Exit codes:
 *   0 - Ran successfully (dry run or apply)
 *   1 - Unexpected error
 */

const fs = require('fs');
const path = require('path');

const {
  REPO_ROOT,
  allMarkdownFiles,
  trackedFiles,
  extractLinks,
  isSkippableTarget,
  toFsPath,
  targetResolves
} = require('./validate-doc-links.cjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const VERBOSE = args.includes('--verbose');
const SHOW_HELP = args.includes('--help') || args.includes('-h');

const RED = '\x1b[0;31m';
const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[1;33m';
const BLUE = '\x1b[0;34m';
const NC = '\x1b[0m';

if (SHOW_HELP) {
  console.log(`
${BLUE}Fix Doc Links${NC} : rewrite dead links whose target moved

${YELLOW}Usage:${NC}
  ./scripts/fix-doc-links.cjs               Dry run, show proposed rewrites
  ./scripts/fix-doc-links.cjs --apply       Write the repairs
  ./scripts/fix-doc-links.cjs --verbose     Also list links that cannot be repaired
  ./scripts/fix-doc-links.cjs --files a.md  Limit to specific files

${YELLOW}Safety:${NC}
  Rewrites only when the target basename matches exactly one file in the repo.
  Ambiguous and missing targets are reported, never guessed. Dry run by default.
`);
  process.exit(0);
}

/**
 * Index git-tracked files by basename: name -> [absolute paths].
 *
 * Tracked-only, for the same reason validate-doc-links.cjs scans tracked files:
 * `.claude/worktrees/` holds full copies of this repo, and counting those makes
 * almost every spec basename look ambiguous, which suppresses valid repairs.
 */
function buildBasenameIndex() {
  const index = new Map();
  for (const full of trackedFiles()) {
    if (!fs.existsSync(full)) continue;
    const name = path.basename(full);
    if (!index.has(name)) index.set(name, []);
    index.get(name).push(full);
  }
  return index;
}

/**
 * Percent-encode a generated link target so it stays a parseable markdown link.
 *
 * Why (found by adversarial review, 2026-08-16): `toFsPath()` percent-DECODES a
 * target in order to test it on disk, and `path.relative()` returns a decoded
 * path. Writing that back verbatim turned a working link
 *   ](./p55_Understanding%20Verification%20Loop.md)
 * into a malformed one
 *   ](../../archive/5_feb_26/p55_Understanding Verification Loop.md)
 * — the target file existed, but an unescaped space ends a markdown link target,
 * so renderers stop treating it as a link AND validate-doc-links.cjs stops
 * seeing it at all (its regex is `[^)\s]+`). A repair that makes damage
 * invisible to its own checker is the worst failure mode available here.
 *
 * Encodes only the characters that actually break a link target; leaves path
 * separators and already-encoded sequences alone.
 */
function encodeTarget(p) {
  return p
    .split('/')
    .map(seg =>
      // Re-encoding an already-encoded segment would double-escape it (%20 -> %2520).
      /%[0-9A-Fa-f]{2}/.test(seg) ? seg : seg.replace(/[ ()<>"'`\\]/g, c => encodeURIComponent(c))
    )
    .join('/');
}

/** True when a resolved path stays inside the repo. */
function isInsideRepo(absPath) {
  const rel = path.relative(REPO_ROOT, absPath);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Split a link target into its path part and its #anchor/?query suffix. */
function splitSuffix(target) {
  const m = target.match(/^([^#?]*)([#?].*)?$/);
  return { pathPart: m[1], suffix: m[2] || '' };
}

function main() {
  console.log(`${BLUE}=== Fix Doc Links ===${NC}\n`);
  console.log(APPLY ? `${YELLOW}Mode: APPLY (files will be written)${NC}\n`
                    : `${BLUE}Mode: dry run (nothing written; pass --apply to write)${NC}\n`);

  const filesFlagIndex = args.indexOf('--files');
  const files =
    filesFlagIndex !== -1
      ? args
          .slice(filesFlagIndex + 1)
          .filter(a => !a.startsWith('--'))
          .map(a => path.resolve(REPO_ROOT, a))
          .filter(f => fs.existsSync(f))
      : allMarkdownFiles();

  const index = buildBasenameIndex();

  let deadTotal = 0;
  let repairable = 0;
  let ambiguous = 0;
  let missing = 0;
  let filesChanged = 0;

  const unrepairable = [];

  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const links = extractLinks(content);
    // Rewrite by unique target string so repeated links in one file all update.
    const rewrites = new Map();

    for (const { target } of links) {
      if (isSkippableTarget(target)) continue;
      if (targetResolves(file, target)) continue;

      deadTotal++;

      const { pathPart, suffix } = splitSuffix(target);
      const base = path.basename(toFsPath(pathPart));
      if (!base) {
        missing++;
        continue;
      }

      const candidates = (index.get(base) || [])
        .filter(c => c !== file)
        .filter(isInsideRepo);

      if (candidates.length === 1) {
        let newRel = path.relative(path.dirname(file), candidates[0]);
        if (!newRel.startsWith('.')) newRel = './' + newRel;
        const newTarget = encodeTarget(newRel) + suffix;
        if (newTarget !== target) {
          rewrites.set(target, newTarget);
          repairable++;
        }
      } else if (candidates.length > 1) {
        ambiguous++;
        unrepairable.push({
          file: path.relative(REPO_ROOT, file),
          target,
          reason: `${candidates.length} candidates`
        });
      } else {
        missing++;
        unrepairable.push({
          file: path.relative(REPO_ROOT, file),
          target,
          reason: 'no file with that name anywhere'
        });
      }
    }

    if (rewrites.size === 0) continue;

    filesChanged++;
    let updated = content;
    for (const [oldT, newT] of rewrites) {
      // Replace only inside a markdown link's parentheses, so a bare mention of
      // the same path elsewhere in prose is left untouched.
      const escaped = oldT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      updated = updated.replace(new RegExp(`(\\]\\()${escaped}(\\))`, 'g'), `$1${newT}$2`);
    }

    console.log(`${GREEN}✎${NC} ${path.relative(REPO_ROOT, file)} ${YELLOW}(${rewrites.size})${NC}`);
    for (const [oldT, newT] of rewrites) {
      console.log(`    ${RED}${oldT}${NC}`);
      console.log(`    ${GREEN}${newT}${NC}`);
    }

    if (APPLY) fs.writeFileSync(file, updated, 'utf8');
  }

  if (VERBOSE && unrepairable.length > 0) {
    console.log(`\n${YELLOW}Not repairable (left untouched):${NC}`);
    for (const u of unrepairable.slice(0, 60)) {
      console.log(`  ${u.file}: ${u.target} ${YELLOW}[${u.reason}]${NC}`);
    }
    if (unrepairable.length > 60) {
      console.log(`  ${YELLOW}… and ${unrepairable.length - 60} more${NC}`);
    }
  }

  console.log(`\n${BLUE}=== Summary ===${NC}`);
  console.log(`Dead links found:        ${deadTotal}`);
  console.log(`${GREEN}Repairable (unique match): ${repairable}${NC}`);
  console.log(`${YELLOW}Ambiguous (2+ matches):    ${ambiguous}${NC}`);
  console.log(`${RED}Missing (no match):        ${missing}${NC}`);
  console.log(`Files ${APPLY ? 'changed' : 'that would change'}: ${filesChanged}`);

  if (!APPLY && repairable > 0) {
    console.log(`\n${YELLOW}Dry run. Re-run with --apply to write these ${repairable} repair(s).${NC}`);
  }
}

try {
  main();
} catch (err) {
  console.error(`${RED}fix-doc-links failed:${NC} ${err && err.message ? err.message : err}`);
  process.exit(1);
}
