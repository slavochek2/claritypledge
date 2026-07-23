import { useEffect, useState, useCallback } from 'react'

interface WeeklyReview {
  date: string
  metrics: Record<string, string>
  commitment: string
  insight: string
}

interface StrategicData {
  steps: Array<{ index: number; text: string; done: boolean }>
  dos: string[]
  donts: string[]
  weeklyReview?: WeeklyReview | null
  /** Set when goals.md's headings no longer match what the server parses — an
   *  empty page is then a parser/doc mismatch, not an empty backlog. */
  structureNotFound?: { expected: string[]; found: string[] } | null
}

// Labels we want in the compact metrics row, in display order
const HIGHLIGHT_METRICS = ['Shipped', 'Signups', 'Live sessions', 'Build/sell/learn']

// Commitment line label → color mapping
const COMMITMENT_COLORS: Record<string, { label: string; color: string }> = {
  'STOP': { label: 'STOP', color: 'var(--tag-orange-text)' },
  'START': { label: 'START', color: 'var(--tag-green-text)' },
  'SCARY THING': { label: 'SCARY THING', color: 'var(--tag-blue-text)' },
  'HYPOTHESIS': { label: 'HYPOTHESIS', color: 'var(--text-secondary)' },
  'KILL DATE': { label: 'KILL DATE', color: 'var(--tag-orange-text)' },
}

function parseCommitmentLines(raw: string): Array<{ label: string; value: string; color: string }> {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
  const result: Array<{ label: string; value: string; color: string }> = []
  for (const line of lines) {
    let matched = false
    for (const [prefix, meta] of Object.entries(COMMITMENT_COLORS)) {
      if (line.startsWith(prefix + ':')) {
        result.push({ label: meta.label, value: line.slice(prefix.length + 1).trim(), color: meta.color })
        matched = true
        break
      }
    }
    if (!matched) {
      result.push({ label: '', value: line, color: 'var(--text-secondary)' })
    }
  }
  return result
}

/** Extract the leading number from a metric value, e.g. "63 features (P458–P576)" → "63" */
function extractNumber(val: string): string | null {
  const m = val.match(/^(\d+[%]?)/)
  return m ? m[1] : null
}

/** Extract the rest after the number, e.g. "63 features (P458–P576)" → "features" */
function extractUnit(val: string): string {
  const m = val.match(/^\d+[%]?\s*(.*)/)
  if (!m || !m[1]) return ''
  // Take just the first word as the unit label
  const rest = m[1]
  // For percentages like "95% / 5% / 0%", return the full string
  if (rest.includes('/')) return val
  // For "features (P458–P576)", return "features"
  const firstWord = rest.split(/[\s(]/)[0]
  return firstWord
}

export function GoalsPage() {
  const [strategic, setStrategic] = useState<StrategicData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchGoals = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/goals-strategic')
      if (res.ok) setStrategic(await res.json())
    } catch {
      // leave state null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchGoals() }, [fetchGoals])

  const toggleStep = useCallback(async (index: number, currentDone: boolean) => {
    // Optimistic update
    setStrategic(prev => prev ? {
      ...prev,
      steps: prev.steps.map((s, i) => i === index ? { ...s, done: !currentDone } : s),
    } : prev)
    try {
      await fetch(`/api/goals-strategic/${index}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: !currentDone }),
      })
    } catch {
      // Revert on failure
      fetchGoals()
    }
  }, [fetchGoals])

  if (loading) {
    return <div style={{ padding: 40, color: 'var(--text-tertiary)', fontSize: 14 }}>Loading...</div>
  }

  if (strategic?.structureNotFound) {
    const { expected, found } = strategic.structureNotFound
    return (
      <div style={{ padding: 40, color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--accent-red, #c0392b)' }}>Can't read docs/goals.md — heading mismatch.</strong>
        <div style={{ marginTop: 8, color: 'var(--text-tertiary)' }}>
          This page is empty because the parser found none of its expected sections, not because
          there are no goals.
        </div>
        <div style={{ marginTop: 12 }}>Expected sections: <code>{expected.join(', ')}</code></div>
        <div style={{ marginTop: 4 }}>Found: {found.length ? <code>{found.join(', ')}</code> : <em>no ## headings</em>}</div>
      </div>
    )
  }

  if (!strategic || strategic.steps.length === 0) {
    return <div style={{ padding: 40, color: 'var(--text-tertiary)', fontSize: 14 }}>No goals. Edit <code>docs/goals.md</code>.</div>
  }

  // Filter out done items — they clutter the view
  const pendingSteps = strategic.steps.filter((s) => !s.done)
  const review = strategic.weeklyReview

  // Pick highlight metrics
  const highlightMetrics = HIGHLIGHT_METRICS
    .filter(k => review?.metrics[k])
    .map(k => ({ key: k, value: review?.metrics[k] ?? '' }))

  // Parse commitment
  const commitmentLines = review?.commitment ? parseCommitmentLines(review.commitment) : []

  return (
    <div style={{ padding: '32px 36px', maxWidth: 500 }}>

      {/* ── Next Steps ── */}
      <div style={{
        fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const,
        letterSpacing: '0.5px', color: 'var(--text-tertiary)', marginBottom: 14,
      }}>
        Next Steps
      </div>

      {pendingSteps.map((step, i) => (
          <div key={step.index} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '5px 6px',
            marginBottom: 2,
            borderRadius: 3,
          }}>
            <span
              role="button"
              tabIndex={0}
              onClick={() => toggleStep(step.index, step.done)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleStep(step.index, step.done); } }}
              style={{
              width: 18, height: 18,
              borderRadius: '50%', flexShrink: 0, marginTop: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 600, cursor: 'pointer',
              border: '1px solid var(--border-table)', color: 'var(--text-tertiary)',
            }}>
              {i + 1}
            </span>
            <span style={{
              fontSize: 13, lineHeight: 1.5, flex: 1,
              color: 'var(--text-primary)',
            }}>
              {step.text}
            </span>
          </div>
      ))}

      {/* ── Weekly Review ── */}
      {review && (
        <div style={{ marginTop: 32 }}>

          {/* Subtle date header */}
          {review.date && (
            <div style={{
              fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 16,
              letterSpacing: '0.3px',
            }}>
              Week of {review.date}
            </div>
          )}

          {/* ── Commitment Card (primary focus) ── */}
          {commitmentLines.length > 0 && (
            <div style={{
              background: 'var(--bg-secondary)',
              borderLeft: '3px solid var(--tag-orange-text)',
              borderRadius: 4,
              padding: '14px 16px',
              marginBottom: 20,
            }}>
              {commitmentLines.map((line, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 8, alignItems: 'baseline',
                  marginBottom: i < commitmentLines.length - 1 ? 8 : 0,
                }}>
                  {line.label && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const,
                      letterSpacing: '0.5px', color: line.color,
                      flexShrink: 0, minWidth: 80,
                    }}>
                      {line.label}
                    </span>
                  )}
                  <span style={{
                    fontSize: 13, lineHeight: 1.45, color: 'var(--text-primary)',
                    fontWeight: line.label === 'SCARY THING' ? 500 : 400,
                  }}>
                    {line.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ── Insight (subtle reminder) ── */}
          {review.insight && (
            <div style={{
              fontSize: 12, lineHeight: 1.4, color: 'var(--text-tertiary)',
              fontStyle: 'italic', marginBottom: 20, padding: '0 2px',
            }}>
              {review.insight}
            </div>
          )}

          {/* ── Metrics (compact dashboard row) ── */}
          {highlightMetrics.length > 0 && (
            <div style={{
              display: 'flex', gap: 0,
              borderTop: '1px solid var(--border-table)',
              paddingTop: 16,
            }}>
              {highlightMetrics.map(({ key, value }, i) => {
                const num = extractNumber(value)
                const unit = extractUnit(value)
                const isPercentage = value.includes('/')
                return (
                  <div key={key} style={{
                    flex: 1, textAlign: 'center' as const,
                    borderRight: i < highlightMetrics.length - 1 ? '1px solid var(--border-table)' : 'none',
                    padding: '0 8px',
                  }}>
                    {isPercentage ? (
                      <>
                        <div style={{
                          fontSize: 11, color: 'var(--text-secondary)',
                          fontFamily: 'monospace', letterSpacing: '-0.5px',
                        }}>
                          {value}
                        </div>
                      </>
                    ) : num ? (
                      <div style={{
                        fontSize: 22, fontWeight: 600, color: 'var(--text-primary)',
                        lineHeight: 1,
                      }}>
                        {num}
                      </div>
                    ) : (
                      <div style={{
                        fontSize: 13, color: 'var(--text-secondary)',
                      }}>
                        {value}
                      </div>
                    )}
                    <div style={{
                      fontSize: 10, color: 'var(--text-tertiary)',
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.3px', marginTop: 4,
                    }}>
                      {isPercentage ? key : unit ? `${key}` : key}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
