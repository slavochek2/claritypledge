import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { CLARITY_NIGHT_RECIPE, SALES_MASTERMIND_RECIPE, SOCIAL_HIKE_RECIPE, eventFlow, recipeForEvent } from '@/app/prototypes/events/series-recipes';

describe('P1529 one flow resolver', () => {
  it('the host flow wins, then the series, then Clarity Night', () => {
    expect(eventFlow(null)).toBe('clarity-night');
    expect(eventFlow({ seriesSlug: 'unknown' })).toBe('clarity-night');
    expect(eventFlow({ seriesSlug: 'social-hike' })).toBe('social-hike');
    expect(eventFlow({ seriesSlug: 'sales-mastermind' })).toBe('sales-mastermind');
    expect(eventFlow({ seriesSlug: 'social-hike', flow: 'sales-mastermind' })).toBe('sales-mastermind');
    expect(eventFlow({ seriesSlug: 'social-hike', flow: 'nonsense' })).toBe('social-hike');
  });

  it('existing events keep their recipes exactly', () => {
    expect(recipeForEvent({ seriesSlug: null })).toBe(CLARITY_NIGHT_RECIPE);
    expect(recipeForEvent({ seriesSlug: 'social-hike' })).toBe(SOCIAL_HIKE_RECIPE);
    expect(recipeForEvent({ seriesSlug: 'sales-mastermind' })).toBe(SALES_MASTERMIND_RECIPE);
    expect(CLARITY_NIGHT_RECIPE.registrationQuestions).toBeUndefined();
    expect(SOCIAL_HIKE_RECIPE.registrationQuestions).toBeUndefined();
  });

  it('no surface calls recipeFor( directly', () => {
    const hits = execSync(`grep -rn "recipeFor(" src --include=*.ts --include=*.tsx || true`, { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .filter(l => !l.startsWith('src/tests/') && !l.startsWith('src/app/prototypes/events/series-recipes.ts'));
    expect(hits).toEqual([]);
  });
});
