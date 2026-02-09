/**
 * @file utils.ts
 * @description Utility functions for Clarity Partners feature.
 * Separated from components for Fast Refresh compatibility.
 */

/**
 * Capitalizes the first letter of each word in a name.
 */
export function capitalizeName(name: string): string {
  return name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Extracts the first name from a full name and capitalizes it.
 * Used in live meetings for more compact display.
 */
export function getFirstName(name: string): string {
  const firstName = name.trim().split(' ')[0] || name;
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
}
