import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { oneOf, readStored, writeStored } from './storage'

const KEY = 'tasky:test'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('picking an allowed value', () => {
  it('keeps a value that is allowed', () => {
    expect(oneOf(['a', 'b'] as const, 'b', 'a')).toBe('b')
  })

  it.each([['c'], [undefined], [null], [1], [['b']]])('falls back for %j', (value) => {
    expect(oneOf(['a', 'b'] as const, value, 'a')).toBe('a')
  })

  it('does not take a number written as text for the number', () => {
    expect(oneOf([10, 20] as const, '20', 10)).toBe(10)
  })
})

describe('reading what was saved', () => {
  it('returns what was written under the key', () => {
    writeStored(KEY, { theme: 'dark', pageSize: 50 })

    expect(readStored(KEY)).toEqual({ theme: 'dark', pageSize: 50 })
  })

  it('writes one JSON text under the key', () => {
    writeStored(KEY, { theme: 'dark' })

    expect(localStorage.getItem(KEY)).toBe('{"theme":"dark"}')
  })

  it('reads nothing when nothing was saved', () => {
    expect(readStored(KEY)).toBeNull()
  })

  it('reads nothing when the saved text is not JSON', () => {
    localStorage.setItem(KEY, '{theme: dark')

    expect(readStored(KEY)).toBeNull()
  })

  it('reads nothing when local storage refuses to read', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('access denied', 'SecurityError')
      },
    })

    expect(readStored(KEY)).toBeNull()
  })

  it('reads nothing when there is no local storage', () => {
    vi.stubGlobal('localStorage', undefined)

    expect(readStored(KEY)).toBeNull()
  })
})

describe('saving', () => {
  it('does not throw when local storage refuses to write', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      },
    })

    expect(() => writeStored(KEY, { theme: 'dark' })).not.toThrow()
  })

  it('does not throw when there is no local storage', () => {
    vi.stubGlobal('localStorage', undefined)

    expect(() => writeStored(KEY, { theme: 'dark' })).not.toThrow()
  })
})
