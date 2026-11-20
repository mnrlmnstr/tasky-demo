import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { task } from '../test/tasksApi'
import { useTaskFormStore } from './taskForm'

describe('task form store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('is closed until something opens it', () => {
    const form = useTaskFormStore()

    expect(form.open).toBe(false)
    expect(form.task).toBeNull()
  })

  it('opens empty for a new task', () => {
    const form = useTaskFormStore()

    form.openCreate()

    expect(form.open).toBe(true)
    expect(form.task).toBeNull()
  })

  it('opens with the task to edit', () => {
    const form = useTaskFormStore()
    const report = task('Write report')

    form.openEdit(report)

    expect(form.open).toBe(true)
    expect(form.task).toEqual(report)
  })

  it('forgets the edited task when it is opened for a new one', () => {
    const form = useTaskFormStore()
    form.openEdit(task('Write report'))
    form.close()

    form.openCreate()

    expect(form.task).toBeNull()
  })

  it('closes', () => {
    const form = useTaskFormStore()
    form.openCreate()

    form.close()

    expect(form.open).toBe(false)
  })
})
