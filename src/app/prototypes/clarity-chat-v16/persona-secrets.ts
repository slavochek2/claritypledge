/**
 * @file persona-secrets.ts
 * @description P1509 v16, Node only (the seed script and the dev-server plugin; never imported by browser code).
 * Where the per-run persona passwords live, and how they are read and written.
 *
 * The file sits OUTSIDE the repository, under the user's home directory. Inside the repo it was git-ignored but
 * still served: Vite serves any file under its root, so `GET /.local/p1509-personas.json` returned the passwords
 * (reproduced in review, and reachable from the LAN because the dev server binds every interface). A path outside
 * every worktree is outside Vite's root and its `server.fs.allow` list, and it is shared by all worktrees, so one
 * seed run serves them all. Containment is checked on REAL paths (symlinks resolved), and neither the file nor
 * the temp file is ever reached through a symlink.
 */
import { randomBytes } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const PERSONA_SECRETS_FILE = path.join(os.homedir(), '.local', 'state', 'claritypledge', 'p1509-personas.json');

export class PersonaSecretsError extends Error {}

const lexists = (p: string) => {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
};

/** A dangling symlink cannot be resolved, so it is refused rather than guessed at. */
function realpathOrRefuse(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    throw new PersonaSecretsError(`Refusing: ${p} is a symlink that cannot be resolved.`);
  }
}

/** The real path of `p`: its deepest existing ancestor resolved through symlinks, plus the rest as written. */
function realish(p: string): string {
  let head = path.resolve(p);
  const tail: string[] = [];
  // lstat, not existsSync: a dangling symlink "does not exist" to existsSync, and walking past it would skip it.
  while (!lexists(head)) {
    const parent = path.dirname(head);
    if (parent === head) break;
    tail.unshift(path.basename(head));
    head = parent;
  }
  return path.join(realpathOrRefuse(head), ...tail);
}

/** True when `child` is `root` or lies inside it (on real paths). A sibling such as `root/..x` is inside. */
export function isInside(root: string, child: string): boolean {
  const rel = path.relative(realish(root), realish(child));
  return rel === '' || !(rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel));
}

/** Refuses a secrets path that lies inside `root` (a repository or a served directory), symlinks resolved. */
export function assertOutside(root: string, file: string = PERSONA_SECRETS_FILE): void {
  if (isInside(root, file)) {
    throw new PersonaSecretsError(`Refusing: the persona secrets file ${file} is inside ${root}, where a dev server can serve it.`);
  }
}

const isSymlink = (p: string) => {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false; // absent
  }
};

/** Writes { generatedAt, passwords } with mode 0600 via a fresh, uniquely named temp file and an atomic rename,
 * in a 0700 directory. Refuses a symlink at the destination; never leaves the temp file behind; never logs a
 * password. `root`, when given, is re-checked against the directory's real path after it is created. */
export function writePersonaSecrets(passwords: Record<string, string>, file: string = PERSONA_SECRETS_FILE, opts: { now?: Date; root?: string } = {}): string {
  const dir = path.dirname(file);
  if (opts.root) assertOutside(opts.root, file); // before touching the filesystem
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (opts.root) assertOutside(opts.root, file); // and again on the real directory just created
  chmodSync(dir, 0o700);
  if (isSymlink(file)) throw new PersonaSecretsError(`Refusing: ${file} is a symlink.`);
  const tmp = `${file}.tmp.${process.pid}.${randomBytes(6).toString('hex')}`;
  try {
    writeFileSync(tmp, JSON.stringify({ generatedAt: (opts.now ?? new Date()).toISOString(), passwords }, null, 2), { mode: 0o600, flag: 'wx' });
    renameSync(tmp, file);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
  return file;
}

/** The password map, or null when the file is absent, unreadable, or a symlink. */
export function readPersonaSecrets(file: string = PERSONA_SECRETS_FILE): Record<string, string> | null {
  if (isSymlink(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { passwords?: unknown };
    const pw = parsed.passwords;
    if (!pw || typeof pw !== 'object' || Array.isArray(pw)) return null;
    // Only own, non-empty string values: a malformed file reads as "not seeded", never as a password.
    return Object.fromEntries(Object.entries(pw).filter(([, v]) => typeof v === 'string' && v.length > 0)) as Record<string, string>;
  } catch {
    return null;
  }
}
