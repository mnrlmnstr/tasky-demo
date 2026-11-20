import { flushPromises } from '@vue/test-utils'
import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import type { TaskRead } from '../api/generated/client'
import { fakeTasksApi, pageOf, task } from '../test/tasksApi'
import { taskServer } from '../test/taskServer'
import { BOARD_PAGE_SIZE, useBoardStore } from './board'
import { useListViewStore } from './listView'
import { useTasksStore } from './tasks'
import { useUndoStore } from './undo'

let pinia: Pinia | undefined

function loadStores(address = '/') {
  history.replaceState(null, '', address)
  pinia = createPinia()
  setActivePinia(pinia)
  return { board: useBoardStore(), view: useListViewStore(), tasks: useTasksStore(), undo: useUndoStore() }
}

type Board = ReturnType<typeof useBoardStore>

function titles(board: Board) {
  return {
    todo: board.columns.todo.items.map((item) => item.title),
    in_progress: board.columns.in_progress.items.map((item) => item.title),
    done: board.columns.done.items.map((item) => item.title),
  }
}

function totals(board: Board) {
  return [board.columns.todo.total, board.columns.in_progress.total, board.columns.done.total]
}

function statuses(board: Board) {
  return [board.columns.todo.status, board.columns.in_progress.status, board.columns.done.status]
}

function rows(): TaskRead[] {
  return [
    task('Write', { status: 'todo' }),
    task('Call', { status: 'todo' }),
    task('Plan', { status: 'in_progress' }),
    task('Ship', { status: 'done' }),
  ]
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (pinia) disposePinia(pinia)
  pinia = undefined
})

describe('loading the columns', () => {
  it('asks for nothing until started', () => {
    const api = fakeTasksApi()
    const { board } = loadStores()

    expect(api.queries).toEqual([])
    expect(statuses(board)).toEqual(['loading', 'loading', 'loading'])
  })

  it('asks for each status on its own, first page, up to 100 tasks, in the order of the view', () => {
    const api = fakeTasksApi()
    const { board } = loadStores()

    board.start()

    expect(BOARD_PAGE_SIZE).toBe(100)
    expect(api.queries).toEqual([
      { status: 'todo', ordering: '-created_at', page: '1', page_size: '100' },
      { status: 'in_progress', ordering: '-created_at', page: '1', page_size: '100' },
      { status: 'done', ordering: '-created_at', page: '1', page_size: '100' },
    ])
  })

  it('passes the search and the ordering on, but not the status filter or the page of the list', () => {
    const api = fakeTasksApi()
    const { board } = loadStores('/?search=report&status=done&ordering=deadline&page=3&view=board')

    board.start()

    expect(api.queries[0]).toEqual({ status: 'todo', search: 'report', ordering: 'deadline', page: '1', page_size: '100' })
  })

  it('passes the deadline filter on to every column', () => {
    const api = fakeTasksApi()
    const { board } = loadStores('/?deadline_from=2026-03-01&deadline_to=2026-03-31&view=board')

    board.start()

    expect(api.queries.map((query) => [query.status, query.deadline_from, query.deadline_to])).toEqual([
      ['todo', expect.any(String), expect.any(String)],
      ['in_progress', expect.any(String), expect.any(String)],
      ['done', expect.any(String), expect.any(String)],
    ])
  })

  it('starts only once', () => {
    const api = fakeTasksApi()
    const { board } = loadStores()

    board.start()
    board.start()

    expect(api.queries).toHaveLength(3)
  })

  it('fills each column with its answer and its total', async () => {
    const api = fakeTasksApi()
    const { board } = loadStores()
    board.start()

    await api.respondTo(0, pageOf(['Write', 'Call'], { total: 140 }))

    expect(statuses(board)).toEqual(['ready', 'loading', 'loading'])
    expect(titles(board).todo).toEqual(['Write', 'Call'])
    expect(totals(board)).toEqual([140, 0, 0])
  })

  it('shows the failure of one column without touching the others', async () => {
    const api = fakeTasksApi()
    const { board } = loadStores()
    board.start()

    await api.respondTo(0, pageOf(['Write']))
    await api.failWith(1, 500)
    await api.loseConnection(2)

    expect(statuses(board)).toEqual(['ready', 'failed', 'failed'])
    expect([board.columns.in_progress.error, board.columns.done.error]).toEqual(['server', 'network'])
    expect(titles(board).todo).toEqual(['Write'])
  })

  it('takes an unexpected failure for a server error', async () => {
    // Not a response at all, so reading it throws something the API layer never throws on purpose.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(null)))
    const { board } = loadStores()

    board.start()
    await flushPromises()

    expect(board.columns.todo.error).toBe('server')
  })

  it('asks a failed column again on retry, keeping the message until the answer, and only that column', async () => {
    const api = fakeTasksApi()
    const { board } = loadStores()
    board.start()
    await api.failWith(0, 500)

    board.retry('todo')

    expect(api.queries).toHaveLength(4)
    expect(api.queries[3].status).toBe('todo')
    expect(board.columns.todo.status).toBe('loading')
    expect(board.columns.todo.error).toBe('server')

    await api.respondTo(3, pageOf(['Write']))
    expect(board.columns.todo.status).toBe('ready')
    expect(board.columns.todo.error).toBeNull()
  })

  it('keeps the cards of the last answer on screen while a column reloads', async () => {
    const api = fakeTasksApi()
    const { board } = loadStores()
    board.start()
    await api.respondTo(0, pageOf(['Write']))

    board.retry('todo')

    expect(board.columns.todo.status).toBe('reloading')
    expect(titles(board).todo).toEqual(['Write'])
  })

  it('asks every column again when the search or the ordering changes, and ignores the answers it replaced', async () => {
    const api = fakeTasksApi()
    const { board, view } = loadStores()
    board.start()

    view.search = 'report'
    await nextTick()

    expect(api.queries.slice(3).map((query) => [query.status, query.search])).toEqual([
      ['todo', 'report'],
      ['in_progress', 'report'],
      ['done', 'report'],
    ])
    await api.respondTo(0, pageOf(['Old']))
    expect(board.columns.todo.status).toBe('loading')
    expect(board.columns.todo.error).toBeNull()

    await api.respondTo(3, pageOf(['New']))
    expect(titles(board).todo).toEqual(['New'])
  })

  it('ignores the answer of a request that was superseded too late to be stopped', async () => {
    // Every request gets its answer, abort or not.
    const answers: ((response: Response) => void)[] = []
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => answers.push(resolve))))
    const { board } = loadStores()
    board.start()
    board.retry('todo')

    answers[3](new Response(JSON.stringify(pageOf(['New'])), { headers: { 'Content-Type': 'application/json' } }))
    await flushPromises()
    answers[0](new Response(JSON.stringify(pageOf(['Old'])), { headers: { 'Content-Type': 'application/json' } }))
    await flushPromises()

    expect(titles(board).todo).toEqual(['New'])
  })

  it('does not reload for a change of the list status filter, the page or the view', async () => {
    const api = fakeTasksApi()
    const { board, view } = loadStores()
    board.start()

    view.status = 'done'
    view.page = 2
    view.view = 'table'
    await nextTick()

    expect(api.queries).toHaveLength(3)
  })

  it('follows nothing before it starts or after it stops', async () => {
    const api = fakeTasksApi()
    const { board, view, tasks } = loadStores()

    view.search = 'report'
    await nextTick()
    tasks.retry()
    expect(api.queries).toEqual([])

    board.start()
    board.stop()
    view.search = 'other'
    await nextTick()
    expect(api.queries.filter((query) => query.page_size === '100')).toHaveLength(3)
  })

  it('reloads every column when the tasks are asked again after a change', () => {
    const api = fakeTasksApi()
    const { board, tasks } = loadStores()
    board.start()

    tasks.retry()

    expect(api.queries).toHaveLength(6)
  })

  it('asks the list again when it stops, as tasks may have changed on the board', () => {
    const api = fakeTasksApi()
    const { board, tasks } = loadStores()
    tasks.start()
    board.start()

    board.stop()

    expect(api.queries.map((query) => query.page_size)).toEqual(['20', '100', '100', '100', '20'])
  })
})

describe('moving a card to another column', () => {
  async function startedBoard(serverRows = rows()) {
    const server = taskServer(serverRows)
    const stores = loadStores()
    stores.board.start()
    await flushPromises()
    return { server, ...stores }
  }

  it('moves the card at once, to the top of its new column, and counts it there', async () => {
    const { board, server } = await startedBoard()
    server.hold()

    void board.move(board.columns.todo.items[1], 'done')

    expect(titles(board)).toEqual({ todo: ['Write'], in_progress: ['Plan'], done: ['Call', 'Ship'] })
    expect(totals(board)).toEqual([1, 1, 2])
    expect(board.columns.done.items[0].status).toBe('done')
    expect(board.isMoving('id-Call')).toBe(true)
    expect(board.isMoving('id-Write')).toBe(false)
  })

  it('sends the new status, then asks the two columns involved again and offers to undo', async () => {
    const { board, server, undo } = await startedBoard()
    const listsBefore = server.lists

    await board.move(board.columns.todo.items[1], 'done')
    await flushPromises()

    expect(server.changes).toEqual([{ method: 'PATCH', path: '/api/v1/tasks/id-Call', body: { status: 'done' } }])
    expect(server.lists - listsBefore).toBe(2)
    expect(titles(board)).toEqual({ todo: ['Write'], in_progress: ['Plan'], done: ['Call', 'Ship'] })
    expect(totals(board)).toEqual([1, 1, 2])
    expect(board.isMoving('id-Call')).toBe(false)
    expect(undo.label).toBe('statusChanged')
  })

  it('moves the card back on undo', async () => {
    const { board, server, undo } = await startedBoard()
    await board.move(board.columns.todo.items[1], 'done')

    await undo.run()
    await flushPromises()

    expect(server.changes.at(-1)).toEqual({ method: 'PATCH', path: '/api/v1/tasks/id-Call', body: { status: 'todo' } })
    expect(titles(board).todo).toEqual(['Write', 'Call'])
    expect(titles(board).done).toEqual(['Ship'])
  })

  it('does not count a card twice when its new column has already been reloaded with it', async () => {
    const serverRows = rows()
    const { board, server } = await startedBoard(serverRows)
    server.hold()
    void board.move(board.columns.todo.items[1], 'done')
    // Someone else made the same change, and the column was asked again before the move was answered.
    serverRows[1] = { ...serverRows[1], status: 'done' }

    board.retry('done')
    await flushPromises()

    expect(titles(board)).toEqual({ todo: ['Write'], in_progress: ['Plan'], done: ['Call', 'Ship'] })
    expect(totals(board)).toEqual([1, 1, 2])
  })

  it('puts the card back and says why when the change fails', async () => {
    const { board, server, undo } = await startedBoard()
    server.failChanges(500)

    await board.move(board.columns.todo.items[0], 'in_progress')

    expect(titles(board)).toEqual({ todo: ['Write', 'Call'], in_progress: ['Plan'], done: ['Ship'] })
    expect(totals(board)).toEqual([2, 1, 1])
    expect(undo.notice).toBe('server')
    expect(undo.label).toBeNull()
  })

  it('says the connection was lost when it was', async () => {
    const { board, server, undo } = await startedBoard()
    server.failChanges('offline')

    await board.move(board.columns.todo.items[0], 'in_progress')

    expect(undo.notice).toBe('network')
  })

  it('asks every column again when the task is gone', async () => {
    const serverRows = rows()
    const { board, server, undo } = await startedBoard(serverRows)
    const gone = board.columns.todo.items[0]
    serverRows.splice(0, 1)
    const listsBefore = server.lists

    await board.move(gone, 'done')
    await flushPromises()

    expect(undo.notice).toBe('not_found')
    expect(server.lists - listsBefore).toBe(3)
    expect(titles(board).todo).toEqual(['Call'])
  })

  it('does nothing for a drop on the column the card is already in', async () => {
    const { board, server } = await startedBoard()

    await board.move(board.columns.todo.items[0], 'todo')

    expect(server.changes).toEqual([])
  })

  it('does nothing for a card whose move is still on its way', async () => {
    const { board, server } = await startedBoard()
    server.hold()
    const card = board.columns.todo.items[0]
    void board.move(card, 'done')

    void board.move(card, 'in_progress')

    expect(server.changes).toHaveLength(1)
  })
})
