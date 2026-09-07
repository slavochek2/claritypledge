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
import os
import sys
from ctypes import POINTER, byref, c_char_p, c_long, c_uint32, c_void_p

sec = ctypes.CDLL(ctypes.util.find_library("Security"))
cf = ctypes.CDLL(ctypes.util.find_library("CoreFoundation"))

KCF_UTF8 = 0x08000100
ERR_USER_CANCELED = -128        # errSecUserCanceled — the human clicked Deny
ERR_ITEM_NOT_FOUND = -25300
ERR_DUPLICATE_ITEM = -25299
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
        sec.SecKeychainItemDelete(item)      # replace: delete then re-create
    st = _create_locked(service, value)
    if st != 0:
        sys.stderr.write("keychain: create failed for %s (OSStatus %d)\n" % (service, st))
        return 3
    return 0


def cmd_get(service):
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
    """Per-ACL description of an item: for each ACL, either None (the
    application list is NULL, which Security.framework defines as *every*
    application being trusted) or the list of trusted application paths.

    The distinction matters and is the opposite of what it looks like: an EMPTY
    list means no application is trusted, so every read needs a human; a NULL
    list means the gate is wide open. An earlier version of this function
    skipped NULL lists and consequently reported an item created with
    `security add-generic-password -A` — which reads with no prompt at all — as
    "gate-intact". That is the exact false clean bill of health this tool exists
    to prevent.
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
        applist = c_void_p()
        desc = c_void_p()
        selector = c_uint32()
        if _signed(sec.SecACLCopyContents(acl, byref(applist), byref(desc),
                                          byref(selector))) != 0:
            entries.append(None)
            continue
        if not applist:
            entries.append(None)
            continue
        names = []
        for j in range(cf.CFArrayGetCount(applist)):
            app = cf.CFArrayGetValueAtIndex(applist, j)
            blob = c_void_p()
            if _signed(sec.SecTrustedApplicationCopyData(app, byref(blob))) == 0 and blob:
                raw = ctypes.string_at(cf.CFDataGetBytePtr(blob),
                                       cf.CFDataGetLength(blob))
                names.append(raw.rstrip(b"\x00").decode("utf-8", "replace"))
        entries.append(names)
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
    wide = sum(1 for e in entries if e is None)
    sizes = tuple(sorted(len(e) for e in entries if e is not None))
    return (wide, sizes)


def _reference_shape():
    """The ACL shape produced by our own enrollment path, measured live.

    An item carries several ACLs and the one that gates reading is NOT at a
    fixed index (measured: a default item's trusted app lands at index 0, a
    `-T ""` item's empty list at index 1). Rather than guess which ACL governs
    decryption, create a throwaway item exactly the way enrollment does and
    compare against its shape. This self-calibrates: if a macOS update changes
    the layout, the reference moves with it instead of turning every enrolled
    key into a false alarm.
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
    return [n for e in entries if e for n in e]


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
            names = [n for e in entries if e for n in e]
            wide = sum(1 for e in entries if e is None)
            detail = ("trusted_apps=%s" % names) if names else \
                     ("wide-open ACLs=%d (a correctly locked item has %d)"
                      % (wide, reference[0]))
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
    if verb == "get" and len(args) == 1:
        return cmd_get(args[0])
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
