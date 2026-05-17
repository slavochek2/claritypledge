import type { PersonRef } from "@/app/types";
import { GravatarAvatar } from "./gravatar-avatar";

const DEFAULT_AVATAR_COLOR = '#3B82F6';

interface PersonAvatarProps {
  person: PersonRef;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * P118: Canonical component for rendering a person's avatar.
 * Ensures pledge badge (blue ring) displays consistently everywhere.
 *
 * Use this instead of inline divs or direct GravatarAvatar calls
 * when rendering any person's avatar. The PersonRef type enforces
 * that hasPledged is always present.
 */
export function PersonAvatar({ person, size = "md", className }: PersonAvatarProps) {
  return (
    <span data-testid="person-avatar" className="inline-flex">
      <GravatarAvatar
        name={person.name}
        avatarColor={person.avatarColor ?? DEFAULT_AVATAR_COLOR}
        photoUrl={person.avatarUrl ?? undefined}
        size={size}
        isPledger={person.hasPledged}
        className={className}
      />
    </span>
  );
}
