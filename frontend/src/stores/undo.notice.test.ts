import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../api/http'
import { UNDO_WINDOW_MS, useUndoStore } from './undo'

const done = () => Promise.resolve()

beforeEach(() => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.useRealTimers()
})

describe('an error notice', () => {
  it('has none until an action reports a failure', () => {
    expect(useUndoStore().notice).toBeNull()
  })

  it('holds the kind of the failure, apart from the error of a failed undo', () => {
    const undo = useUndoStore()

    undo.notifyError('network')

    expect(undo.notice).toBe('network')
    expect(undo.error).toBeNull()
    expect(undo.label).toBeNull()
  })

  it('replaces the notice before it instead of stacking', () => {
    const undo = useUndoStore()
    undo.notifyError('network')

    undo.notifyError('server')

    expect(undo.notice).toBe('server')
  })

  it('takes the place of a pending undo offer, which can no longer be run', async () => {
    const undo = useUndoStore()
    const action = vi.fn(done)
    undo.offer({ label: 'created', undo: action })

    undo.notifyError('server')
    await undo.run()

    expect(undo.label).toBeNull()
    expect(action).not.toHaveBeenCalled()
  })

  it('takes the place of the message of a failed undo', async () => {
    const undo = useUndoStore()
    undo.offer({ label: 'created', undo: () => Promise.reject(new ApiError('not_found', 404)) })
    await undo.run()

    undo.notifyError('network')

    expect(undo.error).toBeNull()
    expect(undo.notice).toBe('network')
  })

  it('makes way for the next undo offer', () => {
    const undo = useUndoStore()
    undo.notifyError('network')

    undo.offer({ label: 'statusChanged', undo: done })

    expect(undo.notice).toBeNull()
    expect(undo.label).toBe('statusChanged')
  })

  it('goes away after the same window as an offer, with a full window for a newer notice', () => {
    const undo = useUndoStore()
    undo.notifyError('network')
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1)
    expect(undo.notice).toBe('network')

    undo.notifyError('server')
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1)
    expect(undo.notice).toBe('server')

    vi.advanceTimersByTime(1)
    expect(undo.notice).toBeNull()
  })

  it('waits while paused and goes away once the rest of its window has passed', () => {
    const undo = useUndoStore()
    undo.notifyError('network')
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1)

    undo.pause()
    vi.advanceTimersByTime(UNDO_WINDOW_MS)
    expect(undo.notice).toBe('network')

    undo.resume()
    vi.advanceTimersByTime(1)
    expect(undo.notice).toBeNull()
  })

  it('goes away when it is dismissed', () => {
    const undo = useUndoStore()
    undo.notifyError('network')

    undo.dismiss()

    expect(undo.notice).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})
