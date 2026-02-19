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

interface WeeklyCommitment {
  date: string
  stop?: string
  start?: string
  scary_thing?: string
  hypothesis?: string
  kill_date?: string
}

export function GoalsPage() {
  const [data, setData] = useState<GoalsData | null>(null)
  const [weekly, setWeekly] = useState<WeeklyCommitment | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<number | null>(null)
  const [hoveringDone, setHoveringDone] = useState<number | null>(null)

  const fetchGoals = useCallback(async () => {
    setLoading(true)
    try {
      const [goalsRes, weeklyRes] = await Promise.all([
        fetch('/api/goals'),
        fetch('/api/weekly'),
      ])
      if (goalsRes.ok) setData(await goalsRes.json())
      if (weeklyRes.ok) setWeekly(await weeklyRes.json())
    } catch {
      // leave state null
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
    return <div style={{ padding: 40, color: 'var(--text-tertiary)', fontSize: 14 }}>Loading...</div>
  }

  const total = data?.steps.length ?? 0
  const doneCount = data?.steps.filter((s) => s.done).length ?? 0
  const progress = total > 0 ? doneCount / total : 0
  const doneSteps = data?.steps.filter((s) => s.done) ?? []
  const remaining = data?.steps.filter((s) => !s.done) ?? []
  const nextStep = remaining[0]
  const upcomingSteps = remaining.slice(1)

  return (
    <div style={{ padding: '28px 36px', display: 'flex', gap: 36, alignItems: 'flex-start' }}>

      {/* ── Left: mindset priming ── */}
      <div style={{ width: 264, flexShrink: 0 }}>
        <SectionLabel text="This week" />

        {weekly ? (
          <>
            {/* Scary thing */}
            {weekly.scary_thing && (
              <div style={{
                padding: '10px 12px',
                background: 'var(--tag-orange-bg)',
                borderRadius: 4,
                marginBottom: 14,
              }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--tag-orange-text)', marginBottom: 4, opacity: 0.7 }}>
                  Scary thing
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--tag-orange-text)', lineHeight: 1.5 }}>
                  {weekly.scary_thing}
                </div>
              </div>
            )}

            {/* Stop */}
            {weekly.stop && (
              <MindsetRow
                label="Stop"
                value={weekly.stop}
                bg="var(--tag-red-bg)"
                color="var(--tag-red-text)"
              />
            )}

            {/* Start */}
            {weekly.start && (
              <MindsetRow
                label="Start"
                value={weekly.start}
                bg="var(--tag-green-bg)"
                color="var(--tag-green-text)"
              />
            )}

            {/* Hypothesis */}
            {weekly.hypothesis && (
              <div style={{ marginTop: 14 }}>
                <div style={{
                  fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)',
                  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6,
                }}>
                  Hypothesis
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {weekly.hypothesis}
                </div>
              </div>
            )}

            {/* Kill date */}
            {weekly.kill_date && (
              <div style={{
                marginTop: 14, paddingTop: 12,
                borderTop: '1px solid var(--border-table)',
                fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5,
              }}>
                <span style={{ fontWeight: 500 }}>Kill: </span>{weekly.kill_date}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            No commitment saved. Run <code>/weekly</code>.
          </div>
        )}
      </div>

      {/* ── Divider ── */}
      <div style={{ width: 1, background: 'var(--border-table)', alignSelf: 'stretch', flexShrink: 0 }} />

      {/* ── Right: pilot sequence ── */}
      <div style={{ flex: 1, maxWidth: 400 }}>
        {!data || data.steps.length === 0 ? (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 14, paddingTop: 2 }}>No active milestone.</div>
        ) : (
          <>
            {/* Milestone header + progress */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <span style={{
                fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.5px', color: 'var(--text-tertiary)', flexShrink: 0,
              }}>
                {data.milestoneId}
              </span>
              <div style={{ flex: 1, height: 3, background: 'var(--border-table)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${progress * 100}%`,
                  background: progress === 1 ? 'var(--tag-green-text)' : 'var(--tag-blue-text)',
                  borderRadius: 2,
                  transition: 'width 0.3s ease',
                  minWidth: progress > 0 ? 3 : 0,
                }} />
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                {doneCount} / {total}
              </span>
            </div>

            {/* Done steps */}
            {doneSteps.map((step) => (
              <div
                key={step.index}
                onClick={() => toggle(step)}
                onMouseEnter={() => setHoveringDone(step.index)}
                onMouseLeave={() => setHoveringDone(null)}
                title="Click to uncheck"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '4px 6px', borderRadius: 3, marginBottom: 1,
                  cursor: toggling !== null ? 'wait' : 'pointer',
                  opacity: toggling === step.index ? 0.3 : 1,
                  background: hoveringDone === step.index ? 'var(--bg-table-row-hover)' : 'transparent',
                  transition: 'background 0.1s',
                }}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--tag-green-bg)',
                  color: 'var(--tag-green-text)',
                  fontSize: 10, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  ✓
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-tertiary)', textDecoration: 'line-through', flex: 1 }}>
                  {step.text}
                </span>
              </div>
            ))}

            {doneSteps.length > 0 && (nextStep || upcomingSteps.length > 0) && (
              <div style={{ height: 1, background: 'var(--border-table)', margin: '8px 0' }} />
            )}

            {doneCount === total && (
              <div style={{
                padding: '8px 12px', background: 'var(--tag-green-bg)',
                borderRadius: 4, fontSize: 13, color: 'var(--tag-green-text)', fontWeight: 500,
              }}>
                All done — move to next milestone.
              </div>
            )}

            {/* Next step */}
            {nextStep && (
              <div
                onClick={() => toggle(nextStep)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', marginBottom: 2,
                  background: 'var(--tag-blue-bg)',
                  borderRadius: 4,
                  cursor: toggling !== null ? 'wait' : 'pointer',
                  opacity: toggling === nextStep.index ? 0.5 : 1,
                }}
              >
                <span style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--tag-blue-text)',
                  color: '#fff', fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {nextStep.index + 1}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--tag-blue-text)', lineHeight: 1.4, flex: 1 }}>
                  {nextStep.text}
                </span>
              </div>
            )}

            {/* Upcoming steps */}
            {upcomingSteps.map((step, i) => (
              <div
                key={step.index}
                onClick={() => toggle(step)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '4px 6px', borderRadius: 3, marginBottom: 1,
                  cursor: toggling !== null ? 'wait' : 'pointer',
                  opacity: toggling === step.index ? 0.3 : i < 2 ? 0.65 : 0.4,
                }}
              >
                <span style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  border: '1px solid var(--border-table)',
                  color: 'var(--text-tertiary)', fontSize: 10, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {step.index + 1}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>
                  {step.text}
                </span>
              </div>
            ))}

            {/* Gate */}
            <div style={{
              marginTop: 18, paddingTop: 12,
              borderTop: '1px solid var(--border-table)',
              fontSize: 11, color: 'var(--text-tertiary)',
            }}>
              Gate to C2: ≥1 paid session + "yes, this felt purposeful"
            </div>
          </>
        )}
      </div>

    </div>
  )
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '0.5px', color: 'var(--text-tertiary)', marginBottom: 14,
    }}>
      {text}
    </div>
  )
}

function MindsetRow({ label, value, bg, color }: { label: string; value: string; bg: string; color: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
      <span style={{
        fontSize: 11, fontWeight: 500, padding: '1px 6px',
        background: bg, color, borderRadius: 3,
        flexShrink: 0, marginTop: 1,
      }}>
        {label}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {value}
      </span>
    </div>
  )
}
