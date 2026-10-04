// P1399: plain helpers shared by the Day page components (kept out of the .tsx files so
// React fast refresh keeps working — those files export components only).

import type { CSSProperties } from 'react'

export function formatDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const ghostButton: CSSProperties = {
  minHeight: 40,
  padding: '0 12px',
  border: 'none',
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--text-secondary)',
  fontSize: 'var(--font-size-14)',
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

export const outlineButton: CSSProperties = {
  ...ghostButton,
  border: '1px solid var(--border-table)',
  background: 'var(--bg-card)',
  color: 'var(--text-primary)',
  fontWeight: 'var(--font-weight-medium)' as unknown as number,
}
