import { describe, it, expect } from 'vitest'
import { cardDetail, restates } from '../../src/lib/day'

/** P1445 F: a card's detail never restates its title. Invented text. */
describe('restates / cardDetail', () => {
  it('a field made of the title\'s words is dropped; one that adds a fact is kept', () => {
    expect(restates('The nightly backup is late.', 'Nightly backup late')).toBe(true)
    expect(restates('Backup is late because the disk filled on Tuesday.', 'Nightly backup late')).toBe(false)
  })

  it('each field is measured against the title AND the fields kept before it', () => {
    const d = cardDetail({
      title: 'Three keys report no billing data',
      point_a: 'Three keys report no billing data.',
      obstacle: 'The billing export does not include keys created this month.',
      point_b: 'The billing export does not include keys created this month.',
      evidence_text: 'Export rows checked: 0 for the three newest keys.',
      more_info: '',
    })
    expect(d.dropped).toEqual(['point_a', 'point_b'])
    expect(Object.keys(d.show)).toEqual(['obstacle', 'evidence_text'])
  })

  it('FAILING CONTROL — distinct fields are all kept', () => {
    const d = cardDetail({ title: 'Prod smoke failing on login', point_a: 'Users cannot sign in since 09:00.', obstacle: 'A cookie flag changed in the last deploy.', point_b: 'Sign-in works again.', evidence_text: '', more_info: '' })
    expect(d.dropped).toEqual([])
  })
})

describe('P1445 F, Codex review: a field that adds a fact is never dropped', () => {
  it.each([
    ['Backup is encrypted', 'Backup is not encrypted'],
    ["Backup is encrypted", "Backup isn't encrypted"],
    ['Budget is 10 EUR', 'Budget is 20 EUR'],
    ['The nightly backup job failed', 'The nightly backup job failed yesterday'],
  ])('title %j, field %j → kept', (title, field) => {
    expect(restates(field, title)).toBe(false)
  })
  it('CONTROL — the same words reordered still restate', () => {
    expect(restates('Encrypted, the backup is.', 'Backup is encrypted')).toBe(true)
  })
})
