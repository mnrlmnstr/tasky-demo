import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import type { TaskRead } from '../api/generated/client'
import { fakeTasksApi, pageOf } from '../test/tasksApi'
import { useListViewStore } from './listView'
import { SETTINGS_STORAGE_KEY, useSettingsStore } from './settings'
import { tasksChanged } from './taskChanges'
import { useTasksStore } from './tasks'

let pinia: Pinia | undefined

function addressIs(url: string): void {
  history.replaceState(null, '', url)
}

function address(): string {
  return location.pathname + location.search
}

// A fresh pinia stands for a page load, here with "All" saved as the page size.
function loadStores(pageSize: number | 'all' = 'all') {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ pageSize }))
  pinia = createPinia()
  setActivePinia(pinia)
  return { tasks: useTasksStore(), view: useListViewStore(), settings: useSettingsStore() }
}

function titlesOf(items: readonly TaskRead[]): string[] {
  return items.map((item) => item.title)
}

// Titles `prefix 1` to `prefix count`.
function titles(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`)
}

// One page of the full set the server holds when asked 100 per page.
function pageOfAll(page: number, total: number, prefix = 'Task') {
  const all = titles(prefix, total)
  return pageOf(all.slice((page - 1) * 100, page * 100), { total, page, page_size: 100, pages: Math.ceil(total / 100) })
}

function signalOf(index: number): AbortSignal {
  return (vi.mocked(fetch).mock.calls[index][1] as RequestInit).signal as AbortSignal
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

describe('all the tasks on one page', () => {
  it('asks for the first 100 and nothing more when they are all there is', async () => {
    const api = fakeTasksApi()
    const { tasks } = loadStores()

    tasks.start()
    expect(api.queries).toEqual([{ ordering: '-created_at', page: '1', page_size: '100' }])
    await api.respondTo(0, pageOfAll(1, 42))

    expect(api.queries).toHaveLength(1)
    expect(tasks.status).toBe('ready')
    expect(tasks.items).toHaveLength(42)
    expect(tasks.total).toBe(42)
    expect(tasks.pages).toBe(1)
    expect(tasks.page).toBe(1)
  })

  it('holds one page for the UI also when nothing matches', async () => {
    const api = fakeTasksApi()
    const { tasks } = loadStores()
    tasks.start()

    await api.respondTo(0, pageOf([], { total: 0, pages: 0, page_size: 100 }))

    expect(tasks.status).toBe('ready')
    expect(tasks.items).toEqual([])
    expect(tasks.pages).toBe(1)
  })

  it('asks for the remaining pages at once, with the same query, and shows them in page order', async () => {
    addressIs('/?status=done&search=report')
    const api = fakeTasksApi()
    const { tasks } = loadStores()
    tasks.start()

    await api.respondTo(0, pageOfAll(1, 230))

    const query = { search: 'report', status: 'done', ordering: '-created_at', page_size: '100' }
    expect(api.queries).toEqual([
      { ...query, page: '1' },
      { ...query, page: '2' },
      { ...query, page: '3' },
    ])
    expect(tasks.status).toBe('loading')
    expect(tasks.items).toEqual([])

    await api.respondTo(2, pageOfAll(3, 230))
    expect(tasks.status).toBe('loading')
    expect(tasks.items).toEqual([])
    await api.respondTo(1, pageOfAll(2, 230))

    expect(tasks.status).toBe('ready')
    expect(titlesOf(tasks.items)).toEqual(titles('Task', 230))
    expect(tasks.total).toBe(230)
    expect(tasks.pages).toBe(1)
  })

  it('keeps the rows of the last answer on screen while the whole set loads again', async () => {
    const api = fakeTasksApi()
    const { tasks } = loadStores()
    tasks.start()
    await api.respondTo(0, pageOfAll(1, 150))
    await api.respondTo(1, pageOfAll(2, 150))

    tasksChanged()
    await api.respondTo(2, pageOfAll(1, 150, 'New'))

    expect(tasks.status).toBe('reloading')
    expect(titlesOf(tasks.items)).toEqual(titles('Task', 150))

    await api.respondTo(3, pageOfAll(2, 150, 'New'))
    expect(tasks.status).toBe('ready')
    expect(titlesOf(tasks.items)).toEqual(titles('New', 150))
  })

  it('cancels every page still in flight when the view changes', async () => {
    const api = fakeTasksApi()
    const { tasks, view } = loadStores()
    tasks.start()
    await api.respondTo(0, pageOfAll(1, 230))

    view.search = 'report'
    await nextTick()

    expect(signalOf(1).aborted).toBe(true)
    expect(signalOf(2).aborted).toBe(true)
    expect(api.queries[3]).toEqual({ search: 'report', ordering: '-created_at', page: '1', page_size: '100' })
    await api.respondTo(3, pageOfAll(1, 3, 'Report'))

    expect(tasks.status).toBe('ready')
    expect(titlesOf(tasks.items)).toEqual(titles('Report', 3))
    expect(tasks.error).toBeNull()
  })

  it('cancels the first page when the view changes before it is answered', async () => {
    const api = fakeTasksApi()
    const { tasks, view } = loadStores()
    tasks.start()

    view.status = 'done'
    await nextTick()

    expect(signalOf(0).aborted).toBe(true)
    await api.respondTo(1, pageOfAll(1, 2, 'Done'))
    expect(titlesOf(tasks.items)).toEqual(titles('Done', 2))
  })

  it('fails as a whole with the kind of the page that failed, and stops asking for the others', async () => {
    const api = fakeTasksApi()
    const { tasks } = loadStores()
    tasks.start()
    await api.respondTo(0, pageOfAll(1, 330))

    await api.failWith(2, 404)

    expect(tasks.status).toBe('failed')
    expect(tasks.error).toBe('not_found')
    expect(tasks.items).toEqual([])
    expect(signalOf(1).aborted).toBe(true)
    expect(signalOf(3).aborted).toBe(true)
  })

  it('keeps the rows on screen when a page of a reload fails, and loads the whole set again on a retry', async () => {
    const api = fakeTasksApi()
    const { tasks } = loadStores()
    tasks.start()
    await api.respondTo(0, pageOfAll(1, 150))
    await api.respondTo(1, pageOfAll(2, 150))

    tasks.retry()
    await api.respondTo(2, pageOfAll(1, 150, 'New'))
    await api.loseConnection(3)

    expect(tasks.status).toBe('failed')
    expect(tasks.error).toBe('network')
    expect(titlesOf(tasks.items)).toEqual(titles('Task', 150))

    tasks.retry()
    expect(api.queries[4]).toEqual({ ordering: '-created_at', page: '1', page_size: '100' })
    await api.respondTo(4, pageOfAll(1, 150, 'New'))
    await api.respondTo(5, pageOfAll(2, 150, 'New'))
    expect(tasks.status).toBe('ready')
    expect(tasks.error).toBeNull()
    expect(titlesOf(tasks.items)).toEqual(titles('New', 150))
  })
})

describe('the page in the address with all the tasks on one page', () => {
  it('is ignored, and dropped from the address', async () => {
    addressIs('/?status=done&page=3')
    const api = fakeTasksApi()
    const { tasks, view } = loadStores()

    tasks.start()
    await nextTick()

    expect(view.page).toBe(1)
    expect(api.queries).toEqual([{ status: 'done', ordering: '-created_at', page: '1', page_size: '100' }])
    expect(address()).toBe('/?status=done')
  })

  it('is dropped when "All" is chosen on a later page, with one request and no history entry', async () => {
    addressIs('/?status=done&page=3')
    const api = fakeTasksApi()
    const { tasks, view, settings } = loadStores(20)
    tasks.start()
    await api.respondTo(0, pageOf(['Old'], { total: 60, page: 3, pages: 3 }))
    const entries = history.length

    settings.pageSize = 'all'
    await nextTick()

    expect(view.page).toBe(1)
    expect(address()).toBe('/?status=done')
    expect(history.length).toBe(entries)
    expect(api.queries).toHaveLength(2)
    expect(api.queries[1]).toEqual({ status: 'done', ordering: '-created_at', page: '1', page_size: '100' })
  })

  it('is dropped also when "All" is chosen before the list is started', async () => {
    addressIs('/?page=3')
    const { settings } = loadStores(20)

    settings.pageSize = 'all'
    await nextTick()

    expect(address()).toBe('/')
  })

  it('stays out when the page is set while all the tasks are shown', async () => {
    const api = fakeTasksApi()
    const { tasks, view } = loadStores()
    tasks.start()
    await api.respondTo(0, pageOfAll(1, 42))

    view.page = 2
    await nextTick()

    expect(view.page).toBe(1)
    expect(address()).toBe('/')
    expect(api.queries).toHaveLength(1)
  })

  it('is ignored when the browser goes back to an entry that has one', async () => {
    const api = fakeTasksApi()
    const { tasks, view } = loadStores()
    tasks.start()
    await api.respondTo(0, pageOfAll(1, 42))

    history.replaceState(null, '', '/?status=done&page=2')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await nextTick()

    expect(view.page).toBe(1)
    expect(api.queries[1]).toEqual({ status: 'done', ordering: '-created_at', page: '1', page_size: '100' })
  })

  it('starts from page 1 when a number is chosen again, even if the address still held a page', async () => {
    const api = fakeTasksApi()
    const { tasks, view, settings } = loadStores()
    tasks.start()
    await api.respondTo(0, pageOfAll(1, 42))
    history.replaceState(null, '', '/?page=2')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await nextTick()

    settings.pageSize = 10
    await nextTick()

    expect(view.page).toBe(1)
    expect(address()).toBe('/')
    expect(api.queries).toHaveLength(2)
    expect(api.queries[1]).toEqual({ ordering: '-created_at', page: '1', page_size: '10' })
  })

  it('is never corrected for being past the end', async () => {
    addressIs('/?page=9')
    const api = fakeTasksApi()
    const { tasks, view } = loadStores()
    tasks.start()

    await api.respondTo(0, pageOf([], { total: 0, pages: 0, page_size: 100 }))

    expect(api.queries).toHaveLength(1)
    expect(view.page).toBe(1)
    expect(tasks.status).toBe('ready')
  })
})
