// P1669: Analytics — the five public Mixpanel boards, embedded. The links come from the server
// (read from .env.local per request); this file never names one.

import { useEffect, useState } from 'react'
import { getMixpanelBoards, type BoardsPayload } from './api'

const BOARD_ENV_VARS = ['MIXPANEL_BOARD_PULSE', 'MIXPANEL_BOARD_PATH', 'MIXPANEL_BOARD_RETURN', 'MIXPANEL_BOARD_FRICTION', 'MIXPANEL_BOARD_USE']

export function BoardsView({ data }: { data: BoardsPayload }) {
  const { boards, invalid } = data
  return (
    <>
      {invalid.length > 0 && (
        <div className="d-card d-pad" role="alert" data-boards-invalid style={{ overflowWrap: 'anywhere', marginBottom: 8 }}>
          <b>Not a public link: {invalid.join(', ')}</b>
          <div className="d-nc">
            The value must be the board's public share link, https://eu.mixpanel.com/p/&lt;token&gt;. Turn on Public Boards in Mixpanel Project Settings, then share the board publicly.
          </div>
        </div>
      )}
      {boards.length === 0 && invalid.length === 0 && (
        <div className="d-card d-pad" data-boards-empty style={{ overflowWrap: 'anywhere' }}>
          <b>No board configured</b>
          <div className="d-nc">Set these in .env.local to the public share link of each board: {BOARD_ENV_VARS.join(', ')}.</div>
          <div className="d-nc">Public Boards must be enabled in Mixpanel Project Settings (only the project owner can).</div>
        </div>
      )}
      {boards.length > 0 && (
        <div className="d-nc" data-boards-hint style={{ marginBottom: 8 }}>
          A board that stays blank: check that Public Boards is on in Mixpanel Project Settings and the board is still shared publicly, or open it in Mixpanel.
        </div>
      )}
      {boards.map((b) => (
        <section key={b.key} aria-label={b.label} data-board={b.key}>
          <h3 className="d-h3">
            {b.label}
            <a className="d-link sm d-tap" href={b.url} target="_blank" rel="noopener noreferrer">
              Open in Mixpanel
            </a>
          </h3>
          <iframe
            title={b.label}
            src={b.url}
            loading="lazy"
            referrerPolicy="no-referrer"
            // Mixpanel's board app needs its scripts and its own origin; nothing else (no top navigation, no forms).
            sandbox="allow-scripts allow-same-origin allow-popups"
            style={{ width: '100%', height: 640, border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', background: 'var(--card)' }}
          />
        </section>
      ))}
    </>
  )
}

export function BoardsTab() {
  const [data, setData] = useState<BoardsPayload | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    getMixpanelBoards().then(setData).catch(() => setErr('Could not load the boards'))
  }, [])
  if (err) return <div className="d-card d-pad" role="alert">{err}</div>
  if (!data) return <div className="d-card d-pad d-nc">Loading</div>
  return <BoardsView data={data} />
}
