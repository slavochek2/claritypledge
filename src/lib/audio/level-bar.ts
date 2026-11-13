/**
 * @file level-bar.ts
 * @description The drawing of one bar of an input-level waveform, shared by the chat dictation bar and the room transcription bar so the
 * two read as one waveform: its width and colour, and how a level (0..1) maps to a height. Silence still shows as a short bar.
 */
export const LEVEL_BAR_CLASS = 'w-[3px] shrink-0 rounded-full bg-blue-500/80';
export const levelBarHeight = (level: number): string => `${Math.max(14, Math.round(level * 100))}%`;
