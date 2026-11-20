import { describe, expect, it } from 'vitest'

import type { ApiErrorKind } from '../api/http'
import { ERROR_MESSAGES, errorMessageKey } from './errorMessages'
import en from './messages/en'
import uk from './messages/uk'

const KINDS: ApiErrorKind[] = ['network', 'server', 'not_found', 'validation', 'aborted', 'client']

function messageAt(messages: typeof en, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages)
}

describe('error messages', () => {
  it.each([
    ['network', 'errors.network'],
    ['server', 'errors.server'],
    ['not_found', 'errors.not_found'],
    ['validation', 'errors.generic'],
    ['aborted', 'errors.generic'],
    ['client', 'errors.generic'],
  ] as const)('names a message for a "%s" failure', (kind, key) => {
    expect(errorMessageKey(kind)).toBe(key)
  })

  it.each([
    ['English', en],
    ['Ukrainian', uk],
  ])('point at a %s message for every kind', (_language, messages) => {
    for (const kind of KINDS) {
      expect(typeof messageAt(messages, ERROR_MESSAGES[kind])).toBe('string')
    }
  })

  it('say the server cannot be reached when the network is down, which is not what a server error says', () => {
    expect(en.errors.network).toMatch(/could not reach the server/i)
    expect(en.errors.network).toMatch(/try again/i)
    expect(en.errors.network).not.toBe(en.errors.server)
    expect(uk.errors.network).not.toBe(uk.errors.server)
  })
})
