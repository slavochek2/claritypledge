export const id = 'wired-predicate'

// A correctly-wired predicate has a CLI entry point: a skill invokes it as a
// command, so the command must actually run. Without this the documented
// invocation exits 0 printing nothing (added 2026-09-04).
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('wired-predicate: fixture CLI')
  process.exit(0)
}
