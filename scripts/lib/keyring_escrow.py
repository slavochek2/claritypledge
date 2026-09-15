#!/usr/bin/env python3
"""keyring_escrow.py — P1322: an offline, encrypted recovery copy of the locked credential set.

Why this exists: `keyring.sh enroll` recovers the keychain from `.env.local`, which is exactly the
file P1318 removes the critical copies from. After that removal the keychain is the ONLY copy, and a
lost keychain or a new laptop would mean no prod access. This is the recovery source that survives.

  export  OUT.dmg        read every registered key (one authorization dialog EACH — the lock is
                         not bypassed), then write them into a new AES-256 encrypted disk image.
                         macOS asks for the image passphrase in its own dialog, so the passphrase
                         never passes through a shell, a transcript or argv.
  drill   IN.dmg [N]     prove the escrow restores WITHOUT the plaintext. Runs inside a sandbox that
                         denies every read of the env files — checked from inside, not assumed —
                         restores into throwaway items under cp.keyring.escrowdrill.*, which are
                         confirmed absent first, checks every gate, reads N items back (default 1,
                         one dialog each) and deletes the drill items.
  restore IN.dmg [KEY..] real recovery: re-create items under their real names. Refuses to replace
                         an item that already exists (withdraw it first).

Invariants:
  - Never print, log or pass a value as an argument. Values move over pipes only.
  - The bundle exists in plaintext only inside the mounted encrypted volume, between attach and
    detach, and is written with mode 600.
  - The image may not be written inside a git checkout, and not under $HOME, which the nightly
    restic backup copies wholesale — an escrow on the backup path is a second copy of what it
    protects. Removable media under /Volumes is the default; KEYRING_ESCROW_ALLOW_ANY_PATH=1 is the
    deliberate override (the git-checkout refusal has no override).
  - Status output never contains the characters that shell-safety.md bans from status lines.

`--passphrase-stdin` reads the IMAGE passphrase from stdin instead of the macOS dialog. It exists for
the hermetic test; it grants nothing about the credentials, whose every read still needs a human.

Exit codes: 0 ok · 1 usage or refused · 2 verification failed · 3 container or keychain error
"""
import base64
import os
import plistlib
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
KEYCHAIN_PY = os.path.join(HERE, "keychain.py")
PREFIX = "cp.keyring."
DRILL_PREFIX = "cp.keyring.escrowdrill."
HEADER = b"cp-keyring-escrow v1"
BUNDLE = "escrow.bundle"
NAME_RE = re.compile(r"^[A-Z][A-Z0-9_]{0,99}$")
REASON_EXPORT = "escrow export: offline recovery copy of the locked set (P1322)"
REASON_DRILL = "escrow drill: read back one restored throwaway item (P1322)"


class EscrowError(Exception):
    def __init__(self, message, code=3):
        super().__init__(message)
        self.code = code


def say(line):
    """Status output. Refuses the redirect-parseable characters (shell-safety.md) rather than
    trusting every call site to avoid them."""
    for ch in "<>|":
        if ch in line:
            raise EscrowError("internal: status line contains a banned character", 3)
    print(line, flush=True)


# --- bundle format -----------------------------------------------------------------------------

def serialize(pairs):
    """NAME<TAB>base64(value) per line under a version header. base64 because a credential may
    contain newlines, tabs, quotes or bytes an env-file parser would mangle."""
    names = [n for n, _ in pairs]
    if len(set(names)) != len(names):
        raise EscrowError("duplicate key name in bundle", 2)
    out = [HEADER]
    for name, value in pairs:
        if not NAME_RE.match(name):
            raise EscrowError("invalid key name in bundle", 2)
        if not value:
            raise EscrowError("refusing to escrow an empty value for %s" % name, 2)
        out.append(name.encode("ascii") + b"\t" + base64.b64encode(value))
    return b"\n".join(out) + b"\n"


def parse(blob):
    lines = blob.split(b"\n")
    if not lines or lines[0] != HEADER:
        raise EscrowError("not a cp-keyring-escrow v1 bundle", 2)
    pairs, seen = [], set()
    for lineno, line in enumerate(lines[1:], 2):
        if not line:
            continue
        raw_name, sep, enc = line.partition(b"\t")
        name = raw_name.decode("ascii", "replace")
        if not sep or not NAME_RE.match(name):
            raise EscrowError("malformed bundle line %d" % lineno, 2)
        if name in seen:
            raise EscrowError("duplicate key %s in bundle" % name, 2)
        try:
            value = base64.b64decode(enc, validate=True)
        except Exception:
            raise EscrowError("undecodable value for %s" % name, 2)
        if not value:
            raise EscrowError("empty value for %s in bundle" % name, 2)
        seen.add(name)
        pairs.append((name, value))
    if not pairs:
        raise EscrowError("bundle holds no keys", 2)
    return pairs


# --- where an escrow may live ------------------------------------------------------------------

def _inside_git(directory):
    r = subprocess.run(["git", "-C", directory, "rev-parse", "--is-inside-work-tree"],
                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    return r.returncode == 0 and r.stdout.strip() == b"true"


def check_destination(path, home=None, allow_any=False):
    """None if the image may be written here, else the reason it may not."""
    real = os.path.realpath(path)
    parent = os.path.dirname(real)
    if not os.path.isdir(parent):
        return "directory does not exist: %s" % parent
    if os.path.lexists(path) or os.path.lexists(real):
        return "refusing to overwrite an existing file: %s" % path
    if _inside_git(parent):
        return "inside a git checkout, where an escrow could be committed"
    if allow_any:
        return None
    home = os.path.realpath(home or os.path.expanduser("~"))
    if real == home or real.startswith(home + os.sep):
        return ("under $HOME, which the nightly restic backup copies wholesale. Use removable "
                "media under /Volumes")
    # realpath first: "/Volumes/Macintosh HD" is a link to "/", and resolves out of /Volumes.
    if not real.startswith("/Volumes/"):
        return ("not on removable media under /Volumes. Set KEYRING_ESCROW_ALLOW_ANY_PATH=1 only "
                "if you mean to keep it elsewhere")
    return None


# --- the encrypted container -------------------------------------------------------------------

def _hdiutil(args, passphrase):
    """passphrase None: macOS asks in its own dialog (-agentpass). Bytes: read from stdin."""
    if passphrase is None:
        return subprocess.run(["hdiutil"] + args + ["-agentpass"],
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return subprocess.run(["hdiutil"] + args + ["-stdinpass"], input=passphrase,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def _detach(mount_point):
    r = subprocess.run(["hdiutil", "detach", mount_point],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if r.returncode != 0:
        r = subprocess.run(["hdiutil", "detach", "-force", mount_point],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if r.returncode != 0:
        # Loud, because a volume left mounted is the plaintext bundle left readable.
        sys.stderr.write("keyring-escrow: COULD NOT DETACH %s. Eject it now: hdiutil detach -force %s\n"
                         % (mount_point, mount_point))


def _attach(image, passphrase, mount_root):
    r = _hdiutil(["attach", image, "-nobrowse", "-owners", "on", "-mountrandom", mount_root,
                  "-plist"], passphrase)
    if r.returncode != 0:
        raise EscrowError("could not open the escrow image: wrong passphrase, or the dialog was "
                          "cancelled", 3)
    try:
        entities = plistlib.loads(r.stdout).get("system-entities", [])
    except Exception:
        entities = []
    mounts = [e["mount-point"] for e in entities if e.get("mount-point")]
    if len(mounts) != 1:
        for m in mounts:
            _detach(m)
        raise EscrowError("the escrow image did not mount exactly one volume", 3)
    return mounts[0]


def write_image(path, blob, passphrase=None):
    r = _hdiutil(["create", "-size", "4m", "-fs", "APFS", "-encryption", "AES-256",
                  "-volname", "cp-escrow", path], passphrase)
    if r.returncode != 0:
        if os.path.exists(path):
            os.unlink(path)
        raise EscrowError("could not create the encrypted image (dialog cancelled?)", 3)
    root = tempfile.mkdtemp(prefix="cp-escrow-")
    try:
        mount_point = _attach(path, passphrase, root)
        try:
            target = os.path.join(mount_point, BUNDLE)
            fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as fh:
                fh.write(blob)
                fh.flush()
                os.fsync(fh.fileno())
            with open(target, "rb") as fh:
                if fh.read() != blob:
                    raise EscrowError("the bundle read back differently from what was written", 2)
        finally:
            _detach(mount_point)
    finally:
        shutil.rmtree(root, ignore_errors=True)


def read_image(path, passphrase=None):
    if not os.path.isfile(path):
        raise EscrowError("no escrow image at %s" % path, 1)
    root = tempfile.mkdtemp(prefix="cp-escrow-")
    try:
        mount_point = _attach(path, passphrase, root)
        try:
            with open(os.path.join(mount_point, BUNDLE), "rb") as fh:
                return fh.read()
        except FileNotFoundError:
            raise EscrowError("the image opened but holds no escrow bundle", 2)
        finally:
            _detach(mount_point)
    finally:
        shutil.rmtree(root, ignore_errors=True)


def remembered_passphrase(image):
    """True if macOS saved the image passphrase in the login keychain ("Remember password").
    Reads attributes only (no -w), so it never prompts. A saved passphrase ties the escrow to the
    very keychain it exists to replace, and trusts the disk-image helper to read it silently."""
    r = subprocess.run(["security", "find-generic-password", "-l", os.path.basename(image)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return r.returncode == 0


# --- keychain and registry ---------------------------------------------------------------------

def _keychain(verb, *args, stdin=None):
    return subprocess.run([sys.executable, KEYCHAIN_PY, verb] + list(args), input=stdin,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def _exists(service):
    return _keychain("exists", service).returncode == 0


def registry_names():
    path = os.environ.get("KEYRING_REGISTRY", "")
    if not path:
        r = subprocess.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
                           stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        common = r.stdout.decode().strip()
        if not common:
            raise EscrowError("cannot resolve the repo to find the critical-key registry", 1)
        path = os.path.join(os.path.dirname(common), ".private", "docs", "keyring-critical.txt")
    try:
        with open(path) as fh:
            names = [re.sub(r"\s", "", line.split("#", 1)[0]) for line in fh]
    except OSError:
        raise EscrowError("cannot read the critical-key registry: %s" % path, 1)
    names = [n for n in names if n]
    if not names:
        raise EscrowError("the critical-key registry is empty", 1)
    return names


# --- the plaintext-loss simulation -------------------------------------------------------------

def plaintext_paths():
    """Every path the plaintext env copies are reachable at: the main checkout's files and this
    checkout's (a worktree's .env.local is a link to the main one), plus their resolved targets.
    KEYRING_ESCROW_DENY (colon-separated) adds paths — the hermetic test's stand-in env file."""
    paths = set()
    for cmd in (["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
                ["git", "rev-parse", "--show-toplevel"]):
        out = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL).stdout
        root = out.decode().strip()
        if not root:
            continue
        if root.endswith("/.git"):
            root = os.path.dirname(root)
        for name in (".env.local", ".env.prod"):
            paths.add(os.path.join(root, name))
    for extra in os.environ.get("KEYRING_ESCROW_DENY", "").split(":"):
        if extra:
            paths.add(os.path.abspath(extra))
    return sorted(paths | {os.path.realpath(p) for p in paths})


def sandbox_profile(paths):
    def quote(p):
        return '"' + p.replace("\\", "\\\\").replace('"', '\\"') + '"'
    rules = " ".join("(literal %s)" % quote(p) for p in paths)
    return "(version 1)(allow default)(deny file-read* %s)" % rules


def denial_failures(paths):
    """Paths that are still readable. Run INSIDE the sandbox: an empty result is the evidence the
    simulation is in effect. Outside it, a readable file must show up — that is the control."""
    readable = []
    for p in paths:
        try:
            with open(p, "rb") as fh:
                fh.read(1)
            readable.append(p)
        except PermissionError:
            pass
    return readable


# --- commands ----------------------------------------------------------------------------------

def cmd_export(out, passphrase):
    reason = check_destination(out, allow_any=os.environ.get("KEYRING_ESCROW_ALLOW_ANY_PATH") == "1")
    if reason:
        raise EscrowError("refusing to write the escrow: " + reason, 1)
    names = registry_names()
    say("Exporting %d locked credentials. Expect one authorization dialog per key, then the image"
        " passphrase dialog. Click Allow, never Always Allow." % len(names))
    pairs = []
    for name in names:
        r = _keychain("get", PREFIX + name, REASON_EXPORT)
        if r.returncode != 0 or not r.stdout:
            raise EscrowError("could not read %s (declined, or not enrolled). Nothing was written."
                              % name, 3)
        pairs.append((name, r.stdout))
        say("READ      %s" % name)
    blob = serialize(pairs)
    write_image(out, blob, passphrase)
    del pairs, blob
    say("WRITTEN   %s" % out)
    if passphrase is None and remembered_passphrase(out):
        raise EscrowError("macOS saved the image passphrase in your login keychain. Delete it: "
                          "security delete-generic-password -l %s" % os.path.basename(out), 2)
    say("Next: ./scripts/keyring-escrow.sh drill %s" % out)
    return 0


def cmd_drill(image, readback, passphrase):
    if not shutil.which("sandbox-exec"):
        raise EscrowError("sandbox-exec is unavailable, so plaintext loss cannot be simulated", 3)
    paths = plaintext_paths()
    present = [p for p in paths if os.path.exists(p)]
    env = dict(os.environ, KEYRING_ESCROW_PRESENT=":".join(present))
    cmd = ["sandbox-exec", "-p", sandbox_profile(paths), sys.executable, os.path.abspath(__file__),
           "_drill-inner", image, str(readback)]
    if passphrase is not None:
        cmd.append("--passphrase-stdin")
    r = subprocess.run(cmd, env=env, input=passphrase)
    return r.returncode


def cmd_drill_inner(image, readback, passphrase):
    present = [p for p in os.environ.get("KEYRING_ESCROW_PRESENT", "").split(":") if p]
    if present:
        still = denial_failures(present)
        if still:
            raise EscrowError("plaintext loss is NOT simulated: %d env path(s) still readable inside "
                              "the sandbox. Drill aborted." % len(still), 2)
        say("SIMULATED plaintext loss: %d env path(s) present on disk, all unreadable here"
            % len(present))
    else:
        say("SIMULATED plaintext loss: the known env file paths are already absent. Copies elsewhere "
            "(transcripts, backups) are outside what this drill can see")

    pairs = parse(read_image(image, passphrase))
    say("OPENED    escrow with %d keys" % len(pairs))
    registered = registry_names()
    names = [n for n, _ in pairs]
    missing = [n for n in registered if n not in names]
    extra = [n for n in names if n not in registered]
    for n in extra:
        say("EXTRA     %s is in the escrow but no longer registered" % n)

    created, failures = [], 0
    try:
        for name, value in pairs:
            svc = DRILL_PREFIX + name
            if _exists(svc):
                _keychain("delete", svc)
                say("CLEARED   leftover drill item for %s" % name)
            if _exists(svc):
                raise EscrowError("a drill item for %s already exists and could not be removed" % name, 3)
            r = _keychain("add", svc, stdin=value)
            if r.returncode != 0 or not _exists(svc):
                say("FAILED    %s did not restore" % name)
                failures += 1
                continue
            created.append((name, svc, value))
            say("RESTORED  %s into an item that did not exist before" % name)

        if created:
            acl = _keychain("acl", *[svc for _, svc, _ in created])
            if acl.returncode != 0:
                say("FAILED    at least one restored item is not gated")
                failures += 1
            else:
                say("GATED     all %d restored items require authorization on every read" % len(created))

        for name, svc, value in created[:max(0, readback)]:
            r = _keychain("get", svc, REASON_DRILL)
            if r.returncode != 0:
                say("FAILED    read-back of %s was declined or failed" % name)
                failures += 1
            elif r.stdout != value:
                say("FAILED    read-back of %s does not match the escrow" % name)
                failures += 1
            else:
                say("MATCHED   %s read back identical to the escrow copy" % name)
    finally:
        for name, svc, _ in created:
            _keychain("delete", svc)
        leftovers = [n for n, svc, _ in created if _exists(svc)]
        for n in leftovers:
            say("LEFTOVER  drill item for %s could not be deleted" % n)
        del created

    for n in missing:
        say("MISSING   %s is registered but absent from the escrow. Re-export." % n)
    if failures or missing or leftovers:
        say("DRILL FAIL")
        return 2
    say("DRILL PASS: %d keys restored without the plaintext, gated, %d read back, drill items removed"
        % (len(pairs), min(max(0, readback), len(pairs))))
    return 0


def cmd_restore(image, only, passphrase):
    pairs = parse(read_image(image, passphrase))
    wanted = set(only)
    unknown = wanted - {n for n, _ in pairs}
    for n in sorted(unknown):
        say("ABSENT    %s is not in the escrow" % n)
    rc = 1 if unknown else 0
    restored = []
    for name, value in pairs:
        if wanted and name not in wanted:
            continue
        svc = PREFIX + name
        if _exists(svc):
            say("SKIP      %s already enrolled. Withdraw it first to replace it." % name)
            rc = 1
            continue
        r = _keychain("add", svc, stdin=value)
        if r.returncode != 0:
            say("FAILED    %s" % name)
            rc = 3
            continue
        restored.append(svc)
        say("RESTORED  %s" % name)
    if restored and _keychain("acl", *restored).returncode != 0:
        say("FAILED    a restored item is not gated. Run ./scripts/keyring.sh verify")
        return 2
    if restored:
        say("Restored %d key(s). Confirm with: ./scripts/keyring.sh verify" % len(restored))
    return rc


def main(argv):
    args = list(argv[1:])
    passphrase = None
    if "--passphrase-stdin" in args:
        args.remove("--passphrase-stdin")
        passphrase = sys.stdin.buffer.readline().rstrip(b"\n")
        if not passphrase:
            raise EscrowError("--passphrase-stdin given but stdin held no passphrase", 1)
    if not args:
        sys.stderr.write(__doc__)
        return 1
    verb, rest = args[0], args[1:]
    if verb in ("drill", "_drill-inner") and len(rest) == 2 and not rest[1].isdigit():
        raise EscrowError("the read-back count must be a whole number", 1)
    if verb == "export" and len(rest) == 1:
        return cmd_export(rest[0], passphrase)
    if verb == "drill" and len(rest) in (1, 2):
        return cmd_drill(rest[0], int(rest[1]) if len(rest) == 2 else 1, passphrase)
    if verb == "_drill-inner" and len(rest) == 2:
        return cmd_drill_inner(rest[0], int(rest[1]), passphrase)
    if verb == "restore" and rest:
        return cmd_restore(rest[0], rest[1:], passphrase)
    sys.stderr.write(__doc__)
    return 1


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv))
    except EscrowError as exc:
        sys.stderr.write("keyring-escrow: %s\n" % exc)
        sys.exit(exc.code)
