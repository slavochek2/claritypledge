/**
 * @file org-header.tsx
 * @description P1010: Clarity Organization page header (LinkedIn-style: name,
 * location/member-count meta, one-line blurb) with the persistent top-right CTA.
 * The member/non-member CTA swap IS the visible membership boundary (UX Notes):
 * a stranger sees "Join", a member sees "Manage membership ▾".
 */
import { UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { Organization } from "@/app/data/organizations-service.interface";

interface OrgHeaderProps {
  org: Organization;
  memberCount: number;
  isMember: boolean;
  onJoin: () => void;
  onLeave: () => void;
}

export function OrgHeader({ org, memberCount, isMember, onJoin, onLeave }: OrgHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl sm:text-3xl font-bold break-words">{org.name}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <UsersIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </span>
        </p>
        {org.blurb && (
          <p className="mt-3 max-w-prose text-base text-muted-foreground">{org.blurb}</p>
        )}
      </div>

      {/* Persistent CTA — the member/non-member swap is announced via the accessible
          name ("Join" vs "Manage membership ▾"), never color alone (WCAG 1.4.1). */}
      <div className="shrink-0">
        {isMember ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="min-h-[44px]">
                Manage membership ▾
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onLeave}>Leave</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button onClick={onJoin} className="min-h-[44px]">
            Join
          </Button>
        )}
      </div>
    </header>
  );
}
