import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'

import { CLOCK, type Clock } from '../i18n/clock'
import { LIST_VIEW_STORAGE_KEY, useListViewStore } from './listView'

let pinia: Pinia | undefined

const KYIV: Clock = { now: () => new Date('2026-11-20T10:00:00Z'), timeZone: 'Europe/Kyiv' }

function addressIs(url: string): void {
  history.replaceState(null, '', url)
}

function query(): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(location.search))
}

// A page load, inside an app that provides the clock, as main.ts would.
function loadStore(clock: Clock = KYIV) {
  pinia = createPinia()
  const app = createApp({})
  app.provide(CLOCK, clock)
  app.use(pinia)
  setActivePinia(pinia)
  return useListViewStore()
}

function savedView(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(LIST_VIEW_STORAGE_KEY) ?? 'null')
}

beforeEach(() => {
  localStorage.clear()
  addressIs('/')
})

afterEach(() => {
  if (pinia) disposePinia(pinia)
  pinia = undefined
})

describe('reading a deadline filter', () => {
  it('has no deadline filter by default', () => {
    const view = loadStore()

    expect(view.deadlineFrom).toBe('')
    expect(view.deadlineTo).toBe('')
  })

  it('reads the local days from the address', () => {
    addressIs('/?deadline_from=2026-11-20&deadline_to=2026-11-24')

    const view = loadStore()

    expect([view.deadlineFrom, view.deadlineTo]).toEqual(['2026-11-20', '2026-11-24'])
  })

  it.each([
    ['a day that does not exist', '2026-02-30'],
    ['a day with a time', '2026-11-20T00:00'],
    ['a day not in YYYY-MM-DD', '20.11.2026'],
    ['a month out of range', '2026-13-01'],
    ['the last day there is', '9999-12-31'],
    ['an empty value', ''],
  ])('drops %s, keeping the other bound', async (_case, value) => {
    addressIs(`/?deadline_from=${value}&deadline_to=2026-11-24&status=done`)

    const view = loadStore()
    await nextTick()

    expect([view.deadlineFrom, view.deadlineTo, view.status]).toEqual(['', '2026-11-24', 'done'])
    expect(query()).toEqual({ deadline_to: '2026-11-24', status: 'done' })
  })

  it('drops both bounds when the first day is after the last', async () => {
    addressIs('/?deadline_from=2026-11-25&deadline_to=2026-11-24&search=report')

    const view = loadStore()
    await nextTick()

    expect([view.deadlineFrom, view.deadlineTo]).toEqual(['', ''])
    expect(query()).toEqual({ search: 'report' })
  })

  it('restores a saved deadline filter on a bare address', async () => {
    localStorage.setItem(
      LIST_VIEW_STORAGE_KEY,
      JSON.stringify({ search: '', status: 'all', ordering: 'deadline', deadlineFrom: '2026-11-20', deadlineTo: '' }),
    )

    const view = loadStore()
    await nextTick()

    expect(view.deadlineFrom).toBe('2026-11-20')
    expect(query()).toEqual({ ordering: 'deadline', deadline_from: '2026-11-20' })
  })

  it('falls back to no deadline filter for saved bounds that are not days', () => {
    localStorage.setItem(LIST_VIEW_STORAGE_KEY, JSON.stringify({ deadlineFrom: 20, deadlineTo: ['2026-11-20'] }))

    const view = loadStore()

    expect([view.deadlineFrom, view.deadlineTo]).toEqual(['', ''])
  })
})

describe('changing the deadline filter', () => {
  it('puts the days into the address and saves them', async () => {
    const view = loadStore()

    view.setDeadline('2026-11-20', '2026-11-24')
    await nextTick()

    expect(query()).toEqual({ deadline_from: '2026-11-20', deadline_to: '2026-11-24' })
    expect(savedView()).toMatchObject({ deadlineFrom: '2026-11-20', deadlineTo: '2026-11-24' })
  })

  it('starts the list again from page 1', async () => {
    addressIs('/?page=4')
    const view = loadStore()

    view.setDeadline('2026-11-20', '2026-11-20')
    await nextTick()

    expect(view.page).toBe(1)
    expect(query()).toEqual({ deadline_from: '2026-11-20', deadline_to: '2026-11-20' })
  })

  it('adds one history entry for the pair', async () => {
    const view = loadStore()
    const entries = history.length

    view.setDeadline('2026-11-20', '2026-11-24')
    await nextTick()

    expect(history.length).toBe(entries + 1)
  })

  it('changes nothing when set to the bounds it already has', async () => {
    addressIs('/?deadline_to=2026-11-20&page=3')
    const view = loadStore()
    const entries = history.length

    view.setDeadline('', '2026-11-20')
    await nextTick()

    expect(view.page).toBe(3)
    expect(history.length).toBe(entries)
  })

  it('falls back to no deadline filter for bounds in the wrong order or not days', () => {
    const view = loadStore()

    view.setDeadline('2026-11-24', '2026-11-20')
    const reversed = [view.deadlineFrom, view.deadlineTo]
    view.setDeadline('2026-11-20', 'soon')

    expect(reversed).toEqual(['', ''])
    expect([view.deadlineFrom, view.deadlineTo]).toEqual(['2026-11-20', ''])
  })

  it('counts as a filter, and clearing the filters clears it', async () => {
    addressIs('/?deadline_from=2026-11-20&ordering=deadline')
    const view = loadStore()
    const filtered = view.isFiltered

    view.clearFilters()
    await nextTick()

    expect(filtered).toBe(true)
    expect(view.isFiltered).toBe(false)
    expect([view.deadlineFrom, view.deadlineTo]).toEqual(['', ''])
    expect(query()).toEqual({ ordering: 'deadline' })
  })

  it('counts a last day alone as a filter', () => {
    addressIs('/?deadline_to=2026-11-20')

    expect(loadStore().isFiltered).toBe(true)
  })
})

describe('asking the API for a deadline range', () => {
  it('sends local midnight of the first day and local midnight after the last, in UTC', () => {
    addressIs('/?deadline_from=2026-11-20&deadline_to=2026-11-24&status=todo')

    expect(loadStore().queryParams).toEqual({
      status: 'todo',
      ordering: '-created_at',
      page: 1,
      deadline_from: '2026-11-19T22:00:00.000Z',
      deadline_to: '2026-11-24T22:00:00.000Z',
    })
  })

  it('sends a single day as the 24 hours of that day', () => {
    addressIs('/?deadline_from=2026-11-20&deadline_to=2026-11-20')

    const { deadline_from, deadline_to } = loadStore().queryParams

    expect([deadline_from, deadline_to]).toEqual(['2026-11-19T22:00:00.000Z', '2026-11-20T22:00:00.000Z'])
  })

  it('sends the 23 hours of the day the clocks go forward in Kyiv', () => {
    addressIs('/?deadline_from=2026-03-29&deadline_to=2026-03-29')

    const { deadline_from, deadline_to } = loadStore().queryParams

    expect([deadline_from, deadline_to]).toEqual(['2026-03-28T22:00:00.000Z', '2026-03-29T21:00:00.000Z'])
  })

  it('sends the 25 hours of the day the clocks go back in Kyiv', () => {
    addressIs('/?deadline_from=2026-10-25&deadline_to=2026-10-25')

    const { deadline_from, deadline_to } = loadStore().queryParams

    expect([deadline_from, deadline_to]).toEqual(['2026-10-24T21:00:00.000Z', '2026-10-25T22:00:00.000Z'])
  })

  it('sends only the bound that is set', () => {
    addressIs('/?deadline_to=2026-11-20')

    const params = loadStore().queryParams

    expect(params.deadline_to).toBe('2026-11-20T22:00:00.000Z')
    expect('deadline_from' in params).toBe(false)
  })

  it('reads the days in the zone of the clock', () => {
    addressIs('/?deadline_from=2026-11-20')

    const params = loadStore({ now: () => new Date(), timeZone: 'America/New_York' }).queryParams

    expect(params.deadline_from).toBe('2026-11-20T05:00:00.000Z')
  })
})
