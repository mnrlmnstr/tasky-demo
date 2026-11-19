import { flushPromises } from '@vue/test-utils'
import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import type { PageTaskRead, TaskRead } from '../api/generated/client'
import { useListViewStore } from './listView'
import { SETTINGS_STORAGE_KEY, useSettingsStore } from './settings'
import { useTasksStore } from './tasks'

let pinia: Pinia | undefined

function addressIs(url: string): void {
  history.replaceState(null, '', url)
}

function address(): string {
  return location.pathname + location.search
}

// A fresh pinia stands for a page load.
function loadStores() {
  pinia = createPinia()
  setActivePinia(pinia)
  return { tasks: useTasksStore(), view: useListViewStore(), settings: useSettingsStore() }
}

function task(title: string): TaskRead {
  return {
    id: `id-${title}`,
    title,
    description: null,
    status: 'todo',
    priority: 'medium',
    deadline: null,
    created_at: '2026-01-10T09:00:00Z',
    updated_at: '2026-01-10T09:00:00Z',
  }
}

function pageOf(titles: string[], overrides: Partial<PageTaskRead> = {}): PageTaskRead {
  return { items: titles.map(task), total: titles.length, page: 1, page_size: 20, pages: 1, ...overrides }
}

function titlesOf(items: readonly TaskRead[]): string[] {
  return items.map((item) => item.title)
}

interface PendingRequest {
  query: Record<string, string>
  resolve: (response: Response) => void
  reject: (error: unknown) => void
}

// Answers like a real fetch: each request stays pending until the test answers it, and rejects once its signal aborts.
// With `abortsInTime: false` an aborted request still gets its answer through: the abort came too late to stop it.
function fakeApi({ abortsInTime = true } = {}) {
  const pending: PendingRequest[] = []
  const pendingFetch: typeof fetch = (input, init) =>
    new Promise<Response>((resolve, reject) => {
      const url = new URL(String(input), 'http://localhost')
      pending.push({ query: Object.fromEntries(url.searchParams), resolve, reject })
      if (!abortsInTime) return
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      })
    })
  vi.stubGlobal('fetch', vi.fn(pendingFetch))
  return {
    get queries() {
      return pending.map((request) => request.query)
    },
    async respondTo(index: number, body: PageTaskRead) {
      pending[index].resolve(
        new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      )
      await flushPromises()
    },
    async failWith(index: number, status: number) {
      pending[index].resolve(new Response('{}', { status }))
      await flushPromises()
    },
    async loseConnection(index: number) {
      pending[index].reject(new TypeError('Failed to fetch'))
      await flushPromises()
    },
  }
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

describe('loading the list', () => {
  it('holds nothing and asks for nothing before it is started', () => {
    const api = fakeApi()
    const { tasks } = loadStores()

    expect(tasks.status).toBe('idle')
    expect(tasks.items).toEqual([])
    expect(tasks.total).toBe(0)
    expect(tasks.pages).toBe(0)
    expect(tasks.error).toBeNull()
    expect(api.queries).toEqual([])
  })

  it('asks for the view in the address with the page size from the settings', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ pageSize: 50 }))
    addressIs('/?search=report&status=done&ordering=deadline&page=2')
    const api = fakeApi()
    const { tasks } = loadStores()

    tasks.start()

    expect(api.queries).toEqual([
      { search: 'report', status: 'done', ordering: 'deadline', page: '2', page_size: '50' },
    ])
  })

  it('is loading for the first time until the answer arrives', () => {
    fakeApi()
    const { tasks } = loadStores()

    tasks.start()

    expect(tasks.status).toBe('loading')
    expect(tasks.items).toEqual([])
  })

  it('holds the page the server answered with', async () => {
    const api = fakeApi()
    const { tasks } = loadStores()
    tasks.start()

    await api.respondTo(0, pageOf(['Write report', 'Call client'], { total: 42, pages: 3 }))

    expect(tasks.status).toBe('ready')
    expect(titlesOf(tasks.items)).toEqual(['Write report', 'Call client'])
    expect(tasks.total).toBe(42)
    expect(tasks.pages).toBe(3)
    expect(tasks.error).toBeNull()
  })

  it('loads once however many times it is started', async () => {
    const api = fakeApi()
    const { tasks } = loadStores()

    tasks.start()
    tasks.start()
    await nextTick()

    expect(api.queries).toHaveLength(1)
  })
})

describe('following the view', () => {
  async function startedWith(first: PageTaskRead, url = '/') {
    addressIs(url)
    const api = fakeApi()
    const stores = loadStores()
    stores.tasks.start()
    await api.respondTo(0, first)
    return { api, ...stores }
  }

  it.each([
    ['search', (view: ReturnType<typeof useListViewStore>) => (view.search = 'report'), { search: 'report' }],
    ['status', (view: ReturnType<typeof useListViewStore>) => (view.status = 'done'), { status: 'done' }],
    ['ordering', (view: ReturnType<typeof useListViewStore>) => (view.ordering = 'deadline'), { ordering: 'deadline' }],
    ['page', (view: ReturnType<typeof useListViewStore>) => (view.page = 2), { page: '2' }],
  ])('asks again once when the %s changes', async (_field, change, expected) => {
    const { api, view } = await startedWith(pageOf(['Old'], { total: 60, pages: 3 }))

    change(view)
    await nextTick()

    expect(api.queries).toHaveLength(2)
    expect(api.queries[1]).toEqual({ ordering: '-created_at', page: '1', page_size: '20', ...expected })
  })

  it('asks once for several changes made at once', async () => {
    const { api, view } = await startedWith(pageOf(['Old']))

    view.search = 'report'
    view.status = 'done'
    view.ordering = 'deadline'
    await nextTick()

    expect(api.queries).toEqual([
      { ordering: '-created_at', page: '1', page_size: '20' },
      { search: 'report', status: 'done', ordering: 'deadline', page: '1', page_size: '20' },
    ])
  })

  it('does not ask again when the view is set to what it already is', async () => {
    const { api, view } = await startedWith(pageOf(['Old']), '/?status=done')

    view.status = 'done'
    view.page = 1
    await nextTick()

    expect(api.queries).toHaveLength(1)
  })

  it('does not ask again when a change is undone before the request goes out', async () => {
    const { api, view } = await startedWith(pageOf(['Old']))

    view.status = 'done'
    view.status = 'all'
    await nextTick()

    expect(api.queries).toHaveLength(1)
  })

  it('asks again when the browser goes to another entry of the history', async () => {
    const { api } = await startedWith(pageOf(['Old']))

    history.replaceState(null, '', '/?status=done&page=2')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await nextTick()

    expect(api.queries).toHaveLength(2)
    expect(api.queries[1]).toEqual({ status: 'done', ordering: '-created_at', page: '2', page_size: '20' })
  })

  it('does not ask again when the browser arrives at an entry with the same view', async () => {
    const { api } = await startedWith(pageOf(['Old']), '/?status=done')

    history.replaceState(null, '', '/?status=done#top')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await nextTick()

    expect(api.queries).toHaveLength(1)
  })

  it('does not follow the view before it is started', async () => {
    const api = fakeApi()
    const { view, settings } = loadStores()

    view.status = 'done'
    settings.pageSize = 50
    await nextTick()

    expect(api.queries).toEqual([])
  })

  it('keeps the rows on screen while it reloads', async () => {
    const { tasks, view } = await startedWith(pageOf(['Old one', 'Old two'], { total: 60, pages: 3 }))

    view.page = 2
    await nextTick()

    expect(tasks.status).toBe('reloading')
    expect(titlesOf(tasks.items)).toEqual(['Old one', 'Old two'])
    expect(tasks.total).toBe(60)
    expect(tasks.pages).toBe(3)
  })

  it('shows the new rows once the reload answers', async () => {
    const { api, tasks, view } = await startedWith(pageOf(['Old'], { total: 60, pages: 3 }))
    view.page = 2
    await nextTick()

    await api.respondTo(1, pageOf(['New'], { total: 61, page: 2, pages: 4 }))

    expect(tasks.status).toBe('ready')
    expect(titlesOf(tasks.items)).toEqual(['New'])
    expect(tasks.total).toBe(61)
    expect(tasks.pages).toBe(4)
  })

  it('shows only the answer to the latest request when an older one is still in flight', async () => {
    const { api, tasks, view } = await startedWith(pageOf(['Old'], { total: 60, pages: 3 }))
    view.page = 2
    await nextTick()
    view.page = 3
    await nextTick()

    await flushPromises()

    expect(tasks.status).toBe('reloading')
    expect(tasks.error).toBeNull()
    expect(titlesOf(tasks.items)).toEqual(['Old'])

    await api.respondTo(2, pageOf(['Third page'], { total: 60, page: 3, pages: 3 }))

    expect(tasks.status).toBe('ready')
    expect(tasks.error).toBeNull()
    expect(titlesOf(tasks.items)).toEqual(['Third page'])
  })

  it('stays on the first load when the first request is superseded', async () => {
    const api = fakeApi()
    const { tasks, view } = loadStores()
    tasks.start()

    view.status = 'done'
    await flushPromises()

    expect(api.queries).toHaveLength(2)
    expect(tasks.status).toBe('loading')
    expect(tasks.error).toBeNull()
  })
})

describe('following the page size', () => {
  it('asks again with the new page size', async () => {
    const api = fakeApi()
    const { tasks, settings } = loadStores()
    tasks.start()
    await api.respondTo(0, pageOf(['Old'], { total: 60, pages: 3 }))

    settings.pageSize = 50
    await nextTick()

    expect(api.queries).toHaveLength(2)
    expect(api.queries[1]).toEqual({ ordering: '-created_at', page: '1', page_size: '50' })
  })

  it('goes back to the first page with one request, and the address follows', async () => {
    addressIs('/?status=done&page=3')
    const api = fakeApi()
    const { tasks, view, settings } = loadStores()
    tasks.start()
    await api.respondTo(0, pageOf(['Old'], { total: 60, page: 3, pages: 3 }))

    settings.pageSize = 10
    await nextTick()

    expect(view.page).toBe(1)
    expect(address()).toBe('/?status=done')
    expect(api.queries).toHaveLength(2)
    expect(api.queries[1]).toEqual({ status: 'done', ordering: '-created_at', page: '1', page_size: '10' })
  })
})

describe('landing on a page past the end', () => {
  const PAST_THE_END = pageOf([], { total: 45, page: 9, pages: 3 })

  it('moves the view to the last page instead of showing an empty list', async () => {
    addressIs('/?status=done&page=9')
    const api = fakeApi()
    const { tasks, view } = loadStores()
    tasks.start()

    await api.respondTo(0, PAST_THE_END)

    expect(view.page).toBe(3)
    expect(address()).toBe('/?status=done&page=3')
    expect(tasks.status).toBe('loading')
    expect(tasks.total).toBe(0)
    expect(api.queries).toHaveLength(2)
    expect(api.queries[1]).toEqual({ status: 'done', ordering: '-created_at', page: '3', page_size: '20' })
  })

  it('shows the last page once it arrives', async () => {
    addressIs('/?page=9')
    const api = fakeApi()
    const { tasks } = loadStores()
    tasks.start()
    await api.respondTo(0, PAST_THE_END)

    await api.respondTo(1, pageOf(['Last one'], { total: 45, page: 3, pages: 3 }))

    expect(tasks.status).toBe('ready')
    expect(titlesOf(tasks.items)).toEqual(['Last one'])
    expect(tasks.total).toBe(45)
    expect(tasks.pages).toBe(3)
    expect(api.queries).toHaveLength(2)
  })

  it('keeps the rows on screen while it moves back from a page that no longer exists', async () => {
    const api = fakeApi()
    const { tasks, view } = loadStores()
    tasks.start()
    await api.respondTo(0, pageOf(['Old'], { total: 60, pages: 3 }))
    view.page = 3
    await nextTick()

    await api.respondTo(1, pageOf([], { total: 40, page: 3, pages: 2 }))

    expect(view.page).toBe(2)
    expect(tasks.status).toBe('reloading')
    expect(titlesOf(tasks.items)).toEqual(['Old'])
    expect(api.queries).toHaveLength(3)
  })

  it.each([
    ['nothing matches at all', '/?page=2', pageOf([], { total: 0, page: 2, pages: 0 })],
    ['the page is within the pages there are', '/?page=2', pageOf([], { total: 45, page: 2, pages: 3 })],
    ['the page has rows', '/?page=4', pageOf(['Row'], { total: 45, page: 4, pages: 3 })],
  ])('shows the answer as it is when %s', async (_case, url, answer) => {
    addressIs(url)
    const api = fakeApi()
    const { tasks } = loadStores()
    tasks.start()

    await api.respondTo(0, answer)

    expect(address()).toBe(url)
    expect(tasks.status).toBe('ready')
    expect(titlesOf(tasks.items)).toEqual(titlesOf(answer.items))
    expect(tasks.total).toBe(answer.total)
    expect(tasks.pages).toBe(answer.pages)
    expect(api.queries).toHaveLength(1)
  })
})

describe('failing to load', () => {
  it.each([
    ['server', (api: ReturnType<typeof fakeApi>, index: number) => api.failWith(index, 500)],
    ['network', (api: ReturnType<typeof fakeApi>, index: number) => api.loseConnection(index)],
    ['not_found', (api: ReturnType<typeof fakeApi>, index: number) => api.failWith(index, 404)],
    ['validation', (api: ReturnType<typeof fakeApi>, index: number) => api.failWith(index, 422)],
  ] as const)('reports a %s error when the first load fails', async (kind, fail) => {
    const api = fakeApi()
    const { tasks } = loadStores()
    tasks.start()

    await fail(api, 0)

    expect(tasks.status).toBe('failed')
    expect(tasks.error).toBe(kind)
    expect(tasks.items).toEqual([])
  })

  it('keeps the rows it had when a reload fails', async () => {
    const api = fakeApi()
    const { tasks, view } = loadStores()
    tasks.start()
    await api.respondTo(0, pageOf(['Old one', 'Old two'], { total: 60, pages: 3 }))
    view.page = 2
    await nextTick()

    await api.failWith(1, 500)

    expect(tasks.status).toBe('failed')
    expect(tasks.error).toBe('server')
    expect(titlesOf(tasks.items)).toEqual(['Old one', 'Old two'])
    expect(tasks.total).toBe(60)
    expect(tasks.pages).toBe(3)
  })

  it('ignores the failure of a request that was superseded too late to be stopped', async () => {
    const api = fakeApi({ abortsInTime: false })
    const { tasks, view } = loadStores()
    tasks.start()
    view.page = 2
    await nextTick()

    await api.failWith(0, 500)

    expect(tasks.status).toBe('loading')
    expect(tasks.error).toBeNull()
  })

  it('ignores the answer to a request that was superseded too late to be stopped', async () => {
    const api = fakeApi({ abortsInTime: false })
    const { tasks, view } = loadStores()
    tasks.start()
    view.page = 2
    await nextTick()

    await api.respondTo(0, pageOf(['Stale'], { total: 60, pages: 3 }))

    expect(tasks.status).toBe('loading')
    expect(tasks.items).toEqual([])
    expect(tasks.total).toBe(0)
  })

  it('loads again when the view changes after a failure, and success clears the error', async () => {
    const api = fakeApi()
    const { tasks, view } = loadStores()
    tasks.start()
    await api.loseConnection(0)

    view.status = 'done'
    await nextTick()
    await api.respondTo(1, pageOf(['Done task']))

    expect(tasks.status).toBe('ready')
    expect(tasks.error).toBeNull()
    expect(titlesOf(tasks.items)).toEqual(['Done task'])
  })
})

describe('retrying', () => {
  it('asks again for the same view, once', async () => {
    addressIs('/?status=done&page=2')
    const api = fakeApi()
    const { tasks } = loadStores()
    tasks.start()
    await api.failWith(0, 500)

    tasks.retry()
    await nextTick()

    expect(api.queries).toHaveLength(2)
    expect(api.queries[1]).toEqual(api.queries[0])
  })

  it('is a first load again after a failed first load, with the error still known', async () => {
    const api = fakeApi()
    const { tasks } = loadStores()
    tasks.start()
    await api.failWith(0, 500)

    tasks.retry()

    expect(tasks.status).toBe('loading')
    expect(tasks.error).toBe('server')
  })

  it('is a reload after a failed reload', async () => {
    const api = fakeApi()
    const { tasks, view } = loadStores()
    tasks.start()
    await api.respondTo(0, pageOf(['Old'], { total: 60, pages: 3 }))
    view.page = 2
    await nextTick()
    await api.loseConnection(1)

    tasks.retry()

    expect(tasks.status).toBe('reloading')
    expect(titlesOf(tasks.items)).toEqual(['Old'])
  })

  it('clears the error once it succeeds', async () => {
    const api = fakeApi()
    const { tasks } = loadStores()
    tasks.start()
    await api.failWith(0, 500)
    tasks.retry()

    await api.respondTo(1, pageOf(['Back again']))

    expect(tasks.status).toBe('ready')
    expect(tasks.error).toBeNull()
    expect(titlesOf(tasks.items)).toEqual(['Back again'])
  })

  it('reports the new error when it fails again', async () => {
    const api = fakeApi()
    const { tasks } = loadStores()
    tasks.start()
    await api.failWith(0, 500)
    tasks.retry()

    await api.loseConnection(1)

    expect(tasks.status).toBe('failed')
    expect(tasks.error).toBe('network')
  })

  it('does nothing before the store is started', () => {
    const api = fakeApi()
    const { tasks } = loadStores()

    tasks.retry()

    expect(api.queries).toEqual([])
    expect(tasks.status).toBe('idle')
  })
})
