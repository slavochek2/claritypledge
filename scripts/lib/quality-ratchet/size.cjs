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

// A vanished over-limit function covers a "new" one only when their bodies share at
// least this share of real lines: deleting one long function must not license an
// unrelated new one of the same size.
const SAME = 0.5;

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

// Source text without comments or layout, so editing a comment cannot rename a function.
const bare = (node, sf) => node.getText(sf).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').replace(/\s+/g, ' ').trim();

function nameText(nameNode, sf) {
  const t = typescript();
  if (!nameNode) return null;
  if (t.isIdentifier(nameNode) || t.isPrivateIdentifier(nameNode)) return nameNode.text;
  if (t.isStringLiteral(nameNode) || t.isNumericLiteral(nameNode)) return nameNode.text;
  return `[${bare(nameNode, sf)}]`;
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
  return bare(e, sf).slice(0, 30);
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
  if (t.isJsxExpression(p) && p.parent && t.isJsxAttribute(p.parent)) return bare(p.parent.name, sf);
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

// Real comments only, found through the parser's comment ranges: a directive split over
// several lines is caught, and directive-like text inside a string is not.
function collectDirectives(content, sf) {
  const t = typescript();
  const out = [];
  const seen = new Set();
  const take = (ranges) => {
    for (const r of ranges || []) {
      if (seen.has(r.pos)) continue;
      seen.add(r.pos);
      const text = content.slice(r.pos, r.end);
      // A disable naming a size/complexity rule, a BLANKET disable (no rule list turns every
      // rule off, these included), or an inline config comment setting one of them.
      const m = /^(?:\/\/|\/\*)\s*eslint-disable(?:-next-line|-line)?\b([\s\S]*)$/.exec(text);
      const rules = m ? m[1].replace(/\*\/$/, '').split('--')[0].trim() : '';
      const config = /^\/\*\s*eslint\s+([\s\S]*)$/.exec(text);
      if ((m && (rules === '' || RATCHET_RULES.test(rules))) || (config && RATCHET_RULES.test(config[1]))) {
        const line = sf.getLineAndCharacterOfPosition(r.pos).line + 1;
        out.push({ line, text: text.replace(/\s*\*\/$/, '').replace(/\s+/g, ' ').trim() });
      }
    }
  };
  const visit = (n) => {
    take(t.getLeadingCommentRanges(content, n.getFullStart()));
    take(t.getTrailingCommentRanges(content, n.getEnd()));
    t.forEachChild(n, visit);
  };
  visit(sf);
  take(t.getLeadingCommentRanges(content, sf.endOfFileToken.getFullStart()));
  return out;
}

// The parser recovers from syntax errors instead of throwing, so a broken file would
// otherwise be measured as whatever it recovered to. Refuse it: the runner exits 2.
function parse(content, file) {
  const t = typescript();
  const sf = t.createSourceFile(file, content, t.ScriptTarget.Latest, true, scriptKind(file));
  const d = sf.parseDiagnostics || [];
  if (d.length) {
    const at = sf.getLineAndCharacterOfPosition(d[0].start || 0).line + 1;
    throw new Error(`cannot parse ${file}:${at}: ${t.flattenDiagnosticMessageText(d[0].messageText, ' ')} (the ratchet measures only code that parses)`);
  }
  return sf;
}

// Lines the printer would join that are really separate steps: each extra operand of a
// comma operator (`a(), b()`, `void (a(), b())`, `return (a(), b())`) and each extra
// declarator (`const a = 1, b = 2`) counts as one more line. A for-loop header is exempt.
function extraLines(n) {
  const t = typescript();
  const S = t.SyntaxKind;
  const inForHeader = (x) => {
    for (let c = x, p = x.parent; p; c = p, p = p.parent) {
      if ((t.isForStatement(p) && (p.initializer === c || p.incrementor === c)) || ((t.isForOfStatement(p) || t.isForInStatement(p)) && p.initializer === c)) return true;
      if (t.isStatement(p) || t.isBlock(p)) return false;
    }
    return false;
  };
  if (t.isBinaryExpression(n) && n.operatorToken.kind === S.CommaToken && !inForHeader(n)) return 1;
  if (t.isVariableDeclarationList(n) && n.declarations.length > 1 && !inForHeader(n)) return n.declarations.length - 1;
  return 0;
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
  const sf = parse(content, file);
  const directives = collectDirectives(content, sf);

  // Pass 1, while source positions exist: names, line numbers, complexity, and the
  // joined-line extras, credited to the file and to the innermost enclosing function.
  const fns = [];
  let fileExtra = 0;
  const walk = (n, scope, parent) => {
    let next = scope;
    let nextParent = parent;
    const extra = extraLines(n);
    if (extra) {
      fileExtra += extra;
      if (parent >= 0) fns[parent].extra = (fns[parent].extra || 0) + extra;
    }
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
  const printed = printer.printFile(sf);
  const lines = countLines(printed) + fileExtra;
  // A function's length is its OWN lines: nested function bodies are measured as
  // functions of their own, each leaving one line behind in its parent. Without this,
  // one line added to a callback is reported again for every enclosing function (the
  // component, its useEffect, the handler inside it). Complexity already works this way.
  const texts = fns.map((f) => printer.printNode(t.EmitHint.Unspecified, f.node, sf));
  const total = texts.map(countLines);
  const own = total.map((n, i) => n + (fns[i].extra || 0));
  fns.forEach((f, i) => { if (f.parent >= 0) own[f.parent] -= total[i] - 1; });
  const functions = fns.map((f, i) => {
    const fn = { key: f.key, name: f.name, line: f.line, complexity: f.complexity, lines: own[i] };
    // Body lines identify a function across a rename or move; kept for over-limit ones only.
    if (fn.lines > LIMITS.functionLines || fn.complexity > LIMITS.complexity) fn.body = movable(texts[i]);
    return fn;
  });

  return { lines, functions, directives, movable: movable(printed) };
}

function movable(printed) {
  return printed.split('\n').map((l) => l.trim()).filter((l) => l.length >= 12 && /[A-Za-z]/.test(l));
}

// Share of the NEW body's real lines that were already in the old one (multiset), 0..1.
// Containment, not overlap: an outer function whose nested helper was extracted keeps
// all of its own lines, though the old body also held the helper's.
function containment(oldBody, newBody) {
  if (!oldBody || !newBody || newBody.length === 0) return 0;
  const m = multiset(oldBody);
  let hit = 0;
  for (const l of newBody) {
    const n = m.get(l) || 0;
    if (n > 0) { hit++; m.set(l, n - 1); }
  }
  return hit / newBody.length;
}

// Share of real lines two bodies have in common (multiset), 0..1.
function similarity(a, b) {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  const m = multiset(a);
  let hit = 0;
  for (const l of b) {
    const n = m.get(l) || 0;
    if (n > 0) { hit++; m.set(l, n - 1); }
  }
  return hit / Math.max(a.length, b.length);
}

// The file as normalized, trimmed, non-blank lines (shared with the duplicates metric).
function normalizedLines(content, file) {
  const t = typescript();
  const sf = parse(content, file);
  normalizeTree(sf);
  const text = t.createPrinter({ removeComments: true }).printFile(sf);
  return text.split('\n').map((l) => l.trim()).filter((l) => l !== '');
}


function multiset(arr) {
  const m = new Map();
  for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
  return m;
}

function overFunctions(m) {
  return m.functions.filter((f) => f.lines > LIMITS.functionLines || f.complexity > LIMITS.complexity);
}

// Pair each over-limit function with the before-function of the same key it most
// resembles (body similarity, then closest size). Two anonymous callbacks share a key, so
// pairing by position or by size would let a deleted or reordered sibling become the
// yardstick for an untouched one.
function pairByKey(beforeOver, afterOver) {
  const cands = [];
  afterOver.forEach((f, i) => beforeOver.forEach((p, j) => {
    if (p.key === f.key) {
      cands.push({ i, j, s: similarity(f.body, p.body), d: Math.abs(f.lines - p.lines) + Math.abs(f.complexity - p.complexity) });
    }
  }));
  cands.sort((a, b) => (b.s - a.s) || (a.d - b.d));
  const pairs = new Array(afterOver.length).fill(null);
  const usedBefore = new Set();
  for (const c of cands) {
    if (pairs[c.i] || usedBefore.has(c.j)) continue;
    pairs[c.i] = beforeOver[c.j];
    usedBefore.add(c.j);
  }
  return pairs;
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
      // Split laundering: code moved out to other files in this commit, new code added back.
      const grewBy = after.lines - (before.lines - ctx.movedOut);
      const allowance = WIRING_ALLOWANCE(ctx.movedOut);
      if (grewBy > allowance) {
        v.push({
          metric: 'size', file, line: 1,
          message: `over-limit file moved ${ctx.movedOut} lines into other files but gained ${grewBy} new lines in the same commit (wiring allowance ${allowance}; file ${before.lines} to ${after.lines}, limit ${L}).`,
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
  const afterOver = overFunctions(after);
  const pairs = pairByKey(before ? overFunctions(before) : [], afterOver);
  afterOver.forEach((f, i) => {
    const p = pairs[i];
    if (!p) {
      // Renamed in place or moved from another file in this change: not new.
      if (ctx.functionsLeaving && ctx.functionsLeaving(f, file)) return;
      v.push(fnViolation(file, f, 'is new or newly over a limit'));
      return;
    }
    const worse = [];
    if (f.lines > p.lines && f.lines > LIMITS.functionLines) worse.push(`grew from ${p.lines} lines`);
    if (f.complexity > p.complexity && f.complexity > LIMITS.complexity) worse.push(`got more complex (was ${p.complexity})`);
    if (worse.length) v.push(fnViolation(file, f, `is over a limit and ${worse.join(' and ')}`));
  });

  // Disable directives naming a size/complexity rule.
  const prevDirectives = multiset((before ? before.directives : []).map((d) => d.text));
  for (const d of after.directives) {
    const n = prevDirectives.get(d.text) || 0;
    if (n > 0) { prevDirectives.set(d.text, n - 1); continue; }
    v.push({
      metric: 'size', file, line: d.line,
      message: `new disable directive for a size/complexity rule: \`${d.text}\`.`,
      remedy: 'Remove it. The quality ratchet does not run through ESLint, so it silences nothing; '
        + 'fix the size or complexity instead, or add a reasoned entry to EXCLUDED in scripts/lib/quality-ratchet/scope.cjs if the file is generated.',
    });
  }
  return v;
}

module.exports = {
  LIMITS,
  WIRING_ALLOWANCE,
  SAME,
  measure,
  normalizedLines,
  multiset,
  similarity,
  containment,
  overFunctions,
  compareFile,
};
