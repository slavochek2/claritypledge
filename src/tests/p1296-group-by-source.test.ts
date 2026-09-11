/**
 * @file p1296-group-by-source.test.ts
 * @description P1296 item 7 — which stories group, and where a group sits.
 *
 * A source is one VIDEO, keyed by `parseVideoUrl`, never by the raw URL string: the same
 * video reached through five URL shapes must be one group, or a reader sees one video's
 * player mounted twice — the pile this item exists to remove.
 */
import { describe, it, expect } from 'vitest';
import { groupBySource, sourceKeyFor } from '@/lib/group-by-source';

const ID = 'abcDEF12345'; // 11 chars, a well-formed YouTube id
const OTHER = 'zyxWVU98765';

const story = (id: string, videoUrl?: string | null) => ({ id, videoUrl });

describe('P1296 — what a source is', () => {
  it('every YouTube URL form of one video is ONE source', () => {
    const forms = [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}&t=42s`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://youtu.be/${ID}?t=90`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/live/${ID}`,
    ];
    const keys = new Set(forms.map(sourceKeyFor));
    expect([...keys]).toEqual([`youtube:${ID}`]);

    const entries = groupBySource(forms.map((url, i) => story(`s${i}`, url)));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'group', sourceKey: `youtube:${ID}` });
    expect(entries[0]!.kind === 'group' && entries[0]!.stories.map((s) => s.id)).toEqual(
      forms.map((_, i) => `s${i}`),
    );
  });

  it('two different videos are two sources', () => {
    const entries = groupBySource([
      story('a1', `https://youtu.be/${ID}`),
      story('b1', `https://youtu.be/${OTHER}`),
      story('a2', `https://www.youtube.com/watch?v=${ID}`),
      story('b2', `https://www.youtube.com/watch?v=${OTHER}`),
    ]);
    expect(entries.map((e) => e.kind)).toEqual(['group', 'group']);
    expect(entries.map((e) => e.key)).toEqual([`source:youtube:${ID}`, `source:youtube:${OTHER}`]);
  });

  it('an unparseable URL, an image-only story and a story with no media are never grouped', () => {
    const entries = groupBySource([
      story('bad1', 'https://vimeo.com/12345'),
      story('bad2', 'https://vimeo.com/12345'),
      story('bad3', 'not a url'),
      story('img', null),
      story('none', undefined),
    ]);
    expect(entries.every((e) => e.kind === 'single')).toBe(true);
    expect(entries.map((e) => e.kind === 'single' && e.story.id)).toEqual(['bad1', 'bad2', 'bad3', 'img', 'none']);
  });

  it('a source with only ONE story in the list renders as a plain card, not a tray of one', () => {
    const entries = groupBySource([story('only', `https://youtu.be/${ID}`)]);
    expect(entries).toEqual([{ kind: 'single', key: 'story:only', story: story('only', `https://youtu.be/${ID}`) }]);
  });
});

describe('P1296 — where a group sits', () => {
  // The aisafety1 shape: one source's stories at positions 1, 3 and 8.
  const list = [
    story('leahy1', `https://youtu.be/${ID}`),
    story('lecun1', `https://youtu.be/${OTHER}`),
    story('leahy2', `https://youtu.be/${ID}`),
    story('solo', null),
    story('lecun2', `https://youtu.be/${OTHER}`),
    story('leahy3', `https://youtu.be/${ID}`),
  ];

  it('at its FIRST story\'s position; later stories join it there; nothing else moves order', () => {
    const entries = groupBySource(list);
    expect(entries.map((e) => (e.kind === 'group' ? e.stories.map((s) => s.id).join('+') : e.story.id))).toEqual([
      'leahy1+leahy2+leahy3',
      'lecun1+lecun2',
      'solo',
    ]);
  });

  it('follows the list it is given, so the opposite sort puts the other end first', () => {
    const entries = groupBySource([...list].reverse());
    expect(entries.map((e) => (e.kind === 'group' ? e.stories.map((s) => s.id).join('+') : e.story.id))).toEqual([
      'leahy3+leahy2+leahy1',
      'lecun2+lecun1',
      'solo',
    ]);
  });

  it('a filter that leaves one story of a source renders it plain; one that leaves none drops the group', () => {
    const searched = list.filter((s) => s.id === 'leahy2' || s.id.startsWith('lecun'));
    const entries = groupBySource(searched);
    expect(entries.map((e) => e.kind)).toEqual(['group', 'single']);
    expect(entries[1]).toMatchObject({ kind: 'single', key: 'story:leahy2' });

    const none = groupBySource(list.filter((s) => !s.id.startsWith('leahy')));
    expect(none.some((e) => e.key === `source:youtube:${ID}`)).toBe(false);
  });

  it('a group that survives a filter keeps its key, so its mounted player is not remounted', () => {
    const before = groupBySource(list).find((e) => e.kind === 'group')!.key;
    const after = groupBySource(list.filter((s) => s.id !== 'leahy3')).find((e) => e.kind === 'group')!.key;
    expect(after).toBe(before);
  });
});
