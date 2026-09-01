#!/usr/bin/env python3
"""P1207 / D-1: every deployed edge function must gate its caller.

WHY THIS EXISTS
  scripts/deploy-functions.sh auto-discovers every directory under
  supabase/functions/ and deploys it. A function nothing calls is still
  deployed and still publicly reachable. `verify_jwt` does NOT close that:
  the public anon key is a valid JWT and ships in the browser bundle, so the
  gateway check is passed by anyone. The only real gate is the function's own.

  Found by P1207: send-letter-response-signin was dead code from P684 whose
  logic had moved into request-letter-response-signin. It had no caller check
  of any kind and had been redeployed on every deploy since, acting as an open
  relay that sent branded mail from the project's domain to any address with a
  caller-chosen link.

WHAT COUNTS AS A GATE
  Any one of: a user-identity check (auth.getUser), a shared-secret header
  (INTERNAL_FN_SECRET, WEBHOOK_SECRET, GCS_UPLOAD_SECRET), or validation of a
  capability token the caller must already possess.

BOUND ON THIS CHECK (state it, do not overclaim)
  This is a FILE-BASED check. It proves a gate is present in source; it does
  not prove the gate is correct, nor that the deployed function matches the
  file. P1207 measured a live grant set that disagreed with the migrations
  that were recorded as applied — the same class of divergence applies here.
"""
import pathlib
import re
import sys

FUNCTIONS_DIR = pathlib.Path("supabase/functions")

GATE_PATTERNS = {
    "user identity (auth.getUser)":  r"auth\.getUser\s*\(",
    # Any shared-secret env var actually COMPARED against a request header.
    # Deliberately generic: the first draft of this check listed secret names
    # literally and false-positived on dispatch-event-emails, which gates on
    # CRON_SECRET. A gate that blocks correct work is worse than no gate
    # (epistemic.md 7c, P1173).
    "shared secret compared":        r"[A-Z][A-Z0-9_]*SECRET[A-Z0-9_]*\s*(\?\?[^\n]*)?[\s\S]{0,400}?(!==|===|==|!=)",
    "capability token validation":   r"(!==\s*token\b|get_letter_by_token|token_hash|invitation_token)",
}

# Functions deliberately reachable without a caller identity, each with the
# reason it is safe. Adding an entry here is a security decision — it must name
# what stands in for the identity check.
EXEMPT = {
    # (none today — create-and-sign and create-and-open-letter validate a
    #  capability token, so they are gated by the rules above, not exempted)
}


def main() -> int:
    if not FUNCTIONS_DIR.is_dir():
        print(f"error: {FUNCTIONS_DIR} not found (run from the repo root)", file=sys.stderr)
        return 2

    ungated, checked = [], 0
    for d in sorted(FUNCTIONS_DIR.iterdir()):
        # Skip ONLY the shared-helper directory, by exact name. An earlier
        # draft skipped every directory starting with "_", which meant a
        # function named "_anything" was invisible to this check while
        # deploy-functions.sh (which iterates every directory) still deployed
        # it. Caught by exercising the wired hook, not by reading the code.
        if not d.is_dir() or d.name == "_shared":
            continue
        entry = d / "index.ts"
        if not entry.exists():
            continue
        checked += 1
        src = entry.read_text(encoding="utf-8", errors="replace")
        found = [label for label, pat in GATE_PATTERNS.items()
                 if re.search(pat, src, re.IGNORECASE)]
        if not found and d.name not in EXEMPT:
            ungated.append(d.name)

    if ungated:
        print("FAIL: edge function(s) with no caller gate — publicly reachable by "
              "anyone holding the public anon key:")
        for name in ungated:
            print(f"  - {name}  ({FUNCTIONS_DIR}/{name}/index.ts)")
        print("\nAdd a caller gate (see send-agreement-emails/index.ts for the "
              "INTERNAL_FN_SECRET pattern), or delete the function if it is dead "
              "code — note that deleting the directory does NOT undeploy it; run "
              "`supabase functions delete <name>` against each project too.")
        return 1

    print(f"ok: all {checked} edge functions gate their caller "
          f"(source-level check; does not verify the deployed artifact)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
