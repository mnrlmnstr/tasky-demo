import { listTasks, type ListTasksParams, type PageTaskRead } from './generated/client'

/** The most the API gives per page. */
export const MAX_PAGE_SIZE = 100

/**
 * Every task matching the query, as one page: the first page of 100 tells how many there are, the
 * others are then asked for at once and put after it in page order. The signal cancels all of them;
 * when one page fails, the others are cancelled and the whole load fails with that page's error.
 */
export async function listAllTasks(
  signal: AbortSignal,
  query: Omit<ListTasksParams, 'page' | 'page_size'>,
): Promise<PageTaskRead> {
  const ask = (page: number, pageSignal: AbortSignal) =>
    listTasks({ ...query, page, page_size: MAX_PAGE_SIZE }, { signal: pageSignal })
  const first = await ask(1, signal)
  const one = { ...first, pages: 1 }
  if (first.pages <= 1) return one

  const rest = new AbortController()
  const cancelRest = () => rest.abort()
  signal.addEventListener('abort', cancelRest)
  try {
    const others = await Promise.all(
      Array.from({ length: first.pages - 1 }, (_, index) => ask(index + 2, rest.signal)),
    )
    return { ...one, items: [...first.items, ...others.flatMap((page) => page.items)] }
  } catch (failure) {
    rest.abort()
    throw failure
  } finally {
    signal.removeEventListener('abort', cancelRest)
  }
}
