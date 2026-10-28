#!/usr/bin/env python3
"""Do the self-hosted TEST auth e-mail templates still match prod's? (P1584)

    email_template_drift.py PROD_AUTH_CONFIG_JSON VM_TEMPLATE_DIR

PROD_AUTH_CONFIG_JSON is prod's Management API /config/auth response. VM_TEMPLATE_DIR holds the
templates the VM serves (magic_link.html, confirmation.html). The VM copies are prod's with one
deliberate change (decisions.md 2026-10-28, P1557): every link to prod's /auth/verify points at the
requesting localhost origin instead. That rewrite is applied to prod's text here, then compared
byte for byte, so any other difference, on either side, is drift.

Prints "templates: ok|warn|unknown: <detail>". Exit 0 ok, 1 drift, 2 could not compare.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

PROD_VERIFY = "https://claritypledge.com/auth/verify"
LOCAL_VERIFY = (
    '{{ if ge (len .RedirectTo) 21 }}{{ if eq (slice .RedirectTo 0 17) "http://localhost:" }}'
    "{{ slice .RedirectTo 0 21 }}{{ else }}http://localhost:5001{{ end }}{{ else }}"
    "http://localhost:5001{{ end }}/auth/verify"
)
TEMPLATES = {
    "magic_link.html": "mailer_templates_magic_link_content",
    "confirmation.html": "mailer_templates_confirmation_content",
}


def compare(prod: dict, vm_dir: Path) -> tuple[int, str]:
    drifted, missing = [], []
    for name, key in TEMPLATES.items():
        prod_text = prod.get(key)
        vm_file = vm_dir / name
        if not isinstance(prod_text, str) or not prod_text or not vm_file.is_file():
            missing.append(name)
            continue
        if PROD_VERIFY not in prod_text:
            # Without the anchor the rewrite is a no-op and a match would mean nothing.
            drifted.append(f"{name} (prod no longer links to /auth/verify)")
        elif prod_text.replace(PROD_VERIFY, LOCAL_VERIFY) != vm_file.read_text(encoding="utf-8"):
            drifted.append(name)
    if missing:
        return 2, "unknown: could not read " + ", ".join(missing)
    if drifted:
        return 1, "warn: differs from prod: " + ", ".join(drifted) + " (re-sync, see the recipe)"
    return 0, f"ok: {len(TEMPLATES)} templates match prod"


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: email_template_drift.py PROD_AUTH_CONFIG_JSON VM_TEMPLATE_DIR", file=sys.stderr)
        return 2
    try:
        prod = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        print(f"templates: unknown: prod config unreadable ({type(e).__name__})")
        return 2
    if not isinstance(prod, dict):
        print("templates: unknown: prod config is not an object")
        return 2
    rc, line = compare(prod, Path(argv[2]))
    print("templates: " + line)
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv))
