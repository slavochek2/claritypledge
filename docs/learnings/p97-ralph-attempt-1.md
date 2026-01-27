# P97 Ralph Attempt 1 — Learnings

**Date:** 2026-01-27
**Duration:** 42 iterations, ~2 hours
**Result:** Failed (stuck on Navigation)

## What Happened

1. Started ralph with TDD preset (red-green-refactor hats)
2. Generated 38-test UAT file
3. Ran 42 iterations, completed Cat 1-4 (Types, Shared Components, Content, Profile)
4. Got stuck on Cat 5 (Navigation) — E2E tests targeting wrong routes

## Root Causes

| Issue | Impact |
|-------|--------|
| **E2E tests targeted `/home`** | But code is at `/proto/*` — tests always failed |
| **No memory usage** | ralph.yml had memory config but hats didn't use it |
| **TDD overkill** | 38 tests for UI work with mock data |
| **UAT ambiguity** | Didn't specify which routes to test |

## What We Learned

1. **For UI rebuilds, UAT is overkill** — Visual match is the test
2. **Memory must be in hat instructions** — Not just config
3. **Prototype routes ≠ production routes** — Be explicit
4. **Simpler is better** — Single implementer hat, inline prompt

## Attempt 2 Approach

```bash
ralph run --no-tui -p "P97: Rebuild prototype into production.
Source (READ ONLY): src/app/prototypes/linkedin-like/.
Target: src/app/.
Match prototype visuals/behavior.
Mock data.
npm run build && npm run lint must pass."
```

**Changes:**
- No UAT file
- No TDD ceremony
- Single inline prompt
- Success = visual match + build passes

## Salvageable Work

w2 has working code from Cat 1-4:
- `src/app/types/stories.ts`
- `src/app/data/mock-stories.ts`
- `src/app/components/calibration/`
- `src/app/components/position/`
- `src/app/components/content/`
- `src/app/components/profile/content-tabs.tsx`

Build and lint pass on w2.

## Attempt 2 Result

**Result:** Failed — output doesn't match prototype, buggy UI

Ralph rebuilt components but they don't look or behave like the prototype. Visual fidelity lost.

---

## Key Insight

**Rebuild doesn't work for UI.** Too much gets lost in translation.

The prototype works. Stop trying to rebuild it — just use it.

---

## Next Direction: Integrate Then Refactor

### Phase 1: Integrate (just wire it up)
1. Import prototype components into production pages
2. `/p/:slug` → uses prototype Profile component
3. `/home` → uses prototype MyEvents component
4. Navigation → uses prototype PrototypeHeader/BottomNav
5. **Ship it** — users can use it

### Phase 2: Refactor (clean up later)
1. Split large files (Live.tsx 1800 lines → smaller)
2. Extract duplicated logic to hooks
3. Move components from `prototypes/` to `components/` one by one
4. Keep it working the whole time

### Why This Works
- **No visual fidelity loss** — using actual working code
- **Lower risk** — always have working version
- **Incremental** — refactor piece by piece
- **Ship fast** — users don't care about code structure

---

## Command for Attempt 3 (Integrate)

Manual or `/dev` — not ralph loop. Just:
1. Update routes in App.tsx
2. Import prototype components
3. Verify it works
4. Commit
