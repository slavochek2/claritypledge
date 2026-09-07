/** Fixture: a predicate a skill invokes as a COMMAND that has no CLI entry point.
 *  The must-fail case for DW-22's CLI check (added 2026-09-04, after room-split.mjs
 *  shipped exactly this way and its documented command exited 0 printing nothing). */
export const id = 'nocli-predicate'
export function run() { return { ok: true, verdict: 'PASS', detail: 'ok' } }
export const FIXTURES = { pass: {}, fail: {} }
