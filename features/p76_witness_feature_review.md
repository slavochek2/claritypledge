# P76: Witness Feature Review

## Current State

The "witness" feature allows visitors to publicly endorse someone's pledge:

1. Visitor goes to `/p/:slug/pledge`
2. Clicks "Witness this pledge"
3. Enters their name + optional LinkedIn URL
4. Creates a `witnesses` record in the database
5. Witness count displayed on pledge page and profiles

### Database Schema
```sql
create table public.witnesses (
  id uuid primary key,
  profile_id uuid references profiles(id),  -- The pledger
  witness_name text not null,
  witness_linkedin_url text,
  witness_profile_id uuid references profiles(id),  -- If witness is also a user
  created_at timestamp
);
```

### Files Involved
- `src/app/components/social/witness-card.tsx` - Form to add witness
- `src/app/components/social/witness-list.tsx` - Display witnesses
- `src/app/pages/pledge-page.tsx` - Shows witness card
- `src/app/components/social/pledger-card.tsx` - Shows witness count
- `src/app/data/api.ts` - `addWitness()`, `getWitnesses()`
- `supabase/schema.sql` - witnesses table + RLS policies

## Problems

### 1. Non-logged-in users can witness
Anyone can add their name as a witness without an account. This creates:
- Unverifiable data (fake names, spam potential)
- No accountability
- No connection to the platform's user graph

### 2. "Witness" concept is confusing
What does it mean to "witness" a pledge? It's unclear:
- Is it endorsement?
- Is it verification that you know this person?
- Is it just "I saw this"?

### 3. Witnessing a specific person's pledge is odd
Why witness *this person's* pledge specifically? The pledge text is the same for everyone. If you believe in the pledge, you should:
- Take it yourself, OR
- Endorse the *concept* (the Clarity Pledge as an idea), not a specific person's copy of it

### 4. Doesn't fit the product direction

| Product Direction | Witness Feature |
|-------------------|-----------------|
| Events → Stories/Points → Verification | One-time anonymous endorsement |
| Calibration gaps (understanding measurement) | No understanding involved |
| B2B2C growth via event organizers | Individual social proof |
| /live sessions with real verification | Passive "I vouch for this person" |

**Core issue:** Witnessing doesn't demonstrate understanding. It's just vague social proof that doesn't align with "sensemaking platform" positioning.

## Options

### Option A: Delete Witness Feature
**Pros:**
- Simplifies codebase
- Removes confusing/outdated concept
- Forces focus on core loop (Events → Verification → Calibration)

**Cons:**
- Breaks existing witness data (need migration)
- Removes social proof element entirely
- Some users may have witnessed pledges

**Effort:** Medium (DB migration, remove 5+ files, update tests)

### Option B: Rename to "Endorsement"
Keep the feature but rebrand as simple endorsement.

**Pros:**
- Minimal code changes
- Keeps social proof

**Cons:**
- Still doesn't align with sensemaking vision
- "Endorsement" is generic (LinkedIn-like)

**Effort:** Low (mostly copy changes)

### Option C: Replace with "Understanding Verification"
Transform witness into something that demonstrates understanding:

1. Person A takes pledge
2. Person B wants to "verify" they understand Person A
3. Person B must complete a /live session with Person A
4. Only then can Person B be listed as someone who "understands" Person A

**Pros:**
- Aligns with core product vision
- Creates meaningful social proof
- Drives /live session usage

**Cons:**
- Major refactoring
- Changes the meaning entirely
- Requires both parties to participate

**Effort:** High (new feature essentially)

### Option D: Deprecate Gracefully
1. Hide witness UI from new users
2. Keep existing witness data visible
3. Don't delete, just freeze
4. Revisit when we have clearer direction

**Pros:**
- No data loss
- No breaking changes
- Buys time

**Cons:**
- Dead code in codebase
- Confusing for maintenance

**Effort:** Low

## Recommendation

**Option A: Delete now, replace later with Points-based engagement.**

The witness feature doesn't serve the product vision and has fundamental design flaws (anonymous, confusing, person-specific). Delete it cleanly.

### Deletion Steps
1. Remove witness-related UI components
2. Update pledge page to remove witness section
3. Update pledger card to remove witness count
4. Remove API functions (`addWitness`, `getWitnesses`)
5. Create DB migration to drop `witnesses` table
6. Update/remove tests
7. Document in decisions.md why we removed it

### Data consideration
- Check how many witnesses exist in production before deleting
- Existing data will be lost (acceptable given low value)

## Future Replacement Ideas

Once we have Points/Ideas infrastructure, consider these alternatives:

### Idea A: "I endorse the Clarity Pledge" Point
- A single shared Point that anyone can agree/disagree with
- Not person-specific — endorses the *concept*
- Requires account (logged in)
- Shows on a "Supporters" page or landing page

### Idea B: "Following" the Pledge
- Users can "follow" the Clarity Pledge concept
- Similar to following a topic
- Shows engagement without the weird "witnessing a person" dynamic

### Idea C: Profile-level endorsements (much later)
- Once profiles have their own Points/Ideas
- Other users can agree/disagree with those
- Real engagement, not passive witnessing

**Key principle:** Any replacement should:
- Require authentication
- Be about ideas/concepts, not passively endorsing a person
- Fit the Points/Stories/Verification model

## Decision

[x] **Delete witness feature**
[ ] Replace later when Points infrastructure exists
