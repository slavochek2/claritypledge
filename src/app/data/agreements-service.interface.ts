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
  termsText: string;
  visibility: AgreementVisibility;
}

export interface AgreementsService {
  createAgreement(input: CreateAgreementInput): Promise<ClarityAgreement | null>;
  getAgreement(id: string): Promise<ClarityAgreement | null>;
  getAgreementByToken(token: string): Promise<ClarityAgreement | null>;
  getAgreementsForProfile(profileId: string, viewerProfileId: string | null): Promise<ClarityAgreement[]>;
  lookupUserByEmail(email: string): Promise<AgreementParty | null>;
  hasActiveAgreementWith(creatorProfileId: string, partnerEmail: string): Promise<boolean>;
  resendInvitation(agreementId: string): Promise<boolean>;
  terminateAgreement(agreementId: string): Promise<boolean>;
}
