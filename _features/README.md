# Simplified Refactoring Plan

**Goal:** Move future features, isolate auth, lock with E2E tests.

**Total Time:** ~3 hours

---

## 🎯 The Plan

### Phase 1: Move Future Features (30 min)
→ [phase-1-move-future.md](phase-1-move-future.md)

Move Phase 2 features to `_future/` folder without breaking anything.

**Tasks:**
- Create `_future/` folder
- Move dashboard, settings, witness components
- Remove routes from App.tsx
- Comment out Phase 2 API functions
- Quick test: signup & login still work

---

### Phase 2: Isolate Auth (30 min)
→ [phase-2-isolate-auth.md](phase-2-isolate-auth.md)

Move auth code to protected `/src/auth/` module.

**Tasks:**
- Create `src/auth/` folder
- Move `use-user.ts` → `useAuth.ts`
- Move `auth-callback-page.tsx`
- Update imports
- Quick test: signup & login still work

---

### Phase 3: E2E Tests (2 hours)
→ [phase-3-e2e-tests.md](phase-3-e2e-tests.md)

Lock auth with Playwright tests so it never breaks.

**Tasks:**
- Install Playwright
- Write signup E2E test
- Write login E2E test
- Run tests - confirm they pass
- Done!

---

## ✅ Progress

- [ ] Phase 1: Move Future Features
- [ ] Phase 2: Isolate Auth
- [ ] Phase 3: E2E Tests

---

## 🚀 Start Here

Open [phase-1-move-future.md](phase-1-move-future.md) and follow the steps.

**Rule:** Test after each phase before moving to the next!
