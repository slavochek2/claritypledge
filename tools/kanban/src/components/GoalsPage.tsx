import { useEffect, useState, useCallback } from 'react'

interface StrategicData {
  steps: Array<{ index: number; text: string; done: boolean }>
  dos: string[]
  donts: string[]
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

  if (!strategic || strategic.steps.length === 0) {
    return <div style={{ padding: 40, color: 'var(--text-tertiary)', fontSize: 14 }}>No goals. Edit <code>docs/goals.md</code>.</div>
  }

  const firstUndone = strategic.steps.findIndex((s) => !s.done)

  return (
    <div style={{ padding: '28px 36px', maxWidth: 480 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.5px', color: 'var(--text-tertiary)', marginBottom: 14,
      }}>
        Next Steps
      </div>

      {strategic.steps.map((step, i) => {
        const isFirstUndone = i === firstUndone
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: isFirstUndone ? '9px 12px' : '4px 6px',
            marginBottom: isFirstUndone ? 4 : 1,
            borderRadius: isFirstUndone ? 4 : 3,
            background: isFirstUndone ? 'var(--tag-blue-bg)' : 'transparent',
            opacity: step.done ? 0.5 : isFirstUndone ? 1 : i < firstUndone + 3 ? 0.7 : 0.45,
          }}>
            <span
              onClick={() => toggleStep(i, step.done)}
              style={{
              width: isFirstUndone ? 20 : 18, height: isFirstUndone ? 20 : 18,
              borderRadius: '50%', flexShrink: 0, marginTop: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 600, cursor: 'pointer',
              ...(step.done
                ? { background: 'var(--tag-green-bg)', color: 'var(--tag-green-text)' }
                : isFirstUndone
                  ? { background: 'var(--tag-blue-text)', color: '#fff' }
                  : { border: '1px solid var(--border-table)', color: 'var(--text-tertiary)' }),
            }}>
              {step.done ? '✓' : i + 1}
            </span>
            <span style={{
              fontSize: 13, lineHeight: 1.4, flex: 1,
              fontWeight: isFirstUndone ? 500 : 400,
              color: step.done ? 'var(--text-tertiary)' : isFirstUndone ? 'var(--tag-blue-text)' : 'var(--text-secondary)',
              textDecoration: step.done ? 'line-through' : 'none',
            }}>
              {step.text}
            </span>
          </div>
        )
      })}
    </div>
  )
}
