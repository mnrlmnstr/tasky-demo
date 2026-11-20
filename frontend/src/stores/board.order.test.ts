import { flushPromises } from '@vue/test-utils'
import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TaskRead } from '../api/generated/client'
import { task } from '../test/tasksApi'
import { taskServer } from '../test/taskServer'
import { useBoardStore } from './board'
import { useListViewStore } from './listView'
import { useUndoStore } from './undo'

let pinia: Pinia | undefined

function rows(): TaskRead[] {
  return [
    task('Write', { status: 'todo', position: 0 }),
    task('Call', { status: 'todo', position: 1 }),
    task('Read', { status: 'todo', position: 2 }),
    task('Plan', { status: 'in_progress', position: 3 }),
    task('Ship', { status: 'done', position: 4 }),
  ]
}

async function openBoard(address = '/?view=board&ordering=position', given = rows()) {
  history.replaceState(null, '', address)
  pinia = createPinia()
  setActivePinia(pinia)
  const server = taskServer(given)
  const board = useBoardStore()
  board.start()
  await flushPromises()
  return { board, server, view: useListViewStore(), undo: useUndoStore() }
}

type Board = ReturnType<typeof useBoardStore>

function titles(board: Board) {
  return {
    todo: board.columns.todo.items.map((item) => item.title),
    in_progress: board.columns.in_progress.items.map((item) => item.title),
    done: board.columns.done.items.map((item) => item.title),
  }
}

function card(board: Board, title: string): TaskRead {
  const all = [...board.columns.todo.items, ...board.columns.in_progress.items, ...board.columns.done.items]
  return all.find((item) => item.title === title) as TaskRead
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (pinia) disposePinia(pinia)
  pinia = undefined
})

describe('the board in the custom order', () => {
  it('sorts every column by position, also before the server has answered again', async () => {
    const { board } = await openBoard('/?view=board', [
      task('Late', { status: 'todo', position: 5 }),
      task('Early', { status: 'todo', position: -1 }),
    ])
    expect(titles(board).todo).toEqual(['Late', 'Early'])

    board.showCustomOrder()

    expect(useListViewStore().ordering).toBe('position')
    expect(titles(board).todo).toEqual(['Early', 'Late'])
  })
})

describe('placing a card', () => {
  it('between two cards of its column sends their midpoint and shows it there at once', async () => {
    const { board, server } = await openBoard()
    const release = server.hold()

    void board.place(card(board, 'Read'), 'todo', 1)
    await flushPromises()

    expect(titles(board).todo).toEqual(['Write', 'Read', 'Call'])
    expect(server.changes).toEqual([{ method: 'PATCH', path: '/api/v1/tasks/id-Read', body: { position: 0.5 } }])
    expect(board.isMoving('id-Read')).toBe(true)
    release()
    await flushPromises()
    expect(titles(board).todo).toEqual(['Write', 'Read', 'Call'])
  })

  it('in another column sends the new status with the position', async () => {
    const { board, server } = await openBoard()

    await board.place(card(board, 'Call'), 'done', 1)

    expect(server.changes[0].body).toEqual({ position: 5, status: 'done' })
    expect(titles(board)).toEqual({ todo: ['Write', 'Read'], in_progress: ['Plan'], done: ['Ship', 'Call'] })
    expect(board.columns.done.total).toBe(2)
  })

  it('at the top of a column goes one above the first card, and into an empty column at 0', async () => {
    const { board, server } = await openBoard('/?view=board&ordering=position', [
      task('Write', { status: 'todo', position: 0 }),
      task('Ship', { status: 'done', position: 4 }),
    ])

    await board.place(card(board, 'Write'), 'done', 0)
    await board.place(card(board, 'Ship'), 'in_progress', 0)

    expect(server.changes.map((change) => change.body)).toEqual([
      { position: 3, status: 'done' },
      { position: 0, status: 'in_progress' },
    ])
  })

  it('where it already is sends nothing', async () => {
    const { board, server } = await openBoard()

    await board.place(card(board, 'Call'), 'todo', 1)

    expect(server.changes).toEqual([])
  })

  it('that is still moving sends nothing more', async () => {
    const { board, server } = await openBoard()
    server.hold()
    void board.place(card(board, 'Call'), 'done', 0)

    void board.place(card(board, 'Call'), 'todo', 0)
    await flushPromises()

    expect(server.changes).toHaveLength(1)
  })

  it('puts the card back in its column and place when the change fails', async () => {
    const { board, server, undo } = await openBoard()
    server.failChanges(500)

    await board.place(card(board, 'Write'), 'done', 1)

    expect(titles(board).todo).toEqual(['Write', 'Call', 'Read'])
    expect(titles(board).done).toEqual(['Ship'])
    expect(undo.notice).toBe('server')
  })

  it('takes the card away when the task is gone', async () => {
    const { board, server } = await openBoard()
    server.failChanges(404)

    await board.place(card(board, 'Write'), 'done', 1)

    expect(titles(board).todo).toEqual(['Call', 'Read'])
  })

  it('can be undone: the card goes back to its old column and place', async () => {
    const { board, server, undo } = await openBoard()
    await board.place(card(board, 'Write'), 'done', 1)
    await flushPromises()
    expect(undo.label).toBe('moved')

    await undo.run()
    await flushPromises()

    expect(server.changes.at(-1)?.body).toEqual({ status: 'todo', position: 0 })
    expect(titles(board)).toEqual({ todo: ['Write', 'Call', 'Read'], in_progress: ['Plan'], done: ['Ship'] })
  })
})

describe('moving a card by one place', () => {
  it('goes up or down past one neighbour, by the midpoint rule', async () => {
    const { board, server } = await openBoard()

    await board.moveBy(card(board, 'Call'), -1)
    await flushPromises()
    await board.moveBy(card(board, 'Call'), 1)

    expect(server.changes.map((change) => change.body)).toEqual([{ position: -1 }, { position: 1 }])
    expect(titles(board).todo).toEqual(['Write', 'Call', 'Read'])
  })

  it('cannot go past either end of its column', async () => {
    const { board, server } = await openBoard()

    expect(board.canMoveBy(card(board, 'Write'), -1)).toBe(false)
    expect(board.canMoveBy(card(board, 'Write'), 1)).toBe(true)
    expect(board.canMoveBy(card(board, 'Read'), 1)).toBe(false)
    await board.moveBy(card(board, 'Read'), 1)
    expect(server.changes).toEqual([])
  })

  it('cannot move while it is moving already', async () => {
    const { board, server } = await openBoard()
    server.hold()

    void board.moveBy(card(board, 'Call'), 1)
    await flushPromises()

    expect(board.canMoveBy(card(board, 'Call'), -1)).toBe(false)
  })

  it('switches the board to the custom order first, and moves in it', async () => {
    const { board, server, view } = await openBoard('/?view=board', [
      task('Newest', { status: 'todo', position: 2 }),
      task('Oldest', { status: 'todo', position: 0 }),
    ])
    expect(titles(board).todo).toEqual(['Newest', 'Oldest'])
    expect(board.canMoveBy(card(board, 'Newest'), -1)).toBe(true)

    await board.moveBy(card(board, 'Newest'), -1)

    expect(view.ordering).toBe('position')
    expect(server.changes[0].body).toEqual({ position: -1 })
    expect(titles(board).todo).toEqual(['Newest', 'Oldest'])
  })
})

describe('the status menu in the custom order', () => {
  it('moves the card to the other column at the place its position gives it', async () => {
    const { board, server } = await openBoard()

    await board.move(card(board, 'Call'), 'in_progress')

    expect(server.changes[0].body).toEqual({ status: 'in_progress' })
    expect(titles(board).in_progress).toEqual(['Call', 'Plan'])
    expect(useUndoStore().label).toBe('statusChanged')
  })
})
