---
status: all-done
type: story
tags: []
rank: 125433.0
created_date: 2026-01-06
completed_at: '2026-02-09'
---

# P37.1: Legal Entity Update (TechSalesBox OÜ)

**Status:** Ready for Implementation
**Priority:** 🔴 Critical (Liability Protection + GDPR Compliance)
**Est. Effort:** 3-4 hours (expanded scope for full GDPR compliance)
**Created:** 2026-01-06
**Updated:** 2026-01-06 (added comprehensive GDPR requirements)

---

## Context

Clarity Pledge is currently presented as a personal project. With the introduction of Live Meeting recordings and ML training on user voice data, we need to move the legal entity to **TechSalesBox OÜ** to:

1. **Protect personal liability** — Limited liability company shields founder from data breach lawsuits
2. **Meet GDPR requirements** — EU entity = cleaner GDPR compliance for voice data processing
3. **Build user trust** — Real company behind the service, not "some guy"

---

## Objectives

**Legal Entity & Governance:**
- [ ] Update Privacy Policy to list TechSalesBox OÜ as data controller
- [ ] Update Terms of Service to list TechSalesBox OÜ as service operator
- [ ] Add company information to website footer
- [ ] Update legal last-updated date

**GDPR Compliance (Critical Additions):**
- [ ] Add Legal Basis for Processing (GDPR Art. 6)
- [ ] Add Data Controller & DPO clarification (GDPR Art. 37)
- [ ] Add International Data Transfers disclosure (GDPR Art. 44-46)
- [ ] Add detailed Data Retention policy (GDPR Art. 5(1)(e))
- [ ] Add Right to Object and Restrict Processing (GDPR Art. 18, 21)
- [ ] Add Supervisory Authority contact (GDPR Art. 77)
- [ ] Add Age Verification requirement (GDPR Art. 8)
- [ ] Add Automated Decision-Making disclosure (GDPR Art. 22)
- [ ] Clarify recording consent is separate from ToS acceptance

---

## Company Details

**Legal Entity:** TechSalesBox OÜ
**Registration Number:** 14832496
**Jurisdiction:** Estonia (EU)
**Registered Address:** Harju maakond, Kuusalu vald, Pudisoo küla, Männimäe/1, 74626
**CEO / Data Controller:** Vyacheslav Ladischenski
**Data Protection Contact:** privacy@claritypledge.com (GDPR requests, legal inquiries)
**Support Email:** support@claritypledge.com (user-facing support)

**DPO Requirement:** Not required under GDPR Art. 37 for small-scale operations (<10,000 regular users). CEO acts as Data Protection Contact.

---

## Implementation Tasks

### 1. Update Privacy Policy

**File:** [src/app/pages/privacy-policy-page.tsx](../../../src/app/pages/privacy-policy-page.tsx)

**Changes:**

- **Overview section** — Replace "The Clarity Pledge ('we,' 'us,' or 'our')" with:
  ```
  The Clarity Pledge is operated by TechSalesBox OÜ (registry code 14832496),
  an Estonian company ("we," "us," or "our"). We are committed to protecting your privacy.
  ```

- **Data Controller section** (new) — Add after "Overview":
  ```
  ## Data Controller

  TechSalesBox OÜ acts as the data controller for all personal data collected through
  The Clarity Pledge platform.

  - **Legal Entity:** TechSalesBox OÜ
  - **Registry Code:** 14832496
  - **Address:** Harju maakond, Kuusalu vald, Pudisoo küla, Männimäe/1, 74626
  - **Data Protection Contact:** privacy@claritypledge.com

  As a small-scale operation, we are not required to appoint a formal Data Protection
  Officer (DPO) under GDPR Article 37. However, you can contact us at the email above
  for any data protection inquiries, GDPR requests, or privacy concerns.
  ```

- **Legal Basis for Processing section** (new) — Add after "Data Controller":
  ```
  ## Legal Basis for Processing

  We process your personal data under the following legal grounds as required by GDPR Article 6:

  - **Contractual necessity (Art. 6(1)(b))** — To provide the pledge service, authentication,
    public profile features, and Live Meeting functionality you requested.

  - **Consent (Art. 6(1)(a) and Art. 9(2)(a))** — For voice recording and ML training.
    You will be asked for explicit consent via a separate dialog before any recording starts.
    This consent is separate from accepting these Terms of Service.

  - **Legitimate interest (Art. 6(1)(f))** — For error tracking (Sentry), analytics (Mixpanel),
    session replay (LogRocket), and service improvement, where our business interests do not
    override your fundamental rights and freedoms. You can object to this processing at any time.
  ```

- **International Data Transfers section** (new) — Add after "Third-Party Services":
  ```
  ## International Data Transfers

  Some of our service providers may transfer your data outside the European Economic Area (EEA).
  When this occurs, we ensure appropriate safeguards are in place as required by GDPR Articles 44-46:

  - **Standard Contractual Clauses (SCCs)** — Approved by the European Commission for transfers
    to countries without adequacy decisions
  - **Adequacy decisions** — We rely on EU Commission adequacy decisions where applicable
  - **Data Processing Agreements** — All processors have signed DPAs covering GDPR obligations

  **Primary data storage:** TechSalesBox OÜ is based in Estonia (EU), and we store all primary
  data (profiles, pledges, witnesses) within the EU via Supabase EU regions.

  **Services involving non-EU transfers:**
  - Google Cloud Storage (audio recordings) — Uses SCCs, data stored in EU regions where possible
  - Mixpanel (analytics) — Uses SCCs for data transfer
  - Sentry (error tracking) — Uses SCCs for data transfer
  - LogRocket (session replay) — Uses SCCs for data transfer
  ```

- **Update Data Retention section** — Replace existing vague text with:
  ```
  ## Data Retention

  We retain your data only as long as necessary for the purposes outlined in this policy,
  in accordance with GDPR Article 5(1)(e) (storage limitation):

  - **Profile data** — Retained while your account is active. Deleted within 30 days of
    account closure request.

  - **Audio recordings (Live Meetings)** — Retained for 90 days for service improvement,
    then automatically deleted. Exception: Anonymized excerpts used for ML training may
    persist indefinitely, but cannot be traced back to you.

  - **Session logs & metadata** — Retained for 12 months for troubleshooting, auditing,
    and service improvement.

  - **Error logs (Sentry)** — Retained for 90 days, then automatically deleted.

  - **Analytics data (Mixpanel)** — Aggregated and anonymized data retained for up to 5 years
    for trend analysis.

  - **Session replays (LogRocket)** — Retained for 30 days, then automatically deleted.

  You can request early deletion of your data at any time by contacting privacy@claritypledge.com
  ```

- **Update "Your Rights" section** — Add missing GDPR rights:
  ```
  ## Your Rights

  Under the General Data Protection Regulation (GDPR), you have the following rights:

  - **Access (Art. 15)** — Request a copy of all personal data we hold about you
  - **Rectification (Art. 16)** — Update or correct your profile information at any time
  - **Erasure (Art. 17)** — Request complete removal of your account and identifiable data
    ("right to be forgotten")
  - **Data Portability (Art. 20)** — Export your data in a machine-readable format (JSON)
  - **Object (Art. 21)** — Stop processing your data for specific purposes (e.g., analytics,
    marketing) without deleting your entire account
  - **Restrict Processing (Art. 18)** — Temporarily limit how we process your data while
    we verify accuracy or address your concerns
  - **Withdraw Consent (Art. 7(3))** — If processing is based on consent, you can withdraw
    it at any time (e.g., opt out of ML training while keeping your account)

  **Important:** Some rights have limitations. For example:
  - Anonymized data already incorporated into ML models cannot be removed (it's no longer
    identifiable)
  - We may retain certain data for legal compliance (e.g., financial records, audit logs)

  To exercise any of these rights, contact us at privacy@claritypledge.com. We will respond
  within 30 days as required by GDPR.
  ```

- **Add "Supervisory Authority" section** — Add after "Your Rights":
  ```
  ## Filing a Complaint

  If you believe we have not handled your personal data correctly or violated your GDPR rights,
  you have the right to lodge a complaint with a supervisory authority under GDPR Article 77.

  **For EU residents:**
  - **Estonian Data Protection Inspectorate (Andmekaitse Inspektsioon)** — www.aki.ee/en
  - Or your local supervisory authority in your country of residence

  You can also contact us directly at privacy@claritypledge.com to resolve any concerns
  before filing a complaint.
  ```

- **Add "Automated Decision-Making" section** — Add before "Changes to This Policy":
  ```
  ## Automated Decision-Making

  We do not use automated decision-making or profiling that produces legal effects or
  significantly affects you (GDPR Article 22).

  Our AI/ML features are used to:
  - Verify understanding during Live Meetings (with human review)
  - Improve transcription and paraphrasing quality
  - Analyze usage patterns for service improvement

  No automated decisions are made about your account status, access, or rights without
  human oversight.
  ```

- **Add "Anonymization Process" clarification** — Add to "AI & Machine Learning" section:
  ```
  **Anonymization process:** Before using data for ML training, we remove all personal
  identifiers including names, email addresses, user IDs, and IP addresses. This makes
  it impossible to trace the data back to you. Once anonymized, this data is no longer
  considered "personal data" under GDPR and cannot be deleted via data deletion requests.
  ```

### 2. Update Terms of Service

**File:** [src/app/pages/terms-of-service-page.tsx](../../../src/app/pages/terms-of-service-page.tsx)

**Changes:**

- **Welcome section** — Add after first paragraph:
  ```
  The Clarity Pledge is operated by TechSalesBox OÜ (registry code 14832496),
  an Estonian limited liability company. These terms constitute a legal agreement
  between you and TechSalesBox OÜ.
  ```

- **Update "Live Meetings" section** — Replace existing text with GDPR-compliant version:
  ```
  ## Live Meetings (Clarity Sessions)

  Live Meetings are real-time understanding exercises between two participants.

  **Important:** Before any recording starts, you will be asked for explicit consent via
  a separate consent dialog. By clicking "Start Recording," you explicitly consent to:

  - Your voice being **recorded** during understanding exercises
  - Session content (ideas, paraphrases, ratings) being **stored**
  - Recordings being used to **improve our AI/ML services** (anonymized)

  **This consent is separate from accepting these Terms of Service.** Simply using the
  platform does NOT constitute consent to recording. You must actively consent before
  each session.

  By participating in Live Meetings, you also agree that:
  - Other participants can see your **display name** and hear your voice
  - Sessions are **not end-to-end encrypted**
  - You are responsible for obtaining consent from anyone whose voice may be captured
    in your environment
  ```

- **Add Age Verification section** — Add after "Your Responsibilities":
  ```
  ## Age Requirement

  You must be at least 16 years old to use The Clarity Pledge. If you are under 16,
  you may only use this service with verifiable parental or guardian consent as required
  by GDPR Article 8.

  By using this service, you confirm that you meet this age requirement or have obtained
  appropriate parental consent.
  ```

- **Governing Law section** (new) — Add before "Changes to These Terms":
  ```
  ## Governing Law

  These terms are governed by the laws of Estonia. Any disputes arising from your use
  of The Clarity Pledge shall be resolved under Estonian jurisdiction.

  For EU consumers, this does not affect your statutory rights under the consumer
  protection laws of your country of residence.
  ```

### 3. Add Footer Component

**File:** Create [src/app/components/layout/legal-footer.tsx](../../../src/app/components/layout/legal-footer.tsx)

```tsx
export function LegalFooter() {
  return (
    <footer className="border-t border-border py-8 mt-16">
      <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
        <p>
          Operated by{" "}
          <span className="font-medium text-foreground">TechSalesBox OÜ</span>
          {" "}(Registry: 14832496)
        </p>
        <p className="mt-2">
          <Link to="/privacy-policy" className="hover:text-blue-600">Privacy Policy</Link>
          {" · "}
          <Link to="/terms-of-service" className="hover:text-blue-600">Terms of Service</Link>
        </p>
      </div>
    </footer>
  );
}
```

**Integration:** Add `<LegalFooter />` to [src/app/layouts/clarity-landing-layout.tsx](../../../src/app/layouts/clarity-landing-layout.tsx) before closing `</div>`.

### 4. Update Legal Last Updated Date

**File:** [src/app/content/copy.ts](../../../src/app/content/copy.ts)

```typescript
export const COPY = {
  // ... existing
  LEGAL_LAST_UPDATED: "January 6, 2026", // Updated for TechSalesBox OÜ transition
};
```

---

## Acceptance Criteria

**Legal Entity & Footer:**
- [ ] Privacy Policy clearly states TechSalesBox OÜ as data controller with registry number
- [ ] Terms of Service lists TechSalesBox OÜ as operator and includes Estonian governing law
- [ ] Footer displays company name and registry number on all pages
- [ ] Legal last-updated date reflects today (2026-01-06)
- [ ] No broken links or styling issues

**GDPR Compliance (Privacy Policy):**
- [ ] "Data Controller" section includes DPO exemption explanation
- [ ] "Legal Basis for Processing" section lists Art. 6(1)(a), (b), (f) with clear examples
- [ ] "International Data Transfers" section discloses SCCs and data residency
- [ ] "Data Retention" section specifies retention periods for all data types
- [ ] "Your Rights" section includes all 7 GDPR rights (access, rectification, erasure, portability, object, restrict, withdraw consent)
- [ ] "Filing a Complaint" section links to Estonian DPA (www.aki.ee/en)
- [ ] "Automated Decision-Making" section clarifies no legal/significant effects
- [ ] "AI & Machine Learning" section explains anonymization process

**GDPR Compliance (Terms of Service):**
- [ ] "Live Meetings" section clarifies consent is SEPARATE from ToS acceptance
- [ ] "Age Requirement" section states 16+ with parental consent option
- [ ] "Governing Law" section includes consumer rights protection clause

**Visual & Functional:**
- [ ] All sections render correctly with proper spacing and typography
- [ ] External links (www.aki.ee/en) open in new tab
- [ ] Mobile view: all text readable, no overflow
- [ ] Preview in dev environment looks professional and trustworthy

---

## Testing Checklist

**Privacy Policy (`/privacy-policy`):**
- [ ] Overview section mentions TechSalesBox OÜ (registry code 14832496)
- [ ] "Data Controller" section present with DPO exemption explanation
- [ ] "Legal Basis for Processing" section lists 3 legal grounds (contractual, consent, legitimate interest)
- [ ] "International Data Transfers" section mentions SCCs and EU data storage
- [ ] "Data Retention" section shows specific retention periods (30 days, 90 days, 12 months, etc.)
- [ ] "Your Rights" section lists 7 GDPR rights with article numbers
- [ ] "Filing a Complaint" section links to www.aki.ee/en
- [ ] "Automated Decision-Making" section explains no legal effects
- [ ] "AI & Machine Learning" section includes anonymization explanation
- [ ] Last updated date shows "January 6, 2026"

**Terms of Service (`/terms-of-service`):**
- [ ] Welcome section mentions TechSalesBox OÜ (registry code 14832496)
- [ ] "Live Meetings" section clarifies consent is SEPARATE from ToS
- [ ] "Age Requirement" section states 16+ requirement
- [ ] "Governing Law" section mentions Estonian law + consumer rights protection
- [ ] Last updated date shows "January 6, 2026"

**Footer (All Pages):**
- [ ] Homepage (`/`) → footer shows "Operated by TechSalesBox OÜ (Registry: 14832496)"
- [ ] Pledger profile (`/p/:slug`) → footer present
- [ ] Live Meeting page → footer present
- [ ] About page (`/about`) → footer present
- [ ] Mobile view: footer text readable, not cut off

**Links & Navigation:**
- [ ] Privacy Policy link in footer works
- [ ] Terms of Service link in footer works
- [ ] Estonian DPA link (www.aki.ee/en) opens in new tab
- [ ] No 404 errors or broken anchors

---

## Non-Goals (Out of Scope)

**Infrastructure:**
- Setting up `privacy@claritypledge.com` email (can use `support@` for now, or alias)
- Updating GitHub README (not necessary - developer-facing only)
- Creating separate "About the Company" page (not needed)

**Regulatory:**
- Registering with Estonian Data Protection Inspectorate (only required for large-scale operations)
- Appointing formal Data Protection Officer (exempt under GDPR Art. 37 for <10k users)
- Cookie consent banner (can be added in Phase 2 - see P37.2)
- Cyber liability insurance (wait for revenue/funding)
- Data Processing Impact Assessment (DPIA) — only required for "high risk" processing (you're low risk initially)

**Technical Implementation:**
- Consent logging implementation (covered in P37.2 Phase 1)
- Data export/deletion endpoints (covered in P37.2 Phase 2)
- Automatic data deletion cron jobs (covered in P37.2 Phase 3)

**Note:** This task focuses on **legal documentation** (Privacy Policy, ToS, footer). Technical implementation of GDPR features (consent dialogs, logging, export/deletion) is handled in P37.2.

---

## Dependencies

None — this is foundational legal work.

---

## Follow-Up Work

After P37.1 is complete, proceed to **P37.2: GDPR Compliance (Consent & User Rights)**.

---

## Notes

### Business & Legal Structure

- **Why Estonia?** TechSalesBox OÜ is already established with e-Residency. EU entity = natural fit for GDPR compliance.
- **Why not 22minds LLC?** US entity complicates GDPR (Schrems II issues). Estonian company is simpler for EU privacy laws.
- **Open source consideration:** Legal entity change doesn't affect open source license (AGPL-3.0 remains).

### GDPR Compliance for Bootstrapped Startups

**Do I need a DPO as CEO?**
- **No.** GDPR Art. 37 only requires a DPO if:
  1. You're a public authority (you're not)
  2. Core activities involve large-scale systematic monitoring (not yet - you're under 100 users)
  3. Core activities involve large-scale processing of special category data (voice recording is a feature, not your core business)

**What you DO need:**
- A **data protection contact point** (privacy@claritypledge.com) — can be you as CEO
- Clear statement that DPO is not required (builds trust, shows you understand GDPR)
- Ability to respond to GDPR requests within 30 days

**When to appoint a DPO:**
- When you hit 10,000+ regular users
- When voice recording becomes your primary business model
- When Estonian DPA recommends it (unlikely for SMEs)

### GDPR Compliance Checklist (What You Actually Need)

**Mandatory (Before ANY Public Recordings):**
- ✅ Legal entity disclosed as data controller (this task)
- ✅ Legal basis for processing specified (this task)
- ✅ User rights documented (this task)
- ✅ Explicit consent for voice recording (P37.2 Phase 1)
- ✅ Consent logging with audit trail (P37.2 Phase 1)

**High Priority (Before 50-100 Users):**
- ✅ Data retention periods specified (this task)
- ✅ International transfers disclosed (this task)
- ✅ Right to complaint documented (this task)
- ⏳ Data export functionality (P37.2 Phase 2)
- ⏳ Data deletion functionality (P37.2 Phase 2)

**Nice-to-Have (Future):**
- Cookie consent banner (when analytics becomes significant)
- DPIA (Data Protection Impact Assessment) — only if "high risk" processing
- Registration with Estonian DPA (only for large-scale operations)
- Cyber liability insurance (when you have revenue)

### Common GDPR Myths (Debunked)

❌ **MYTH:** "I need a lawyer to be GDPR compliant"
✅ **REALITY:** For a bootstrapped startup with <100 users, clear documentation + good faith compliance is sufficient. Lawyer review is nice-to-have, not mandatory.

❌ **MYTH:** "GDPR is too expensive for bootstrapped startups"
✅ **REALITY:** Basic compliance costs $0 if you use EU services (Supabase EU, Google Cloud EU) and write your own policies.

❌ **MYTH:** "I need to register with a Data Protection Authority"
✅ **REALITY:** Registration is only required in specific cases (e.g., large-scale processing of special categories). Most startups are exempt.

❌ **MYTH:** "Cookie consent banners are mandatory"
✅ **REALITY:** Only for non-essential cookies. If you only use auth cookies, you don't need a banner. Analytics cookies (Mixpanel) can rely on "legitimate interest" initially, though explicit consent is better.

❌ **MYTH:** "I can't use Google Cloud / US services"
✅ **REALITY:** You can, if they provide Standard Contractual Clauses (SCCs) and you disclose the transfer. Google Cloud offers EU data residency.

### Risk Assessment

**Likelihood of GDPR complaint at <100 users:** Very low
- Most complaints come from large-scale platforms
- Users are more forgiving of early-stage products
- Key: Be transparent and responsive

**Likelihood of DPA investigation:** Very low
- DPAs focus on large-scale violations (Facebook, Google, etc.)
- Small startups get warnings first, not fines
- Key: Show good faith effort to comply

**Max fine if you mess up:** €20M or 4% of global turnover (whichever is higher)
- **Reality for bootstrapped startup:** First offense = warning letter
- Fines only come after repeated violations + refusal to fix
- Key: Fix issues quickly if contacted by DPA

### Practical Advice from GDPR Compliance Expert

1. **Focus on documentation first** — Well-written Privacy Policy + ToS covers 80% of compliance
2. **Use EU services where possible** — Simpler than managing cross-border transfers
3. **Log consent explicitly** — Saves you if challenged (proof of consent is gold)
4. **Respond to requests quickly** — 30-day deadline is non-negotiable
5. **Don't overthink it** — GDPR is designed for Facebook-scale, not your 50-user MVP

**When to worry:**
- You hit 10,000+ active users → Consider lawyer review
- You get your first DPA inquiry → Respond immediately, hire lawyer
- You have a data breach → 72-hour notification required (GDPR Art. 33)

**When NOT to worry:**
- User asks for data export → Just email them a JSON file (no fancy portal needed)
- You change Privacy Policy → Update doc + notify users via email (no lawyer needed)
- You're not sure about a technical detail → Good faith effort is enough at this stage
