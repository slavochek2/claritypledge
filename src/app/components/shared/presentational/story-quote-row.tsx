/**
 * P1445 D — a story quoted under a point, with its author's stance outside the box: avatar, name
 * (CP's AgentByline when the author is an agent account), badges, the author's PositionBadge, then
 * the quoted box. No product dependencies: "is this an agent" arrives as `isAgent` (CP reads its
 * agent registry; the Day board passes true for "Agent on Slava"), navigation as `onOpen`.
 */
import type { ReactNode } from 'react';
import type { PositionType } from '@/app/types';
import { AgentByline } from '../agent-byline';
import { PositionBadge } from '../PositionBadge';

interface StoryQuoteRowProps {
  /** the author's stored name (AgentByline strips the agent prefix itself) */
  name: string;
  isAgent: boolean;
  authorPosition?: PositionType;
  /** before the name (CP: GravatarAvatar) */
  avatar?: ReactNode;
  /** after the name, before the stance (CP: EarBadge) */
  badges?: ReactNode;
  /** the name's own link (agent names only; see AgentByline) */
  onNameClick?: (e: React.MouseEvent) => void;
  /** the first line inside the box (CP: role · time · visibility) */
  meta?: ReactNode;
  /** the story text */
  children: ReactNode;
  /** the box opens the story; without it the box is not a control */
  onOpen?: () => void;
  /** classes for the text paragraph (CP clamps compact cards) */
  textClassName?: string;
}

export function StoryQuoteRow({ name, isAgent, authorPosition, avatar, badges, onNameClick, meta, children, onOpen, textClassName = 'text-base' }: StoryQuoteRowProps) {
  const box = 'bg-muted border border-border rounded-lg p-3';
  return (
    <div className="bg-card rounded-lg overflow-hidden">
      {/* Position label OUTSIDE the quoted box - Avatar → Name → Ear → Badge */}
      <div className={`flex items-center gap-1.5 mb-2 text-sm text-foreground${isAgent ? ' agent-card-drained' : ''}`} {...(isAgent ? { 'data-agent-row': 'true' } : {})}>
        {avatar}
        <span className={"inline-flex items-center gap-1.5"}>
          {isAgent ? <AgentByline name={name} onNameClick={onNameClick} /> : <span className="font-medium">{name}</span>}
          {badges}
          {authorPosition && <PositionBadge position={authorPosition} />}
        </span>
      </div>

      {/* Quoted Story box */}
      {onOpen ? (
        <div
          role="button"
          tabIndex={0}
          className={`${box} cursor-pointer hover:bg-accent hover:border-border transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none`}
          onClick={onOpen}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpen();
            }
          }}
        >
          {meta}
          <p className={`text-foreground break-words ${textClassName}`}>{children}</p>
        </div>
      ) : (
        <div className={box}>
          {meta}
          <p className={`text-foreground break-words ${textClassName}`}>{children}</p>
        </div>
      )}
    </div>
  );
}
