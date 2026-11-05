/**
 * P1529 measurement: the results script counts only points the next version created or reworded, and says "points".
 * A static guard on the script's own text (the SQL needs a database); the arithmetic was run against rows with and without a carried copy.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const script = readFileSync('scripts/event-mastermind-results.sh', 'utf8');

describe('event-mastermind-results.sh', () => {
  it('leaves out points carried unchanged from the earlier version, for the count and for the stances on them', () => {
    expect(script).toMatch(/LEFT JOIN public\.canvas_draft_points cp ON cp\.draft_id = t\.draft_id AND cp\.copied_from IS NULL/);
  });
  it('labels what it counts as points, never boxes', () => {
    expect(script).toMatch(/new or reworded points with their own stance/);
    expect(script).not.toMatch(/changed boxes/);
  });
});
