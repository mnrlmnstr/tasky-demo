import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TaskRead } from '../../api/generated/client'
import type { Locale } from '../../stores/settings'
import { useUndoStore } from '../../stores/undo'
import { appPlugins } from '../../test/appPlugins'
import { task } from '../../test/tasksApi'
import { taskServer } from '../../test/taskServer'
import TaskRow from './TaskRow.vue'

let mounted: VueWrapper | undefined

/** Lets reka-ui finish its deferred work: focus moves and positioning are set up on a timer. */
async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

// A row on its own, outside a list: the tasks store is not started, so nothing is reloaded.
async function mountRow(row: TaskRead, locale: Locale = 'en') {
  const server = taskServer([row])
  mounted = mount(TaskRow, {
    props: { task: row },
    attachTo: document.body,
    global: { plugins: appPlugins(locale) },
  })
  await settle()
  return { row: mounted, server }
}

function statusTrigger(row: VueWrapper) {
  return row.get<HTMLButtonElement>('[data-testid="task-status"]')
}

function menuItems(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitemradio"]'))
}

function dialogText(): string {
  return document.body.querySelector('[role="alertdialog"]')?.textContent ?? ''
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

describe('the status control of a row', () => {
  it('is a button that says the status and what it does, also as a tooltip', async () => {
    const { row } = await mountRow(task('Write', { status: 'done' }))

    const trigger = statusTrigger(row)
    expect(trigger.element.tagName).toBe('BUTTON')
    expect(trigger.attributes('type')).toBe('button')
    expect(trigger.attributes('aria-label')).toBe('Status: Done. Change status')
    expect(trigger.attributes('title')).toBe('Status: Done. Change status')
    expect(trigger.get('svg').attributes('aria-hidden')).toBe('true')
    expect(trigger.attributes('aria-busy')).toBeUndefined()
  })

  it('lists the statuses in Ukrainian when the language is Ukrainian', async () => {
    const { row } = await mountRow(task('Write'), 'uk')

    statusTrigger(row).element.click()
    await settle()

    expect(menuItems().map((item) => item.textContent?.trim())).toEqual(['До виконання', 'У роботі', 'Виконано'])
  })

  it('saves the picked status and offers the undo', async () => {
    const { row, server } = await mountRow(task('Write'))

    statusTrigger(row).element.click()
    await settle()
    menuItems()[1].click()
    await settle()

    expect(server.changes).toEqual([{ method: 'PATCH', path: '/api/v1/tasks/id-Write', body: { status: 'in_progress' } }])
    expect(statusTrigger(row).attributes('aria-label')).toBe('Status: In progress. Change status')
    expect(useUndoStore().label).toBe('statusChanged')
  })

  it('reports a failure the API layer did not name as a server error, not as nothing', async () => {
    const { row } = await mountRow(task('Write'))
    // Not a response at all, so reading it throws something other than an ApiError.
    vi.stubGlobal('fetch', vi.fn(async () => null))

    statusTrigger(row).element.click()
    await settle()
    menuItems()[2].click()
    await settle()

    expect(useUndoStore().notice).toBe('server')
    expect(statusTrigger(row).attributes('aria-label')).toBe('Status: To do. Change status')
  })

  it('reports a delete that failed in a way the API layer did not name, as a server error', async () => {
    const { row } = await mountRow(task('Write'))
    vi.stubGlobal('fetch', vi.fn(async () => null))

    row.get<HTMLButtonElement>('button[aria-label="Delete task"]').element.click()
    await settle()
    const confirm = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')).find(
      (button) => button.textContent?.trim() === 'Delete',
    )
    confirm?.click()
    await settle()

    expect(useUndoStore().notice).toBe('server')
    expect(row.get('div').attributes('aria-busy')).toBeUndefined()
  })

  it('follows the task it is given once the list has a newer copy', async () => {
    const { row } = await mountRow(task('Write'))
    statusTrigger(row).element.click()
    await settle()
    menuItems()[2].click()
    await settle()

    await row.setProps({ task: task('Write', { status: 'in_progress' }) })

    expect(statusTrigger(row).attributes('aria-label')).toBe('Status: In progress. Change status')
  })
})

describe('the delete control of a row', () => {
  it('is a quiet icon button after the priority, named in the language of the page', async () => {
    const { row } = await mountRow(task('Write'), 'uk')

    const button = row.get('button[aria-label="Видалити задачу"]')
    expect(button.find('svg.lucide-trash-2').exists()).toBe(true)
    expect(button.attributes('aria-disabled')).toBeUndefined()
    expect(row.get('[data-tone]').element.nextElementSibling).toBe(button.element)
  })

  it('asks in Ukrainian when the language is Ukrainian', async () => {
    const { row } = await mountRow(task('Звіт'), 'uk')

    row.get<HTMLButtonElement>('button[aria-label="Видалити задачу"]').element.click()
    await settle()

    expect(dialogText()).toContain('Видалити «Звіт»?')
    expect(dialogText()).toContain('Відновити її буде неможливо.')
    expect(dialogText()).toContain('Скасувати')
  })

  it('names a title with message syntax in it as it is written', async () => {
    const { row } = await mountRow(task('Pay {amount} @ bank | today'))

    row.get<HTMLButtonElement>('button[aria-label="Delete task"]').element.click()
    await settle()

    expect(dialogText()).toContain('Delete «Pay {amount} @ bank | today»?')
  })
})

describe('a row outside a list', () => {
  it('goes away with the focus on it without anything to hand the focus to', async () => {
    const { row } = await mountRow(task('Write'))
    statusTrigger(row).element.focus()

    row.unmount()
    mounted = undefined

    expect(document.activeElement).toBe(document.body)
  })
})
