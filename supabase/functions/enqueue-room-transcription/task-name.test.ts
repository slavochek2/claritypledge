// Deno test: run with `deno test --config supabase/functions/deno.json supabase/functions/enqueue-room-transcription/task-name.test.ts`
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { taskName, validAttempt } from './task-name.ts';

const P = 'projects/p/locations/l/queues/q';
const ID = '11111111-1111-4111-8111-111111111111';

Deno.test('a room job keeps the id-only task name', () => {
  assertEquals(taskName(P, ID), `${P}/tasks/room-job-${ID}`);
});

Deno.test('a round-clean dispatch with an attempt marker gets its own task name each time', () => {
  assertEquals(taskName(P, ID, 'abc123'), `${P}/tasks/room-job-${ID}-abc123`);
  assertEquals(taskName(P, ID, 'abc123') === taskName(P, ID, 'def456'), false);
});

Deno.test('only name-safe attempt markers are accepted', () => {
  assertEquals(validAttempt('0f1e2d3c-aaaa-bbbb'), true);
  assertEquals(validAttempt('a/b'), false);
  assertEquals(validAttempt(''), false);
  assertEquals(validAttempt(5), false);
  assertEquals(validAttempt('x'.repeat(65)), false);
});
