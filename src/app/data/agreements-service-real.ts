import type {
  AgreementsService,
  AgreementParty,
  ClarityAgreement,
  CreateAgreementInput,
  AgreementStatus,
  AgreementVisibility,
} from './agreements-service.interface';
import { supabase } from '@/lib/supabase';
import { invokeAgreementEmails } from '@/lib/agreement-emails';

// Debug logging - only in development
const DEBUG = import.meta.env.DEV;
const log = (...args: unknown[]) => DEBUG && console.log('[agreements-service-real]', ...args);

// ── DB row types ──────────────────────────────────────────────────────────────

interface DbProfile {
  id: string;
  name: string | null;
  slug: string | null;
  avatar_color: string | null;
  avatar_url: string | null;
  has_pledged: boolean | null;
  email?: string | null;
}

interface DbAgreementRow {
  id: string;
  display_id: string | null;
  creator_profile_id: string;
  partner_profile_id: string | null;
  partner_email: string;
  terms_text: string;
  status: string;
  visibility: string;
  invitation_token: string;
  invitation_expires_at: string;
  created_at: string;
  partner_signed_at: string | null;
  terminated_at: string | null;
  terminated_by: string | null;
}

// ── Private helpers ───────────────────────────────────────────────────────────

function mapDbRowToAgreementParty(row: DbProfile): AgreementParty {
  return {
    profileId: row.id,
    name: row.name ?? 'Unknown',
    slug: row.slug ?? null,
    avatarColor: row.avatar_color ?? '#3B82F6',
    avatarUrl: row.avatar_url ?? null,
    hasPledged: row.has_pledged ?? false,
  };
}

function mapDbRowToAgreement(
  row: DbAgreementRow,
  creator: AgreementParty | null,
  partner: AgreementParty | null
): ClarityAgreement {
  return {
    id: row.id,
    displayId: row.display_id ?? '',
    creatorProfileId: row.creator_profile_id,
    partnerProfileId: row.partner_profile_id ?? null,
    partnerEmail: row.partner_email,
    termsText: row.terms_text,
    status: row.status as AgreementStatus,
    visibility: row.visibility as AgreementVisibility,
    invitationToken: row.invitation_token,
    invitationExpiresAt: row.invitation_expires_at,
    createdAt: row.created_at,
    partnerSignedAt: row.partner_signed_at ?? null,
    terminatedAt: row.terminated_at ?? null,
    terminatedBy: row.terminated_by ?? null,
    creator,
    partner,
  };
}

// ── Private batch-fetch utility ───────────────────────────────────────────────

async function fetchProfilesById(
  profileIds: string[]
): Promise<Record<string, AgreementParty>> {
  if (profileIds.length === 0) return {};

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, slug, avatar_color, avatar_url, has_pledged')
    .in('id', profileIds);

  if (error || !data) {
    log('ERROR: fetchProfilesById error:', error);
    return {};
  }

  return (data as DbProfile[]).reduce<Record<string, AgreementParty>>((acc, row) => {
    acc[row.id] = mapDbRowToAgreementParty(row);
    return acc;
  }, {});
}

// ── Service implementation ────────────────────────────────────────────────────

export const realAgreementsService: AgreementsService = {
  async createAgreement(input: CreateAgreementInput): Promise<ClarityAgreement | null> {
    log('createAgreement:', input.partnerEmail);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      log('ERROR: createAgreement: No authenticated user');
      return null;
    }

    // Assert not a self-invite
    if (user.email && input.partnerEmail.toLowerCase() === user.email.toLowerCase()) {
      log('ERROR: createAgreement: Cannot invite yourself');
      return null;
    }

    // Guard against duplicates
    const isDuplicate = await realAgreementsService.hasActiveAgreementWith(user.id, input.partnerEmail);
    if (isDuplicate) {
      log('createAgreement: Duplicate agreement — returning null');
      return null;
    }

    const { data: created, error } = await supabase
      .from('clarity_agreements')
      .insert({
        creator_profile_id: user.id,
        partner_email: input.partnerEmail,
        terms_text: input.termsText,
        visibility: input.visibility,
      })
      .select('*')
      .single();

    if (error || !created) {
      log('ERROR: createAgreement insert error:', error);
      return null;
    }

    const row = created as DbAgreementRow;

    // Fire-and-forget invitation email
    invokeAgreementEmails('invitation', row.id);

    // Fetch creator profile for the returned object
    const { data: creatorProfile } = await supabase
      .from('profiles')
      .select('id, name, slug, avatar_color, avatar_url, has_pledged')
      .eq('id', user.id)
      .single();

    const creator = creatorProfile ? mapDbRowToAgreementParty(creatorProfile as DbProfile) : null;

    return mapDbRowToAgreement(row, creator, null);
  },

  async getAgreement(id: string): Promise<ClarityAgreement | null> {
    log('getAgreement:', id);

    const { data, error } = await supabase
      .from('clarity_agreements')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      log('getAgreement not found or error:', error);
      return null;
    }

    const row = data as DbAgreementRow;

    // Lazy expiry: if pending and past expiry date, mark expired
    if (row.status === 'pending' && new Date(row.invitation_expires_at) < new Date()) {
      const { error: updateError } = await supabase
        .from('clarity_agreements')
        .update({ status: 'expired' })
        .eq('id', id);

      if (!updateError) {
        row.status = 'expired';
      }
    }

    // Batch-fetch both party profiles in one query
    const profileIds = [row.creator_profile_id, row.partner_profile_id].filter(Boolean) as string[];
    const profileMap = await fetchProfilesById(profileIds);

    const creator = profileMap[row.creator_profile_id] ?? null;
    const partner = row.partner_profile_id ? (profileMap[row.partner_profile_id] ?? null) : null;

    return mapDbRowToAgreement(row, creator, partner);
  },

  async getAgreementByToken(token: string): Promise<ClarityAgreement | null> {
    log('getAgreementByToken:', token);

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('clarity_agreements')
      .select('*')
      .eq('invitation_token', token)
      .eq('status', 'pending')
      .gt('invitation_expires_at', now)
      .maybeSingle();

    if (error || !data) {
      log('getAgreementByToken not found or expired:', error);
      return null;
    }

    const row = data as DbAgreementRow;

    // Fetch creator profile
    const { data: creatorProfile } = await supabase
      .from('profiles')
      .select('id, name, slug, avatar_color, avatar_url, has_pledged')
      .eq('id', row.creator_profile_id)
      .single();

    const creator = creatorProfile ? mapDbRowToAgreementParty(creatorProfile as DbProfile) : null;

    return mapDbRowToAgreement(row, creator, null);
  },

  async getAgreementsForProfile(
    profileId: string,
    viewerProfileId: string | null
  ): Promise<ClarityAgreement[]> {
    log('getAgreementsForProfile:', { profileId, viewerProfileId });

    const isOwner = viewerProfileId === profileId;

    let query = supabase
      .from('clarity_agreements')
      .select('*')
      .or(`creator_profile_id.eq.${profileId},partner_profile_id.eq.${profileId}`);

    if (!isOwner) {
      // Non-owner: only active public agreements
      query = query.eq('status', 'active').eq('visibility', 'public');
    } else {
      // Owner: active, pending, terminated (not declined, not expired — those are noise)
      query = query.in('status', ['active', 'pending', 'terminated']);
    }

    const { data, error } = await query;

    if (error || !data) {
      log('ERROR: getAgreementsForProfile error:', error);
      return [];
    }

    const rows = data as DbAgreementRow[];

    if (rows.length === 0) return [];

    // Batch-fetch all party profiles — no N+1
    const allProfileIds = Array.from(
      new Set(
        rows.flatMap(r =>
          [r.creator_profile_id, r.partner_profile_id].filter(Boolean) as string[]
        )
      )
    );
    const profileMap = await fetchProfilesById(allProfileIds);

    // Sort: active first, then pending, then terminated
    const statusOrder: Record<string, number> = { active: 0, pending: 1, terminated: 2 };
    rows.sort((a, b) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99));

    return rows.map(row => {
      const creator = profileMap[row.creator_profile_id] ?? null;
      const partner = row.partner_profile_id ? (profileMap[row.partner_profile_id] ?? null) : null;
      return mapDbRowToAgreement(row, creator, partner);
    });
  },

  async lookupUserByEmail(email: string): Promise<AgreementParty | null> {
    log('lookupUserByEmail:', email);

    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, slug, avatar_color, avatar_url, has_pledged, email')
      .eq('email', email)
      .maybeSingle();

    if (error || !data) {
      log('lookupUserByEmail not found:', email);
      return null;
    }

    return mapDbRowToAgreementParty(data as DbProfile);
  },

  async hasActiveAgreementWith(creatorProfileId: string, partnerEmail: string): Promise<boolean> {
    log('hasActiveAgreementWith:', { creatorProfileId, partnerEmail });

    const { data, error } = await supabase
      .from('clarity_agreements')
      .select('id')
      .eq('creator_profile_id', creatorProfileId)
      .eq('partner_email', partnerEmail)
      .in('status', ['active', 'pending']);

    if (error) {
      log('ERROR: hasActiveAgreementWith error:', error);
      return false;
    }

    return (data?.length ?? 0) > 0;
  },

  async resendInvitation(agreementId: string): Promise<boolean> {
    log('resendInvitation:', agreementId);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      log('ERROR: resendInvitation: No authenticated user');
      return false;
    }

    // Fetch agreement and assert caller is the creator
    const { data, error: fetchError } = await supabase
      .from('clarity_agreements')
      .select('id, creator_profile_id, status')
      .eq('id', agreementId)
      .maybeSingle();

    if (fetchError || !data) {
      log('ERROR: resendInvitation: Agreement not found');
      return false;
    }

    const row = data as { id: string; creator_profile_id: string; status: string };
    if (row.creator_profile_id !== user.id) {
      log('ERROR: resendInvitation: Caller is not the creator');
      return false;
    }

    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: updateError } = await supabase
      .from('clarity_agreements')
      .update({
        invitation_token: crypto.randomUUID(),
        invitation_expires_at: newExpiry,
        status: 'pending',
      })
      .eq('id', agreementId);

    if (updateError) {
      log('ERROR: resendInvitation update error:', updateError);
      return false;
    }

    // Fire-and-forget
    invokeAgreementEmails('resend', agreementId);

    return true;
  },

  async terminateAgreement(agreementId: string): Promise<boolean> {
    log('terminateAgreement:', agreementId);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      log('ERROR: terminateAgreement: No authenticated user');
      return false;
    }

    // Fetch agreement and assert caller is a party
    const { data, error: fetchError } = await supabase
      .from('clarity_agreements')
      .select('id, creator_profile_id, partner_profile_id, status')
      .eq('id', agreementId)
      .maybeSingle();

    if (fetchError || !data) {
      log('ERROR: terminateAgreement: Agreement not found');
      return false;
    }

    const row = data as {
      id: string;
      creator_profile_id: string;
      partner_profile_id: string | null;
      status: string;
    };
    const isParty = row.creator_profile_id === user.id || row.partner_profile_id === user.id;

    if (!isParty) {
      log('ERROR: terminateAgreement: Caller is not a party to the agreement');
      return false;
    }

    const { error: updateError } = await supabase
      .from('clarity_agreements')
      .update({
        status: 'terminated',
        terminated_at: new Date().toISOString(),
        terminated_by: user.id,
      })
      .eq('id', agreementId);

    if (updateError) {
      log('ERROR: terminateAgreement update error:', updateError);
      return false;
    }

    // Fire-and-forget
    invokeAgreementEmails('terminated', agreementId);

    return true;
  },
};
