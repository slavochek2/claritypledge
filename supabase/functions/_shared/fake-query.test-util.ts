// Test support only (never imported by a function): one query against the in-memory tables of
// fake-supabase.test-util.ts. It applies the filters a query names, returns only the columns
// `select` asks for, caps a read at the store's row limit like the real API, and records every
// write. An unsupported call throws, so code that starts using something new fails its test
// loudly instead of passing on a default.

export type Row = Record<string, unknown>;

export interface WriteRecord {
  table: string;
  op: 'insert' | 'update' | 'upsert' | 'delete';
  rows: Row[];
}

export type QueryResult = { data: unknown; error: { message: string; code?: string } | null };

/** What a query needs from the store that owns the tables. */
export interface QueryStore {
  tables: Record<string, Row[]>;
  writes: WriteRecord[];
  failures: Record<string, string>;
  failNth: Record<string, number>;
  queryCounts: Record<string, number>;
  /** `${op}:${table}` → called with n just before the n-th query of that kind runs (1-based). */
  beforeQuery: Record<string, (nth: number) => void>;
  maxRows: number;
  rows(table: string): Row[];
}

type Filter = (row: Row) => boolean;
type Op = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

const copies = (rows: Row[]) => rows.map((r) => ({ ...r }));

export class Query implements PromiseLike<QueryResult> {
  private filters: Filter[] = [];
  private columns: string[] | null = null;
  private returning = false;
  private mode: 'many' | 'single' | 'maybeSingle' = 'many';
  private op: Op = 'select';
  private payload: Row[] = [];
  private conflict: string[] = [];
  private ignoreDuplicates = false;
  private orderBy: string | null = null;
  private window: [number, number] | null = null;

  constructor(private db: QueryStore, private table: string) {}

  select(columns?: string) {
    this.columns = !columns || columns.trim() === '*' ? null : columns.split(',').map((c) => c.trim());
    if (this.op !== 'select') this.returning = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: Row) {
    this.op = 'update';
    this.payload = [patch];
    return this;
  }
  upsert(rows: Row | Row[], options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = 'upsert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.conflict = (options.onConflict ?? 'id').split(',').map((c) => c.trim());
    this.ignoreDuplicates = options.ignoreDuplicates === true;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((r) => r[column] === value);
    return this;
  }
  is(column: string, value: null) {
    if (value !== null) throw new Error('fake-supabase: is() supports null only');
    this.filters.push((r) => r[column] === null || r[column] === undefined);
    return this;
  }
  not(column: string, operator: string, value: unknown) {
    if (operator !== 'is' || value !== null) throw new Error('fake-supabase: not() supports "is null" only');
    this.filters.push((r) => r[column] !== null && r[column] !== undefined);
    return this;
  }
  gt(column: string, value: unknown) {
    this.filters.push((r) => String(r[column]).localeCompare(String(value)) > 0);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[column]));
    return this;
  }
  order(column: string) {
    this.orderBy = column;
    return this;
  }
  range(from: number, to: number) {
    this.window = [from, to];
    return this;
  }
  single() {
    this.mode = 'single';
    return this;
  }
  maybeSingle() {
    this.mode = 'maybeSingle';
    return this;
  }

  then<A = QueryResult, B = never>(
    onfulfilled?: ((value: QueryResult) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected);
  }

  private matches = (r: Row) => this.filters.every((f) => f(r));

  /** The error this query is set up to fail with, if any. */
  private injectedFailure(): string | undefined {
    const kind = `${this.op}:${this.table}`;
    const nth = (this.db.queryCounts[kind] = (this.db.queryCounts[kind] ?? 0) + 1);
    this.db.beforeQuery[kind]?.(nth);
    if (this.db.failures[kind]) return this.db.failures[kind];
    return this.db.failNth[kind] === nth ? `fake-supabase: ${kind} #${nth} failed` : undefined;
  }

  private read(): Row[] {
    let found = this.db.rows(this.table).filter(this.matches);
    const by = this.orderBy;
    if (by) found = [...found].sort((a, b) => String(a[by]).localeCompare(String(b[by])));
    // Like the real API, one read returns at most `maxRows` rows, whatever range it asks for.
    const [from, to] = this.window ?? [0, this.db.maxRows - 1];
    return found.slice(from, Math.min(to, from + this.db.maxRows - 1) + 1);
  }

  private record(op: WriteRecord['op'], rows: Row[]): Row[] {
    this.db.writes.push({ table: this.table, op, rows: copies(rows) });
    return rows;
  }

  private writeInsert(): Row[] {
    const created = this.payload.map((p) => ({ id: p.id ?? crypto.randomUUID(), ...p }));
    this.db.rows(this.table).push(...created);
    return this.record('insert', created);
  }

  private writeUpdate(): Row[] {
    const changed = this.db.rows(this.table).filter(this.matches);
    for (const r of changed) Object.assign(r, this.payload[0]);
    return this.record('update', changed);
  }

  private writeUpsert(): Row[] {
    const rows = this.db.rows(this.table);
    const touched: Row[] = [];
    for (const p of this.payload) {
      const existing = rows.find((r) => this.conflict.every((c) => r[c] === p[c]));
      if (existing && this.ignoreDuplicates) continue;
      if (existing) {
        Object.assign(existing, p);
        touched.push(existing);
      } else {
        const created = { ...p };
        rows.push(created);
        touched.push(created);
      }
    }
    return this.record('upsert', touched);
  }

  private writeDelete(): Row[] {
    const rows = this.db.rows(this.table);
    const removed = rows.filter(this.matches);
    this.db.tables[this.table] = rows.filter((r) => !this.matches(r));
    return this.record('delete', removed);
  }

  private affected(): Row[] {
    switch (this.op) {
      case 'select': return this.read();
      case 'insert': return this.writeInsert();
      case 'update': return this.writeUpdate();
      case 'upsert': return this.writeUpsert();
      default: return this.writeDelete();
    }
  }

  private project(rows: Row[]): Row[] {
    const cols = this.columns;
    if (!cols) return copies(rows);
    return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null])));
  }

  private run(): QueryResult {
    const failure = this.injectedFailure();
    if (failure) return { data: null, error: { message: failure } };

    const affected = this.affected();
    if (this.op !== 'select' && !this.returning) return { data: null, error: null };

    const out = this.project(affected);
    if (this.mode === 'many') return { data: out, error: null };
    if (out.length === 1) return { data: out[0], error: null };
    if (out.length === 0 && this.mode === 'maybeSingle') return { data: null, error: null };
    return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
  }
}
