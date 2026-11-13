/** P1529: while a mounted thread shows a refused start, the Publish spot says "Not updated" with no spinner (it stays a status, the draft is busy). */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CanvasPublishSpot } from '@/app/components/canvas/canvas-publish-spot';
import { showStartRefusal } from '@/app/data/canvas-start-refusals';

afterEach(cleanup);

describe('CanvasPublishSpot refused state', () => {
  it('updating with a refusal shown: "Not updated", no spinner; without: "Updating…" with the spinner', () => {
    render(<CanvasPublishSpot state={{ kind: 'updating' }} onPublish={() => undefined} />);
    expect(screen.getByTestId('publish-spot-status').textContent).toBe('Updating…');
    expect(screen.getByTestId('publish-spot-spinner')).toBeTruthy();
    let stop: () => void = () => undefined;
    act(() => { stop = showStartRefusal('rZ'); });
    expect(screen.getByTestId('publish-spot-status').textContent).toBe('Not updated');
    expect(screen.queryByTestId('publish-spot-spinner')).toBeNull();
    act(() => stop());
    expect(screen.getByTestId('publish-spot-status').textContent).toBe('Updating…');
  });
  it('the Publish button is never replaced by the refused words', () => {
    let stop: () => void = () => undefined;
    act(() => { stop = showStartRefusal('rY'); });
    render(<CanvasPublishSpot state={{ kind: 'publish' }} onPublish={() => undefined} />);
    expect(screen.getByTestId('canvas-draft-publish')).toBeTruthy();
    act(() => stop());
  });
});
