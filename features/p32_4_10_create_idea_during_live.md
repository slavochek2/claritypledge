# P32.4_10: Create Idea During Live Session (PROTOTYPE)

**Status:** Ready for Implementation
**Depends On:** P32.4_00, P32.4_08b
**Estimated Time:** 30 minutes

**✅ SAFE:** This modifies PROTOTYPE code only. Production /live untouched.

---

## Purpose

Allow users to create new ideas DURING a prototype live verification session.

**Use case:** Mid-conversation, realize you're discussing something worth capturing as an idea.

**Note:** This is PROTOTYPE ONLY - uses mock data from P32.4_00, no Supabase.

---

## What Changed

### Before:
- Prototype /live only accepts ideas passed via navigation state
- No way to create idea mid-session

### After:
- "+ New Idea" FAB (Floating Action Button) in prototype LiveSession
- Can create idea without leaving session (mock data only)
- Idea immediately available in mock feed

---

## Files to Modify

### `src/app/prototypes/premium/components/LiveSession.tsx` (PROTOTYPE)

**Reuse CreateIdeaModal from P32.4_00:**

```tsx
import { CreateIdeaModal } from './CreateIdeaModal'; // From P32.4_00
import { Plus } from 'lucide-react';

export function LiveSession() {
  const location = useLocation();
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const state = location.state as LiveSessionState | null;
  const partner = state?.partnerId ? getUserById(state.partnerId) : null;
  const returnPath = state?.returnTo || '/prototype/premium';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Existing mock session UI from P32.4_08b */}
      <div className="flex-1">
        {partner && (
          <div className="p-4 bg-white border-b">
            <p className="text-sm text-gray-600">With: {partner.name}</p>
          </div>
        )}

        <div className="p-4">
          <p className="text-gray-600">Mock session in progress...</p>
        </div>
      </div>

      {/* FAB: + New Idea */}
      <button
        onClick={() => setShowCreateModal(true)}
        className="fixed bottom-24 right-4 w-14 h-14 bg-blue-500 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-600 z-10"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Reuse CreateIdeaModal from P32.4_00 */}
      <CreateIdeaModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onIdeaCreated={(ideaId) => {
          console.log('Idea created during session:', ideaId);
          setShowCreateModal(false);
          // Idea now in mock data - can verify it
        }}
      />

      {/* Done button */}
      <button
        onClick={() => navigate(returnPath)}
        className="w-full py-3 bg-gray-100 text-gray-700 font-medium"
      >
        Done
      </button>
    </div>
  );
}
```

---

## No New Components Needed

**Reuse everything from P32.4_00:**
- CreateIdeaModal component (already built)
- Mock data helpers (already exist)
- No Supabase integration (prototype only)

**Just import and wire up the modal in LiveSession.tsx**

---

## Behavior

### User Flow (Prototype):
1. In mock live session with partner
2. Realize: "This needs to be an idea!"
3. Tap + FAB button (bottom right)
4. CreateIdeaModal opens (from P32.4_00)
5. Write idea, select position
6. Tap "Post Idea"
7. Idea added to mock data
8. Modal closes
9. Session continues (idea now in feed)
10. Can navigate back and see new idea in prototype feed

---

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| FAB overlaps other controls | z-index 10, positioned bottom-24 to avoid footer |
| Modal open when user taps Done | Close modal first, then navigate |
| Duplicate idea text | Allow (mock data, no validation) |
| Create idea, then tap Done | Idea saved to mock data, appears in feed |
| FAB on small screens | Fixed position, doesn't scroll |

---

## Tests That Must Pass

### P1 (Critical)
- [ ] FAB button visible in LiveSession
- [ ] Tap FAB opens CreateIdeaModal (from P32.4_00)
- [ ] Can create idea (saves to mock data)
- [ ] Modal closes after creation
- [ ] Idea appears in prototype feed after returning
- [ ] FAB doesn't overlap Done button
- [ ] Mobile: 44px touch target
- [ ] Desktop: hover state works

---

## Done When

- [ ] FAB added to LiveSession.tsx
- [ ] CreateIdeaModal imported and wired up
- [ ] Idea saves to mock data (via P32.4_00 handlers)
- [ ] Modal opens/closes correctly
- [ ] All P1 tests pass
- [ ] Works on mobile and desktop
- [ ] No console errors
- [ ] Production /live untouched

---

## Notes

- **No new components** - just wire up existing CreateIdeaModal
- **No Supabase** - uses mock data only
- **Fast implementation** - 30 minutes (just import and wire)
- Production integration happens in Phase 3 (later)

---

## Run Command

```bash
/loop "Implement P32.4_10 per @features/p32_4_10_create_idea_during_live.md"
```
