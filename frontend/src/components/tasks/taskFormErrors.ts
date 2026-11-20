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

/** What is wrong with the title as typed, as a message key; `null` when the API would take it. */
export function titleProblem(title: string): string | null {
  const trimmed = title.trim()
  if (trimmed === '') return 'form.errors.titleRequired'
  if (trimmed.length > TITLE_MAX_LENGTH) return 'form.errors.titleTooLong'
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
