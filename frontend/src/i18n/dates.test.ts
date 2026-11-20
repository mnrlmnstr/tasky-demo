import { describe, expect, it, vi } from 'vitest'

import { formatDateTime, formatDays, formatRelativeTime, isPast } from './dates'

// Intl separates the time from AM/PM with a narrow no-break space; the assertions read better with plain ones.
function plainSpaces(text: string): string {
  return text.replace(/\s/gu, ' ')
}

describe('absolute date and time', () => {
  it('shows a short date and time in English', () => {
    const text = formatDateTime('2026-03-05T16:30:00Z', 'en', { timeZone: 'Europe/Kyiv' })

    expect(plainSpaces(text)).toBe('Mar 5, 2026, 6:30 PM')
  })

  it('shows a short date and time in Ukrainian', () => {
    const text = formatDateTime('2026-03-05T16:30:00Z', 'uk', { timeZone: 'Europe/Kyiv' })

    expect(plainSpaces(text)).toBe('5 бер. 2026 р., 18:30')
  })

  it('shows the same instant in the time zone it is asked for', () => {
    const text = formatDateTime('2026-03-05T16:30:00Z', 'en', { timeZone: 'America/New_York' })

    expect(plainSpaces(text)).toBe('Mar 5, 2026, 11:30 AM')
  })

  it('moves to the next day when the instant falls after midnight in the time zone', () => {
    const text = formatDateTime('2026-03-05T23:15:00Z', 'en', { timeZone: 'Europe/Kyiv' })

    expect(plainSpaces(text)).toBe('Mar 6, 2026, 1:15 AM')
  })

  it('reads a timestamp without an offset as UTC', () => {
    const text = formatDateTime('2026-03-05T16:30:00', 'en', { timeZone: 'Europe/Kyiv' })

    expect(plainSpaces(text)).toBe('Mar 5, 2026, 6:30 PM')
  })

  it('reads a timestamp with fractional seconds and no offset as UTC', () => {
    const text = formatDateTime('2026-03-05T16:30:00.123456', 'en', { timeZone: 'Europe/Kyiv' })

    expect(plainSpaces(text)).toBe('Mar 5, 2026, 6:30 PM')
  })

  it('honours an explicit offset in the timestamp', () => {
    const text = formatDateTime('2026-03-05T16:30:00+02:00', 'en', { timeZone: 'Europe/Kyiv' })

    expect(plainSpaces(text)).toBe('Mar 5, 2026, 4:30 PM')
  })

  it('uses the time zone of the user when none is given', () => {
    const userTimeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone

    expect(formatDateTime('2026-03-05T16:30:00Z', 'en')).toBe(
      formatDateTime('2026-03-05T16:30:00Z', 'en', { timeZone: userTimeZone }),
    )
  })

  it.each([['not a date'], [''], ['2026-13-45T99:00:00Z']])('shows nothing for the unreadable timestamp "%s"', (timestamp) => {
    expect(formatDateTime(timestamp, 'en', { timeZone: 'Europe/Kyiv' })).toBe('')
  })
})

describe('local days in short form', () => {
  it.each([
    ['en', '2026-11-20', '2026-11-20', 'Nov 20'],
    ['uk', '2026-11-20', '2026-11-20', '20 лист.'],
    ['en', '2026-11-20', '2026-11-24', 'Nov 20 – 24'],
    ['uk', '2026-11-20', '2026-11-24', '20–24 лист.'],
    ['uk', '2026-11-20', '2026-12-02', '20 лист. – 2 груд.'],
    ['en', '2027-01-03', '2027-01-03', 'Jan 3, 2027'],
    ['uk', '2026-12-30', '2027-01-03', '30 груд. 2026 – 3 січ. 2027 рр.'],
  ])('shows %s %s to %s as "%s"', (locale, first, last, expected) => {
    expect(plainSpaces(formatDays(first, last, locale, 2026))).toBe(expected)
  })

  it('shows the date of the day whatever the browser zone', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles')

    expect(formatDays('2026-11-20', '2026-11-20', 'en', 2026)).toBe('Nov 20')

    vi.unstubAllEnvs()
  })
})

describe('relative time', () => {
  const now = new Date('2026-03-05T12:00:00Z')

  it.each([
    ['2026-03-05T12:00:00Z', 'now'],
    ['2026-03-05T11:59:01Z', 'now'],
    ['2026-03-05T11:59:00Z', '1 minute ago'],
    ['2026-03-05T11:55:00Z', '5 minutes ago'],
    ['2026-03-05T11:00:01Z', '59 minutes ago'],
    ['2026-03-05T11:00:00Z', '1 hour ago'],
    ['2026-03-05T09:00:00Z', '3 hours ago'],
    ['2026-03-04T12:00:01Z', '23 hours ago'],
    ['2026-03-04T12:00:00Z', 'yesterday'],
    ['2026-03-03T12:00:00Z', '2 days ago'],
    ['2026-02-12T12:00:00Z', '21 days ago'],
    ['2026-02-03T12:00:01Z', '29 days ago'],
    ['2026-02-03T12:00:00Z', 'last month'],
    ['2025-10-05T12:00:00Z', '5 months ago'],
    ['2025-03-06T12:00:00Z', '12 months ago'],
    ['2025-03-05T12:00:00Z', 'last year'],
    ['2024-03-01T12:00:00Z', '2 years ago'],
  ])('describes %s in English as "%s"', (timestamp, expected) => {
    expect(formatRelativeTime(timestamp, now, 'en')).toBe(expected)
  })

  it.each([
    ['2026-03-05T12:00:00Z', 'зараз'],
    ['2026-03-05T11:59:00Z', '1 хвилину тому'],
    ['2026-03-05T11:55:00Z', '5 хвилин тому'],
    ['2026-03-05T09:00:00Z', '3 години тому'],
    ['2026-03-04T12:00:00Z', 'учора'],
    ['2026-02-12T12:00:00Z', '21 день тому'],
    ['2025-10-05T12:00:00Z', '5 місяців тому'],
    ['2024-03-01T12:00:00Z', '2 роки тому'],
  ])('describes %s in Ukrainian as "%s"', (timestamp, expected) => {
    expect(formatRelativeTime(timestamp, now, 'uk')).toBe(expected)
  })

  it('reads a timestamp without an offset as UTC', () => {
    expect(formatRelativeTime('2026-03-05T09:00:00', now, 'en')).toBe('3 hours ago')
  })

  it('treats a moment slightly ahead of the clock as now', () => {
    expect(formatRelativeTime('2026-03-05T12:00:30Z', now, 'en')).toBe('now')
  })

  it('describes a moment well ahead of the clock as being in the future', () => {
    expect(formatRelativeTime('2026-03-05T12:02:00Z', now, 'en')).toBe('in 2 minutes')
  })

  it('shows nothing for an unreadable timestamp', () => {
    expect(formatRelativeTime('not a date', now, 'en')).toBe('')
  })
})

describe('whether a moment has passed', () => {
  const noon = new Date('2026-03-05T12:00:00Z')

  it.each([
    ['a minute before the clock', '2026-03-05T11:59:00Z', true],
    ['the very moment of the clock', '2026-03-05T12:00:00Z', false],
    ['a minute after the clock', '2026-03-05T12:01:00Z', false],
    ['an earlier moment written with its own offset', '2026-03-05T13:30:00+02:00', true],
  ])('for %s', (_name, timestamp, expected) => {
    expect(isPast(timestamp, noon)).toBe(expected)
  })

  it.each([
    ['Europe/Kyiv', '2026-03-05T12:30:00', false],
    ['Europe/Kyiv', '2026-03-05T12:30:00.000', false],
    ['America/New_York', '2026-03-05T11:30:00', true],
    ['America/New_York', '2026-03-05T11:30:00.250', true],
  ])('reads a timestamp without an offset as UTC in a %s browser: %s', (zone, timestamp, expected) => {
    vi.stubEnv('TZ', zone)

    expect(isPast(timestamp, noon)).toBe(expected)

    vi.unstubAllEnvs()
  })

  it('never counts an unreadable timestamp as passed', () => {
    expect(isPast('not a date', noon)).toBe(false)
  })
})
