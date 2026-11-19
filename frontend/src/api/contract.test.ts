import { afterEach, describe, expect, it, vi } from 'vitest'

import { getListTasksUrl, listTasks } from './generated/client'
import { apiFetch } from './http'

function fakeFetch(implementation: typeof fetch) {
  const fetchFake = vi.fn(implementation)
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

// A response whose headers arrived but whose body dies on the wire, as when the connection drops mid-download.
function brokenBodyResponse(status: number): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new TypeError('network error'))
    },
  })
  return new Response(body, { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('API client contract', () => {
  it('reports a connection lost while a successful body was being read as network, not server', async () => {
    fakeFetch(async () => brokenBodyResponse(200))

    await expect(apiFetch('/tasks')).rejects.toMatchObject({ name: 'ApiError', kind: 'network' })
  })

  it('leaves a filter that is null out of the list query string', () => {
    expect(getListTasksUrl({ status: null, search: null })).toBe('/api/v1/tasks')
  })

  it('does not ask the API for tasks whose status or search is the text "null"', async () => {
    const fetchFake = fakeFetch(
      async () =>
        new Response(JSON.stringify({ items: [], total: 0, page: 1, page_size: 20, pages: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    )

    await listTasks({ status: null, search: null, page: 1 })

    expect(fetchFake).toHaveBeenCalledWith('/api/v1/tasks?page=1', expect.objectContaining({ method: 'GET' }))
  })
})
