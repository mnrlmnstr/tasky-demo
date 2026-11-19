import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../api/http'
import { UNDO_WINDOW_MS, useUndoStore } from './undo'

function deferred() {
  let resolve!: () => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

const done = () => Promise.resolve()

beforeEach(() => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.useRealTimers()
})

describe('offering an undo', () => {
  it('has nothing to undo until an action offers it', () => {
    const undo = useUndoStore()

    expect(undo.label).toBeNull()
    expect(undo.error).toBeNull()
    expect(undo.running).toBe(false)
  })

  it('holds the offered action under its label', () => {
    const undo = useUndoStore()

    undo.offer({ label: 'created', undo: done })

    expect(undo.label).toBe('created')
  })

  it('replaces the pending action with a newer one instead of stacking them', async () => {
    const undo = useUndoStore()
    const first = vi.fn(done)
    const second = vi.fn(done)
    undo.offer({ label: 'created', undo: first })

    undo.offer({ label: 'updated', undo: second })
    expect(undo.label).toBe('updated')
    await undo.run()

    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
    expect(undo.label).toBeNull()
  })

  it('forgets the action when it is dismissed', async () => {
    const undo = useUndoStore()
    const action = vi.fn(done)
    undo.offer({ label: 'created', undo: action })

    undo.dismiss()
    await undo.run()

    expect(undo.label).toBeNull()
    expect(action).not.toHaveBeenCalled()
  })
})

describe('the undo window', () => {
  it('keeps the offer for six seconds', () => {
    expect(UNDO_WINDOW_MS).toBe(6000)
  })

  it('withdraws the offer once the window has passed', () => {
    const undo = useUndoStore()
    undo.offer({ label: 'created', undo: done })

    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1)
    expect(undo.label).toBe('created')

    vi.advanceTimersByTime(1)
    expect(undo.label).toBeNull()
  })

  it('gives a newer offer a full window of its own', () => {
    const undo = useUndoStore()
    undo.offer({ label: 'created', undo: done })
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1000)

    undo.offer({ label: 'updated', undo: done })
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1)

    expect(undo.label).toBe('updated')
  })

  it('stops the clock while paused and gives back only the time that was left', () => {
    const undo = useUndoStore()
    undo.offer({ label: 'created', undo: done })
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1000)

    undo.pause()
    vi.advanceTimersByTime(UNDO_WINDOW_MS * 5)
    expect(undo.label).toBe('created')

    undo.resume()
    vi.advanceTimersByTime(999)
    expect(undo.label).toBe('created')
    vi.advanceTimersByTime(1)
    expect(undo.label).toBeNull()
  })

  it('counts a repeated pause or resume once', () => {
    const undo = useUndoStore()
    undo.offer({ label: 'created', undo: done })
    vi.advanceTimersByTime(1000)

    undo.pause()
    vi.advanceTimersByTime(1000)
    undo.pause()
    undo.resume()
    undo.resume()
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1001)
    expect(undo.label).toBe('created')

    vi.advanceTimersByTime(1)
    expect(undo.label).toBeNull()
  })

  it('does not start the clock of an offer made while paused until it is resumed', () => {
    const undo = useUndoStore()
    undo.pause()
    undo.offer({ label: 'created', undo: done })

    vi.advanceTimersByTime(UNDO_WINDOW_MS * 2)
    expect(undo.label).toBe('created')

    undo.resume()
    vi.advanceTimersByTime(UNDO_WINDOW_MS)
    expect(undo.label).toBeNull()
  })

  it('has nothing to resume when no offer is pending', () => {
    const undo = useUndoStore()
    undo.pause()

    undo.resume()
    vi.advanceTimersByTime(UNDO_WINDOW_MS)

    expect(undo.label).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('undoing', () => {
  it('runs the action once and withdraws the offer', async () => {
    const undo = useUndoStore()
    const action = vi.fn(done)
    undo.offer({ label: 'created', undo: action })

    await undo.run()

    expect(action).toHaveBeenCalledTimes(1)
    expect(undo.label).toBeNull()
    expect(undo.error).toBeNull()
    expect(undo.running).toBe(false)
  })

  it('shows progress while the action runs and ignores a second click', async () => {
    const undo = useUndoStore()
    const pending = deferred()
    const action = vi.fn(() => pending.promise)
    undo.offer({ label: 'created', undo: action })

    const first = undo.run()
    const second = undo.run()
    expect(undo.running).toBe(true)
    expect(undo.label).toBe('created')

    pending.resolve()
    await Promise.all([first, second])

    expect(action).toHaveBeenCalledTimes(1)
    expect(undo.running).toBe(false)
  })

  it('does not let the window run out or a dismissal drop the offer while the action is in flight', async () => {
    const undo = useUndoStore()
    const pending = deferred()
    undo.offer({ label: 'created', undo: () => pending.promise })

    const running = undo.run()
    vi.advanceTimersByTime(UNDO_WINDOW_MS * 2)
    undo.pause()
    undo.resume()
    vi.advanceTimersByTime(UNDO_WINDOW_MS * 2)
    undo.dismiss()

    expect(undo.label).toBe('created')
    expect(undo.running).toBe(true)

    pending.resolve()
    await running
    expect(undo.label).toBeNull()
  })

  it('leaves a newer offer alone when the action it replaced finishes', async () => {
    const undo = useUndoStore()
    const pending = deferred()
    undo.offer({ label: 'created', undo: () => pending.promise })
    const running = undo.run()

    undo.offer({ label: 'updated', undo: done })
    expect(undo.running).toBe(false)
    pending.reject(new ApiError('server', 500))
    await running

    expect(undo.label).toBe('updated')
    expect(undo.error).toBeNull()
  })
})

describe('a failed undo', () => {
  it('reports why it failed and does not offer the undo again', async () => {
    const undo = useUndoStore()
    const action = vi.fn(() => Promise.reject(new ApiError('not_found', 404)))
    undo.offer({ label: 'created', undo: action })

    await undo.run()
    expect(undo.error).toBe('not_found')
    expect(undo.label).toBeNull()
    expect(undo.running).toBe(false)

    await undo.run()
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('counts a failure that is not an API error as a server one', async () => {
    const undo = useUndoStore()
    undo.offer({ label: 'created', undo: () => Promise.reject(new Error('boom')) })

    await undo.run()

    expect(undo.error).toBe('server')
  })

  it('takes the message down after the same window, pausing like an offer does', async () => {
    const undo = useUndoStore()
    undo.offer({ label: 'created', undo: () => Promise.reject(new ApiError('network')) })
    await undo.run()

    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1)
    undo.pause()
    vi.advanceTimersByTime(UNDO_WINDOW_MS)
    expect(undo.error).toBe('network')

    undo.resume()
    vi.advanceTimersByTime(1)
    expect(undo.error).toBeNull()
  })

  it('takes the message down when it is dismissed', async () => {
    const undo = useUndoStore()
    undo.offer({ label: 'created', undo: () => Promise.reject(new ApiError('network')) })
    await undo.run()

    undo.dismiss()

    expect(undo.error).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('makes way for the next offer', async () => {
    const undo = useUndoStore()
    undo.offer({ label: 'created', undo: () => Promise.reject(new ApiError('network')) })
    await undo.run()

    undo.offer({ label: 'updated', undo: done })

    expect(undo.error).toBeNull()
    expect(undo.label).toBe('updated')
  })
})
