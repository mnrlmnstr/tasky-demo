import { describe, expect, it } from 'vitest'

import { formatNumber } from './numbers'

describe('numbers for the current language', () => {
  it('groups thousands with a comma in English', () => {
    expect(formatNumber(1234, 'en')).toBe('1,234')
  })

  it('groups thousands with a no-break space in Ukrainian', () => {
    expect(formatNumber(1234, 'uk')).toBe('1 234')
  })

  it.each(['en', 'uk'])('leaves a small number as it is in %s', (locale) => {
    expect(formatNumber(42, locale)).toBe('42')
  })
})
