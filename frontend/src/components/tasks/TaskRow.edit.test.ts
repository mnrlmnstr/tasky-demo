import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { TaskRead } from '../../api/generated/client'
import type { Locale } from '../../stores/settings'
import { useTaskFormStore } from '../../stores/taskForm'
import { appPlugins } from '../../test/appPlugins'
import { task } from '../../test/tasksApi'
import TaskRow from './TaskRow.vue'

// Rows share one timer while any of them is mounted, so every test takes its row down again.
let mounted: VueWrapper | undefined

function mountRow(shown: TaskRead, locale: Locale = 'en') {
  mounted = mount(TaskRow, { props: { task: shown }, global: { plugins: appPlugins(locale) } })
  return mounted
}

describe('editing from a task row', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = undefined
  })

  it('makes the title a button that still reads as the title', () => {
    const row = mountRow(task('Write report'))

    const title = row.get('[data-testid="task-title"] button')
    expect(title.text()).toBe('Write report')
    expect(title.attributes('type')).toBe('button')
  })

  it('names the button after what it does', () => {
    const row = mountRow(task('Write report'))

    expect(row.get('[data-testid="task-title"] button').attributes('aria-label')).toBe('Edit: Write report')
  })

  it('names it in Ukrainian when the language is Ukrainian', () => {
    const row = mountRow(task('Звіт'), 'uk')

    expect(row.get('[data-testid="task-title"] button').attributes('aria-label')).toBe('Редагувати: Звіт')
  })

  it('opens the form with this task when the title is pressed', async () => {
    const report = task('Write report', { priority: 'high' })
    const row = mountRow(report)
    const form = useTaskFormStore()
    expect(form.open).toBe(false)

    await row.get('[data-testid="task-title"] button').trigger('click')

    expect(form.open).toBe(true)
    expect(form.task).toEqual(report)
  })
})
