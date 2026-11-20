import { CalendarDate, getLocalTimeZone } from '@internationalized/date'
import { describe, expect, it } from 'vitest'

import { editingTimeZone, toDeadlineParts, toTimestamp } from './deadline'

const KYIV = 'Europe/Kyiv'

function instantOf(timestamp: string): number {
  return new Date(timestamp).getTime()
}

describe('a deadline in the form', () => {
  it('is edited in the pinned zone when there is one', () => {
    expect(editingTimeZone(KYIV)).toBe(KYIV)
  })

  it('is edited in the zone of the browser otherwise', () => {
    expect(editingTimeZone(undefined)).toBe(getLocalTimeZone())
  })

  it('shows the date and the time the deadline falls on in that zone', () => {
    const parts = toDeadlineParts('2026-03-05T16:30:00Z', KYIV)

    expect(parts?.date.toString()).toBe('2026-03-05')
    expect(parts?.time).toBe('18:30')
  })

  it('shows the next day for a deadline that is past midnight in that zone', () => {
    const parts = toDeadlineParts('2026-03-05T23:05:00Z', KYIV)

    expect(parts?.date.toString()).toBe('2026-03-06')
    expect(parts?.time).toBe('01:05')
  })

  it('reads a timestamp that lost its offset as UTC', () => {
    expect(toDeadlineParts('2026-03-05T16:30:00', KYIV)?.time).toBe('18:30')
  })

  it('has nothing to show for a timestamp that cannot be read', () => {
    expect(toDeadlineParts('soon', KYIV)).toBeNull()
  })

  it('sends the chosen date and time as an instant in UTC', () => {
    expect(toTimestamp(new CalendarDate(2026, 3, 5), '18:30', KYIV)).toBe('2026-03-05T16:30:00.000Z')
  })

  it('follows summer time of the zone', () => {
    expect(toTimestamp(new CalendarDate(2026, 7, 1), '18:30', KYIV)).toBe('2026-07-01T15:30:00.000Z')
  })

  it('means the end of the day when no time was given', () => {
    expect(toTimestamp(new CalendarDate(2026, 3, 5), '', KYIV)).toBe('2026-03-05T21:59:00.000Z')
  })

  it.each(['2026-03-05T16:30:00Z', '2026-07-01T00:00:00+03:00', '2026-10-25T00:30:00Z', '2026-12-31T22:15:00Z'])(
    'gives back the same instant for %s',
    (timestamp) => {
      const parts = toDeadlineParts(timestamp, KYIV)
      if (parts === null) throw new Error('The timestamp could not be read')

      expect(instantOf(toTimestamp(parts.date, parts.time, KYIV))).toBe(instantOf(timestamp))
    },
  )
})
