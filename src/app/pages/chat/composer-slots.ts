/**
 * @file composer-slots.ts
 * @description P1576: which buttons the composer row shows, in one place. The rules are the send
 * slot's: exactly one primary action at any time (P955), so while a recorder bar (dictation or a
 * voice note) is up nothing else in the row is on offer, and the round voice-note button takes the
 * send slot only when there is nothing to send.
 */

/** The two facts about dictation the row depends on. `ComposerDictation` satisfies this. */
export interface DictationState {
  /** The dictation bar is up (recording or transcribing in this chat). */
  recording: boolean;
  /** The browser can record. */
  supported: boolean;
}

/** The two facts about voice notes the row depends on. `VoiceNote` satisfies this. */
export interface VoiceState {
  /** The pane allows voice notes here and the browser can record. */
  enabled: boolean;
  /** The voice recorder bar is up in this chat. */
  showBar: boolean;
}

export interface Slots {
  attach: boolean;
  /** The text field (hidden, not unmounted, while a recorder bar is up). */
  field: boolean;
  /** The dictation bar, which takes the place of the field and every button. */
  bar: boolean;
  /** The voice-note recorder bar, likewise. */
  voiceBar: boolean;
  /** The in-field dictation mic. */
  mic: boolean;
  /** The round voice-note button in the send slot. */
  voice: boolean;
  send: boolean;
}

/**
 * Positional on purpose: the call site is inside `Composer`, whose size is ratcheted, and an object
 * literal costs a line per property there.
 *
 * @param sendable there is text, a staged attachment or a sendable quote
 * @param hasAttach the caller passed an attach handler
 * @param privateTo a private @mirror ask is open
 */
export function composerSlots(sendable: boolean, hasAttach: boolean, privateTo: boolean, dictation: DictationState, voice: VoiceState): Slots {
  const idle = !dictation.recording && !voice.showBar;
  return {
    attach: hasAttach && !privateTo && idle,
    field: idle,
    bar: dictation.recording,
    voiceBar: voice.showBar,
    mic: dictation.supported && idle,
    voice: voice.enabled && !sendable && !privateTo && idle,
    send: sendable && idle,
  };
}
