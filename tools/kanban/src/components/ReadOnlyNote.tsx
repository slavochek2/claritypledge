import { PRIVATE_READONLY_NOTE } from '../lib/readOnly'

export function ReadOnlyNote() {
  return (
    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
      {PRIVATE_READONLY_NOTE}
    </div>
  )
}
