/**
 * P1603: the link of a hidden event ends in a long random string, so it cannot be found by guessing or listing.
 * 16 characters of a 32-letter alphabet from the browser's crypto source = 80 bits (the floor is 12 characters).
 * A public event keeps its short, older ending.
 */
export const HIDDEN_SLUG_ENDING_LENGTH = 16;

// 32 symbols, so `byte & 31` maps a uniform byte onto the alphabet with no bias.
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

export function hiddenSlugEnding(): string {
  const bytes = new Uint8Array(HIDDEN_SLUG_ENDING_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b & 31]).join('');
}
