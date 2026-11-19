/** A count written for the language, e.g. "1,234" / «1 234». Plural forms are still chosen by the number itself. */
export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value)
}
