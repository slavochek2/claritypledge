/**
 * @file p1509-fk-graph.ts
 * @description P1509 v16: derive the foreign-key graph from `supabase/migrations/*.sql`, so the seed script's reset
 * can be checked against EVERY row a delete would cascade into, block on, or null out, instead of the handful someone
 * remembered. Pure: text in, edges out. The graph replays the migrations in file-name order: CREATE TABLE and
 * ALTER TABLE ... ADD [COLUMN | CONSTRAINT] create edges; DROP CONSTRAINT, DROP COLUMN, DROP TABLE and renames remove
 * or move them; DO blocks are searched for the same ALTER TABLE statements. Function bodies are skipped (they run at
 * call time, not at migration time).
 *
 * It cannot see DDL that is built from a string with `%I`/`%s` formatting or concatenation. Those statements are
 * returned in `unresolved` instead of being ignored (`parserProblems` is what the reset checks), and `referenceTokens`/`declarations` let a test prove no `REFERENCES` keyword
 * inside a CREATE/ALTER TABLE statement went unparsed.
 */

export type OnDelete = 'CASCADE' | 'SET NULL' | 'SET DEFAULT' | 'NO ACTION' | 'RESTRICT';

export interface FkEdge {
  child: string;
  columns: string[];
  parent: string;
  onDelete: OnDelete;
  /** Constraint name (explicit, or Postgres's default `<table>_<column>_fkey`). */
  name: string;
  /** Migration file that last (re)defined it. */
  file: string;
}

export interface FkGraph {
  edges: FkEdge[];
  /** `REFERENCES` keywords found inside CREATE TABLE / ALTER TABLE statements. */
  referenceTokens: number;
  /** Foreign keys those statements declared. Must equal `referenceTokens`. */
  declarations: number;
  /** DDL whose target could not be resolved (dynamic SQL built with format()/concatenation). */
  unresolved: Unresolved[];
  /** Columns the last migration left NOT NULL (or in a primary key), as `table.column`. */
  notNull: Set<string>;
  /** Triggers that fire on UPDATE (BEFORE, AFTER or INSTEAD OF) and survive the last migration. */
  updateTriggers: UpdateTrigger[];
}

export interface Unresolved { file: string; text: string }
export interface UpdateTrigger {
  table: string;
  name: string;
  timing: 'BEFORE' | 'AFTER' | 'INSTEAD OF';
  /** `UPDATE OF a, b`: the trigger fires only when one of these columns is in the SET list. Null: any UPDATE. */
  ofColumns: string[] | null;
  file: string;
}

export interface MigrationFile { name: string; text: string }

interface Statement { text: string; doBody?: string }

/** Splits SQL into statements, dropping comments and string literals (their text is kept when `keepStrings`), and
 * lifting the body of a `DO $$ ... $$` block out so it can be parsed on its own. Other dollar-quoted bodies
 * (functions) are discarded. */
export function splitStatements(sql: string, keepStrings = false): Statement[] {
  const out: Statement[] = [];
  let cur = '';
  let doBody: string | undefined;
  let i = 0;
  const n = sql.length;
  const flush = () => {
    const text = cur.replace(/\s+/g, ' ').trim();
    if (text) out.push(doBody === undefined ? { text } : { text, doBody });
    cur = '';
    doBody = undefined;
  };
  while (i < n) {
    const c = sql[i] as string;
    const d = sql[i + 1];
    if (c === '-' && d === '-') {
      while (i < n && sql[i] !== '\n') i++;
      cur += ' ';
    } else if (c === '/' && d === '*') {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') { depth++; i += 2; }
        else if (sql[i] === '*' && sql[i + 1] === '/') { depth--; i += 2; }
        else i++;
      }
      cur += ' ';
    } else if (c === "'") {
      let j = i + 1;
      let s = '';
      while (j < n) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { s += "'"; j += 2; continue; }
          break;
        }
        s += sql[j];
        j++;
      }
      i = j + 1;
      cur += keepStrings ? ` ${s} ` : " '' ";
    } else if (c === '"') {
      const j = sql.indexOf('"', i + 1);
      const end = j === -1 ? n : j;
      cur += sql.slice(i + 1, end);
      i = end + 1;
    } else if (c === '$') {
      const tag = /^\$[A-Za-z_]*[A-Za-z0-9_]*\$/.exec(sql.slice(i, i + 64))?.[0];
      if (tag && (tag === '$$' || /^\$[A-Za-z_][A-Za-z0-9_]*\$$/.test(tag))) {
        const end = sql.indexOf(tag, i + tag.length);
        const bodyEnd = end === -1 ? n : end;
        if (/^\s*do\b/i.test(cur)) doBody = sql.slice(i + tag.length, bodyEnd);
        cur += ' $$ $$ ';
        i = bodyEnd + (end === -1 ? 0 : tag.length);
      } else {
        cur += c;
        i++;
      }
    } else if (c === ';') {
      flush();
      i++;
    } else {
      cur += c;
      i++;
    }
  }
  flush();
  return out;
}

/** Splits on commas that are not inside parentheses. */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/** `child.column->parent`, the key of the seed script's classification map. */
export const edgeKey = (e: Pick<FkEdge, 'child' | 'columns' | 'parent'>): string => `${e.child}.${e.columns.join(',')}->${e.parent}`;

const ident = (s: string): string => s.trim().replace(/^public\./i, '').toLowerCase();
const cols = (s: string): string[] => s.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);

/** The text between the first '(' after `from` and its matching ')'. */
function parenBody(s: string, from: number): string | null {
  const open = s.indexOf('(', from);
  if (open === -1) return null;
  let depth = 0;
  for (let k = open; k < s.length; k++) {
    if (s[k] === '(') depth++;
    else if (s[k] === ')' && --depth === 0) return s.slice(open + 1, k);
  }
  return null;
}

interface RawFk { columns: string[]; parent: string; onDelete: OnDelete; name?: string }

/** The foreign key declared by one column definition or table constraint, or null. `firstColumn` is the column a
 * column-level REFERENCES belongs to. */
function parseFkItem(item: string, firstColumn: string | null): RawFk | null {
  const m = /\breferences\s+([\w."]+)/i.exec(item);
  if (!m) return null;
  const before = item.slice(0, m.index);
  const after = item.slice(m.index + m[0].length);
  const nameMatch = /\bconstraint\s+(\w+)/i.exec(before);
  const tableLevel = /foreign\s+key\s*\(([^)]*)\)\s*$/i.exec(before);
  const columns = tableLevel ? cols(tableLevel[1] as string) : firstColumn ? [firstColumn] : [];
  if (columns.length === 0) return null;
  const od = /\bon\s+delete\s+(cascade|set\s+null|set\s+default|restrict|no\s+action)/i.exec(after);
  const onDelete = (od ? (od[1] as string).replace(/\s+/g, ' ').toUpperCase() : 'NO ACTION') as OnDelete;
  const raw: RawFk = { columns, parent: ident(m[1] as string), onDelete };
  if (nameMatch) raw.name = (nameMatch[1] as string).toLowerCase();
  return raw;
}

export function buildFkGraph(files: readonly MigrationFile[]): FkGraph {
  const fks = new Map<string, FkEdge>(); // key: child|name
  const tables = new Set<string>();
  const columns = new Map<string, Set<string>>(); // table -> columns, where the migrations declared them
  const notNull = new Set<string>(); // table.column
  const triggers = new Map<string, UpdateTrigger>(); // table|name
  const unresolved: Unresolved[] = [];
  let referenceTokens = 0;
  let declarations = 0;
  let file = '';

  const colsOf = (t: string): Set<string> => {
    let c = columns.get(t);
    if (!c) { c = new Set(); columns.set(t, c); }
    return c;
  };
  const addColumn = (t: string, col: string, definition: string) => {
    colsOf(t).add(col);
    if (/\bnot\s+null\b/i.test(definition) || /\bprimary\s+key\b/i.test(definition)) notNull.add(`${t}.${col}`);
    else notNull.delete(`${t}.${col}`);
  };
  const dropColumn = (t: string, col: string) => { columns.get(t)?.delete(col); notNull.delete(`${t}.${col}`); };

  const add = (child: string, raw: RawFk) => {
    const name = raw.name ?? `${child}_${raw.columns.join('_')}_fkey`;
    // A re-declared constraint replaces the old one, as DROP + ADD would.
    fks.set(`${child}|${name}`, { child, columns: raw.columns, parent: raw.parent, onDelete: raw.onDelete, name, file });
    declarations++;
  };
  const countRefs = (text: string) => { referenceTokens += (text.match(/\breferences\b/gi) ?? []).length; };
  const dropWhere = (pred: (e: FkEdge) => boolean) => { for (const [k, e] of fks) if (pred(e)) fks.delete(k); };
  const dropTable = (t: string) => {
    tables.delete(t);
    columns.delete(t);
    for (const k of [...notNull]) if (k.startsWith(`${t}.`)) notNull.delete(k);
    for (const [k, tr] of [...triggers]) if (tr.table === t) triggers.delete(k);
    dropWhere((e) => e.child === t || e.parent === t);
  };

  const alter = (child: string, rest: string, stmt: string, dynamic: boolean) => {
    for (const action of splitTopLevel(rest)) {
      let m: RegExpExecArray | null;
      if ((m = /^add\s+constraint\s+(\w+)\s+(.*)$/i.exec(action))) {
        const raw = parseFkItem(m[2] as string, null);
        if (raw) add(child, { ...raw, name: (m[1] as string).toLowerCase() });
        const pk = /^primary\s+key\s*\(([^)]*)\)/i.exec(m[2] as string);
        if (pk) for (const c of cols(pk[1] as string)) notNull.add(`${child}.${c}`);
      } else if (/^add\s+foreign\s+key/i.test(action)) {
        const raw = parseFkItem(action, null);
        if (raw) add(child, raw);
      } else if ((m = /^add\s+primary\s+key\s*\(([^)]*)\)/i.exec(action))) {
        for (const c of cols(m[1] as string)) notNull.add(`${child}.${c}`);
      } else if ((m = /^add\s+(?:column\s+)?(if\s+not\s+exists\s+)?(\w+)\s+(.*)$/i.exec(action))) {
        const col = (m[2] as string).toLowerCase();
        if (m[1] && columns.get(child)?.has(col)) {
          // ADD COLUMN IF NOT EXISTS on a column that is already there changes nothing, REFERENCES included.
          if (/\breferences\b/i.test(m[3] as string)) declarations++;
          continue;
        }
        addColumn(child, col, m[3] as string);
        const raw = parseFkItem(m[3] as string, col);
        if (raw) add(child, raw);
      } else if ((m = /^alter\s+column\s+(\w+)\s+(set|drop)\s+not\s+null/i.exec(action))) {
        const key = `${child}.${(m[1] as string).toLowerCase()}`;
        if ((m[2] as string).toLowerCase() === 'set') notNull.add(key); else notNull.delete(key);
      } else if ((m = /^drop\s+constraint\s+(?:if\s+exists\s+)?(\S+)/i.exec(action))) {
        const name = (m[1] as string).replace(/"/g, '').toLowerCase();
        if (dynamic && /%/.test(name)) unresolved.push({ file, text: stmt.slice(0, 160) });
        else dropWhere((e) => e.child === child && e.name === name);
      } else if ((m = /^drop\s+column\s+(?:if\s+exists\s+)?(\w+)/i.exec(action))) {
        const col = (m[1] as string).toLowerCase();
        dropColumn(child, col);
        dropWhere((e) => e.child === child && e.columns.includes(col));
      } else if ((m = /^rename\s+column\s+(\w+)\s+to\s+(\w+)/i.exec(action))) {
        const from = (m[1] as string).toLowerCase();
        const to = (m[2] as string).toLowerCase();
        for (const e of fks.values()) if (e.child === child) e.columns = e.columns.map((c) => (c === from ? to : c));
        if (columns.get(child)?.delete(from)) colsOf(child).add(to);
        if (notNull.delete(`${child}.${from}`)) notNull.add(`${child}.${to}`);
      } else if ((m = /^rename\s+to\s+(\w+)/i.exec(action))) {
        const to = (m[1] as string).toLowerCase();
        for (const [k, e] of [...fks]) {
          if (e.child === child) { fks.delete(k); fks.set(`${to}|${e.name}`, { ...e, child: to }); }
        }
        for (const e of fks.values()) if (e.parent === child) e.parent = to;
        for (const k of [...notNull]) if (k.startsWith(`${child}.`)) { notNull.delete(k); notNull.add(`${to}.${k.slice(child.length + 1)}`); }
        for (const [k, tr] of [...triggers]) if (tr.table === child) { triggers.delete(k); triggers.set(`${to}|${tr.name}`, { ...tr, table: to }); }
        const c = columns.get(child);
        if (c) { columns.delete(child); columns.set(to, c); }
        tables.delete(child);
        tables.add(to);
      }
    }
  };

  const statement = (stmt: string, dynamic: boolean) => {
    let m: RegExpExecArray | null;
    if ((m = /^create\s+(?:unlogged\s+)?table\s+(if\s+not\s+exists\s+)?([\w."]+)\s*\(/i.exec(stmt))) {
      const child = ident(m[2] as string);
      if (m[1] && tables.has(child)) return; // a no-op: the table already exists
      tables.add(child);
      countRefs(stmt);
      const body = parenBody(stmt, m[0].length - 1);
      for (const item of splitTopLevel(body ?? '')) {
        const tableConstraint = /^(?:constraint\s+\w+\s+)?(?:foreign\s+key|primary\s+key|unique|check|exclude)\b/i.test(item);
        const first = tableConstraint ? null : (/^([\w"]+)/.exec(item)?.[1] ?? '').replace(/"/g, '').toLowerCase() || null;
        if (first && !/^(?:like)$/i.test(first)) addColumn(child, first, item);
        const pk = /^(?:constraint\s+\w+\s+)?primary\s+key\s*\(([^)]*)\)/i.exec(item);
        if (pk) for (const c of cols(pk[1] as string)) notNull.add(`${child}.${c}`);
        const raw = parseFkItem(item, first);
        if (raw) add(child, raw);
      }
    } else if ((m = /^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w."]+)\s+(.*)$/i.exec(stmt))) {
      countRefs(stmt);
      alter(ident(m[1] as string), m[2] as string, stmt, dynamic);
    } else if ((m = /^drop\s+table\s+(?:if\s+exists\s+)?(.*)$/i.exec(stmt))) {
      for (const t of splitTopLevel((m[1] as string).replace(/\s+(cascade|restrict)\s*$/i, '')).map(ident)) dropTable(t);
    } else if ((m = /^create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+(\w+)\s+(before|after|instead\s+of)\s+(.*?)\s+on\s+([\w."]+)/i.exec(stmt))) {
      const events = m[3] as string;
      if (/\bupdate\b/i.test(events)) {
        const of = /\bupdate\s+of\s+(.+?)(?:\s+or\s+(?:insert|delete|truncate)\b|$)/i.exec(events);
        const table = ident(m[4] as string);
        const name = (m[1] as string).toLowerCase();
        triggers.set(`${table}|${name}`, {
          table, name, file,
          timing: (m[2] as string).replace(/\s+/g, ' ').toUpperCase() as UpdateTrigger['timing'],
          ofColumns: of ? cols(of[1] as string) : null,
        });
      } else {
        triggers.delete(`${ident(m[4] as string)}|${(m[1] as string).toLowerCase()}`); // replaced by a trigger with no UPDATE
      }
    } else if ((m = /^drop\s+trigger\s+(?:if\s+exists\s+)?(\w+)\s+on\s+([\w."]+)/i.exec(stmt))) {
      triggers.delete(`${ident(m[2] as string)}|${(m[1] as string).toLowerCase()}`);
    }
  };

  /** DDL a DO block runs. Literal DDL is parsed like top-level DDL; DDL assembled with format()/concatenation cannot
   * be read and is reported instead of ignored. */
  const DDL_AT = /\b(?:create\s+(?:unlogged\s+)?table|alter\s+table|drop\s+table|create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger|drop\s+trigger)\b/i;
  const DDL_WORDS = /\b(?:create|alter|drop)\s+table\b|\breferences\b|\bforeign\s+key\b/i;
  const DYNAMIC = /%[IsL]|\|\||\bformat\s*\(/i;
  const doStatement = (text: string) => {
    const executes = /\bexecute\b/i.test(text);
    if (executes && DDL_WORDS.test(text) && DYNAMIC.test(text)) {
      const at = text.search(/\bexecute\b/i);
      unresolved.push({ file, text: text.slice(at, at + 160) });
      return;
    }
    const at = text.search(DDL_AT);
    // `ALTER PUBLICATION ... DROP TABLE t` removes a table from a publication; it does not drop the table.
    if (at !== -1 && !/\balter\s+publication\b/i.test(text.slice(Math.max(0, at - 80), at))) statement(text.slice(at), true);
  };

  for (const f of [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    file = f.name;
    for (const s of splitStatements(f.text)) {
      statement(s.text, false);
      if (s.doBody !== undefined) for (const inner of splitStatements(s.doBody, true)) doStatement(inner.text);
    }
  }
  return { edges: [...fks.values()], referenceTokens, declarations, unresolved, notNull, updateTriggers: [...triggers.values()] };
}

/** The two dynamic statements the migrations contain. Both drop a CHECK constraint (`contype = 'c'`), never a foreign
 * key, so the graph is complete without them. Anything else unresolved means the graph may be missing edges. */
export const KNOWN_UNRESOLVED: ReadonlyArray<{ file: string; pattern: RegExp }> = [
  { file: '20260908110000_p1259_profile_description_and_links.sql', pattern: /^execute format\(\s*ALTER TABLE public\.profiles DROP CONSTRAINT %I/i },
  { file: '20261002140000_p1386_mic_setup_lightning_other.sql', pattern: /^execute format\(\s*ALTER TABLE public\.event_preparations DROP CONSTRAINT %I/i },
];

/** Problems that make the graph unsafe to rely on: a REFERENCES the parser did not turn into an edge, or dynamic DDL
 * outside the known list. Empty when the graph is complete. */
export function parserProblems(g: FkGraph): string[] {
  const problems: string[] = [];
  if (g.declarations !== g.referenceTokens) {
    problems.push(`${g.referenceTokens} REFERENCES keywords in CREATE/ALTER TABLE statements but ${g.declarations} foreign keys parsed`);
  }
  for (const u of g.unresolved) {
    if (!KNOWN_UNRESOLVED.some((k) => k.file === u.file && k.pattern.test(u.text))) problems.push(`unresolved dynamic DDL in ${u.file}: ${u.text}`);
  }
  return problems;
}

/** Update triggers on `table` that fire when `column` is in an UPDATE's SET list. */
export function triggersTouching(g: FkGraph, table: string, column: string): UpdateTrigger[] {
  return g.updateTriggers.filter((t) => t.table === table && (t.ofColumns === null || t.ofColumns.includes(column)));
}

export interface Referrers {
  /** Tables whose rows are deleted by the reset: the roots and everything reached through ON DELETE CASCADE. */
  deletedTables: Set<string>;
  /** Every edge whose parent is one of those tables: rows that are cascaded, nulled, or that block the delete. */
  edges: FkEdge[];
}

/** From the tables the reset deletes from, follow ON DELETE CASCADE to everything that goes with them. */
export function deriveReferrers(edges: readonly FkEdge[], roots: readonly string[]): Referrers {
  const deletedTables = new Set(roots);
  const queue = [...roots];
  const found = new Map<string, FkEdge>();
  while (queue.length > 0) {
    const t = queue.shift() as string;
    for (const e of edges) {
      if (e.parent !== t) continue;
      found.set(edgeKey(e), e);
      if (e.onDelete === 'CASCADE' && !deletedTables.has(e.child)) {
        deletedTables.add(e.child);
        queue.push(e.child);
      }
    }
  }
  return { deletedTables, edges: [...found.values()].sort((a, b) => (edgeKey(a) < edgeKey(b) ? -1 : 1)) };
}

