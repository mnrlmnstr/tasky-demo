import { describe, expect, it } from 'vitest'

import { isFormField, serverErrorMessage, titleProblem } from './taskFormErrors'

describe('title rules of the form', () => {
  it('takes a title with text in it', () => {
    expect(titleProblem('Write report')).toBeNull()
  })

  it.each(['', '   ', '\n\t'])('asks for a title when it is %j', (title) => {
    expect(titleProblem(title)).toBe('form.errors.titleRequired')
  })

  it('takes a title of exactly 200 characters', () => {
    expect(titleProblem('a'.repeat(200))).toBeNull()
  })

  it('refuses a title of 201 characters', () => {
    expect(titleProblem('a'.repeat(201))).toBe('form.errors.titleTooLong')
  })

  it('does not count the spaces around the title, as the API trims them', () => {
    expect(titleProblem(`  ${'a'.repeat(200)}  `)).toBeNull()
  })
})

describe('errors of a 422 answer', () => {
  it.each([
    ['title', 'missing', 'form.errors.titleRequired'],
    ['title', 'string_too_short', 'form.errors.titleRequired'],
    ['title', 'string_too_long', 'form.errors.titleTooLong'],
    ['title', 'value_error', 'form.errors.invalid'],
    ['description', 'string_too_long', 'form.errors.tooLong'],
    ['status', 'missing', 'form.errors.required'],
    ['status', 'enum', 'form.errors.choice'],
    ['priority', 'enum', 'form.errors.choice'],
    ['deadline', 'datetime_parsing', 'form.errors.date'],
    ['deadline', 'datetime_from_date_parsing', 'form.errors.date'],
    ['deadline', 'datetime_type', 'form.errors.date'],
    ['deadline', 'timezone_aware', 'form.errors.date'],
    ['deadline', 'value_error', 'form.errors.invalid'],
    ['owner', 'extra_forbidden', 'form.errors.notAccepted'],
    ['title', 'something_new', 'form.errors.invalid'],
  ])('explains %s: %s with %s', (field, type, message) => {
    expect(serverErrorMessage({ field, type })).toBe(message)
  })

  it('knows which fields the form shows', () => {
    expect(['title', 'description', 'status', 'priority', 'deadline'].every(isFormField)).toBe(true)
    expect(isFormField('owner')).toBe(false)
  })
})
