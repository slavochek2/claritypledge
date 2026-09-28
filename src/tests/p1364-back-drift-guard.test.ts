/**
 * @file p1364-back-drift-guard.test.ts
 * @description P1364 §7 — Back is declared, not hand-written. Fails when, anywhere in src/app
 * outside the allowlist below:
 *   - a `FocusHeader` is given `onBack` (pages pass `fallback`, and the component calls
 *     useGoBack itself), or
 *   - an executable `navigate(-1)`, `history.back()` or `history.go(-1)` appears (a bare pop
 *     leaves the site on a cold arrival; useGoBack is the one place that may pop).
 *
 * It reads the code through the TypeScript AST, so comments never count — and prototypes under
 * src/app/prototypes/** are excluded. The first describe block runs the detector on known-bad
 * and known-good snippets, so a detector that has gone blind fails here instead of passing
 * every file.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

type Kind = 'focus-header-onback' | 'bare-history-pop';

/** Each entry is a deliberate exception; the reason is part of the contract. */
const ALLOWLIST: Record<string, { kinds: Kind[]; why: string }> = {
  'src/app/hooks/use-go-back.ts': {
    kinds: ['bare-history-pop'],
    why: 'The one implementation of Back: pops only when there is somewhere in the tab to pop to.',
  },
  'src/app/pages/story-detail-page.tsx': {
    kinds: ['focus-header-onback'],
    why: 'Back is wrapped in the unsaved-edits guard (P427, decisions.md 2026-02-25); the guard calls useGoBack.',
  },
  'src/app/pages/org-join-page.tsx': {
    kinds: ['focus-header-onback'],
    why: 'The /groups/:slug/join terms gate is a flow with its own exit — out of P1364 scope.',
  },
  'src/app/pages/meeting-terms-page.tsx': {
    kinds: ['focus-header-onback'],
    why: 'The /meet flow steps back to /ready — an in-flow step, out of P1364 scope.',
  },
  'src/app/pages/letter-preview-page.tsx': {
    kinds: ['bare-history-pop'],
    why: '"Close preview" in a tab opened with _blank: window.close() or pop — out of P1364 scope.',
  },
};

interface Finding {
  kind: Kind;
  line: number;
  text: string;
}

function isMinusOne(node: ts.Expression | undefined): boolean {
  return (
    !!node &&
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand) &&
    node.operand.text === '1'
  );
}

/** `history.back()` / `window.history.back()` / `history.go(-1)` — the receiver must be `history`. */
function isHistoryCall(callee: ts.Expression, method: string): boolean {
  if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== method) return false;
  const receiver = callee.expression;
  if (ts.isIdentifier(receiver)) return receiver.text === 'history';
  return ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'history';
}

function findBackDrift(fileName: string, source: string): Finding[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];
  const at = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText(sf) === 'FocusHeader') {
        const hasOnBack = node.attributes.properties.some(
          p => ts.isJsxAttribute(p) && p.name.getText(sf) === 'onBack'
        );
        if (hasOnBack) findings.push({ kind: 'focus-header-onback', line: at(node), text: node.getText(sf) });
      }
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const [arg] = node.arguments;
      const bareNavigate = ts.isIdentifier(callee) && callee.text === 'navigate' && isMinusOne(arg);
      const historyBack = isHistoryCall(callee, 'back');
      const historyGoBack = isHistoryCall(callee, 'go') && isMinusOne(arg);
      if (bareNavigate || historyBack || historyGoBack) {
        findings.push({ kind: 'bare-history-pop', line: at(node), text: node.getText(sf) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe('P1364 drift guard — the detector itself (controls)', () => {
  it('flags a FocusHeader given onBack (known bad)', () => {
    const found = findBackDrift('x.tsx', `export const A = () => <FocusHeader onBack={() => go('/me')} />;`);
    expect(found.map(f => f.kind)).toEqual(['focus-header-onback']);
  });

  it('flags executable navigate(-1), history.back() and history.go(-1) (known bad)', () => {
    const src = `
      function a(navigate: (n: number) => void) { navigate(-1); }
      function b() { window.history.back(); }
      function c() { history.go(-1); }
    `;
    expect(findBackDrift('x.ts', src).map(f => f.kind)).toEqual([
      'bare-history-pop', 'bare-history-pop', 'bare-history-pop',
    ]);
  });

  it('passes the declared form, comments and non-pop calls (known good)', () => {
    const src = `
      // navigate(-1) in a line comment
      /* history.back() in a block comment */
      export const A = () => (
        <>
          {/* <FocusHeader onBack={x} /> in a JSX comment */}
          <FocusHeader fallback="/feed" />
          <BottomBackButton onBack={guarded} />
        </>
      );
      function b(navigate: (to: string | number) => void) { navigate('/feed'); navigate(1); }
      function c() { router.back(); history.go(1); }
    `;
    expect(findBackDrift('x.tsx', src)).toEqual([]);
  });
});

describe('P1364 drift guard — src/app', () => {
  const root = process.cwd();
  const files = listSourceFiles(join(root, 'src', 'app'))
    .map(f => relative(root, f).split(sep).join('/'))
    .filter(f => !f.startsWith('src/app/prototypes/'));

  it('scans a real tree (the file list is not empty and includes the migrated pages)', () => {
    expect(files).toContain('src/app/pages/point-detail-page.tsx');
    expect(files).toContain('src/app/components/layout/focus-header.tsx');
    expect(files.length).toBeGreaterThan(100);
  });

  it('no FocusHeader onBack and no bare history pop outside the allowlist', () => {
    const violations: string[] = [];
    for (const file of files) {
      const allowed = ALLOWLIST[file]?.kinds ?? [];
      for (const f of findBackDrift(file, readFileSync(join(root, file), 'utf8'))) {
        if (!allowed.includes(f.kind)) violations.push(`${file}:${f.line} [${f.kind}] ${f.text}`);
      }
    }
    expect(violations, 'Declare Back with `fallback` (FocusHeader / BottomBackButton / useGoBack) instead').toEqual([]);
  });

  it('every allowlist entry still exists and still needs its exception (no stale entries)', () => {
    for (const [file, { kinds }] of Object.entries(ALLOWLIST)) {
      expect(files, `${file} is allowlisted but no longer exists`).toContain(file);
      const found = new Set(findBackDrift(file, readFileSync(join(root, file), 'utf8')).map(f => f.kind));
      for (const kind of kinds) expect(found.has(kind), `${file} no longer needs '${kind}'`).toBe(true);
    }
  });
});
