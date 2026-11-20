import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import type { TaskRead } from '../../api/generated/client'
import { useSettingsStore } from '../../stores/settings'
import { useTasksStore } from '../../stores/tasks'
import { useUndoStore } from '../../stores/undo'
import { appPlugins } from '../../test/appPlugins'
import { task } from '../../test/tasksApi'
import { taskServer } from '../../test/taskServer'
import TaskList from './TaskList.vue'

let mounted: VueWrapper | undefined

async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

function rows(): TaskRead[] {
  return [task('Write', { position: 0 }), task('Call', { position: 1 }), task('Read', { position: 2 })]
}

async function openList(address = '/?ordering=position') {
  const server = taskServer(rows())
  history.replaceState(null, '', address)
  mounted = mount(TaskList, { attachTo: document.body, global: { plugins: appPlugins() } })
  useTasksStore().start()
  await settle()
  return { list: mounted, server }
}

function titles(list: VueWrapper): string[] {
  return list.findAll('[data-testid="task-title"]').map((title) => title.text())
}

function rowOf(list: VueWrapper, title: string): DOMWrapper<Element> {
  return list.findAll('li[data-task-id]').find((row) => row.get('[data-testid="task-title"]').text() === title) as DOMWrapper<Element>
}

function handle(list: VueWrapper, title: string): HTMLElement {
  return rowOf(list, title).get<HTMLElement>('[data-testid="task-move"]').element
}

const dragImages: Element[] = []

function dragEvent(type: string, clientY = 0): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  const transfer = new DataTransfer()
  Object.defineProperty(transfer, 'setDragImage', { value: (image: Element) => dragImages.push(image) })
  Object.defineProperty(event, 'dataTransfer', { value: transfer })
  Object.defineProperty(event, 'clientY', { value: clientY })
  return event
}

// Each row 50px high, from the top: the middle of the first is at 25.
function layOut(list: VueWrapper) {
  list.findAll('li[data-task-id]').forEach((row, index) => {
    row.element.getBoundingClientRect = () => ({ top: index * 50, height: 50 }) as DOMRect
  })
}

function rowsElement(list: VueWrapper): Element {
  return list.get('ul').element
}

async function drag(list: VueWrapper, title: string, clientY: number) {
  handle(list, title).dispatchEvent(dragEvent('dragstart'))
  await nextTick()
  layOut(list)
  const over = dragEvent('dragover', clientY)
  rowsElement(list).dispatchEvent(over)
  await nextTick()
  return over
}

function lines(list: VueWrapper) {
  return list.findAll('li[data-drop-line]').map((row) => [row.get('[data-testid="task-title"]').text(), row.attributes('data-drop-line')])
}

beforeEach(() => {
  localStorage.clear()
  dragImages.length = 0
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  vi.unstubAllGlobals()
  const pinia = getActivePinia()
  if (pinia) disposePinia(pinia)
})

describe('the handles of the rows', () => {
  it('are there in the custom order only', async () => {
    const { list } = await openList()
    expect(list.findAll('[data-testid="row-handle"]')).toHaveLength(3)
    expect(handle(list, 'Call').getAttribute('aria-label')).toBe('Move «Call»')
    expect(handle(list, 'Call').getAttribute('draggable')).toBe('true')
    list.unmount()

    const other = (await openList('/?ordering=deadline')).list
    expect(other.find('[data-testid="row-handle"]').exists()).toBe(false)
  })

  it('sit level with the first line of a row in either density', async () => {
    const { list } = await openList()
    expect(list.get('[data-testid="row-handle"]').classes()).toContain('pt-2')

    useSettingsStore().density = 'compact'
    await nextTick()

    expect(list.get('[data-testid="row-handle"]').classes()).toContain('pt-0.5')
  })
})

describe('dragging a row by its handle', () => {
  it('drags the whole row, and shows a line where it would land', async () => {
    const { list } = await openList()

    const over = await drag(list, 'Read', 40)

    expect(dragImages).toEqual([rowOf(list, 'Read').element])
    expect(over.defaultPrevented).toBe(true)
    expect(lines(list)).toEqual([['Call', 'before']])
  })

  it('offers nothing over its own place, and no line once the drag ends', async () => {
    const { list } = await openList()

    const over = await drag(list, 'Call', 40)
    expect(over.defaultPrevented).toBe(false)
    expect(lines(list)).toEqual([])

    const below = dragEvent('dragover', 500)
    rowsElement(list).dispatchEvent(below)
    await nextTick()
    expect(lines(list)).toEqual([['Read', 'after']])

    handle(list, 'Call').dispatchEvent(dragEvent('dragend'))
    await nextTick()
    expect(lines(list)).toEqual([])
  })

  it('clears the line when it leaves the list, but not while it passes over a row inside it', async () => {
    const { list } = await openList()
    await drag(list, 'Read', 0)

    const intoRow = dragEvent('dragleave')
    Object.defineProperty(intoRow, 'relatedTarget', { value: rowOf(list, 'Call').element })
    rowsElement(list).dispatchEvent(intoRow)
    await nextTick()
    expect(lines(list)).toEqual([['Write', 'before']])

    rowsElement(list).dispatchEvent(dragEvent('dragleave'))
    await nextTick()
    expect(lines(list)).toEqual([])
  })

  it('drops the row there at once, sends the midpoint and offers to undo it', async () => {
    const { list, server } = await openList()

    await drag(list, 'Read', 40)
    rowsElement(list).dispatchEvent(dragEvent('drop'))
    await nextTick()

    expect(titles(list)).toEqual(['Write', 'Read', 'Call'])
    expect(lines(list)).toEqual([])
    expect(rowOf(list, 'Read').attributes('aria-busy')).toBe('true')
    await settle()
    expect(server.changes).toEqual([{ method: 'PATCH', path: '/api/v1/tasks/id-Read', body: { position: 0.5 } }])
    expect(useUndoStore().label).toBe('moved')
  })

  it('ignores a drop with nowhere to land, and a dragover that did not start at a handle', async () => {
    const { list, server } = await openList()

    const stray = dragEvent('dragover', 40)
    rowsElement(list).dispatchEvent(stray)
    rowsElement(list).dispatchEvent(dragEvent('drop'))
    await settle()

    expect(stray.defaultPrevented).toBe(false)
    expect(server.changes).toEqual([])
  })
})

describe('the keyboard way to move a row', () => {
  function moveItems(): HTMLElement[] {
    return Array.from(document.body.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]'))
  }

  it('is the menu of its handle: Move up and Move down, off at the ends of the page', async () => {
    const { list } = await openList()

    handle(list, 'Write').click()
    await settle()

    expect(moveItems().map((item) => [item.textContent?.trim(), item.hasAttribute('data-disabled')])).toEqual([
      ['Move up', true],
      ['Move down', false],
    ])
  })

  it('moves the row one place and keeps the focus on its handle', async () => {
    const { list, server } = await openList()

    handle(list, 'Write').click()
    await settle()
    moveItems()[1].click()
    await settle()

    expect(server.changes.map((change) => change.body)).toEqual([{ position: 1.5 }])
    expect(titles(list)).toEqual(['Call', 'Write', 'Read'])
    expect(document.activeElement).toBe(handle(list, 'Write'))
  })

  it('moves a row up past the one before it', async () => {
    const { list, server } = await openList()

    handle(list, 'Read').click()
    await settle()
    moveItems()[0].click()
    await settle()

    expect(server.changes.map((change) => change.body)).toEqual([{ position: 0.5 }])
    expect(titles(list)).toEqual(['Write', 'Read', 'Call'])
  })
})
