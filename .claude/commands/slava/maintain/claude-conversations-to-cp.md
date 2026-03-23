---
name: claude-conversations-to-cp
description: Analyze recent Claude conversations (or any input source) to surface strategic signals and propose updates to cp strategy docs. Reads both sides of conversations. Never writes without explicit confirmation.
when_to_use: After a sprint, a week of sessions, or any period where you want to surface unresolved tensions and update lean-canvas, hypotheses, theory-of-change, or process-learnings.
version: 1.2.0
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

## Conversation File Format

### Default: Exported Claude.ai markdown (~/Projects/private/claude-conversations/)

Files are structured markdown with this format:
```
# Conversation Title

**Created:** YYYY-MM-DDTHH:MM:SSZ
**Updated:** YYYY-MM-DDTHH:MM:SSZ

---

### 👤 Human
[user message text]

---

### 🤖 Claude
[assistant message text]

---
```

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
      <action>Count files</action>
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
    <action>Read current content of all target docs: docs/lean-canvas.md, docs/hypotheses.md, docs/theory-of-change.md, docs/process-learnings.md</action>
    <action>Read docs/goals.md — the current build sequence and priorities. Use this to contextualize conversation signals: distinguish "blocked by unbuilt prerequisite" from "avoidance" and "UX iteration on existing spec" from "strategy shift"</action>
    <action>Hold this content in context for contradiction detection in step 2 and diff generation in step 4</action>
  </step>

  <step n="1" goal="Ingest conversations — MapReduce if large">
    <if condition="file count <= 15">
      <action>Read each file directly using the JSONL format described above</action>
      <action>Proceed to step 2 with unified message text</action>
    </if>

    <if condition="file count > 15">
      <action>Estimate average file size. If average > 100KB: use chunks of 3-5 files. If < 50KB average: use chunks of 10-12 files. Report chunk count before spawning.</action>
      <action>Spawn one Explore agent per chunk with this prompt:

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

  <step n="2" goal="Surface — output signals and tensions">
    <output>
      ## Claude Conversations → Strategy Analysis
      **Period:** [date range] | **Source:** [N files / gdrive] | **Processed:** [date]
      **Since last run:** [N new conversations] (or "First run" if no marker)

      ---

      ### Strategic Signals

      **[STRATEGY]**
      [list each signal with evidence — flag if contradicts current lean-canvas.md]

      **[HYPOTHESIS]**
      [list each — flag if contradicts or validates existing hypotheses.md entries]

      **[PROCESS]**
      [list each — flag if same friction appeared in process-learnings.md already]

      **[SPEC-PRIORITY]**
      [features mentioned repeatedly but not yet specced, or ranked wrong]

      ---

      ### Unresolved Tensions
      [TENSION items — contradictions, open questions, things mentioned but never resolved]
    </output>
  </step>

  <step n="3" goal="Clarify — batch all questions at once">
    <action>Review all signals and tensions</action>
    <action>Identify things needing clarification: signals that could mean multiple things, tensions where resolution depends on current intent, signals that contradict existing docs (which is right?)</action>

    <if condition="no clarifying questions identified">
      <action>State: "No clarifications needed — signals are clear. Proceeding to draft updates." Move directly to step 4.</action>
    </if>

    <if condition="clarifying questions exist">
      <action>Classify each question before formatting: (a) factual — one clearly right answer once context is known; ask plainly. (b) direction — requires choosing between two valid interpretations with trade-offs; format as a /simplify block (Situation / Options A-B / Recommendation / Reply: A or B).</action>
      <output>
        ## Clarifying Questions

        Before I draft updates, I need your input on [N] things:

        [factual questions as plain numbered items]
        [direction questions as /simplify blocks]

        For direction questions, reply with the option letter. For factual questions, reply inline.
        Answer all at once and I'll draft the full update plan.
      </output>
      <action>Wait for user response before proceeding to step 4</action>
    </if>
  </step>

  <step n="4" goal="Plan — propose doc updates, terminal only, no writes">
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
      Nothing has been written yet.
    </output>
  </step>

  <step n="5" goal="Confirm and execute">
    <ask>Apply all [N] changes? You can also say "apply only: lean-canvas, hypotheses" to apply a subset.</ask>
    <on_confirm>
      <action>Read each target file</action>
      <action>Apply only the confirmed changes using Edit tool</action>
      <action>Report each edit as it's applied</action>
      <action>Write marker: `.private/claude-conversations-to-cp-last-run.txt` with current ISO timestamp, files_processed count, source, and window used</action>
      <action>Output summary: "Applied [N] changes. Modified: [file list]."</action>
      <action>Suggest: "These are strategy doc changes worth committing. Run /kdd if any decisions surfaced. Want to commit?"</action>
    </on_confirm>
    <on_reject>
      <action>Write marker: `.private/claude-conversations-to-cp-last-run.txt` with current ISO timestamp, files_processed count, source, and window used (analysis was done, just no edits applied)</action>
      <action>Report "No changes applied."</action>
    </on_reject>
  </step>

</workflow>
```

## Rules

- **Never write to pp docs** — this skill is cp-only. Personal signals go to `/claude-conversations-to-pp`.
- **Never write to `features/` files** — flag priority signals as notes only.
- **Never modify `docs/decisions.md` directly** — use `/kdd` for decisions.
- **Never write without explicit confirm in step 5.**
- **Read both user and assistant messages** — insights come from both sides.
- **Notion source is not supported** — no Notion MCP is configured in this project. If passed, stop and report.
