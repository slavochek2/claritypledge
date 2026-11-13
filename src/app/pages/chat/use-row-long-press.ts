/**
 * P1631: a finger resting on a chat-list row opens its menu, as it does on a message (same delay and drift as MessageRow). Spread `handlers` on the row's
 * button; `swallowClick()` is asked first in its click handler and is true for the click that ends a long press that opened the menu.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { TouchEvent } from 'react';
import { LONG_PRESS_DRIFT_PX, LONG_PRESS_MS } from './MessageRow';

export function useRowLongPress(onLongPress: () => void) {
  const press = useRef<{ x: number; y: number; timer: number } | null>(null);
  /** A press opened the menu: the click that ends it must not open the chat, however long the hold was. Cleared by that click or by the next touch. */
  const opened = useRef(false);
  const end = useCallback(() => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  }, []);
  useEffect(() => end, [end]);
  const handlers = {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      end();
      opened.current = false;
      press.current = {
        x: t.clientX,
        y: t.clientY,
        timer: window.setTimeout(() => {
          press.current = null;
          opened.current = true;
          onLongPress();
        }, LONG_PRESS_MS),
      };
    },
    onTouchMove: (e: TouchEvent) => {
      const t = e.touches[0];
      if (press.current && t && Math.hypot(t.clientX - press.current.x, t.clientY - press.current.y) > LONG_PRESS_DRIFT_PX) end();
    },
    onTouchEnd: end,
    onTouchCancel: end,
  };
  const swallowClick = () => {
    const was = opened.current;
    opened.current = false;
    return was;
  };
  return { handlers, swallowClick };
}
