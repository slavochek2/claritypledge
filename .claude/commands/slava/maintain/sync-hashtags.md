---
name: sync-hashtags
description: Detect and fix hashtag drift between stories and their linked points on prod
when_to_use: After renumbering st-series tags, or when point tags look wrong on prod
version: 1.0.0
---

# Sync Hashtags — Story→Point Tag Consistency

Detects and fixes drift where stories have updated st-tags but their linked points still have old tags.

## Background

- Stories extract tags from `#hashtag` in content (DB trigger `trg_stories_extract_hashtags`)
- Points are linked to stories via `story_points` join table
- DB trigger `trg_sync_story_st_tags_to_points` cascades st-tag changes from stories to linked points (added 2026-03-28)
- **But**: the trigger only fires on story UPDATE — it can't fix historical drift or manual tag edits

## Steps

### 0. Load credentials

Read the prod project ref and get keys. Never hardcode project refs in skill files (public repo).

```bash
PROD_URL=$(grep "^VITE_SUPABASE_URL=" .env.prod | cut -d= -f2-)
PROD_REF=$(echo "$PROD_URL" | sed 's|https://||;s|\.supabase\.co||')
ANON_KEY=$(supabase --project-ref "$PROD_REF" projects api-keys 2>/dev/null | grep 'anon' | awk '{print $NF}')
SERVICE_KEY=$(supabase --project-ref "$PROD_REF" projects api-keys 2>/dev/null | grep 'service_role' | awk '{print $NF}')
```

### 1. Detect drift on prod

Query all story→point links and compare st-tags:
```bash
curl -s "$PROD_URL/rest/v1/story_points?select=story_id,point_id,stories(tags),points(id,tags,statement)&order=story_id" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" | python3 -c "
import sys,json
data=json.load(sys.stdin)
drift = ok = 0
for r in data:
    story_tags = r['stories']['tags'] if r['stories'] else []
    pt = r['points']
    pt_tags = pt['tags'] if pt else []
    st_story = sorted(t for t in story_tags if t.startswith('st') and t[2:].isdigit())
    st_point = sorted(t for t in pt_tags if t.startswith('st') and t[2:].isdigit())
    if st_story or st_point:
        if set(st_story) == set(st_point):
            ok += 1
        else:
            drift += 1
            stmt = pt['statement'][:80] if pt else '?'
            print(f'DRIFT  story:{st_story}  point:{st_point}  {stmt}...')
print(f'\nTotal: {ok} OK, {drift} DRIFT')
"
```

**If 0 DRIFT — done. Report and stop.**

### 2. Check for content/tag mismatch on stories

Some stories may have st-tags in the `tags` array but NOT in the content text (e.g., manually set). The `trg_stories_extract_hashtags` trigger overwrites tags from content — so any tag not in content will be lost on next save.

For each drifted story, verify the st-tag is in the content:
```bash
curl -s "$PROD_URL/rest/v1/stories?select=id,tags,content&order=created_at" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" | python3 -c "
import sys,json,re
data=json.load(sys.stdin)
for r in data:
    st_in_tags = [t for t in r['tags'] if re.match(r'^st\d+$', t)]
    st_in_content = re.findall(r'#(st\d+)', r['content'])
    if st_in_tags and set(st_in_tags) != set(st_in_content):
        print(f'MISMATCH id:{r[\"id\"][:8]}  tags:{st_in_tags}  content_hashtags:{st_in_content}')
        print(f'  Fix: add missing hashtags to story content')
"
```

**If mismatches found**: update the story content to include the missing `#stN` hashtag. Use `$SERVICE_KEY` from step 0.

### 3. Fix drifted points

For each drifted point, the correct st-tag is the one from its linked story. Generate and run PATCH calls:

```bash
# Generate fix commands from the drift detection output
# For each DRIFT line: point should have the story's st-tag, not the old one
# Use service role key for the PATCH calls
```

**Rule**: a point's st-tag must match its linked story's st-tag. If a point is linked to multiple stories with different st-tags, it should have ALL of those st-tags.

Remove any st-tag from a point that doesn't correspond to a linked story.

### 4. Verify

Re-run the drift detection query from step 1. Expect `0 DRIFT`.

### 5. Also check: stories missing st-tags in content

The ongoing trigger (`trg_sync_story_st_tags_to_points`) fires on story tag changes. But if a story's content doesn't have the `#stN` hashtag, the extract trigger will strip it on next save, breaking the cascade. Ensure every st-series story has `#stN` in its content text.

## Notes

- **Credentials**: loaded from `.env.prod` (gitignored) — never hardcode project refs in this file
- **Trigger added**: `20260328160520_sync_story_st_tags_to_points.sql` — cascades st-tag changes from stories to linked points going forward
- **Root cause of drift**: the Mar 26/28 story renumber updated story tags but not point tags. The cascade trigger didn't exist yet.
