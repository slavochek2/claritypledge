// P1317: the Inbox column — one card per section of the deferred-work stores.
//
// Read-only by design: no drag, no edit, no close (spec Non-Goals). Leaving the
// inbox is a /prioritize or /weekly verdict, executed against the file.
//
// PRIVACY: private-store titles live only in React state. Nothing here writes to
// localStorage, and the open action sends an entry key, never a path.

export interface InboxCard {
  key: string
  kind: 'public' | 'private'
  id?: string
  line: number
  title: string
  state: 'open' | 'unparseable'
  reasons: string[]
  due: string
  dueExplicit: boolean
}

export interface InboxStoreView {
  kind: 'public' | 'private'
  state: 'present' | 'absent' | 'error'
  open?: number
  unparseable?: number
  nextId?: number | null
  counterBehind?: boolean
  entries: InboxCard[]
}

export type InboxResponse = { enabled: false } | { enabled: true; stores: InboxStoreView[] }

interface InboxColumnProps {
  inbox: InboxResponse | null
  error: string | null
  searchQuery: string
}

const STORE_LABEL = { public: 'Public store', private: 'Private store' } as const

function storeNotice(store: InboxStoreView): { text: string; tone: 'warn' | 'info' } | null {
  if (store.state === 'absent') {
    // An absent store is never zero (P1081). A missing private store is normal;
    // a missing public store is a defect — it is committed to the repo.
    return store.kind === 'public'
      ? { text: `${STORE_LABEL.public}: ABSENT — unexpected, it is committed`, tone: 'warn' }
      : { text: `${STORE_LABEL.private}: absent (not created yet)`, tone: 'info' }
  }
  if (store.state === 'error') {
    return { text: `${STORE_LABEL[store.kind]}: unreadable — see the kanban server log`, tone: 'warn' }
  }
  if (store.counterBehind) {
    return { text: `${STORE_LABEL[store.kind]}: Next ID counter is not above the highest ID`, tone: 'warn' }
  }
  return null
}

async function openEntry(key: string) {
  try {
    const res = await fetch('/api/inbox/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: key }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error(`Inbox open failed (${res.status}): ${body.error ?? 'unknown error'}`)
    }
  } catch {
    console.error('Inbox open failed: API unreachable')
  }
}

const badge = (bg: string, color: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 6px',
  height: 18,
  fontSize: 'var(--font-size-12)',
  borderRadius: '3px',
  background: bg,
  color,
  whiteSpace: 'nowrap',
})

function Card({ card }: { card: InboxCard }) {
  const unparseable = card.state === 'unparseable'
  return (
    <button
      type="button"
      onClick={() => openEntry(card.key)}
      title={`Open in VS Code at line ${card.line}`}
      data-testid="inbox-card"
      data-inbox-state={card.state}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        minHeight: 44,
        padding: 'var(--spacing-8)',
        background: 'var(--bg-card, #fff)',
        border: unparseable ? '1px solid #eb5757' : '1px solid rgba(55, 53, 47, 0.09)',
        borderRadius: '4px',
        boxShadow: 'rgba(15, 15, 15, 0.1) 0 1px 2px',
        cursor: 'pointer',
        font: 'inherit',
        color: 'var(--text-primary)',
      }}
    >
      <div
        style={{
          fontSize: 'var(--font-size-14)',
          lineHeight: 1.4,
          overflowWrap: 'anywhere',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {card.title}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
        {card.id ? (
          <span style={badge('var(--tag-gray-bg)', 'var(--text-primary)')}>{card.id}</span>
        ) : null}
        {unparseable ? (
          <span style={badge('var(--tag-red-bg)', 'var(--tag-red-text)')}>unparseable</span>
        ) : null}
        <span
          style={
            card.kind === 'private'
              ? badge('var(--tag-purple-bg)', 'var(--tag-purple-text)')
              : badge('var(--tag-blue-bg)', 'var(--tag-blue-text)')
          }
        >
          {card.kind}
        </span>
        {card.due === 'month' ? (
          <span style={badge('var(--tag-yellow-bg)', 'var(--tag-yellow-text)')}>due: month</span>
        ) : null}
      </div>
      {unparseable ? (
        <div style={{ marginTop: 4, fontSize: 'var(--font-size-12)', color: 'var(--tag-red-text)' }}>
          {card.reasons.join(', ')} · line {card.line}
        </div>
      ) : null}
    </button>
  )
}

export function InboxColumn({ inbox, error, searchQuery }: InboxColumnProps) {
  if (inbox && !inbox.enabled) return null

  const stores = inbox?.enabled ? inbox.stores : []
  const q = searchQuery.toLowerCase()
  const cards = stores
    .flatMap((s) => s.entries)
    // Unparseable first: they are the ones that need a fix at the source.
    .sort((a, b) => (a.state === b.state ? 0 : a.state === 'unparseable' ? -1 : 1))
    .filter((c) => !q || c.title.toLowerCase().includes(q) || (c.id ?? '').toLowerCase().includes(q))
  const open = stores.reduce((n, s) => n + (s.open ?? 0), 0)
  const unparseable = stores.reduce((n, s) => n + (s.unparseable ?? 0), 0)

  return (
    <div
      data-testid="inbox-column"
      style={{
        background: 'var(--bg-column)',
        borderRadius: '3px',
        padding: '0 var(--spacing-6)',
        minHeight: 100,
        width: 260,
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-6)', height: 32, marginBottom: 'var(--spacing-4)' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            fontSize: 'var(--font-size-14)',
            color: 'var(--status-gray-text)',
            background: 'var(--status-gray-bg)',
            padding: '0 var(--spacing-6)',
            height: 20,
            borderRadius: '3px',
          }}
        >
          Inbox
        </span>
        <span
          style={{ fontSize: 'var(--font-size-14)', color: 'var(--text-tertiary)' }}
          title="Open entries · unparseable sections (fix these in the store)"
        >
          {inbox ? `${open}${unparseable ? ` · ${unparseable} unparseable` : ''}` : '…'}
        </span>
      </div>

      {error ? (
        <div style={{ fontSize: 'var(--font-size-12)', color: 'var(--tag-red-text)', marginBottom: 6 }}>
          Inbox unavailable: {error}
        </div>
      ) : null}

      {stores.map((s) => {
        const notice = storeNotice(s)
        return notice ? (
          <div
            key={`notice-${s.kind}`}
            data-testid={`inbox-notice-${s.kind}`}
            style={{
              fontSize: 'var(--font-size-12)',
              color: notice.tone === 'warn' ? 'var(--tag-red-text)' : 'var(--text-secondary)',
              marginBottom: 6,
            }}
          >
            {notice.text}
          </div>
        ) : null
      })}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)', paddingBottom: 'var(--spacing-6)' }}>
        {cards.map((c) => (
          <Card key={`${c.kind}-${c.key}`} card={c} />
        ))}
      </div>
    </div>
  )
}
