// Wraps a request so that starting it again aborts the call still in flight.
export function latestOnly<Args extends unknown[], T>(
  request: (signal: AbortSignal, ...args: Args) => Promise<T>,
): (...args: Args) => Promise<T> {
  let inFlight: AbortController | undefined
  return (...args) => {
    inFlight?.abort()
    inFlight = new AbortController()
    return request(inFlight.signal, ...args)
  }
}
