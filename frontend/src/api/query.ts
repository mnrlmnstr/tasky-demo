type QueryValue = string | number | boolean | null | undefined

/**
 * The query string of a request, without the leading `?`.
 * A query string has no null, so a parameter without a value is left out rather than sent as text.
 */
export function toQueryString(params: Record<string, QueryValue> = {}): string {
  const query = new URLSearchParams()
  for (const [name, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) {
      query.append(name, String(value))
    }
  }
  return query.toString()
}
