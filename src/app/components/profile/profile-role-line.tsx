/**
 * @file profile-role-line.tsx
 * @description The role and LinkedIn link under a profile's name. Moved verbatim out of profile-page-v2.tsx (P1556),
 * which is over its size limit and may not grow; the one change is the link passing through safeLinkHref, as every
 * new user-controlled href must (.claude/rules/src.md).
 */
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { safeLinkHref } from '@/app/prototypes/events/location-utils';

const LinkedInBrandIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

export function ProfileRoleLine({ name, role, linkedinUrl }: { name: string; role?: string | null; linkedinUrl?: string | null }) {
  if (!role && !linkedinUrl) return null;
  return (
    <div className="flex items-center gap-1.5">
      {role && <p className="text-sm text-muted-foreground break-words">{role}</p>}
      {linkedinUrl && (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={safeLinkHref(linkedinUrl)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${name}'s LinkedIn profile`}
                className="flex-shrink-0 text-[#0A66C2] opacity-60 hover:opacity-100 transition-opacity"
              >
                <LinkedInBrandIcon size={14} />
              </a>
            </TooltipTrigger>
            <TooltipContent>Open LinkedIn profile</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
