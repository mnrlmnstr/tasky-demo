import { flushPromises } from '@vue/test-utils'
import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TaskRead } from '../api/generated/client'
import { task } from '../test/tasksApi'
import { taskServer } from '../test/taskServer'
import { useListOrderStore } from './listOrder'
import { useTasksStore } from './tasks'
import { useUndoStore } from './undo'

let pinia: Pinia | undefined

function rows(): TaskRead[] {
  return [task('Write', { position: 0 }), task('Call', { position: 1 }), task('Read', { position: 2 })]
}

async function openList(address = '/?ordering=position', given = rows()) {
  history.replaceState(null, '', address)
  pinia = createPinia()
  setActivePinia(pinia)
  const server = taskServer(given)
  useTasksStore().start()
  await flushPromises()
  return { order: useListOrderStore(), server, undo: useUndoStore() }
}

function titles(order: ReturnType<typeof useListOrderStore>): string[] {
  return order.items.map((item) => item.title)
}

function row(order: ReturnType<typeof useListOrderStore>, title: string): TaskRead {
  return order.items.find((item) => item.title === title) as TaskRead
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (pinia) disposePinia(pinia)
  pinia = undefined
})

describe('reordering the list', () => {
  it('moves a row between two others at once and sends their midpoint', async () => {
    const { order, server } = await openList()
    const release = server.hold()

    void order.place(row(order, 'Read'), 1)
    await flushPromises()

    expect(titles(order)).toEqual(['Write', 'Read', 'Call'])
    expect(order.isMoving('id-Read')).toBe(true)
    expect(server.changes).toEqual([{ method: 'PATCH', path: '/api/v1/tasks/id-Read', body: { position: 0.5 } }])
    release()
    await flushPromises()
    expect(order.isMoving('id-Read')).toBe(false)
    expect(titles(order)).toEqual(['Write', 'Read', 'Call'])
  })

  it('keeps a row still on its way in its new place through an answer of the list', async () => {
    const { order, server } = await openList()
    server.hold()
    void order.place(row(order, 'Write'), 2)
    await flushPromises()

    useTasksStore().retry()
    await flushPromises()

    expect(titles(order)).toEqual(['Call', 'Read', 'Write'])
  })

  it('keeps the row in its new place until the list answers again, then follows the answer', async () => {
    const { order, server } = await openList()
    server.loseListConnection()

    await order.place(row(order, 'Write'), 2)
    await flushPromises()
    expect(titles(order)).toEqual(['Call', 'Read', 'Write'])

    server.loseListConnection(false)
    useTasksStore().retry()
    await flushPromises()
    expect(titles(order)).toEqual(['Call', 'Read', 'Write'])
  })

  it('puts the row back when the change fails, and says why', async () => {
    const { order, server, undo } = await openList()
    server.failChanges('offline')

    await order.place(row(order, 'Write'), 2)

    expect(titles(order)).toEqual(['Write', 'Call', 'Read'])
    expect(undo.notice).toBe('network')
  })

  it('drops the row when the task is gone', async () => {
    const { order, server } = await openList()
    server.failChanges(404)

    await order.place(row(order, 'Write'), 2)

    expect(titles(order)).toEqual(['Call', 'Read'])
  })

  it('can be undone', async () => {
    const { order, server, undo } = await openList()
    await order.place(row(order, 'Write'), 2)
    await flushPromises()

    await undo.run()
    await flushPromises()

    expect(server.changes.at(-1)?.body).toEqual({ position: 0 })
    expect(titles(order)).toEqual(['Write', 'Call', 'Read'])
  })

  it('sends nothing for a row put back where it was, or still moving', async () => {
    const { order, server } = await openList()
    await order.place(row(order, 'Call'), 1)
    expect(server.changes).toEqual([])

    server.hold()
    void order.place(row(order, 'Call'), 0)
    void order.place(row(order, 'Call'), 2)
    await flushPromises()
    expect(server.changes).toHaveLength(1)
  })

  it('is only for the custom order', async () => {
    const { order, server } = await openList('/')

    expect(order.isCustomOrder).toBe(false)
    expect(order.canMoveBy(row(order, 'Call'), 1)).toBe(false)
    await order.place(row(order, 'Call'), 0)
    expect(server.changes).toEqual([])
  })
})

describe('moving a row by one place', () => {
  it('goes up or down within the page, and not past either end', async () => {
    const { order, server } = await openList()

    expect(order.canMoveBy(row(order, 'Write'), -1)).toBe(false)
    expect(order.canMoveBy(row(order, 'Read'), 1)).toBe(false)
    expect(order.canMoveBy(row(order, 'Call'), -1)).toBe(true)
    await order.moveBy(row(order, 'Read'), 1)
    await order.moveBy(row(order, 'Call'), -1)

    expect(server.changes.map((change) => change.body)).toEqual([{ position: -1 }])
    expect(titles(order)).toEqual(['Call', 'Write', 'Read'])
  })

  it('cannot move a row that is moving already', async () => {
    const { order, server } = await openList()
    server.hold()

    void order.moveBy(row(order, 'Call'), 1)
    await flushPromises()

    expect(order.canMoveBy(row(order, 'Call'), 1)).toBe(false)
  })
})
