import { flushPromises } from '@vue/test-utils'
import { vi } from 'vitest'

import type { PageTaskRead, TaskRead } from '../api/generated/client'
import { requestUrl } from './requestUrl'

export function task(title: string, overrides: Partial<TaskRead> = {}): TaskRead {
  return {
    id: `id-${title}`,
    title,
    description: null,
    status: 'todo',
    priority: 'medium',
    deadline: null,
    created_at: '2026-01-10T09:00:00Z',
    updated_at: '2026-01-10T09:00:00Z',
    position: 0,
    ...overrides,
  }
}

export function pageOf(titles: string[], overrides: Partial<PageTaskRead> = {}): PageTaskRead {
  return {
    items: titles.map((title) => task(title)),
    total: titles.length,
    page: 1,
    page_size: 20,
    pages: 1,
    ...overrides,
  }
}

interface PendingRequest {
  path: string
  query: Record<string, string>
  resolve: (response: Response) => void
  reject: (error: unknown) => void
}

/**
 * Stands in for `fetch` like the real API behind it: each request stays pending until the test answers it by its
 * position, and rejects once its signal aborts.
 */
export function fakeTasksApi() {
  const pending: PendingRequest[] = []
  const pendingFetch: typeof fetch = (input, init) =>
    new Promise<Response>((resolve, reject) => {
      const url = requestUrl(input)
      pending.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), resolve, reject })
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      })
    })
  vi.stubGlobal('fetch', vi.fn(pendingFetch))
  return {
    get paths() {
      return pending.map((request) => request.path)
    },
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
      pending[index].resolve(
        new Response('{}', { status, headers: { 'Content-Type': 'application/json' } }),
      )
      await flushPromises()
    },
    async loseConnection(index: number) {
      pending[index].reject(new TypeError('Failed to fetch'))
      await flushPromises()
    },
  }
}
