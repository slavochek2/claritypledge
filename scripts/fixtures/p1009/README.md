# Fixtures for `scripts/test-p1009-single-value-canary.sh`

Frozen, byte-identical copies of two real docs, read by the suite's sections 3 and 4:

| File | Source path | Commit (main, 2026-10-13) | Blob |
|------|-------------|---------------------------|------|
| `lean-canvas.md.txt` | `docs/lean-canvas.md` | `8184815bdae7701a073553badc11e4869d0cae5f` | `ab4e78f40a8c` |
| `CHARTER.md.txt` | `docs/CHARTER.md` | `8184815bdae7701a073553badc11e4869d0cae5f` | `a785ed3a941c` |

Committed as files rather than read with `git show <sha>:<path>`, because a shallow or
history-free clone has no such object — the suite then failed, and pre-commit §13f turned
that into a blocked commit. The `.txt` suffix keeps the copies out of the markdown gates
that scan staged `*.md` (this is test data, not a doc).

Refresh only together with the section-4 anchor strings in the suite, from a commit on
main, and update this table: `git show <sha>:docs/lean-canvas.md > lean-canvas.md.txt`.
