import { supabaseAdmin } from './supabase-admin';

export interface TestAgreement {
  id: string;
  invitationToken: string;
  displayId: string;
}

export async function createTestAgreement(
  creatorProfileId: string,
  partnerEmail: string,
  overrides?: Partial<{
    partnerProfileId: string;
    status: string;
    visibility: string;
    termsText: string;
    invitationExpiresAt: string;
    invitationToken: string;
    partnerSignedAt: string;
  }>
): Promise<TestAgreement> {
  const { data, error } = await supabaseAdmin
    .from('clarity_agreements')
    .insert({
      creator_profile_id: creatorProfileId,
      partner_email: partnerEmail,
      terms_text: overrides?.termsText ?? 'We commit to at least one /live session per month.',
      status: overrides?.status ?? 'pending',
      visibility: overrides?.visibility ?? 'private',
      ...(overrides?.partnerProfileId && { partner_profile_id: overrides.partnerProfileId }),
      ...(overrides?.invitationExpiresAt && { invitation_expires_at: overrides.invitationExpiresAt }),
      ...(overrides?.invitationToken && { invitation_token: overrides.invitationToken }),
      ...(overrides?.partnerSignedAt && { partner_signed_at: overrides.partnerSignedAt }),
    })
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to create test agreement: ${error?.message}`);

  return {
    id: data.id,
    invitationToken: data.invitation_token,
    displayId: data.display_id,
  };
}

export async function deleteTestAgreement(id: string): Promise<void> {
  await supabaseAdmin.from('clarity_agreements').delete().eq('id', id);
}
