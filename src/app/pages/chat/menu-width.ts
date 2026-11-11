/**
 * The width of a message menu in px: wide enough for the reactions strip when the message takes reactions, else the plain list's width.
 * One rule for the menu itself (PopMenu) and for where the three-dots button anchors it (MessageToolbar), so they cannot drift apart.
 */
import { REACTION_EMOJI } from '@/app/data/chat-reactions-service';

export const menuWidth = (hasReactions: boolean): number => (hasReactions ? REACTION_EMOJI.length * 40 + 12 : 208);
