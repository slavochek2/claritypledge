/**
 * P63 + P1418: which avatar a profile keeps after sign-in.
 * - A photo the user uploaded (provider 'upload') always wins; Google never replaces it.
 * - Otherwise a Google sign-in refreshes the Google picture (P63 "auto-update on re-login").
 * - A new non-Google user gets generated initials.
 */
export type AvatarProvider = 'google' | 'generated' | 'gravatar' | 'upload';

export interface AvatarFields {
  avatarUrl?: string;
  avatarProvider?: AvatarProvider;
  avatarColor?: string;
}

export function resolveAvatarFields(
  existing: AvatarFields,
  googleAvatarUrl: string | undefined,
  isGoogleAuth: boolean,
): AvatarFields {
  if (existing.avatarProvider === 'upload') return { ...existing };
  if (isGoogleAuth && googleAvatarUrl) {
    return { avatarUrl: googleAvatarUrl, avatarProvider: 'google', avatarColor: undefined };
  }
  return { ...existing, avatarProvider: existing.avatarProvider ?? 'generated' };
}
