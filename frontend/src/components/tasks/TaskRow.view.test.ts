import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { useSettingsStore } from '../../stores/settings'
import { appPlugins } from '../../test/appPlugins'
import { task } from '../../test/tasksApi'
import TaskRow from './TaskRow.vue'

const mounted: VueWrapper[] = []

function mountRow(description: string | null) {
  const row = mount(TaskRow, {
    props: { task: task('Write the report', { description }) },
    global: { plugins: appPlugins() },
  })
  mounted.push(row)
  return row
}

function preview(row: VueWrapper) {
  return row.find('[data-testid="task-description"]')
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  mounted.splice(0).forEach((row) => row.unmount())
})

describe('description preview', () => {
  it('is not shown while the setting is off', () => {
    expect(preview(mountRow('Numbers for March')).exists()).toBe(false)
  })

  it('shows the description on one truncated line under the title when the setting is on', async () => {
    const row = mountRow('Numbers for March\nand April')
    useSettingsStore().showDescriptions = true
    await nextTick()

    expect(preview(row).text()).toBe('Numbers for March\nand April')
    expect(preview(row).classes()).toContain('truncate')
  })

  it('is left out for a task without a description, or one of only spaces', async () => {
    const empty = mountRow(null)
    const blank = mountRow('   ')
    useSettingsStore().showDescriptions = true
    await nextTick()

    expect(preview(empty).exists()).toBe(false)
    expect(preview(blank).exists()).toBe(false)
  })
})

describe('density', () => {
  it('leaves more room around a row when comfortable than when compact', async () => {
    const row = mountRow(null)
    expect(row.classes()).toContain('py-3')

    useSettingsStore().density = 'compact'
    await nextTick()

    expect(row.classes()).toContain('py-1.5')
    expect(row.classes()).not.toContain('py-3')
  })
})
