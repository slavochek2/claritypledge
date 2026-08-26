---
name: pdf-to-research
description: Convert a PDF to markdown and save it to .private/research/papers/
when_to_use: When you have a research paper PDF and want to archive it as markdown
version: 1.0.0
---

# PDF to Research

Convert a PDF file to plain-text markdown and move it into `.private/research/papers/`.

## Usage

```
/slava:util:pdf-to-research ~/Downloads/some-paper.pdf
```

## Steps

1. Resolve the PDF path from $ARGUMENTS (expand `~` if needed).
2. Derive the output filename: same basename, `.pdf` → `.md`.
3. Run:
   ```bash
   pdftotext "<pdf-path>" "<cp-root>/.private/research/papers/<basename>.md"
   ```
4. Confirm the file was created (`ls -lh`).
5. Report: "Saved to `.private/research/papers/<basename>.md`"

## Notes

- `pdftotext` is available locally (see `~/.claude/tools.md`).
- Output is plain text with whitespace layout preserved — not styled markdown.
- The target directory is `.private/research/papers/` relative to the claritypledge repo root (`~/Projects/public/claritypledge`).
- Create the directory if it doesn't exist: `mkdir -p`.
- Do NOT delete the source PDF unless the user asks.
