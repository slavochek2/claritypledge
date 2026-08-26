---
name: ship-prod
description: "Execute staging->CI->main push sequence for a shipped P-number. Calls git-ops.sh ship-to-prod pN. Run AFTER /ship (which cherry-picks to local main). Prompts TTY y/N before final push -- never auto-pushes."
when_to_use: "After /ship has merged pN to local main and you want to push to prod. Requires: HEAD==main, pN commits on local main, /privacy stamp covering all watched-path commits."
version: 1.0.0
---

# /ship-prod pN

Executes the documented P919 staging-hop sequence autonomously:
1. Privacy gate check (detect-only -- stops if /privacy stamp doesn't cover range)
2. Acquire main.lock
3. Push to `staging/pN`
4. Poll CI until `privacy-scan / audit-privacy` passes on the exact SHAs
5. Prompt TTY `y/N` (D1: always fires, even with `~/.push-enabled`)
6. Push to main
7. Delete `staging/pN`

## Usage

```bash
/ship-prod p950
```

## Preconditions

- Must be on `main` branch
- `git-ops.sh ship pN` already ran (pN commits on local main)
- `/maintain:privacy` ran and stamp covers all watched-path commits in the push range
- `gh` CLI installed and authenticated (`gh auth status`)

## Hard invariants (D1 + D2)

**D1:** The final `git push origin main` always prompts a TTY `y/N`, even when `~/.push-enabled` is set. ship-to-prod never consumes the flag's waiver. Answering `N` cancels the push (staging branch left for inspection).

**D2:** The executor detects if the privacy stamp doesn't cover the push range and stops. It never writes the stamp itself. Only the human-invoked `/maintain:privacy` writes it.

## Implementation

```bash
./scripts/git-ops.sh ship-to-prod pN
```

## Related

- `/ship pN` -- cherry-picks pN to local main (run this first)
- `/maintain:privacy` -- writes the privacy stamp (run before /ship-prod if docs changed)
- `docs/technical/git-workflow.md` -- full P919 staging-hop protocol
