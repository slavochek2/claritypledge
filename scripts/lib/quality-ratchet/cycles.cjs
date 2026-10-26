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

const path = require('path');
const ts = require('typescript');
const { inScope } = require('./scope.cjs');

const ROOT = '/repo';
// The app's import graph: the shared scope under src/, plus the Deno code the app imports
// directly (src/app/data/api.ts reaches into supabase/functions/_shared/), so a loop through
// it is still seen. The rest of supabase/functions is a separate Deno graph.
const ROOTS = ['src/', 'supabase/functions/_shared/'];
const inGraph = (p) => ROOTS.some((r) => p.startsWith(r)) && inScope(p);

// Resolution must use the same options tsc uses, including anything inherited through
// "extends"; wrong options would silently drop alias edges and blind the check.
function compilerOptions(files, h) {
  const text = files.get('tsconfig.app.json');
  if (!text) throw new Error('cycles: tsconfig.app.json not found in the snapshot');
  const parsed = ts.parseConfigFileTextToJson('tsconfig.app.json', text);
  if (parsed.error) throw new Error(`cycles: cannot parse tsconfig.app.json: ${ts.flattenDiagnosticMessageText(parsed.error.messageText, ' ')}`);
  const cfgHost = { useCaseSensitiveFileNames: true, readDirectory: () => [], fileExists: h.fileExists, readFile: h.readFile };
  const cfg = ts.parseJsonConfigFileContent(parsed.config, cfgHost, ROOT, undefined, `${ROOT}/tsconfig.app.json`);
  // TS18003 "no inputs" is expected: the host lists no directories, files come from git.
  const errors = cfg.errors.filter((e) => e.code !== 18003);
  if (errors.length) throw new Error(`cycles: tsconfig.app.json: ${errors.map((e) => ts.flattenDiagnosticMessageText(e.messageText, ' ')).join('; ')}`);
  // Resolve the JS family too, so a cycle through a .js or .jsx file is not invisible.
  return { ...cfg.options, allowJs: true };
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

// True when `name` is used somewhere outside a type position. The build (esbuild, and tsc
// under isolatedModules) drops an import whose bindings are only ever used as types, even
// without the `type` keyword, so such an import is no runtime edge.
function usedAsValue(sf, decl, name) {
  let found = false;
  const typeOnly = (n) => {
    for (let c = n, p = n.parent; p && p !== sf; c = p, p = p.parent) {
      // `class A extends B` evaluates B at load time; only its type arguments are types.
      if (ts.isExpressionWithTypeArguments(p) && c === p.expression && ts.isHeritageClause(p.parent)
        && p.parent.token === ts.SyntaxKind.ExtendsKeyword && ts.isClassLike(p.parent.parent)) return false;
      if (ts.isTypeNode(p) || ts.isInterfaceDeclaration(p) || ts.isTypeAliasDeclaration(p)) return true;
      if (ts.isHeritageClause(p) && p.token === ts.SyntaxKind.ImplementsKeyword) return true;
      // `export type { X }` and `export { type X }` are erased like the import they re-export.
      if (ts.isExportSpecifier(p) && (p.isTypeOnly || p.parent.parent.isTypeOnly)) return true;
    }
    return false;
  };
  // A name in a property or member position is not a reference to the import.
  const isPropertyName = (n) => {
    const p = n.parent;
    if (!p) return false;
    if ((ts.isPropertyAccessExpression(p) || ts.isQualifiedName(p)) && p.name === n) return true;
    if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p)
      || ts.isMethodSignature(p) || ts.isGetAccessor(p) || ts.isSetAccessor(p) || ts.isEnumMember(p) || ts.isJsxAttribute(p)) && p.name === n) return true;
    if (ts.isBindingElement(p) && p.propertyName === n) return true;
    if ((ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) && p.propertyName === n) return true;
    return false;
  };
  const visit = (n) => {
    if (found || n === decl) return;
    if (ts.isIdentifier(n) && n.text === name && !isPropertyName(n) && !typeOnly(n)) { found = true; return; }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

function hasRuntimeBinding(sf, decl, isJs) {
  const clause = decl.importClause;
  if (!clause) return true; // import 'x' — side effect
  if (clause.isTypeOnly) return false;
  // Elision of unused imports is a TypeScript rule; the build keeps every JS import.
  if (isJs) return true;
  const names = [];
  if (clause.name) names.push(clause.name.text);
  const nb = clause.namedBindings;
  if (nb && ts.isNamespaceImport(nb)) names.push(nb.name.text);
  if (nb && ts.isNamedImports(nb)) for (const e of nb.elements) if (!e.isTypeOnly) names.push(e.name.text);
  if (names.length === 0) return !(nb && ts.isNamedImports(nb) && nb.elements.length > 0); // `import {} from` keeps the side effect
  return names.some((n) => usedAsValue(sf, decl, n));
}

function runtimeImports(path, content) {
  const kind = /\.tsx$/i.test(path) ? ts.ScriptKind.TSX : /\.jsx$/i.test(path) ? ts.ScriptKind.JSX
    : /\.[cm]?js$/i.test(path) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, kind);
  if (sf.parseDiagnostics && sf.parseDiagnostics.length) {
    throw new Error(`cycles: cannot parse ${path}: ${ts.flattenDiagnosticMessageText(sf.parseDiagnostics[0].messageText, ' ')}`);
  }
  const specs = [];
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && hasRuntimeBinding(sf, st, kind === ts.ScriptKind.JS || kind === ts.ScriptKind.JSX)) {
      specs.push(st.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) && !st.isTypeOnly) {
      const named = st.exportClause && ts.isNamedExports(st.exportClause) ? st.exportClause.elements : null;
      if (!named || named.length === 0 || named.some((e) => !e.isTypeOnly)) specs.push(st.moduleSpecifier.text);
    }
  }
  return specs;
}

// Specifiers that should resolve to a source file in the snapshot: relative paths and
// the tsconfig aliases. Assets (css, ?raw markdown, images, json) never resolve to code.
const LOCAL = /^(\.|@\/|@components\/|@lib\/)/;
const ASSET = /\.(css|scss|sass|less|md|mdx|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|mp[34]|webm|wav|pdf|txt|html|wasm|sql|json)$|\?/;

function graph(files) {
  const h = host(files);
  const options = compilerOptions(files, h);
  const cache = ts.createModuleResolutionCache(ROOT, (x) => x, options);
  const edges = new Map(); // path to Set(path)
  let local = 0;
  let unresolved = 0;
  let alias = 0;
  let aliasResolved = 0;
  for (const [p, content] of files) {
    if (!inGraph(p)) continue;
    const out = new Set();
    for (const spec of runtimeImports(p, content)) {
      const r = ts.resolveModuleName(spec, `${ROOT}/${p}`, options, h, cache).resolvedModule;
      // Count only imports whose target lies inside this graph: a relative import that
      // leaves it (src/ reaching into another folder) is expected not to resolve here.
      if (LOCAL.test(spec) && !ASSET.test(spec)) {
        const isAlias = !spec.startsWith('.');
        const target = isAlias ? 'src/' : path.posix.normalize(path.posix.join(path.posix.dirname(p), spec));
        if (ROOTS.some((root) => target.startsWith(root))) {
          local++;
          if (!r) unresolved++;
        }
        if (isAlias) { alias++; if (r) aliasResolved++; }
      }
      if (!r || r.isExternalLibraryImport) continue;
      const target = r.resolvedFileName.slice(ROOT.length + 1);
      if (inGraph(target) && target !== p) out.add(target);
    }
    edges.set(p, out);
  }
  // Blindness guard: if local imports stop resolving en masse (a moved alias, a broken
  // config), the graph loses its edges and reports "no cycles". Refuse instead.
  if ((local >= 20 && unresolved / local > 0.1) || (alias > 0 && aliasResolved === 0)) {
    throw new Error(`cycles: ${unresolved} of ${local} local imports (${alias - aliasResolved} of ${alias} aliased) did not resolve; module resolution looks broken, refusing to judge`);
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

function describe(f, state, fresh) {
  const loop = loopThrough(state.edges, state.comp, f.from, f.to);
  return {
    metric: 'cycles',
    file: f.from,
    line: 1,
    message: `new import cycle: ${loop.join(' imports ')} (${fresh} new cyclic import edge(s); 0 allowed).`,
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
  const byCycle = new Map(); // component to { first edge, count of new edges }
  for (const [id, f] of tip.findings) {
    if (known.has(id)) continue;
    const c = tip.comp.get(f.from);
    if (!byCycle.has(c)) byCycle.set(c, { f, n: 0 });
    byCycle.get(c).n++;
  }
  return [...byCycle.values()].map(({ f, n }) => describe(f, tip, n));
}

module.exports = { kind: 'tree', paths: ['src', 'supabase/functions/_shared', 'tsconfig.app.json', 'tsconfig.json', 'tsconfig.node.json'], collect, compare };
