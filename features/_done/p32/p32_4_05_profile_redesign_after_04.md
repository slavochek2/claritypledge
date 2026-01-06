# P32.4_05: Profile Redesign (Rich Cards)

**Status:** Ready for Implementation
**Depends On:** P32.4_04 (uses IdeaCard pattern)
**Estimated Time:** 2 hours

---

## Purpose

Replace sparse profile with rich cards showing engaged ideas.

**Addresses critique #11:** "Profile has no engaged ideas, needs rich cards"
**Addresses critique #12:** "Show other person's stance vs yours"

---

## What Changed from P32.3

### Before (P32.3):
```
Profile
You, Product Designer

8.5 Listener Score | 24 Ideas Engaged | 0 Verified

ACTIVITY
[All] [Agreed] [Disagreed] [Verified]

No activity matching this filter  ← Empty!
```

### After (P32.4_05):
```
Profile
You, Product Designer

8.5 Listener Score | 24 Ideas Engaged | 0 Verified

YOUR INTELLECTUAL JOURNEY
[All] [Agreed] [Disagreed] [Verified]

┌─────────────────────────────────────┐
│ Agreed with ✓  Verified             │
│                                     │
│ Remote work is more productive...  │
│                                     │
│ 👍 12  👎 5  ❓ 3                   │
│ ✦ 1 cross-verified      Jan 15    │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Disagreed with ✗                    │
│                                     │
│ AI will replace most knowledge...  │
│                                     │
│ 👍 8  👎 15  ❓ 2                   │
│ ✦ 2 cross-verified      Jan 14    │
└─────────────────────────────────────┘
```

---

## Files to Modify

### `Profile.tsx`

**New structure:**

```tsx
export function Profile() {
  const { id: profileId } = useParams<{ id?: string }>();
  const isOwnProfile = !profileId || profileId === 'current';
  const user = isOwnProfile ? currentUser : getUserById(profileId);

  const [activeFilter, setActiveFilter] = useState<ActivityFilter>('all');
  const engagedIdeas = getEngagedIdeas(user.id, activeFilter);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <ProfileHeader user={user} isOwnProfile={isOwnProfile} />

      {/* Stats Row */}
      <ProfileStats user={user} />

      {/* Activity Section */}
      <div className="px-4 py-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          {isOwnProfile ? 'Your Intellectual Journey' : `${user.name.split(' ')[0]}'s Journey`}
        </h2>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-4">
          <FilterTab active={activeFilter === 'all'} onClick={() => setActiveFilter('all')}>
            All
          </FilterTab>
          <FilterTab active={activeFilter === 'agreed'} onClick={() => setActiveFilter('agreed')}>
            Agreed
          </FilterTab>
          <FilterTab active={activeFilter === 'disagreed'} onClick={() => setActiveFilter('disagreed')}>
            Disagreed
          </FilterTab>
          <FilterTab active={activeFilter === 'verified'} onClick={() => setActiveFilter('verified')}>
            Verified
          </FilterTab>
        </div>

        {/* Engaged Idea Cards */}
        {engagedIdeas.length === 0 ? (
          <EmptyState filter={activeFilter} isOwnProfile={isOwnProfile} />
        ) : (
          <div className="space-y-4">
            {engagedIdeas.map(item => (
              <ProfileIdeaCard
                key={item.idea.id}
                idea={item.idea}
                userPosition={item.position}
                otherUserPosition={isOwnProfile ? null : getCurrentUserPosition(item.idea.id)}
                isVerified={item.isVerified}
                isOwnProfile={isOwnProfile}
              />
            ))}
          </div>
        )}
      </div>

      {/* Position Change Log */}
      <PositionChangeLog userId={user.id} />

      <BottomNav />
    </div>
  );
}
```

---

## New Component: `EmptyState.tsx`

```tsx
interface EmptyStateProps {
  filter: ActivityFilter;
  isOwnProfile: boolean;
}

export function EmptyState({ filter, isOwnProfile }: EmptyStateProps) {
  const getEmptyStateContent = () => {
    if (!isOwnProfile) {
      return {
        icon: HelpCircle,
        title: "No shared ideas yet",
        description: "This person hasn't engaged with any ideas you can see.",
      };
    }

    switch (filter) {
      case 'all':
        return {
          icon: Lightbulb,
          title: "No engaged ideas yet",
          description: "Start exploring ideas and take positions to build your intellectual journey",
          cta: "Explore Ideas",
        };
      case 'agreed':
        return {
          icon: Check,
          title: "No agreed ideas yet",
          description: "Ideas you agree with will appear here",
        };
      case 'disagreed':
        return {
          icon: X,
          title: "No disagreed ideas yet",
          description: "Ideas you disagree with will appear here",
        };
      case 'verified':
        return {
          icon: CheckCircle,
          title: "No verified ideas yet",
          description: "Complete a live verification session to see verified ideas here",
        };
      default:
        return {
          icon: HelpCircle,
          title: "No ideas found",
          description: "Try changing your filter",
        };
    }
  };

  const { icon: Icon, title, description, cta } = getEmptyStateContent();

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {/* Icon */}
      <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <Icon className="w-12 h-12 text-gray-400" />
      </div>

      {/* Title */}
      <h3 className="text-lg font-medium text-gray-900 mb-1 text-center">
        {title}
      </h3>

      {/* Description */}
      <p className="text-sm text-gray-500 text-center mb-6 max-w-xs">
        {description}
      </p>

      {/* CTA (optional) */}
      {cta && (
        <button
          onClick={() => navigate('/prototype/converged')}
          className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
        >
          {cta}
        </button>
      )}
    </div>
  );
}
```

---

## New Component: `ProfileIdeaCard.tsx`

**Different from Feed IdeaCard:** Shows position badges, no position buttons

```tsx
interface ProfileIdeaCardProps {
  idea: Idea;
  userPosition: Position;
  otherUserPosition?: Position | null; // For other person's profile
  isVerified: boolean;
  isOwnProfile: boolean;
}

export function ProfileIdeaCard({
  idea,
  userPosition,
  otherUserPosition,
  isVerified,
  isOwnProfile,
}: ProfileIdeaCardProps) {
  const stats = getIdeaStats(idea);

  return (
    <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
      {/* Position badges */}
      <div className="flex items-center gap-2 mb-3">
        <PositionBadge position={userPosition} label={isOwnProfile ? 'You' : getUserName()} />
        {isVerified && (
          <span className="text-xs text-purple-600 font-medium flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" />
            Verified
          </span>
        )}
        {!isOwnProfile && otherUserPosition && (
          <>
            <span className="text-gray-300">·</span>
            <PositionBadge position={otherUserPosition} label="You" />
          </>
        )}
      </div>

      {/* Idea text */}
      <p className="text-base text-gray-900 mb-4">{idea.text}</p>

      {/* Stats row (not clickable on profile) */}
      <div className="flex items-center gap-6 mb-4 text-sm text-gray-600">
        <span className="flex items-center gap-1.5">
          <ThumbsUp className="w-4 h-4" />
          {stats.agree}
        </span>
        <span className="flex items-center gap-1.5">
          <ThumbsDown className="w-4 h-4" />
          {stats.disagree}
        </span>
        <span className="flex items-center gap-1.5">
          <HelpCircle className="w-4 h-4" />
          {stats.unsure}
        </span>
      </div>

      {/* Meta row */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-3">
          {stats.crossVerified > 0 && (
            <span className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              {stats.crossVerified} cross-verified
            </span>
          )}
        </div>
        <span>{formatDate(idea.createdAt)}</span>
      </div>

      {/* Action button (only on other's profile if you disagree) */}
      {!isOwnProfile && userPosition !== otherUserPosition && (
        <button className="mt-4 w-full py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">
          Verify Understanding
        </button>
      )}
    </div>
  );
}
```

---

## New Component: `PositionBadge.tsx`

```tsx
interface PositionBadgeProps {
  position: Position;
  label: string; // "You" or person's first name
}

export function PositionBadge({ position, label }: PositionBadgeProps) {
  const config = {
    agree: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', icon: Check },
    disagree: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: X },
    unsure: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', icon: HelpCircle },
  }[position];

  const Icon = config.icon;

  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border',
      config.bg,
      config.text,
      config.border
    )}>
      <Icon className="w-3.5 h-3.5" />
      {label}: {position === 'agree' ? 'Agree' : position === 'disagree' ? 'Disagree' : 'Unsure'}
    </span>
  );
}
```

---

## Mock Data Helper

```tsx
export interface EngagedIdea {
  idea: Idea;
  position: Position;
  isVerified: boolean;
  timestamp: string;
}

export function getEngagedIdeas(userId: string, filter: ActivityFilter): EngagedIdea[] {
  const allEngagements: EngagedIdea[] = [];

  ideas.forEach(idea => {
    const engagement = idea.engagements.find(e => e.userId === userId);
    if (engagement) {
      allEngagements.push({
        idea,
        position: engagement.position,
        isVerified: engagement.isVerified,
        timestamp: engagement.timestamp,
      });
    }
  });

  // Apply filter
  let filtered = allEngagements;
  if (filter === 'agreed') filtered = allEngagements.filter(e => e.position === 'agree');
  if (filter === 'disagreed') filtered = allEngagements.filter(e => e.position === 'disagree');
  if (filter === 'verified') filtered = allEngagements.filter(e => e.isVerified);

  // Sort by timestamp (most recent first)
  return filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function getCurrentUserPosition(ideaId: string): Position | null {
  const idea = ideas.find(i => i.id === ideaId);
  const engagement = idea?.engagements.find(e => e.userId === 'current');
  return engagement?.position || null;
}
```

---

## Mock Data Expansion

Expand current user's engagements for testing:

```tsx
// Add current user engagements to existing ideas
ideas.forEach(idea => {
  if (!idea.engagements.some(e => e.userId === 'current')) {
    // Add current user's position to test profile
    const randomPosition: Position = ['agree', 'disagree', 'unsure'][Math.floor(Math.random() * 3)] as Position;
    idea.engagements.push({
      id: `e-current-${idea.id}`,
      ideaId: idea.id,
      userId: 'current',
      position: randomPosition,
      timestamp: new Date().toISOString(),
      isVerified: Math.random() > 0.7,
    });
  }
});
```

---

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| No engaged ideas | "No engaged ideas yet" + "Explore ideas" CTA |
| Filter returns 0 | "No {agreed/disagreed/verified} ideas yet" |
| Other person's profile, no shared ideas | Show their ideas, mark "You: No position" |
| Other person's profile, you agree on idea | No "Verify" button (same position) |
| Other person's profile, you disagree | Show "Verify Understanding" button |
| Mobile: long idea text | Truncate after 3 lines with "... more" |

---

## Tests That Must Pass

### P1 (Critical)
- [ ] Profile shows engaged idea cards
- [ ] Position badges show correctly (Agree/Disagree/Unsure)
- [ ] Filter tabs work (All/Agreed/Disagreed/Verified)
- [ ] Empty state shows when no ideas
- [ ] Other person's profile shows "You vs Them" badges
- [ ] "Verify Understanding" button shows on disagreements
- [ ] Stats display (not clickable on profile)
- [ ] Mobile: cards stack vertically
- [ ] Desktop: max-width, centered

---

## Done When

- [ ] Profile.tsx updated with new layout
- [ ] ProfileIdeaCard component created
- [ ] PositionBadge component created
- [ ] getEngagedIdeas() helper in mock-data.ts
- [ ] Mock data expanded with current user engagements
- [ ] All P1 tests pass
- [ ] Works on mobile and desktop
- [ ] No console errors

---

## Run Command

```bash
/loop "Implement P32.4_05 per @features/p32_4_05_profile_redesign_after_04.md"
```
