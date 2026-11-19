/** The value when it is one of the allowed ones, the fallback otherwise. */
export function oneOf<T>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback
}

/**
 * What was saved under the key, or null. Storage can be absent, blocked or hold anything another script
 * or an older version wrote; all of that reads as "nothing saved", and the caller still checks each field.
 */
export function readStored(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

/** Saves the value as JSON. Private browsing, a full quota or a blocked storage must not break the app: the value then lasts for the visit only. */
export function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    return
  }
}
