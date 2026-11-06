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

const PAGE_FOR_ROUTE: Record<string, string> = { '/live': 'src/app/pages/clarity-live-page.tsx' };

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

/**
 * True when the source has `useEffect(() => { analytics.stopSessionRecording(); ... }, [])`: the call is an
 * unconditional top-level statement of the effect body, and the dependency list is empty (runs on mount).
 */
export function stopsRecorderOnMount(source: string): boolean {
  const sf = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'useEffect' &&
      node.arguments.length === 2
    ) {
      const [effect, deps] = node.arguments;
      const mountOnly = ts.isArrayLiteralExpression(deps) && deps.elements.length === 0;
      const body = (ts.isArrowFunction(effect) || ts.isFunctionExpression(effect)) ? effect.body : undefined;
      if (mountOnly && body && ts.isBlock(body) && body.statements.some(isStopCallStatement)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

const REAL_CALL = 'analytics.stopSessionRecording();';

describe('P1648: recorder-stopped routes', () => {
  it('every exempt route maps to a page whose mount effect calls stopSessionRecording', () => {
    expect(RECORDER_STOPPED_ON_MOUNT_ROUTES.length).toBeGreaterThan(0);
    for (const route of RECORDER_STOPPED_ON_MOUNT_ROUTES) {
      const file = PAGE_FOR_ROUTE[route];
      expect(file, `no page mapped for exempt route ${route}`).toBeTruthy();
      expect(stopsRecorderOnMount(readFileSync(file, 'utf8')), `${file} no longer stops the recorder on mount`).toBe(true);
    }
  });

  // Controls are mutations of the REAL page (gate 7d), so the page's own comments are in play.
  describe('CONTROLS: mutations of the real /live page must fail the check', () => {
    const real = readFileSync(PAGE_FOR_ROUTE['/live'], 'utf8');

    it('the real page contains exactly one mount call to mutate', () => {
      expect(real.split(REAL_CALL).length - 1).toBe(1);
    });

    it('call commented out (line comment)', () => {
      expect(stopsRecorderOnMount(real.replace(REAL_CALL, `// ${REAL_CALL}`))).toBe(false);
    });

    it('call commented out (block comment)', () => {
      expect(stopsRecorderOnMount(real.replace(REAL_CALL, `/* ${REAL_CALL} */`))).toBe(false);
    });

    it('call made conditional', () => {
      expect(stopsRecorderOnMount(real.replace(REAL_CALL, `if (Math.random() > 2) ${REAL_CALL}`))).toBe(false);
    });

    it('effect no longer mount-only (deps added)', () => {
      const mutated = real.replace(/(analytics\.stopSessionRecording\(\);\s*\}),\s*\[\]\)/, '$1, [roomCode])');
      expect(mutated).not.toBe(real);
      expect(stopsRecorderOnMount(mutated)).toBe(false);
    });

    it('call moved into a string', () => {
      expect(stopsRecorderOnMount(real.replace(REAL_CALL, `void '${REAL_CALL}';`))).toBe(false);
    });
  });
});
