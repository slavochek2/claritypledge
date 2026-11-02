/**
 * @file p1536-s4-box-refs-mapper.test.ts
 * @description P1536 S4.3: a message row's `box_refs` reaches the client as `boxRefs`, from the first read (MESSAGE_COLUMNS) and from a realtime row alike.
 */
import { describe, expect, it } from 'vitest';
import { mapMessageRow, type ChatMessageRow } from '@/app/data/chat-mappers';
import { MESSAGE_COLUMNS } from '@/app/data/chat-service';

const row: ChatMessageRow = {
  id: 'm1', conversation_id: 'c1', author_id: 'u1', body: '[Problem] x', created_at: '2026-11-02T08:00:00Z', edited_at: null, deleted_at: null, reply_to_id: null,
  thread_root_id: 'r1', forwarded_from_message_id: null, forward_snapshot: null, kind: 'message', attachment_kind: null, attachment_id: null,
};

describe('P1536 S4.3 box_refs on a message', () => {
  it('the first read selects the column', () => {
    expect(MESSAGE_COLUMNS.split(',').map(s => s.trim())).toContain('box_refs');
  });
  it('maps a list and treats null or absent as none', () => {
    expect(mapMessageRow({ ...row, box_refs: ['canvas:problem'] }).boxRefs).toEqual(['canvas:problem']);
    expect(mapMessageRow({ ...row, box_refs: null }).boxRefs).toBeNull();
    expect(mapMessageRow(row).boxRefs).toBeNull();
  });
});
