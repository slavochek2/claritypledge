# Testing

## Automated Tests

### E2E Tests (Playwright)

Comprehensive E2E testing with Playwright covering authentication flows, form validation, and UI behavior.

**Quick start:**
```bash
npm run test:e2e
```

**Full documentation:** See [e2e-testing.md](./e2e-testing.md)

**Status:** 10/17 tests passing (6 skipped due to browser automation limitation)

### Unit Tests (Vitest)

React component tests using Vitest + React Testing Library.

```bash
npm test
```

**Critical tests:**
- [src/tests/critical-auth-flow.test.tsx](../../src/tests/critical-auth-flow.test.tsx) - Reader-Writer pattern validation

---

## Manual Testing Checklist

Before deploying, manually test these critical user flows:

### Authentication
- [ ] Sign pledge with new email
- [ ] Receive and click magic link
- [ ] Profile created and displayed
- [ ] Existing user can log in
- [ ] Profile redirects correctly

### Endorsements
- [ ] Request endorsement
- [ ] Endorser receives and verifies via email
- [ ] Endorsement shows on profile

### Navigation
- [ ] Share profile link works
- [ ] Signatories page loads all profiles
- [ ] Debug page shows correct status
- [ ] Menu navigation works when logged in/out


