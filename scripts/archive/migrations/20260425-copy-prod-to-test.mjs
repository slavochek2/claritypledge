#!/usr/bin/env node
/**
 * copy-prod-to-test.mjs — Copies the founder's prod data to test DB for P800 UAT.
 * Set COPY_PROD_FOUNDER_EMAIL in .env.local to the founder's profile email.
 * Output contract: No '>', '<', '|' in status lines (shell-safety rule).
 *
 * Usage:
 *   node scripts/archive/migrations/20260425-copy-prod-to-test.mjs --step=uuids    # Print + fingerprint UUIDs
 *   node scripts/archive/migrations/20260425-copy-prod-to-test.mjs --step=backup   # pg_dump test DB (full data)
 *   node scripts/archive/migrations/20260425-copy-prod-to-test.mjs --step=export   # Show prod counts (read-only)
 *   node scripts/archive/migrations/20260425-copy-prod-to-test.mjs --step=copy     # Disable triggers, wipe, insert, re-enable, backfill
 *   node scripts/archive/migrations/20260425-copy-prod-to-test.mjs --step=inspect  # 3-bucket inspector + write wiring SQL
 *   node scripts/archive/migrations/20260425-copy-prod-to-test.mjs --step=wire-prod --confirm  # Apply wiring SQL to PROD
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createInterface } from 'readline';

// ============================================================================
// Config
// ============================================================================

const PROD_REF = 'besjtuodziykmjidubzw';
const TEST_REF = 'gfjctyxqlwexxwsmkakq';
const PROD_API = `https://${PROD_REF}.supabase.co/rest/v1`;
const TEST_API = `https://${TEST_REF}.supabase.co/rest/v1`;
const MGMT_URL = 'https://api.supabase.com/v1/projects';
const UUID_FINGERPRINT = '/tmp/cp-uuids.json';
const FINGERPRINT_TTL_MS = 60 * 60 * 1000; // 1 hour
const PG_DUMP = '/opt/homebrew/opt/libpq/bin/pg_dump';

// Triggers that interfere with bulk copy — must bracket wipe+insert
const TRIGGERS_TO_BRACKET = [
  { table: 'points',  name: 'trg_protect_system_tags_points' },
  { table: 'stories', name: 'trg_protect_system_tags_stories' },
  { table: 'points',  name: 'trg_enforce_supersede_invariants' },
  { table: 'stories', name: 'trg_story_version_on_update' },
];

// ============================================================================
// Env loading
// ============================================================================

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dir, '../.env.local');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const PROD_KEY = env.PROD_SUPABASE_SERVICE_ROLE_KEY;
const TEST_KEY = env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const MGMT_TOKEN = env.SUPABASE_ACCESS_TOKEN;
const TEST_DB_URL = env.SUPABASE_DB_URL;
// Not hardcoded in this public repo — set in .env.local (gitignored)
const FOUNDER_EMAIL = env.COPY_PROD_FOUNDER_EMAIL;

// ============================================================================
// Helpers
// ============================================================================

function log(msg) { process.stdout.write(msg + '\n'); }

function abort(msg) {
  process.stderr.write('ABORT: ' + msg + '\n');
  process.exit(1);
}

async function restGet(baseUrl, table, params, key) {
  const res = await fetch(`${baseUrl}/${table}?${params}`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`REST GET ${table}: HTTP ${res.status} -- ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchAll(baseUrl, table, filter, key) {
  let rows = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const batch = await restGet(baseUrl, table, `${filter}&select=*&limit=${limit}&offset=${offset}`, key);
    rows = rows.concat(batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return rows;
}

async function execMgmtSQL(ref, sql) {
  const res = await fetch(`${MGMT_URL}/${ref}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MGMT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mgmt SQL on ${ref}: HTTP ${res.status} -- ${body.slice(0, 400)}`);
  }
  return res.json();
}

// Serialize a JS value to a PostgreSQL literal (input is trusted env data, not user-supplied)
function sqlVal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return isFinite(v) ? v.toString() : 'NULL';
  if (Array.isArray(v)) {
    if (v.length === 0) return "'{}'::text[]";
    const escaped = v.map(s => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`).join(', ');
    return `ARRAY[${escaped}]`;
  }
  if (typeof v === 'object') {
    return `'${JSON.stringify(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'::jsonb`;
  }
  // string, uuid, timestamp, enum
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

// Build INSERT ... ON CONFLICT (...) DO UPDATE SET ... for a batch of rows
function buildUpsert(table, rows, conflictCols, remapFn) {
  if (!rows.length) return null;
  const remapped = rows.map(remapFn || (r => r));
  const cols = Object.keys(remapped[0]);
  const updateCols = cols.filter(c => !conflictCols.includes(c));
  const valuesList = remapped.map(row =>
    '(' + cols.map(c => sqlVal(row[c])).join(', ') + ')'
  ).join(',\n  ');
  const conflictTarget = `(${conflictCols.join(', ')})`;
  const updateSet = updateCols.length > 0
    ? updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')
    : `${conflictCols[0]} = EXCLUDED.${conflictCols[0]}`;
  return `INSERT INTO ${table} (${cols.join(', ')})\nVALUES\n  ${valuesList}\nON CONFLICT ${conflictTarget} DO UPDATE SET ${updateSet};`;
}

async function upsertBatch(ref, table, rows, conflictCols, remapFn, batchSize = 50) {
  let total = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const sql = buildUpsert(table, rows.slice(i, i + batchSize), conflictCols, remapFn);
    if (sql) {
      await execMgmtSQL(ref, sql);
      total += Math.min(batchSize, rows.length - i);
    }
  }
  return total;
}

function loadFingerprint() {
  if (!existsSync(UUID_FINGERPRINT)) {
    abort(`Fingerprint missing: ${UUID_FINGERPRINT}. Run --step=uuids first.`);
  }
  const f = JSON.parse(readFileSync(UUID_FINGERPRINT, 'utf8'));
  const ageMin = Math.round((Date.now() - f.timestamp) / 60000);
  if (Date.now() - f.timestamp > FINGERPRINT_TTL_MS) {
    abort(`Fingerprint stale (${ageMin} min old, TTL 60 min). Run --step=uuids again.`);
  }
  return f;
}

async function verifyTriggers(ref, expectedEnabled) {
  const names = TRIGGERS_TO_BRACKET.map(t => `'${t.name}'`).join(', ');
  const rows = await execMgmtSQL(ref, `
    SELECT tgname AS name, tgenabled AS enabled
    FROM pg_trigger
    WHERE tgname IN (${names})
    ORDER BY tgname;
  `);
  let allOk = true;
  for (const row of rows) {
    // tgenabled: 'O' = enabled (origin), 'D' = disabled, 'R' = replica, 'A' = always
    const isEnabled = row.enabled !== 'D';
    const ok = isEnabled === expectedEnabled;
    const state = isEnabled ? 'enabled' : 'disabled';
    const want = expectedEnabled ? 'enabled' : 'disabled';
    log(`    ${ok ? 'OK' : 'FAIL'} ${row.name}: ${state} (want ${want})`);
    if (!ok) allOk = false;
  }
  if (rows.length !== TRIGGERS_TO_BRACKET.length) {
    abort(`Expected ${TRIGGERS_TO_BRACKET.length} triggers, found ${rows.length}. Check trigger names.`);
  }
  if (!allOk) abort('Trigger state mismatch. Stopping before unsafe mutations.');
}

// ============================================================================
// Step 0: uuids
// ============================================================================

async function stepUuids() {
  log('Step 0: Reading UUIDs from prod and test (read-only)...');

  log('  Querying PROD DB...');
  const prodRows = await restGet(PROD_API, 'profiles', `select=id&email=eq.${FOUNDER_EMAIL}`, PROD_KEY);
  if (!prodRows.length) abort(`No prod profile found for ${FOUNDER_EMAIL}`);
  const PROD_UUID = prodRows[0].id;

  log('  Querying TEST DB...');
  const testRows = await restGet(TEST_API, 'profiles', `select=id&email=eq.${FOUNDER_EMAIL}`, TEST_KEY);
  if (!testRows.length) abort(`No test profile found for ${FOUNDER_EMAIL}. Profile must exist on test first.`);
  const TEST_UUID = testRows[0].id;

  const fingerprint = { prod_uuid: PROD_UUID, test_uuid: TEST_UUID, timestamp: Date.now() };
  writeFileSync(UUID_FINGERPRINT, JSON.stringify(fingerprint, null, 2));

  log(`  Prod UUID: ${PROD_UUID}`);
  log(`  Test UUID: ${TEST_UUID}`);
  log(`  Fingerprint written: ${UUID_FINGERPRINT} (valid 60 min)`);
  log('Done. Run --step=backup next.');
}

// ============================================================================
// Step 1: backup
// ============================================================================

async function stepBackup() {
  log('Step 1: Backing up test DB (full data dump)...');
  if (!TEST_DB_URL) abort('SUPABASE_DB_URL not set in .env.local');

  const ts = new Date().toISOString().replace(/[T:.]/g, '-').slice(0, 19);
  const outFile = `/tmp/test-backup-${ts}.sql.gz`;

  log(`  Running pg_dump to: ${outFile}`);
  // Shell required for pipe: pg_dump stdout -> gzip -> file
  const result = spawnSync(
    'bash',
    ['-c', `"${PG_DUMP}" "${TEST_DB_URL}" --data-only | gzip > "${outFile}"`],
    { stdio: 'inherit' }
  );
  if (result.status !== 0) abort('pg_dump failed. Check SUPABASE_DB_URL and pg_dump path.');

  const sizeBytes = statSync(outFile).size;
  log(`  Backup written: ${outFile} (${(sizeBytes / 1024 / 1024).toFixed(2)} MB)`);
  log('Done. Run --step=copy to perform the data copy.');
}

// ============================================================================
// Step 2: export (read-only preview)
// ============================================================================

async function stepExport() {
  log('Step 2 (preview): Querying prod counts -- read-only, no mutations...');
  const { prod_uuid: PROD_UUID } = loadFingerprint();
  log(`  Prod UUID: ${PROD_UUID}`);

  // story_points has no id column (PK is story_id, point_id)
  const queries = [
    { name: 'profiles',        filter: `id=eq.${PROD_UUID}`,          col: 'id' },
    { name: 'points',          filter: `first_validator_id=eq.${PROD_UUID}`, col: 'id' },
    { name: 'stories',         filter: `author_id=eq.${PROD_UUID}`,   col: 'id' },
    { name: 'story_points',    filter: `author_id=eq.${PROD_UUID}`,   col: 'story_id' },
    { name: 'point_positions', filter: `user_id=eq.${PROD_UUID}`,     col: 'id' },
  ];

  for (const { name, filter, col } of queries) {
    const rows = await restGet(PROD_API, name, `${filter}&select=${col}`, PROD_KEY);
    log(`  prod.${name}: ${rows.length} rows`);
  }
  log('Done. Read-only preview complete. Run --step=copy to perform the actual copy.');
}

// ============================================================================
// Step copy: Steps 2–5 combined
// ============================================================================

async function stepCopy() {
  log('=== COPY PROD to TEST ===');
  const { prod_uuid: PROD_UUID, test_uuid: TEST_UUID } = loadFingerprint();
  log(`  Prod UUID: ${PROD_UUID}`);
  log(`  Test UUID: ${TEST_UUID}`);

  // ---- Step 2: Export prod data ----
  log('\nStep 2: Exporting prod data (read-only)...');

  const prodProfileArr = await fetchAll(PROD_API, 'profiles', `id=eq.${PROD_UUID}`, PROD_KEY);
  if (!prodProfileArr.length) abort('Prod profile not found.');
  const prodProfile = prodProfileArr[0];
  log(`  profiles: 1 row`);

  const prodPoints = await fetchAll(PROD_API, 'points', `first_validator_id=eq.${PROD_UUID}`, PROD_KEY);
  log(`  points (founder-owned): ${prodPoints.length} rows`);

  const prodStories = await fetchAll(PROD_API, 'stories', `author_id=eq.${PROD_UUID}`, PROD_KEY);
  log(`  stories: ${prodStories.length} rows`);

  const prodStoryPoints = await fetchAll(PROD_API, 'story_points', `author_id=eq.${PROD_UUID}`, PROD_KEY);
  log(`  story_points: ${prodStoryPoints.length} rows`);

  const prodPositions = await fetchAll(PROD_API, 'point_positions', `user_id=eq.${PROD_UUID}`, PROD_KEY);
  log(`  point_positions: ${prodPositions.length} rows`);

  // Referential closure: fetch orphan points + their owners' profiles
  const ownedIds = new Set(prodPoints.map(p => p.id));
  const referencedIds = new Set([
    ...prodStoryPoints.map(sp => sp.point_id),
    ...prodPositions.map(pp => pp.point_id),
  ]);
  const orphanIds = [...referencedIds].filter(id => !ownedIds.has(id));

  let orphanPoints = [];
  let orphanProfiles = [];
  if (orphanIds.length > 0) {
    log(`  Referential closure: fetching ${orphanIds.length} orphan points (authored by others)...`);
    for (let i = 0; i < orphanIds.length; i += 100) {
      const batch = orphanIds.slice(i, i + 100);
      const rows = await restGet(PROD_API, 'points', `id=in.(${batch.join(',')})&select=*`, PROD_KEY);
      orphanPoints = orphanPoints.concat(rows);
    }
    // Also fetch profiles for orphan point owners so FK is satisfied on test insert
    const orphanOwnerIds = [...new Set(orphanPoints.map(p => p.first_validator_id))];
    log(`  Referential closure: fetching ${orphanOwnerIds.length} orphan owner profile(s) from prod...`);
    for (let i = 0; i < orphanOwnerIds.length; i += 100) {
      const batch = orphanOwnerIds.slice(i, i + 100);
      const rows = await restGet(PROD_API, 'profiles', `id=in.(${batch.join(',')})&select=*`, PROD_KEY);
      orphanProfiles = orphanProfiles.concat(rows);
    }
    log(`  Orphan points: ${orphanPoints.length}, orphan owner profiles: ${orphanProfiles.length}`);
  }
  const allPoints = [...prodPoints, ...orphanPoints];
  log(`  Total points to insert (founder + orphans): ${allPoints.length}`);

  if (prodPoints.length === 0 && prodStories.length === 0) {
    abort('Prod export returned 0 points and 0 stories. Verify PROD_UUID and PROD_SUPABASE_SERVICE_ROLE_KEY.');
  }

  // ---- Step 2.5: Disable triggers ----
  log('\nStep 2.5: Disabling triggers on TEST DB...');
  log('  Querying TEST DB for mutations...');
  const disableSQL = TRIGGERS_TO_BRACKET
    .map(t => `ALTER TABLE ${t.table} DISABLE TRIGGER ${t.name};`)
    .join('\n');
  const enableSQL = TRIGGERS_TO_BRACKET
    .map(t => `ALTER TABLE ${t.table} ENABLE TRIGGER ${t.name};`)
    .join('\n');
  await execMgmtSQL(TEST_REF, disableSQL);
  log('  Verifying trigger states:');
  await verifyTriggers(TEST_REF, false);

  // Wrap all mutations in try/finally so triggers always get re-enabled on error
  try {

  // ---- Step 3: Wipe test user data ----
  log('\nStep 3: Wiping test user data (FK-safe delete order)...');

  // Must delete ALL positions on founder's points before deleting the points.
  // Reason: point_positions has an AFTER DELETE trigger that inserts into point_position_history.
  // If positions are CASCADE-deleted as part of deleting a point, that trigger fires after the
  // point is gone, causing a FK violation in point_position_history. Pre-deleting positions
  // ensures the trigger fires while the point still exists.
  await execMgmtSQL(TEST_REF, `
    DELETE FROM letter_point_responses
    WHERE point_id IN (SELECT id FROM points WHERE first_validator_id = '${TEST_UUID}');
  `);
  await execMgmtSQL(TEST_REF, `
    DELETE FROM point_positions
    WHERE point_id IN (SELECT id FROM points WHERE first_validator_id = '${TEST_UUID}')
       OR user_id = '${TEST_UUID}';
  `);
  await execMgmtSQL(TEST_REF, `DELETE FROM story_points WHERE author_id = '${TEST_UUID}';`);
  // Clear non-cascade tables referencing stories before deleting stories
  await execMgmtSQL(TEST_REF, `
    DELETE FROM letter_story_snapshots
    WHERE story_id IN (SELECT id FROM stories WHERE author_id = '${TEST_UUID}');
  `);
  await execMgmtSQL(TEST_REF, `
    DELETE FROM letter_predictions
    WHERE story_id IN (SELECT id FROM stories WHERE author_id = '${TEST_UUID}');
  `);
  await execMgmtSQL(TEST_REF, `
    DELETE FROM doc_stories
    WHERE story_id IN (SELECT id FROM stories WHERE author_id = '${TEST_UUID}');
  `);
  await execMgmtSQL(TEST_REF, `
    UPDATE clarity_sessions SET source_story_id = NULL
    WHERE source_story_id IN (SELECT id FROM stories WHERE author_id = '${TEST_UUID}');
  `);
  await execMgmtSQL(TEST_REF, `DELETE FROM stories WHERE author_id = '${TEST_UUID}';`);
  await execMgmtSQL(TEST_REF, `DELETE FROM points  WHERE first_validator_id = '${TEST_UUID}';`);
  log('  Wipe complete.');

  // ---- Step 4: Insert prod data into test ----
  log('\nStep 4: Inserting prod data into test (with UUID remap)...');

  // 4a: Sync profile fields — keep TEST_UUID as id, overwrite everything else (including role)
  const { id: _profId, ...profileFields } = prodProfile;
  const profileUpdateSet = Object.entries(profileFields)
    .map(([k, v]) => `${k} = ${sqlVal(v)}`)
    .join(', ');
  await execMgmtSQL(TEST_REF, `UPDATE profiles SET ${profileUpdateSet} WHERE id = '${TEST_UUID}';`);
  log('  profiles: 1 row synced (role, verification flags, system_tags preserved)');

  // 4a-pre: Ensure orphan owner profiles exist in test.
  // If a profile with the same email already exists in test (different UUID), remap instead of insert.
  const orphanOwnerRemap = {}; // prodUUID -> testUUID for orphan owners
  for (const prof of orphanProfiles) {
    const existing = await restGet(TEST_API, 'profiles', `email=eq.${encodeURIComponent(prof.email)}&select=id`, TEST_KEY);
    if (existing.length > 0) {
      orphanOwnerRemap[prof.id] = existing[0].id;
      log(`  orphan profile ${prof.email}: already in test as ${existing[0].id}, remapping`);
    } else {
      await upsertBatch(TEST_REF, 'profiles', [prof], ['id']);
      log(`  orphan profile ${prof.email}: inserted`);
    }
  }

  // 4b: Insert all points — remap first_validator_id for founder-owned and remapped orphan owners
  const insertedPoints = await upsertBatch(TEST_REF, 'points', allPoints, ['id'], (row) => ({
    ...row,
    first_validator_id: row.first_validator_id === PROD_UUID
      ? TEST_UUID
      : (orphanOwnerRemap[row.first_validator_id] ?? row.first_validator_id),
  }));
  log(`  points: ${insertedPoints} rows upserted`);

  // 4c: Insert stories — remap author_id
  const insertedStories = await upsertBatch(TEST_REF, 'stories', prodStories, ['id'], (row) => ({
    ...row,
    author_id: TEST_UUID,
  }));
  log(`  stories: ${insertedStories} rows upserted`);

  // 4d: Insert story_points — PK is (story_id, point_id), remap author_id
  if (prodStoryPoints.length > 0) {
    const n = await upsertBatch(TEST_REF, 'story_points', prodStoryPoints, ['story_id', 'point_id'], (row) => ({
      ...row,
      author_id: row.author_id === PROD_UUID ? TEST_UUID : row.author_id,
    }));
    log(`  story_points: ${n} rows upserted`);
  }

  // 4e: Insert point_positions — UNIQUE(point_id, user_id), remap user_id
  if (prodPositions.length > 0) {
    const n = await upsertBatch(TEST_REF, 'point_positions', prodPositions, ['point_id', 'user_id'], (row) => ({
      ...row,
      user_id: row.user_id === PROD_UUID ? TEST_UUID : row.user_id,
    }));
    log(`  point_positions: ${n} rows upserted`);
  }

  // Row-count assertion
  log('\nStep 4 assertion: Verifying row counts...');
  // story_points has no id column — use story_id for counting
  const assertions = [
    { table: 'points',          filter: `first_validator_id=eq.${TEST_UUID}`, col: 'id',       expected: prodPoints.length },
    { table: 'stories',         filter: `author_id=eq.${TEST_UUID}`,          col: 'id',       expected: prodStories.length },
    { table: 'story_points',    filter: `author_id=eq.${TEST_UUID}`,          col: 'story_id', expected: prodStoryPoints.length },
    { table: 'point_positions', filter: `user_id=eq.${TEST_UUID}`,            col: 'id',       expected: prodPositions.length },
  ];
  let mismatch = false;
  for (const { table, filter, col, expected } of assertions) {
    const rows = await restGet(TEST_API, table, `${filter}&select=${col}`, TEST_KEY);
    const ok = rows.length === expected;
    log(`  ${ok ? 'OK' : 'MISMATCH'} ${table}: exported ${expected}, test has ${rows.length}`);
    if (!ok) mismatch = true;
  }
  if (mismatch) abort('Row count mismatch detected. Manual inspection required before re-enabling triggers.');

  // ---- Step 4.5: Re-enable triggers ----
  log('\nStep 4.5: Re-enabling triggers on TEST DB...');
  await execMgmtSQL(TEST_REF, enableSQL);
  log('  Verifying trigger states:');
  await verifyTriggers(TEST_REF, true);

  // ---- Step 5: P800 supersede backfill ----
  log('\nStep 5: Running P800 supersede backfill on test...');

  const before = await restGet(TEST_API, 'points', `superseded_by=not.is.null&select=id`, TEST_KEY);

  // Disable invariant trigger (ordering issue during bulk UPDATE — same as in migration)
  await execMgmtSQL(TEST_REF, `ALTER TABLE points DISABLE TRIGGER trg_enforce_supersede_invariants;`);

  await execMgmtSQL(TEST_REF, `
WITH versioned AS (
  SELECT
    p.id,
    (SELECT t FROM unnest(p.system_tags) t WHERE t ~ '^st\\d+$' LIMIT 1) AS st_tag,
    'misunderstanding' = ANY(p.system_tags) AS has_misunderstanding,
    (SELECT (substring(t FROM 2))::INTEGER
       FROM unnest(p.system_tags) t WHERE t ~ '^v\\d+$'
       ORDER BY t LIMIT 1) AS version
  FROM points p
  WHERE EXISTS (SELECT 1 FROM unnest(p.system_tags) t WHERE t ~ '^v\\d+$')
    AND EXISTS (SELECT 1 FROM unnest(p.system_tags) t WHERE t ~ '^st\\d+$')
),
ordered AS (
  SELECT id, st_tag, has_misunderstanding, version,
    LEAD(id) OVER (
      PARTITION BY st_tag, has_misunderstanding
      ORDER BY version NULLS LAST
    ) AS next_id
  FROM versioned
)
UPDATE points SET superseded_by = ordered.next_id
FROM ordered
WHERE points.id = ordered.id
  AND ordered.next_id IS NOT NULL
  AND points.superseded_by IS NULL;
  `);

  await execMgmtSQL(TEST_REF, `ALTER TABLE points ENABLE TRIGGER trg_enforce_supersede_invariants;`);

  const after = await restGet(TEST_API, 'points', `superseded_by=not.is.null&select=id`, TEST_KEY);
  log(`  Backfill: ${after.length - before.length} new supersede pairs wired (total: ${after.length})`);

  } catch (err) {
    log('\nERROR during mutations — re-enabling triggers before exit...');
    await execMgmtSQL(TEST_REF, enableSQL).catch(e => log(`  WARNING: Could not re-enable triggers: ${e.message}`));
    throw err;
  }

  log('\n=== COPY COMPLETE ===');
  log(`Copied ${prodPoints.length} founder points + ${orphanPoints.length} orphan points, ${prodStories.length} stories, ${prodPositions.length} positions to test.`);
  log('Run --step=inspect to review pairs and generate manual wiring SQL.');
}

// ============================================================================
// Step inspect: 3-bucket inspector
// ============================================================================

async function stepInspect() {
  log('Step 6: Inspecting supersede pairs on TEST DB...');
  const { test_uuid: TEST_UUID } = loadFingerprint();
  log(`  Test UUID: ${TEST_UUID}`);

  const points = await fetchAll(TEST_API, 'points', `first_validator_id=eq.${TEST_UUID}`, TEST_KEY);
  log(`  Found ${points.length} founder-owned points on test.`);

  // Group by st-tag
  const groups = {};
  for (const p of points) {
    const stTag = (p.system_tags || []).find(t => /^st\d+$/.test(t));
    if (!stTag) continue;
    if (!groups[stTag]) groups[stTag] = [];
    groups[stTag].push(p);
  }

  // Producer-consumer queue: handles both pre-buffered and future lines
  const _lineQueue = [];
  let _lineWaiter = null;
  let _rlClosed = false;
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  rl.on('line', (line) => {
    if (_lineWaiter) { const r = _lineWaiter; _lineWaiter = null; r(line); }
    else { _lineQueue.push(line); }
  });
  rl.on('close', () => {
    _rlClosed = true;
    if (_lineWaiter) { const r = _lineWaiter; _lineWaiter = null; r(''); }
  });
  const ask = (q) => {
    process.stdout.write(q);
    if (_lineQueue.length > 0) return Promise.resolve(_lineQueue.shift());
    if (_rlClosed) { process.stdout.write('  (skipped — stdin closed)\n'); return Promise.resolve(''); }
    return new Promise(resolve => { _lineWaiter = resolve; });
  };

  const wiringPairs = [];
  const tags = Object.keys(groups).sort((a, b) =>
    parseInt(a.replace('st', ''), 10) - parseInt(b.replace('st', ''), 10)
  );

  // ---- Bucket A: Already wired ----
  log('\n--- Bucket A: Already wired by backfill ---');
  let bucketA = 0;
  for (const tag of tags) {
    const wired = groups[tag].filter(p => p.superseded_by);
    if (wired.length > 0) {
      bucketA++;
      log(`  ${tag}:`);
      for (const p of [...groups[tag]].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))) {
        const v = (p.system_tags || []).find(t => /^v\d+$/.test(t)) || '?';
        const arrow = p.superseded_by
          ? `superseded_by ${p.superseded_by.slice(0, 8)}...`
          : '(head)';
        log(`    ${p.id.slice(0, 8)}...  v=${v}  ${p.created_at.slice(0, 10)}  ${arrow}`);
      }
    }
  }
  log(`  Total: ${bucketA} group(s) already wired`);

  // ---- Bucket C: Singletons ----
  log('\n--- Bucket C: Singletons -- no version history (skip) ---');
  let bucketC = 0;
  for (const tag of tags) {
    const pts = groups[tag];
    if (pts.length === 1 && !pts[0].superseded_by) {
      bucketC++;
      const v = (pts[0].system_tags || []).find(t => /^v\d+$/.test(t)) || 'none';
      log(`  ${tag}: ${pts[0].id.slice(0, 8)}...  v=${v}  (singleton)`);
    }
  }
  log(`  Total: ${bucketC} singleton(s)`);

  // ---- Bucket B: Needs decision ----
  log('\n--- Bucket B: Multiple unwired points -- your decision needed ---');
  let bucketB = 0;
  for (const tag of tags) {
    const unwired = groups[tag].filter(p => !p.superseded_by);
    if (unwired.length < 2) continue;
    bucketB++;

    log(`\n  === ${tag} (${unwired.length} unwired points) ===`);
    const sorted = [...unwired].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      const v = (p.system_tags || []).find(t => /^v\d+$/.test(t)) || '?';
      const stmt = (p.statement || '').slice(0, 80);
      log(`  [${i + 1}] ${p.id.slice(0, 8)}...  v=${v}  ${p.created_at.slice(0, 10)}  "${stmt}"`);
    }

    const answer = await ask(`  Which is the OLD version (1-${sorted.length}, or 's' to skip): `);
    const trimmed = answer.trim().toLowerCase();
    if (trimmed === 's' || !trimmed) { log(`  Skipped ${tag}.`); continue; }
    const oldIdx = parseInt(trimmed, 10) - 1;
    if (isNaN(oldIdx) || oldIdx < 0 || oldIdx >= sorted.length) {
      log(`  Invalid input -- skipping ${tag}.`);
      continue;
    }
    const oldPt = sorted[oldIdx];
    const newPt = sorted.filter((_, i) => i !== oldIdx).slice(-1)[0]; // newest remaining
    const oldV = (oldPt.system_tags || []).find(t => /^v\d+$/.test(t)) || '?';
    const newV = (newPt.system_tags || []).find(t => /^v\d+$/.test(t)) || '?';
    wiringPairs.push({ old_id: oldPt.id, new_id: newPt.id, label: `${tag} v${oldV} to v${newV}` });
    log(`  Wired: ${oldPt.id.slice(0, 8)}... (v${oldV}) -> ${newPt.id.slice(0, 8)}... (v${newV})`);
  }

  rl.close();
  log(`\nBucket B: ${bucketB} group(s) needed decisions, ${wiringPairs.length} pairs confirmed.`);

  if (wiringPairs.length === 0) {
    log('No manual wiring SQL to write (all handled by backfill or skipped).');
    return;
  }

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const sqlPath = join(__dir, `../scripts/archive/migrations/${today}-p800-supersede-wiring.sql`);

  const sqlContent = [
    '-- P800 supersede wiring -- applied to test first, then same file applied to prod.',
    `-- Pairs confirmed by founder on ${new Date().toISOString().slice(0, 10)}.`,
    '',
    ...wiringPairs.map(({ old_id, new_id, label }) =>
      `UPDATE points SET superseded_by = '${new_id}' WHERE id = '${old_id}';  -- ${label}`
    ),
    '',
  ].join('\n');

  writeFileSync(sqlPath, sqlContent);
  log(`\nWiring SQL written: ${sqlPath}`);
  log('Review this file, then run:');
  log('  node scripts/archive/migrations/20260425-copy-prod-to-test.mjs --step=wire-prod --confirm');
}

// ============================================================================
// Step wire-prod: Apply wiring SQL to PROD (requires --confirm)
// ============================================================================

async function stepWireProd(hasConfirm) {
  if (!hasConfirm) {
    abort('--confirm required for --step=wire-prod. This mutates PRODUCTION. Add --confirm to proceed.');
  }

  const archiveDir = join(__dir, '../scripts/archive/migrations');
  const files = readdirSync(archiveDir)
    .filter(f => f.includes('p800-supersede-wiring') && f.endsWith('.sql'))
    .sort();

  if (!files.length) {
    abort('No wiring SQL file found in scripts/archive/migrations/. Run --step=inspect first.');
  }

  const latest = files[files.length - 1];
  const sqlPath = join(archiveDir, latest);
  const sql = readFileSync(sqlPath, 'utf8');

  log(`Applying wiring SQL to PROD DB. File: ${latest}`);
  log('--- SQL ---');
  log(sql);
  log('-----------');
  log('Querying PROD DB...');

  await execMgmtSQL(PROD_REF, sql);

  log('PROD wiring complete.');
  log('Verify: navigate to /point/{superseded-point-id} on prod and confirm the supersede banner appears.');
}

// ============================================================================
// Main
// ============================================================================

const args = process.argv.slice(2);
const stepArg = args.find(a => a.startsWith('--step='));
const step = stepArg ? stepArg.slice('--step='.length) : null;
const hasConfirm = args.includes('--confirm');

if (!step) {
  console.error('Usage: node scripts/archive/migrations/20260425-copy-prod-to-test.mjs --step=<step>');
  console.error('Steps: uuids, backup, export, copy, inspect, wire-prod');
  process.exit(1);
}

if (!FOUNDER_EMAIL) {
  console.error('ABORT: COPY_PROD_FOUNDER_EMAIL not set in .env.local');
  process.exit(1);
}

const STEPS = {
  uuids:       stepUuids,
  backup:      stepBackup,
  export:      stepExport,
  copy:        stepCopy,
  inspect:     stepInspect,
  'wire-prod': () => stepWireProd(hasConfirm),
};

if (!STEPS[step]) {
  console.error(`Unknown step "${step}". Valid: ${Object.keys(STEPS).join(', ')}`);
  process.exit(1);
}

STEPS[step]().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
