import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TaskRead } from './api/generated/client'
import App from './App.vue'
import { appPlugins } from './test/appPlugins'
import { task } from './test/tasksApi'
import { taskServer } from './test/taskServer'

let mounted: VueWrapper | undefined

async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

async function openApp(rows: TaskRead[], address = '/') {
  const server = taskServer(rows)
  history.replaceState(null, '', address)
  mounted = mount(App, { attachTo: document.body, global: { plugins: appPlugins() } })
  await settle()
  return { page: mounted, server }
}

function cardOf(page: VueWrapper, title: string): DOMWrapper<Element> {
  const card = page
    .findAll('[data-testid="board-card"]')
    .find((item) => item.get('[data-testid="task-title"]').text() === title)
  if (!card) throw new Error(`The board has no "${title}" card`)
  return card
}

function cardTitles(page: VueWrapper): string[] {
  return page.findAll('[data-testid="board-card"] [data-testid="task-title"]').map((title) => title.text())
}

async function pressDialogButton(label: string) {
  const dialog = document.body.querySelector('[role="alertdialog"]')
  const button = Array.from(dialog?.querySelectorAll('button') ?? []).find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!button) throw new Error(`The dialog has no "${label}" button`)
  button.click()
  await settle()
}

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  vi.unstubAllGlobals()
  const pinia = getActivePinia()
  if (pinia) disposePinia(pinia)
})

describe('delete in every view (adversary)', () => {
  // #36 "Every view keeps the existing actions: edit, status change, delete, undo"; the list takes a
  // deleted task off at once even when the reload after it fails. The board keeps the deleted card.
  it('takes a deleted card off the board also when the board cannot be reloaded afterwards', async () => {
    const { page, server } = await openApp([task('Write'), task('Call')], '/?view=board')
    server.loseListConnection()

    await cardOf(page, 'Write').get('button[aria-label="Delete task"]').trigger('click')
    await settle()
    await pressDialogButton('Delete')

    expect(server.changes).toEqual([{ method: 'DELETE', path: '/api/v1/tasks/id-Write', body: undefined }])
    expect(cardTitles(page)).toEqual(['Call'])
  })

})

describe('the board and the hidden status filter (adversary, decided in #43)', () => {
  // #36 "the status filter is hidden in this view"; the board shows every status, so nothing is filtered
  // away, yet "Clear filters" is offered for the status filter the board neither shows nor applies.
  it('offers no "Clear filters" on the board when only a status filter is set', async () => {
    const { page } = await openApp([task('Write'), task('Ship', { status: 'done' })], '/?view=board&status=done')

    expect(cardTitles(page)).toEqual(['Write', 'Ship'])
    const clear = page.findAll('main button').filter((button) => button.text() === 'Clear filters')
    expect(clear).toHaveLength(0)
  })
})
