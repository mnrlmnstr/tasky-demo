import { describe, expect, it } from 'vitest'

import { getListTasksUrl } from './generated/client'
import { toQueryString } from './query'

describe('toQueryString', () => {
  it('writes each parameter as name=value, in the order given', () => {
    expect(toQueryString({ status: 'todo', page: 2, page_size: 10 })).toBe('status=todo&page=2&page_size=10')
  })

  it('is empty when there are no parameters', () => {
    expect(toQueryString()).toBe('')
    expect(toQueryString({})).toBe('')
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
  ])('leaves out a parameter that is %s', (_name, missing) => {
    expect(toQueryString({ status: missing, page: 1 })).toBe('page=1')
  })

  it.each([
    ['zero', 0, 'page=0'],
    ['false', false, 'page=false'],
    ['an empty string', '', 'page='],
    ['the text "null"', 'null', 'page=null'],
  ])('keeps a parameter that is %s', (_name, value, expected) => {
    expect(toQueryString({ page: value })).toBe(expected)
  })

  it('escapes characters that have a meaning in a query string', () => {
    expect(toQueryString({ search: 'milk & honey=50%' })).toBe('search=milk+%26+honey%3D50%25')
  })
})

describe('list tasks URL', () => {
  it.each([['ordering'], ['page'], ['page_size'], ['status'], ['search']])(
    'leaves %s out of the query string when it is null',
    (name) => {
      // What an untyped caller (a cleared form field, a parsed route query) can hand over.
      const url = getListTasksUrl({ [name]: null })

      expect(url).toBe('/api/v1/tasks')
    },
  )
})
