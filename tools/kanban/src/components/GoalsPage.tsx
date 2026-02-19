import { useEffect, useState, useCallback } from 'react'

interface GoalStep {
  index: number
  text: string
  done: boolean
}

interface GoalsData {
  steps: GoalStep[]
  hypothesis: string
  question: string
  milestoneId: string
  milestoneTitle: string
}

export function GoalsPage() {
  const [data, setData] = useState<GoalsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<number | null>(null)

  const fetchGoals = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/goals')
      if (!res.ok) throw new Error('Failed to fetch goals')
      setData(await res.json())
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchGoals() }, [fetchGoals])

  const toggle = async (step: GoalStep) => {
    if (toggling !== null) return
    setToggling(step.index)
    try {
      await fetch(`/api/goals/${step.index}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: !step.done }),
      })
      await fetchGoals()
    } finally {
      setToggling(null)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, color: 'var(--text-tertiary)', fontSize: 14 }}>Loading...</div>
    )
  }

  if (!data || data.steps.length === 0) {
    return (
      <div style={{ padding: 40, color: 'var(--text-tertiary)', fontSize: 14 }}>
        No active milestone with a pilot sequence.
      </div>
    )
  }

  const total = data.steps.length
  const doneCount = data.steps.filter((s) => s.done).length
  const progress = total > 0 ? doneCount / total : 0
  const remaining = data.steps.filter((s) => !s.done)
  const nextStep = remaining[0]
  const upcomingSteps = remaining.slice(1)

  // Absolute step number (1-indexed) for display
  const stepNum = (step: GoalStep) => step.index + 1

  return (
    <div style={{ padding: '32px 40px', maxWidth: 560 }}>

      {/* Header: milestone + progress */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.8px',
          color: 'var(--text-tertiary)',
        }}>
          {data.milestoneId}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          {doneCount} / {total} complete
        </span>
      </div>

      {/* Progress bar */}
      <div style={{
        height: 3,
        background: 'var(--border-table)',
        borderRadius: 2,
        marginBottom: 20,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${progress * 100}%`,
          background: progress === 1 ? '#22c55e' : '#3b82f6',
          borderRadius: 2,
          transition: 'width 0.3s ease',
          minWidth: progress > 0 ? 4 : 0,
        }} />
      </div>

      {/* Context: hypothesis + question */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 4 }}>
          {data.hypothesis}
        </div>
        {data.question && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
            {data.question}
          </div>
        )}
      </div>

      {/* All done */}
      {doneCount === total && (
        <div style={{
          padding: '16px 20px',
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: 8,
          fontSize: 14,
          color: '#166534',
          fontWeight: 500,
        }}>
          All steps complete — time to move to the next milestone.
        </div>
      )}

      {/* Next step */}
      {nextStep && (
        <div
          onClick={() => toggle(nextStep)}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: '14px 16px',
            background: 'rgba(59, 130, 246, 0.07)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: 8,
            cursor: toggling === nextStep.index ? 'wait' : 'pointer',
            marginBottom: 8,
            transition: 'background 0.1s',
            opacity: toggling === nextStep.index ? 0.6 : 1,
          }}
          onMouseEnter={(e) => { if (toggling === null) (e.currentTarget as HTMLElement).style.background = 'rgba(59, 130, 246, 0.12)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(59, 130, 246, 0.07)' }}
        >
          {/* Step number */}
          <span style={{
            flexShrink: 0,
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: '#3b82f6',
            color: 'white',
            fontSize: 11,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 1,
          }}>
            {stepNum(nextStep)}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1d4ed8', lineHeight: 1.4 }}>
              {nextStep.text}
            </div>
          </div>
          {/* Checkbox */}
          <input
            type="checkbox"
            checked={false}
            readOnly
            onClick={(e) => e.stopPropagation()}
            onChange={() => toggle(nextStep)}
            style={{ marginTop: 3, cursor: 'pointer', accentColor: '#3b82f6', flexShrink: 0 }}
          />
        </div>
      )}

      {/* Upcoming steps */}
      {upcomingSteps.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {upcomingSteps.map((step, i) => {
            const isNear = i < 2
            return (
              <div
                key={step.index}
                onClick={() => toggle(step)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 16px',
                  borderRadius: 6,
                  cursor: toggling === step.index ? 'wait' : 'pointer',
                  opacity: toggling === step.index ? 0.4 : isNear ? 0.75 : 0.45,
                  transition: 'opacity 0.1s, background 0.1s',
                }}
                onMouseEnter={(e) => { if (toggling === null) (e.currentTarget as HTMLElement).style.background = 'var(--bg-table-row-hover)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                {/* Step number */}
                <span style={{
                  flexShrink: 0,
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  border: '1.5px solid var(--border-table)',
                  color: 'var(--text-tertiary)',
                  fontSize: 11,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {stepNum(step)}
                </span>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)' }}>
                  {step.text}
                </span>
                <input
                  type="checkbox"
                  checked={false}
                  readOnly
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggle(step)}
                  style={{ cursor: 'pointer', flexShrink: 0, opacity: 0.5 }}
                />
              </div>
            )
          })}
        </div>
      )}

      {/* Gate to next milestone */}
      <div style={{
        marginTop: 32,
        paddingTop: 16,
        borderTop: '1px solid var(--border-table)',
        fontSize: 12,
        color: 'var(--text-tertiary)',
      }}>
        Gate to C2 — run ≥1 paid 1-on-1 session and hear "yes, this felt purposeful"
      </div>

    </div>
  )
}
