# P32.4_08: Idea Detail "Verify Understanding" Button

**Status:** Ready for Implementation
**Depends On:** None
**Can Run In Parallel With:** P32.4_06, P32.4_07
**Estimated Time:** 30 minutes

---

## Purpose

Add "Verify Understanding" button on each person with a position in Idea Detail.

**Addresses:** Verification entry point from idea detail page

---

## What Changed from P32.3

### Before (P32.3):
```
People With Positions:
┌────────────────────────────────┐
│ Alice Chen (Disagrees)         │
│ [Verify in Chat] [Go Live]     │
└────────────────────────────────┘
```

### After (P32.4_08):
```
People With Positions:
┌────────────────────────────────┐
│ Alice Chen (Disagrees)         │
│ [Verify Understanding]         │
└────────────────────────────────┘
```

---

## Files to Modify

### `IdeaDetail.tsx`

**Update people list:**

```tsx
export function IdeaDetail() {
  const { id } = useParams<{ id: string }>();
  const idea = getIdeaById(id);
  const navigate = useNavigate();

  const handleVerify = (partnerId: string) => {
    navigate('/live', {
      state: {
        partnerId,
        ideaId: idea.id,
        ideaText: idea.text,
        myPosition: getCurrentUserPosition(idea.id),
        theirPosition: getPartnerPosition(idea.id, partnerId),
      }
    });
  };

  return (
    <div>
      {/* ... idea content ... */}

      {/* People With Positions */}
      <section className="mt-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase mb-4">
          People With Positions
        </h3>

        <div className="space-y-3">
          {idea.engagements.map(engagement => {
            const user = getUserById(engagement.userId);
            if (!user || user.id === 'current') return null;

            return (
              <div key={engagement.id} className="bg-white p-4 rounded-lg border">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                      <span className="text-lg">{user.avatar}</span>
                    </div>
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-xs text-gray-500">{user.role}</p>
                    </div>
                  </div>

                  <PositionBadge position={engagement.position} label={user.name.split(' ')[0]} />
                </div>

                {/* Verify button */}
                <button
                  onClick={() => handleVerify(user.id)}
                  className="w-full py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
                >
                  Verify Understanding
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
```

---

## Behavior

### Button Action
1. Tap "Verify Understanding" on Alice
2. Navigate to `/live` with state:
   ```js
   {
     partnerId: 'alice',
     ideaId: 'idea-1',
     ideaText: 'Remote work is more productive...',
     myPosition: 'agree',
     theirPosition: 'disagree'
   }
   ```
3. /live uses this context to frame verification session

---

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Current user in list | Don't show (filter out) |
| Only current user has position | "No other positions yet" |
| Partner offline | Button still shows (verification queues) |
| Same position as you | Button still shows (can verify agreement) |
| Partner not in network | Button shows (can add to network via verification) |

---

## Tests That Must Pass

### P1 (Critical)
- [ ] Button shows on each person with position
- [ ] Current user excluded from list
- [ ] Tap button navigates to /live
- [ ] /live receives correct context (partner, idea, positions)
- [ ] Button styled consistently (blue-50 bg, blue-600 text)
- [ ] Mobile: button full-width, 44px touch target
- [ ] Desktop: button full-width, hover state

---

## Done When

- [ ] IdeaDetail updated with new button
- [ ] handleVerify() function navigates correctly
- [ ] All P1 tests pass
- [ ] Works on mobile and desktop
- [ ] No console errors

---

## Run Command

```bash
/loop "Implement P32.4_08 per @features/p32_4_08_idea_detail_verify_button.md"
```
