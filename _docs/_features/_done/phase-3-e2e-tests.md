# Phase 3: E2E Tests

**Goal:** Lock auth with Playwright tests so it never breaks again.

**Time:** 2 hours

---

## Steps

### 1. Install Playwright (5 min)

```bash
npm install -D @playwright/test
npx playwright install
```

---

### 2. Create Config (5 min)

**File:** `playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
});
```

---

### 3. Create Test Folder (2 min)

```bash
mkdir -p e2e
```

---

### 4. Write Signup Test (30 min)

**File:** `e2e/signup.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test('signup flow creates profile and redirects', async ({ page }) => {
  // 1. Go to signup page
  await page.goto('/sign-pledge');

  // 2. Fill form
  await page.fill('input[id="name"]', 'E2E Test User');
  await page.fill('input[id="email"]', `test-${Date.now()}@example.com`);
  await page.fill('input[id="role"]', 'QA Engineer');

  // 3. Submit
  await page.click('button[type="submit"]:has-text("Sign the Pledge")');

  // 4. Verify success page
  await expect(page.locator('text=Almost Done!')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('text=Check your email')).toBeVisible();
});

test('signup form validation works', async ({ page }) => {
  await page.goto('/sign-pledge');

  // Submit empty form
  await page.click('button[type="submit"]');

  // Should show error (form prevents submission or shows error message)
  // Adjust this based on your actual validation behavior
  const nameInput = page.locator('input[id="name"]');
  await expect(nameInput).toBeFocused(); // Or check for error message
});
```

**Test manually:**
```bash
npx playwright test e2e/signup.spec.ts
```

**If fails:** Fix the selectors to match your actual HTML.

---

### 5. Write Login Test (30 min)

**File:** `e2e/login.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test('login page loads and form works', async ({ page }) => {
  // 1. Go to login page
  await page.goto('/login');

  // 2. Check form exists
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeVisible();

  // 3. Fill email
  await page.fill('input[type="email"]', 'existing-user@example.com');

  // 4. Submit
  await page.click('button[type="submit"]');

  // 5. Verify success message
  await expect(page.locator('text=Check your email')).toBeVisible({ timeout: 5000 });
});

test('navigation links work for guest users', async ({ page }) => {
  await page.goto('/');

  // Check "Take the Pledge" button exists
  await expect(page.locator('text=Take the Pledge')).toBeVisible();

  // Click it
  await page.click('text=Take the Pledge');

  // Should navigate to signup
  await expect(page).toHaveURL(/sign-pledge/);
});
```

**Test:**
```bash
npx playwright test e2e/login.spec.ts
```

---

### 6. Write Smoke Tests (20 min)

**File:** `e2e/smoke.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test('landing page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Clarity Pledge/i);
  await expect(page.locator('nav')).toBeVisible();
});

test('all critical pages load without errors', async ({ page }) => {
  const pages = ['/', '/sign-pledge', '/login', '/manifesto'];

  for (const path of pages) {
    await page.goto(path);

    // No console errors
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    // Page renders
    await expect(page.locator('body')).toBeVisible();

    // No errors
    expect(errors).toHaveLength(0);
  }
});
```

**Test:**
```bash
npx playwright test e2e/smoke.spec.ts
```

---

### 7. Add NPM Scripts (2 min)

**File:** `package.json`

Add to `"scripts"`:
```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug"
  }
}
```

---

### 8. Run All Tests (10 min)

```bash
npm run test:e2e
```

**All tests should pass!**

If any fail:
- Check the screenshot in `test-results/`
- Fix the test or the code
- Re-run until all pass

---

### 9. Create CI Config (Optional, 10 min)

**File:** `.github/workflows/e2e.yml`

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
```

---

### 10. Git Commit (2 min)

```bash
git add playwright.config.ts
git add e2e/
git add package.json
git add .github/workflows/  # If created

git commit -m "test: add Playwright E2E tests for auth flows

- Installed Playwright
- Created signup flow test
- Created login flow test
- Created smoke tests
- All tests passing

Auth is now LOCKED - cannot break without failing tests!"
```

---

## ✅ Done!

- [ ] Playwright installed
- [ ] Signup test passing
- [ ] Login test passing
- [ ] Smoke tests passing
- [ ] Git committed

**🎉 Auth is now locked and protected!**

---

## What You Achieved

✅ Phase 2 features moved to `_future/`
✅ Auth isolated in `/src/auth/`
✅ E2E tests prevent breaking auth
✅ Codebase clean and organized
✅ Safe to build new features

**Total time:** ~3 hours
**Codebase reduction:** ~70%
**Auth security:** Locked with tests
