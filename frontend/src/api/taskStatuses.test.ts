import { describe, expect, it } from 'vitest'

import { TaskStatus } from './generated/client'
import { TASK_STATUSES } from './taskStatuses'

describe('the list of statuses', () => {
  it('lists every status the API knows once, in the order a task goes through them', () => {
    expect(TASK_STATUSES).toEqual(['todo', 'in_progress', 'done'])
    expect([...TASK_STATUSES].sort()).toEqual(Object.values(TaskStatus).sort())
  })
})
