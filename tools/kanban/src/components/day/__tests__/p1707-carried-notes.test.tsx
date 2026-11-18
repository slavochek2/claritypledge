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
    const h = renderToStaticMarkup(<CarriedNotes notes={notes} open={false} setOpen={() => {}} />)
    expect(h).toContain('data-carried-notes')
    expect(h).toContain('Start fixing also sends 2 earlier notes')
    expect(h).not.toContain('Balance was 412')
  })

  it('opened, lists date, card and note text', () => {
    const h = renderToStaticMarkup(<CarriedNotes notes={notes} open setOpen={() => {}} />)
    expect(h).toContain('3 Oct')
    expect(h).toContain('Cloud credit balance is a guess')
    expect(h).toContain('Balance was 412')
    expect(h).toContain('why again?')
    expect(h.match(/data-carried-note=/g)).toHaveLength(2)
  })

  it('one note reads in the singular; none renders nothing', () => {
    expect(renderToStaticMarkup(<CarriedNotes notes={notes.slice(0, 1)} open={false} setOpen={() => {}} />)).toContain('Start fixing also sends 1 earlier note<')
    expect(renderToStaticMarkup(<CarriedNotes notes={[]} open={false} setOpen={() => {}} />)).toBe('')
  })
})
