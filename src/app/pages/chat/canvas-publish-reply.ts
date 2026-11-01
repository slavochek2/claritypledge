/**
 * @file canvas-publish-reply.ts
 * @description P1536 W4: finding the Publish reply of a canvas thread. It is the mirror's (no author) message that opens with
 * "Published vN." (canvas_draft_publish posts it into the draft's thread). Its "Open canvas" is drawn by PublishReplyOpen.
 */
import type { ChatMessage } from '@/app/data/chat-service';

export const OPEN_CANVAS_LABEL = 'Open canvas';

const PUBLISH_REPLY = /^Published v\d+\./;

export const findPublishReply = (messages: ChatMessage[]): ChatMessage | null =>
  messages.find((m) => m.kind === 'agent' && !m.authorId && !m.isDeleted && PUBLISH_REPLY.test(m.body ?? '')) ?? null;
