/**
 * @file use-sound.ts
 * @description Hook for managing sound preferences and playing celebration sounds
 */
import { useState, useCallback } from 'react';

const SOUND_ENABLED_KEY = 'clarity-sound-enabled';

/**
 * Hook to manage sound enabled preference (persisted in localStorage)
 */
export function useSoundEnabled(): [boolean, (enabled: boolean) => void] {
  const [soundEnabled, setSoundEnabledState] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(SOUND_ENABLED_KEY) !== 'false';
  });

  const setSoundEnabled = useCallback((enabled: boolean) => {
    setSoundEnabledState(enabled);
    localStorage.setItem(SOUND_ENABLED_KEY, enabled ? 'true' : 'false');
  }, []);

  return [soundEnabled, setSoundEnabled];
}

/**
 * Play the celebration sound if sounds are enabled
 */
export function playCelebrationSound(): void {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(SOUND_ENABLED_KEY) === 'false') return;

  const audio = new Audio('/sounds/celebration.wav');
  audio.volume = 0.5; // Not too loud
  const playPromise = audio.play();
  // Guard for environments where play() doesn't return a Promise (e.g., jsdom)
  if (playPromise) {
    playPromise.catch(() => {
      // Ignore autoplay errors (browser policy)
    });
  }
}
