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
  // Joined data (populated by service, not stored in DB)
  creator: AgreementParty | null;
  partner: AgreementParty | null;
}

export interface CreateAgreementInput {
  partnerEmail: string;
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
  hasActiveAgreementWith(creatorProfileId: string, partnerEmail: string): Promise<boolean>;
  resendInvitation(agreementId: string): Promise<boolean>;
  terminateAgreement(agreementId: string): Promise<boolean>;
}
