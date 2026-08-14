---
status: all-done
type: story
tags: []
rank: 125436.0
created_date: 2026-01-14
completed_at: '2026-02-09'
---

# P42: Data Rights (Export & Deletion)

> **Re-closed honestly, 2026-08-14.** This file is `status: all-done` with **0 of 35 checkboxes ticked**. That was deliberate, not sloppy: what shipped was the *policy plus a manual runbook*, with the build explicitly deferred (*"Don't implement until you have 10-20 active users"*). Nothing here was ever built.
>
> **Two things changed since:**
>
> 1. **The threshold is passed.** Prod is at **60 registered users** and 229 /live sessions (`docs/progress.md`) — 3-6x the 10-20 trigger this spec set for itself. The manual posture is running well past its own stated ceiling. Build work is tracked in **P520**, promoted 2026-08-14.
> 2. **The runbook pointed at the wrong mailbox.** It routed requests to `support@claritypledge.com`, which is not in the mailbox inventory (`pp/docs/infra/all-inkl.md`). The public Terms of Service direct users to `privacy@claritypledge.com`. All occurrences corrected on 2026-08-14; delivery to that address was founder-confirmed working the same day.
>
> This note exists because `all-done` on a spec with no ticked boxes read as *"account deletion shipped"* to a backlog triage on 2026-08-14. It had not.

**Status:** Deferred (Deploy at 10-20 Users)
**Priority:** HIGH (but not blocking launch)
**Est. Effort:** 6-8 hours
**Created:** 2026-01-06
**Renamed:** 2026-01-07 (was P37.2b)
**Depends On:** P37.2a (Consent Mechanism)

---

## Implementation Order

```
┌─────────────────────────────────────────────────────────────┐
│  GDPR Compliance Phases                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  LAUNCH (Now)        SCALE (10-20 users)   GROWTH (100+)   │
│  ─────────────       ─────────────────     ─────────────   │
│  P37.2a Consent  ──► P42 Data Rights   ──► P43 Advanced    │
│  P40 Microphone      (This)                                 │
│  P41 Coaching                                               │
│                                                             │
│  Until P42: Handle data requests manually via email        │
│  GDPR allows 30-day response window                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**For AI agents:** Don't implement P42 until you have 10-20 active users. Until then, handle data requests manually via privacy@claritypledge.com.

---

## Context

GDPR Articles 15, 17, and 20 grant users rights to:
- **Article 15:** Access their personal data
- **Article 17:** Request deletion ("Right to be Forgotten")
- **Article 20:** Export data in portable format ("Data Portability")

**When to implement:** At 10-20 active users. Below that threshold, handle requests manually via email (privacy@claritypledge.com). Once you're processing 2-3 data requests per week, automate.

**Why not critical for launch:** You can legally handle early requests manually within GDPR's 30-day response window.

---

## Objectives

**Phase 2 (Deploy at 10-20 Users):**
- [ ] Data export endpoint (user downloads all their data as JSON)
- [ ] Data deletion endpoint (user requests account deletion)
- [ ] Settings page UI for data management
- [ ] Google Cloud Storage deletion for recordings
- [ ] Confirmation dialogs ("This is permanent")
- [ ] Audit logging for deletion requests

---

## User Flow

**Settings Page → Data Management Section:**

```
┌─────────────────────────────────────────────┐
│  📦 Your Data                                │
│                                             │
│  You have the right to export or delete    │
│  your personal data under GDPR.            │
│                                             │
│  [📥 Download My Data]                      │
│  Downloads JSON file with all your data    │
│                                             │
│  [🗑️ Request Account Deletion]             │
│  Permanently deletes your account and      │
│  all associated data                       │
└─────────────────────────────────────────────┘
```

**Export Flow:**
1. User clicks "Download My Data"
2. System generates JSON with:
   - Profile data
   - Witnesses
   - Session consents
   - Live meeting participation (if available)
   - Links to audio recordings in GCS
3. Browser downloads file: `claritypledge_data_2026-01-06.json`

**Deletion Flow:**
1. User clicks "Request Account Deletion"
2. Confirmation dialog: "This is permanent. All your data will be deleted. Continue?"
3. User confirms
4. System:
   - Deletes all witnesses
   - Deletes all consent records
   - Deletes audio recordings from Google Cloud Storage
   - Deletes profile (cascades to auth.users)
   - Logs deletion event for audit
5. User is logged out
6. Redirect to homepage with message: "Your account has been deleted."

---

## Implementation

### 1. Data Export Endpoint

**File:** `src/app/data/api.ts` (add to existing file)

```typescript
/**
 * Export all user data as JSON (GDPR Article 20 - Right to Data Portability)
 *
 * Returns complete data export including:
 * - Profile information
 * - Witnesses (endorsements given to you)
 * - Session consents
 * - Links to audio recordings (if any)
 */
export async function exportUserData(userId: string): Promise<UserDataExport> {
  // Fetch profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (profileError) throw profileError;

  // Fetch witnesses
  const { data: witnesses, error: witnessesError } = await supabase
    .from('witnesses')
    .select('*')
    .eq('profile_id', userId);

  if (witnessesError) throw witnessesError;

  // Fetch session consents
  const { data: consents, error: consentsError } = await supabase
    .from('session_consents')
    .select('*')
    .eq('user_id', userId);

  if (consentsError) throw consentsError;

  // TODO: Fetch live meeting participation data (when live_participants table exists)
  // TODO: Generate signed URLs for audio recordings in GCS

  return {
    profile,
    witnesses: witnesses || [],
    consents: consents || [],
    // recordings: [], // TODO: Add when GCS integration ready
    exportedAt: new Date().toISOString(),
    exportedBy: userId,
    version: '1.0',
  };
}

interface UserDataExport {
  profile: any; // Profile from database
  witnesses: any[]; // Witnesses from database
  consents: any[]; // Session consents from database
  // recordings?: { filename: string; url: string; size: number }[]; // TODO: GCS recordings
  exportedAt: string;
  exportedBy: string;
  version: string;
}

/**
 * Download user data export as JSON file.
 * Triggers browser download.
 */
export async function downloadUserDataExport(userId: string): Promise<void> {
  const data = await exportUserData(userId);

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `claritypledge_data_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log('✅ Data export downloaded');

  // Mixpanel event
  analytics.track('data_exported', { userId });
}
```

---

### 2. Data Deletion Endpoint

**File:** `src/app/data/api.ts` (add to existing file)

```typescript
/**
 * Request account deletion (GDPR Article 17 - Right to be Forgotten)
 *
 * Deletes:
 * - Profile (cascades to auth.users)
 * - Witnesses
 * - Session consents
 * - Audio recordings from Google Cloud Storage
 *
 * Note: Anonymized data in ML models cannot be removed (personal identifiers already stripped).
 */
export async function requestAccountDeletion(userId: string, userEmail?: string): Promise<void> {
  console.log('🗑️ Starting account deletion for user:', userId);

  try {
    // 1. Delete witnesses (both given and received)
    const { error: witnessesError } = await supabase
      .from('witnesses')
      .delete()
      .or(`profile_id.eq.${userId},witness_profile_id.eq.${userId}`);

    if (witnessesError) {
      console.error('Failed to delete witnesses:', witnessesError);
      throw new Error('Failed to delete witnesses');
    }

    // 2. Delete session consents
    const { error: consentsError } = await supabase
      .from('session_consents')
      .delete()
      .eq('user_id', userId);

    if (consentsError) {
      console.error('Failed to delete consents:', consentsError);
      throw new Error('Failed to delete consents');
    }

    // 3. TODO: Delete audio recordings from Google Cloud Storage
    // For each session where this user participated:
    //   - List files matching: gs://clarity-recordings/{sessionCode}/{userName}_*.webm
    //   - Delete all matching files
    // await deleteUserRecordingsFromGCS(userId, userName);

    // 4. Delete profile (cascades to auth.users via FK)
    const { error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (profileError) {
      console.error('Failed to delete profile:', profileError);
      throw new Error('Failed to delete profile');
    }

    console.log('✅ Account deleted successfully:', userId);

    // Mixpanel event (before user data is gone)
    analytics.track('account_deleted', {
      userId,
      email: userEmail,
      deletedAt: new Date().toISOString(),
    });

    // TODO: Log deletion event to audit table for compliance
    // await logDeletionEvent(userId, userEmail);

  } catch (error) {
    console.error('❌ Account deletion failed:', error);
    throw error;
  }
}

/**
 * Delete user's audio recordings from Google Cloud Storage.
 * TODO: Implement when GCS client is set up.
 */
async function deleteUserRecordingsFromGCS(userId: string, userName: string): Promise<void> {
  // Pseudocode:
  // 1. Get all sessions where user participated (query clarity_sessions)
  // 2. For each session:
  //    - List files: gs://clarity-recordings/{sessionCode}/{userName}_chunk_*.webm
  //    - Delete each file
  // 3. Log deletion count

  console.warn('⚠️ GCS deletion not yet implemented');

  // Example implementation:
  // import { Storage } from '@google-cloud/storage';
  // const storage = new Storage();
  // const bucket = storage.bucket('clarity-recordings');
  // const [files] = await bucket.getFiles({ prefix: `${sessionCode}/${userName}_` });
  // await Promise.all(files.map(file => file.delete()));
}
```

---

### 3. Settings Page UI

**File:** `src/app/pages/settings-page.tsx` (add section)

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth';
import { downloadUserDataExport, requestAccountDeletion } from '@/app/data/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useNavigate } from 'react-router-dom';

export function SettingsPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleExportData = async () => {
    if (!user) return;

    try {
      await downloadUserDataExport(user.id);
      alert('Your data has been downloaded.');
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export data. Please try again.');
    }
  };

  const handleRequestDeletion = async () => {
    if (!user) return;

    setIsDeleting(true);
    try {
      await requestAccountDeletion(user.id, user.email);

      // Sign out and redirect
      await signOut();
      navigate('/', { replace: true });

      alert('Your account has been deleted.');
    } catch (error) {
      console.error('Deletion failed:', error);
      alert('Failed to delete account. Please contact privacy@claritypledge.com');
      setIsDeleting(false);
    }
  };

  return (
    <div className="container max-w-2xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>

      {/* ... other settings sections ... */}

      {/* Data Management Section */}
      <section className="border rounded-lg p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">📦 Your Data</h2>
        <p className="text-muted-foreground mb-4">
          You have the right to export or delete your personal data under GDPR.
        </p>

        <div className="space-y-3">
          <div>
            <Button
              variant="outline"
              onClick={handleExportData}
              className="w-full sm:w-auto"
            >
              📥 Download My Data
            </Button>
            <p className="text-xs text-muted-foreground mt-1">
              Downloads a JSON file with all your data
            </p>
          </div>

          <div>
            <Button
              variant="destructive"
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full sm:w-auto"
            >
              🗑️ Request Account Deletion
            </Button>
            <p className="text-xs text-muted-foreground mt-1">
              Permanently deletes your account and all data
            </p>
          </div>
        </div>
      </section>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This action is permanent and cannot be undone. All your data will be deleted:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Profile and pledge</li>
                <li>Witnesses (endorsements)</li>
                <li>Live meeting recordings</li>
                <li>All session data</li>
              </ul>
              <p className="mt-3 font-semibold">
                Are you sure you want to continue?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRequestDeletion}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? 'Deleting...' : 'Yes, Delete My Account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

---

### 4. Google Cloud Storage Deletion (TODO)

**Implementation needed:**

1. Install Google Cloud Storage SDK:
```bash
npm install @google-cloud/storage
```

2. Create utility function:

**File:** `src/lib/gcs-client.ts`

```typescript
import { Storage } from '@google-cloud/storage';

const storage = new Storage({
  // TODO: Configure credentials
  // projectId: 'your-project-id',
  // keyFilename: 'path/to/keyfile.json',
});

const RECORDINGS_BUCKET = 'clarity-recordings';

/**
 * Delete all recordings for a specific user from GCS.
 */
export async function deleteUserRecordings(
  sessionCodes: string[],
  userName: string
): Promise<{ deleted: number; errors: string[] }> {
  const bucket = storage.bucket(RECORDINGS_BUCKET);
  let deleted = 0;
  const errors: string[] = [];

  for (const sessionCode of sessionCodes) {
    try {
      // List all files for this user in this session
      const [files] = await bucket.getFiles({
        prefix: `${sessionCode}/${userName}_`,
      });

      // Delete each file
      await Promise.all(files.map(file => file.delete()));
      deleted += files.length;

      console.log(`✅ Deleted ${files.length} recordings for ${userName} in ${sessionCode}`);
    } catch (error) {
      console.error(`❌ Failed to delete recordings for ${sessionCode}:`, error);
      errors.push(`${sessionCode}: ${error}`);
    }
  }

  return { deleted, errors };
}
```

3. Integrate into `requestAccountDeletion()`:

```typescript
// In requestAccountDeletion(), before deleting profile:

// Get all sessions where user participated
const { data: userSessions } = await supabase
  .from('clarity_sessions')
  .select('code, creator_name, joiner_name')
  .or(`creator_name.eq.${userName},joiner_name.eq.${userName}`);

if (userSessions && userSessions.length > 0) {
  const sessionCodes = userSessions.map(s => s.code);
  const { deleted, errors } = await deleteUserRecordings(sessionCodes, userName);

  console.log(`🗑️ Deleted ${deleted} recordings from GCS`);
  if (errors.length > 0) {
    console.warn('⚠️ Some recordings failed to delete:', errors);
  }
}
```

---

## Acceptance Criteria

### Data Export
- [ ] User can download JSON export of all their data
- [ ] Export includes: profile, witnesses, consents
- [ ] Export includes links to recordings (when GCS integration ready)
- [ ] File naming format: `claritypledge_data_YYYY-MM-DD.json`
- [ ] Mixpanel event tracked: `data_exported`

### Data Deletion
- [ ] Deletion shows confirmation dialog with list of what will be deleted
- [ ] User must explicitly confirm ("Yes, Delete My Account")
- [ ] Deletion removes: profile, witnesses, consents, recordings
- [ ] After deletion, user is logged out and redirected to homepage
- [ ] Deletion logs event for audit trail
- [ ] GCS recordings are deleted (or logged as TODO if not implemented)
- [ ] Mixpanel event tracked: `account_deleted`

---

## Testing Checklist

### Manual Testing
- [ ] Click "Download My Data" → JSON file downloads
- [ ] Open JSON file → contains all expected data
- [ ] Click "Request Account Deletion" → confirmation dialog appears
- [ ] Cancel deletion → nothing happens
- [ ] Confirm deletion → account removed, logged out, redirected
- [ ] Try to log in after deletion → error (account doesn't exist)
- [ ] Check database → profile, witnesses, consents deleted
- [ ] Check GCS → recordings deleted (or logged as TODO)

### E2E Test
```typescript
test('user can export and delete their data', async ({ page }) => {
  // Login
  await page.goto('/settings');

  // Export data
  const downloadPromise = page.waitForEvent('download');
  await page.click('button:has-text("Download My Data")');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/claritypledge_data_\d{4}-\d{2}-\d{2}\.json/);

  // Request deletion
  await page.click('button:has-text("Request Account Deletion")');
  await expect(page.locator('text=Delete Account?')).toBeVisible();
  await page.click('button:has-text("Yes, Delete My Account")');

  // Should redirect to homepage
  await expect(page).toHaveURL('/');

  // Should not be able to login again
  // (requires test helper to verify database)
});
```

---

## Deployment Checklist

**Pre-deployment:**
- [ ] Add `exportUserData()` to api.ts
- [ ] Add `requestAccountDeletion()` to api.ts
- [ ] Create Settings page data management section
- [ ] Test data export on staging (verify JSON structure)
- [ ] Test data deletion on staging (verify database cleanup)
- [ ] Set up GCS client library (or document TODO)

**Deployment:**
1. [ ] Deploy frontend code
2. [ ] Test export with real user account
3. [ ] Test deletion with test account (create dummy data first)
4. [ ] Monitor Sentry for errors
5. [ ] Check Mixpanel for `data_exported` and `account_deleted` events

**Post-deployment:**
- [ ] Document data export/deletion process in user docs
- [ ] Add "Data Rights" section to FAQ
- [ ] Monitor support requests for data-related issues

---

## Manual Request Handling (For <10 Users)

**If user emails support@ requesting data export/deletion before this feature is deployed:**

### Data Export Request:
1. Verify user identity (email match)
2. Query Supabase:
```sql
-- Profile
SELECT * FROM profiles WHERE email = 'user@example.com';

-- Witnesses
SELECT * FROM witnesses WHERE profile_id = 'user-uuid';

-- Consents
SELECT * FROM session_consents WHERE user_id = 'user-uuid';
```
3. Export to JSON manually
4. Send via secure link (Dropbox, Google Drive)
5. Respond within 7 days (GDPR allows 30, but aim for 7)

### Deletion Request:
1. Verify user identity
2. Run SQL:
```sql
-- Delete witnesses
DELETE FROM witnesses WHERE profile_id = 'user-uuid' OR witness_profile_id = 'user-uuid';

-- Delete consents
DELETE FROM session_consents WHERE user_id = 'user-uuid';

-- Delete profile (cascades to auth)
DELETE FROM profiles WHERE id = 'user-uuid';
```
3. Delete GCS recordings manually (use gsutil or console)
4. Confirm via email within 7 days
5. Log deletion in audit spreadsheet

---

## Known Limitations

1. **GCS deletion not implemented:** Must be added before Phase 2 complete. For MVP, document as TODO.
2. **No audit log table:** Deletion events tracked only in Mixpanel. Future: add `audit_log` table.
3. **No data export for live sessions:** Requires `live_participants` table (future feature).
4. **Deletion is irreversible:** No "soft delete" or grace period. Consider adding 30-day grace period in future.

---

## Success Metrics

- <24 hour turnaround on data export requests
- <7 day turnaround on deletion requests (manual processing time)
- Zero GDPR complaints
- 100% deletion success rate (no orphaned data)

---

## Related Documents

- [P37.2a: Consent Mechanism](./p353_2a_consent_mechanism.md)
- [P37.2c: Advanced Compliance](./p37_2c_advanced_compliance.md)
- [Privacy Policy](../src/app/pages/privacy-policy-page.tsx)
- [Settings Page](../src/app/pages/settings-page.tsx)
