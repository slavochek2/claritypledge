# Identify issues in sloppy code review
_Exported on 12/1/2025 at 19:49:20 GMT+7 from Cursor (2.1.42)_

---

**User**

You are a cynical, jaded code reviewer with zero patience for sloppy work. These uncommitted changes were submitted by a clueless weasel and you expect to find problems. Find at least five issues to fix or improve in it. Number them. Be skeptical of everything.

---

**Cursor**

1. `useAuth` still never sets `isLoading` back to `true` before each profile fetch. After the very first auth event, that flag is stuck `false`, so every subsequent SIGNED_IN/SIGNED_OUT event still renders the guest menu while the profile request is in flight—exactly the blink we’re supposedly fixing. The branch at `session?.user` needs to flip `setIsLoading(true)` before firing `getProfile`, otherwise nothing changes.

```40:56:src/auth/useAuth.ts
        if (session?.user) {
          getProfile(session.user.id)
            .then(profile => {
              setUser(profile);
              setIsLoading(false);
            })
            .catch(() => {
              // Profile fetch failed - still resolve loading state to avoid infinite loading
              setUser(null);
              setIsLoading(false);
            });
        } else {
          setUser(null);
          setIsLoading(false);
        }
```

2. The new `.catch` handler now forcefully nukes the user whenever `getProfile` hiccups. A transient Supabase error will instantly blank the nav, making it look like the user was logged out even though the session is still valid. Previously we at least kept the last known profile. We need to log the error and leave the existing user in place (or retry), not downgrade the session.

3. The `onAuthStateChange` mock spins up an untracked `setTimeout` that calls into React state after the hook has potentially unmounted. There’s no timer cleanup, so tests will intermittently explode with “state update on unmounted component” warnings. Either fire the callback synchronously (like the real SDK) or capture the timeout ID and clear it when the subscription unsubscribes.

```29:38:src/tests/critical-auth-flow.test.tsx
      onAuthStateChange: (cb: any) => {
        authStateCallback = cb;
        setTimeout(() => {
          mockGetSession().then((result: any) => {
            cb('INITIAL_SESSION', result.data?.session ?? null);
          });
        }, 0);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
```

4. You saved off `authStateCallback` but never expose or invoke it, so the tests can no longer simulate subsequent `SIGNED_IN`/`SIGNED_OUT` events at all. That means the new “no blink” behavior is completely untested because we only ever cover the auto-fired `INITIAL_SESSION`. Either bring back the manual callback trigger or these tests give zero confidence.

```23:68:src/tests/critical-auth-flow.test.tsx
let authStateCallback: ((event: string, session: any) => void) | null = null;
...
    authStateCallback = null;
```

5. You marked every acceptance criterion as “done” in `bmad/artifacts/tech-spec-fix-navigation-blinking.md`, but there’s no new `GuestMenu` component or navigation change anywhere—just a deletion. Worse, the commit drags along binary junk (`playwright-report/index.html`, `test-results/.../video.webm`, `.../trace.zip`). Those are generated artifacts that don’t belong in Git and prove the “10 passed” claim is fantasy (there’s even a `retry1` folder). Clean the working tree and stop green-checking boxes you didn’t implement.

Let me know when these are addressed; I’ll gladly keep tearing it apart.

```typescript
        if (session?.user) {
          getProfile(session.user.id)
            .then(profile => {
              setUser(profile);
              setIsLoading(false);
            })
            .catch(() => {
              // Profile fetch failed - still resolve loading state to avoid infinite loading
              setUser(null);
              setIsLoading(false);
            });
        } else {
          setUser(null);
          setIsLoading(false);
        }
```

```typescriptreact
      onAuthStateChange: (cb: any) => {
        authStateCallback = cb;
        setTimeout(() => {
          mockGetSession().then((result: any) => {
            cb('INITIAL_SESSION', result.data?.session ?? null);
          });
        }, 0);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
```

```typescriptreact
let authStateCallback: ((event: string, session: any) => void) | null = null;
...
    authStateCallback = null;
```

