import { mount } from '@vue/test-utils'
import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'

import { useSettingsStore } from '../../stores/settings'
import { useTaskFormStore } from '../../stores/taskForm'
import { appPlugins } from '../../test/appPlugins'
import { task } from '../../test/tasksApi'
import TaskDeadline from './TaskDeadline.vue'
import TaskDescription from './TaskDescription.vue'
import TaskTitleButton from './TaskTitleButton.vue'

afterEach(() => {
  const pinia = getActivePinia()
  if (pinia) disposePinia(pinia)
})

describe('TaskTitleButton', () => {
  it('opens the task for editing, named for what it does', async () => {
    const shown = task('Write report')
    const title = mount(TaskTitleButton, { props: { task: shown }, global: { plugins: appPlugins() } })

    const button = title.get('button')
    expect(button.attributes('aria-label')).toBe('Edit: Write report')
    expect(button.text()).toBe('Write report')
    await button.trigger('click')

    expect(useTaskFormStore().task).toEqual(shown)
    expect(useTaskFormStore().open).toBe(true)
  })

  it('is muted when done, and takes its size from the class given', () => {
    const title = mount(TaskTitleButton, {
      props: { task: task('Write report'), done: true },
      attrs: { class: 'text-sm' },
      global: { plugins: appPlugins() },
    })

    expect(title.classes()).toEqual(expect.arrayContaining(['wrap-anywhere', 'text-text-muted', 'text-sm']))
    expect(title.find('span').exists()).toBe(false)
  })

  it('gives the title text the id asked for', () => {
    const title = mount(TaskTitleButton, {
      props: { task: task('Write report'), titleId: 'title-1' },
      global: { plugins: appPlugins() },
    })

    expect(title.get('#title-1').text()).toBe('Write report')
    expect(title.classes()).not.toContain('text-text-muted')
  })
})

describe('TaskDeadline', () => {
  function mountDeadline(props: { deadline: string | null; overdue: boolean; icon?: boolean }) {
    return mount(TaskDeadline, { props, global: { plugins: appPlugins() } })
  }

  it('shows a dash, and says there is no deadline to a screen reader', () => {
    const deadline = mountDeadline({ deadline: null, overdue: false })

    expect(deadline.get('[aria-hidden="true"]').text()).toBe('—')
    expect(deadline.get('.sr-only').text()).toBe('No deadline')
  })

  it('writes the deadline out, and marks it overdue in words', () => {
    expect(mountDeadline({ deadline: 'Mar 6', overdue: false }).text()).toBe('Due Mar 6')

    const overdue = mountDeadline({ deadline: 'Mar 6', overdue: true })
    expect(overdue.text()).toBe('Due Mar 6 · Overdue')
    expect(overdue.classes()).toContain('text-danger-text')
  })

  it('marks an overdue deadline with an icon and a tooltip in the icon variant', () => {
    const overdue = mountDeadline({ deadline: 'Mar 6', overdue: true, icon: true })

    expect(overdue.classes()).toEqual(expect.arrayContaining(['inline-flex', 'text-danger-text']))
    expect(overdue.attributes('title')).toBe('Overdue')
    expect(overdue.find('svg').exists()).toBe(true)
    expect(overdue.get('.sr-only').text()).toBe('· Overdue')

    const onTime = mountDeadline({ deadline: 'Mar 6', overdue: false, icon: true })
    expect(onTime.text()).toBe('Mar 6')
    expect(onTime.attributes('title')).toBeUndefined()
    expect(onTime.find('svg').exists()).toBe(false)
  })
})

describe('TaskDescription', () => {
  it('shows a description that is not blank, while the settings show descriptions', async () => {
    const plugins = appPlugins()
    useSettingsStore().showDescriptions = true
    const description = mount(TaskDescription, { props: { task: task('Write', { description: 'Draft' }) }, global: { plugins } })
    expect(description.get('[data-testid="task-description"]').text()).toBe('Draft')

    useSettingsStore().showDescriptions = false
    await description.vm.$nextTick()
    expect(description.find('[data-testid="task-description"]').exists()).toBe(false)
  })

  it('shows nothing for a blank description', () => {
    const plugins = appPlugins()
    useSettingsStore().showDescriptions = true
    const description = mount(TaskDescription, { props: { task: task('Write', { description: '  ' }) }, global: { plugins } })

    expect(description.find('[data-testid="task-description"]').exists()).toBe(false)
  })
})
