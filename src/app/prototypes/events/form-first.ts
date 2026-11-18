/**
 * @file form-first.ts
 * @description P1675 R18: the ONE "form first" decision, which needs the series recipes. Kept apart from
 * `@/app/data/hike-answer-model` so the data model does not import prototype code (a data-to-UI dependency). This is
 * layering only: the recipes are in the entry bundle anyway (App -> home-redirect -> shell-nav -> useTonightsEvent).
 */
import { hikeRegistrationOf } from '@/app/data/hike-answer-model';
import { recipeForEvent } from './series-recipes';

type FormFirstEvent = { flow?: string | null; seriesSlug?: string | null; hikeRegistration?: string | null } | null | undefined;

/** The event is a hike and its preset asks before the seat (anything but 'optional'). */
export const hikeAsksBeforeSeat = (e: FormFirstEvent): boolean =>
  recipeForEvent(e).registration === 'hike' && hikeRegistrationOf(e) !== 'optional';

/** The ONE "form first" decision: the mastermind, or a hike whose preset is not 'optional'. */
export const eventAsksBeforeSeatSync = (e: FormFirstEvent): boolean =>
  recipeForEvent(e).registration === 'mastermind' || hikeAsksBeforeSeat(e);
