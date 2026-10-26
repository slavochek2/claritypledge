'use strict';
// P1566 — read a whole tree of files straight from git objects, without a checkout.
// Used by the whole-graph metrics (cycles, duplicates), which judge the entire
// project at two commits rather than one file at a time.

const { execFileSync } = require('child_process');

// rev: a commit. paths: pathspecs to include. Returns Map<path, content>.
function snapshot(rev, paths) {
  const listing = execFileSync('git', ['ls-tree', '-r', '-z', rev, '--', ...paths], {
    encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const blobs = [];
  for (const rec of listing.split('\0').filter(Boolean)) {
    const tab = rec.indexOf('\t');
    const [mode, type, sha] = rec.slice(0, tab).split(/\s+/);
    if (type !== 'blob' || mode === '120000') continue; // symlinks are not source
    blobs.push({ path: rec.slice(tab + 1), sha });
  }
  const files = new Map();
  if (blobs.length === 0) return files;
  // One `git cat-file --batch` process for the whole tree: "<sha> blob <size>\n<bytes>\n".
  const out = execFileSync('git', ['cat-file', '--batch'], {
    input: blobs.map((b) => b.sha).join('\n') + '\n', maxBuffer: 1 << 30, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let pos = 0;
  for (const b of blobs) {
    const nl = out.indexOf(0x0a, pos);
    const header = out.toString('utf8', pos, nl).split(' ');
    if (header[1] !== 'blob') throw new Error(`cat-file: unexpected object for ${b.path}: ${header.join(' ')}`);
    const size = Number(header[2]);
    files.set(b.path, out.toString('utf8', nl + 1, nl + 1 + size));
    pos = nl + 1 + size + 1;
  }
  return files;
}

module.exports = { snapshot };
