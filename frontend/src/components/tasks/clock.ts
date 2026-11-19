import { inject, type InjectionKey } from 'vue'

/** Where components get the current time and the zone to show dates in, so tests can pin both. */
export interface Clock {
  now(): Date
  /** IANA zone to show dates in; the user's own zone when left out. */
  timeZone?: string
}

export const CLOCK: InjectionKey<Clock> = Symbol('clock')

const SYSTEM_CLOCK: Clock = { now: () => new Date() }

/** The clock provided above this component, or the system clock when nothing was provided. */
export function useClock(): Clock {
  return inject(CLOCK, SYSTEM_CLOCK)
}
