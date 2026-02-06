# P126: Create Story — UAT (Phase 1 Only)

Phase 1 scope: Manual story creation. No AI, no Points.

---

## Auth & Access

| ID | Test | Status |
|----|------|--------|
| UAT-1.1 | `/create` loads for logged-in user | ⬜ |
| UAT-1.2 | `/create` redirects to `/login` for unauthenticated user | ⬜ |
| UAT-1.3 | After login, user returns to `/create` (redirect preserved) | ⬜ |

---

## Form UI

| ID | Test | Status |
|----|------|--------|
| UAT-2.1 | Title field present (required) | ⬜ |
| UAT-2.2 | Story textarea present (required) | ⬜ |
| UAT-2.3 | Character count shows for story field | ⬜ |
| UAT-2.4 | Save button present | ⬜ |
| UAT-2.5 | Form uses standard layout (top nav visible) | ⬜ |

---

## Validation

| ID | Test | Status |
|----|------|--------|
| UAT-3.1 | Empty title → validation error shown | ⬜ |
| UAT-3.2 | Empty story → validation error shown | ⬜ |
| UAT-3.3 | Save button disabled while submitting | ⬜ |

---

## Save & Success

| ID | Test | Status |
|----|------|--------|
| UAT-4.1 | Save calls `storiesService.createStory()` | ⬜ |
| UAT-4.2 | Success → toast confirmation shown | ⬜ |
| UAT-4.3 | Success → redirect to profile (or `/story/:id` if route exists) | ⬜ |
| UAT-4.4 | Story appears on user's profile after save | ⬜ |

---

## Error Handling

| ID | Test | Status |
|----|------|--------|
| UAT-5.1 | Network error → toast with error message | ⬜ |
| UAT-5.2 | Error state allows retry (form not cleared) | ⬜ |

---

## Analytics

| ID | Test | Status |
|----|------|--------|
| UAT-6.1 | `story_creation_started` fires on page load | ⬜ |
| UAT-6.2 | `story_saved` fires on success with `{ story_id, char_count }` | ⬜ |

---

## Code Quality

| ID | Test | Status |
|----|------|--------|
| UAT-7.1 | `./scripts/pre-commit-checks.sh` passes | ⬜ |
| UAT-7.2 | No TypeScript errors | ⬜ |
| UAT-7.3 | No ESLint errors | ⬜ |

---

## Scorecard

| Category | Pass | Total |
|----------|------|-------|
| Auth & Access | 0 | 3 |
| Form UI | 0 | 5 |
| Validation | 0 | 3 |
| Save & Success | 0 | 4 |
| Error Handling | 0 | 2 |
| Analytics | 0 | 2 |
| Code Quality | 0 | 3 |
| **Total** | **0** | **22** |
