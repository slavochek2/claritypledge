// P1707 review C: notes of earlier runs that Start fixing will also send are listed on the page.
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CarriedNotes } from '../DailyReport'

const notes = [
  { at: '2026-10-03T06:00:00Z', title: 'Cloud credit balance is a guess', text: 'Balance was 412', insight: false },
  { at: '2026-10-02T06:00:00Z', title: 'A weekly insight that is no longer raised', text: 'why again?', insight: false },
]

describe('carried notes near Start fixing', () => {
  it('says how many earlier notes Start fixing also sends', () => {
    const h = renderToStaticMarkup(<CarriedNotes notes={notes} open={false} setOpen={() => {}} followUp={false} />)
    expect(h).toContain('data-carried-notes')
    expect(h).toContain('Start fixing also sends 2 earlier notes')
    expect(h).not.toContain('Balance was 412')
  })

  it('opened, lists date, card and note text', () => {
    const h = renderToStaticMarkup(<CarriedNotes notes={notes} open setOpen={() => {}} followUp={false} />)
    expect(h).toContain('3 Oct')
    expect(h).toContain('Cloud credit balance is a guess')
    expect(h).toContain('Balance was 412')
    expect(h).toContain('why again?')
    expect(h.match(/data-carried-note=/g)).toHaveLength(2)
  })

  it('one note reads in the singular; none renders nothing', () => {
    expect(renderToStaticMarkup(<CarriedNotes notes={notes.slice(0, 1)} open={false} setOpen={() => {}} followUp={false} />)).toContain('Start fixing also sends 1 earlier note<')
    expect(renderToStaticMarkup(<CarriedNotes notes={[]} open={false} setOpen={() => {}} followUp={false} />)).toBe('')
  })
})

describe('P1707 round 3 review: a carried question is labelled by its saved flag, not only by a trailing ?', () => {
  it('an ask answer without ? reads "Your question:"; a plain note reads "Your note:"', () => {
    const h = renderToStaticMarkup(
      <CarriedNotes notes={[{ ...notes[0], text: 'which balance is right', is_question: true }, notes[0]]} open setOpen={() => {}} followUp={false} />,
    )
    expect(h).toContain('Your question: which balance is right')
    expect(h).toContain('Your note: Balance was 412')
  })
})

describe('P1707 round 2: the panel speaks the button\'s word, every row is dated, rows never share a key', () => {
  it('after a send the button reads "Send N changes", so the panel says Send too', () => {
    const h = renderToStaticMarkup(<CarriedNotes notes={notes} open={false} setOpen={() => {}} followUp />)
    expect(h).toContain('Send also includes 2 earlier notes')
    expect(h).not.toContain('Start fixing')
  })

  it('each row shows its date in its own element, ahead of the card', () => {
    const h = renderToStaticMarkup(<CarriedNotes notes={notes} open setOpen={() => {}} followUp={false} />)
    expect(h.match(/data-carried-date="[^"]+">\d{1,2} \w{3}</g)).toHaveLength(2)
  })

  it('two notes saved in one batch (same time) on two no-longer-raised insights (same title) both render, with no key clash', () => {
    const twins = [
      { at: '2026-11-16T07:00:00Z', title: 'A weekly insight that is no longer raised', text: 'one', insight: false },
      { at: '2026-11-16T07:00:00Z', title: 'A weekly insight that is no longer raised', text: 'two', insight: false },
    ]
    const errors: unknown[] = []
    const orig = console.error
    console.error = (...a: unknown[]) => errors.push(a)
    try {
      const h = renderToStaticMarkup(<CarriedNotes notes={twins} open setOpen={() => {}} followUp={false} />)
      expect(h).toContain('one')
      expect(h).toContain('two')
    } finally {
      console.error = orig
    }
    expect(errors.filter((e) => String(e).includes('same key'))).toEqual([])
  })
})

describe('P1707 round 3: the note line says what it is', () => {
  it('4: the second line of a carried row is "Your note: …", or "Your question: …" when it ends in ?', () => {
    const h = renderToStaticMarkup(<CarriedNotes notes={notes} open setOpen={() => {}} followUp={false} />)
    expect(h).toMatch(/data-carried-text="true">Your note: Balance was 412</)
    expect(h).toMatch(/data-carried-text="true">Your question: why again\?</)
  })
})
