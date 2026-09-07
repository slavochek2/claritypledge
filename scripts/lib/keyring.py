"""keyring.py — Python access to the P1239 locked credential half.

One key per keychain item, one authorization dialog per key. Asking for one
credential prompts for that one and cannot read any other: the grant is per-key
and per-access, never a bundle.

Fails closed. If the human declines, or the key was never enrolled, this raises —
it never falls back to the plaintext copy and never returns an empty value
(P1239 Invariants).

    from keyring import require
    token = require("SUPABASE_ACCESS_TOKEN")

Values travel over a pipe, never as a command argument, so they do not appear in
`ps`. Nothing here logs or prints a value.
"""
import os
import subprocess

_HERE = os.path.dirname(os.path.abspath(__file__))
_KEYCHAIN = os.path.join(_HERE, "keychain.py")
_PREFIX = "cp.keyring."


class KeyringError(RuntimeError):
    """A critical credential could not be read. Never swallow this."""


def require(key):
    """Return one critical credential, or raise. Triggers the OS dialog."""
    try:
        proc = subprocess.run(
            ["python3", _KEYCHAIN, "get", _PREFIX + key],
            stdout=subprocess.PIPE,   # the value comes back on a pipe, never argv
            stderr=None,              # let the operator see why a read failed
            check=False,
        )
    except OSError as exc:
        raise KeyringError("keyring: could not run keychain.py for %s: %s" % (key, exc))
    if proc.returncode != 0:
        raise KeyringError(
            "FATAL: could not read the critical credential %s.\n"
            "  You declined the authorization dialog, or %s is not enrolled.\n"
            "  This will NOT fall back to a plaintext copy.\n"
            "  Retry and click \"Allow\" (never \"Always Allow\" — that disables the gate).\n"
            "  Enroll: ./scripts/keyring.sh enroll %s\n"
            "  Check:  ./scripts/keyring.sh verify" % (key, key, key))
    value = proc.stdout.decode("utf-8")
    if not value:
        raise KeyringError(
            "FATAL: %s decrypted to an empty value — refusing to continue." % key)
    return value


def is_locked(key):
    """True if this key is enrolled in the locked half. Never prompts."""
    return subprocess.run(
        ["python3", _KEYCHAIN, "exists", _PREFIX + key],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    ).returncode == 0
