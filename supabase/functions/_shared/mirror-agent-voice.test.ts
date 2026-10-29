import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildMirrorRequest, type BeginRun, type ContextItem } from './mirror-agent.ts';

const run = (context: ContextItem[]): BeginRun => ({
  status: 'run', kind: 'reply', owner_id: 'o', mirror_name: null, owner_first_name: null, channel_title: null,
  question: null, context, reserved_usd: 0.1, attempt: 1,
});
const sent = (context: ContextItem[]) => buildMirrorRequest(run(context)).contents[0].parts[0].text;

Deno.test('mirror-agent: a transcribed voice note is sent as text and labelled', () => {
  const text = sent([{ who: 'owner', body: 'remember the milk', voice: 'transcript', at: null }]);
  assert(text.includes('remember the milk'));
  assert(text.includes('voice message, transcribed'));
});

Deno.test('mirror-agent: an untranscribed voice note says so and carries no text', () => {
  const text = sent([{ who: 'owner', body: null, voice: 'untranscribed', at: null }]);
  assert(text.includes('voice message that could not be transcribed'));
  assertEquals(text.includes('"text"'), false);
});

Deno.test('mirror-agent: a plain item carries no voice label', () => {
  assertEquals(sent([{ who: 'owner', body: 'hi' }]).includes('voice message'), false);
});

Deno.test('mirror-agent: a channel ask item with a voice note carries its transcript and label', () => {
  const ask: BeginRun = {
    ...run([{ who: 'other', name: 'Bea', body: 'meet at six', voice: 'transcript', at: null }]),
    kind: 'ask', channel_title: 'Org · General', question: { body: 'when do we meet?' },
  };
  const text = buildMirrorRequest(ask).contents[0].parts[0].text;
  assert(text.includes('meet at six'));
  assert(text.includes('voice message, transcribed'));
});
