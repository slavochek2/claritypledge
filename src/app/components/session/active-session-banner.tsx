/**
 * P511: the /live session bar. P1307 D7 split it into a presentational SessionBar plus two thin
 * wrappers (live-session-bar.tsx, room-capture-bar.tsx); this name is kept so existing imports
 * and tests keep resolving to the same, unchanged behaviour.
 */
export { LiveSessionBar as ActiveSessionBanner } from './live-session-bar';
