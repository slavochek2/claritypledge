#!/usr/bin/env node
/**
 * P1509 v16 parity audit: the closed list of app routes, derived from source at run time (never typed by hand).
 *
 * Parses src/App.tsx with the TypeScript compiler API, walks every <Route>, composes nested relative paths, and
 * follows each `/*` mount into the file that renders its own <Routes> (App.tsx mounts /events/* this way).
 * Comments cannot count as routes and `>` inside an attribute cannot end a tag, because the parser, not a regex,
 * decides what a <Route> is. Anything it cannot read (dynamic path, spread with no path, a `/*` mount it cannot
 * follow) lands in `unread` and the CLI exits 1, so a new route shape can never drop out of the list silently.
 *
 *   node scripts/p1509-route-audit.mjs [entry.tsx]          # one composed path per line, /tree excluded
 *   node scripts/p1509-route-audit.mjs --json [entry.tsx]   # [{ path, file, line, devOnly, redirect }]
 *
 * A top-level `*` catch-all composes to `/*`. A nested `/` or index route resolves to its parent's path.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultEntry = path.join(root, 'src/App.tsx');

const tagText = (n) => n.tagName.getText();
const opening = (n) => (ts.isJsxElement(n) ? n.openingElement : n);
const isJsx = (n) => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n);
const isTag = (n, name) => {
  if (!isJsx(n)) return false;
  const t = tagText(opening(n));
  return t === name || t.endsWith('.' + name);
};

/** `import.meta.env.DEV`, written exactly so. */
const isDevExpr = (e) => ts.isPropertyAccessExpression(e) && e.getText() === 'import.meta.env.DEV';

/** Names of top-level consts initialised to import.meta.env.DEV (e.g. `const isDev = import.meta.env.DEV`). */
function devAliases(sf) {
  const names = new Set();
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && isDevExpr(n.initializer)) names.add(n.name.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return names;
}

/** True when `e` is, or `&&`-conjoins, the DEV flag. */
function guardsDev(e, aliases) {
  if (ts.isParenthesizedExpression(e)) return guardsDev(e.expression, aliases);
  if (isDevExpr(e)) return true;
  if (ts.isIdentifier(e)) return aliases.has(e.text);
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return guardsDev(e.left, aliases) || guardsDev(e.right, aliases);
  }
  return false;
}

/** Static string value of a path attribute initializer, or undefined when it is not statically readable. */
function staticString(init) {
  if (!init) return undefined;
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression) {
    let e = init.expression;
    while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e)) e = e.expression;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  }
  return undefined;
}

/** Join a parent mount path and a child path. `/` and index resolve to the parent. */
export function composePath(parent, child) {
  const parts = [parent, child].join('/').split('/').filter(Boolean);
  return '/' + parts.join('/');
}

const stripWildcard = (p) => p.replace(/\/?\*$/, '');

function resolveModule(spec, fromFile, rootDir) {
  let base;
  if (spec.startsWith('@/')) base = path.join(rootDir, 'src', spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return undefined;
  for (const cand of [base, base + '.tsx', base + '.ts', path.join(base, 'index.tsx'), path.join(base, 'index.ts')]) {
    if (/\.tsx?$/.test(cand) && existsSync(cand)) return cand;
  }
  return undefined;
}

/** Local name -> { spec, name } for static imports and `lazy(() => import("..."))` bindings in one file. */
function collectBindings(sf) {
  const map = new Map();
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.importClause) {
      const spec = st.moduleSpecifier.text;
      const c = st.importClause;
      if (c.name) map.set(c.name.text, { spec, name: 'default' });
      if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) map.set(c.namedBindings.name.text, { spec, name: '*' });
      if (c.namedBindings && ts.isNamedImports(c.namedBindings)) {
        for (const el of c.namedBindings.elements) map.set(el.name.text, { spec, name: (el.propertyName ?? el.name).text });
      }
    }
  }
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      let importSpec;
      let exportName = 'default';
      const find = (e) => {
        if (ts.isCallExpression(e) && e.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteralLike(e.arguments[0])) {
          importSpec = e.arguments[0].text;
        }
        if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && /^(m|mod|module)$/.test(e.expression.text)) {
          exportName = e.name.text;
        }
        ts.forEachChild(e, find);
      };
      if (/\blazy\s*\(/.test(n.initializer.getText())) find(n.initializer);
      if (importSpec) map.set(n.name.text, { spec: importSpec, name: exportName });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return map;
}

/** The declaration (function or const) of `name` at the top level of a file, if any. */
function findDeclaration(sf, name) {
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name?.text === name) return st;
    if (ts.isClassDeclaration(st) && st.name?.text === name) return st;
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name) return d;
    }
  }
  return undefined;
}

function containsRoutes(node) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (isJsx(n) && isTag(n, 'Routes')) found = true;
    else ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/** Component tag names under `node`, member expressions (`Events.Router`) included. Intrinsic tags (`div`) are not. */
function jsxTagNames(node) {
  const names = [];
  const visit = (n) => {
    if (isJsx(n)) {
      const t = tagText(opening(n));
      if (/^[A-Z]/.test(t) || t.includes('.')) names.push(t);
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return names;
}

const isRedirectName = (t) => {
  const last = t.split('.').pop();
  return last === 'Navigate' || /Redirect$/.test(last);
};

/**
 * Audit the route tree rooted at `entryFile`.
 * @param {string} entryFile absolute path of the entry (default src/App.tsx)
 * @param {{ source?: string, root?: string }} [opts] `source` overrides the entry file's text (tests), `root` is
 *   the directory `@/` resolves against (default: the repo root).
 * @returns {{ rows: Array<{path:string,file:string,line:number,devOnly:boolean,redirect:boolean}>,
 *   unread: Array<{file:string,line:number,reason:string,text:string}>,
 *   mounts: Array<{path:string,file:string}> }}
 */
export function auditRoutes(entryFile = defaultEntry, opts = {}) {
  const rootDir = opts.root ?? root;
  const rows = [];
  const unread = [];
  const mounts = [];
  const sources = new Map();
  const active = new Set([`${entryFile}#*`]);
  const rel = (f) => path.relative(rootDir, f) || f;

  const load = (file) => {
    if (!sources.has(file)) {
      const text = file === entryFile && opts.source !== undefined ? opts.source : readFileSync(file, 'utf8');
      const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      sources.set(file, { sf, aliases: devAliases(sf), bindings: collectBindings(sf) });
    }
    return sources.get(file);
  };

  const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const fail = (file, sf, node, reason) =>
    unread.push({ file: rel(file), line: lineOf(sf, node), reason, text: node.getText(sf).slice(0, 120).replace(/\s+/g, ' ') });

  /** Walk `node`; every <Route> found is composed against ctx.parent. */
  function walk(node, file, ctx) {
    const { sf, aliases } = load(file);
    const visit = (n, c) => {
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && guardsDev(n.left, aliases)) {
        visit(n.left, c);
        visit(n.right, { ...c, devOnly: true });
        return;
      }
      if (ts.isConditionalExpression(n) && guardsDev(n.condition, aliases)) {
        visit(n.condition, c);
        visit(n.whenTrue, { ...c, devOnly: true });
        visit(n.whenFalse, c);
        return;
      }
      if (isJsx(n) && isTag(n, 'Route')) {
        handleRoute(n, c);
        return;
      }
      ts.forEachChild(n, (ch) => visit(ch, c));
    };

    function handleRoute(n, c) {
      const open = opening(n);
      const attrs = open.attributes.properties;
      const named = (name) => attrs.find((a) => ts.isJsxAttribute(a) && a.name.getText() === name);
      const pathAttr = named('path');
      const indexAttr = named('index');
      const hasSpread = attrs.some((a) => ts.isJsxSpreadAttribute(a));
      if (hasSpread) {
        // A spread can override path/index at runtime, wherever it sits among the attributes.
        fail(file, sf, n, 'spread props: path cannot be read statically');
        visitChildren(n, c);
        return;
      }
      const isIndex = indexAttr && !(indexAttr.initializer && ts.isJsxExpression(indexAttr.initializer) && indexAttr.initializer.expression?.kind === ts.SyntaxKind.FalseKeyword);

      let composed;
      let raw;
      if (pathAttr) {
        raw = staticString(pathAttr.initializer);
        if (raw === undefined) {
          fail(file, sf, n, 'path is not a string literal or plain template');
          // Children still compose against the parent so one dynamic route does not hide its subtree.
          visitChildren(n, c);
          return;
        }
        if (raw.startsWith('/') && c.nested) {
          // react-router: an absolute child of a Route must start with its parent's full path, and is used as-is.
          composed = composePath('', raw);
          if (!(composed === c.parent || composed.startsWith(c.parent + '/'))) {
            fail(file, sf, n, `absolute child path does not start with its parent "${c.parent || '/'}"`);
            visitChildren(n, c);
            return;
          }
        } else {
          composed = composePath(c.parent, raw);
        }
      } else if (isIndex) {
        composed = composePath(c.parent, '');
      } else {
        // Layout route: no URL of its own; its children compose against the parent unchanged.
        visitChildren(n, c);
        return;
      }

      const elementAttr = named('element');
      const elementNode = elementAttr?.initializer;
      const tags = elementNode ? jsxTagNames(elementNode) : [];
      const redirect = tags.some(isRedirectName);
      rows.push({ path: composed, file: rel(file), line: lineOf(sf, n), devOnly: c.devOnly, redirect });

      const base = composed;
      // A bare `*` is a catch-all leaf; only `<prefix>/*` hands the rest of the URL to a descendant router.
      if (raw?.endsWith('/*')) {
        const mountParent = stripWildcard(composed);
        followMount(n, tags, redirect, mountParent, composed, file, c);
      }
      visitChildren(n, { ...c, parent: stripWildcard(base), nested: true });
    }

    function visitChildren(n, c) {
      if (ts.isJsxElement(n)) for (const ch of n.children) visit(ch, c);
    }

    function followMount(n, tags, redirect, mountParent, composed, fromFile, c) {
      const here = load(fromFile);
      const mountCtx = { parent: mountParent, devOnly: c.devOnly, nested: false };
      const seen = new Set();
      let followed = false;

      /** Walk `scope` (a declaration, else the whole file) as the descendant router mounted at mountParent. */
      const followScope = (file, scope, key) => {
        if (active.has(key)) {
          fail(fromFile, here.sf, n, `"${composed}" is a /* mount cycle: ${key} is already being followed`);
          return true;
        }
        active.add(key);
        try {
          mounts.push({ path: mountParent || '/', file: rel(file) });
          walk(scope, file, mountCtx);
        } finally {
          active.delete(key);
        }
        return true;
      };

      // An element that renders its own <Routes> inline (nested descendant router) is a mount too.
      const elementAttr = (ts.isJsxElement(n) ? n.openingElement : n).attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText() === 'element');
      if (elementAttr?.initializer && containsRoutes(elementAttr.initializer)) {
        walk(elementAttr.initializer, fromFile, mountCtx);
        followed = true;
      }
      for (const tag of tags) {
        if (seen.has(tag) || isRedirectName(tag)) continue;
        seen.add(tag);
        const parts = tag.split('.');
        const b = here.bindings.get(parts[0]);
        if (parts.length > 1) {
          // Member expression: only `import * as NS` + `<NS.Component />` is resolvable. Anything else is loud.
          const t = parts.length === 2 && b?.name === '*' ? resolveModule(b.spec, fromFile, rootDir) : undefined;
          const tl = t && load(t);
          const decl = tl && findDeclaration(tl.sf, parts[1]);
          const scope = decl ?? (tl && containsRoutes(tl.sf) ? tl.sf : undefined);
          if (!scope || !containsRoutes(scope)) {
            fail(fromFile, here.sf, n, `"${composed}" is a /* mount through <${tag}>, a member-expression component this audit cannot resolve`);
            followed = true;
            continue;
          }
          followed = followScope(t, scope, `${t}#${decl ? parts[1] : '*'}`) || followed;
        } else if (b) {
          const target = resolveModule(b.spec, fromFile, rootDir);
          if (!target) continue;
          const t = load(target);
          const declName = b.name === 'default' ? tag : b.name;
          const decl = findDeclaration(t.sf, declName);
          const scope = decl ?? t.sf;
          if (!containsRoutes(scope)) continue;
          followed = followScope(target, scope, `${target}#${decl ? declName : '*'}`) || followed;
        } else {
          const decl = findDeclaration(here.sf, tag);
          if (decl && containsRoutes(decl)) followed = followScope(fromFile, decl, `${fromFile}#${tag}`) || followed;
        }
      }
      if (!followed && !redirect) fail(fromFile, here.sf, n, `"${composed}" is a /* mount whose target has no readable <Routes>`);
    }

    visit(node, ctx);
  }

  walk(load(entryFile).sf, entryFile, { parent: '', devOnly: false, nested: false });
  return { rows, unread, mounts };
}

/** Source-string variant for tests: `fileName` fixes how relative imports resolve. */
export function auditSource(source, fileName = defaultEntry, opts = {}) {
  return auditRoutes(fileName, { ...opts, source });
}

/** The closed list: deduplicated by path, /tree and /tree/* excluded. */
export function listRoutes(rows) {
  const seen = new Set();
  return rows.filter((r) => r.path !== '/tree' && !r.path.startsWith('/tree/') && !seen.has(r.path) && seen.add(r.path));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const entry = args.find((a) => !a.startsWith('--'));
  const { rows, unread } = auditRoutes(entry ? path.resolve(entry) : defaultEntry);
  if (unread.length) {
    console.error(`p1509-route-audit: ${unread.length} route(s) not readable:`);
    for (const u of unread) console.error(`  ${u.file}:${u.line}  ${u.reason}  ${u.text}`);
    process.exit(1);
  }
  const out = listRoutes(rows);
  if (args.includes('--json')) console.log(JSON.stringify(out, null, 2));
  else for (const r of out) console.log(r.path);
}
