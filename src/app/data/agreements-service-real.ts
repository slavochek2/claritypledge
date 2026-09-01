import type {
  AgreementsService,
  AgreementParty,
  ClarityAgreement,
  CreateAgreementInput,
  AcceptAgreementInput,
  AgreementStatus,
  AgreementVisibility,
  ProfileSearchResult,
} from './agreements-service.interface';
import { supabase } from '@/lib/supabase';
import { invokeAgreementEmails } from '@/lib/agreement-emails';
import { logDbError } from './db-error-logger';
import { CURRENT_AGREEMENT_VERSION, type AgreementVersion } from '@/app/content/agreement-versions';

// Debug logging - only in development
const DEBUG = import.meta.env.DEV;
// eslint-disable-next-line no-console -- gated by DEBUG (import.meta.env.DEV); dev-only diagnostic (P1200)
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
  // P1222: partner_email and invitation_token are party-only columns. Public reads
  // go through the column-scoped RPCs (get_public_agreement /
  // get_public_agreements_for_profile), which never return them — so both are
  // optional on the row type and map to '' when absent.
  partner_email?: string;
  partner_display_name: string | null;  // P466
  terms_text: string;
  status: string;
  visibility: string;
  invitation_token?: string;
  invitation_expires_at: string;
  created_at: string;
  partner_signed_at: string | null;
  terminated_at: string | null;
  terminated_by: string | null;
  agreement_version: string;  // P857/P928: TEXT column, 'legacy' | '4' | '5'
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

// P1222: PostgREST reports a function absent from its schema cache as PGRST202.
// The two P1222 readers ship in client-safe migrations that must be on prod
// BEFORE this client; the callers below fall back to the pre-P1222 table read
// for exactly that release window and nothing else.
function isRpcMissing(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'PGRST202';
}

// P857: map the DB TEXT column to the typed union. Unknown/future values fall
// back to 'legacy' (the DB CHECK should reject them; this guards the read path
// too). Expand this whenever a new version is added to AGREEMENT_VERSIONS + the
// migration CHECK — keep these three upgrade points in sync.
function toAgreementVersion(raw: string | null | undefined): AgreementVersion {
  if (raw === '5') return 5;
  if (raw === '4') return 4;
  return 'legacy';
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
    partnerEmail: row.partner_email ?? '',
    partnerDisplayName: row.partner_display_name ?? null,
    termsText: row.terms_text,
    status: row.status as AgreementStatus,
    visibility: row.visibility as AgreementVisibility,
    invitationToken: row.invitation_token ?? '',
    invitationExpiresAt: row.invitation_expires_at,
    createdAt: row.created_at,
    partnerSignedAt: row.partner_signed_at ?? null,
    terminatedAt: row.terminated_at ?? null,
    terminatedBy: row.terminated_by ?? null,
    // P857: DB stores TEXT; normalize to the typed union (see toAgreementVersion).
    agreementVersion: toAgreementVersion(row.agreement_version),
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
    logDbError('fetchProfilesById', error);
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
    log('createAgreement:', input.partnerProfileId ?? input.partnerEmail);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      log('ERROR: createAgreement: No authenticated user');
      return null;
    }

    // P878 (AD-6): picker-selected partner — address by profile_id. The RPC resolves the
    // partner email in-DB (scope-gated) and runs the self/duplicate guards server-side.
    if (input.partnerProfileId) {
      const { data: rpcRows, error: rpcError } = await supabase
        .rpc('create_agreement_with_profile', {
          p_partner_profile_id: input.partnerProfileId,
          p_partner_display_name: input.partnerDisplayName ?? null,
          p_terms_text: input.termsText,
          p_visibility: input.visibility,
          p_agreement_version: String(CURRENT_AGREEMENT_VERSION),
        });

      const rpcRow = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
      if (rpcError || !rpcRow) {
        logDbError('createAgreement(profile)', rpcError);
        return null;
      }

      const createdRow = rpcRow as DbAgreementRow;
      invokeAgreementEmails('invitation', createdRow.id);

      const { data: creatorRow } = await supabase
        .from('profiles')
        .select('id, name, slug, avatar_color, avatar_url, has_pledged')
        .eq('id', user.id)
        .single();

      return mapDbRowToAgreement(
        createdRow,
        creatorRow ? mapDbRowToAgreementParty(creatorRow as DbProfile) : null,
        null
      );
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
        partner_display_name: input.partnerDisplayName ?? null,
        terms_text: input.termsText,
        visibility: input.visibility,
        // P857: stamp the current version server-side (never from client input).
        // String() so the number key 4 (Stage B) writes as TEXT '4', matching the
        // column type + CHECK ('legacy' | '4').
        agreement_version: String(CURRENT_AGREEMENT_VERSION),
      })
      .select('*')
      .single();

    if (error || !created) {
      logDbError('createAgreement', error);
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

  async acceptAgreement(input: AcceptAgreementInput): Promise<boolean> {
    log('acceptAgreement:', input.agreementId);

    const { data, error } = await supabase.rpc('accept_agreement', {
      p_agreement_id: input.agreementId,
      p_token: input.token,
      p_partner_id: input.partnerId,
      p_partner_display_name: input.partnerDisplayName ?? null,
    });

    if (error) {
      logDbError('acceptAgreement', error);
      return false;
    }
    return data === true;
  },

  async getAgreement(id: string): Promise<ClarityAgreement | null> {
    log('getAgreement:', id);

    // P1222: the table policy is parties-only. A party (creator/partner, or the
    // pending invitee by email) gets the full row here; anyone else gets nothing
    // and falls through to the column-scoped public RPC, which returns the row
    // only when visibility='public' and never returns partner_email or
    // invitation_token.
    const { data, error } = await supabase
      .from('clarity_agreements')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    let row: DbAgreementRow | null = null;
    let isPartyRead = false;

    if (error) {
      log('getAgreement table read error:', error);
    } else if (data) {
      row = data as DbAgreementRow;
      isPartyRead = true;
    }

    if (!row) {
      const { data: publicRows, error: rpcError } = await supabase
        .rpc('get_public_agreement', { p_id: id });
      if (rpcError) {
        log('getAgreement public RPC error:', rpcError);
      }
      const publicRow = (publicRows as DbAgreementRow[] | null)?.[0] ?? null;
      if (!publicRow) {
        log('getAgreement not found:', id);
        return null;
      }
      row = publicRow;
    }

    // Lazy expiry: if pending and past expiry date, mark expired.
    // Only a party can write this (UPDATE policy); a public reader just sees
    // the computed status.
    if (row.status === 'pending' && new Date(row.invitation_expires_at) < new Date()) {
      if (!isPartyRead) {
        row.status = 'expired';
      } else {
        const { error: updateError } = await supabase
          .from('clarity_agreements')
          .update({ status: 'expired' })
          .eq('id', id);

        if (!updateError) {
          row.status = 'expired';
        }
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

    // H2 fix: use SECURITY DEFINER RPC instead of direct table read.
    // The old SELECT policy exposed all pending agreements to anon users.
    const { data, error } = await supabase
      .rpc('get_agreement_by_token', { p_token: token });

    if (error || !data || (data as DbAgreementRow[]).length === 0) {
      log('getAgreementByToken not found or expired:', error);
      return null;
    }

    const row = (data as DbAgreementRow[])[0];

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

    let rows: DbAgreementRow[];

    if (isOwner) {
      // Owner: active, pending, terminated (not declined, not expired — those are noise).
      // The owner is a party to every row here, so the table read is complete.
      const { data, error } = await supabase
        .from('clarity_agreements')
        .select('*')
        .or(`creator_profile_id.eq.${profileId},partner_profile_id.eq.${profileId}`)
        .in('status', ['active', 'pending', 'terminated']);

      if (error || !data) {
        logDbError('getAgreementsForProfile', error);
        return [];
      }
      rows = data as DbAgreementRow[];
    } else {
      // P1222: visitors (anonymous or signed-in non-owner) read the public active
      // agreements through the column-scoped RPC — the table policy is parties-only,
      // so a direct select would return nothing for them. A signed-in visitor who is
      // party to some of this profile's agreements still sees those via the table
      // (RLS filters to their own rows); the two sets are unioned by id.
      const { data: publicData, error: rpcError } = await supabase
        .rpc('get_public_agreements_for_profile', { p_profile_id: profileId });

      const byId = new Map<string, DbAgreementRow>();

      if (rpcError && isRpcMissing(rpcError)) {
        // Release window: reader not yet on this database — the pre-P1222 table
        // read still returns public active rows until the policy migration lands.
        const { data: legacy, error: legacyError } = await supabase
          .from('clarity_agreements')
          .select('*')
          .or(`creator_profile_id.eq.${profileId},partner_profile_id.eq.${profileId}`)
          .eq('status', 'active')
          .eq('visibility', 'public');
        if (legacyError) logDbError('getAgreementsForProfile.legacy', legacyError);
        for (const r of (legacy as DbAgreementRow[] | null) ?? []) byId.set(r.id, r);
      } else {
        if (rpcError) logDbError('getAgreementsForProfile.public', rpcError);
        for (const r of (publicData as DbAgreementRow[] | null) ?? []) byId.set(r.id, r);
      }

      if (viewerProfileId) {
        const { data: partyData, error: partyError } = await supabase
          .from('clarity_agreements')
          .select('*')
          .or(`creator_profile_id.eq.${profileId},partner_profile_id.eq.${profileId}`)
          .or(`creator_profile_id.eq.${viewerProfileId},partner_profile_id.eq.${viewerProfileId}`);

        if (partyError) {
          logDbError('getAgreementsForProfile.party', partyError);
        }
        for (const r of (partyData as DbAgreementRow[] | null) ?? []) byId.set(r.id, r);
      }

      rows = Array.from(byId.values());
    }

    if (rows.length === 0) return [];

    // C2: check-at-read expiry — presentation layer only, no DB write
    const now = new Date();
    rows.forEach(row => {
      if (row.status === 'pending' && new Date(row.invitation_expires_at) < now) {
        row.status = 'expired';
      }
    });

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

  async searchProfiles(query: string): Promise<ProfileSearchResult[]> {
    log('searchProfiles:', query);

    // P878: SECURITY DEFINER RPC — relationship-scoped, prefix-matched, rate-limited.
    // Never returns email/linkedin_url/reason (P877 invariant).
    const { data, error } = await supabase
      .rpc('search_profiles', { p_query: query });

    if (error || !data) {
      // Rate limit raises return as errors too — degrade to empty (picker shows empty state).
      log('searchProfiles error/empty:', error?.message);
      return [];
    }

    return (data as Array<{
      profile_id: string;
      name: string | null;
      slug: string | null;
      avatar_url: string | null;
      avatar_color: string | null;
      has_pledged: boolean | null;
      is_verified: boolean | null;
    }>).map((row) => ({
      profileId: row.profile_id,
      name: row.name ?? 'Unknown',
      slug: row.slug ?? null,
      avatarUrl: row.avatar_url ?? null,
      avatarColor: row.avatar_color ?? '#3B82F6',
      hasPledged: row.has_pledged ?? false,
      isVerified: row.is_verified ?? false,
    }));
  },

  async lookupUserByEmail(email: string): Promise<AgreementParty | null> {
    log('lookupUserByEmail:', email);

    // P877: profiles.email is revoked from authenticated; filtering on it requires
    // column SELECT priv. lookup_party_by_email (SECURITY DEFINER) resolves the email
    // to a party server-side and returns only display fields — never the email itself.
    const { data, error } = await supabase
      .rpc('lookup_party_by_email', { p_email: email });

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
      logDbError('hasActiveAgreementWith', error);
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

    // M6 fix: only allow resend for pending or expired agreements
    if (row.status !== 'pending' && row.status !== 'expired') {
      log('ERROR: resendInvitation: Cannot resend for status:', row.status);
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
      logDbError('resendInvitation', updateError);
      return false;
    }

    // Fire-and-forget
    invokeAgreementEmails('resend', agreementId);

    return true;
  },

  async cancelInvitation(agreementId: string): Promise<boolean> {
    log('cancelInvitation:', agreementId);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      log('ERROR: cancelInvitation: No authenticated user');
      return false;
    }

    const { data, error: fetchError } = await supabase
      .from('clarity_agreements')
      .select('id, creator_profile_id, status')
      .eq('id', agreementId)
      .maybeSingle();

    if (fetchError || !data) {
      log('ERROR: cancelInvitation: Agreement not found');
      return false;
    }

    const row = data as { id: string; creator_profile_id: string; status: string };
    if (row.creator_profile_id !== user.id) {
      log('ERROR: cancelInvitation: Caller is not the creator');
      return false;
    }

    if (row.status !== 'pending') {
      log('ERROR: cancelInvitation: Cannot cancel agreement with status:', row.status);
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
      logDbError('cancelInvitation', updateError);
      return false;
    }

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

    // M5 fix: only allow terminating active agreements
    if (row.status !== 'active') {
      log('ERROR: terminateAgreement: Cannot terminate agreement with status:', row.status);
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
      logDbError('terminateAgreement', updateError);
      return false;
    }

    // Fire-and-forget
    invokeAgreementEmails('terminated', agreementId);

    return true;
  },

  async getIncomingInvitations(email: string, viewerProfileId?: string | null): Promise<ClarityAgreement[]> {
    log('getIncomingInvitations:', email);

    // P933: match email-addressed (IS NULL) AND picker-addressed (pre-set profile id).
    // Validate UUID format before interpolating into the PostgREST .or() string.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const safeProfileId = viewerProfileId && UUID_RE.test(viewerProfileId) ? viewerProfileId : null;
    const profileFilter = safeProfileId
      ? `partner_profile_id.is.null,partner_profile_id.eq.${safeProfileId}`
      : 'partner_profile_id.is.null';

    // P1222: pending invitations come from get_my_pending_invitations(), which
    // requires the caller's auth email to be CONFIRMED (auth.users.email_confirmed_at)
    // — a JWT email claim alone is not possession of the inbox. The table read
    // below is the release-window fallback only: it is what a client deployed
    // before migration 20260901235000 has, and it stops returning rows once the
    // policy's email-claim branch is dropped (20260901236000).
    let rows: DbAgreementRow[];
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_my_pending_invitations');

    if (rpcError && isRpcMissing(rpcError)) {
      const { data, error } = await supabase
        .from('clarity_agreements')
        .select('*')
        .eq('status', 'pending')
        .or(profileFilter)
        .ilike('partner_email', email);

      if (error || !data) {
        logDbError('getIncomingInvitations', error);
        return [];
      }
      rows = data as DbAgreementRow[];
    } else if (rpcError) {
      logDbError('getIncomingInvitations', rpcError);
      return [];
    } else {
      // The RPC already scopes to partner_profile_id IS NULL OR = auth.uid().
      rows = (rpcData as DbAgreementRow[] | null) ?? [];
    }

    if (rows.length === 0) return [];

    // Filter out expired invitations (check-at-read, no DB write)
    const now = new Date();
    const validRows = rows.filter(row => new Date(row.invitation_expires_at) >= now);
    if (validRows.length === 0) return [];

    const allProfileIds = Array.from(new Set(validRows.map(r => r.creator_profile_id)));
    const profileMap = await fetchProfilesById(allProfileIds);

    return validRows.map(row => mapDbRowToAgreement(row, profileMap[row.creator_profile_id] ?? null, null));
  },
};
