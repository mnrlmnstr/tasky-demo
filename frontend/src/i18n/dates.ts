const HAS_UTC_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i

// The API speaks UTC; a timestamp that lost its offset would otherwise be read in the browser's own zone.
export function parseInstant(timestamp: string): Date | null {
  const instant = new Date(HAS_UTC_OFFSET.test(timestamp) ? timestamp : `${timestamp}Z`)
  return Number.isNaN(instant.getTime()) ? null : instant
}

/** Whether the timestamp is before `now`. Read the same way as it is shown; an unreadable one has never passed. */
export function isPast(timestamp: string, now: Date): boolean {
  const instant = parseInstant(timestamp)
  return instant !== null && instant.getTime() < now.getTime()
}

export interface DateTimeOptions {
  /** IANA zone to show the instant in; the user's own zone when left out. */
  timeZone?: string
}

/** Short absolute date and time, e.g. "Mar 5, 2026, 6:30 PM" / «5 бер. 2026 р., 18:30». Empty for an unreadable timestamp. */
export function formatDateTime(timestamp: string, locale: string, options: DateTimeOptions = {}): string {
  const instant = parseInstant(timestamp)
  if (instant === null) return ''
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: options.timeZone,
  }).format(instant)
}

// A local day `YYYY-MM-DD` as the UTC midnight of that date, so formatting it in UTC shows that same date.
function dayAsDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`)
}

/**
 * Local days in short form, e.g. "Nov 20" / «20 лист.», or a range of them, "Nov 20 – 24" / «20–24 лист.».
 * The year is shown only when a day falls outside `thisYear`. Both days are `YYYY-MM-DD`.
 */
export function formatDays(first: string, last: string, locale: string, thisYear: number): string {
  const otherYear = [first, last].some((day) => Number(day.slice(0, 4)) !== thisYear)
  const format = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: otherYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  })
  return first === last ? format.format(dayAsDate(first)) : format.formatRange(dayAsDate(first), dayAsDate(last))
}

const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3600
const SECONDS_PER_DAY = 86_400
const DAYS_PER_MONTH = 30
const DAYS_PER_YEAR = 365

// The largest unit that fits at least once, so the text reads "3 hours ago" and not "180 minutes ago".
function largestUnit(seconds: number): [divisor: number, unit: Intl.RelativeTimeFormatUnit] {
  if (seconds < SECONDS_PER_MINUTE) return [Infinity, 'second']
  if (seconds < SECONDS_PER_HOUR) return [SECONDS_PER_MINUTE, 'minute']
  if (seconds < SECONDS_PER_DAY) return [SECONDS_PER_HOUR, 'hour']
  if (seconds < SECONDS_PER_DAY * DAYS_PER_MONTH) return [SECONDS_PER_DAY, 'day']
  if (seconds < SECONDS_PER_DAY * DAYS_PER_YEAR) return [SECONDS_PER_DAY * DAYS_PER_MONTH, 'month']
  return [SECONDS_PER_DAY * DAYS_PER_YEAR, 'year']
}

/** Time since `now` in words, e.g. "3 hours ago" / «3 години тому»; under a minute either way is "now". Empty for an unreadable timestamp. */
export function formatRelativeTime(timestamp: string, now: Date, locale: string): string {
  const instant = parseInstant(timestamp)
  if (instant === null) return ''
  const seconds = (instant.getTime() - now.getTime()) / 1000
  const [divisor, unit] = largestUnit(Math.abs(seconds))
  // `+ 0` turns the -0 of a moment just past into 0, which Intl would otherwise word differently.
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(Math.trunc(seconds / divisor) + 0, unit)
}
