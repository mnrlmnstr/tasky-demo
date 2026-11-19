import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TaskRead } from './api/generated/client'
import App from './App.vue'
import { offerUndoOfStatusChange } from './stores/undoActions'
import { appPlugins } from './test/appPlugins'
import { pageOf, task } from './test/tasksApi'

const TOAST = '[data-testid="undo-toast"]'

let mounted: VueWrapper | undefined

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// A server holding `rows`: it lists them as they are at that moment and applies a PATCH to the first one.
function serveTasks(rows: TaskRead[], { taskIsGone = false } = {}) {
  const answer: typeof fetch = async (_input, init) => {
    if (init?.method !== 'PATCH') return json({ ...pageOf([]), items: [...rows], total: rows.length })
    if (taskIsGone) {
      rows.shift()
      return json({ detail: 'Task not found' }, 404)
    }
    rows[0] = { ...rows[0], ...JSON.parse(String(init.body)) }
    return json(rows[0])
  }
  vi.stubGlobal('fetch', vi.fn(answer))
}

async function openApp() {
  mounted = mount(App, { attachTo: document.body, global: { plugins: appPlugins() } })
  await flushPromises()
  return mounted
}

function statusIcons(page: VueWrapper): string[] {
  return page.findAll('main li [role="img"]').map((icon) => icon.attributes('aria-label') ?? '')
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

describe('undo in the app', () => {
  it('shows no toast until an action offers an undo', async () => {
    serveTasks([task('Write report')])

    const page = await openApp()

    expect(page.find(TOAST).exists()).toBe(false)
    expect(page.findAll('[role="status"][aria-live="polite"]')).toHaveLength(1)
  })

  it('puts the task back in the list as it was before the status change', async () => {
    const before = task('Write report', { status: 'in_progress' })
    const after: TaskRead = { ...before, status: 'done' }
    serveTasks([after, task('Other')])
    const page = await openApp()
    expect(statusIcons(page)).toEqual(['Done', 'To do'])

    offerUndoOfStatusChange(before, after)
    await flushPromises()
    expect(page.get(TOAST).text()).toContain('Status changed')
    await page.get(`${TOAST} button[data-variant="ghost"]`).trigger('click')
    await flushPromises()

    expect(statusIcons(page)).toEqual(['In progress', 'To do'])
    expect(page.find(TOAST).exists()).toBe(false)
  })

  it('says the task is already gone when the undo comes too late, and shows the list without it', async () => {
    const before = task('Write report', { status: 'in_progress' })
    const after: TaskRead = { ...before, status: 'done' }
    serveTasks([after, task('Other')], { taskIsGone: true })
    const page = await openApp()

    offerUndoOfStatusChange(before, after)
    await flushPromises()
    await page.get(`${TOAST} button[data-variant="ghost"]`).trigger('click')
    await flushPromises()

    expect(page.get(TOAST).text()).toContain('Could not undo. This task no longer exists.')
    expect(page.findAll('main [data-testid="task-title"]').map((title) => title.text())).toEqual(['Other'])
  })
})
