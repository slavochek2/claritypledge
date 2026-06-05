import type { AgreementVersion } from '@/app/content/agreement-versions';

export type AgreementStatus = 'pending' | 'active' | 'declined' | 'expired' | 'terminated';
export type AgreementVisibility = 'private' | 'public';

export interface AgreementParty {
  profileId: string;
  name: string;
  slug: string | null;
  avatarColor: string;
  avatarUrl: string | null;
  hasPledged: boolean;
}

export interface ClarityAgreement {
  id: string;
  displayId: string;           // e.g. "A-0042"
  creatorProfileId: string;
  partnerProfileId: string | null;
  partnerEmail: string;
  partnerDisplayName: string | null;  // P466: creator-set display name
  termsText: string;
  status: AgreementStatus;
  visibility: AgreementVisibility;
  invitationToken: string;
  invitationExpiresAt: string;
  createdAt: string;
  partnerSignedAt: string | null;
  terminatedAt: string | null;
  terminatedBy: string | null;
  agreementVersion?: AgreementVersion;  // P857: pinned oath version ('legacy' | 4)
  // Joined data (populated by service, not stored in DB)
  creator: AgreementParty | null;
  partner: AgreementParty | null;
}

// P878: relationship-scoped people-picker search result. Display-safe fields ONLY —
// the search_profiles RPC never returns email (P877 invariant).
export interface ProfileSearchResult {
  profileId: string;
  name: string;
  slug: string | null;
  avatarUrl: string | null;
  avatarColor: string;
  hasPledged: boolean;
  isVerified: boolean;
}

export interface CreateAgreementInput {
  partnerEmail: string;
  // P878 (AD-6): when set, the partner was picked by profile_id — the
  // create_agreement_with_profile RPC resolves the email in-DB and partnerEmail is ignored.
  partnerProfileId?: string;
  partnerDisplayName?: string;  // P466: optional creator-set display name
  termsText: string;
  visibility: AgreementVisibility;
}

export interface AcceptAgreementInput {
  agreementId: string;
  token: string;
  partnerId: string;
  partnerDisplayName?: string;  // P466: partner can confirm/edit their name
}

export interface AgreementsService {
  createAgreement(input: CreateAgreementInput): Promise<ClarityAgreement | null>;
  acceptAgreement(input: AcceptAgreementInput): Promise<boolean>;
  getAgreement(id: string): Promise<ClarityAgreement | null>;
  getAgreementByToken(token: string): Promise<ClarityAgreement | null>;
  getAgreementsForProfile(profileId: string, viewerProfileId: string | null): Promise<ClarityAgreement[]>;
  lookupUserByEmail(email: string): Promise<AgreementParty | null>;
  /** P878: relationship-scoped name/slug prefix search (min 3 chars, ≤8 results). */
  searchProfiles(query: string): Promise<ProfileSearchResult[]>;
  hasActiveAgreementWith(creatorProfileId: string, partnerEmail: string): Promise<boolean>;
  resendInvitation(agreementId: string): Promise<boolean>;
  cancelInvitation(agreementId: string): Promise<boolean>;
  terminateAgreement(agreementId: string): Promise<boolean>;
  /** Pending agreements addressed to `email` that haven't been accepted yet. */
  getIncomingInvitations(email: string): Promise<ClarityAgreement[]>;
}
