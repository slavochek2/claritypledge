/**
 * Source text of one edge function, for structural tests: index.ts plus every other non-test
 * .ts module in the function's own directory (a function may keep its logic in a handler.ts
 * that deploys with it). Returns null when the directory has no index.ts.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';

export function functionSource(dir: string): string | null {
  const entry = join(dir, 'index.ts');
  if (!existsSync(entry)) return null;
  const others = readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts' && !f.endsWith('.test.ts'))
    .sort()
    .map((f) => join(dir, f));
  return [entry, ...others].map((f) => readFileSync(f, 'utf8')).join('\n');
}

/** Every deployable function under `functionsDir` (skips `_shared`), with its source. */
export function allFunctionSources(functionsDir: string): Array<{ name: string; src: string }> {
  return readdirSync(functionsDir)
    .filter((name) => name !== '_shared' && statSync(join(functionsDir, name)).isDirectory())
    .map((name) => ({ name, src: functionSource(join(functionsDir, name)) }))
    .filter((f): f is { name: string; src: string } => f.src !== null);
}
