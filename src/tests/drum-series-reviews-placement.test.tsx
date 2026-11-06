import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { splitAfterFirstSection } from '@/app/prototypes/events/hike/hike-utils';

describe('non-hike series: reviews close the first description section', () => {
  it('splits just before the second h2', () => {
    const html = '<p>Intro</p><h2>Part 1</h2><p>Drums</p><h2>Part 2</h2><p>Lanterns</p>';
    expect(splitAfterFirstSection(html)).toEqual({
      before: '<p>Intro</p><h2>Part 1</h2><p>Drums</p>',
      after: '<h2>Part 2</h2><p>Lanterns</p>',
      matched: true,
    });
  });
  it('stops at the first sub-heading of the first section', () => {
    const html = '<h2>Part 1</h2><p>Drums</p><h3>Where we meet</h3><p>Venue</p><h2>Part 2</h2>';
    expect(splitAfterFirstSection(html).before).toBe('<h2>Part 1</h2><p>Drums</p>');
  });
  it('keeps the whole description when there are fewer than two sections', () => {
    expect(splitAfterFirstSection('<p>x</p>')).toEqual({ before: '<p>x</p>', after: '', matched: false });
    expect(splitAfterFirstSection('<h2>Only</h2><p>x</p>').matched).toBe(false);
  });
  it('EventDetail renders the reviews between the two halves on non-hike pages', () => {
    const src = readFileSync('src/app/prototypes/events/components/EventDetail.tsx', 'utf8');
    const before = src.indexOf('seriesDescriptionParts.before');
    const reviews = src.indexOf('heading="What people say"');
    const after = src.indexOf('seriesDescriptionParts.after');
    expect(before).toBeGreaterThan(-1);
    expect(before).toBeLessThan(reviews);
    expect(reviews).toBeLessThan(after);
  });
});
