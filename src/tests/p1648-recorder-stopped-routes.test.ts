/**
 * P1648: the exempt-route list in e2e/helpers/prod-health.ts is hand-kept, so it must diverge loudly.
 * A route is exempt only while its page really stops the recorder on mount.
 *
 * "Really" is checked on the parsed AST, not by a text match: a regex also matches the call inside a
 * comment, a string, or a click handler (review finding: the old /analytics\.stopSessionRecording\(\)/
 * match stayed green with the real mount call commented out). Comments are not AST nodes, so they
 * cannot satisfy this check.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { RECORDER_STOPPED_ON_MOUNT_ROUTES } from '../../e2e/helpers/prod-health';

const PAGE_FOR_ROUTE: Record<string, { file: string; component: string }> = {
  '/live': { file: 'src/app/pages/clarity-live-page.tsx', component: 'ClarityLivePage' },
};

/** Is `node` a direct `analytics.stopSessionRecording()` call statement? */
function isStopCallStatement(node: ts.Node): boolean {
  if (!ts.isExpressionStatement(node) || !ts.isCallExpression(node.expression)) return false;
  const callee = node.expression.expression;
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'analytics' &&
    callee.name.text === 'stopSessionRecording'
  );
}

/** Index of the first statement that is a `return`, or the list length when there is none. */
function firstReturn(statements: ts.NodeArray<ts.Statement>): number {
  const i = statements.findIndex(ts.isReturnStatement);
  return i === -1 ? statements.length : i;
}

/** Is `stmt` `useEffect(() => { ...; analytics.stopSessionRecording(); ... }, [])`, with the stop reached? */
function isMountStopEffect(stmt: ts.Statement): boolean {
  if (!ts.isExpressionStatement(stmt) || !ts.isCallExpression(stmt.expression)) return false;
  const call = stmt.expression;
  if (!ts.isIdentifier(call.expression) || call.expression.text !== 'useEffect' || call.arguments.length !== 2) return false;
  const [effect, deps] = call.arguments;
  if (!ts.isArrayLiteralExpression(deps) || deps.elements.length !== 0) return false;
  const body = (ts.isArrowFunction(effect) || ts.isFunctionExpression(effect)) ? effect.body : undefined;
  if (!body || !ts.isBlock(body)) return false;
  const stop = body.statements.findIndex(isStopCallStatement);
  return stop !== -1 && stop < firstReturn(body.statements);
}

/**
 * True when the exported page component `component` runs, as one of its own top-level hook statements
 * before its first `return`, `useEffect(() => { analytics.stopSessionRecording(); }, [])` with the stop
 * reached unconditionally. An effect in another component of the file, after a `return`, or behind one
 * inside the effect does not count (review round 3: presence is not execution).
 */
export function stopsRecorderOnMount(source: string, component: string): boolean {
  const sf = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = sf.statements.find(
    (st): st is ts.FunctionDeclaration => ts.isFunctionDeclaration(st) && st.name?.text === component && !!st.body,
  );
  if (!fn?.body) return false;
  const stmts = fn.body.statements;
  return stmts.slice(0, firstReturn(stmts)).some(isMountStopEffect);
}

const REAL_CALL = 'analytics.stopSessionRecording();';

describe('P1648: recorder-stopped routes', () => {
  it('every exempt route maps to a page whose mount effect calls stopSessionRecording', () => {
    expect(RECORDER_STOPPED_ON_MOUNT_ROUTES.length).toBeGreaterThan(0);
    for (const route of RECORDER_STOPPED_ON_MOUNT_ROUTES) {
      const page = PAGE_FOR_ROUTE[route];
      expect(page, `no page mapped for exempt route ${route}`).toBeTruthy();
      expect(
        stopsRecorderOnMount(readFileSync(page.file, 'utf8'), page.component),
        `${page.component} in ${page.file} no longer stops the recorder on mount`,
      ).toBe(true);
    }
  });

  // Controls are mutations of the REAL page (gate 7d), so the page's own comments are in play.
  describe('CONTROLS: mutations of the real /live page must fail the check', () => {
    const { file, component } = PAGE_FOR_ROUTE['/live'];
    const real = readFileSync(file, 'utf8');
    const check = (src: string) => stopsRecorderOnMount(src, component);

    it('the unmutated page passes (so every control below is a real difference)', () => {
      expect(check(real)).toBe(true);
    });

    it('the real page contains exactly one mount call to mutate', () => {
      expect(real.split(REAL_CALL).length - 1).toBe(1);
    });

    it('call commented out (line comment)', () => {
      expect(check(real.replace(REAL_CALL, `// ${REAL_CALL}`))).toBe(false);
    });

    it('call commented out (block comment)', () => {
      expect(check(real.replace(REAL_CALL, `/* ${REAL_CALL} */`))).toBe(false);
    });

    it('call made conditional', () => {
      expect(check(real.replace(REAL_CALL, `if (Math.random() > 2) ${REAL_CALL}`))).toBe(false);
    });

    it('effect no longer mount-only (deps added)', () => {
      const mutated = real.replace(/(analytics\.stopSessionRecording\(\);\s*\}),\s*\[\]\)/, '$1, [roomCode])');
      expect(mutated).not.toBe(real);
      expect(check(mutated)).toBe(false);
    });

    it('early return before the call inside the effect', () => {
      expect(check(real.replace(REAL_CALL, `return;\n    ${REAL_CALL}`))).toBe(false);
    });

    it('effect moved into a component the page never renders', () => {
      const effect = /\n\s*useEffect\(\(\) => \{\s*analytics\.stopSessionRecording\(\);\s*\}, \[\]\);/;
      const m = real.match(effect);
      expect(m, 'mount effect not found in its expected shape').toBeTruthy();
      const moved = real.replace(effect, '') + `\nfunction NeverRendered() {${m![0]}\n  return null;\n}\n`;
      expect(check(moved)).toBe(false);
    });

    it('wrong component name (mapping drift)', () => {
      expect(stopsRecorderOnMount(real, 'SomeOtherPage')).toBe(false);
    });

    it('call moved into a string', () => {
      expect(check(real.replace(REAL_CALL, `void '${REAL_CALL}';`))).toBe(false);
    });
  });
});
