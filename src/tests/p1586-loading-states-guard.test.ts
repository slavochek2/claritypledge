/**
 * @file p1586-loading-states-guard.test.ts
 * @description P1586 §5 — a guard that finds loading states nobody listed. Every wait in src/
 * is one of four states (spec §1): the page loader, a section skeleton, an operation label or
 * small spinner inside a control, or an optional section that renders nothing. This test scans
 * the source tree (never a hand-kept list of files) and fails on a fifth look:
 *
 *   1. large-clarity-loader — `<ClarityLoader>` whose size is not the literal "sm" (the default
 *      is "md", so a bare `<ClarityLoader />` counts) outside clarity-loader.tsx and
 *      iframe-load-overlay.tsx (P1023, a cross-origin embed with no paint signal).
 *   2. loading-text — "Loading" as visible JSX text, or a "Loading…" string literal rendered
 *      through a JSX expression (`{x ? 'Loading…' : 'Show more'}`). Not counted: attributes
 *      (aria-label, label=), text under an `sr-only` element, comments, and strings outside JSX
 *      (the overlay's `label:` props, lib/chunk-error.ts). The AST sees only what is rendered.
 *   3. loose-spinner — an element that is `Loader2` / `Loader2Icon` (any non-import reference to
 *      the identifier) or carries `animate-spin` and has no control around it. HEURISTIC, since
 *      a regex cannot know what a component is: "a control" = any ancestor-or-self JSX element
 *      whose tag is button, a, input, textarea, select, Link, NavLink, Input, Textarea,
 *      SelectTrigger, anything ending in `Button`, or that has role="button" / role="menuitem".
 *      `icon={Loader2}` on a Button therefore passes (the attribute sits under the Button's own
 *      opening element). An `animate-spin` string with no JSX element around it fails (a spinner
 *      class stored in a constant escapes the control check, so it has to be explained).
 *   4. null-while-loading — `return null` (or `return flag ? null : ...`) on a loading flag
 *      (loading, isLoading, authLoading, !loaded, fetchState === 'loading', isPending, ...) in a
 *      component a route renders directly. "Routed" is derived from src/App.tsx: every component
 *      named inside a `<Route element={...}>` (wrappers and layouts included) is resolved through
 *      App.tsx's imports and `lazy(() => import(...))` consts to a file and an export name; only
 *      the function with that name is checked (a file's helper components are not routed).
 *   5. animate-pulse — `animate-pulse` (not `animate-pulse-subtle-green`) in any string or JSX
 *      text outside src/components/ui/skeleton.tsx, the shared primitive.
 *
 * The scan is the AST (same approach as p1364-back-drift-guard), so comments never count. Test
 * files and src/tests are excluded. Everything under src/app/prototypes/events/ is scanned.
 *
 * Members are derived: the file list comes from walking src/, the routed set from App.tsx. The
 * hand-kept parts are only the two exclusion lists and the ALLOWLIST, and each entry there must
 * name its reason; the stale checks fail when an entry no longer exists or no longer needs its
 * exception. The first describe block runs each detector on known-bad and known-good snippets.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

type Kind =
  | 'large-clarity-loader'
  | 'loading-text'
  | 'loose-spinner'
  | 'null-while-loading'
  | 'animate-pulse';

interface Finding {
  kind: Kind;
  line: number;
  text: string;
}

/** Files that ARE the standard: the detector does not apply to them. */
const STANDARD_FILES: Record<string, string> = {
  'src/components/ui/clarity-loader.tsx': 'The mark and the one page loader: the only place a large ClarityLoader is drawn.',
  'src/components/ui/iframe-load-overlay.tsx':
    'P1023: a cross-origin embed with no paint signal keeps its own large mark and labelled overlay (spec §2 "Kept, its own rule").',
  'src/components/ui/skeleton.tsx': 'The shared skeleton primitive: the one place animate-pulse is written.',
};

/** Demo-only routes are not product loading states. Each path is named with its reason. */
const EXCLUDED_DEMOS: Record<string, string> = {
  'src/app/pages/loading-demo-page.tsx':
    'The /loading-demo gallery of loader variants: it exists to show look-alikes of every look, so it carries all of them on purpose.',
};

/** Each entry is a deliberate exception; the reason is part of the contract. */
const ALLOWLIST: Record<string, { kinds: Kind[]; why: string }> = {
  // --- Status indicators: a live dot, a waiting-for-partner line, a typing indicator. Not a page or section wait. ---
  'src/app/components/letters/explain-back-capture.tsx': {
    kinds: ['animate-pulse'],
    why: 'Status indicator: the red recording dot while the explain-back is being captured.',
  },
  'src/app/components/partners/transcription-input.tsx': {
    kinds: ['animate-pulse'],
    why: 'Status indicator: the red recording dot while speech is being transcribed.',
  },
  'src/app/components/session/session-bar.tsx': {
    kinds: ['animate-pulse'],
    why: 'Status indicator: the live-session dot (motion-safe only).',
  },
  'src/app/prototypes/event-transcription/TranscriptionBar.tsx': {
    kinds: ['animate-pulse'],
    why: 'Status indicator: the live-transcription dot (motion-safe only).',
  },
  'src/app/components/partners/live-mode-view.tsx': {
    kinds: ['animate-pulse'],
    why: 'Status indicator: live dots on the waiting-for-partner lines of a running session.',
  },
  'src/app/components/partners/free-mode-success.tsx': {
    kinds: ['animate-pulse'],
    why: 'Status indicator: dot beside "Waiting for <partner> to continue…" after a finished exchange.',
  },
  'src/app/components/partners/free-mode-view.tsx': {
    kinds: ['animate-pulse'],
    why: 'Celebration, not a wait: the "Both at 10" line pulses once both partners reach 10.',
  },
  'src/app/components/shared/RatingDots.tsx': {
    kinds: ['animate-pulse'],
    why: 'Status indicator: the dot for the rating the partner has not given yet.',
  },
  'src/app/components/landing/hard-truth-chat.tsx': {
    kinds: ['animate-pulse'],
    why: 'Typing-cursor indicator in the scripted chat demo on the landing page.',
  },
  'src/app/pages/chat/MessageRow.tsx': {
    kinds: ['animate-pulse'],
    why: 'Typing indicator: "<name> is thinking…" while the mirror replies (P1554).',
  },
  'src/app/pages/chat/chat-kit.tsx': {
    kinds: ['animate-pulse'],
    why: 'Status indicator: the mirror portrait glyph pulses while the first portrait is being painted (P1554). The chat list and message skeletons in this file use <Skeleton>.',
  },
  'src/app/components/partners/rating-card.tsx': {
    kinds: ['animate-pulse'],
    why: 'Waiting-for-partner text: "Waiting for <partner> to rate…" after the viewer has rated.',
  },
  'src/app/components/partners/demo-level-view.tsx': {
    kinds: ['animate-pulse'],
    why: 'Waiting-for-partner text: four "Waiting for <partner> to …" lines in the paired exercise.',
  },
  'src/app/components/partners/position-buttons.tsx': {
    kinds: ['animate-pulse'],
    why: 'Waiting-for-partner text: "Waiting for partner…" after the viewer picked a position.',
  },
  'src/app/pages/prototypes/new-live-prototype.tsx': {
    kinds: ['animate-pulse'],
    why: 'Prototype of the live exercise: the same waiting-for-partner status line as free-mode-view.',
  },
  'src/app/components/session/reconnecting-countdown.tsx': {
    kinds: ['loose-spinner'],
    why: 'Status indicator: "Waiting for <partner> to return…" with the reconnect countdown; the partner, not the page, is being waited on.',
  },
  'src/app/components/letters/letter-cover.tsx': {
    kinds: ['animate-pulse'],
    why: 'Classified at :138: "Setting up your access…" hint under an already-drawn CTA when sign-in is slow (authDelayed). A status line on a drawn page, not a page or section wait.',
  },

  // --- Nav slot placeholder (P1421) ---
  'src/app/components/layout/simple-navigation.tsx': {
    kinds: ['animate-pulse'],
    why: 'P1421: a ghost nav item that holds the slot while the nav list resolves, so the bar never jumps. Fixed-size placeholder inside the drawn shell, not a content wait.',
  },

  // --- Operation states: a control, a send, a save, an upload is working ---
  'src/app/components/pledge/sign-pledge-form.tsx': {
    kinds: ['animate-pulse'],
    why: 'Classified at :350: pulsing icon inside the submit Button while "Signing…" (isSubmitting). Operation in a control.',
  },
  'src/app/components/social/witness-card.tsx': {
    kinds: ['animate-pulse'],
    why: 'Classified at :161: pulsing icon inside the submit Button while "Accepting…" (isSubmitting). Operation in a control.',
  },
  'src/app/components/canvas/canvas-share-control.tsx': {
    kinds: ['loose-spinner'],
    why: 'Three per-row save spinners (a share option, an access entry, the general-access select) beside the row control that is saving. Operation, one row at a time.',
  },
  'src/app/components/shared/banner/BannerControls.tsx': {
    kinds: ['loose-spinner'],
    why: 'The "Generating banner" pill replaces the edit pencil while a banner is generated: a control showing its own work.',
  },
  'src/app/components/shared/image-upload-widget.tsx': {
    kinds: ['loose-spinner'],
    why: 'Upload processing: spinner overlaid on the preview of the file being uploaded. Operation.',
  },
  'src/app/components/shared/profile-picker-input.tsx': {
    kinds: ['loose-spinner'],
    why: 'Search/lookup progress inside the picker input (right edge of the field). Operation in an input.',
  },
  'src/app/components/social/point-supersede-banner.tsx': {
    kinds: ['loose-spinner'],
    why: '14px inline spinner where the "Superseded by" link will be, inside a one-line banner. A small inline wait for a link target, not a section.',
  },
  'src/app/pages/chat/MirrorInfoDialog.tsx': {
    kinds: ['loose-spinner'],
    why: 'Operation: a new portrait is being painted; spinner overlays the portrait in the dialog.',
  },
  'src/app/pages/my-sessions-page.tsx': {
    kinds: ['loose-spinner'],
    why: 'Status of a record: a session row whose transcript is still being produced ("Transcribing your session…"). The list itself is drawn; the section skeletons in this file use <Skeleton>.',
  },
  'src/app/pages/clarity-live-page.tsx': {
    kinds: ['loose-spinner', 'animate-pulse'],
    why: 'Operation labels kept by spec §2: "Joining session…" (:4155, auto-join after sign-in) and "Creating session…" (:4248). The page waits on auth with the page loader.',
  },
  'src/app/pages/letter-compose-page.tsx': {
    kinds: ['animate-pulse'],
    why: 'Classified at :354: the "Sealing your letter…" step, an in-flight seal RPC the writer triggered. A deliberate operation screen, not a data load. Borderline (page-level look): see the P1586 report.',
  },
  'src/app/pages/profile-page-v2.tsx': {
    kinds: ['animate-pulse'],
    why: 'Classified at :985: shimmer over the banner while a new banner is generated (banner.isLoading). The profile is drawn; the banner image is the operation.',
  },
  'src/app/pages/artifacts/artifacts-page.tsx': {
    kinds: ['loading-text'],
    why: 'Spec §2 operation: "Loading more…" under the list after "Show more" (:376). The first load uses the section skeleton.',
  },
  'src/app/pages/chat/MessageList.tsx': {
    kinds: ['loading-text'],
    why: 'Spec §2 operation: the load-earlier-messages button reads "Loading…" while it works.',
  },
  'src/app/pages/chat/NewMessageDialog.tsx': {
    kinds: ['loading-text', 'animate-pulse'],
    why: 'Spec §2 operation: search progress in the new-message dialog (a dialog read that already has its READ_DEADLINE): a pulsing bar and "Loading…".',
  },
  'src/app/pages/clarity-pledgers-page.tsx': {
    kinds: ['loading-text'],
    why: 'Spec §2 operation: the "Show more" button reads "Loading…" while the next page loads (:126).',
  },
};

// ---------------------------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------------------------

const LOADING_FLAG =
  /\b[a-z]*Loading\b|\bloading\b|![A-Za-z_.]*[Ll]oaded\b|\bfetchState\s*===\s*['"]loading['"]|\b(?:is)?Pending\b|\bstatus\s*===\s*['"](?:loading|pending)['"]/;

/** Tags that make a spinner an operation indicator rather than a section/page wait. */
function isControlTag(tag: string): boolean {
  return (
    /^(?:button|a|input|textarea|select|summary|Link|NavLink|Input|Textarea|SelectTrigger)$/.test(tag) ||
    /Button$/.test(tag)
  );
}

function openingOf(node: ts.Node): ts.JsxOpeningLikeElement | undefined {
  if (ts.isJsxElement(node)) return node.openingElement;
  if (ts.isJsxSelfClosingElement(node)) return node;
  return undefined;
}

function hasControlRole(opening: ts.JsxOpeningLikeElement, sf: ts.SourceFile): boolean {
  return opening.attributes.properties.some(
    p => ts.isJsxAttribute(p) && p.name.getText(sf) === 'role' && /["'](?:button|menuitem)["']/.test(p.getText(sf))
  );
}

/** Walks parents: is `node` inside (or itself) a control element? */
function insideControl(node: ts.Node, sf: ts.SourceFile): boolean {
  for (let n: ts.Node | undefined = node; n; n = n.parent) {
    const opening = openingOf(n);
    if (opening && (isControlTag(opening.tagName.getText(sf)) || hasControlRole(opening, sf))) return true;
  }
  return false;
}

/** The JSX element a token sits on: its own element, or the nearest enclosing one. */
function nearestElement(node: ts.Node): ts.JsxOpeningLikeElement | ts.JsxElement | undefined {
  for (let n: ts.Node | undefined = node; n; n = n.parent) {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) return ts.isJsxOpeningElement(n) ? n.parent : n;
  }
  return undefined;
}

/** True if `node` is inside an element that is `sr-only` (assistive-tech-only text is not a loading look). */
function insideSrOnly(node: ts.Node, sf: ts.SourceFile): boolean {
  for (let n: ts.Node | undefined = node; n; n = n.parent) {
    const opening = openingOf(n);
    if (opening && opening.attributes.properties.some(p => ts.isJsxAttribute(p) && /\bsr-only\b/.test(p.getText(sf)))) return true;
  }
  return false;
}

function insideJsxAttribute(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node; n; n = n.parent) {
    if (ts.isJsxAttribute(n)) return true;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) return false;
  }
  return false;
}

function insideJsx(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node; n; n = n.parent) {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) return true;
  }
  return false;
}

/**
 * Name of the component whose render `node` belongs to: the NEAREST enclosing function must itself
 * be the component (`function X`, `const X = () =>`, `const X = memo(() => ...)`, or a class's
 * `render`). A null returned from a callback inside it (`.map`, an event handler) is not a render.
 */
function enclosingComponentName(node: ts.Node): string | undefined {
  let fn: ts.Node | undefined = node.parent;
  while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
  if (!fn) return undefined;
  const pascal = (t: string) => /^[A-Z]/.test(t);
  if (ts.isFunctionDeclaration(fn)) return fn.name && pascal(fn.name.text) ? fn.name.text : undefined;
  if (ts.isMethodDeclaration(fn) && fn.name.getText() === 'render' && ts.isClassLike(fn.parent)) {
    return fn.parent.name?.text;
  }
  if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
    let holder: ts.Node = fn.parent;
    // memo(...) / forwardRef(...) wrap the component
    if (ts.isCallExpression(holder)) holder = holder.parent;
    if (ts.isVariableDeclaration(holder) && ts.isIdentifier(holder.name) && pascal(holder.name.text)) {
      return holder.name.text;
    }
  }
  return undefined;
}

/** The loading-flag test text guarding a node: nearest `if (...)` whose then-branch contains it, or ternary condition. */
function guardingCondition(node: ts.Node, sf: ts.SourceFile): string | undefined {
  let child: ts.Node = node;
  for (let n: ts.Node | undefined = node.parent; n; child = n, n = n.parent) {
    if (ts.isIfStatement(n) && n.thenStatement === child) return n.expression.getText(sf);
    if (ts.isConditionalExpression(n) && n.condition !== child) return n.condition.getText(sf);
    if (ts.isFunctionLike(n)) return undefined;
  }
  return undefined;
}

export interface DetectOptions {
  /**
   * Names of the components a route renders directly, from this file. `undefined` = the file is
   * not routed (category 4 is skipped); `'*'` = routed through a default export we could not
   * name, so every PascalCase function in the file counts.
   */
  routedNames?: ReadonlySet<string> | '*';
}

/** Runs all five detectors over one source text. File-level standard exemptions are applied by the caller. */
export function findLoadingDrift(fileName: string, source: string, opts: DetectOptions = {}): Finding[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];
  const at = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const add = (kind: Kind, node: ts.Node, text?: string) =>
    findings.push({ kind, line: at(node), text: (text ?? node.getText(sf)).replace(/\s+/g, ' ').slice(0, 120) });
  const spinnerAnchors = new Set<number>();

  const visit = (node: ts.Node) => {
    // 1. large ClarityLoader
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText(sf) === 'ClarityLoader') {
        const size = node.attributes.properties.find(
          (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(sf) === 'size'
        );
        const init = size?.initializer;
        const literal =
          init && ts.isStringLiteral(init)
            ? init.text
            : init && ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression)
              ? init.expression.text
              : undefined;
        if (literal !== 'sm') add('large-clarity-loader', node);
      }
    }

    // 2. "Loading" as visible text: JSX text, or a string literal rendered through a JSX expression.
    if (ts.isJsxText(node) && /\bLoading\b/.test(node.text) && !insideSrOnly(node, sf)) {
      add('loading-text', node, node.text.trim());
    }
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      /\bLoading\b/.test(node.text) &&
      insideJsx(node) &&
      !insideJsxAttribute(node) &&
      !insideSrOnly(node, sf)
    ) {
      add('loading-text', node);
    }

    // 3. loose spinner: Loader2 / Loader2Icon references and animate-spin strings
    if (
      ts.isIdentifier(node) &&
      (node.text === 'Loader2' || node.text === 'Loader2Icon') &&
      !ts.isImportSpecifier(node.parent) &&
      !ts.isImportClause(node.parent) &&
      !ts.isExportSpecifier(node.parent)
    ) {
      const el = nearestElement(node);
      const key = el ? el.getStart(sf) : node.getStart(sf);
      if (!spinnerAnchors.has(key) && !(el && insideControl(el, sf))) {
        spinnerAnchors.add(key);
        add('loose-spinner', el ?? node);
      }
    }
    if (
      (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) &&
      /animate-spin(?![-\w])/.test(node.text)
    ) {
      const el = nearestElement(node);
      const key = el ? el.getStart(sf) : node.getStart(sf);
      if (!spinnerAnchors.has(key) && !(el && insideControl(el, sf))) {
        spinnerAnchors.add(key);
        add('loose-spinner', el ?? node);
      }
    }

    // 4. return null on a loading flag, in a routed component
    if (opts.routedNames) {
      const reportIf = (n: ts.Node, cond: string | undefined) => {
        if (cond === undefined || !LOADING_FLAG.test(cond)) return;
        const name = enclosingComponentName(n);
        if (opts.routedNames === '*' ? name !== undefined : name !== undefined && opts.routedNames!.has(name)) {
          add('null-while-loading', n);
        }
      };
      if (ts.isReturnStatement(node) && node.expression) {
        const e = node.expression;
        if (e.kind === ts.SyntaxKind.NullKeyword) {
          reportIf(node, guardingCondition(node, sf));
        } else if (ts.isConditionalExpression(e)) {
          const nullBranch = e.whenTrue.kind === ts.SyntaxKind.NullKeyword || e.whenFalse.kind === ts.SyntaxKind.NullKeyword;
          if (nullBranch) reportIf(node, e.condition.getText(sf));
        }
      }
    }

    // 5. animate-pulse outside the primitive
    if (
      (ts.isStringLiteralLike(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node) ||
        ts.isJsxText(node)) &&
      /animate-pulse(?![-\w])/.test(node.text)
    ) {
      add('animate-pulse', node, node.text.trim());
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

// ---------------------------------------------------------------------------------------------
// Deriving members from the tree
// ---------------------------------------------------------------------------------------------

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'tests') continue;
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function resolveModule(root: string, spec: string): string | undefined {
  const base = spec.startsWith('@/') ? join('src', spec.slice(2)) : undefined;
  if (!base) return undefined;
  for (const cand of [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]) {
    if (existsSync(join(root, cand))) return cand.split(sep).join('/');
  }
  return undefined;
}

/**
 * The components a route renders directly, as `file -> exported names` (or '*' for a default export).
 * Read from App.tsx: component identifiers named inside a `<Route element=...>`, resolved through
 * its static imports and `const X = lazy(() => import('@/…').then(m => ({ default: m.Name })))`.
 */
export function deriveRouted(root: string, appSource: string): Map<string, Set<string> | '*'> {
  const sf = ts.createSourceFile('App.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const bindings = new Map<string, { file: string; exportName: string }>();

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.importClause) {
      const file = resolveModule(root, st.moduleSpecifier.text);
      if (!file) continue;
      const clause = st.importClause;
      if (clause.name) bindings.set(clause.name.text, { file, exportName: 'default' });
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) {
          bindings.set(el.name.text, { file, exportName: (el.propertyName ?? el.name).text });
        }
      }
    }
    if (ts.isVariableStatement(st)) {
      for (const decl of st.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
        const init = decl.initializer;
        if (!ts.isCallExpression(init) || init.expression.getText(sf) !== 'lazy') continue;
        const text = init.getText(sf);
        const spec = /import\(\s*["']([^"']+)["']\s*\)/.exec(text)?.[1];
        const file = spec ? resolveModule(root, spec) : undefined;
        if (!file) continue;
        const named = /default:\s*m\.(\w+)/.exec(text)?.[1];
        bindings.set(decl.name.text, { file, exportName: named ?? 'default' });
      }
    }
  }

  const tags = new Set<string>();
  const visit = (node: ts.Node) => {
    const opening = openingOf(node) ?? (ts.isJsxOpeningElement(node) ? node : undefined);
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(sf) === 'Route'
    ) {
      const element = node.attributes.properties.find(
        (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(sf) === 'element'
      );
      if (element) {
        const collect = (n: ts.Node) => {
          if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
            const tag = n.tagName.getText(sf);
            if (/^[A-Z]/.test(tag)) tags.add(tag);
          }
          ts.forEachChild(n, collect);
        };
        collect(element);
      }
    }
    void opening;
    ts.forEachChild(node, visit);
  };
  visit(sf);

  const routed = new Map<string, Set<string> | '*'>();
  for (const tag of tags) {
    const b = bindings.get(tag);
    if (!b) continue;
    if (b.exportName === 'default') {
      routed.set(b.file, '*');
    } else {
      const cur = routed.get(b.file);
      if (cur === '*') continue;
      const names = cur ?? new Set<string>();
      names.add(b.exportName);
      routed.set(b.file, names);
    }
  }
  return routed;
}

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------

describe('P1586 loading-states guard — the detectors themselves (controls)', () => {
  const kinds = (src: string, opts?: DetectOptions) => findLoadingDrift('x.tsx', src, opts).map(f => f.kind);
  const ROUTED: DetectOptions = { routedNames: new Set(['Page']) };

  it('1 flags a ClarityLoader that is lg, md or unsized, and passes sm (bad / good)', () => {
    expect(kinds(`const A = () => <ClarityLoader size="lg" />;`)).toEqual(['large-clarity-loader']);
    expect(kinds(`const A = () => <ClarityLoader size="md" />;`)).toEqual(['large-clarity-loader']);
    expect(kinds(`const A = () => <ClarityLoader size={'lg'} />;`)).toEqual(['large-clarity-loader']);
    expect(kinds(`const A = () => <ClarityLoader />;`)).toEqual(['large-clarity-loader']);
    expect(kinds(`const A = () => <ClarityLoader size={big ? 'lg' : 'sm'} />;`)).toEqual(['large-clarity-loader']);
    expect(kinds(`const A = () => <ClarityLoader size="sm" />;`)).toEqual([]);
    expect(kinds(`const A = () => <ClarityPageLoader />;`)).toEqual([]);
  });

  it('2 flags visible "Loading" text and a rendered "Loading…" string, passes aria, sr-only, labels and comments', () => {
    expect(kinds(`const A = () => <p>Loading events…</p>;`)).toEqual(['loading-text']);
    expect(kinds(`const A = () => <p>Loading...</p>;`)).toEqual(['loading-text']);
    expect(kinds(`const A = () => <button>{busy ? 'Loading…' : 'Show more'}</button>;`)).toEqual(['loading-text']);
    expect(kinds(`const A = () => <div aria-label="Loading events" />;`)).toEqual([]);
    expect(kinds(`const A = () => <div role="status" aria-label={'Loading x'} />;`)).toEqual([]);
    expect(kinds(`const A = () => <span className="sr-only">Loading {kind}</span>;`)).toEqual([]);
    expect(kinds(`const OVERLAY = { label: 'Loading the booking calendar' };`)).toEqual([]);
    expect(kinds(`export const CHUNK = ['Loading chunk', 'Loading CSS chunk'];`)).toEqual([]);
    expect(kinds(`// Loading… in a comment\nconst A = () => <>{/* Loading… */}</>;`)).toEqual([]);
    expect(kinds(`const A = () => <p>Downloading</p>;`)).toEqual([]);
  });

  it('3 flags a loose Loader2 / Loader2Icon / animate-spin, passes one inside a control', () => {
    expect(kinds(`const A = () => <div><Loader2 className="h-6 w-6" /></div>;`)).toEqual(['loose-spinner']);
    expect(kinds(`const A = () => <Loader2Icon />;`)).toEqual(['loose-spinner']);
    expect(kinds(`const A = () => <div className="animate-spin h-5 w-5 border-2" />;`)).toEqual(['loose-spinner']);
    expect(kinds(`const A = () => <div className={cn('x', busy && \`animate-spin\`)} />;`)).toEqual(['loose-spinner']);
    expect(kinds(`const SPIN = 'animate-spin';`)).toEqual(['loose-spinner']);
    // one element, both a Loader2 and animate-spin: counted once
    expect(kinds(`const A = () => <Loader2 className="animate-spin" />;`)).toEqual(['loose-spinner']);
    expect(kinds(`const A = () => <button disabled>{busy && <Loader2 className="animate-spin" />}Save</button>;`)).toEqual([]);
    expect(kinds(`const A = () => <Button><Loader2 className="animate-spin" /></Button>;`)).toEqual([]);
    expect(kinds(`const A = () => <Button icon={Loader2}>Save</Button>;`)).toEqual([]);
    expect(kinds(`const A = () => <CopyButton><Loader2Icon /></CopyButton>;`)).toEqual([]);
    expect(kinds(`const A = () => <Link to="/x"><Loader2 /></Link>;`)).toEqual([]);
    expect(kinds(`const A = () => <a href="/x"><span className="animate-spin" /></a>;`)).toEqual([]);
    expect(kinds(`const A = () => <div role="button"><Loader2 /></div>;`)).toEqual([]);
    expect(kinds(`import { Loader2 } from 'lucide-react';\nexport { Loader2 } from 'lucide-react';`)).toEqual([]);
    expect(kinds(`const A = () => <div className="hover:animate-spinner-x" />;`)).toEqual([]);
  });

  it('4 flags return null on a loading flag in a routed component only', () => {
    expect(kinds(`function Page() { if (loading) return null; return <div/>; }`, ROUTED)).toEqual(['null-while-loading']);
    expect(kinds(`const Page = () => { if (authLoading || !user) { return null; } return <div/>; };`, ROUTED)).toEqual(['null-while-loading']);
    expect(kinds(`function Page() { if (!loaded) return null; return <div/>; }`, ROUTED)).toEqual(['null-while-loading']);
    expect(kinds(`function Page() { if (fetchState === 'loading') return null; return <div/>; }`, ROUTED)).toEqual(['null-while-loading']);
    expect(kinds(`function Page() { return isLoading ? null : <div/>; }`, ROUTED)).toEqual(['null-while-loading']);
    // not a loading flag
    expect(kinds(`function Page() { if (!user) return null; return <div/>; }`, ROUTED)).toEqual([]);
    expect(kinds(`function Page() { if (isDownloading) return null; return <div/>; }`, ROUTED)).toEqual([]);
    // a helper component in the same file, not the routed export
    expect(kinds(`function Helper() { if (loading) return null; return <div/>; }`, ROUTED)).toEqual([]);
    // not routed at all
    expect(kinds(`function Page() { if (loading) return null; return <div/>; }`)).toEqual([]);
    // default-export routed: any component in the file counts
    expect(kinds(`function Inner() { if (loading) return null; return <div/>; }`, { routedNames: '*' })).toEqual(['null-while-loading']);
    // a null return inside a nested callback is not the component's render
    expect(kinds(`function Page() { const f = () => { if (loading) return null; }; return <div/>; }`, ROUTED)).toEqual([]);
  });

  it('5 flags animate-pulse, passes animate-pulse-subtle-green and look-alikes', () => {
    expect(kinds(`const A = () => <div className="h-4 animate-pulse bg-muted" />;`)).toEqual(['animate-pulse']);
    expect(kinds(`const A = () => <div className={cn('a', \`animate-pulse \${x}\`)} />;`)).toEqual(['animate-pulse']);
    expect(kinds(`const S = 'animate-pulse';`)).toEqual(['animate-pulse']);
    expect(kinds(`const A = () => <div className="animate-pulse-subtle-green" />;`)).toEqual([]);
    expect(kinds(`const A = () => <div className="animate-pulse_x motion-safe:animate-pulses" />;`)).toEqual([]);
    expect(kinds(`// animate-pulse in a comment\nconst A = () => <div />;`)).toEqual([]);
    expect(kinds(`const A = () => <Skeleton className="h-4" />;`)).toEqual([]);
  });
});

describe('P1586 loading-states guard — negative controls on real files (an allowed case passes)', () => {
  const root = process.cwd();
  const read = (f: string) => readFileSync(join(root, f), 'utf8');
  const kindsOf = (f: string, opts?: DetectOptions) => findLoadingDrift(f, read(f), opts).map(x => x.kind);

  it('1 the standard files really draw a large ClarityLoader; the exemption, not blindness, lets them pass', () => {
    expect(kindsOf('src/components/ui/clarity-loader.tsx')).toContain('large-clarity-loader');
    expect(kindsOf('src/components/ui/iframe-load-overlay.tsx')).toContain('large-clarity-loader');
    expect(kindsOf('src/components/ui/skeleton.tsx')).toContain('animate-pulse');
  });

  it('2 sr-only and aria "Loading …" text is not a loading look; an allowlisted operation label is seen', () => {
    expect(kindsOf('src/app/pages/chat/AttachmentSkeleton.tsx')).toEqual([]);
    expect(kindsOf('src/app/pages/chat/chat-kit.tsx')).not.toContain('loading-text');
    expect(kindsOf('src/app/pages/chat/MessageList.tsx')).toContain('loading-text');
    expect(ALLOWLIST['src/app/pages/chat/MessageList.tsx']?.kinds).toContain('loading-text');
  });

  it('3 a Loader2 inside a control passes', () => {
    const f = 'src/app/pages/settings-page.tsx';
    expect(read(f)).toContain('Loader2');
    expect(kindsOf(f)).not.toContain('loose-spinner');
  });

  it('4 a routed component that returns null on something other than a loading flag passes', () => {
    const f = 'src/app/pages/artifacts/artifacts-page.tsx';
    expect(read(f)).toMatch(/if \(!user\) return null;/);
    expect(kindsOf(f, { routedNames: new Set(['ArtifactsPage']) })).not.toContain('null-while-loading');
  });

  it('5 animate-pulse-subtle-green is not animate-pulse', () => {
    const f = 'src/app/components/profile/pledge-certificate-view.tsx';
    expect(read(f)).toContain('animate-pulse-subtle-green');
    expect(kindsOf(f)).not.toContain('animate-pulse');
  });
});

describe('P1586 loading-states guard — src/', () => {
  const root = process.cwd();
  const all = listSourceFiles(join(root, 'src')).map(f => relative(root, f).split(sep).join('/'));
  const files = all.filter(f => !(f in EXCLUDED_DEMOS));
  const routed = deriveRouted(root, readFileSync(join(root, 'src/App.tsx'), 'utf8'));

  const scan = (file: string): Finding[] => {
    if (file in STANDARD_FILES) return [];
    return findLoadingDrift(file, readFileSync(join(root, file), 'utf8'), { routedNames: routed.get(file) });
  };

  it('scans a real tree (the member lists are derived, not empty)', () => {
    expect(files).toContain('src/app/pages/org-page.tsx');
    expect(files).toContain('src/app/prototypes/events/components/EventRoomMeet.tsx');
    expect(files).toContain('src/components/ui/skeleton.tsx');
    expect(files.length).toBeGreaterThan(500);
    expect(files.some(f => f.endsWith('.test.tsx') || f.startsWith('src/tests/'))).toBe(false);
  });

  it('derives the routed set from App.tsx (a lazy page, an eager wrapper, an events page)', () => {
    expect(routed.get('src/app/pages/org-page.tsx')).toContain('OrgPage');
    expect(routed.get('src/app/pages/chat/ChatHomePage.tsx')).toBe('*');
    expect(routed.get('src/app/prototypes/events/components/EventRoomMeet.tsx')).toContain('EventRoomMeet');
    expect(routed.get('src/app/prototypes/events/arrival/EventArrivingPage.tsx')).toContain('EventArrivingPage');
    expect(routed.size).toBeGreaterThan(60);
    for (const file of routed.keys()) expect(existsSync(join(root, file)), `${file} routed but missing`).toBe(true);
  });

  it('every excluded and standard path exists (no dead exclusions)', () => {
    for (const f of [...Object.keys(EXCLUDED_DEMOS), ...Object.keys(STANDARD_FILES)]) {
      expect(all, `${f} is excluded but no longer exists`).toContain(f);
    }
  });

  it('no loading state outside the four, beyond the allowlist', () => {
    const violations: string[] = [];
    for (const file of files) {
      const allowed = ALLOWLIST[file]?.kinds ?? [];
      for (const f of scan(file)) {
        if (!allowed.includes(f.kind)) violations.push(`${file}:${f.line} [${f.kind}] ${f.text}`);
      }
    }
    expect(
      violations,
      'P1586 §1: a page waits with ClarityPageLoader, a section with <Skeleton>, a control with its own label or a small spinner inside it'
    ).toEqual([]);
  });

  it('every allowlist entry still exists, still needs each kind it lists, and names a reason (no stale entries)', () => {
    for (const [file, { kinds, why }] of Object.entries(ALLOWLIST)) {
      expect(why.trim().length, `${file} has no reason`).toBeGreaterThan(20);
      expect(files, `${file} is allowlisted but no longer exists`).toContain(file);
      const found = new Set(scan(file).map(f => f.kind));
      for (const kind of kinds) expect(found.has(kind), `${file} no longer needs '${kind}'`).toBe(true);
    }
  });
});
