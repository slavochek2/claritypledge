#!/usr/bin/env node

/**
 * Validation Script: Check relative markdown links resolve to real files
 *
 * Scope note (2026-08-15): this script previously validated bidirectional
 * frontmatter relations for the P142 information architecture
 * (tracks/hypotheses/experiments/outcomes under docs/milestones/). That
 * structure was retired by P144 and docs/milestones/ does not exist, so the
 * script bailed at its "no new structure found" branch and exited 0 on every
 * run since 2026-02 — a green pre-commit check that validated nothing.
 * See docs/decisions.md 2026-08-15.
 *
 * It now does what p144_simplify_planning_system.md:517 specified:
 * "check /docs/, /features/, CLAUDE.md".
 *
 * Gating policy — deliberate, and revised once under exercise:
 *   The repo carries a large stock of pre-existing dead links (specs moved into
 *   features/done/ without their referrers rewritten), so failing on all of them
 *   would block every commit. The first attempt gated on "any dead link in a
 *   staged file", which blocked its own bulk-repair commit: staging 101 files
 *   inherits every legacy dead link they already contained.
 *
 *   So the gate is a RATCHET. For each staged file it compares the set of dead
 *   link targets against the same file at HEAD, and fails only on targets that
 *   are dead now and were not dead before — links this commit introduced. Legacy
 *   debt is reported, never blocking. Use --all for repo-wide strict (cleanup),
 *   --report for a repo-wide count that never fails.
 *
 *   Known limit, stated rather than hidden: the HEAD baseline resolves target
 *   strings against the CURRENT filesystem, so deleting a file and leaving a
 *   referrer untouched is not caught (the target reads as dead in both). The
 *   dominant case — an author writing or pasting a link that never resolved — is
 *   caught. Closing the deletion case needs tree-aware resolution against HEAD.
 *
 * Usage:
 *   ./scripts/validate-doc-links.cjs             # gate on staged files only
 *   ./scripts/validate-doc-links.cjs --all       # fail on ANY dead link (repo-wide)
 *   ./scripts/validate-doc-links.cjs --report    # repo-wide report, never fails
 *   ./scripts/validate-doc-links.cjs --files a.md b.md   # explicit file list
 *   ./scripts/validate-doc-links.cjs --verbose   # list every dead link
 *   ./scripts/validate-doc-links.cjs --help
 *
 * Exit codes:
 *   0 - No dead links in the gated scope
 *   1 - Dead links found in the gated scope
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const ALL = args.includes('--all');
const REPORT_ONLY = args.includes('--report');
const SHOW_HELP = args.includes('--help') || args.includes('-h');

const RED = '\x1b[0;31m';
const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[1;33m';
const BLUE = '\x1b[0;34m';
const NC = '\x1b[0m';

const REPO_ROOT = path.join(__dirname, '..');

// Directories whose markdown is checked in repo-wide mode.
const SCAN_DIRS = ['docs', 'features', '.claude', 'content'];
const SCAN_ROOT_FILES = ['CLAUDE.md', 'README.md'];

// Directories never scanned (vendored or generated markdown).
const SKIP_DIR_RE = /(^|\/)(node_modules|\.git|dist|build|coverage)(\/|$)/;

if (SHOW_HELP) {
  console.log(`
${BLUE}Validate Doc Links${NC} : check relative markdown links resolve to real files

${YELLOW}Usage:${NC}
  ./scripts/validate-doc-links.cjs             Gate on staged files only (pre-commit default)
  ./scripts/validate-doc-links.cjs --all       Fail on ANY dead link repo-wide
  ./scripts/validate-doc-links.cjs --report     Repo-wide report, always exits 0
  ./scripts/validate-doc-links.cjs --files a.md b.md   Check an explicit list
  ./scripts/validate-doc-links.cjs --verbose   List every dead link found

${YELLOW}What counts as a dead link:${NC}
  A markdown link [text](target) whose target is relative (not http/mailto/#anchor)
  and resolves to no file on disk, from either the containing file's directory
  or the repo root. Anchors and query strings are stripped before checking.

${YELLOW}Exit codes:${NC}
  0 - No dead links in the gated scope
  1 - Dead links found in the gated scope
`);
  process.exit(0);
}

/**
 * Every git-tracked file, as absolute paths.
 *
 * Tracked-only is deliberate and load-bearing: `.claude/worktrees/` holds full
 * checkouts of this same repo, so a filesystem walk counts every spec twice and
 * makes the basename index in fix-doc-links.cjs ambiguous for nearly every
 * target. `git ls-files` is the authoritative set and excludes worktrees,
 * node_modules, and untracked scratch files for free.
 */
function trackedFiles() {
  let out;
  try {
    out = execFileSync('git', ['ls-files', '-z'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    });
  } catch {
    return [];
  }
  return out
    .split('\0')
    .filter(Boolean)
    .map(rel => path.join(REPO_ROOT, rel));
}

/** Every tracked markdown file inside the directories we care about. */
function allMarkdownFiles() {
  const prefixes = SCAN_DIRS.map(d => d + path.sep);
  return trackedFiles().filter(full => {
    if (!full.endsWith('.md')) return false;
    if (!fs.existsSync(full)) return false;
    const rel = path.relative(REPO_ROOT, full);
    if (SKIP_DIR_RE.test(rel)) return false;
    return prefixes.some(p => rel.startsWith(p)) || SCAN_ROOT_FILES.includes(rel);
  });
}

/** Markdown files staged for commit (added/copied/modified/renamed). */
function stagedMarkdownFiles() {
  let out;
  try {
    out = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    });
  } catch {
    return [];
  }
  return out
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.endsWith('.md'))
    .map(s => path.join(REPO_ROOT, s))
    .filter(f => fs.existsSync(f) && !SKIP_DIR_RE.test(path.relative(REPO_ROOT, f)));
}

/**
 * Extract relative markdown link targets from content, with line numbers.
 * Skips fenced code blocks so example links in docs don't register as real.
 */
function extractLinks(content) {
  const links = [];
  const lines = content.split('\n');
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    // [text](target) — target captured up to the closing paren, no nesting.
    const re = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      links.push({ target: m[1], line: i + 1 });
    }
  }
  return links;
}

/** True when the target is external / in-page / not a filesystem path. */
function isSkippableTarget(target) {
  return (
    /^(https?:|mailto:|tel:|data:|ftp:)/i.test(target) ||
    target.startsWith('#') ||
    target.startsWith('<') ||
    target.startsWith('~') ||
    target.startsWith('$') ||
    target.startsWith('{') ||
    target.includes('${')
  );
}

/** Strip #anchor and ?query, and percent-decode, leaving a filesystem path. */
function toFsPath(target) {
  let t = target.split('#')[0].split('?')[0];
  try {
    t = decodeURIComponent(t);
  } catch {
    /* leave as-is if it isn't valid percent-encoding */
  }
  return t.trim();
}

/**
 * Resolve generously: a link counts as live if it resolves either from the
 * containing file's directory OR from the repo root. Being generous here keeps
 * the gate focused on genuinely missing targets rather than path-style debates.
 */
function targetResolves(fromFile, target) {
  const fsPath = toFsPath(target);
  if (fsPath === '') return true; // pure anchor after stripping

  const candidates = [
    path.resolve(path.dirname(fromFile), fsPath),
    path.resolve(REPO_ROOT, fsPath.replace(/^\/+/, ''))
  ];
  return candidates.some(c => fs.existsSync(c));
}

/**
 * The file's content at HEAD, or null when it is new / unreadable.
 * Used to establish which dead links predate this commit.
 */
function headContent(file) {
  const rel = path.relative(REPO_ROOT, file);
  try {
    return execFileSync('git', ['show', `HEAD:${rel}`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch {
    return null;
  }
}

/** Dead link targets in a blob of content, as a Set, resolved relative to `file`. */
function deadTargetSet(file, content) {
  const set = new Set();
  if (content === null) return set;
  for (const { target } of extractLinks(content)) {
    if (isSkippableTarget(target)) continue;
    if (!targetResolves(file, target)) set.add(target);
  }
  return set;
}

/**
 * Dead links a staged file INTRODUCES relative to HEAD.
 * A target already dead at HEAD is pre-existing debt and does not block.
 */
function checkFileRatchet(file) {
  let current;
  try {
    current = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }

  const before = deadTargetSet(file, headContent(file));
  const introduced = [];

  const seen = new Set();
  const lines = current.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const re = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let m;
    while ((m = re.exec(lines[i])) !== null) {
      const target = m[1];
      if (isSkippableTarget(target)) continue;
      if (targetResolves(file, target)) continue;
      if (before.has(target)) continue; // pre-existing
      const key = `${target}@${i + 1}`;
      if (seen.has(key)) continue;
      seen.add(key);
      introduced.push({ file: path.relative(REPO_ROOT, file), target, line: i + 1 });
    }
  }
  return introduced;
}

/** Check one file, returning its dead links. */
function checkFile(file) {
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }

  const dead = [];
  for (const { target, line } of extractLinks(content)) {
    if (isSkippableTarget(target)) continue;
    if (!targetResolves(file, target)) {
      dead.push({ file: path.relative(REPO_ROOT, file), target, line });
    }
  }
  return dead;
}

function checkFiles(files) {
  const dead = [];
  let linkCount = 0;
  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    linkCount += extractLinks(content).filter(l => !isSkippableTarget(l.target)).length;
    dead.push(...checkFile(file));
  }
  return { dead, linkCount };
}

function printDead(dead, limit) {
  const shown = VERBOSE ? dead : dead.slice(0, limit);
  const bySource = {};
  for (const d of shown) {
    if (!bySource[d.file]) bySource[d.file] = [];
    bySource[d.file].push(d);
  }
  for (const [source, entries] of Object.entries(bySource)) {
    console.log(`${RED}✗${NC} ${source}`);
    for (const e of entries) {
      console.log(`    line ${e.line}: ${e.target}`);
    }
  }
  if (!VERBOSE && dead.length > shown.length) {
    console.log(`  ${YELLOW}… and ${dead.length - shown.length} more (use --verbose)${NC}`);
  }
}

function main() {
  console.log(`${BLUE}=== Validating Doc Links ===${NC}\n`);

  // --files takes an explicit list after the flag.
  const filesFlagIndex = args.indexOf('--files');
  let scope;
  let scopeLabel;

  if (filesFlagIndex !== -1) {
    scope = args
      .slice(filesFlagIndex + 1)
      .filter(a => !a.startsWith('--'))
      .map(a => path.resolve(REPO_ROOT, a))
      .filter(f => fs.existsSync(f));
    scopeLabel = `${scope.length} file(s) named on the command line`;
  } else if (ALL || REPORT_ONLY) {
    scope = allMarkdownFiles();
    scopeLabel = `${scope.length} markdown files (repo-wide)`;
  } else {
    scope = stagedMarkdownFiles();
    scopeLabel = `${scope.length} staged markdown file(s)`;
  }

  // Default (pre-commit) mode is a ratchet against HEAD; explicit modes are absolute.
  const RATCHET = filesFlagIndex === -1 && !ALL && !REPORT_ONLY;

  let dead;
  let linkCount;
  if (RATCHET) {
    dead = scope.flatMap(checkFileRatchet);
    linkCount = scope.reduce((n, f) => {
      try {
        return (
          n +
          extractLinks(fs.readFileSync(f, 'utf8')).filter(l => !isSkippableTarget(l.target)).length
        );
      } catch {
        return n;
      }
    }, 0);
  } else {
    ({ dead, linkCount } = checkFiles(scope));
  }

  console.log(`Scope: ${scopeLabel}`);
  console.log(`Relative links checked: ${linkCount}`);
  if (RATCHET) {
    console.log(`Mode: ratchet (fails only on links this commit introduces)`);
  }

  if (dead.length === 0) {
    console.log(`${GREEN}✓ ${RATCHET ? 'New dead links' : 'Dead links'}: 0${NC}\n`);
    if (RATCHET) {
      console.log(`${BLUE}Note:${NC} pre-existing dead links are not gated here.`);
      console.log(`      Run ${YELLOW}--report${NC} for the repo-wide count,`);
      console.log(`      or ${YELLOW}./scripts/fix-doc-links.cjs${NC} to repair the mechanical ones.`);
    }
    process.exit(0);
  }

  console.log(`${RED}✗ ${RATCHET ? 'New dead links' : 'Dead links'}: ${dead.length}${NC}\n`);
  printDead(dead, 20);
  console.log('');

  if (REPORT_ONLY) {
    console.log(`${YELLOW}Report mode: not failing.${NC}`);
    process.exit(0);
  }

  console.log(`${RED}✗ Validation failed : fix the dead links above${NC}`);
  console.log(`${YELLOW}  A link is dead when its target resolves from neither the file's`);
  console.log(`  directory nor the repo root.${NC}`);
  if (RATCHET) {
    console.log(`${YELLOW}  These were introduced by this commit; pre-existing ones are ignored.${NC}`);
  }
  process.exit(1);
}

// Exported so scripts/fix-doc-links.cjs reuses this exact link-detection and
// resolution logic rather than keeping a second, drifting copy of it.
module.exports = {
  REPO_ROOT,
  SCAN_DIRS,
  SCAN_ROOT_FILES,
  allMarkdownFiles,
  trackedFiles,
  extractLinks,
  isSkippableTarget,
  toFsPath,
  targetResolves,
  checkFile,
  checkFileRatchet
};

if (require.main === module) {
  main();
}
