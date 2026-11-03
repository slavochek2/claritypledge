/**
 * e2e-exclusive-specs.mjs — P1607: which e2e specs change SERVER-WIDE state, so a run containing one
 * must take the whole self-hosted server instead of one slot.
 *
 * Nothing here is a hand-kept list of spec names. The names the detector looks for are derived at run
 * time from where they are defined (the migrations), and each detection path has a known member in
 * src/tests/p1607-e2e-server-wide-detector.test.ts, checked against the real tree (epistemic gate 7e):
 *
 *   1. a write to a singleton table (a table with a `singleton` column: the kill switch is the known one)
 *   2. a call to a global tick or cron-scheduled function (`.rpc('x')`, `SELECT/CALL x(`)
 *   3. a change to the cron schedule itself (cron.schedule / unschedule / alter_job, writes to cron.*)
 *   4. a write with no filter: a client update/delete with no row filter, or SQL UPDATE/DELETE without
 *      WHERE, or TRUNCATE
 *   5. an explicit annotation, for what a text scan cannot see (a spec that READS a table every run writes
 *      to, a name built from the clock): a line `// e2e-exclusive: <reason>` anywhere in the spec or a helper
 *      it imports. The reason is required; an annotation without one still counts, and says so. A reason that
 *      starts with `<` is a placeholder, so documentation can show the form without annotating itself.
 *
 * A spec also counts when a local helper it imports (transitively, within e2e/) does any of the above.
 *
 * Which specs a RUN covers is not re-implemented here: `playwright test --list --reporter=json` is asked,
 * with the run's own arguments, so file, directory, project and filter arguments resolve with the
 * config's own project rules. When that listing fails the run is treated as server-wide (fail closed).
 *
 * The files are read with the TypeScript parser (already a dependency), so what is checked is the write's own
 * call chain, never the text around it: a filter in a LATER statement never excuses a write, and a WHERE in a
 * different SQL statement never excuses an UPDATE. Fails closed to exclusive when a file cannot be read, a
 * local import resolves to nothing, the migrations yield no names, or the run's spec listing fails.
 *
 * STAYS UNSEEN: lower-case SQL; SQL or table names built by a function call or from a value the file does
 * not hold as a string; a query builder passed through a variable and filtered in another statement is
 * SEEN as unfiltered (conservative), but a write made by code outside e2e/ (an imported script) is not
 * followed; a WHERE that exists only inside a sub-select of the same statement counts as a WHERE.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// Loaded on first use, so the many processes that only import this module (every Playwright worker loads the
// config) do not pay for the parser.
let tsCache;
const tsLib = () => (tsCache ??= createRequire(import.meta.url)('typescript'));

const CLIENT_WRITES = new Set(['update', 'insert', 'upsert', 'delete']);
// Row filters that scope a client write to rows the test owns. Range filters (lt/gt/neq...) do not scope it.
const SCOPING_FILTERS = new Set(['eq', 'in', 'match', 'is', 'or', 'like', 'ilike', 'contains', 'filter']);

/**
 * Names derived from the migrations: singleton tables and global tick / cron-scheduled functions.
 * `ok` is false when the migrations could not be read or yielded nothing at all: callers then treat every
 * spec as server-wide (fail closed), because an empty derivation would otherwise read as "nothing is".
 */
export function deriveServerWideNames(migrationsDir) {
  const singletonTables = new Set();
  const tickFunctions = new Set();
  let files = [];
  let problem = null;
  try { files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')); } catch (err) { problem = `cannot read ${migrationsDir} (${err.code ?? err.message})`; }
  if (!problem && files.length === 0) problem = `no migrations in ${migrationsDir}`;
  for (const f of files) {
    let sql;
    try { sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8'); } catch { problem = `cannot read migration ${f}`; continue; }
    for (const m of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?([a-z_0-9]+)\s*\(([\s\S]*?)\n\)\s*;/gi)) {
      if (/\bsingleton\b/i.test(m[2])) singletonTables.add(m[1]);
    }
    for (const m of sql.matchAll(/CREATE (?:OR REPLACE )?(?:FUNCTION|PROCEDURE)\s+(?:public\.)?([a-z_0-9]*_tick)\b/gi)) tickFunctions.add(m[1]);
    for (const m of sql.matchAll(/cron\.schedule\s*\(([\s\S]*?)\)\s*;/gi)) {
      for (const c of m[1].matchAll(/(?:SELECT|CALL|PERFORM)\s+(?:public\.)?([a-z_0-9]+)\s*\(/gi)) tickFunctions.add(c[1]);
    }
  }
  if (!problem && singletonTables.size === 0 && tickFunctions.size === 0) problem = 'the migrations yielded no singleton table and no tick function';
  return { singletonTables: [...singletonTables].sort(), tickFunctions: [...tickFunctions].sort(), ok: !problem, problem };
}

const ANNOTATION = /^[ \t]*\/\/[ \t]*e2e-exclusive:[ \t]*(.*)$/gm;

/** SQL reasons for one string's text (statements split on ';', so a WHERE in another statement excuses nothing). */
function scanSql(text, names, reasons) {
  for (const stmt of text.split(';')) {
    for (const table of names.singletonTables) {
      if (new RegExp(`\\b(?:UPDATE|INSERT\\s+INTO|DELETE\\s+FROM|TRUNCATE(?:\\s+TABLE)?)\\s+(?:public\\.)?${table}\\b`, 'i').test(stmt)) reasons.add(`writes the singleton table ${table}`);
    }
    for (const fn of names.tickFunctions) {
      if (new RegExp(`\\b(?:SELECT|CALL|PERFORM)\\s+(?:public\\.)?${fn}\\s*\\(`, 'i').test(stmt)) reasons.add(`calls the global function ${fn}`);
    }
    if (/\bcron\.(?:schedule|schedule_in_database|unschedule|alter_job)\b|\b(?:UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+cron\./i.test(stmt)) reasons.add('changes the cron schedule');
    // Upper-case keywords only: prose and class names ("truncate", "delete from another tab") are not SQL.
    // Lower-case SQL is therefore not seen (a known limit, listed in the header).
    const m = /\b(UPDATE\s+[\w."?]+\s+SET\b|DELETE\s+FROM\s+[\w."?]+|TRUNCATE\s+(?:TABLE\s+)?[\w."?]+)([^]*)$/.exec(stmt);
    if (m && (/^TRUNCATE/.test(m[1]) || !/\bWHERE\b/i.test(m[2]))) reasons.add(`SQL ${m[1].trim().split(/\s+/).slice(0, 3).join(' ')} with no WHERE`);
  }
}

/**
 * What one file does to server-wide state, from its syntax tree (not its text), so a filter in a LATER
 * statement never excuses a write: the write's own call chain is what counts.
 * Returns { reasons: string[], imports: string[] } (imports are relative specifiers, for the caller to follow).
 */
function scanSource(text, fileName, names) {
  const ts = tsLib();
  const kind = /\.tsx$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2022, true, kind);
  const reasons = new Set();
  const imports = [];

  for (const m of text.matchAll(ANNOTATION)) {
    const why = m[1].trim();
    if (why.startsWith('<')) continue; // a placeholder in documentation, not an annotation
    reasons.add(why ? `annotated e2e-exclusive: ${why}` : 'annotated e2e-exclusive (no reason given)');
  }

  // const NAME = <initializer> at any depth: lets a table or function name held in a constant, and a query
  // builder held in a constant, be read.
  const consts = new Map();
  const inits = new Map();
  const collect = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && (n.parent.flags & ts.NodeFlags.Const)) {
      inits.set(n.name.text, n.initializer);
      if (ts.isStringLiteralLike(n.initializer)) consts.set(n.name.text, n.initializer.text);
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);

  /** The text of a string-valued expression, with '?' for what is not known; null when it is not a string expression. */
  const strOf = (n) => {
    if (!n) return null;
    if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n)) return strOf(n.expression);
    if (ts.isStringLiteralLike(n)) return n.text;
    if (ts.isIdentifier(n)) return consts.has(n.text) ? consts.get(n.text) : null;
    if (ts.isTemplateExpression(n)) return n.head.text + n.templateSpans.map(sp => '?' + sp.literal.text).join('');
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const l = strOf(n.left), r = strOf(n.right);
      return l === null && r === null ? null : `${l ?? '?'}${r ?? '?'}`;
    }
    return null;
  };

  /**
   * Is this expression a PostgREST query builder, i.e. does it hang off a `.from(...)` call (directly, or through
   * a const)? Returns { table } (table may be null when its name is not a known string) or null. A receiver that
   * is not one, such as a Map or Set, is not a database write and is ignored.
   */
  const builderRoot = (n, depth = 0) => {
    if (!n || depth > 8) return null;
    if (ts.isParenthesizedExpression(n) || ts.isAwaitExpression(n) || ts.isNonNullExpression(n) || ts.isAsExpression(n)) return builderRoot(n.expression, depth + 1);
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      if (n.expression.name.text === 'from') return { table: strOf(n.arguments[0]) };
      return builderRoot(n.expression.expression, depth + 1);
    }
    if (ts.isPropertyAccessExpression(n)) return builderRoot(n.expression, depth + 1);
    if (ts.isIdentifier(n) && inits.has(n.text)) return builderRoot(inits.get(n.text), depth + 1);
    return null;
  };

  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const method = n.expression.name.text;
      if (CLIENT_WRITES.has(method)) {
        // The table: the .from('x') this call hangs off, when it is one.
        const root = builderRoot(n.expression.expression);
        const table = root ? root.table : null;
        // The write's own chain: .eq() etc. called on its result, up to the end of that expression.
        const after = [];
        let cur = n;
        while (cur.parent && ts.isPropertyAccessExpression(cur.parent) && cur.parent.expression === cur
          && cur.parent.parent && ts.isCallExpression(cur.parent.parent) && cur.parent.parent.expression === cur.parent) {
          after.push(cur.parent.name.text);
          cur = cur.parent.parent;
        }
        if (!root) { /* not a query builder (a Map or Set, say) */ }
        else if (table && names.singletonTables.includes(table)) reasons.add(`writes the singleton table ${table}`);
        else if ((method === 'update' || method === 'delete') && !after.some(f => SCOPING_FILTERS.has(f))) {
          reasons.add(`${method}s every row of ${table ?? 'a table'} (no row filter in the call chain)`);
        }
      }
      if (method === 'rpc') {
        const fn = strOf(n.arguments[0]);
        if (fn && names.tickFunctions.includes(fn)) reasons.add(`calls the global function ${fn}`);
      }
    }
    // Strings: each literal on its own, and each maximal concatenation as one text.
    if (ts.isStringLiteralLike(n) || ts.isTemplateExpression(n)) {
      const t = strOf(n);
      if (t) scanSql(t, names, reasons);
    } else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken
      && !(ts.isBinaryExpression(n.parent) && n.parent.operatorToken.kind === ts.SyntaxKind.PlusToken)) {
      const t = strOf(n);
      if (t) scanSql(t, names, reasons);
    }
    // Local imports, for the caller to follow.
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) imports.push(n.moduleSpecifier.text);
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) imports.push(n.arguments[0].text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { reasons: [...reasons], imports: imports.filter(i => i.startsWith('.')) };
}

const EXT = ['', '.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx', '/index.js', '/index.mjs'];
/** The file a relative import names: { file, inE2e } or null when nothing is there (unresolved). */
function resolveImport(from, spec, repoDir) {
  const base = path.resolve(path.dirname(from), spec);
  for (const e of EXT) {
    const p = base + e;
    try {
      if (fs.statSync(p).isFile()) return { file: p, inE2e: p.startsWith(path.join(repoDir, 'e2e') + path.sep) };
    } catch { /* next */ }
  }
  return null;
}

/**
 * Map of file -> reasons it is server-wide (own syntax first, then helpers it imports, transitively).
 * Fails closed: an unreadable file, an import that resolves to nothing, or names that could not be derived
 * from the migrations make the file server-wide, with that as the reason.
 */
export function classifyFiles(files, { repoDir, names } = {}) {
  const n = names ?? deriveServerWideNames(path.join(repoDir, 'supabase', 'migrations'));
  const out = new Map();
  if (!n.ok) {
    for (const file of files) out.set(file, [`server-wide names could not be derived, so this is treated as server-wide: ${n.problem}`]);
    return out;
  }
  const cache = new Map();
  const info = (file) => {
    if (!cache.has(file)) {
      let text = null;
      try { text = fs.readFileSync(file, 'utf8'); } catch { /* unreadable */ }
      cache.set(file, text === null ? { unreadable: true, reasons: [], imports: [] } : scanSource(text, file, n));
    }
    return cache.get(file);
  };
  for (const file of files) {
    const seen = new Set();
    const walk = (f, chain) => {
      if (seen.has(f)) return null;
      seen.add(f);
      const o = info(f);
      const via = chain.length ? `via ${chain.map(c => path.relative(repoDir, c)).join(' > ')}: ` : '';
      if (o.unreadable) return `${via}file could not be read, so it is treated as server-wide`;
      if (o.reasons.length) return via + o.reasons[0];
      for (const spec of o.imports) {
        const r = resolveImport(f, spec, repoDir);
        if (!r) return `${via}import "${spec}" in ${path.relative(repoDir, f)} resolves to no file, so it is treated as server-wide`;
        if (!r.inE2e) continue; // code outside e2e/ is not followed (a known limit)
        const hit = walk(r.file, [...chain, r.file]);
        if (hit) return hit;
      }
      return null;
    };
    const first = walk(file, []);
    if (first) {
      const own = info(file);
      out.set(file, own.reasons.length ? own.reasons : [first]);
    }
  }
  return out;
}

/** Every server-wide spec in the repository's e2e/ tree (for the docs, the control tests and unknown runs). */
export function allServerWideSpecs({ repoDir }) {
  const specs = [];
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); } else if (/\.spec\.ts$/.test(e.name)) specs.push(p);
    }
  };
  walk(path.join(repoDir, 'e2e'));
  return classifyFiles(specs.sort(), { repoDir });
}

function playwrightCli(repoDir) {
  return path.join(repoDir, 'node_modules', '@playwright', 'test', 'cli.js');
}

/** Drop `--reporter` (we set our own) from the run's arguments, in both `--reporter x` and `--reporter=x` forms. */
function listingArgs(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--reporter') { i++; continue; }
    if (a.startsWith('--reporter=')) continue;
    out.push(a);
  }
  return out;
}

/**
 * The listing child must print its JSON to stdout. A caller that reads results the documented way
 * (--reporter=json with PLAYWRIGHT_JSON_OUTPUT_NAME) has set the variables that send the JSON reporter to a
 * file, and the child would otherwise write the listing over the real run's report. The run's own server-wide
 * plan (E2E_SERVERWIDE_PLAN) is dropped too: the listing must not be shaped by it.
 */
export function listingEnv(env) {
  const out = { ...env };
  for (const k of Object.keys(out)) if (k.startsWith('PLAYWRIGHT_JSON_OUTPUT') || k === 'E2E_SERVERWIDE_PLAN') delete out[k];
  return out;
}

/**
 * The spec files a run covers, as Playwright resolves them. `pre` are the arguments before the `test`
 * subcommand (a --config there must reach the listing too), `args` those after it, both verbatim, so value
 * flags and their values stay together. { files, error }: error is set when the listing failed.
 */
export function listRunSpecs({ repoDir, pre = [], args, env = process.env }) {
  const r = spawnSync(process.execPath, [playwrightCli(repoDir), ...listingArgs(pre), 'test', '--list', '--reporter=json', ...listingArgs(args)], {
    cwd: repoDir, env: listingEnv(env), encoding: 'utf8', timeout: 120_000, maxBuffer: 256 * 1024 * 1024,
  });
  if (r.error) return { files: [], error: r.error.message };
  const out = r.stdout ?? '';
  const start = out.indexOf('{');
  let json;
  try { json = JSON.parse(out.slice(start)); } catch { return { files: [], error: `unreadable listing (exit ${r.status})` }; }
  if (r.status !== 0 || (json.errors && json.errors.length)) {
    return { files: [], error: (json.errors?.[0]?.message ?? `playwright --list exited ${r.status}`).split('\n')[0] };
  }
  const root = json.config?.rootDir ?? path.join(repoDir, 'e2e');
  const files = new Set();
  for (const s of json.suites ?? []) if (s.file) files.add(path.resolve(root, s.file));
  return { files: [...files].sort(), error: null };
}

/** Split the arguments after `node playwright` at the `test` subcommand: { pre, post }, or null when there is none. */
export function splitRunArgs(args) {
  const i = args.indexOf('test');
  return i < 0 ? null : { pre: args.slice(0, i), post: args.slice(i + 1) };
}

/**
 * Is this run server-wide? { exclusive, serverWideFiles, files, error, forced, unknown }.
 * E2E_SELFHOSTED_EXCLUSIVE=1 forces it; a failed listing counts as exclusive (fail closed). In both of those
 * cases the run's real spec set is unknown, so `serverWideFiles` is every server-wide spec in the tree (a
 * superset is safe for what it is used for: keeping those specs from racing each other) and `unknown` is true.
 */
export function detectServerWide({ repoDir, pre = [], args, env = process.env }) {
  const wholeTree = () => [...allServerWideSpecs({ repoDir }).keys()];
  if (env.E2E_SELFHOSTED_EXCLUSIVE === '1') return { exclusive: true, serverWideFiles: wholeTree(), files: [], error: null, forced: true, unknown: true };
  const listed = listRunSpecs({ repoDir, pre, args, env });
  if (listed.error) return { exclusive: true, serverWideFiles: wholeTree(), files: [], error: listed.error, forced: false, unknown: true };
  const map = classifyFiles(listed.files, { repoDir });
  const serverWideFiles = [...map.keys()];
  return { exclusive: serverWideFiles.length > 0, serverWideFiles, files: listed.files, error: null, forced: false, unknown: false, reasons: map };
}

/** detectServerWide for a process.argv.slice(2): no `test` subcommand at all is a doubt, and a doubt is exclusive. */
export function detectForArgv({ repoDir, argv, env = process.env }) {
  const split = splitRunArgs(argv);
  if (!split) {
    const wholeTree = [...allServerWideSpecs({ repoDir }).keys()];
    return { exclusive: true, serverWideFiles: wholeTree, files: [], error: 'no `test` subcommand in the arguments', forced: false, unknown: true };
  }
  return detectServerWide({ repoDir, pre: split.pre, args: split.post, env });
}
