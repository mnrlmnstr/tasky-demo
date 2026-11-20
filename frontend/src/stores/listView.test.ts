import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { LIST_VIEW_STORAGE_KEY, useListViewStore } from './listView'

let pinia: Pinia | undefined

function addressIs(url: string): void {
  history.replaceState(null, '', url)
}

function address(): string {
  return location.pathname + location.search + location.hash
}

function query(): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(location.search))
}

type ListView = ReturnType<typeof useListViewStore>

// A fresh pinia stands for a page load: the store is built again from the address bar and what the browser saved.
function loadStore() {
  pinia = createPinia()
  setActivePinia(pinia)
  return useListViewStore()
}

const NO_DEADLINE = { deadlineFrom: '', deadlineTo: '' }

function savedViewIs(value: unknown): void {
  localStorage.setItem(LIST_VIEW_STORAGE_KEY, JSON.stringify(value))
}

function savedView(): unknown {
  return JSON.parse(localStorage.getItem(LIST_VIEW_STORAGE_KEY) ?? 'null')
}

// The browser tells the page about back and forward with a popstate event once the address has changed.
function arrival(): Promise<void> {
  return new Promise((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true })
  })
}

async function goBack(): Promise<void> {
  const arrived = arrival()
  history.back()
  await arrived
}

// happy-dom drops the forward entries on any replaceState (a browser keeps them), so history.forward() has
// nowhere to go here once the store has seen a popstate. This stands in for the browser arriving at an entry.
function browserArrivesAt(url: string): void {
  history.replaceState(null, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

beforeEach(() => {
  localStorage.clear()
  addressIs('/')
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (pinia) disposePinia(pinia)
  pinia = undefined
})

describe('opening the app', () => {
  it('shows the default view on a bare address with nothing saved', () => {
    const view = loadStore()

    expect(view.search).toBe('')
    expect(view.status).toBe('all')
    expect(view.ordering).toBe('-created_at')
    expect(view.page).toBe(1)
  })

  it('shows the view the address describes', () => {
    addressIs('/?search=report&status=in_progress&ordering=deadline&page=3')

    const view = loadStore()

    expect(view.search).toBe('report')
    expect(view.status).toBe('in_progress')
    expect(view.ordering).toBe('deadline')
    expect(view.page).toBe(3)
  })

  it('reads a search in Ukrainian from an encoded address', () => {
    addressIs('/?search=%D0%B7%D0%B2%D1%96%D1%82')

    const view = loadStore()

    expect(view.search).toBe('звіт')
  })

  it('trims the search it reads from the address', () => {
    addressIs('/?search=%20%20report%20')

    const view = loadStore()

    expect(view.search).toBe('report')
  })

  it.each([
    ['status=archived', 'an unknown status'],
    ['status=', 'an empty status'],
    ['status=todo&status=done', 'a repeated status'],
  ])('falls back to all statuses for %s (%s)', (query) => {
    addressIs(`/?${query}`)

    const view = loadStore()

    expect(view.status).toBe('all')
  })

  it.each([
    ['ordering=title', 'an unknown ordering'],
    ['ordering=', 'an empty ordering'],
    ['ordering=deadline&ordering=created_at', 'a repeated ordering'],
  ])('falls back to newest first for %s (%s)', (query) => {
    addressIs(`/?${query}`)

    const view = loadStore()

    expect(view.ordering).toBe('-created_at')
  })

  it.each([
    ['page=0', 'zero'],
    ['page=-2', 'a negative number'],
    ['page=1.5', 'a fraction'],
    ['page=2e3', 'an exponent'],
    ['page=abc', 'text'],
    ['page=', 'nothing'],
    ['page=%202', 'a padded number'],
    ['page=2&page=3', 'a repeated page'],
    ['page=99999999999999999999', 'a number too large to count'],
  ])('falls back to page 1 for %s (%s)', (query) => {
    addressIs(`/?${query}`)

    const view = loadStore()

    expect(view.page).toBe(1)
  })

  it('reads a repeated search as no search', () => {
    addressIs('/?search=a&search=b')

    const view = loadStore()

    expect(view.search).toBe('')
  })

  it('keeps the valid fields when another one is invalid', () => {
    addressIs('/?status=archived&ordering=deadline&page=x&search=report')

    const view = loadStore()

    expect(view.search).toBe('report')
    expect(view.status).toBe('all')
    expect(view.ordering).toBe('deadline')
    expect(view.page).toBe(1)
  })

  it('cleans invalid values out of the address without adding a history entry', async () => {
    addressIs('/?status=archived&ordering=deadline&page=x&search=%20report')
    const entries = history.length

    loadStore()
    await nextTick()

    expect(query()).toEqual({ search: 'report', ordering: 'deadline' })
    expect(history.length).toBe(entries)
  })
})

describe('changing the view', () => {
  it('puts every non-default field into the address', async () => {
    const view = loadStore()

    view.search = 'звіт'
    view.status = 'done'
    view.ordering = 'deadline'
    view.page = 2
    await nextTick()

    expect(query()).toEqual({ search: 'звіт', status: 'done', ordering: 'deadline', page: '2' })
  })

  it('leaves the fields that are back at their defaults out of the address', async () => {
    addressIs('/?search=report&status=done&ordering=deadline&page=2')
    const view = loadStore()

    view.page = 1
    view.search = ''
    view.status = 'all'
    view.ordering = '-created_at'
    await nextTick()

    expect(address()).toBe('/')
  })

  it('keeps parameters it does not own and the hash', async () => {
    addressIs('/?ref=mail#top')
    const view = loadStore()

    view.status = 'todo'
    await nextTick()

    expect(query()).toEqual({ ref: 'mail', status: 'todo' })
    expect(location.hash).toBe('#top')
  })

  it('trims the search it is given', () => {
    const view = loadStore()

    view.search = '  report '

    expect(view.search).toBe('report')
  })

  it('treats a search of only spaces as no search', async () => {
    addressIs('/?search=report')
    const view = loadStore()

    view.search = '   '
    await nextTick()

    expect(view.search).toBe('')
    expect(address()).toBe('/')
  })

  it.each([
    ['search', (view: ListView) => (view.search = 'plan')],
    ['status', (view: ListView) => (view.status = 'todo')],
    ['ordering', (view: ListView) => (view.ordering = '-deadline')],
  ])('goes back to page 1 when the %s changes', (_field, change) => {
    addressIs('/?search=report&status=done&ordering=deadline&page=4')
    const view = loadStore()

    change(view)

    expect(view.page).toBe(1)
  })

  it.each([
    ['search', (view: ListView) => (view.search = ' report ')],
    ['status', (view: ListView) => (view.status = 'done')],
    ['ordering', (view: ListView) => (view.ordering = 'deadline')],
  ])('stays on the page when the %s is set to what it already is', (_field, change) => {
    addressIs('/?search=report&status=done&ordering=deadline&page=4')
    const view = loadStore()

    change(view)

    expect(view.page).toBe(4)
  })

  it('keeps the filters when the page changes', () => {
    addressIs('/?search=report&status=done&ordering=deadline')
    const view = loadStore()

    view.page = 5

    expect(view.page).toBe(5)
    expect(view.search).toBe('report')
    expect(view.status).toBe('done')
    expect(view.ordering).toBe('deadline')
  })

  it.each([0, -3, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('goes to page 1 when asked for page %s', (page) => {
    addressIs('/?page=4')
    const view = loadStore()

    view.page = page

    expect(view.page).toBe(1)
  })
})

describe('values the types do not allow', () => {
  it('falls back to all statuses for a status that does not exist', () => {
    addressIs('/?status=done')
    const view = loadStore()

    view.status = 'archived' as never

    expect(view.status).toBe('all')
  })

  it('falls back to newest first for an ordering that does not exist', () => {
    addressIs('/?ordering=deadline')
    const view = loadStore()

    view.ordering = 'title' as never

    expect(view.ordering).toBe('-created_at')
  })
})

describe('clearing the filters', () => {
  it('returns the search, status and page to their defaults', async () => {
    addressIs('/?search=report&status=done&page=4')
    const view = loadStore()

    view.clearFilters()
    await nextTick()

    expect(view.search).toBe('')
    expect(view.status).toBe('all')
    expect(view.page).toBe(1)
    expect(address()).toBe('/')
  })

  it('keeps the ordering, which is not a filter', async () => {
    addressIs('/?search=report&status=done&ordering=deadline&page=4')
    const view = loadStore()

    view.clearFilters()
    await nextTick()

    expect(view.ordering).toBe('deadline')
    expect(address()).toBe('/?ordering=deadline')
  })

  it('tells who listens, before the view changes, every time the filters are cleared', () => {
    addressIs('/?search=report')
    const view = loadStore()
    const seen: string[] = []
    view.onFiltersCleared(() => {
      seen.push(view.search)
    })

    view.clearFilters()
    view.clearFilters()

    expect(seen).toEqual(['report', ''])
  })

  it('leaves the page alone when no filter is set', async () => {
    addressIs('/?ordering=deadline&page=4')
    const view = loadStore()

    view.clearFilters()
    await nextTick()

    expect(address()).toBe('/?ordering=deadline&page=4')
  })
})

describe('correcting the page', () => {
  it('shows the corrected page, in the address too', async () => {
    addressIs('/?status=done&page=9')
    const view = loadStore()

    view.correctPage(3)
    await nextTick()

    expect(view.page).toBe(3)
    expect(address()).toBe('/?status=done&page=3')
  })

  it('adds no history entry, so back does not return to the page that was wrong', async () => {
    const view = loadStore()
    view.status = 'done'
    await nextTick()
    view.page = 9
    await nextTick()
    const entries = history.length

    view.correctPage(3)
    await nextTick()

    expect(history.length).toBe(entries)

    await goBack()

    expect(address()).toBe('/?status=done')
  })

  it('falls back to the first page for a page that cannot be one', async () => {
    addressIs('/?page=4')
    const view = loadStore()

    view.correctPage(0)
    await nextTick()

    expect(view.page).toBe(1)
    expect(address()).toBe('/')
  })
})

describe('telling a filtered list from a full one', () => {
  it('is not filtered in the default view', () => {
    expect(loadStore().isFiltered).toBe(false)
  })

  it.each(['search=report', 'status=todo', 'search=report&status=done'])('is filtered with %s', (queryString) => {
    addressIs(`/?${queryString}`)

    expect(loadStore().isFiltered).toBe(true)
  })

  it('is not filtered by an ordering or a page alone', () => {
    addressIs('/?ordering=deadline&page=3')

    expect(loadStore().isFiltered).toBe(false)
  })

  it('stops being filtered once the filters are cleared', () => {
    addressIs('/?search=report&status=done')
    const view = loadStore()

    view.clearFilters()

    expect(view.isFiltered).toBe(false)
  })
})

describe('asking the API for the list', () => {
  it('sends only the ordering and the page in the default view', () => {
    expect(loadStore().queryParams).toEqual({ ordering: '-created_at', page: 1 })
  })

  it('sends the search and the status when they are set', () => {
    addressIs('/?search=report&status=in_progress&ordering=-deadline&page=2')

    expect(loadStore().queryParams).toEqual({
      search: 'report',
      status: 'in_progress',
      ordering: '-deadline',
      page: 2,
    })
  })

  it('follows a change of the view', () => {
    addressIs('/?page=3')
    const view = loadStore()

    view.status = 'done'

    expect(view.queryParams).toEqual({ status: 'done', ordering: '-created_at', page: 1 })
  })
})

describe('browser history', () => {
  it.each([
    ['status', (view: ListView) => (view.status = 'todo')],
    ['ordering', (view: ListView) => (view.ordering = 'deadline')],
    ['page', (view: ListView) => (view.page = 2)],
    ['cleared filters', (view: ListView) => view.clearFilters()],
  ])('adds one entry for a change of %s', async (_field, change) => {
    addressIs('/?search=report')
    const view = loadStore()
    const entries = history.length

    change(view)
    await nextTick()

    expect(history.length).toBe(entries + 1)
  })

  it('adds no entry while a search is typed', async () => {
    const view = loadStore()
    const entries = history.length

    view.search = 'r'
    await nextTick()
    view.search = 're'
    await nextTick()

    expect(history.length).toBe(entries)
    expect(query()).toEqual({ search: 're' })
  })

  it.each([
    ['status', (view: ListView) => (view.status = 'done')],
    ['ordering', (view: ListView) => (view.ordering = 'deadline')],
    ['page', (view: ListView) => (view.page = 4)],
  ])('adds no entry when the %s is set to what it already is', async (_field, change) => {
    addressIs('/?status=done&ordering=deadline&page=4')
    const view = loadStore()
    const entries = history.length

    change(view)
    await nextTick()

    expect(history.length).toBe(entries)
  })

  it('adds no entry when there is nothing to clear', async () => {
    const view = loadStore()
    const entries = history.length

    view.clearFilters()
    await nextTick()

    expect(history.length).toBe(entries)
  })

  it('adds one entry for several changes made at once', async () => {
    const view = loadStore()
    const entries = history.length

    view.status = 'done'
    view.ordering = 'deadline'
    await nextTick()

    expect(history.length).toBe(entries + 1)
    expect(query()).toEqual({ status: 'done', ordering: 'deadline' })
  })

  it('adds an entry for each change made one after another', async () => {
    const view = loadStore()
    const entries = history.length

    view.status = 'done'
    await nextTick()
    view.page = 2
    await nextTick()

    expect(history.length).toBe(entries + 2)
  })

  it('shows the previous views on back, one change at a time', async () => {
    addressIs('/?search=report')
    const view = loadStore()
    view.status = 'done'
    await nextTick()
    view.page = 3
    await nextTick()

    await goBack()
    const afterBack = { ...view.queryParams }
    await goBack()
    const afterSecondBack = { ...view.queryParams }

    expect(afterBack).toEqual({ search: 'report', status: 'done', ordering: '-created_at', page: 1 })
    expect(afterSecondBack).toEqual({ search: 'report', ordering: '-created_at', page: 1 })
  })

  it('shows the view of the entry the browser moves forward to', () => {
    const view = loadStore()

    browserArrivesAt('/?search=report&status=done&page=3')

    expect(view.queryParams).toEqual({ search: 'report', status: 'done', ordering: '-created_at', page: 3 })
  })

  it('shows the default view when the browser arrives at a bare address, whatever is saved', () => {
    addressIs('/?status=done')
    const view = loadStore()

    browserArrivesAt('/')

    expect(view.queryParams).toEqual({ ordering: '-created_at', page: 1 })
  })

  it('falls back field by field when the browser arrives at an address with invalid values', () => {
    const view = loadStore()

    browserArrivesAt('/?status=archived&ordering=deadline&page=0')

    expect(view.queryParams).toEqual({ ordering: 'deadline', page: 1 })
  })

  it('stops following the address once the app is gone', () => {
    const view = loadStore()
    disposePinia(pinia!)
    pinia = undefined

    browserArrivesAt('/?status=done')

    expect(view.status).toBe('all')
  })

  it('accepts a change right after coming back', async () => {
    const view = loadStore()
    view.status = 'done'
    await nextTick()
    await goBack()
    await nextTick()

    view.ordering = 'deadline'
    await nextTick()

    expect(query()).toEqual({ ordering: 'deadline' })
  })
})

describe('remembering the view', () => {
  it('saves the search, status and ordering on every change, without the page', () => {
    const view = loadStore()

    view.search = 'report'
    view.status = 'done'
    view.ordering = 'deadline'
    view.page = 3

    expect(savedView()).toEqual({ ...NO_DEADLINE, search: 'report', status: 'done', ordering: 'deadline', view: 'list' })
  })

  it('saves the cleared view', () => {
    addressIs('/?search=report&status=done&ordering=deadline')
    const view = loadStore()

    view.clearFilters()

    expect(savedView()).toEqual({ ...NO_DEADLINE, search: '', status: 'all', ordering: 'deadline', view: 'list' })
  })

  it('saves the view a shared address opened', () => {
    savedViewIs({ search: 'old', status: 'todo', ordering: 'deadline' })
    addressIs('/?status=done')

    loadStore()

    expect(savedView()).toEqual({ ...NO_DEADLINE, search: '', status: 'done', ordering: '-created_at', view: 'list' })
  })

  it('saves the view that back returns to', async () => {
    const view = loadStore()
    view.status = 'done'
    await nextTick()

    await goBack()

    expect(savedView()).toEqual({ ...NO_DEADLINE, search: '', status: 'all', ordering: '-created_at', view: 'list' })
  })

  it('restores the saved view on a bare address, in the address bar too, without a history entry', async () => {
    savedViewIs({ search: 'звіт', status: 'in_progress', ordering: '-deadline' })
    const entries = history.length

    const view = loadStore()
    await nextTick()

    expect(view.search).toBe('звіт')
    expect(view.status).toBe('in_progress')
    expect(view.ordering).toBe('-deadline')
    expect(query()).toEqual({ search: 'звіт', status: 'in_progress', ordering: '-deadline' })
    expect(history.length).toBe(entries)
  })

  it('opens the restored view on page 1 even if a page was saved', () => {
    savedViewIs({ search: 'report', status: 'done', ordering: 'deadline', page: 7 })

    const view = loadStore()

    expect(view.page).toBe(1)
    expect(view.search).toBe('report')
  })

  it('restores the saved view when the address only carries parameters it does not own', () => {
    savedViewIs({ search: 'report', status: 'done', ordering: 'deadline' })
    addressIs('/?ref=mail')

    const view = loadStore()

    expect(view.queryParams).toEqual({ search: 'report', status: 'done', ordering: 'deadline', page: 1 })
  })

  it.each([
    ['search=plan', { search: 'plan', ordering: '-created_at', page: 1 }],
    ['status=todo', { status: 'todo', ordering: '-created_at', page: 1 }],
    ['ordering=created_at', { ordering: 'created_at', page: 1 }],
    ['page=2', { ordering: '-created_at', page: 2 }],
    ['status=archived', { ordering: '-created_at', page: 1 }],
    ['search=', { ordering: '-created_at', page: 1 }],
  ])('lets an address with %s win over the saved view', (queryString, expected) => {
    savedViewIs({ search: 'report', status: 'done', ordering: 'deadline' })
    addressIs(`/?${queryString}`)

    const view = loadStore()

    expect(view.queryParams).toEqual(expected)
  })

  it('falls back field by field when the saved view holds invalid values', () => {
    savedViewIs({ search: 42, status: 'archived', ordering: 'deadline' })

    const view = loadStore()

    expect(view.search).toBe('')
    expect(view.status).toBe('all')
    expect(view.ordering).toBe('deadline')
  })

  it('keeps the saved search and status when the saved ordering is invalid', () => {
    savedViewIs({ search: ' report ', status: 'todo', ordering: ['deadline'] })

    const view = loadStore()

    expect(view.queryParams).toEqual({ search: 'report', status: 'todo', ordering: '-created_at', page: 1 })
  })

  it.each([
    ['null', 'null'],
    ['a string', '"done"'],
    ['a number', '7'],
    ['an array', '["report","done","deadline"]'],
    ['an empty object', '{}'],
    ['broken JSON', '{"search":'],
    ['nothing', ''],
  ])('shows the default view when storage holds %s', (_what, raw) => {
    localStorage.setItem(LIST_VIEW_STORAGE_KEY, raw)

    const view = loadStore()

    expect(view.queryParams).toEqual({ ordering: '-created_at', page: 1 })
    expect(view.isFiltered).toBe(false)
  })

  it('shows the default view when local storage refuses to read', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('access denied', 'SecurityError')
      },
      setItem: () => {
        throw new DOMException('access denied', 'SecurityError')
      },
    })

    const view = loadStore()

    expect(view.queryParams).toEqual({ ordering: '-created_at', page: 1 })
  })

  it('keeps working when there is no local storage', async () => {
    vi.stubGlobal('localStorage', undefined)
    const view = loadStore()

    view.status = 'done'
    await nextTick()

    expect(view.status).toBe('done')
    expect(query()).toEqual({ status: 'done' })
  })

  it('keeps working when local storage refuses to save', async () => {
    const view = loadStore()
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      },
    })

    view.search = 'report'
    await nextTick()

    expect(view.search).toBe('report')
    expect(query()).toEqual({ search: 'report' })
  })
})
