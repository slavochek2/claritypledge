/** P1545 round 2 lab: pure helpers (action model, meta line) shared by B2 and C2. */
import type { MockArtifact } from './mock';

export const PRIMARY = 'bg-blue-600 text-white hover:bg-blue-700';

export interface Action {
  label: string;
  /** Shown under the label, as the app does today ("Can't delete — ..."). */
  disabledReason?: string;
}

export interface ActionSet {
  /** The one fixed visible button. */
  primary: string;
  menu: Action[];
  /** Red, last, below a separator. */
  danger?: Action;
}

/** The action model, from the real tabs (see the spec's "Phase 1 round 2: action inventory"). */
export function actionsFor(a: MockArtifact): ActionSet {
  if (a.sharedBy) return { primary: a.finished ? 'Results' : 'Open', menu: [] };
  if (a.kind === 'canvas') return { primary: 'Open', menu: [{ label: 'Share' }] };
  if (a.draft) {
    return {
      primary: 'Edit',
      menu: [{ label: 'Prepare Letter', disabledReason: a.counts?.stories === 0 ? 'Add at least one story first.' : undefined }],
      danger: { label: 'Delete', disabledReason: a.hasSentLetters ? "Can't delete — letters were sent from this draft." : undefined },
    };
  }
  const shared = deliveryCount(a) > 0;
  return {
    primary: 'Open overview',
    menu: [
      { label: 'Preview letter' },
      { label: 'Add recipient(s)' },
      ...(a.publicLink ? [{ label: 'Copy public link' }] : []),
    ],
    danger: { label: 'Delete letter', disabledReason: shared ? "Can't delete — letter has been shared." : undefined },
  };
}

/** One line of facts under a title, joined with a middle dot. Never empty. */
export function metaParts(a: MockArtifact): string[] {
  const out: string[] = [];
  if (a.draft && a.counts) out.push(`${a.counts.stories} ${a.counts.stories === 1 ? 'story' : 'stories'}`, `${a.counts.points} ${a.counts.points === 1 ? 'point' : 'points'}`);
  if (a.sealed) out.push(`Sealed ${a.sealed} ago`);
  if (a.recipients && a.recipients.length > 0) {
    out.push(`${a.recipients.filter(r => r.status === 'Completed').length} of ${a.recipients.length} recipients completed`);
  }
  if (a.responses) out.push(`${a.responses} ${a.responses === 1 ? 'response' : 'responses'}`);
  if (a.steps) out.push(`${a.steps.done} of ${a.steps.total} steps`);
  out.push(a.draft ? `Updated ${a.updated} ago` : `${a.updated} ago`);
  return out;
}


/** Every delivery of a published letter: invited recipients plus public-link respondents (sent-tab.tsx:313). */
export function deliveryCount(a: MockArtifact): number {
  return (a.recipients?.length ?? 0) + (a.responses ?? 0);
}

/** One rule for the recipients disclosure/section label, in both variants. */
export function recipientsLabel(a: MockArtifact): string {
  return `Recipients (${deliveryCount(a)})`;
}

/** Items that were posted into a chat (decision 5), yours or shared with you. */
export function isInChat(a: MockArtifact, titles: string[]): boolean {
  return titles.includes(a.title);
}
