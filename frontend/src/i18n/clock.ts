import { getLocalTimeZone } from '@internationalized/date'
import { createSharedComposable, useIntervalFn } from '@vueuse/core'
import { hasInjectionContext, inject, ref, type InjectionKey } from 'vue'

/** Where components get the current time and the zone to show dates in, so tests can pin both. */
export interface Clock {
  now(): Date
  /** IANA zone to show dates in; the user's own zone when left out. */
  timeZone?: string
}

export const CLOCK: InjectionKey<Clock> = Symbol('clock')

const SYSTEM_CLOCK: Clock = { now: () => new Date() }

/**
 * The clock provided to the app, read once and without the minute tick: for stores, which have an
 * injection context only when their pinia is installed on an app. The system clock otherwise.
 */
export function injectClock(): Clock {
  return hasInjectionContext() ? inject(CLOCK, SYSTEM_CLOCK) : SYSTEM_CLOCK
}

/** The zone the clock shows dates in: the pinned one, or the user's own. */
export function clockTimeZone(clock: Clock): string {
  return clock.timeZone ?? getLocalTimeZone()
}

const TICK_MS = 60_000

// One timer for every component that shows the time; it stops when the last of them is gone.
const useTick = createSharedComposable(() => {
  const tick = ref(0)
  useIntervalFn(() => {
    tick.value += 1
  }, TICK_MS)
  return tick
})

/**
 * The clock provided above this component, or the system clock when nothing was provided.
 * Whatever is computed from `now()` is computed again about once a minute, so times on screen age.
 */
export function useClock(): Clock {
  const clock = inject(CLOCK, SYSTEM_CLOCK)
  const tick = useTick()
  return {
    now() {
      // Read for its dependency only: the caller's computed runs again on the next tick of the timer.
      void tick.value
      return clock.now()
    },
    timeZone: clock.timeZone,
  }
}
