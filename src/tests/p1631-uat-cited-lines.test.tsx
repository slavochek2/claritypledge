/**
 * P1631 UAT: cited lines were never shown. AC: "Each draft cites the transcript or chat lines it came from, with no names, and quote text is read from
 * those rows, not from the model"; Solution: "Cited lines show only in the Mirror, marked as possibly wrong".
 * get_clarify_thread returns `cited` as {a: [{id, text, at}], b: [...]} (rows resolved by _clarify_cited_rows / _clarify_cited_recording_rows: text from
 * the row, no author). The mapper already flattened that shape; nothing drew it after the founder's ask A5 removed the card's "N cited" row.
 * So the lines are drawn in the Mirror's message ABOVE the card (A5: no "N cited" row on the card; A7: the card holds only the point, the position
 * buttons and the small icons), with no count and no names, under a "possibly wrong" lead.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { mapDraft } from '@/app/data/clarify-draft-map';
import type { ClarifyDraft } from '@/app/data/clarify-service';
import { ClarifyDraftsView } from '@/app/pages/chat/ClarifyDrafts';
import { CITED_LEAD } from '@/app/pages/chat/clarify-copy';

/** One draft exactly as get_clarify_thread returns it (fake data). */
const RPC_ROW = {
  id: 'draft-id-1',
  state: 'done',
  point: { id: 'point-id-1', statement: 'Example: the team sets its own deadlines (fake data).', owner_position: null },
  cited: {
    a: [{ id: 'row-id-1', text: 'Example line from side a (fake data).', at: '2026-01-01T10:00:00Z' }],
    b: [{ id: 'row-id-2', text: 'Example line from side b (fake data).', at: '2026-01-01T10:01:00Z' }],
  },
  created_at: '2026-01-01T10:02:00Z',
  source_kind: 'dm',
  published: [],
};

const noop = () => undefined;
const view0 = (drafts: ClarifyDraft[]) => render(
  <ClarifyDraftsView drafts={drafts} all={drafts} loaded failed={false} name="Test Mirror" userId="user-id-1234" mentionedId={null} onMention={noop}
    actions={{ onPick: noop, onRetry: noop, onAnother: noop, onChanged: noop }} onReload={noop} first last />,
);

describe('P1631 UAT: cited lines in the Mirror', () => {
  afterEach(cleanup);

  it('the lines of both sides, read from the RPC rows, show in the Mirror under the "possibly wrong" lead, outside the card, with no names', () => {
    const draft = mapDraft(RPC_ROW);
    expect(draft).not.toBeNull();
    view0([draft as ClarifyDraft]);
    const cited = screen.getByTestId('clarify-cited-draft-id-1');
    expect(within(cited).getByText(CITED_LEAD)).toBeTruthy();
    expect(within(cited).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Example line from side a (fake data).', 'Example line from side b (fake data).',
    ]);
    // the card itself stays as the founder asked (A5, A7): the lines are not inside it
    expect(screen.getByTestId('clarify-draft-draft-id-1').contains(cited)).toBe(false);
    expect(within(screen.getByTestId('clarify-draft-draft-id-1')).queryByText('Example line from side a (fake data).')).toBeNull();
    // item 9: the list is named by the lead itself (aria-labelledby), with no second copy of the words in an aria-label
    const list = within(cited).getByRole('list');
    expect(list.getAttribute('aria-label')).toBeNull();
    expect(document.getElementById(list.getAttribute('aria-labelledby') ?? '')?.textContent).toBe(CITED_LEAD);
    expect(within(cited).getByRole('list', { name: CITED_LEAD })).toBe(list);
    // nothing but the lead and the row texts: no names, no count
    expect(cited.textContent).toBe(`${CITED_LEAD}Example line from side a (fake data).Example line from side b (fake data).`);
  });

  it('round 3 D: a cited row with no words draws no empty line, and a draft whose rows are all blank draws nothing', () => {
    const some = mapDraft({ ...RPC_ROW, cited: { a: [{ id: 'row-id-3', text: '   ', at: null }], b: RPC_ROW.cited.b } }) as ClarifyDraft;
    const view = view0([some]);
    expect(within(screen.getByTestId('clarify-cited-draft-id-1')).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Example line from side b (fake data).']);
    view.unmount();
    const none = mapDraft({ ...RPC_ROW, cited: { a: [{ id: 'row-id-3', text: '' }], b: [{ id: 'row-id-4', text: ' \n ' }] } }) as ClarifyDraft;
    view0([none]);
    expect(screen.queryByTestId('clarify-cited-draft-id-1')).toBeNull();
    expect(screen.queryByText(CITED_LEAD)).toBeNull();
  });

  it('CONTROL: a draft with no cited lines draws no lead and no list', () => {
    const draft = mapDraft({ ...RPC_ROW, cited: null }) as ClarifyDraft;
    view0([draft]);
    expect(screen.getByTestId('clarify-draft-draft-id-1')).toBeTruthy();
    expect(screen.queryByTestId('clarify-cited-draft-id-1')).toBeNull();
    expect(screen.queryByText(CITED_LEAD)).toBeNull();
  });
});
