import { describe, expect, it } from 'vitest'

import { requestUrl } from './requestUrl'

describe('requestUrl', () => {
  it('resolves a relative path against a base', () => {
    expect(requestUrl('/api/v1/tasks?page=2').pathname).toBe('/api/v1/tasks')
    expect(requestUrl('/api/v1/tasks?page=2').searchParams.get('page')).toBe('2')
  })

  it('reads the address of a URL', () => {
    expect(requestUrl(new URL('http://example.test/api/v1/tasks/7')).pathname).toBe('/api/v1/tasks/7')
  })

  it('reads the address of a Request', () => {
    expect(requestUrl(new Request('http://example.test/api/v1/health')).pathname).toBe('/api/v1/health')
  })
})
