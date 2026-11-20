import {
  CalendarDateTime,
  fromDate,
  getLocalTimeZone,
  toCalendarDate,
  toZoned,
  type CalendarDate,
  type DateValue,
} from '@internationalized/date'

import { parseInstant } from '../../i18n/dates'

/*
 * A deadline is one instant on the server and a calendar date plus a wall-clock time in the form.
 * These two functions are the only place where one becomes the other.
 */

/** The time a deadline gets when only its date was chosen: the end of that day. */
export const END_OF_DAY = '23:59'

export interface DeadlineParts {
  date: CalendarDate
  /** Wall-clock time as a time field holds it: `HH:MM`, 24-hour. */
  time: string
}

/** The zone the form edits in: the pinned one, or the user's own. */
export function editingTimeZone(pinned: string | undefined): string {
  return pinned ?? getLocalTimeZone()
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

/** The date and time the timestamp falls on in `timeZone`; `null` when it cannot be read. */
export function toDeadlineParts(timestamp: string, timeZone: string): DeadlineParts | null {
  const instant = parseInstant(timestamp)
  if (instant === null) return null
  const zoned = fromDate(instant, timeZone)
  return { date: toCalendarDate(zoned), time: `${twoDigits(zoned.hour)}:${twoDigits(zoned.minute)}` }
}

/** The instant of that date and time in `timeZone`, as an ISO timestamp in UTC; an empty time means the end of the day. */
export function toTimestamp(date: DateValue, time: string, timeZone: string): string {
  const [hour, minute] = (time || END_OF_DAY).split(':').map(Number)
  const local = new CalendarDateTime(date.year, date.month, date.day, hour, minute)
  return toZoned(local, timeZone).toAbsoluteString()
}
