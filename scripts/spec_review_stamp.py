#!/usr/bin/env python3
"""P1634 slice 1: spec-review stamp helper (stdlib only).

  hash <spec>                         sha256 of the normalized body
  check <spec>                        current | missing | changed   (exit 0 / 1 / 1; 2 = unreadable)
  glm-allowed <spec>                  allowed | skip: <reason>      (fail closed)
  write <spec> --evidence F [...] [--snapshot S]
                                      stamp hash + vendors, vendors derived from evidence files only.
                                      P1734: with CLAUDE_CODE_SESSION_ID set, --snapshot is required
                                      and its reviewed tally must record every valid evidence file.
"""
import hashlib
import importlib.util
import os
import re
import subprocess
import sys
import tempfile

_here = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("review_receipt", os.path.join(_here, "review_receipt.py"))
_rr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_rr)
EVIDENCE_RE, VENDOR_RE, FLOOR_VENDORS = _rr.EVIDENCE_RE, _rr.VENDOR_RE, _rr.FLOOR_VENDORS

BOX_RE = re.compile(r"^(\s*[-*]\s+)\[[xX ]\]")


class SpecError(Exception):
    pass


def _read(path):
    try:
        with open(path, "rb") as f:
            text = f.read().decode("utf-8")
    except Exception as e:
        raise SpecError(f"cannot read {path}: {e}")
    return text


def _split(text):
    """Return (lines_with_ends, index of closing '---' line). Raises if no frontmatter."""
    lines = text.splitlines(keepends=True)
    if not lines or lines[0].rstrip("\r\n") != "---":
        raise SpecError("no frontmatter")
    for i in range(1, len(lines)):
        if lines[i].rstrip("\r\n") == "---":
            return lines, i
    raise SpecError("no closing frontmatter delimiter")


def _body_hash(text):
    lines, end = _split(text)
    body = "".join(lines[end + 1:]).replace("\r\n", "\n")
    out = []
    for ln in body.split("\n"):
        ln = ln.rstrip()
        ln = BOX_RE.sub(lambda m: m.group(1) + "[ ]", ln)
        out.append(ln)
    return hashlib.sha256("\n".join(out).encode("utf-8")).hexdigest()


def _fm_value(text, key):
    lines, end = _split(text)
    for ln in lines[1:end]:
        m = re.match(rf"^{re.escape(key)}:\s*(.*?)\s*$", ln.rstrip("\r\n"))
        if m:
            return re.sub(r"\s+#.*$", "", m.group(1)).strip("'\"")
    return None


def cmd_hash(a):
    print(_body_hash(_read(a[0])))
    return 0


def _state(text):
    stamped = _fm_value(text, "spec_review_hash")
    if not stamped:
        return "missing"
    return "current" if stamped == _body_hash(text) else "changed"


def cmd_check(a):
    s = _state(_read(a[0]))
    print(s)
    return 0 if s == "current" else 1


def _git(cwd, *args):
    return subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True)


def cmd_glm_allowed(a):
    def skip(why):
        print(f"skip: {why}")
        return 1
    path = os.path.realpath(a[0])
    work = _read(path)
    if _fm_value(work, "disclosure") != "public":
        return skip("working copy is not disclosure: public")
    d = os.path.dirname(path)
    top = _git(d, "rev-parse", "--show-toplevel")
    if top.returncode != 0:
        return skip("not in a git repo")
    root = os.path.realpath(top.stdout.strip())
    rel = os.path.relpath(path, root)
    ls = _git(root, "ls-tree", "--name-only", "HEAD", "--", rel)
    if ls.returncode != 0:
        return skip("git error reading HEAD")
    if ls.stdout.strip():
        shown = _git(root, "show", f"HEAD:{rel}")
        if shown.returncode != 0:
            return skip("git error reading committed copy")
        try:
            committed = shown.stdout
            if _fm_value(committed, "disclosure") != "public":
                return skip("committed copy is not disclosure: public")
        except SpecError:
            return skip("committed copy has no readable frontmatter")
    else:
        br = _git(root, "symbolic-ref", "--short", "-q", "HEAD")
        if br.returncode != 0 or br.stdout.strip() != "main":
            return skip("no committed copy and not on branch main")
    print("allowed")
    return 0


def _tally_refusal(spec, snapshot, valid):
    """P1734. With a session id, a stamp needs a snapshot of the spec whose reviewed tally recorded
    every valid evidence file, and no other untallied snapshot of the spec from this session.
    Without one (a human shell, CI) a given --snapshot is still checked, never required."""
    session = _rr._session()
    if not snapshot:
        if session:
            return ("--snapshot is required when " + _rr.SESSION_ENV + " is set: take one with "
                    "`review_receipt.py snapshot -- <spec>` before the reviewers run, then tally it.")
        return None
    try:
        body = _rr._load_snapshot(snapshot)
    except Exception:
        return f"cannot read snapshot {snapshot}."
    loc = _rr.locate(spec)
    if not loc or loc[1] not in _rr._snap_keys(body):
        return f"snapshot {os.path.basename(snapshot)} does not hold {spec}."
    _commons, misplaced = _rr.snapshot_store_check(snapshot, body)
    if misplaced:
        return misplaced
    common = _rr._snapshot_common(snapshot)
    rec = _rr._tallies(common).get(os.path.basename(snapshot))
    if not rec or rec.get("status") != "reviewed":
        state = rec.get("status") if rec else "no tally"
        return (f"snapshot {os.path.basename(snapshot)} has {state}, not a reviewed tally. Record the "
                "round with `review_receipt.py tally --snapshot <path> --kind spec ...`.")
    why = _rr.tally_backs(common, snapshot, valid)
    if why:
        return why
    others = [p for p in _rr.session_untallied(os.path.dirname(loc[0]), session, {loc[1]})
              if os.path.basename(p) != os.path.basename(snapshot)]
    if others:
        return ("this session has other untallied snapshot(s) of the spec: " + ", ".join(others)
                + ". Tally them, or close a mistaken one with `tally --abandoned`.")
    return None


def cmd_write(a):
    if not a:
        print("usage: write <spec> --evidence F [...]", file=sys.stderr)
        return 2
    spec, evidence, snapshot, i = a[0], [], None, 1
    while i < len(a):
        if a[i] == "--evidence" and i + 1 < len(a):
            evidence.append(a[i + 1]); i += 2
        elif a[i] == "--snapshot" and i + 1 < len(a):
            snapshot = a[i + 1]; i += 2
        else:
            print(f"spec_review_stamp: unknown argument {a[i]}", file=sys.stderr)
            return 2
    vendors, seen, valid = set(), [], []
    for e in evidence:
        try:
            if os.path.getsize(e) == 0:
                seen.append(f"{e}: empty"); continue
            with open(e, errors="replace") as f:
                first = f.readline().rstrip("\n")
        except Exception as ex:
            seen.append(f"{e}: unreadable ({ex})"); continue
        if not EVIDENCE_RE.match(first):
            seen.append(f"{e}: not a successful run"); continue
        m = VENDOR_RE.match(first)
        if m:
            vendors.add(m.group(1)); seen.append(f"{e}: vendor={m.group(1)}"); valid.append(e)
    if not vendors & FLOOR_VENDORS:
        print("spec_review_stamp: REFUSED - need a valid run from gemini or codex; saw: "
              + ("; ".join(seen) or "no evidence files")
              + ". openrouter/GLM alone never earns a stamp. Nothing written.", file=sys.stderr)
        return 1
    why = _tally_refusal(spec, snapshot, valid)  # P1734: checked last, after every older refusal
    if why:
        print("spec_review_stamp: REFUSED - " + why + " Nothing written.", file=sys.stderr)
        return 1
    text = _read(spec)
    lines, end = _split(text)
    digest = _body_hash(text)
    nl = "\r\n" if lines[0].endswith("\r\n") else "\n"
    new = {"spec_review_hash": f"spec_review_hash: {digest}{nl}",
           "spec_review_vendors": f"spec_review_vendors: [{', '.join(sorted(vendors))}]{nl}"}
    fm, done = [], set()
    for ln in lines[1:end]:
        k = next((k for k in new if ln.startswith(k + ":")), None)
        if k:
            if k not in done:
                fm.append(new[k]); done.add(k)
        else:
            fm.append(ln)
    for k in new:
        if k not in done:
            fm.append(new[k])
    out = lines[0] + "".join(fm) + "".join(lines[end:])
    d = os.path.dirname(os.path.abspath(spec))
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".stamp-")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(out.encode("utf-8"))
        os.chmod(tmp, os.stat(spec).st_mode & 0o7777)
        os.replace(tmp, spec)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
    print(_state(out))
    return 0


def main(argv):
    cmds = {"hash": cmd_hash, "check": cmd_check, "glm-allowed": cmd_glm_allowed, "write": cmd_write}
    if len(argv) < 2 or argv[0] not in cmds:
        print(__doc__, file=sys.stderr)
        return 2
    try:
        return cmds[argv[0]](argv[1:])
    except (SpecError, UnicodeDecodeError) as e:
        if argv[0] == "glm-allowed":  # fail closed in the one shape its callers read
            print(f"skip: {e}")
            return 1
        print(f"spec_review_stamp: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
