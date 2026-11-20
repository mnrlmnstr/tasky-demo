import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from 'vue'

import { CLOCK, type Clock } from '../i18n/clock'
import { useListViewStore } from './listView'

let pinia: Pinia | undefined

const KYIV: Clock = { now: () => new Date('2026-11-20T10:00:00Z'), timeZone: 'Europe/Kyiv' }

function loadStore(clock: Clock = KYIV) {
  pinia = createPinia()
  const app = createApp({})
  app.provide(CLOCK, clock)
  app.use(pinia)
  setActivePinia(pinia)
  return useListViewStore()
}

// What the API's datetime parsing (pydantic, Python's datetime) takes: years 1 to 9999.
function apiReadsInstant(instant: string | undefined): boolean {
  const match = /^(\d{4})-\d{2}-\d{2}T/.exec(instant ?? '')
  return match !== null && Number(match[1]) >= 1
}

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
})

afterEach(() => {
  if (pinia) disposePinia(pinia)
  pinia = undefined
})

describe('the first day there is, in a zone east of UTC (adversary)', () => {
  // listView keeps a day only when the API can be sent its bounds ("A real calendar day whose next day is
  // one too, since the API is sent the midnight after the last day"); #35 "A shared URL with a date filter
  // reproduces the same list". Local midnight of 1 Jan 0001 in Kyiv is in year 0, which the API answers
  // with a 422, so the list only ever shows an error.
  it('never sends the API a deadline_from it cannot read', () => {
    history.replaceState(null, '', '/?deadline_from=0001-01-01')

    const view = loadStore()

    const sent = view.queryParams.deadline_from
    expect(sent === undefined || apiReadsInstant(sent)).toBe(true)
  })
})
