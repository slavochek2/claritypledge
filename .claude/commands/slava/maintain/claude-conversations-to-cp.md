---
name: claude-conversations-to-cp
description: Analyze recent Claude conversations to surface strategic signals AND content candidates. Updates strategy docs and files article ideas to content kanban. Never writes without explicit confirmation.
when_to_use: After a sprint, a week of sessions, or any period where you want to surface unresolved tensions, update strategy docs, and identify article-worthy conversations.
version: 3.2.0
---

# /claude-conversations-to-cp

Analyzes Claude conversations (or alternative sources) and proposes updates to cp strategy docs.

**Default input:** Exported Claude.ai conversations at `~/Projects/private/claude-conversations/` (markdown files, synced via claude-sync).
**Alternative input:** Pass `--source` with a Google Drive folder ID or local path.

## Last-Run Tracking

**Marker file:** `.private/claude-conversations-to-cp-last-run.txt`

After each successful run (step 5 completes — edits applied OR user declines), write:
```
last_run: 2026-03-17T14:30:00Z
files_processed: 12
source: claude-conversations
window: 7d
```

**Smart default:** If no explicit time arg is passed AND the marker file exists, use `since last run` as the window instead of `7d`. Report: `"Last run: 2026-03-10 (7 days ago). Analyzing conversations since then. Pass '14d' to override."`

If the marker is missing or corrupted, fall back to `7d` silently.

## Usage

```
/claude-conversations-to-cp           # since last run (or 7d if never run)
/claude-conversations-to-cp 14d       # last 14 days (ignores marker)
/claude-conversations-to-cp 30d       # last 30 days (ignores marker)
/claude-conversations-to-cp --source gdrive:FOLDER_ID
/claude-conversations-to-cp --source /absolute/path/to/files
```

## Target Docs

| Signal type | Target |
|-------------|--------|
| Problem framing, solution, channels, market | `docs/lean-canvas.md` |
| Causal logic, theory of impact | `docs/theory-of-change.md` |
| Assumptions being tested/invalidated | `docs/hypotheses.md` |
| What's being tested, hypothesis progress | `docs/hypotheses.md` |
| Workflow friction, recurring manual steps | `docs/process-learnings.md` |
| Features mentioned repeatedly but unspecced, priority shifts | `features/` (note only, no auto-edit) |
| Article-worthy conversations with narrative arc potential | `content/articles/` (auto-filed via `/quick-blog` on approval) |

## Inline Markers: `[/cp ...]`

The founder uses `[/cp ...]` inline markers in conversations to flag CP-relevant signals — even in otherwise personal conversations. These are first-class signals that must be extracted from ALL files (not just CP-relevant ones).

**Format:** `[/cp some note or action item]` — appears inline in user messages.
**Examples:**
- `[/cp worth an article?]`
- `[/cp we need to update story #st8 to show this in picture]`
- `[/cp Clarity as a luxury good vs. a right — worth exploring further]`

**Processing:** Grep ALL conversation files for `[/cp` before the relevance filter (step 0). Extract the marker text and surrounding context (2-3 sentences before/after). These become `[MARKER]` signals in step 1, classified alongside other signals in step 2.

## Conversation File Format

### Default: Exported Claude.ai markdown (~/Projects/private/claude-conversations/)

Files are structured markdown with this format:

**Structure of each file:**
```
# {Conversation title}

**Created:** {timestamp}
**Updated:** {timestamp}
**ID:** `{uuid}`
**Summary:** {one-line summary, when Claude.ai generated one}

---

### 👤 Human

{user message text}

> 📎 Attached: `{filename}`

---

### 🤖 Claude

{Claude response text}

<!-- thinking: N block(s) omitted -->

**📄 Artifact (create): {title}**

```markdown
{full artifact content}
```

**📄 Created file: `{path}`**

```markdown
{full file content}
```

> ✏️  Edited `{path}` — {what changed}
> 🔧 {tool}({brief args})

---
```

**Since importer v2 (2026-09) these are present and were NOT in older files:**
- `**Summary:**` — a fast relevance filter; read it before the body.
- `**📄 Artifact …**` / `**📄 Created file: …**` fenced blocks — **the deliverables.**
  Documents Claude wrote (201 artifacts + 115 files across the archive) live here, not
  in the prose. A conclusion that was handed over as a document is only findable here.
- `> ✏️` / `> 🔧` / `> 📎` one-liners — the tool trail and attachments. Low signal
  individually; useful for reconstructing what actually happened in a session.
- `<!-- thinking: N block(s) omitted -->` — Claude's raw reasoning is deliberately not
  archived. Do not treat the marker as content, and never infer what it contained.

Files written before the v2 importer carry prose only. Re-run
`~/projects/private/claude-conversations/import-conversations.py --rebuild` against a
fresh export to backfill them in place.

**Sibling directories (also written by the importer, not monthly conversation folders):**
`memories/` (Claude's memory files + conversations memory), `projects/` (project docs and
custom instructions), `design-chats/`. These are **current state, overwritten every
import** — not dated history — so the time-window filter does not apply to them. Read
them for standing context, never as evidence that something happened in the window.

Read BOTH `👤 Human` and `🤖 Claude` sections — insights come from both sides. Extract the text under each heading. The date filter uses the `Created:` or `Updated:` frontmatter field.

### Alternative: Claude Code CLI JSONL (~/.claude/projects/)

Only used when `--source` explicitly points to a `.jsonl` path.

JSONL format: each line is a JSON object. Conversation messages have `type: "user"` or `type: "assistant"`. Extract text from `message.content` (nested). Skip `type: "system"`, `"file-history-snapshot"`, `"tool_use"`. Skip files under `subagents/` subdirectories.

## Workflow

```xml
<workflow>

  <step n="0" goal="Parse args, guard inputs, collect files">
    <parse_args>
      - First positional arg: time window (e.g. "7d", "14d") — default: "since last run" if marker exists, else "7d"
      - "--source VALUE": alternative input source
        - gdrive:ID → use Google Workspace MCP to list + read files in folder
        - /path → read all files in that local directory (plain text, markdown, or jsonl)
        - (none) → read Claude conversation logs (default)
    </parse_args>

    <read_marker>
      - Read `.private/claude-conversations-to-cp-last-run.txt`
      - If exists and parseable: extract `last_run` timestamp
      - If no explicit time arg was passed: use `last_run` as the start of the window. Report: "Last run: [date] ([N] days ago). Analyzing conversations since then. Pass '14d' to override."
      - If marker missing or corrupted: fall back to 7d silently
      - If explicit time arg was passed (e.g. "14d"): ignore marker, use the explicit window
    </read_marker>

    <guard name="pp-path-block">
      <if condition="--source path contains '/Projects/private' AND path is NOT ~/Projects/private/claude-conversations">
        <action>Stop. Report: "Source path appears to be a private (pp) directory other than claude-conversations. This skill is cp-only. Use /claude-conversations-to-pp for personal/private sources."</action>
      </if>
    </guard>

    <guard name="gdrive-mcp-check">
      <if source="gdrive:ID">
        <action>Attempt to use Google Workspace MCP. If unavailable: stop and report "Google Workspace MCP required for gdrive: source. Run from a session where it's configured."</action>
      </if>
    </guard>

    <if source="claude conversations (default)">
      <action>Glob for .md files in ~/Projects/private/claude-conversations/ recursively — these are exported Claude.ai conversations in markdown format</action>
      <action>Filter by file mtime OR by the "Created:" / "Updated:" date in the frontmatter to match the time window</action>
      <action>If marker exists with last_run timestamp and no explicit time arg was passed: further exclude files whose mtime AND Updated date are both older than last_run — these were already processed in a previous run</action>
      <action>Extract [/cp] markers from ALL files BEFORE relevance filtering: grep all files for `[/cp` regex. For each hit, extract the marker text and 2-3 surrounding sentences for context. Store as [MARKER] signals with source file and line. Report: "Found N [/cp] markers across M files." These are processed as first-class signals even if the containing file is classified as personal.</action>
      <action>Early relevance filter: read the title (first H1) and first user message of each file. Classify as CP-relevant or personal. Skip files that are clearly personal (relationships, personal finance, philosophy unrelated to CP). Report: "Found N files, M relevant to ClarityPledge, skipping K personal." Only fully read the relevant files.</action>
      <action>Count relevant files</action>
    </if>

    <if source="gdrive:ID">
      <action>Use Google Workspace MCP to list all files in the folder and read their content</action>
      <action>Count documents</action>
    </if>

    <if source="/path">
      <action>Glob all files in the directory recursively</action>
      <action>Count files</action>
    </if>

    <guard name="empty-result">
      <if condition="file count == 0">
        <action>Stop. Report: "No files found for the last [N] days from [source]. Check the time window or source path. Nothing to analyze."</action>
      </if>
    </guard>
  </step>

  <step n="0b" goal="Pre-read target docs AND current priorities for contradiction detection">
    <action>Read the FULL content of each target doc (not section-sampled): docs/lean-canvas.md, docs/hypotheses.md, docs/theory-of-change.md, docs/process-learnings.md. A strategy-doc change proposed in step 3 must cite the section it modifies as read in full — never propose an edit to a doc from a partial read.</action>
    <action>Read docs/goals.md — the current build sequence and priorities. Use this to contextualize conversation signals: distinguish "blocked by unbuilt prerequisite" from "avoidance" and "UX iteration on existing spec" from "strategy shift"</action>
    <action>Read content/story-arcs.md — active narrative arc patterns. Used for [CONTENT] signal classification: which arc does this conversation extend?</action>
    <action>Read titles AND frontmatter from content/articles/a*.md — extract `status:` and `draft_file:` for each spec. Used for (a) dedup: skip conversations already covered; (b) routing decisions in step 4 (status >= draft-ready means enrichment goes to draft_file, not a-spec).</action>
    <action>Hold this content in context for contradiction detection in step 2 and diff generation in step 4</action>
  </step>

  <step n="1" goal="Ingest conversations — MapReduce if large">
    <if condition="file count <= 15">
      <action>Read each file directly using the JSONL format described above</action>
      <action>Proceed to step 2 with unified message text</action>
    </if>

    <if condition="file count > 15">
      <action>Estimate average file size. If average > 100KB: use chunks of 3-5 files. If < 50KB average: use chunks of 10-12 files. Report chunk count before spawning.</action>
      <action>Spawn one Explore agent (`model: "sonnet"`) per chunk with this prompt:

        "You are analyzing Claude conversation logs to extract strategic signals for a product called ClarityPledge (calibrated communication practice for co-founders).

        Read the following files: [file list].

        File format: exported Claude.ai markdown. Each file has a title, Created/Updated dates, then conversation turns marked with '### 👤 Human' and '### 🤖 Claude'. Read both sides — insights come from both. (If a file is .jsonl, each line is a JSON object with type 'user' or 'assistant'; extract text from message.content.)

        Extract signals in ONLY these categories — return structured markdown, nothing else:

        ## Signals
        - [STRATEGY] {observation} — {evidence: quote or paraphrase, include role}
        - [HYPOTHESIS] {observation} — {evidence}
        - [MILESTONE] {observation} — {evidence}
        - [PROCESS] {observation} — {evidence}
        - [SPEC-PRIORITY] {observation} — {evidence}
        - [TENSION] {unresolved question or contradiction} — {evidence}
        - [CONTENT] {conversation title} — {ARC-N (arc name) or 'new arc: proposed name'}, {why article-worthy: 1 line}
        - [CONTENT-ENRICH] {conversation title} → enriches {existing article aNN: title} — {what it adds: 1 line}
        - [MARKER] {exact [/cp ...] text} — {source file}, {surrounding context: 1-2 sentences}

        [MARKER] signals: grep for `[/cp` in all files (including personal ones). Extract the marker text verbatim and surrounding context. These are the founder's own bookmarks — treat as high-priority.

        For [CONTENT] signals: read content/story-arcs.md arc patterns (provided below).
        Match conversations to arc patterns by narrative shape, not topic.
        Skip conversations with fewer than 6 exchange turns (too thin).
        For conversations that extend an EXISTING article idea or draft (provided below):
          use [CONTENT-ENRICH] instead of [CONTENT] — propose additions to the existing spec, not a new one.
        Before naming an article as the enrichment target, quote its relevant framing/taxonomy from the article BODY (not the title alone); if the body's framing conflicts with the conversation's, do NOT route there.
        Only use [CONTENT] for genuinely NEW article candidates not covered by existing specs.

        Active arc patterns: [paste arc summaries from story-arcs.md]
        Existing article titles + status + draft_file (if any): [paste aN: title (status) → draft_file:path from content/articles/a*.md frontmatter]

        Read BOTH user and assistant messages — insights come from both.
        Surface recurring themes, contradictions, and unresolved tensions.
        Be concise. Return only the signals block — no preamble, no summary."
      </action>
      <action>Wait for all agents to complete</action>
      <action>Collect all signal blocks</action>
      <action>Deduplicate: merge signals that refer to the same observation, keep highest-evidence version</action>
      <action>Rank by frequency (how many chunks mentioned it) then recency</action>
    </if>
  </step>

  <step n="2" goal="Surface decisions, file content, report FYI">
    <action>Classify each signal into one of four buckets:
      - DECISION: contradicts existing docs, has multiple valid interpretations, requires choosing a direction, or blocks a next step
      - CONTENT: article candidate or enrichment — auto-file immediately (see below)
      - MARKER: [/cp] inline markers — classify each marker into one of: doc-update (update a strategy doc), content-task (update a story/point), product-task (feature/UX change), or already-captured (already in docs). Report markers separately with their classification.
      - FYI: confirmed direction, validated hypothesis, informational observation — no action needed
    </action>

    <action>**File content autonomously — NEVER ask the founder which candidates to file.** Filing is cheap and reversible (founder reviews idea-stage specs in kanban later), so the cost of asking exceeds the cost of a stray spec. Apply the Filing Bar to every [CONTENT] signal: file everything that passes, ENRICH where it extends an existing spec, SKIP only with an explicit one-word reason. Do not surface filing as a "decision" — it is not one.

      **Filing Bar — file as NEW only if all four pass:**
      1. **Substance** — ≥6 substantive exchange turns on the idea in the source conversation. (Else skip, reason: `thin`.)
      2. **Unique** — no existing a-spec covers the same taxonomy. Grep `content/articles/` titles AND bodies. If one does → **ENRICH** it instead (read its body to confirm fit per [CONTENT-ENRICH] below). (Reason: `duplicate of aNN` / `enriched aNN`.)
      3. **Privacy-clean** — passes the privacy pre-filter. If it depends on personal/family/health/financial detail that can't be removed without gutting it → skip, reason: `privacy` (note if a depersonalized reframe is possible later).
      4. **Arc-fit** — matches an existing arc or warrants a new one (add the new arc to story-arcs.md first).

      Per candidate: (a) dedup grep → ENRICH not NEW if covered; (b) add new arc to story-arcs.md if proposed; (c) run /maintain:privacy on the summary — irreducible flag → skip, reducible → redact + file; (d) if it passes, create the spec via /quick-blog (or directly in the a-spec frontmatter format) with source conversation title, date, and arc.
      **Every candidate NOT filed MUST appear in the "Content Not Filed" output with its reason — silent drops are not allowed.**
    </action>
    <action>For each [CONTENT-ENRICH] signal: before naming the target article, read its body and quote the relevant framing/taxonomy to confirm fit (title-match is not enough — a title can name a different taxonomy than its body); if the body conflicts, re-route or mark NEW. Then propose the enrichment edit to the existing article spec inline in the output below (user confirms in step 4).</action>

    <output>
      ## Claude Conversations → What Needs Your Attention
      **Period:** [date range] | **Source:** [N files / gdrive] | **Processed:** [date]
      **Since last run:** [N new conversations] (or "First run" if no marker)

      ---

      ### Decisions Needed

      **Raise a DECISION only for a genuine fork** — a strategic doc write, an irreversible action, or two defensible directions where analysis does NOT clearly point one way. Filing, FYI routing, and marker classification are NOT decisions — never surface them here. When the analysis points one way, state the call and propose the edit; do not enumerate options the founder must adjudicate (false choice). Be concise — the founder should not have to micromanage.

      **Default (one line each):**
      **N. [title]** — [the call, in one sentence, with the evidence]. *Proposed below; confirm in step 4.*

      **Only when there is a real fork, expand that item:**
      **N. [title]** — **A:** [option] / **B:** [option]. **→ [A/B]** because [one reason]. If nothing: [consequence].

      [If no genuine forks: "No decisions — [N] doc edits proposed below, [M] specs filed. Confirm the doc edits."]

      ---

      ### FYI — No Action Needed
      [Brief bullet list of informational signals. Each: one line, signal + evidence.]
      [Omit section if empty.]

      ---

      ### [/cp] Markers Processed
      [For each marker, one line: "[/cp text] — classification (doc-update / content-task / product-task / already-captured). Action: [what to do or 'already in docs/lean-canvas.md']"]
      [Omit section if no markers found.]

      ---

      ### Content Filed
      [One line per filing: "Filed: aNN — [title] (ARC-N)" or "Enriched: aNN — [what it adds]"]
      [Omit section if nothing was filed or enriched.]

      ### Content Not Filed
      [One line per skipped candidate: "[title] — reason (`thin` / `duplicate of aNN` / `privacy` / `enriched aNN`)". Omit only if EVERY candidate was filed — silent drops are not allowed.]

      ---

      Reply with option letters for each decision (e.g., "1A, 2B, 3A") and I'll draft the doc updates.
    </output>
    <action>Wait for user decisions before proceeding to step 3</action>
  </step>

  <step n="3" goal="Plan — propose doc updates, terminal only, no writes">
    <action>Draft specific proposed edits — concrete additions, replacements, or removals — using the pre-read target doc content from step 0b</action>

    <output>
      ## Proposed Updates

      ### docs/lean-canvas.md
      **Section:** [section name]
      **Change:** [ADD / REPLACE / REMOVE]
      **Before:** [current text or "(nothing)"]
      **After:** [proposed text]
      **Reason:** [why — what signal drove this]

      ### docs/hypotheses.md
      [same format]

      ### docs/theory-of-change.md
      [same format — or "No changes proposed"]

      ### docs/process-learnings.md
      [same format]

      ### Feature Priority Note (no auto-edit)
      [list features that seem mis-prioritized with reasoning — for you to act on manually via /create-prd or kanban]

      ---
      Total: [N] changes across [M] files.
      Nothing has been written yet. (Content candidates were already filed in step 2.)
    </output>
  </step>

  <step n="4" goal="Confirm and execute">
    <ask>Apply all [N] changes? You can also say "apply only: lean-canvas, hypotheses" to apply a subset.</ask>
    <on_confirm>
      <action>**Route strategy-doc writes through the gate — do NOT raw-Edit them.** For confirmed changes to any of the five strategy docs (`lean-canvas.md`, `hypotheses.md`, `theory-of-change.md`, `definitions.md`, `progress.md`): invoke `/slava:maintain:docs-strategy-update` in **sync mode**, passing the delta as "X was true; now Y, because &lt;evidence&gt;" plus the concrete Before/After per section. That skill owns the strategy-doc layer and runs the 8 anti-drift gates (premature-fact, reversal-lock, cross-doc contradiction, …) before writing — a raw Edit here bypasses them. This skill drafts the delta; docs-strategy-update performs the write.</action>
      <action>For confirmed changes to `process-learnings.md` (outside the gate's scope): read the file and apply with Edit directly.</action>
      <action>Report each edit as it's applied (or as the gate reports it)</action>
      <action>For each [CONTENT-ENRICH] signal approved in step 2, apply the routing rule from `.claude/rules/content.md` (Where Enrichment Goes):
        1. Read the a-spec frontmatter (content/articles/aNN.md).
        2. **Route by status:**
           - If `status:` in [idea, draft]: append enrichment to a-spec ## Idea or ## Enrichment section.
           - If `status:` in [draft-ready, published, promoted]:
             a. Read `draft_file:` from frontmatter.
             b. If `draft_file:` is present → propose the enrichment edit on the **draft** file, not the a-spec. Apply only after user confirms specific draft-level wording.
             c. If `draft_file:` is missing → grep `content/blog/` for slug/title match. If found, backfill `draft_file:` on a-spec AND `source_spec:` on draft, then enrich the draft. If no match, report orphan to user and ask where the live article lives. Do NOT silently write to the a-spec.
        3. **Always** append a one-line log entry to the a-spec:
           ```
           ## Enrichment ({YYYY-MM-DD})
           Source: {conversation title}
           Applied to: {draft_file path or "a-spec body"}
           ```
        4. Report: "Enriched [N]: {a-spec → destination} per entry."
      </action>
      <action>Write marker: `.private/claude-conversations-to-cp-last-run.txt` with current ISO timestamp, files_processed count, source, and window used</action>
      <action>Output summary: "Applied [N] strategy changes. Filed [M] content ideas (step 2). Modified: [file list]."</action>
      <action>Suggest: "These are strategy doc changes worth committing. Run /kdd if any decisions surfaced. Want to commit?"</action>
    </on_confirm>
    <on_reject>
      <action>Write marker: `.private/claude-conversations-to-cp-last-run.txt` with current ISO timestamp, files_processed count, source, and window used (analysis was done, just no edits applied)</action>
      <action>Report "No changes applied. (Content candidates filed in step 2 remain.)"</action>
    </on_reject>
  </step>

</workflow>
```

## Rules

- **Never write to pp docs** — this skill is cp-only. Personal signals go to `/claude-conversations-to-pp`.
- **Never write to `features/` files** — flag priority signals as notes only.
- **Never modify `docs/decisions.md` directly** — use `/kdd` for decisions.
- **Never modify the five strategy docs directly** (`lean-canvas.md`, `hypotheses.md`, `theory-of-change.md`, `definitions.md`, `progress.md`) — route through `/slava:maintain:docs-strategy-update` (sync mode), which runs the 8 anti-drift gates before writing. Same delegation pattern as decisions.md → `/kdd`.
- **Never write without explicit confirm in step 5.**
- **Read both user and assistant messages** — insights come from both sides.
- **Notion source is not supported** — no Notion MCP is configured in this project. If passed, stop and report.
