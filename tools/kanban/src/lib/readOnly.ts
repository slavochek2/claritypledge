// A private spec is read-only on this board: the API refuses every write to it (403).
export const PRIVATE_READONLY_NOTE = 'Private spec \u2014 read-only here'

export function isReadOnlyFeature(feature: { private?: boolean }): boolean {
  return feature.private === true
}
