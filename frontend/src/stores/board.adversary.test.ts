import { flushPromises } from '@vue/test-utils'
import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TaskRead } from '../api/generated/client'
import { requestUrl } from '../test/requestUrl'
import { task } from '../test/tasksApi'
import { useBoardStore } from './board'

let pinia: Pinia | undefined

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * Like the API holding `rows`: changes are applied and answered at once, while each list request is
 * answered (with the rows as they were when it was asked) only when the test releases it.
 */
function slowListServer(rows: TaskRead[]) {
  const heldLists: (() => void)[] = []
  const answer: typeof fetch = (input, init) => {
    const url = requestUrl(input)
    const method = init?.method ?? 'GET'
    if (method === 'GET') {
      const status = url.searchParams.get('status')
      const items = rows.filter((row) => row.status === status).map((row) => ({ ...row }))
      const body = { items, total: items.length, page: 1, page_size: 100, pages: 1 }
      return new Promise<Response>((resolve, reject) => {
        heldLists.push(() => resolve(json(body)))
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    }
    const sent = (typeof init?.body === 'string' ? JSON.parse(init.body) : {}) as Partial<TaskRead>
    const index = rows.findIndex((row) => url.pathname.endsWith(`/${row.id}`))
    rows[index] = { ...rows[index], ...sent }
    return Promise.resolve(json(rows[index]))
  }
  vi.stubGlobal('fetch', vi.fn(answer))
  return {
    async releaseLists() {
      for (const release of heldLists.splice(0)) release()
      await flushPromises()
    },
  }
}

function titles(board: ReturnType<typeof useBoardStore>) {
  return {
    todo: board.columns.todo.items.map((item) => item.title),
    done: board.columns.done.items.map((item) => item.title),
  }
}

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/?view=board')
  pinia = createPinia()
  setActivePinia(pinia)
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (pinia) disposePinia(pinia)
  pinia = undefined
})

describe('two cards dragged to another column one after the other (adversary)', () => {
  // #36: "dragging a card to another column changes its status (optimistic, rolled back on failure)".
  // Both moves succeed on the server, so neither card may jump back to the column it left.
  it('keeps the first card in its new column while the columns reload after the second move', async () => {
    const server = slowListServer([task('Write'), task('Call'), task('Ship', { status: 'done' })])
    const board = useBoardStore()
    board.start()
    await server.releaseLists()
    expect(titles(board)).toEqual({ todo: ['Write', 'Call'], done: ['Ship'] })

    const [write, call] = board.columns.todo.items
    void board.move(write, 'done')
    void board.move(call, 'done')
    await flushPromises()

    expect(titles(board).todo).toEqual([])
    expect(titles(board).done).toContain('Write')
  })
})
