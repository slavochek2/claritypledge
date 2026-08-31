/**
 * @file org-header.tsx
 * @description P1010: Clarity Group page header (LinkedIn-style: name,
 * location/member-count meta, one-line blurb) with the persistent top-right CTA.
 * The member/non-member CTA swap IS the visible membership boundary (UX Notes):
 * a stranger sees "Join", a member sees "Manage membership".
 * P1193 adds the caller's own role beside the name, and takes Leave away from the
 * sole organizer of a group.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, Share2Icon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/app/components/shared/confirm-dialog";
import { ShareDialog } from "@/app/components/shared/ShareDialog";
import { OrgParticipantRow } from "./org-participant-row";
import type { Organization, OrgParticipation, OrgRole } from "@/app/data/organizations-service.interface";

interface OrgHeaderProps {
  org: Organization;
  /** P1060 review (HIGH): null = the roster could not be loaded, so the count is
   *  UNKNOWN. Renders as absence, never as "0 members". */
  memberCount: number | null;
  isMember: boolean;
  /** P1193: the signed-in caller's OWN role in this group; null when not a member.
   *  The page has always known this (it is what `isMember` is derived from) and
   *  passed only the boolean, so the person who runs the group was greeted with the
   *  same "Manage membership" as someone who joined yesterday. */
  myRole?: OrgRole | null;
  /** P1193: how many organizer rows this group has, or null when the roster could
   *  not be loaded — UNKNOWN, never zero. Only consulted for an organizer: it decides
   *  whether leaving would strand the group with nobody who can schedule an event.
   *  A plain member's leave flow never reads it. */
  organizerCount?: number | null;
  /** Routes to the terms page (/groups/:slug/join) — never joins in place. */
  onJoin: () => void;
  onLeave: () => void | Promise<void>;
  /** Switches the page to the Members tab. Omit to render the count as plain text. */
  onShowMembers?: () => void;
  /** P1060 D9: distinct RSVP'd profiles across this org's events. Absent/zero → no row. */
  participation?: OrgParticipation;
  /** The signed-in caller's own profile id — stamped into the invite link as ?from=
   *  (silent attribution, P1076). Only read when isMember (a member is always signed in). */
  currentUserId?: string | null;
}

export function OrgHeader({
  org,
  memberCount,
  isMember,
  myRole = null,
  organizerCount = null,
  onJoin,
  onLeave,
  onShowMembers,
  participation,
  currentUserId,
}: OrgHeaderProps) {
  // Leaving deletes the membership row, and that row IS the COA acceptance record —
  // accepted_at and terms_version go with it — so it warrants a confirm. Uses the
  // shared ConfirmDialog (EventDetail's Cancel RSVP / Cancel Event use the same one)
  // rather than a bespoke inline pattern: one destructive-confirm idiom, not two.
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

  // ?from= carries silent attribution only (P1076) — stripped or invalid, the link
  // joins identically. currentUserId is only actually used while isMember is true.
  // Points at the group page, not straight at /join (P1076 session revision, 2026-08):
  // a cold invite recipient landing directly on the terms-only join page has no
  // context — no About, no Members, no sense of what they're joining. The org page
  // already has About/Members/Events tabs and its own Join CTA built for exactly
  // this; org-page.tsx forwards ?from= onto /join when that CTA is pressed.
  const inviteUrl = useMemo(() => {
    const base = `${window.location.origin}/groups/${org.slug}`;
    return currentUserId ? `${base}?from=${currentUserId}` : base;
  }, [org.slug, currentUserId]);

  // Radix restores focus to whatever opened the dialog. On a successful leave that
  // trigger is the "Manage membership" button, which has just unmounted (isMember
  // flipped), so focus falls to <body>: a keyboard user loses their place entirely
  // and a screen reader announces nothing. Hand focus to the CTA that replaced it.
  // Gated on `justLeft` so this never steals focus on a plain rerender — only on the
  // one transition where the trigger disappeared out from under the user.
  const joinButtonRef = useRef<HTMLButtonElement>(null);
  const [justLeft, setJustLeft] = useState(false);

  useEffect(() => {
    if (!justLeft || isMember) return;
    joinButtonRef.current?.focus();
    setJustLeft(false);
  }, [justLeft, isMember]);

  const confirmLeave = useCallback(async () => {
    setIsLeaving(true);
    try {
      await onLeave();
      setJustLeft(true);
      setLeaveDialogOpen(false);
    } catch {
      // Deliberately swallowed: the parent already surfaced the error toast. Not
      // closing the dialog is the point — a failed leave leaves you still a member,
      // so the confirm stays on screen and retry is one click, not four.
    } finally {
      setIsLeaving(false);
    }
  }, [onLeave]);

  const memberLabel =
    memberCount === null
      ? null
      : `${memberCount} ${memberCount === 1 ? "member" : "members"}`;

  // P1193 — why the sole organizer may not leave, or null when they may.
  //
  // Scoped to organizers on purpose. A plain member can never strand the group, so
  // their Leave flow is untouched in every state INCLUDING the degraded one: blocking
  // them on an unknown organizer count would refuse an action that was never at risk.
  //
  // `organizerCount === null` is UNKNOWN, not zero — the roster load swallows its
  // error by design (org-page loadRoster), and reading a failed fetch as "no other
  // organizers" would block the wrong people while reading it as "0" would unblock
  // the very person this guard exists for. Neither is safe, so an unknown count
  // refuses and says so.
  //
  // This governs the BUTTON only. The authoritative guard is the BEFORE DELETE
  // trigger (20260831190000_p1193_last_organizer_cannot_leave.sql) — the DELETE
  // policy still permits any self-delete, so a UI-only version would be a suggestion.
  const leaveBlockedReason: string | null =
    myRole !== "organizer"
      ? null
      : organizerCount === null
        ? "Can't check group organizers right now — reload and try again."
        : organizerCount <= 1
          ? "You're the only organizer of this group."
          : null;

  // Single column, CTA under the identity block — NOT floated top-right. Top-right
  // put this button in the same corner band as the app-wide "Start a Clarity Session"
  // in the fixed nav, so two blue buttons competed for the same glance. Anchored
  // below the member count it reads as this org's action.
  return (
    <header className="flex flex-col items-start gap-4">
      <div className="min-w-0 w-full">
        {/* P1193: the role badge sits BESIDE the group name (founder, 2026-08-31),
            not in the meta row and not folded into the CTA label. `items-baseline`
            with a wrapping flex keeps it on the name's baseline on desktop and lets
            it drop below on a narrow viewport instead of squeezing a long group name.
            Classes match the Members-tab Organizer badge (pledger-card.tsx) exactly —
            one badge, one treatment, so the two readings of the same fact cannot
            drift apart. Green is NOT used: that is reserved for the directory's
            membership badge (design-system.md — green means success only). */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold break-words">{org.name}</h1>
          {myRole === "organizer" && (
            <span
              data-testid="org-role-badge"
              className="flex-shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
            >
              Organizer
            </span>
          )}
        </div>
        {/* P1060 review (HIGH): an unknown count renders as ABSENCE — the whole row
            goes away, exactly as OrgParticipantRow does for absent participation.
            A wrong number is worse than no number: "0 members" on a group with 11
            is a claim the page has no basis for. */}
        {memberLabel !== null && (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <UsersIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {/* The count already reads as a summary of the Members tab, so it links
              there. Rendered as a real <button> (not a clickable <span>) so it is
              keyboard-reachable and announced as an action. */}
          {onShowMembers ? (
            <button
              type="button"
              onClick={onShowMembers}
              className="rounded underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {memberLabel}
            </button>
          ) : (
            <span>{memberLabel}</span>
          )}
        </p>
        )}
        {/* P1060 D9: the participant row sits beside the member count, not inside it —
            they are different claims. Member = accepted the terms. Participant = has
            RSVP'd to one of this org's events. · Chiang Mai reads 1 member and 45 who
            have joined events; a card showing only the former makes a live community
            read as dead. Renders nothing when the count is zero. */}
        <OrgParticipantRow participation={participation} className="mt-2" />
        {org.blurb && (
          <p className="mt-3 max-w-prose text-base text-muted-foreground">{org.blurb}</p>
        )}
      </div>

      {/* The member/non-member swap is announced via the accessible name
          ("Join as member" vs "Manage membership"), never color alone (WCAG 1.4.1). */}
      {isMember ? (
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {/* A member never sees "Join as member" (P955: one primary action per
              view) — so a primary-blue Invite here costs nothing, and "Manage
              membership" stays outline as it always has. */}
          <Button
            onClick={() => setInviteDialogOpen(true)}
            className="min-h-[44px] w-full gap-2 bg-blue-500 text-white hover:bg-blue-600 sm:w-auto"
          >
            <Share2Icon className="h-4 w-4" aria-hidden="true" />
            Invite
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="min-h-[44px] w-full gap-2 sm:w-auto">
                Manage membership
                {/* A real icon, not a "▾" text character — the glyph rendered at text
                    weight (near-invisible) and leaked into the button's accessible name. */}
                <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            {/* Same close-animation hazard the ConfirmDialog carries (see its comment):
                a modal dropdown also sets body pointer-events to "none", and Radix
                <Presence> will not unmount it until `animationend` fires — an event
                Chrome never delivers in a hidden tab. Scoped here rather than in
                components/ui/dropdown-menu.tsx on purpose: that would restyle every
                dropdown in the app, and this is the only one whose close is entangled
                with a dialog opening in the same tick. */}
            <DropdownMenuContent align="start" className="data-[state=closed]:!animate-none">
              {/* P1193: the sole organizer gets the reason INSTEAD of the control, not
                  a disabled control beside it. A rendered-then-disabled "Leave" is the
                  dead-control pattern P955 bans, and it makes the reader hunt for why.
                  The line is the whole content of the menu in that state. */}
              {leaveBlockedReason ? (
                /* DropdownMenuLabel, not a bare <p>: the content is role="menu", and
                   a menu whose only child is undecorated text announces as a menu
                   with no items. Radix's Label carries the right semantics for
                   non-interactive copy inside one. */
                <DropdownMenuLabel
                  data-testid="org-leave-blocked"
                  className="max-w-[16rem] whitespace-normal px-2 py-1.5 text-sm font-normal text-muted-foreground"
                >
                  {leaveBlockedReason}
                </DropdownMenuLabel>
              ) : (
                <DropdownMenuItem
                  onSelect={() => setLeaveDialogOpen(true)}
                  className="text-destructive focus:text-destructive"
                >
                  Leave
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <Button
          ref={joinButtonRef}
          onClick={onJoin}
          className="min-h-[44px] w-full bg-blue-500 text-white hover:bg-blue-600 sm:w-auto"
        >
          Join as member
        </Button>
      )}

      {/* OUTSIDE the isMember branch on purpose. A successful leave flips isMember
          to false, so a dialog rendered inside that branch would UNMOUNT while still
          open — Radix then tries to restore focus to a trigger that no longer exists
          (focus falls to <body>) and its pointer-events cleanup races the unmount.
          Mounted here, the dialog closes first and the branch swap is just a rerender. */}
      <ConfirmDialog
        open={leaveDialogOpen}
        onOpenChange={setLeaveDialogOpen}
        title="Leave this group?"
        description={`You'll be removed from the ${org.name} members list, and your acceptance of the terms will no longer be on record. You can join again at any time.`}
        confirmLabel="Leave"
        cancelLabel="Stay"
        variant="destructive"
        onConfirm={confirmLeave}
        isLoading={isLeaving}
      />

      <ShareDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        type="org"
        url={inviteUrl}
        title="Invite new members"
        description={`I would like to invite you to ${org.name}.`}
      />
    </header>
  );
}
