import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TaskRead } from '../../api/generated/client'
import { onTasksChanged } from '../../stores/taskChanges'
import { useUndoStore } from '../../stores/undo'
import { appPlugins } from '../../test/appPlugins'
import { task } from '../../test/tasksApi'
import { taskServer } from '../../test/taskServer'
import TaskRow from './TaskRow.vue'

let mounted: VueWrapper | undefined

async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

async function mountRow(row: TaskRead) {
  const server = taskServer([row])
  mounted = mount(TaskRow, {
    props: { task: row },
    attachTo: document.body,
    global: { plugins: appPlugins() },
  })
  await settle()
  return { row: mounted, server }
}

function priorityTrigger(row: VueWrapper) {
  return row.get<HTMLButtonElement>('[data-testid="task-priority"]')
}

function menuItems(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitemradio"]'))
}

async function pickPriority(row: VueWrapper, label: string) {
  priorityTrigger(row).element.click()
  await settle()
  const item = menuItems().find((candidate) => candidate.textContent?.trim() === label)
  if (!item) throw new Error(`The menu has no "${label}" item`)
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

describe('changing the priority of a row', () => {
  it('shows the picked priority at once, before the server has answered', async () => {
    const { row, server } = await mountRow(task('Write', { priority: 'low' }))
    const release = server.hold()

    await pickPriority(row, 'High')

    expect(priorityTrigger(row).attributes('aria-label')).toBe('Priority: High. Change priority')
    expect(priorityTrigger(row).get('[data-tone]').attributes('data-tone')).toBe('warning')
    release()
    await settle()
  })

  it('sends only the new priority, says the tasks changed and offers the undo', async () => {
    const { row, server } = await mountRow(task('Write', { priority: 'low' }))
    const changes = vi.fn()
    onTasksChanged(changes)

    await pickPriority(row, 'High')

    expect(server.changes).toEqual([{ method: 'PATCH', path: '/api/v1/tasks/id-Write', body: { priority: 'high' } }])
    expect(changes).toHaveBeenCalledTimes(1)
    expect(changes).toHaveBeenCalledWith({})
    expect(useUndoStore().label).toBe('priorityChanged')
  })

  it('puts the previous priority back on undo', async () => {
    const { row, server } = await mountRow(task('Write', { priority: 'low' }))
    await pickPriority(row, 'Medium')

    await useUndoStore().run()
    await settle()

    expect(server.changes.at(-1)).toEqual({ method: 'PATCH', path: '/api/v1/tasks/id-Write', body: { priority: 'low' } })
  })

  it('does nothing when the current priority is picked again', async () => {
    const { row, server } = await mountRow(task('Write', { priority: 'medium' }))

    await pickPriority(row, 'Medium')

    expect(server.changes).toEqual([])
    expect(useUndoStore().label).toBeNull()
  })

  it('puts the priority back and says why when the change fails', async () => {
    const { row, server } = await mountRow(task('Write', { priority: 'low' }))
    server.failChanges('offline')

    await pickPriority(row, 'High')

    expect(priorityTrigger(row).attributes('aria-label')).toBe('Priority: Low. Change priority')
    expect(useUndoStore().notice).toBe('network')
    expect(useUndoStore().label).toBeNull()
  })

  it('drops the task once the server says it is gone', async () => {
    const { row, server } = await mountRow(task('Write', { priority: 'low' }))
    server.failChanges(404)
    const changes = vi.fn()
    onTasksChanged(changes)

    await pickPriority(row, 'High')

    expect(changes).toHaveBeenCalledWith({ deleted: 'id-Write' })
    expect(useUndoStore().notice).toBe('not_found')
  })

  it('is busy while the change is on its way, and cannot be used again meanwhile', async () => {
    const { row, server } = await mountRow(task('Write', { priority: 'low' }))
    const release = server.hold()

    await pickPriority(row, 'High')

    expect(priorityTrigger(row).attributes('aria-busy')).toBe('true')
    expect(priorityTrigger(row).attributes('aria-disabled')).toBe('true')
    priorityTrigger(row).element.click()
    await settle()
    menuItems()[1].click()
    await settle()
    expect(server.changes).toHaveLength(1)
    // The status and the delete wait for it too: one request per row at a time.
    expect(row.get('button[aria-label="Delete task"]').attributes('aria-disabled')).toBe('true')

    release()
    await settle()

    expect(priorityTrigger(row).attributes('aria-busy')).toBeUndefined()
    expect(priorityTrigger(row).attributes('aria-disabled')).toBeUndefined()
  })

  it('cannot be changed while the status is on its way', async () => {
    const { row, server } = await mountRow(task('Write', { priority: 'low' }))
    const release = server.hold()
    row.get<HTMLButtonElement>('[data-testid="task-status"]').element.click()
    await settle()
    menuItems()[2].click()
    await settle()

    priorityTrigger(row).element.click()
    await settle()
    menuItems()[2].click()
    await settle()

    expect(server.changes).toHaveLength(1)
    release()
    await settle()
  })

  it('hands the focus back to the trigger once a priority is picked', async () => {
    const { row } = await mountRow(task('Write', { priority: 'low' }))

    await pickPriority(row, 'High')

    expect(document.activeElement).toBe(priorityTrigger(row).element)
  })

  it('follows the task it is given once the list has a newer copy', async () => {
    const { row } = await mountRow(task('Write', { priority: 'low' }))
    await pickPriority(row, 'High')

    await row.setProps({ task: task('Write', { priority: 'medium' }) })

    expect(priorityTrigger(row).attributes('aria-label')).toBe('Priority: Medium. Change priority')
  })

  it('keeps the picked priority while it is on its way, also when the list answers meanwhile', async () => {
    const { row, server } = await mountRow(task('Write', { priority: 'low' }))
    const release = server.hold()
    await pickPriority(row, 'High')

    await row.setProps({ task: task('Write', { priority: 'low' }) })

    expect(priorityTrigger(row).attributes('aria-label')).toBe('Priority: High. Change priority')
    release()
    await settle()
  })
})
