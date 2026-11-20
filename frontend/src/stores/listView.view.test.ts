import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { LIST_VIEW_STORAGE_KEY, TASK_VIEWS, useListViewStore } from './listView'

let pinia: Pinia | undefined

function addressIs(url: string): void {
  history.replaceState(null, '', url)
}

function query(): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(location.search))
}

// A fresh pinia stands for a page load: the store is built again from the address bar and what the browser saved.
function loadStore() {
  pinia = createPinia()
  setActivePinia(pinia)
  return useListViewStore()
}

function savedViewIs(value: unknown): void {
  localStorage.setItem(LIST_VIEW_STORAGE_KEY, JSON.stringify(value))
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

describe('the way the tasks are shown', () => {
  it('knows the list, the board and the table', () => {
    expect(TASK_VIEWS).toEqual(['list', 'board', 'table'])
  })

  it('is the list on a bare address with nothing saved', () => {
    expect(loadStore().view).toBe('list')
  })

  it('is the one the address names', () => {
    addressIs('/?view=board')

    expect(loadStore().view).toBe('board')
  })

  it('falls back to the list for a view that does not exist, and cleans it out of the address', async () => {
    addressIs('/?view=calendar&search=report')

    const view = loadStore()
    await nextTick()

    expect(view.view).toBe('list')
    expect(view.search).toBe('report')
    expect(query()).toEqual({ search: 'report' })
  })

  it('goes into the address, and the list, being the default, stays out of it', async () => {
    const view = loadStore()

    view.view = 'table'
    await nextTick()
    expect(query()).toEqual({ view: 'table' })

    view.view = 'list'
    await nextTick()
    expect(query()).toEqual({})
  })

  it('falls back to the list when given a view that does not exist', () => {
    const view = loadStore()
    view.view = 'board'

    view.view = 'calendar' as never

    expect(view.view).toBe('list')
  })

  it('keeps the search, status, ordering and page when it changes', async () => {
    addressIs('/?search=report&status=done&ordering=deadline&page=3')
    const view = loadStore()

    view.view = 'table'
    await nextTick()

    expect([view.search, view.status, view.ordering, view.page]).toEqual(['report', 'done', 'deadline', 3])
    expect(query()).toEqual({ search: 'report', status: 'done', ordering: 'deadline', page: '3', view: 'table' })
  })

  it('adds a history entry when it changes, so back returns to the view before', async () => {
    const view = loadStore()
    const before = history.length

    view.view = 'board'
    await nextTick()

    expect(history.length).toBe(before + 1)
  })

  it('is not a filter, so the list is not filtered by it', () => {
    const view = loadStore()

    view.view = 'board'

    expect(view.isFiltered).toBe(false)
  })

  it('does not count the status filter as a filter on the board, which does not apply it', () => {
    addressIs('/?status=done&view=board')
    const view = loadStore()

    expect(view.isFiltered).toBe(false)
    view.view = 'list'
    expect(view.isFiltered).toBe(true)
  })

  it('keeps the status filter for the list when the filters are cleared on the board', () => {
    addressIs('/?status=done&search=report&view=board')
    const view = loadStore()

    view.clearFilters()

    expect([view.search, view.status]).toEqual(['', 'done'])
  })

  it('stays when the filters are cleared', () => {
    addressIs('/?search=report&view=board')
    const view = loadStore()

    view.clearFilters()

    expect(view.view).toBe('board')
    expect(view.search).toBe('')
  })

  it('is not sent to the API', () => {
    addressIs('/?view=table')

    expect(loadStore().queryParams).toEqual({ ordering: '-created_at', page: 1 })
  })
})

describe('remembering the view', () => {
  it('saves the view with the filters', () => {
    const view = loadStore()

    view.view = 'board'

    expect(savedView()).toMatchObject({ view: 'board' })
  })

  it('restores the saved view on a bare address', async () => {
    savedViewIs({ view: 'table', search: 'report' })

    const view = loadStore()
    await nextTick()

    expect(view.view).toBe('table')
    expect(query()).toEqual({ search: 'report', view: 'table' })
  })

  it('falls back to the list when the saved view does not exist, keeping the rest', () => {
    savedViewIs({ view: 'calendar', search: 'report' })

    const view = loadStore()

    expect(view.view).toBe('list')
    expect(view.search).toBe('report')
  })
})
