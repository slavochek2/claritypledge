#!/usr/bin/env node
/**
 * store-reconcile.mjs — P1210 §10 rule 2 / DW-13 + DW-18.
 *
 * WALK THE BYTES AND DIFF THEM AGAINST THE LEDGER — never a ledger query.
 * The corrected rule, and the correction matters: a ledger query cannot find an
 * artifact whose defining property is having no ledger row, so "look it up in
 * the ledger" reproduces the exact miss it was added to prevent. This is
 * literally how run B's five orphans were found.
 *
 * A store root and a ledger path are PARAMETERS, so this runs against a
 * committed fixture tree rather than a home directory — that is what makes the
 * row honestly ci-tier.
 *
 * Two verdicts, and they are different verdicts on purpose (DW-18):
 *   ORPHAN  — bytes on disk, zero ledger rows. FOUND, reported, does NOT block.
 *             That is the shape that stopped run B for three days.
 *   MISSING — the artifact that would clear the blocker is genuinely absent.
 *             STILL BLOCKS. A check that never blocks is not a check.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const id = 'store-reconcile'
const HERE = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(HERE, '..', '..')

/** Every file under the store root, relative to it. The bytes, not the index. */
export function walk(root) {
  const out = []
  const rec = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) rec(full)
      else if (entry.isFile()) out.push({ rel: path.relative(root, full), bytes: statSync(full).size })
    }
  }
  if (existsSync(root)) rec(root)
  return out.sort((a, b) => a.rel.localeCompare(b.rel))
}

/**
 * The ledger, as a newline-delimited list of artifact paths. A real deployment
 * reads SQLite here; the SHAPE this predicate needs is "the set of paths the
 * ledger claims", and the fixture supplies it in the simplest form that carries
 * that shape without pulling a database into the test.
 */
export function readLedger(file) {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
}

/** @param {{storeRoot: string, ledger: string, required?: string[]}} input */
export function run(input) {
  const bytes = walk(input.storeRoot)
  const ledger = new Set(readLedger(input.ledger))
  const onDisk = new Set(bytes.map(b => b.rel))

  const orphans = bytes.filter(b => !ledger.has(b.rel)).map(b => b.rel)
  const ledgerOnly = [...ledger].filter(l => !onDisk.has(l))
  const required = input.required ?? []
  // An artifact is CLEARED by bytes, whether or not the ledger knows about it.
  const blockers = required.filter(r => !onDisk.has(r))

  const lines = [
    `  bytes on disk: ${bytes.length}; ledger rows: ${ledger.size}`,
    `  ORPHANS (bytes present, no ledger row) — reported, NOT blocking: ${orphans.length ? orphans.join(', ') : '—'}`,
    `  ledger rows with no bytes: ${ledgerOnly.length ? ledgerOnly.join(', ') : '—'}`,
  ]
  if (blockers.length) {
    return {
      ok: false, verdict: 'BLOCK', orphans, ledgerOnly, blockers,
      detail: [`BLOCK — ${blockers.length} required artifact(s) genuinely absent from the bytes: ${blockers.join(', ')}`, ...lines].join('\n'),
    }
  }
  return {
    ok: true, verdict: 'CLEAR', orphans, ledgerOnly, blockers: [],
    detail: [`CLEAR — every required artifact is present in the bytes; the run does NOT stop.`, ...lines].join('\n'),
  }
}

const TREE = path.join(REPO_ROOT, 'src/tests/fixtures/p1210/stores')
export const FIXTURES = {
  // Must-pass: the ledger-orphan shape. Bytes present, zero ledger rows -> the
  // run continues, and the orphan is named.
  pass: {
    storeRoot: path.join(TREE, 'diarize-store'),
    ledger: path.join(TREE, 'index.ledger'),
    required: ['MWMe7yjPYpE/0s+1751s.json'],
  },
  // Must-fail: an artifact that is genuinely absent still blocks.
  fail: {
    storeRoot: path.join(TREE, 'diarize-store'),
    ledger: path.join(TREE, 'index.ledger'),
    required: ['NEVER_FETCHED/0s+900s.json'],
  },
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const get = flag => { const i = args.indexOf(flag); return i === -1 ? null : args[i + 1] }
  const storeRoot = get('--store-root'), ledger = get('--ledger')
  if (!storeRoot || !ledger) {
    console.error('usage: store-reconcile.mjs --store-root <dir> --ledger <file> [--require <rel-path>]...')
    process.exit(2)
  }
  const required = args.reduce((acc, a, i) => (a === '--require' ? [...acc, args[i + 1]] : acc), [])
  const r = run({ storeRoot, ledger, required })
  console.log(r.detail)
  process.exit(r.ok ? 0 : 1)
}
