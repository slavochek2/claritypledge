import type { AgreementsService, ClarityAgreement, AgreementParty, AcceptAgreementInput } from './agreements-service.interface';
import { CURRENT_AGREEMENT_VERSION } from '@/app/content/agreement-versions';

const MOCK_PARTY_A: AgreementParty = {
  profileId: 'mock-user-a',
  name: 'Alex Chen',
  slug: 'alex-chen',
  avatarColor: '#0044CC',
  avatarUrl: null,
  hasPledged: true,
};

const MOCK_PARTY_B: AgreementParty = {
  profileId: 'mock-user-b',
  name: 'Jordan Rivera',
  slug: 'jordan-rivera',
  avatarColor: '#002B5C',
  avatarUrl: null,
  hasPledged: false,
};

const MOCK_AGREEMENTS: ClarityAgreement[] = [
  {
    id: 'mock-agreement-1',
    displayId: 'A-0001',
    creatorProfileId: 'mock-user-a',
    partnerProfileId: 'mock-user-b',
    partnerEmail: 'jordan@example.com',
    partnerDisplayName: null,
    termsText:
      'We agree to communicate with honesty and care. We will give each other direct, calibrated feedback without softening or exaggerating. We will flag when we notice miscalibration and receive that feedback with openness.',
    status: 'active',
    visibility: 'private',
    invitationToken: 'mock-token-active-001',
    invitationExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    partnerSignedAt: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString(),
    terminatedAt: null,
    terminatedBy: null,
    agreementVersion: 'legacy',
    creator: MOCK_PARTY_A,
    partner: MOCK_PARTY_B,
  },
  {
    id: 'mock-agreement-2',
    displayId: 'A-0002',
    creatorProfileId: 'mock-user-a',
    partnerProfileId: null,
    partnerEmail: 'taylor@example.com',
    partnerDisplayName: null,
    termsText:
      'We commit to practicing calibrated communication in our coaching sessions. Direct, honest, and kind — always.',
    status: 'pending',
    visibility: 'public',
    invitationToken: 'mock-token-pending-002',
    invitationExpiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    partnerSignedAt: null,
    terminatedAt: null,
    terminatedBy: null,
    agreementVersion: 'legacy',
    creator: MOCK_PARTY_A,
    partner: null,
  },
];

let _nextDisplayId = 3;

export const mockAgreementsService: AgreementsService = {
  async createAgreement(input) {
    const id = `mock-agreement-${Date.now()}`;
    const displayId = `A-${String(_nextDisplayId++).padStart(4, '0')}`;
    const agreement: ClarityAgreement = {
      id,
      displayId,
      creatorProfileId: 'mock-user-a',
      partnerProfileId: null,
      partnerEmail: input.partnerEmail,
      partnerDisplayName: input.partnerDisplayName ?? null,
      termsText: input.termsText,
      status: 'pending',
      visibility: input.visibility,
      invitationToken: `mock-token-new-${Date.now()}`,
      invitationExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      partnerSignedAt: null,
      terminatedAt: null,
      terminatedBy: null,
      agreementVersion: CURRENT_AGREEMENT_VERSION,
      creator: MOCK_PARTY_A,
      partner: null,
    };
    MOCK_AGREEMENTS.push(agreement);
    return agreement;
  },

  async acceptAgreement(input: AcceptAgreementInput) {
    const agreement = MOCK_AGREEMENTS.find(a => a.id === input.agreementId);
    if (!agreement) return false;
    agreement.status = 'active';
    agreement.partnerProfileId = input.partnerId;
    agreement.partnerSignedAt = new Date().toISOString();
    if (input.partnerDisplayName !== undefined) {
      agreement.partnerDisplayName = input.partnerDisplayName;
    }
    return true;
  },

  async getAgreement(id) {
    return MOCK_AGREEMENTS.find(a => a.id === id) ?? null;
  },

  async getAgreementByToken(token) {
    const agreement = MOCK_AGREEMENTS.find(a => a.invitationToken === token);
    if (!agreement || agreement.status !== 'pending') return null;
    return agreement;
  },

  async getAgreementsForProfile(profileId, _viewerProfileId) {
    return MOCK_AGREEMENTS.filter(
      a => a.creatorProfileId === profileId || a.partnerProfileId === profileId,
    );
  },

  async lookupUserByEmail(email) {
    if (email.toLowerCase().includes('jordan')) return MOCK_PARTY_B;
    return null;
  },

  async hasActiveAgreementWith(_creatorProfileId, _partnerEmail) {
    return false;
  },

  async resendInvitation(_agreementId) {
    return true;
  },

  async cancelInvitation(agreementId) {
    const agreement = MOCK_AGREEMENTS.find(a => a.id === agreementId);
    if (!agreement || agreement.status !== 'pending') return false;
    agreement.status = 'terminated';
    agreement.terminatedAt = new Date().toISOString();
    agreement.terminatedBy = 'mock-user-a';
    return true;
  },

  async terminateAgreement(agreementId) {
    const agreement = MOCK_AGREEMENTS.find(a => a.id === agreementId);
    if (!agreement) return false;
    agreement.status = 'terminated';
    agreement.terminatedAt = new Date().toISOString();
    agreement.terminatedBy = 'mock-user-a';
    return true;
  },

  async getIncomingInvitations(_email) {
    return [];
  },
};
