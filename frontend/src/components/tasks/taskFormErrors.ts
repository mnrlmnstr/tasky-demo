import type { TaskUpdate } from '../../api/generated/client'
import type { FieldError } from '../../api/http'

/** The fields the form shows, in the order it shows them. */
export const FORM_FIELDS = [
  'title',
  'description',
  'status',
  'priority',
  'deadline',
] as const satisfies readonly (keyof TaskUpdate)[]

export type FormField = (typeof FORM_FIELDS)[number]

export const TITLE_MAX_LENGTH = 200

export function isFormField(field: string): field is FormField {
  return (FORM_FIELDS as readonly string[]).includes(field)
}

// What the API strips from both ends of a title: Python's `str.strip()` whitespace. Unlike JavaScript's
// `trim()` it takes the separators U+001C to U+001F and U+0085, and leaves U+FEFF.
const API_WHITESPACE = '[\t-\r\x1c-\x20\x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]'
const API_STRIPPED = new RegExp(`^${API_WHITESPACE}+|${API_WHITESPACE}+$`, 'g')

/** The title as the API stores it. */
export function apiTitle(title: string): string {
  return title.replace(API_STRIPPED, '')
}

// The API counts characters (code points), so an emoji written with two UTF-16 units counts once.
function characterCount(text: string): number {
  return [...text].length
}

/** What is wrong with the title as typed, as a message key; `null` when the API would take it. */
export function titleProblem(title: string): string | null {
  const stored = apiTitle(title)
  if (stored === '') return 'form.errors.titleRequired'
  if (characterCount(stored) > TITLE_MAX_LENGTH) return 'form.errors.titleTooLong'
  return null
}

// The error types the API answers with (pydantic's), by the message that explains them.
const MESSAGES_BY_TYPE: Record<string, string> = {
  missing: 'form.errors.required',
  string_too_short: 'form.errors.required',
  string_too_long: 'form.errors.tooLong',
  enum: 'form.errors.choice',
  extra_forbidden: 'form.errors.notAccepted',
}

// The title has its own wording for the two rules the form also checks itself.
const TITLE_MESSAGES: Record<string, string> = {
  'form.errors.required': 'form.errors.titleRequired',
  'form.errors.tooLong': 'form.errors.titleTooLong',
}

// datetime_parsing, datetime_type, datetime_from_date_parsing, timezone_aware...
const DATE_TYPE = /^(datetime|timezone)_/

/** The message key for one error of a `422` answer; a type the form does not know reads as "not valid". */
export function serverErrorMessage(error: FieldError): string {
  if (DATE_TYPE.test(error.type)) return 'form.errors.date'
  const message = MESSAGES_BY_TYPE[error.type] ?? 'form.errors.invalid'
  return (error.field === 'title' && TITLE_MESSAGES[message]) || message
}
