---
name: insight-post
description: Scans last 48hr of Claude conversations (CLI JSONL + downloaded claude.ai exports) for surprising, impactful, or emotionally charged moments. Generates 5 distinct LinkedIn post framings, tightens the best, presents for approval, schedules via Postiz for next morning.
when_to_use: Run daily after /day to turn yesterday's thinking into a LinkedIn post. Prompted automatically at end of /day.
version: 1.0.0
---

# /insight-post

Mine the last 48 hours of conversations for genuine insight. Turn the best signal into a LinkedIn post. Schedule it.

No research agent. No 30 variants. Raw earned authenticity — your voice, your thinking.

## Usage

```
/slava:insight-post        # Full pipeline
```

---

## Phase 1 — Gather (run both in parallel)

### Agent A: CLI conversations (last 48hr)

Find all JSONL files modified in the last 48hr across ALL `.claude/projects/` subdirectories:

```bash
find ~/.claude/projects -name "*.jsonl" -mtime -2
```

For each file: parse line by line. Keep only lines where:
- `message.role` is `user` or `assistant`
- `message.content` is a non-empty string, OR first element of content array has `type: text` with `text` length > 30
- Skip pure tool_use / tool_result lines
- Skip lines with content that is only a command invocation (starts with `<command-message>`)
- Skip content < 30 chars

Group by `sessionId`. For each session: extract the human+assistant turns as readable prose. Return: `{project_dir, timestamp, turns: [{role, text}]}`

### Agent B: Downloaded conversations (last 48hr)

Check newest markdown file:
```bash
find ~/Projects/private/claude-conversations -name "*.md" -mtime -2 | sort
```

If no files found newer than 24h: invoke `/slava:script:claude-sync-download` to refresh, then re-scan.

For each `.md` file dated within 48hr: read the full text (title + body). Return: `{title, date, full_text}`

---

## Phase 2 — Extract Signals

Read all gathered material. Score moments on:

| Criterion | What to look for |
|-----------|-----------------|
| **Surprise** | Did something contradict an assumption? Did a small thing turn out to be bigger? |
| **Emotional charge** | Frustration, breakthrough, embarrassment, excitement, confusion resolved? |
| **Concreteness** | Has actual numbers, names, specific examples — not just abstractions |
| **Broader relevance** | Could someone not working on claritypledge find value in it? |
| **Freshness** | New realization, not a restated belief you've held for months |

Output: **top 3 signals** ranked by combined score:

```
Signal 1: [one sentence]
Category: [surprise / insight / problem / breakthrough / confession]
Raw excerpt: [direct quote or close paraphrase, 2–4 sentences]
Why broader: [who else cares about this and why]

Signal 2: ...
Signal 3: ...
```

**If no signal scores well** (routine debugging day, nothing interesting):
```
⚪ No strong signal in last 48hr.
   Options: (a) skip today, (b) give me a topic and I'll draft from that.
```
Never force a weak post. Stop here and ask.

---

## Phase 3 — Draft 5 Framings

Take the **top signal**. Generate 5 complete LinkedIn post drafts — not angle names, full posts.

Each framing is a different rhetorical move:

| # | Framing | Opening move |
|---|---------|--------------|
| 1 | **The honest struggle** | "I've been doing X wrong for [time]. Then..." |
| 2 | **The contrarian** | "Everyone says X. Here's what I found instead." |
| 3 | **The concrete lesson** | Start with the specific fact, then generalize |
| 4 | **The reframe** | "X isn't about Y. It's about Z." |
| 5 | **The confession** | Something embarrassing or humbling, told without self-pity |

Each post:
- 150–250 words
- First person, earned — not generic
- No hashtags
- No emojis unless they'd appear naturally in speech
- No call to action ("comment below", "what do you think?") — that's noise
- Ends when it has nothing more to say

---

## Phase 4 — Tighten

Pick the framing that feels most true, most specific, least like other LinkedIn posts.

Apply these cuts (from `/slava:content:tighten`):
- Cut every warm-up sentence before the real opening (start where it gets interesting)
- Cut hedges: "in a sense", "kind of", "I think maybe", "sort of"
- Cut the restatement at the end (don't summarize what you just said)
- Cut adjectives that don't change meaning
- Cut the sentence the reader already knows from the previous one
- Read aloud. Cut anything that makes you stumble.

Report: word count before → after.

---

## Phase 5 — Present for Approval

Show the tightened post:

```
────────────────────────────────────────
INSIGHT POST — scheduled for [tomorrow date]
────────────────────────────────────────

[full post text]

────────────────────────────────────────
Signal: [one sentence — what moment this came from]
Framing used: [which of the 5]
Words: [N]
────────────────────────────────────────
Other framings available: reply 1/2/3/4/5 to switch
```

Ask: **"Schedule for tomorrow 9am? Reply 'yes', 'edit: [changes]', or pick a framing (1–5)."**

Wait for explicit reply before posting. If user edits: apply, show revised, confirm again.

---

## Phase 6 — Schedule via Postiz

```bash
source "$(git rev-parse --show-toplevel)/.env.local"

# Next-day 9am as ISO UTC (macOS date)
TOMORROW_9AM=$(python3 -c "
from datetime import datetime, timedelta
import time
# Get local 9am tomorrow, convert to UTC
from datetime import timezone
local_tomorrow_9am = (datetime.now() + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)
print(local_tomorrow_9am.strftime('%Y-%m-%dT%H:%M:%S.000Z'))
")

# Escape post content for JSON
POST_JSON=$(python3 -c "import sys, json; print(json.dumps(open('/tmp/insight-post-approved.txt').read()))")

# Login
curl -s -c /tmp/postiz-insight-cookies.txt -X POST "$POSTIZ_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$POSTIZ_EMAIL\",\"password\":\"$POSTIZ_PASSWORD\",\"provider\":\"LOCAL\"}" > /dev/null

# Schedule
RESULT=$(curl -s -b /tmp/postiz-insight-cookies.txt -X POST "$POSTIZ_URL/api/posts" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"schedule\",
    \"date\": \"$TOMORROW_9AM\",
    \"shortLink\": false,
    \"tags\": [],
    \"posts\": [{
      \"integration\": {\"id\": \"$POSTIZ_LINKEDIN_CHANNEL_ID\"},
      \"value\": [{\"content\": $POST_JSON, \"image\": []}]
    }]
  }")

rm -f /tmp/postiz-insight-cookies.txt /tmp/insight-post-approved.txt
echo "$RESULT"
```

Write approved post to `/tmp/insight-post-approved.txt` before running the schedule command.

Confirm success:
```
✓ Scheduled for LinkedIn
  Date: [tomorrow] 9:00am local
  Postiz: https://postiz.claritypledge.com/launches
  Preview: "[first 80 chars]..."
```

---

## Credentials (all in `.env.local`)

| Variable | Value |
|----------|-------|
| `POSTIZ_URL` | `https://postiz.claritypledge.com` |
| `POSTIZ_EMAIL` | `ops@claritypledge.com` |
| `POSTIZ_PASSWORD` | Postiz account password |
| `POSTIZ_LINKEDIN_CHANNEL_ID` | `cmlzashw80001t86nxnlk6pi2` |

## Troubleshooting

**Postiz 502:** Backend down. See [postiz.md](docs/technical/postiz.md) — start Temporal services.

**No JSONL files found:** Session may not have been active in last 48hr. Fall back to downloaded conversations only.

**claude-sync-download fails:** Proceed with CLI conversations only. Report that download was skipped.

## Related

- `/slava:script:claude-sync-download` — refreshes downloaded claude.ai conversations
- `/slava:content:tighten` — editing principles used in Phase 4
- `/slava:content:promote-blog` — for distributing existing blog posts (different pipeline)
- [postiz.md](docs/technical/postiz.md) — Postiz infrastructure
