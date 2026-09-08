#!/usr/bin/env python3
"""keychain.py — P1239 critical-credential store on the macOS login keychain.

Every item this creates carries an EMPTY trusted-application list. macOS then
demands human authorization on *every* read: there is no time window, no unlock
command, and no state to remember. The authorization gates one ACCESS, not a
period (P1239 Invariants).

Why Security.framework instead of `security(1)`:
  `security add-generic-password -w <value>` puts the secret in argv, where any
  process can read it out of `ps` for the lifetime of the call. P1239 Done-When
  forbids that. Here `add` takes the value on stdin and hands it to the framework
  in memory, so it never becomes an argument.

Subcommands (service = the keychain service name; account = $USER):
  add <service>       value on stdin; creates/replaces with an empty-ACL item
  get <service>       value to stdout; triggers the authorization dialog
  exists <service>    0 if present, 1 if not — never decrypts, never prompts
  acl <service>...    prints trusted-app count per item — never prompts
  delete <service>    removes the item

Exit codes: 0 ok · 1 not found/usage · 2 denied or auth failure · 3 framework error
"""
import ctypes
import ctypes.util
import datetime
import os
import subprocess
import sys
from ctypes import POINTER, byref, c_char_p, c_long, c_uint32, c_void_p

sec = ctypes.CDLL(ctypes.util.find_library("Security"))
cf = ctypes.CDLL(ctypes.util.find_library("CoreFoundation"))

KCF_UTF8 = 0x08000100
ERR_USER_CANCELED = -128        # errSecUserCanceled — the human clicked Deny
ERR_ITEM_NOT_FOUND = -25300
ERR_AUTH_FAILED = -25293

cf.CFArrayGetCount.restype = c_long
cf.CFArrayGetCount.argtypes = [c_void_p]
cf.CFArrayGetValueAtIndex.restype = c_void_p
cf.CFArrayGetValueAtIndex.argtypes = [c_void_p, c_long]
cf.CFArrayCreate.restype = c_void_p
cf.CFArrayCreate.argtypes = [c_void_p, c_void_p, c_long, c_void_p]
cf.CFStringCreateWithCString.restype = c_void_p
cf.CFStringCreateWithCString.argtypes = [c_void_p, c_char_p, c_uint32]
cf.CFDataGetLength.restype = c_long
cf.CFDataGetLength.argtypes = [c_void_p]
cf.CFDataGetBytePtr.restype = c_void_p
cf.CFDataGetBytePtr.argtypes = [c_void_p]

sec.SecKeychainFindGenericPassword.restype = c_uint32
sec.SecKeychainFindGenericPassword.argtypes = [
    c_void_p, c_uint32, c_char_p, c_uint32, c_char_p,
    POINTER(c_uint32), POINTER(c_void_p), POINTER(c_void_p)]
sec.SecKeychainAddGenericPassword.restype = c_uint32
sec.SecKeychainAddGenericPassword.argtypes = [
    c_void_p, c_uint32, c_char_p, c_uint32, c_char_p,
    c_uint32, c_void_p, POINTER(c_void_p)]
sec.SecKeychainItemDelete.restype = c_uint32
sec.SecKeychainItemDelete.argtypes = [c_void_p]
sec.SecKeychainItemFreeContent.restype = c_uint32
sec.SecKeychainItemFreeContent.argtypes = [c_void_p, c_void_p]
CLASS_GENERIC_PASSWORD = 0x67656E70   # 'genp'
ATTR_SERVICE = 0x73766365             # 'svce'
ATTR_ACCOUNT = 0x61636374             # 'acct'


class SecKeychainAttribute(ctypes.Structure):
    _fields_ = [("tag", c_uint32), ("length", c_uint32), ("data", c_void_p)]


class SecKeychainAttributeList(ctypes.Structure):
    _fields_ = [("count", c_uint32), ("attr", POINTER(SecKeychainAttribute))]


sec.SecKeychainItemCreateFromContent.restype = c_uint32
sec.SecKeychainItemCreateFromContent.argtypes = [
    c_uint32, POINTER(SecKeychainAttributeList), c_uint32, c_void_p,
    c_void_p, c_void_p, POINTER(c_void_p)]
sec.SecKeychainItemCopyAccess.restype = c_uint32
sec.SecKeychainItemCopyAccess.argtypes = [c_void_p, POINTER(c_void_p)]
sec.SecKeychainItemSetAccess.restype = c_uint32
sec.SecKeychainItemSetAccess.argtypes = [c_void_p, c_void_p]
sec.SecAccessCreate.restype = c_uint32
sec.SecAccessCreate.argtypes = [c_void_p, c_void_p, POINTER(c_void_p)]
sec.SecAccessCopyACLList.restype = c_uint32
sec.SecAccessCopyACLList.argtypes = [c_void_p, POINTER(c_void_p)]
sec.SecACLCopyContents.restype = c_uint32
sec.SecACLCopyContents.argtypes = [
    c_void_p, POINTER(c_void_p), POINTER(c_void_p), POINTER(c_uint32)]
sec.SecACLGetAuthorizations.restype = c_uint32
sec.SecACLGetAuthorizations.argtypes = [c_void_p, POINTER(c_uint32), POINTER(c_uint32)]
sec.SecTrustedApplicationCopyData.restype = c_uint32
sec.SecTrustedApplicationCopyData.argtypes = [c_void_p, POINTER(c_void_p)]

ACCOUNT = os.environ.get("USER", "")


def _signed(status):
    """OSStatus comes back unsigned; Apple documents these as negative."""
    return status - (1 << 32) if status >= (1 << 31) else status


def _find(service, want_password):
    """Locate an item. With want_password=False this never decrypts, so it
    never prompts — that is what makes `exists` and `acl` dialog-free."""
    svc = service.encode()
    acct = ACCOUNT.encode()
    item = c_void_p()
    if want_password:
        length = c_uint32()
        data = c_void_p()
        st = sec.SecKeychainFindGenericPassword(
            None, len(svc), svc, len(acct), acct,
            byref(length), byref(data), byref(item))
        return _signed(st), item, length, data
    st = sec.SecKeychainFindGenericPassword(
        None, len(svc), svc, len(acct), acct, None, None, byref(item))
    return _signed(st), item, None, None


def _empty_access():
    """An access object trusting NO application => every read needs a human."""
    desc = cf.CFStringCreateWithCString(None, b"cp-keyring", KCF_UTF8)
    empty = cf.CFArrayCreate(None, None, 0, None)
    access = c_void_p()
    st = _signed(sec.SecAccessCreate(desc, empty, byref(access)))
    if st != 0:
        return None, st
    return access, 0


def _create_locked(service, value):
    """Create a generic-password item whose ACL trusts no application.

    Creating the item and setting its ACL in one call is deliberate: doing it in
    two steps reads to macOS as *modifying* an existing item and prompts for
    authorization (measured: OSStatus -128), which would make enrollment
    interactive for no security gain.
    """
    access, ast = _empty_access()
    if access is None:
        return ast if ast != 0 else -1
    svc = service.encode()
    acct = ACCOUNT.encode()
    svc_buf = ctypes.create_string_buffer(svc)
    acct_buf = ctypes.create_string_buffer(acct)
    attrs = (SecKeychainAttribute * 2)()
    attrs[0] = SecKeychainAttribute(ATTR_SERVICE, len(svc),
                                    ctypes.cast(svc_buf, c_void_p))
    attrs[1] = SecKeychainAttribute(ATTR_ACCOUNT, len(acct),
                                    ctypes.cast(acct_buf, c_void_p))
    attr_list = SecKeychainAttributeList(2, attrs)
    new_item = c_void_p()
    return _signed(sec.SecKeychainItemCreateFromContent(
        CLASS_GENERIC_PASSWORD, byref(attr_list), len(value), value,
        None, access, byref(new_item)))


def cmd_add(service):
    value = sys.stdin.buffer.read()
    if value.endswith(b"\n"):
        value = value[:-1]
    if not value:
        sys.stderr.write("keychain: refusing to store an empty value for %s\n" % service)
        return 1
    st, item, _, _ = _find(service, want_password=False)
    if st == 0:
        # Replace = delete then re-create. If the delete fails we must STOP: a
        # second item under the same service/account would leave lookups
        # resolving to whichever the keychain returns first, which may be the
        # stale, ungated one — while enrollment reported success.
        dst = _signed(sec.SecKeychainItemDelete(item))
        if dst != 0:
            sys.stderr.write("keychain: could not remove the existing %s (OSStatus %d); "
                             "refusing to create a duplicate\n" % (service, dst))
            return 3
    st = _create_locked(service, value)
    if st != 0:
        sys.stderr.write("keychain: create failed for %s (OSStatus %d)\n" % (service, st))
        return 3
    # Verify what we just created is actually gated, and that nothing else is
    # left under the same name. Enrollment that reports success on an ungated
    # item is worse than enrollment that fails.
    if service != REFERENCE_SERVICE:
        reference = _reference_shape()
        if reference is None or _shape(_acl_entries(service)) != reference:
            sys.stderr.write("keychain: %s was created but its access control does "
                             "not match a freshly locked item — removing it rather "
                             "than reporting a gate that may not exist\n" % service)
            vst, vitem, _, _ = _find(service, want_password=False)
            if vst == 0:
                sec.SecKeychainItemDelete(vitem)
            return 3
        dup_st, dup_item, _, _ = _find(service, want_password=False)
        if dup_st != 0:
            sys.stderr.write("keychain: %s does not resolve after creation\n" % service)
            return 3
    return 0


def _request_context(service, reason):
    """Who is asking, from where, and why — everything except the value itself.

    The macOS dialog can only say "Python wants to use ...". It cannot name the
    session, the task, or the reason, and an approval you cannot attribute is one
    you cannot answer correctly: you either wave it through or block real work.
    So the request announces itself before the dialog appears.
    """
    def run(cmd):
        try:
            out = subprocess.run(cmd, stdout=subprocess.PIPE,
                                 stderr=subprocess.DEVNULL, timeout=3)
            return out.stdout.decode("utf-8", "replace").strip()
        except Exception:
            return ""

    ppid = os.getppid()
    session = os.environ.get("CLAUDE_CODE_SESSION_ID", "")

    def clean(text, limit=200):
        """One log line per request, always. The reason is caller-supplied, so a
        newline in it would forge a second record — and a forged audit line is
        worse than none, because it is believed."""
        text = "".join(" " if ord(c) < 32 or ord(c) == 127 else c for c in str(text))
        # "|" is this log's field separator, so leaving it in a caller-supplied
        # string lets that string forge extra fields on the same line — the same
        # defect as the newline, one level down. Neutralise the separator too.
        return text.replace("|", "/")[:limit].strip()
    return {
        "time": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "key": clean(service[len("cp.keyring."):] if service.startswith("cp.keyring.") else service, 80),
        "reason": clean(reason or os.environ.get("KEYRING_REASON", "") or "(no reason given)"),
        "session": clean(session[:8] if session else "not-a-claude-session", 32),
        "branch": clean(run(["git", "rev-parse", "--abbrev-ref", "HEAD"]) or "?"),
        "cwd": clean(os.getcwd()),
        "caller": clean(run(["ps", "-o", "command=", "-p", str(ppid)])[:160] or "?"),
        "pid": os.getpid(),
        "ppid": ppid,
        "tty": clean(run(["tty"]) or os.environ.get("TERM_SESSION_ID", "?")),
    }


def _log_path():
    """The request log lives in the gitignored half, resolved through git's
    common directory so it is the same file from a worktree or the main repo."""
    try:
        common = subprocess.run(
            ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=3
        ).stdout.decode().strip()
        if common:
            return os.path.join(os.path.dirname(common), ".private", "logs",
                                "keyring-requests.log")
    except Exception:
        pass
    return None


def _announce(ctx):
    """Record the request and put it on screen. Never blocks and never fails the
    read: an attribution problem must not become an availability problem."""
    line = ("%(time)s | key=%(key)s | session=%(session)s | branch=%(branch)s | "
            "reason=%(reason)s | caller=%(caller)s | cwd=%(cwd)s | "
            "pid=%(pid)s ppid=%(ppid)s | tty=%(tty)s" % ctx)
    path = _log_path()
    if path:
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "a") as fh:
                fh.write(line + "\n")
        except Exception:
            pass

    # Printed to stderr as well, so it is visible in whichever session asked.
    # Wrapped: with stderr closed this raised before the read was even attempted,
    # turning a missing announcement into a missing credential.
    try:
        sys.stderr.write("keyring: requesting %(key)s — %(reason)s "
                         "[session %(session)s · %(branch)s]\n" % ctx)
        sys.stderr.flush()
    except Exception:
        pass

    body = "%(reason)s\nsession %(session)s · %(branch)s\n%(caller)s" % ctx
    script = ('display notification %s with title %s subtitle %s'
              % (_osa_str(body), _osa_str("Keyring: " + ctx["key"] + " requested"),
                 _osa_str("Approve in the dialog only if you recognise this")))
    try:
        subprocess.Popen(["osascript", "-e", script],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass


def _osa_str(value):
    """Quote a Python string as an AppleScript literal."""
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n") + '"'


def cmd_get(service, reason=None):
    try:
        _announce(_request_context(service, reason))
    except Exception:
        # Never let attribution block the read it is describing.
        pass
    st, item, length, data = _find(service, want_password=True)
    if st == ERR_USER_CANCELED:
        sys.stderr.write("keychain: authorization DENIED for %s\n" % service)
        return 2
    if st == ERR_ITEM_NOT_FOUND:
        sys.stderr.write("keychain: no such item: %s\n" % service)
        return 1
    if st == ERR_AUTH_FAILED:
        sys.stderr.write("keychain: authorization failed for %s\n" % service)
        return 2
    if st != 0:
        sys.stderr.write("keychain: read failed for %s (OSStatus %d)\n" % (service, st))
        return 3
    out = ctypes.string_at(data, length.value)
    sys.stdout.buffer.write(out)
    sys.stdout.buffer.flush()
    sec.SecKeychainItemFreeContent(None, data)
    return 0


def cmd_exists(service):
    st, _, _, _ = _find(service, want_password=False)
    return 0 if st == 0 else 1


REFERENCE_SERVICE = "cp.keyring.__shape_reference__"


def _acl_entries(service):
    """Per-ACL description of an item: which operations the ACL authorizes, and
    which applications it trusts for them.

    Two things this must get right, both of which produced wrong verdicts:

    - An **empty** application list means no application is trusted, so every
      read needs a human. A **NULL** list means *every* application is trusted —
      the gate is absent. They are opposites.
    - The authorization tags matter, not just the list sizes. Without them, an
      ACL arrangement with the same list shapes but decryption attached to a
      wide-open ACL compares equal to a properly locked item.

    Any failure to extract a trusted application is recorded as an error rather
    than skipped: dropping it would make a populated list look empty, which is
    the exact false "gate-intact" this function exists to prevent.
    """
    st, item, _, _ = _find(service, want_password=False)
    if st != 0:
        return None
    access = c_void_p()
    if _signed(sec.SecKeychainItemCopyAccess(item, byref(access))) != 0:
        return None
    acls = c_void_p()
    if _signed(sec.SecAccessCopyACLList(access, byref(acls))) != 0:
        return None
    entries = []
    for i in range(cf.CFArrayGetCount(acls)):
        acl = cf.CFArrayGetValueAtIndex(acls, i)

        count = c_uint32(64)
        buf = (c_uint32 * 64)()
        tags = None
        if _signed(sec.SecACLGetAuthorizations(
                acl, ctypes.cast(buf, POINTER(c_uint32)), byref(count))) == 0:
            tags = tuple(sorted(buf[j] for j in range(min(count.value, 64))))

        applist = c_void_p()
        desc = c_void_p()
        selector = c_uint32()
        if _signed(sec.SecACLCopyContents(acl, byref(applist), byref(desc),
                                          byref(selector))) != 0:
            entries.append({"tags": tags, "apps": None, "error": "contents"})
            continue
        if not applist:
            entries.append({"tags": tags, "apps": None, "error": None})
            continue
        names = []
        failed = False
        for j in range(cf.CFArrayGetCount(applist)):
            app = cf.CFArrayGetValueAtIndex(applist, j)
            blob = c_void_p()
            if _signed(sec.SecTrustedApplicationCopyData(app, byref(blob))) == 0 and blob:
                raw = ctypes.string_at(cf.CFDataGetBytePtr(blob),
                                       cf.CFDataGetLength(blob))
                names.append(raw.rstrip(b"\x00").decode("utf-8", "replace"))
            else:
                # Do NOT drop it. A trusted app we cannot name is still a
                # trusted app, and silently omitting it shrinks the list toward
                # the "no applications trusted" shape.
                failed = True
                names.append("<unreadable trusted application>")
        entries.append({"tags": tags, "apps": names,
                        "error": "app-extract" if failed else None})
    return entries


def _shape(entries):
    """Canonical, ORDER-INDEPENDENT fingerprint of an item's ACL list.

    SecAccessCopyACLList does not return ACLs in a stable order — measured on
    one unchanged item: (None, 0, None, None, 0) four times and
    (0, None, None, None, 0) on the fifth read. Comparing positionally
    therefore reported a perfectly locked key as DEFEATED at random, which is
    the failure that makes a security check get ignored. Compare the multiset:
    how many ACLs are wide open, plus the sorted sizes of the rest.

      locked  (-T "")  -> (3, (0, 0))
      default          -> (3, (0, 1))     one trusted application
      -A  all-apps     -> (4, (0,))       one fewer restricted ACL
    """
    if entries is None:
        return None
    parts = []
    for e in entries:
        if e["error"]:
            # An ACL we could not fully read can never be declared intact.
            parts.append(("error", e["error"], e["tags"]))
        else:
            parts.append((e["tags"],
                          "ALL-APPLICATIONS" if e["apps"] is None else len(e["apps"])))
    return tuple(sorted(parts, key=repr))


def _reference_shape():
    """The ACL shape produced by our own enrollment path, measured live.

    An item carries several ACLs and the one that gates reading is NOT at a
    fixed index (measured: a default item's trusted app lands at index 0, a
    `-T ""` item's empty list at index 1). Rather than guess which ACL governs
    decryption, create a throwaway item exactly the way enrollment does and
    compare against its shape.

    Limit of that claim, unverified: the reference reflects what macOS does
    *now*, but an already-enrolled item keeps the ACL shape it was given at ITS
    enrollment time — persisted keychain structures are not rewritten by an OS
    update. So if Apple ever changes the layout a fresh empty-list item gets,
    every key enrolled before that change would compare unequal to a
    freshly-created reference and report DEFEATED at once. That direction is a
    false positive, not a fail-open hole, and simultaneous DEFEATED across ALL
    keys right after an OS update is the signature — re-enroll one key and
    re-run verify to tell drift from compromise.
    """
    st, item, _, _ = _find(REFERENCE_SERVICE, want_password=False)
    if st == 0:
        sec.SecKeychainItemDelete(item)
    if _create_locked(REFERENCE_SERVICE, b"reference") != 0:
        return None
    shape = _shape(_acl_entries(REFERENCE_SERVICE))
    st, item, _, _ = _find(REFERENCE_SERVICE, want_password=False)
    if st == 0:
        sec.SecKeychainItemDelete(item)
    return shape


def trusted_apps(service):
    """Flat list of every application trusted to read this item without a
    prompt. Kept for diagnostics; `cmd_acl` decides pass/fail on shape."""
    entries = _acl_entries(service)
    if entries is None:
        return None
    return [n for e in entries if e["apps"] for n in e["apps"]]


def cmd_acl(services):
    reference = _reference_shape()
    if reference is None:
        sys.stderr.write("keychain: could not build a reference item — cannot "
                         "judge whether the gate is intact; refusing to guess\n")
        return 3
    worst = 0
    for service in services:
        entries = _acl_entries(service)
        shape = _shape(entries)
        if shape is None:
            print("%-44s MISSING" % service)
            worst = max(worst, 1)
        elif shape == reference:
            print("%-44s OK gate-intact" % service)
        else:
            names = [n for e in entries if e["apps"] for n in e["apps"]]
            wide = sum(1 for e in entries if e["apps"] is None and not e["error"])
            broken = [e["error"] for e in entries if e["error"]]
            if broken:
                detail = "UNREADABLE ACL (%s) — cannot certify this gate" % ",".join(broken)
            elif names:
                detail = "trusted_apps=%s" % names
            else:
                detail = ("access-control layout differs from a freshly locked item "
                          "(wide-open ACLs=%d)" % wide)
            print("%-44s DEFEATED %s" % (service, detail))
            worst = 2
    return worst


def cmd_delete(service):
    st, item, _, _ = _find(service, want_password=False)
    if st != 0:
        sys.stderr.write("keychain: no such item: %s\n" % service)
        return 1
    return 0 if _signed(sec.SecKeychainItemDelete(item)) == 0 else 3


def main(argv):
    if len(argv) < 2:
        sys.stderr.write(__doc__)
        return 1
    verb, args = argv[1], argv[2:]
    if verb == "add" and len(args) == 1:
        return cmd_add(args[0])
    if verb == "get" and len(args) in (1, 2):
        return cmd_get(args[0], args[1] if len(args) == 2 else None)
    if verb == "exists" and len(args) == 1:
        return cmd_exists(args[0])
    if verb == "acl" and args:
        return cmd_acl(args)
    if verb == "delete" and len(args) == 1:
        return cmd_delete(args[0])
    sys.stderr.write(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
