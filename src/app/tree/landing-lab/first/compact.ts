import { createContext } from "react";

/**
 * True on a screen whose content is taller than its panel. Its title or lead then becomes
 * a compact sticky header (17px, weight 600, a 1px divider under it), so it stays visible
 * on every beat while the rest scrolls under it.
 */
export const CompactContext = createContext(false);
