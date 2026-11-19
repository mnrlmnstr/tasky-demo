import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { ApiError, type ApiErrorKind } from '../api/http'

export const UNDO_WINDOW_MS = 6000

/** What was done, as the last part of an `undo.labels.*` message key: the toast translates it when it is shown. */
export type UndoLabel = 'created' | 'updated' | 'statusChanged'

export interface UndoOffer {
  label: UndoLabel
  /** Reverses the action. A rejection is reported in the toast by its `ApiError` kind. */
  undo: () => Promise<unknown>
}

/**
 * At most one action can be undone at a time: a new offer replaces the pending one. The offer, or the
 * message of an undo that failed, is withdrawn after `UNDO_WINDOW_MS`, not counting the time spent paused.
 */
export const useUndoStore = defineStore('undo', () => {
  const pending = shallowRef<UndoOffer | null>(null)
  const running = ref(false)
  const error = ref<ApiErrorKind | null>(null)

  const label = computed(() => pending.value?.label ?? null)

  let timer: ReturnType<typeof setTimeout> | undefined
  let startedAt = 0
  let remaining = 0
  let paused = false

  function stopClock(): void {
    clearTimeout(timer)
    timer = undefined
  }

  function startClock(): void {
    const nothingShown = pending.value === null && error.value === null
    if (paused || running.value || nothingShown) return
    startedAt = Date.now()
    timer = setTimeout(clear, remaining)
  }

  function clear(): void {
    stopClock()
    pending.value = null
    error.value = null
    running.value = false
  }

  function show(offer: UndoOffer | null, failure: ApiErrorKind | null): void {
    clear()
    pending.value = offer
    error.value = failure
    remaining = UNDO_WINDOW_MS
    startClock()
  }

  function offer(next: UndoOffer): void {
    // A copy, so offering the same object twice still counts as a new offer.
    show({ ...next }, null)
  }

  function dismiss(): void {
    // The outcome of an undo in flight still has to be shown.
    if (!running.value) clear()
  }

  function pause(): void {
    if (paused) return
    paused = true
    if (timer === undefined) return
    remaining -= Date.now() - startedAt
    stopClock()
  }

  function resume(): void {
    if (!paused) return
    paused = false
    startClock()
  }

  async function run(): Promise<void> {
    const current = pending.value
    if (current === null || running.value) return
    running.value = true
    stopClock()
    let failure: ApiErrorKind | null = null
    try {
      await current.undo()
    } catch (reason) {
      failure = reason instanceof ApiError ? reason.kind : 'server'
    }
    // Replaced by a newer offer in the meantime: the toast is no longer about this action.
    if (pending.value !== current) return
    if (failure === null) clear()
    else show(null, failure)
  }

  return { label, running, error, offer, run, dismiss, pause, resume }
})
