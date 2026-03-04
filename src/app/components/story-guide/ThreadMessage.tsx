/**
 * @file ThreadMessage.tsx
 * @description AI/user message bubble with optional typing indicator.
 * Stateless display component — no service calls.
 */

import type { ReactNode } from 'react';

export interface ThreadMessageProps {
  role: 'user' | 'ai';
  content: string;
  isStreaming?: boolean;
  /** Optional content rendered below the message text inside the bubble (e.g. rating buttons). */
  children?: ReactNode;
  /** Override data-testid on the outer article element. */
  'data-testid'?: string;
}

export function ThreadMessage({ role, content, isStreaming = false, children, 'data-testid': testId }: ThreadMessageProps) {
  const isAi = role === 'ai';
  const defaultTestId = isAi ? 'thread-message-ai' : 'thread-message-user';

  return (
    <article
      aria-label={isAi ? 'AI message' : 'Your message'}
      data-testid={testId ?? defaultTestId}
      className={`flex gap-2 ${isAi ? 'items-start' : 'items-start justify-end'}`}
    >
      {isAi && (
        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 text-xs select-none">
          ✦
        </div>
      )}

      <div
        data-testid="message-bubble"
        className={
          isAi
            ? 'bg-muted rounded-2xl px-4 py-2.5 max-w-[85%] text-sm'
            : 'bg-blue-600 text-white rounded-2xl px-4 py-2.5 max-w-[85%] text-sm self-end'
        }
      >
        {isAi && isStreaming ? (
          <span
            aria-hidden={true}
            className="flex gap-1 items-center h-4"
          >
            {['·', '·', '·'].map((dot, i) => (
              <span
                key={i}
                className="animate-bounce text-muted-foreground"
                style={{ animationDelay: `${i * 0.15}s` }}
              >
                {dot}
              </span>
            ))}
          </span>
        ) : (
          content
        )}
        {children && (
          <div className="mt-2">
            {children}
          </div>
        )}
      </div>
    </article>
  );
}
