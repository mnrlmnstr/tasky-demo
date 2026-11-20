import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TaskRead } from '../../../api/generated/client'
import { CLOCK, type Clock } from '../../../i18n/clock'
import { useUndoStore } from '../../../stores/undo'
import { appPlugins } from '../../../test/appPlugins'
import { task } from '../../../test/tasksApi'
import { taskServer } from '../../../test/taskServer'
import TaskBoard from './TaskBoard.vue'

const NOON: Clock = { now: () => new Date('2026-03-05T12:00:00Z'), timeZone: 'UTC' }

let mounted: VueWrapper | undefined

async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

async function openBoard(rows: TaskRead[]) {
  const server = taskServer(rows)
  history.replaceState(null, '', '/?view=board')
  mounted = mount(TaskBoard, {
    attachTo: document.body,
    global: { plugins: appPlugins(), provide: { [CLOCK as symbol]: NOON } },
  })
  await settle()
  return { board: mounted, server }
}

function rows(): TaskRead[] {
  return [task('Write', { priority: 'low' }), task('Plan', { status: 'in_progress', priority: 'high' })]
}

function card(board: VueWrapper, title: string): DOMWrapper<Element> {
  const found = board
    .findAll('[data-testid="board-card"]')
    .find((candidate) => candidate.get('[data-testid="task-title"]').text() === title)
  if (!found) throw new Error(`The board has no "${title}" card`)
  return found
}

function priorityTrigger(board: VueWrapper, title: string) {
  return card(board, title).get<HTMLButtonElement>('[data-testid="task-priority"]')
}

function menuItems(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitemradio"]'))
}

async function pick(trigger: { element: HTMLButtonElement }, label: string) {
  trigger.element.click()
  await settle()
  const item = menuItems().find((candidate) => candidate.textContent?.trim() === label)
  if (!item) throw new Error(`The menu has no "${label}" item`)
  item.click()
  await settle()
}

function dragStart(): Event {
  const event = new Event('dragstart', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: new DataTransfer() })
  return event
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  vi.unstubAllGlobals()
  const pinia = getActivePinia()
  if (pinia) disposePinia(pinia)
})

describe('the priority of a card', () => {
  it('is a menu on the badge, named by the priority', async () => {
    const { board } = await openBoard(rows())

    expect(priorityTrigger(board, 'Plan').attributes('aria-label')).toBe('Priority: High. Change priority')
    expect(priorityTrigger(board, 'Plan').get('[data-tone]').attributes('data-tone')).toBe('warning')
  })

  it('changes at once, is saved, and still shows after the board reloads', async () => {
    const { board, server } = await openBoard(rows())
    const listsBefore = server.lists

    await pick(priorityTrigger(board, 'Write'), 'High')

    expect(server.changes).toEqual([{ method: 'PATCH', path: '/api/v1/tasks/id-Write', body: { priority: 'high' } }])
    expect(server.lists).toBeGreaterThan(listsBefore)
    expect(priorityTrigger(board, 'Write').attributes('aria-label')).toBe('Priority: High. Change priority')
    expect(useUndoStore().label).toBe('priorityChanged')
    expect(document.activeElement).toBe(priorityTrigger(board, 'Write').element)
  })

  it('goes back to the previous priority on undo', async () => {
    const { board } = await openBoard(rows())
    await pick(priorityTrigger(board, 'Write'), 'High')

    await useUndoStore().run()
    await settle()

    expect(priorityTrigger(board, 'Write').attributes('aria-label')).toBe('Priority: Low. Change priority')
  })

  it('goes back and says why when the change fails', async () => {
    const { board, server } = await openBoard(rows())
    server.failChanges(500)

    await pick(priorityTrigger(board, 'Write'), 'Medium')

    expect(priorityTrigger(board, 'Write').attributes('aria-label')).toBe('Priority: Low. Change priority')
    expect(useUndoStore().notice).toBe('server')
  })

  it('does not start a drag of the card', async () => {
    const { board } = await openBoard(rows())
    const event = dragStart()

    priorityTrigger(board, 'Write').element.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(card(board, 'Write').classes()).not.toContain('opacity-40')
    expect(board.findComponent({ name: 'BoardCard' }).emitted('dragstart')).toBeUndefined()
  })

  it('keeps the card from being dragged or moved while it is on its way', async () => {
    const { board, server } = await openBoard(rows())
    const release = server.hold()

    await pick(priorityTrigger(board, 'Write'), 'High')

    expect(card(board, 'Write').attributes('draggable')).toBe('false')
    expect(card(board, 'Write').attributes('aria-busy')).toBe('true')
    await pick(card(board, 'Write').get<HTMLButtonElement>('[data-testid="task-status"]'), 'Done')
    expect(server.changes).toHaveLength(1)
    release()
    await settle()
  })

  it('cannot be changed while the card is moving', async () => {
    const { board, server } = await openBoard(rows())
    const release = server.hold()
    await pick(card(board, 'Write').get<HTMLButtonElement>('[data-testid="task-status"]'), 'Done')

    await pick(priorityTrigger(board, 'Write'), 'High')

    expect(server.changes).toHaveLength(1)
    release()
    await settle()
  })
})
