# P37: GDPR Compliance Roadmap

**Overview:** Three-phase approach to GDPR compliance for Clarity Pledge Live Meetings.

---

## Phase Sequence

### ✅ **P37.1: Legal Entity Update** (DONE)
- Estonian entity established
- Terms & Privacy Policy updated
- Contact info set up

### 🔴 **P37.2a: Consent Mechanism** (CRITICAL - Do Now)
**Deploy before ANY public recordings**
**Effort:** 6-8 hours

- [ ] Database migration: `session_consents` table
- [ ] Consent dialog component (blocks recording)
- [ ] API functions: `logSessionConsent()`, `verifyConsentLogged()`
- [ ] Integration into Live Meeting flow
- [ ] Privacy Policy update

**Blocker:** Current code records audio without consent = GDPR violation

### 🟡 **P37.2b: Data Rights** (HIGH - Do at 10-20 Users)
**Deploy when manual handling becomes burden**
**Effort:** 6-8 hours

- [ ] Export endpoint: `exportUserData()`
- [ ] Deletion endpoint: `requestAccountDeletion()`
- [ ] Settings page UI ("Your Data")
- [ ] GCS recording deletion
- [ ] Confirmation dialogs

**Why wait:** Can handle 1-10 requests manually via email

### 🟢 **P37.2c: Advanced Compliance** (LOW - Do at 100+ Users)
**Deploy when scaling or if complaints**
**Effort:** 8-12 hours

- [ ] Consent withdrawal (separate from deletion)
- [ ] Opt-out of ML training
- [ ] Auto-delete after 90 days
- [ ] Admin dashboard
- [ ] Anonymization pipeline

**Why wait:** Defensive features for scale, not needed for MVP

---

## Quick Decision Matrix

| You have... | Do this |
|-------------|---------|
| **0 users, no recordings yet** | P37.2a NOW (before launch) |
| **1-10 users, few recordings** | P37.2a NOW + manual data requests |
| **10-20 users, 2-3 data requests/week** | P37.2b (automate export/deletion) |
| **100+ users, support burden high** | P37.2c (advanced features) |

---

## Risk Summary

| Feature | Risk if skipped | Fine potential |
|---------|----------------|----------------|
| **P37.2a** (consent) | 🔴 HIGH - Every recording = violation | €20M or 4% revenue |
| **P37.2b** (export/delete) | 🟡 MEDIUM - 30-day fix window if complaint | €10M or 2% revenue |
| **P37.2c** (advanced) | 🟢 LOW - Manual handling OK | Minor complaints |

---

## Files Created

1. **[p37_2a_consent_mechanism.md](./p37_2a_consent_mechanism.md)** - CRITICAL for launch
   - Database schema with secure RLS
   - Consent dialog component
   - API functions
   - Integration guide
   - Testing checklist

2. **[p37_2b_data_rights.md](./p37_2b_data_rights.md)** - Deploy at 10-20 users
   - Export/deletion endpoints
   - Settings page UI
   - GCS deletion logic
   - Manual handling guide

3. **[p37_2c_advanced_compliance.md](./p37_2c_advanced_compliance.md)** - Future enhancements
   - Consent withdrawal
   - ML training opt-out
   - Auto-delete cron
   - Admin dashboard

---

## Next Steps

**This week:**
1. Read [p37_2a_consent_mechanism.md](./p37_2a_consent_mechanism.md)
2. Create database migration
3. Build consent dialog
4. Test with 5 friends
5. Deploy before any public recordings

**When you hit 10-20 users:**
1. Read [p37_2b_data_rights.md](./p37_2b_data_rights.md)
2. Implement export/deletion
3. Add Settings page UI

**When you hit 100+ users:**
1. Re-evaluate need for [p37_2c_advanced_compliance.md](./p37_2c_advanced_compliance.md)
2. Implement based on user feedback

---

## Key Changes from Original P37.2

**Security fixes:**
- ✅ Fixed RLS policy vulnerability (was `WITH CHECK (true)`)
- ✅ Added consent verification before audio upload
- ✅ Improved IP hashing fallback
- ✅ Specified cryptographically secure guest ID generation

**Prioritization:**
- ✅ Split into 3 phases based on user count
- ✅ Made export/deletion "deploy at 10-20 users" not "50-100"
- ✅ Clarified what can be postponed vs must-do-now

**Implementation details:**
- ✅ Added GCS deletion requirements (was TODO)
- ✅ Added consent withdrawal to advanced features
- ✅ Specified server-side IP hashing recommendation
- ✅ Added manual request handling guide for <10 users

---

## Compliance Rating

**Before P37.2a:** 3/10 ⚠️ (Non-compliant - recordings without consent)
**After P37.2a:** 7/10 ✅ (Compliant for MVP)
**After P37.2b:** 9/10 ✅ (Fully compliant for <100 users)
**After P37.2c:** 10/10 ✅ (Enterprise-grade compliance)

---

## Questions?

- **Can I launch without P37.2a?** NO. Recordings without consent = GDPR violation.
- **Can I postpone P37.2b?** YES. Handle data requests manually until 10-20 users.
- **When do I need P37.2c?** Only when scaling (100+ users) or if legal counsel recommends.
- **What if I get a data request before P37.2b is ready?** Handle manually via email (see P37.2b guide).

---

## Related Documents

- [P37.1: Legal Entity Update](./p37_1_legal_entity_update.md)
- [Privacy Policy](../src/app/pages/privacy-policy-page.tsx)
- [Terms of Service](../src/app/pages/terms-of-service-page.tsx)
- [CLAUDE.md - GDPR Notes](../CLAUDE.md)
