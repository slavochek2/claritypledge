# Manual acceptance tests (`claude --chrome`)

Most files in `features/uat/` are per-spec UAT docs written by `/generate-uat` (`p{N}.md`). The two
listed below are older hand-written checklists for OAuth and authenticated flows, which need a real
browser session rather than a scripted run. They moved here from `tests/acceptance/` in P1221;
`docs/technical/file-locations.md` names `features/uat/` as the single home for UAT documentation.

## How to Run

1. Start the dev server: `npm run dev` (or use appropriate port for worktree)
2. Start Claude with Chrome integration: `claude --chrome`
3. Ask Claude to run the specific acceptance test file

## Test Files

| File | Purpose | Prerequisites |
|------|---------|---------------|
| `p50-p63-main.md` | P50 (profile/pledge separation) + P63 (Google OAuth) | Main branch, port 5001 |
| `p64-signup.md` | P64 (standalone signup) | Worktree 2, port 5200 |

## Test Accounts

For Google OAuth tests, use a real Google account. Tests are designed to be non-destructive.

For magic link tests, use a real email you can access.
