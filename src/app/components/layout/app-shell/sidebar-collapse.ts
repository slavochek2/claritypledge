/**
 * @file sidebar-collapse.ts
 * @description P1512: the desktop sidebar's collapsed state, remembered on this device.
 * Storage is a convenience: every read and write is wrapped, and the toggle still works for the
 * current visit when storage is blocked.
 */
import { useCallback, useState } from 'react';

const SIDEBAR_COLLAPSED_KEY = 'clarity-sidebar-collapsed';

export function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    /* storage blocked */
  }
}

/** [collapsed, toggle]. The layout owns it: the sidebar draws it, the content column pads by it. */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
  const toggle = useCallback(() => {
    setCollapsed(prev => {
      writeSidebarCollapsed(!prev);
      return !prev;
    });
  }, []);
  return [collapsed, toggle];
}
