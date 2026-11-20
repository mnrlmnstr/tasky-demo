import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import type { TaskRead } from '../../../api/generated/client'
import { CLOCK, type Clock } from '../../../i18n/clock'
import { useBoardStore } from '../../../stores/board'
import { useListViewStore } from '../../../stores/listView'
import { useSettingsStore, type Locale } from '../../../stores/settings'
import { useTaskFormStore } from '../../../stores/taskForm'
import { tasksChanged } from '../../../stores/taskChanges'
import { useUndoStore } from '../../../stores/undo'
import { appPlugins } from '../../../test/appPlugins'
import { fakeTasksApi, pageOf, task } from '../../../test/tasksApi'
import { taskServer } from '../../../test/taskServer'
import TaskBoard from './TaskBoard.vue'

const NOON: Clock = { now: () => new Date('2026-03-05T12:00:00Z'), timeZone: 'UTC' }

let mounted: VueWrapper | undefined

async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

function mountBoard(locale: Locale = 'en') {
  history.replaceState(null, '', '/?view=board')
  mounted = mount(TaskBoard, {
    attachTo: document.body,
    global: { plugins: appPlugins(locale), provide: { [CLOCK as symbol]: NOON } },
  })
  return mounted
}

async function openBoard(rows: TaskRead[]) {
  const server = taskServer(rows)
  const board = mountBoard()
  await settle()
  return { board, server }
}

function plainText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function rows(): TaskRead[] {
  return [
    task('Write', { status: 'todo', priority: 'high', deadline: '2026-03-01T10:00:00Z', position: 0 }),
    task('Call', { status: 'todo', description: 'Ask about the invoice', position: 1 }),
    task('Plan', { status: 'in_progress', priority: 'low', deadline: '2026-03-20T10:00:00Z', position: 2 }),
    task('Ship', { status: 'done', deadline: '2026-03-01T10:00:00Z', position: 3 }),
  ]
}

function columns(board: VueWrapper) {
  return board.findAll('[data-testid="board-column"]')
}

function column(board: VueWrapper, status: string) {
  return board.get(`[data-testid="board-column"][data-status="${status}"]`)
}

function cardTitles(board: VueWrapper, status: string): string[] {
  return column(board, status)
    .findAll('[data-testid="task-title"]')
    .map((title) => title.text())
}

function card(board: VueWrapper, title: string): DOMWrapper<Element> {
  const found = board
    .findAll('[data-testid="board-card"]')
    .find((candidate) => candidate.get('[data-testid="task-title"]').text() === title)
  if (!found) throw new Error(`The board has no "${title}" card`)
  return found
}

function dragEvent(type: string, clientY = 0): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: new DataTransfer() })
  Object.defineProperty(event, 'clientY', { value: clientY })
  return event
}

// Each card 80px high with 20px between them, from the top of its column: the middle of the first is at 40.
function layOut(board: VueWrapper) {
  for (const candidate of columns(board)) {
    candidate.findAll('[data-testid="board-card"]').forEach((found, index) => {
      found.element.getBoundingClientRect = () => ({ top: index * 100, height: 80 }) as DOMRect
    })
  }
}

async function drag(board: VueWrapper, title: string, to: string, clientY = 0) {
  card(board, title).element.dispatchEvent(dragEvent('dragstart'))
  await nextTick()
  layOut(board)
  return dragOver(board, to, clientY)
}

async function dragOver(board: VueWrapper, to: string, clientY = 0) {
  const over = dragEvent('dragover', clientY)
  column(board, to).element.dispatchEvent(over)
  await nextTick()
  return over
}

async function drop(board: VueWrapper, to: string) {
  column(board, to).element.dispatchEvent(dragEvent('drop'))
  await nextTick()
}

function menuItems(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitemradio"]'))
}

async function pickStatus(board: VueWrapper, title: string, label: string) {
  card(board, title).get<HTMLButtonElement>('[data-testid="task-status"]').element.click()
  await settle()
  const item = menuItems().find((candidate) => candidate.textContent?.trim() === label)
  if (!item) throw new Error(`The status menu has no "${label}" item`)
  item.click()
  await settle()
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

describe('the columns', () => {
  it('are To do, In progress and Done, each headed by its name and how many tasks it holds', async () => {
    const { board } = await openBoard(rows())

    expect(columns(board).map((candidate) => candidate.get('h2').text())).toEqual([
      'To do 2',
      'In progress 1',
      'Done 1',
    ])
    expect(columns(board).map((candidate) => candidate.attributes('aria-label'))).toEqual([
      'To do: 2 tasks',
      'In progress: 1 task',
      'Done: 1 task',
    ])
    expect(board.get('section').attributes('aria-label')).toBe('Board')
  })

  it('each hold the cards of their status', async () => {
    const { board } = await openBoard(rows())

    expect([cardTitles(board, 'todo'), cardTitles(board, 'in_progress'), cardTitles(board, 'done')]).toEqual([
      ['Write', 'Call'],
      ['Plan'],
      ['Ship'],
    ])
  })

  it('show placeholders while loading, then the cards', async () => {
    const api = fakeTasksApi()
    const board = mountBoard()
    await flushPromises()

    expect(column(board, 'todo').find('[data-testid="board-column-loading"]').exists()).toBe(true)
    expect(column(board, 'todo').get('ul').attributes('aria-busy')).toBe('true')

    await api.respondTo(0, pageOf(['Write']))
    expect(column(board, 'todo').find('[data-testid="board-column-loading"]').exists()).toBe(false)
    expect(cardTitles(board, 'todo')).toEqual(['Write'])
    expect(column(board, 'in_progress').find('[data-testid="board-column-loading"]').exists()).toBe(true)
  })

  it('dim their cards while they reload', async () => {
    const api = fakeTasksApi()
    const board = mountBoard()
    await api.respondTo(0, pageOf(['Write']))

    useBoardStore().retry('todo')
    await nextTick()

    expect(column(board, 'todo').get('ul').attributes('aria-busy')).toBe('true')
    expect(column(board, 'todo').get('ul').classes()).toContain('opacity-50')
  })

  it('say so when they are empty', async () => {
    const { board } = await openBoard([task('Write')])

    expect(column(board, 'done').get('[data-testid="board-column-empty"]').text()).toBe('No tasks')
  })

  it('show a failure in the column it happened in, with a way to try again', async () => {
    const api = fakeTasksApi()
    const board = mountBoard()
    await api.respondTo(0, pageOf(['Write']))
    await api.failWith(1, 500)
    await api.respondTo(2, pageOf([]))

    const alert = column(board, 'in_progress').get('[role="alert"]')
    expect(alert.text()).toContain('Something went wrong on the server. Please try again.')
    expect(column(board, 'todo').find('[role="alert"]').exists()).toBe(false)

    await alert.get('button').trigger('click')
    expect(api.queries.at(-1)).toMatchObject({ status: 'in_progress' })
    // Pressed again while it asks: nothing more is sent.
    await column(board, 'in_progress').get('[role="alert"] button').trigger('click')
    expect(api.queries).toHaveLength(4)
    await api.respondTo(3, pageOf(['Plan']))
    expect(column(board, 'in_progress').find('[role="alert"]').exists()).toBe(false)
    expect(cardTitles(board, 'in_progress')).toEqual(['Plan'])
  })

  it('say how many they show when they hold more than fit', async () => {
    const api = fakeTasksApi()
    const board = mountBoard()

    await api.respondTo(0, pageOf(['Write', 'Call'], { total: 140 }))
    await api.respondTo(1, pageOf(['Plan']))

    expect(column(board, 'todo').get('[data-testid="board-column-more"]').text()).toBe('Showing 2 of 140')
    expect(column(board, 'in_progress').find('[data-testid="board-column-more"]').exists()).toBe(false)
  })

  it('speak Ukrainian', async () => {
    taskServer([task('Write'), task('Call'), task('Plan'), task('Ship'), task('Test'), task('Read')])
    const board = mountBoard('uk')
    await settle()

    expect(columns(board).map((candidate) => candidate.attributes('aria-label'))).toEqual([
      'До виконання: 6 задач',
      'У роботі: 0 задач',
      'Виконано: 0 задач',
    ])
    expect(column(board, 'done').get('[data-testid="board-column-empty"]').text()).toBe('Задач немає')
  })
})

describe('a card', () => {
  it('shows the title, the priority and the deadline, marked when it has passed', async () => {
    const { board } = await openBoard(rows())

    const write = card(board, 'Write')
    expect(write.get('[data-tone]').text()).toBe('High')
    expect(write.get('[data-tone]').attributes('data-tone')).toBe('warning')
    expect(plainText(write.get('[data-testid="task-deadline"]').text())).toBe('Due Mar 1, 2026, 10:00 AM · Overdue')
    expect(write.get('[data-testid="task-deadline"]').classes()).toContain('text-danger-text')
    expect(card(board, 'Plan').get('[data-testid="task-deadline"]').classes()).not.toContain('text-danger-text')
    expect(plainText(card(board, 'Ship').get('[data-testid="task-deadline"]').text())).toBe('Due Mar 1, 2026, 10:00 AM')
    expect(card(board, 'Call').find('[data-testid="task-deadline"]').exists()).toBe(false)
  })

  it('opens the edit form from its title', async () => {
    const { board } = await openBoard(rows())

    await card(board, 'Call').get('button[aria-label="Edit: Call"]').trigger('click')

    expect(useTaskFormStore().open).toBe(true)
    expect(useTaskFormStore().task?.title).toBe('Call')
  })

  it('shows the first line of the description only when the setting is on', async () => {
    const { board } = await openBoard(rows())
    expect(card(board, 'Call').find('[data-testid="task-description"]').exists()).toBe(false)

    useSettingsStore().showDescriptions = true
    await nextTick()

    expect(card(board, 'Call').get('[data-testid="task-description"]').text()).toBe('Ask about the invoice')
    expect(card(board, 'Call').get('[data-testid="task-description"]').classes()).toContain('truncate')
    expect(card(board, 'Write').find('[data-testid="task-description"]').exists()).toBe(false)
  })

  it('takes less room when the density is compact', async () => {
    const { board } = await openBoard(rows())
    expect(card(board, 'Call').classes()).toContain('p-3')

    useSettingsStore().density = 'compact'
    await nextTick()

    expect(card(board, 'Call').classes()).toContain('p-2')
  })

  it('can be dragged', async () => {
    const { board } = await openBoard(rows())

    expect(card(board, 'Call').attributes('draggable')).toBe('true')
  })

  it('cannot be dragged while it is moving', async () => {
    const { board, server } = await openBoard(rows())
    server.hold()
    await pickStatus(board, 'Call', 'Done')

    expect(card(board, 'Call').attributes('draggable')).toBe('false')
  })

  it('is named by its title', async () => {
    const { board } = await openBoard(rows())

    const named = card(board, 'Call')
    expect(document.getElementById(named.attributes('aria-labelledby') ?? '')?.textContent.trim()).toBe('Call')
  })
})

describe('dragging a card to another column', () => {
  it('marks the column under it as the place to drop, and not its own place', async () => {
    const { board } = await openBoard(rows())

    const over = await drag(board, 'Call', 'done')
    expect(over.defaultPrevented).toBe(true)
    expect(column(board, 'done').attributes('data-drop-target')).toBe('true')

    // Below the middle of Write, which is where Call already is.
    const ownPlace = await dragOver(board, 'todo', 150)
    expect(ownPlace.defaultPrevented).toBe(false)
    expect(column(board, 'todo').attributes('data-drop-target')).toBeUndefined()
    expect(column(board, 'todo').find('[data-drop-line]').exists()).toBe(false)
  })

  it('clears the mark once the card leaves the column, but not while it passes over a card inside it', async () => {
    const { board } = await openBoard(rows())
    await drag(board, 'Call', 'done')

    const intoCard = dragEvent('dragleave')
    Object.defineProperty(intoCard, 'relatedTarget', { value: card(board, 'Ship').element })
    column(board, 'done').element.dispatchEvent(intoCard)
    await nextTick()
    expect(column(board, 'done').attributes('data-drop-target')).toBe('true')

    column(board, 'done').element.dispatchEvent(dragEvent('dragleave'))
    await nextTick()
    expect(column(board, 'done').attributes('data-drop-target')).toBeUndefined()
  })

  it('clears the mark when the drag ends anywhere else', async () => {
    const { board } = await openBoard(rows())
    await drag(board, 'Call', 'done')

    card(board, 'Call').element.dispatchEvent(dragEvent('dragend'))
    await nextTick()

    expect(column(board, 'done').attributes('data-drop-target')).toBeUndefined()
  })

  it('moves the card there at once and sends its new status and place', async () => {
    const { board, server } = await openBoard(rows())
    server.hold()

    await drag(board, 'Call', 'done')
    await drop(board, 'done')

    expect(cardTitles(board, 'todo')).toEqual(['Write'])
    expect(cardTitles(board, 'done')).toEqual(['Call', 'Ship'])
    expect(column(board, 'done').get('h2').text()).toBe('Done 2')
    expect(column(board, 'done').attributes('data-drop-target')).toBeUndefined()
    expect(server.changes).toEqual([
      { method: 'PATCH', path: '/api/v1/tasks/id-Call', body: { position: 2, status: 'done' } },
    ])
    expect(card(board, 'Call').attributes('aria-busy')).toBe('true')
  })

  it('offers to undo the move once it went through', async () => {
    const { board } = await openBoard(rows())

    await drag(board, 'Call', 'in_progress')
    await drop(board, 'in_progress')
    await settle()

    expect(useUndoStore().label).toBe('moved')
    expect(cardTitles(board, 'in_progress')).toEqual(['Call', 'Plan'])
  })

  it('puts the card back when the change fails', async () => {
    const { board, server } = await openBoard(rows())
    server.failChanges(500)

    await drag(board, 'Call', 'done')
    await drop(board, 'done')
    await settle()

    expect(cardTitles(board, 'todo')).toEqual(['Write', 'Call'])
    expect(useUndoStore().notice).toBe('server')
  })

  it('ignores a drop that did not come from a card on this board', async () => {
    const { board, server } = await openBoard(rows())

    await drop(board, 'done')

    expect(server.changes).toEqual([])
  })

  it('ignores a drop on the place the card came from', async () => {
    const { board, server } = await openBoard(rows())

    await drag(board, 'Call', 'todo', 150)
    await drop(board, 'todo')

    expect(server.changes).toEqual([])
  })
})

describe('dragging a card to a place', () => {
  function lineAt(board: VueWrapper, status: string) {
    return column(board, status)
      .findAll('li[data-drop-line]')
      .map((item) => [item.get('[data-testid="task-title"]').text(), item.attributes('data-drop-line')])
  }

  it('switches the board to the custom order as it starts, and the address follows', async () => {
    const { board } = await openBoard(rows())
    expect(location.search).not.toContain('ordering')

    card(board, 'Call').element.dispatchEvent(dragEvent('dragstart'))
    await nextTick()

    expect(useListViewStore().ordering).toBe('position')
    expect(location.search).toContain('ordering=position')
  })

  it('shows a line before the card under the pointer, or after the last, and none once it ends', async () => {
    const { board } = await openBoard(rows())

    await drag(board, 'Plan', 'todo', 0)
    expect(lineAt(board, 'todo')).toEqual([['Write', 'before']])
    await dragOver(board, 'todo', 120)
    expect(lineAt(board, 'todo')).toEqual([['Call', 'before']])
    await dragOver(board, 'todo', 1000)
    expect(lineAt(board, 'todo')).toEqual([['Call', 'after']])

    card(board, 'Plan').element.dispatchEvent(dragEvent('dragend'))
    await nextTick()
    expect(lineAt(board, 'todo')).toEqual([])
  })

  it('offers no place to a drag that did not start on this board', async () => {
    const { board } = await openBoard(rows())

    const over = await dragOver(board, 'todo')

    expect(over.defaultPrevented).toBe(false)
  })

  it('clears the line when the card leaves the column', async () => {
    const { board } = await openBoard(rows())
    await drag(board, 'Plan', 'todo', 0)

    column(board, 'todo').element.dispatchEvent(dragEvent('dragleave'))
    await nextTick()

    expect(lineAt(board, 'todo')).toEqual([])
  })

  it('drops the card between two others, at once, with the midpoint of their positions', async () => {
    const { board, server } = await openBoard(rows())
    server.hold()

    await drag(board, 'Plan', 'todo', 120)
    await drop(board, 'todo')

    expect(cardTitles(board, 'todo')).toEqual(['Write', 'Plan', 'Call'])
    expect(lineAt(board, 'todo')).toEqual([])
    expect(server.changes).toEqual([
      { method: 'PATCH', path: '/api/v1/tasks/id-Plan', body: { position: 0.5, status: 'todo' } },
    ])
  })

  it('reorders the cards of one column, sending only the position', async () => {
    const { board, server } = await openBoard(rows())

    await drag(board, 'Write', 'todo', 1000)
    await drop(board, 'todo')
    await settle()

    expect(server.changes.map((change) => change.body)).toEqual([{ position: 2 }])
    expect(cardTitles(board, 'todo')).toEqual(['Call', 'Write'])
  })

  it('keeps the card between the two after the board loads again, and Undo puts it back', async () => {
    const { board } = await openBoard(rows())
    await drag(board, 'Plan', 'todo', 120)
    await drop(board, 'todo')
    await settle()

    tasksChanged()
    await settle()
    expect(cardTitles(board, 'todo')).toEqual(['Write', 'Plan', 'Call'])

    await useUndoStore().run()
    await settle()
    expect(cardTitles(board, 'todo')).toEqual(['Write', 'Call'])
    expect(cardTitles(board, 'in_progress')).toEqual(['Plan'])
  })
})

describe('the keyboard way to move a card up or down', () => {
  function moveItems(): HTMLElement[] {
    return Array.from(document.body.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]'))
  }

  async function openMoveMenu(board: VueWrapper, title: string) {
    card(board, title).get<HTMLButtonElement>('[data-testid="task-status"]').element.click()
    await settle()
    return moveItems()
  }

  it('is Move up and Move down in the status menu, each off at its end of the column', async () => {
    const { board } = await openBoard(rows())

    const items = await openMoveMenu(board, 'Call')

    expect(items.map((item) => [item.textContent?.trim(), item.hasAttribute('data-disabled')])).toEqual([
      ['Move up', false],
      ['Move down', true],
    ])
  })

  it('moves the card one place, by the same rules, and keeps the focus on it', async () => {
    const { board, server } = await openBoard(rows())

    const [up] = await openMoveMenu(board, 'Call')
    up.click()
    await settle()

    expect(server.changes.map((change) => change.body)).toEqual([{ position: -1 }])
    expect(useListViewStore().ordering).toBe('position')
    expect(cardTitles(board, 'todo')).toEqual(['Call', 'Write'])
    expect(document.activeElement).toBe(card(board, 'Call').get('[data-testid="task-status"]').element)
  })

  it('moves the card down past the next one', async () => {
    const { board, server } = await openBoard(rows())

    const [, down] = await openMoveMenu(board, 'Write')
    down.click()
    await settle()

    expect(server.changes.map((change) => change.body)).toEqual([{ position: 2 }])
    expect(cardTitles(board, 'todo')).toEqual(['Call', 'Write'])
  })

  it('offers nothing while the card is moving', async () => {
    const { board, server } = await openBoard(rows())
    server.hold()
    await pickStatus(board, 'Call', 'Done')

    const items = await openMoveMenu(board, 'Call')

    expect(items.every((item) => item.hasAttribute('data-disabled'))).toBe(true)
  })
})

describe('the keyboard way to move a card', () => {
  it('is the status menu of the card, which moves it to the chosen column and keeps the focus on it', async () => {
    const { board, server } = await openBoard(rows())

    await pickStatus(board, 'Call', 'In progress')

    expect(server.changes).toEqual([
      { method: 'PATCH', path: '/api/v1/tasks/id-Call', body: { status: 'in_progress' } },
    ])
    expect(cardTitles(board, 'in_progress')).toEqual(['Call', 'Plan'])
    expect(document.activeElement).toBe(card(board, 'Call').get('[data-testid="task-status"]').element)
  })

  it('does nothing when the current status is chosen again', async () => {
    const { board, server } = await openBoard(rows())

    await pickStatus(board, 'Call', 'To do')

    expect(server.changes).toEqual([])
  })
})

describe('deleting a card', () => {
  it('asks first, then deletes the task and drops the card', async () => {
    const { board, server } = await openBoard(rows())

    await card(board, 'Call').get('button[aria-label="Delete task"]').trigger('click')
    await settle()
    const dialog = document.body.querySelector('[role="alertdialog"]')
    expect(dialog?.textContent).toContain('Delete «Call»?')
    const confirm = Array.from(dialog?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent?.trim() === 'Delete',
    )
    confirm?.click()
    await settle()

    expect(server.changes).toEqual([{ method: 'DELETE', path: '/api/v1/tasks/id-Call', body: undefined }])
    expect(cardTitles(board, 'todo')).toEqual(['Write'])
  })

  it('cannot be dragged while it is being deleted', async () => {
    const { board, server } = await openBoard(rows())
    server.hold()
    await card(board, 'Call').get('button[aria-label="Delete task"]').trigger('click')
    await settle()
    const dialog = document.body.querySelector('[role="alertdialog"]')
    Array.from(dialog?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent?.trim() === 'Delete')
      ?.click()
    await settle()

    expect(card(board, 'Call').attributes('draggable')).toBe('false')
  })

  it('cannot be asked for while the card is moving', async () => {
    const { board, server } = await openBoard(rows())
    server.hold()
    await drag(board, 'Call', 'done')
    await drop(board, 'done')

    await card(board, 'Call').get('button[aria-label="Delete task"]').trigger('click')
    await settle()

    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()
  })
})

describe('what the board announces', () => {
  function announcement(board: VueWrapper): string {
    const regions = board.findAll('[role="status"]')
    expect(regions).toHaveLength(1)
    return regions[0].text()
  }

  it('says it loads, then how many tasks each column holds', async () => {
    const api = fakeTasksApi()
    const board = mountBoard()
    await flushPromises()
    expect(announcement(board)).toBe('Loading tasks…')

    await api.respondTo(0, pageOf(['Write', 'Call']))
    await api.respondTo(1, pageOf(['Plan']))
    await api.respondTo(2, pageOf([]))

    expect(announcement(board)).toBe('To do: 2 tasks; In progress: 1 task; Done: 0 tasks')
  })

  it('says it updates while the columns reload, and leaves a failure to the column', async () => {
    const api = fakeTasksApi()
    const board = mountBoard()
    await flushPromises()
    await api.respondTo(0, pageOf(['Write']))
    await api.respondTo(1, pageOf([]))
    await api.respondTo(2, pageOf([]))

    tasksChanged()
    await nextTick()
    expect(announcement(board)).toBe('Updating tasks…')

    await api.respondTo(3, pageOf(['Write']))
    await api.respondTo(4, pageOf([]))
    await api.failWith(5, 500)
    expect(announcement(board)).toBe('')
  })

  it('counts in Ukrainian', async () => {
    const api = fakeTasksApi()
    const board = mountBoard('uk')
    await flushPromises()
    await api.respondTo(0, pageOf(['Write', 'Call']))
    await api.respondTo(1, pageOf(['Plan']))
    await api.respondTo(2, pageOf(['A', 'B', 'C', 'D', 'E']))

    expect(announcement(board)).toBe('До виконання: 2 задачі; У роботі: 1 задача; Виконано: 5 задач')
  })
})

describe('the board on the page', () => {
  it('stops reloading its columns once it is gone', async () => {
    const { board, server } = await openBoard(rows())
    const before = server.lists

    board.unmount()
    mounted = undefined
    tasksChanged()
    await settle()

    expect(server.lists - before).toBe(0)
  })
})
