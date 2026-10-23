import { describe, it, expect } from 'vitest';
import { chatNav, hasWayBackElsewhere } from '@/app/pages/chat/chat-view-model';

describe('the header back arrow shows only when the chat was reached from another place', () => {
  it('opened from the list: no arrow beyond the phone one', () => {
    const plan = chatNav({ pathname: '/chats', state: undefined }, '/chats/c/a', 'open');
    expect(hasWayBackElsewhere(plan.state)).toBe(false);
  });
  it('cold arrival and no state: no arrow', () => {
    expect(hasWayBackElsewhere(undefined)).toBe(false);
    expect(hasWayBackElsewhere({ below: [] })).toBe(false);
  });
  it('a Clarify or a jump to an original from another chat: arrow', () => {
    const plan = chatNav({ pathname: '/chats/c/a', state: { below: ['list'] } }, '/chats/c/mirror', 'follow');
    expect(plan.state).toEqual({ below: ['conv', 'list'] });
    expect(hasWayBackElsewhere(plan.state)).toBe(true);
  });
  it('entries made stale by a replace do not count', () => {
    expect(hasWayBackElsewhere({ below: ['skip', 'list'] })).toBe(false);
  });
});
