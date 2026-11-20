import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useListViewStore } from '../../stores/listView'
import type { Locale } from '../../stores/settings'
import { appPlugins } from '../../test/appPlugins'
import TaskToolbar from './TaskToolbar.vue'

let mounted: VueWrapper | undefined

async function mountToolbar(locale: Locale = 'en') {
  mounted = mount(TaskToolbar, { global: { plugins: appPlugins(locale) }, attachTo: document.body })
  await flushPromises()
  return mounted
}

function viewSwitch(toolbar: VueWrapper, name = 'View') {
  return toolbar.get(`[role="group"][aria-label="${name}"]`)
}

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
})

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  const pinia = getActivePinia()
  if (pinia) disposePinia(pinia)
})

describe('switching the view', () => {
  it('offers the list, the board and the table as icons, each named, after the sorting', async () => {
    const toolbar = await mountToolbar()

    const segments = viewSwitch(toolbar).findAll('button')
    expect(segments.map((segment) => segment.attributes('aria-label'))).toEqual(['List', 'Board', 'Table'])
    expect(segments.map((segment) => segment.find('svg').classes())).toEqual([
      expect.arrayContaining(['lucide-list']),
      expect.arrayContaining(['lucide-columns-3']),
      expect.arrayContaining(['lucide-table']),
    ])
    const cell = viewSwitch(toolbar).element.parentElement as HTMLElement
    expect(cell.lastElementChild).toBe(viewSwitch(toolbar).element)
    expect(cell.querySelector('button[aria-label^="Sort:"]')).not.toBeNull()
  })

  it('shows the current view as pressed', async () => {
    history.replaceState(null, '', '/?view=table')
    const toolbar = await mountToolbar()

    expect(viewSwitch(toolbar).findAll('button').map((segment) => segment.attributes('aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
    ])
  })

  it('changes the view when a segment is pressed', async () => {
    const toolbar = await mountToolbar()

    await viewSwitch(toolbar).findAll('button')[1].trigger('click')

    expect(useListViewStore().view).toBe('board')
  })

  it('hides the status filter on the board, whose columns are the statuses', async () => {
    const toolbar = await mountToolbar()
    expect(toolbar.find('[role="group"][aria-label="Status"]').exists()).toBe(true)

    useListViewStore().view = 'board'
    await flushPromises()
    expect(toolbar.find('[role="group"][aria-label="Status"]').exists()).toBe(false)

    useListViewStore().view = 'table'
    await flushPromises()
    expect(toolbar.find('[role="group"][aria-label="Status"]').exists()).toBe(true)
  })

  it('names the views in Ukrainian', async () => {
    const toolbar = await mountToolbar('uk')

    expect(
      viewSwitch(toolbar, 'Вигляд')
        .findAll('button')
        .map((segment) => segment.attributes('aria-label')),
    ).toEqual(['Список', 'Дошка', 'Таблиця'])
  })
})
