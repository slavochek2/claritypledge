'use strict';
// P1566 stage 2 — runtime import cycles, whole graph, CI-only.
//
// Why it matters for the product: with ES modules, a cycle (A imports B, B imports A)
// means one module runs before the other has finished initialising, and the first
// use of the missing value crashes the page on load. eslint.config.js already guards
// the same "used before it exists" crash class inside one file (no-use-before-define).
//
// Built on the TypeScript compiler already in the repo (no new dependency): imports are
// resolved with ts.resolveModuleName, the resolver tsc uses, so `@/` aliases resolve
// exactly. Only RUNTIME edges count: `import type` and type-only specifiers are erased at
// build time and dynamic import() is lazy, so neither can cause a load-order crash.
//
// Finding IDs are cyclic EDGES ("a.ts imports b.ts" where both sit in one strongly
// connected component). A new cyclic edge fails; a cycle that shrinks or disappears never
// does, because every remaining edge was already cyclic at the base.

const ts = require('typescript');

const ROOT = '/repo';
const INCLUDE = [/^src\/.*\.(ts|tsx)$/];
const EXCLUDE = [/\.test\.(ts|tsx)$/, /^src\/tests\//, /\.d\.ts$/];

const inGraph = (p) => INCLUDE.some((r) => r.test(p)) && !EXCLUDE.some((r) => r.test(p));

function compilerOptions(files) {
  const text = files.get('tsconfig.app.json');
  if (!text) throw new Error('cycles: tsconfig.app.json not found in the snapshot');
  const parsed = ts.parseConfigFileTextToJson('tsconfig.app.json', text);
  if (parsed.error) throw new Error(`cycles: cannot parse tsconfig.app.json: ${ts.flattenDiagnosticMessageText(parsed.error.messageText, ' ')}`);
  const { options, errors } = ts.convertCompilerOptionsFromJson(parsed.config.compilerOptions || {}, ROOT);
  if (errors.length) throw new Error(`cycles: tsconfig.app.json options: ${errors.map((e) => ts.flattenDiagnosticMessageText(e.messageText, ' ')).join('; ')}`);
  return options;
}

function host(files) {
  const abs = new Set([...files.keys()].map((p) => `${ROOT}/${p}`));
  const dirs = new Set();
  for (const p of abs) for (let d = p.slice(0, p.lastIndexOf('/')); d.length > ROOT.length; d = d.slice(0, d.lastIndexOf('/'))) dirs.add(d);
  dirs.add(ROOT);
  return {
    fileExists: (f) => abs.has(f),
    readFile: (f) => files.get(f.slice(ROOT.length + 1)),
    directoryExists: (d) => dirs.has(d.replace(/\/$/, '')),
    realpath: (f) => f,
    getCurrentDirectory: () => ROOT,
    getDirectories: () => [],
  };
}

function hasRuntimeBinding(decl) {
  const clause = decl.importClause;
  if (!clause) return true; // import 'x' — side effect
  if (clause.isTypeOnly) return false;
  if (clause.name) return true; // default import
  const nb = clause.namedBindings;
  if (!nb) return true;
  if (ts.isNamespaceImport(nb)) return true;
  return nb.elements.length === 0 || nb.elements.some((e) => !e.isTypeOnly);
}

function runtimeImports(path, content) {
  const sf = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, false,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const specs = [];
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && hasRuntimeBinding(st)) {
      specs.push(st.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) && !st.isTypeOnly) {
      const named = st.exportClause && ts.isNamedExports(st.exportClause) ? st.exportClause.elements : null;
      if (!named || named.length === 0 || named.some((e) => !e.isTypeOnly)) specs.push(st.moduleSpecifier.text);
    }
  }
  return specs;
}

function graph(files) {
  const options = compilerOptions(files);
  const h = host(files);
  const cache = ts.createModuleResolutionCache(ROOT, (x) => x, options);
  const edges = new Map(); // path to Set(path)
  for (const [p, content] of files) {
    if (!inGraph(p)) continue;
    const out = new Set();
    for (const spec of runtimeImports(p, content)) {
      const r = ts.resolveModuleName(spec, `${ROOT}/${p}`, options, h, cache).resolvedModule;
      if (!r || r.isExternalLibraryImport) continue;
      const target = r.resolvedFileName.slice(ROOT.length + 1);
      if (inGraph(target) && target !== p) out.add(target);
    }
    edges.set(p, out);
  }
  return edges;
}

// Tarjan's strongly connected components, iterative (the graph is deep enough to
// overflow a recursive version's stack on long import chains).
function components(edges) {
  let index = 0;
  const idx = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const comp = new Map();
  let compId = 0;
  for (const start of edges.keys()) {
    if (idx.has(start)) continue;
    const work = [[start, [...(edges.get(start) || [])], 0]];
    idx.set(start, index); low.set(start, index); index++; stack.push(start); onStack.add(start);
    while (work.length) {
      const frame = work[work.length - 1];
      const [v, succ] = frame;
      if (frame[2] < succ.length) {
        const w = succ[frame[2]++];
        if (!idx.has(w)) {
          idx.set(w, index); low.set(w, index); index++; stack.push(w); onStack.add(w);
          work.push([w, [...(edges.get(w) || [])], 0]);
        } else if (onStack.has(w)) {
          low.set(v, Math.min(low.get(v), idx.get(w)));
        }
      } else {
        work.pop();
        if (work.length) {
          const parent = work[work.length - 1][0];
          low.set(parent, Math.min(low.get(parent), low.get(v)));
        }
        if (low.get(v) === idx.get(v)) {
          let w;
          do { w = stack.pop(); onStack.delete(w); comp.set(w, compId); } while (w !== v);
          compId++;
        }
      }
    }
  }
  return comp;
}

// Shortest path to → ... → from inside one component, so the message shows a real loop.
function loopThrough(edges, comp, from, to) {
  const c = comp.get(from);
  const prev = new Map([[to, null]]);
  const queue = [to];
  while (queue.length) {
    const v = queue.shift();
    if (v === from) break;
    for (const w of edges.get(v) || []) {
      if (comp.get(w) === c && !prev.has(w)) { prev.set(w, v); queue.push(w); }
    }
  }
  const path = [];
  for (let v = from; v !== null && v !== undefined; v = prev.get(v)) path.unshift(v);
  return [from, ...path];
}

// Map<id, {from, to}> of cyclic edges, plus what the message needs.
function collect(files) {
  const edges = graph(files);
  const comp = components(edges);
  const findings = new Map();
  for (const [a, outs] of edges) {
    for (const b of outs) {
      if (comp.get(a) === comp.get(b)) findings.set(`${a} => ${b}`, { from: a, to: b });
    }
  }
  return { findings, edges, comp };
}

function describe(f, state) {
  const loop = loopThrough(state.edges, state.comp, f.from, f.to);
  return {
    metric: 'cycles',
    file: f.from,
    line: 1,
    message: `new import cycle: ${loop.join(' imports ')}.`,
    remedy: 'Move what both files need into a third module that imports neither, or, if the import is only for '
      + 'types, write it as `import type`. A cycle can crash the page on load (a value used before its module ran).',
  };
}

// New cyclic edges at the tip, one finding per cycle they belong to (a two-file loop is
// two new edges but one problem). Base IDs are carried across renames first, so a `git mv`
// of a file that sits in an old cycle does not read as a new one.
function compare(base, tip, ctx = {}) {
  const renames = ctx.renames || new Map();
  const known = new Set([...base.findings.keys()].map((id) => id.split(' => ').map((p) => renames.get(p) || p).join(' => ')));
  const byCycle = new Map();
  for (const [id, f] of tip.findings) {
    const c = tip.comp.get(f.from);
    if (!known.has(id) && !byCycle.has(c)) byCycle.set(c, f);
  }
  return [...byCycle.values()].map((f) => describe(f, tip));
}

module.exports = { kind: 'tree', paths: ['src', 'tsconfig.app.json'], collect, compare };
