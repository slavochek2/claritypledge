'use strict';
// P1566 stage 1 — size and complexity metric for the quality ratchet.
//
// measure(content, path) parses one file with the TypeScript compiler (already a
// dependency, so this stage installs nothing) and returns:
//   lines      — NORMALIZED line count: the file re-printed by the TS printer with
//                comments removed, every block and object literal expanded, and one
//                statement per line. Deleting comments, deleting blank lines or
//                joining lines does not change it, so the ratchet cannot be gamed
//                by compaction (spec risk "agents game the line count").
//   functions  — every function-like node: a stable-ish key, its normalized OWN length
//                (nested functions excluded, each measured on its own),
//                and its cyclomatic complexity counted exactly as ESLint 9's
//                `complexity` rule (classic variant) counts it, so an agent can
//                reproduce a number with `npx eslint --rule '{"complexity":["error",0]}'`.
//   directives — eslint-disable comments that name a size/complexity rule. A new one
//                fails the gate: the ratchet does not run through ESLint, so such a
//                directive silences nothing here, and adding one signals an attempt to.
//
// compare(before, after, ctx) applies the ratchet and returns violations, each with
// the measured value, the limit and the remedy (spec invariant: the message is the
// only documentation guaranteed to reach an agent).

let ts;
function typescript() {
  if (!ts) ts = require('typescript');
  return ts;
}

// Calibrated from the 2026-10-26 distribution — see the P1566 spec, stage 1 trial.
const LIMITS = {
  fileLines: 400,
  functionLines: 80,
  complexity: 20,
};

// An extraction that moves code out of an over-limit file may add wiring back
// (imports, props, a call site). Anything above this allowance, in the same commit
// as the move, is new code laundered through the extraction.
const WIRING_ALLOWANCE = (moved) => Math.max(15, Math.ceil(moved * 0.25));

const RATCHET_RULES = /\b(max-lines|max-lines-per-function|max-statements|max-depth|max-nested-callbacks|max-params|complexity)\b/;

const GUIDE = 'Nested guide: CLAUDE.md in this folder (or the nearest parent).';

function scriptKind(file) {
  const k = typescript().ScriptKind;
  if (file.endsWith('.tsx')) return k.TSX;
  if (file.endsWith('.jsx')) return k.JSX;
  if (/\.[cm]?js$/.test(file)) return k.JS;
  return k.TS;
}

function isFunctionLike(n) {
  const S = typescript().SyntaxKind;
  switch (n.kind) {
    case S.FunctionDeclaration:
    case S.FunctionExpression:
    case S.ArrowFunction:
    case S.MethodDeclaration:
    case S.Constructor:
    case S.GetAccessor:
    case S.SetAccessor:
      return true;
    default:
      return false;
  }
}

function nameText(nameNode, sf) {
  const t = typescript();
  if (!nameNode) return null;
  if (t.isIdentifier(nameNode) || t.isPrivateIdentifier(nameNode)) return nameNode.text;
  if (t.isStringLiteral(nameNode) || t.isNumericLiteral(nameNode)) return nameNode.text;
  return `[${nameNode.getText(sf)}]`;
}

// Skip wrappers that do not change what a function "is called".
function climb(n) {
  const t = typescript();
  let p = n.parent;
  while (p && (t.isParenthesizedExpression(p) || t.isAsExpression(p) || t.isSatisfiesExpression(p)
    || t.isNonNullExpression(p) || t.isTypeAssertionExpression(p))) p = p.parent;
  return p;
}

function calleeName(call, sf) {
  const t = typescript();
  const e = call.expression;
  if (t.isIdentifier(e)) return e.text;
  if (t.isPropertyAccessExpression(e)) return e.name.text;
  return e.getText(sf).slice(0, 30);
}

function functionName(n, sf) {
  const t = typescript();
  if (t.isConstructorDeclaration(n)) return 'constructor';
  if (n.name) return nameText(n.name, sf);
  let p = climb(n);
  if (!p) return '<anonymous>';
  if (t.isVariableDeclaration(p) || t.isPropertyAssignment(p) || t.isPropertyDeclaration(p)) {
    return nameText(p.name, sf) || '<anonymous>';
  }
  if (t.isExportAssignment(p)) return 'default';
  if (t.isJsxExpression(p) && p.parent && t.isJsxAttribute(p.parent)) return p.parent.name.getText(sf);
  if (t.isCallExpression(p)) {
    // const handleX = useCallback(() => ...) — the variable names the function.
    const outer = climb(p);
    if (outer && t.isVariableDeclaration(outer)) return nameText(outer.name, sf) || '<anonymous>';
    return `${calleeName(p, sf)}()`;
  }
  return '<anonymous>';
}

// ESLint 9 `complexity`, classic variant: 1 + one per branch, nested functions excluded.
function complexityOf(fn) {
  const t = typescript();
  const S = t.SyntaxKind;
  let c = 1;
  const visit = (n) => {
    if (n !== fn && isFunctionLike(n)) return;
    switch (n.kind) {
      case S.CatchClause:
      case S.ConditionalExpression:
      case S.ForStatement:
      case S.ForInStatement:
      case S.ForOfStatement:
      case S.IfStatement:
      case S.WhileStatement:
      case S.DoStatement:
      case S.CaseClause:
        c++;
        break;
      case S.BinaryExpression: {
        const op = n.operatorToken.kind;
        if (op === S.AmpersandAmpersandToken || op === S.BarBarToken || op === S.QuestionQuestionToken
          || op === S.AmpersandAmpersandEqualsToken || op === S.BarBarEqualsToken
          || op === S.QuestionQuestionEqualsToken) c++;
        break;
      }
      case S.Parameter:
      case S.BindingElement:
        if (n.initializer) c++;
        break;
      case S.PropertyAccessExpression:
      case S.ElementAccessExpression:
      case S.CallExpression:
        if (n.questionDotToken) c++;
        break;
      default:
        break;
    }
    t.forEachChild(n, visit);
  };
  // Parameters belong to the function (defaults count), the body is walked whole.
  t.forEachChild(fn, visit);
  return c;
}

function collectDirectives(content) {
  const out = [];
  const re = /(?:\/\/|\/\*)\s*eslint-disable(?:-next-line|-line)?\b([^\n]*)/g;
  let m;
  while ((m = re.exec(content))) {
    if (RATCHET_RULES.test(m[1])) {
      const line = content.slice(0, m.index).split('\n').length;
      out.push({ line, text: m[0].trim().replace(/\s*\*\/\s*$/, '') });
    }
  }
  return out;
}

// Strip source positions so the printer cannot copy the author's line breaks, and
// force a canonical layout: blocks and object literals always expanded, arrays inline.
function normalizeTree(root) {
  const t = typescript();
  const S = t.SyntaxKind;
  const strip = (n) => {
    t.forEachChild(n, strip);
    if (n.kind === S.Block || n.kind === S.ObjectLiteralExpression || n.kind === S.CaseBlock) n.multiLine = true;
    if (n.kind === S.ArrayLiteralExpression) n.multiLine = false;
    n.pos = -1;
    n.end = -1;
  };
  root.statements.forEach(strip);
}

function countLines(text) {
  return text.split('\n').filter((l) => l.trim() !== '').length;
}

function measure(content, file) {
  const t = typescript();
  const sf = t.createSourceFile(file, content, t.ScriptTarget.Latest, true, scriptKind(file));

  // Pass 1, while source positions exist: names, line numbers, complexity.
  const fns = [];
  const walk = (n, scope, parent) => {
    let next = scope;
    let nextParent = parent;
    if (isFunctionLike(n)) {
      const name = functionName(n, sf);
      const key = scope.length ? `${scope.join(' > ')} > ${name}` : name;
      const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
      fns.push({ node: n, key, name, line, parent, complexity: complexityOf(n) });
      next = scope.concat(name);
      nextParent = fns.length - 1;
    } else if (t.isClassDeclaration(n) || t.isClassExpression(n)) {
      next = scope.concat(n.name ? n.name.text : '<class>');
    }
    t.forEachChild(n, (c) => walk(c, next, nextParent));
  };
  walk(sf, [], -1);

  // Pass 2: normalize, then measure the file and each function in printed form.
  normalizeTree(sf);
  const printer = t.createPrinter({ removeComments: true });
  const lines = countLines(printer.printFile(sf));
  // A function's length is its OWN lines: nested function bodies are measured as
  // functions of their own, each leaving one line behind in its parent. Without this,
  // one line added to a callback is reported again for every enclosing function (the
  // component, its useEffect, the handler inside it). Complexity already works this way.
  const total = fns.map((f) => countLines(printer.printNode(t.EmitHint.Unspecified, f.node, sf)));
  const own = total.slice();
  fns.forEach((f, i) => { if (f.parent >= 0) own[f.parent] -= total[i] - 1; });
  const functions = fns.map((f, i) => ({
    key: f.key,
    name: f.name,
    line: f.line,
    complexity: f.complexity,
    lines: own[i],
  }));

  return { lines, functions, directives: collectDirectives(content) };
}

// The file as normalized, trimmed, non-blank lines (shared with the duplicates metric).
function normalizedLines(content, file) {
  const t = typescript();
  const sf = t.createSourceFile(file, content, t.ScriptTarget.Latest, true, scriptKind(file));
  normalizeTree(sf);
  const text = t.createPrinter({ removeComments: true }).printFile(sf);
  return text.split('\n').map((l) => l.trim()).filter((l) => l !== '');
}

// Non-trivial normalized lines — used to recognise code MOVED between files.
function movableLines(content, file) {
  return normalizedLines(content, file).filter((l) => l.length >= 12 && /[A-Za-z]/.test(l));
}

function multiset(arr) {
  const m = new Map();
  for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
  return m;
}

function overFunctions(m) {
  return m.functions.filter((f) => f.lines > LIMITS.functionLines || f.complexity > LIMITS.complexity);
}

// Group a file's over-limit functions by key; duplicates (two anonymous useEffect
// callbacks in one component) are compared as a sorted multiset, so inserting a new
// sibling above an old one cannot shift a key onto the wrong function.
function groupByKey(fns) {
  const g = new Map();
  for (const f of fns) {
    const k = f.key;
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(f);
  }
  for (const list of g.values()) list.sort((a, b) => (b.lines - a.lines) || (b.complexity - a.complexity));
  return g;
}

function fnViolation(file, f, reason) {
  const over = [];
  if (f.lines > LIMITS.functionLines) over.push(`${f.lines} lines (limit ${LIMITS.functionLines})`);
  if (f.complexity > LIMITS.complexity) over.push(`complexity ${f.complexity} (limit ${LIMITS.complexity})`);
  return {
    metric: 'size',
    file,
    line: f.line,
    message: `function '${f.key}' ${reason}: ${over.join(', ')}.`,
    remedy: 'Extract the branch or block into a named helper (same file or a sibling module) and call it. '
      + 'If you only renamed or moved the function, keep the old name in this commit and rename separately.',
  };
}

// before: measurement or null (new file). after: measurement.
// ctx: { file, beforeFile, movedOut, functionsLeaving }
function compareFile(before, after, ctx) {
  const v = [];
  const { file } = ctx;
  const L = LIMITS.fileLines;

  // File size.
  if (!before) {
    if (after.lines > L) {
      v.push({
        metric: 'size', file, line: 1,
        message: `new file has ${after.lines} normalized lines (limit ${L}).`,
        remedy: `Split it into sibling modules of at most ${L} lines each, by responsibility (types, helpers, sub-components, data access). ${GUIDE}`,
      });
    }
  } else if (before.lines > L) {
    if (after.lines > before.lines) {
      v.push({
        metric: 'size', file, line: 1,
        message: `file is over the limit and grew: ${before.lines} to ${after.lines} normalized lines (limit ${L}).`,
        remedy: `An over-limit file may not grow. Put the new code in a new sibling module, or extract at least ${after.lines - before.lines} line(s) out of this file in the same commit. ${GUIDE}`,
      });
    } else if (ctx.movedOut > 0) {
      // Split laundering: code moved out to files added in this commit, new code added back.
      const grewBy = after.lines - (before.lines - ctx.movedOut);
      const allowance = WIRING_ALLOWANCE(ctx.movedOut);
      if (grewBy > allowance) {
        v.push({
          metric: 'size', file, line: 1,
          message: `over-limit file moved ${ctx.movedOut} lines into new files but gained ${grewBy} new lines in the same commit (wiring allowance ${allowance}; file ${before.lines} to ${after.lines}, limit ${L}).`,
          remedy: 'Commit the extraction on its own, then add the new behaviour in the new module rather than in this file. '
            + `An over-limit file may not take new code paid for by moving old code out. ${GUIDE}`,
        });
      }
    }
  } else if (after.lines > L) {
    v.push({
      metric: 'size', file, line: 1,
      message: `file crossed the limit: ${before.lines} to ${after.lines} normalized lines (limit ${L}).`,
      remedy: `Keep it at or under ${L}: put the new code in a sibling module. ${GUIDE}`,
    });
  }

  // Functions.
  const beforeOver = groupByKey(before ? overFunctions(before) : []);
  const afterOver = groupByKey(overFunctions(after));
  for (const [key, list] of afterOver) {
    const prev = beforeOver.get(key) || [];
    list.forEach((f, i) => {
      const p = prev[i];
      if (!p) {
        // Renamed in place or moved from another file in this change: not new.
        if (ctx.functionsLeaving && ctx.functionsLeaving(f, file)) return;
        v.push(fnViolation(file, f, 'is new or newly over a limit'));
      } else if (f.lines > p.lines && f.lines > LIMITS.functionLines) {
        v.push(fnViolation(file, f, `is over a limit and grew from ${p.lines} lines`));
      } else if (f.complexity > p.complexity && f.complexity > LIMITS.complexity) {
        v.push(fnViolation(file, f, `is over a limit and got more complex (was ${p.complexity})`));
      }
    });
  }

  // Disable directives naming a size/complexity rule.
  const prevDirectives = multiset((before ? before.directives : []).map((d) => d.text));
  for (const d of after.directives) {
    const n = prevDirectives.get(d.text) || 0;
    if (n > 0) { prevDirectives.set(d.text, n - 1); continue; }
    v.push({
      metric: 'size', file, line: d.line,
      message: `new disable directive for a size/complexity rule: \`${d.text}\`.`,
      remedy: 'Remove it. The quality ratchet does not run through ESLint, so it silences nothing; '
        + 'fix the size or complexity instead, or add a reasoned entry to EXEMPT in scripts/quality-ratchet.cjs if the file is generated.',
    });
  }
  return v;
}

module.exports = {
  LIMITS,
  WIRING_ALLOWANCE,
  measure,
  movableLines,
  normalizedLines,
  multiset,
  overFunctions,
  compareFile,
};
