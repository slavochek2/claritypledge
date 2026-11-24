/**
 * @file menu-root.ts
 * @description Where a screen's position menu portals. Screens stay mounted when the tab changes (drafts survive), so a menu
 * left open must go with its hidden screen: it portals into a node inside that screen's tab panel, not document.body.
 */
import { createContext } from 'react';

export const MenuRoot = createContext<Element | null>(null);
