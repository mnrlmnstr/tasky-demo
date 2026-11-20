import { describe, expect, it } from 'vitest'

import { TaskPriority } from './generated/client'
import { TASK_PRIORITIES } from './taskPriorities'

describe('the list of priorities', () => {
  it('lists every priority the API knows once, from the lowest to the highest', () => {
    expect(TASK_PRIORITIES).toEqual(['low', 'medium', 'high'])
    expect([...TASK_PRIORITIES].sort()).toEqual(Object.values(TaskPriority).sort())
  })
})
