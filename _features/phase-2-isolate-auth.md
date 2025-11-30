# Phase 2: Isolate Auth

**Goal:** Move auth code to protected `/src/auth/` module.

**Time:** 30 minutes

---

## Steps

### 1. Create Auth Module (2 min)

```bash
mkdir -p src/auth
```

---

### 2. Move use-user.ts → useAuth.ts (5 min)

```bash
# Copy file
cp src/hooks/use-user.ts src/auth/useAuth.ts
```

**Edit:** `src/auth/useAuth.ts`

Update the comment at top:
```typescript
/**
 * @file useAuth.ts
 * @module auth
 *
 * CRITICAL - DO NOT MODIFY WITHOUT E2E TEST APPROVAL
 *
 * Reader-only auth hook. Observes auth state, fetches profile.
 * Does NOT create profiles or handle redirects.
 */
```

Rename the export:
```typescript
// Keep everything the same, just verify export name
export function useAuth(): AuthState { ... }
```

---

### 3. Move auth-callback-page.tsx (5 min)

```bash
# Copy file
cp src/polymet/pages/auth-callback-page.tsx src/auth/AuthCallbackPage.tsx
```

**Edit:** `src/auth/AuthCallbackPage.tsx`

Update comment at top:
```typescript
/**
 * @file AuthCallbackPage.tsx
 * @module auth
 *
 * CRITICAL - DO NOT MODIFY WITHOUT E2E TEST APPROVAL
 *
 * Writer for auth system. Creates profiles after magic link verification.
 * This is the ONLY place profiles are created (not in hooks or triggers).
 */
```

---

### 4. Create index.ts (Public API) (3 min)

**File:** `src/auth/index.ts`

```typescript
/**
 * Authentication Module
 *
 * Import from this module only: import { useAuth } from '@/auth';
 * Never import internal files directly.
 */

export { useAuth } from './useAuth';
export { AuthCallbackPage } from './AuthCallbackPage';

// Re-export types for convenience
export type { Profile } from '@/polymet/types';
```

---

### 5. Update All Imports (10 min)

**Find files that import auth code:**
```bash
# Find use-user imports
grep -r "from '@/hooks/use-user'" src/ --include="*.tsx" --include="*.ts"

# Find auth-callback imports
grep -r "from '@/polymet/pages/auth-callback-page'" src/ --include="*.tsx" --include="*.ts"
```

**Update each file:**

```typescript
// Before:
import { useUser } from '@/hooks/use-user';
const { user, isLoading, signOut } = useUser();

// After:
import { useAuth } from '@/auth';
const { user, isLoading, signOut } = useAuth();
```

```typescript
// Before:
import { AuthCallbackPage } from '@/polymet/pages/auth-callback-page';

// After:
import { AuthCallbackPage } from '@/auth';
```

**Files to update:**
- `src/App.tsx`
- `src/polymet/components/simple-navigation.tsx`
- Any other files found by grep

---

### 6. Delete Old Files (2 min)

```bash
# Delete old hook
rm src/hooks/use-user.ts

# Delete old page
rm src/polymet/pages/auth-callback-page.tsx

# If hooks folder is empty, delete it
rmdir src/hooks/  # Only if empty
```

---

### 7. Test Compilation (1 min)

```bash
npx tsc --noEmit
```

Should have no errors. If errors → fix imports.

---

### 8. Test Auth Flow (5 min)

```bash
npm run dev
```

**Quick test:**
1. Sign up with new email
2. Click magic link
3. Verify profile created
4. Sign out
5. Log in again
6. Verify it works

**If breaks:** Stop, fix, test again.

---

### 9. Git Commit (1 min)

```bash
git add src/auth/
git add src/App.tsx
git add src/polymet/components/
git add -u

git commit -m "refactor: isolate auth into /src/auth/ module

- Moved use-user.ts → src/auth/useAuth.ts
- Moved auth-callback-page.tsx → src/auth/AuthCallbackPage.tsx
- Created public API in src/auth/index.ts
- Updated all imports
- Deleted old files

Auth is now isolated. Signup/login still working.

Next: Lock with E2E tests"
```

---

## ✅ Done!

- [ ] Auth module created
- [ ] All imports updated
- [ ] Signup/login tested and working
- [ ] Git committed

**Next:** → [phase-3-e2e-tests.md](phase-3-e2e-tests.md)
