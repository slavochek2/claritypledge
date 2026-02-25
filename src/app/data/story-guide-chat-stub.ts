/**
 * @file story-guide-chat-stub.ts
 * @description Mock AI responses for VITE_MOCK_AI=true mode.
 * Enables UI development without the deployed story-guide-chat edge function.
 */

export interface StubStreamChunk {
  type: 'delta' | 'done';
  text?: string;
}

const MOCK_DRAFT_V1 = `I ask people if they understood me. They say yes. When I ask them to explain back, it falls apart. I'm tired of being the only one who checks.`;

const MOCK_DRAFT_V2 = `I ask someone if they understood. They say yes. But when I ask them to explain it back, it unravels. I realised I was the only one checking. It felt lonely.`;

const MOCK_POLISH = `I check if people understood me. They say yes. I ask them to explain back. It falls apart. I never knew this gap existed until I started looking. Now I can't stop seeing it.`;

const MOCK_RATING_RESPONSE_HIGH = `Almost there. What's missing?\n\nA) The emotional weight — I can feel what happened but not why it mattered\nB) The sequence — it reads like a summary, not a moment\nC) Your role in it — what were you doing when this happened?\nD) Other — tell me what's off`;

const MOCK_RATING_RESPONSE_MID = `I'm missing something. Here's what I'm uncertain about: whether the core feeling is loneliness or frustration. Which is closer?\n\nA) Loneliness — you were doing this alone and no one joined\nB) Frustration — you kept running into the same wall\nC) Surprise — you didn't expect this gap to be invisible to others\nD) Other — tell me what's off`;

/**
 * Returns a mock SSE-style async generator that simulates the edge function stream.
 * Controlled by the iteration count to return appropriate mock responses.
 */
export async function* mockStoryGuideStream(
  messages: Array<{ role: string; content: string }>,
  iteration: number
): AsyncGenerator<StubStreamChunk> {
  const userMessages = messages.filter(m => m.role === 'user');
  const lastUserMsg = userMessages[userMessages.length - 1]?.content ?? '';

  // Detect rating from user message
  const ratingMatch = lastUserMsg.match(/^(\d+)/);
  const rating = ratingMatch ? parseInt(ratingMatch[1], 10) : 0;

  let response: string;

  if (iteration === 0) {
    // First response: story draft v1
    response = MOCK_DRAFT_V1;
  } else if (rating === 10) {
    // Polish pass
    response = `Here's the polished version before I save it:\n\n${MOCK_POLISH}\n\nChanges: tightened opening, removed repeated phrase.`;
  } else if (rating >= 8) {
    response = MOCK_RATING_RESPONSE_HIGH;
  } else if (rating >= 5) {
    response = MOCK_RATING_RESPONSE_MID;
  } else {
    response = MOCK_DRAFT_V2;
  }

  // Simulate streaming by yielding word by word
  const words = response.split(' ');
  for (let i = 0; i < words.length; i++) {
    yield { type: 'delta', text: (i === 0 ? '' : ' ') + words[i] };
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  yield { type: 'done' };
}
