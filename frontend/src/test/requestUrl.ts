/** The address a faked `fetch` was called with, resolved against a base so the app's relative paths parse. */
export function requestUrl(input: RequestInfo | URL): URL {
  return new URL(input instanceof Request ? input.url : input, 'http://localhost')
}
