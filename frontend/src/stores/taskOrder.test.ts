import { describe, expect, it } from 'vitest'

import { task } from '../test/tasksApi'
import { indexAfterMove, inCustomOrder, placeAt, positionBetween } from './taskOrder'

describe('the position between two neighbours', () => {
  it('is their midpoint', () => {
    expect(positionBetween(task('A', { position: 1 }), task('B', { position: 2 }))).toBe(1.5)
    expect(positionBetween(task('A', { position: -3 }), task('B', { position: 5 }))).toBe(1)
  })

  it('is one above the first at the top, and one below the last at the bottom', () => {
    expect(positionBetween(undefined, task('B', { position: 4 }))).toBe(3)
    expect(positionBetween(task('A', { position: 4 }), undefined)).toBe(5)
  })

  it('is 0 with no neighbour at all', () => {
    expect(positionBetween(undefined, undefined)).toBe(0)
  })
})

describe('the custom order', () => {
  it('sorts by position, ties newest first, then by id, without changing the list it was given', () => {
    const given = [
      task('Last', { position: 9 }),
      task('Older', { position: 1, created_at: '2026-01-01T09:00:00Z' }),
      task('B', { id: 'b', position: 1, created_at: '2026-01-02T09:00:00Z' }),
      task('A', { id: 'a', position: 1, created_at: '2026-01-02T09:00:00Z' }),
      task('First', { position: -2 }),
    ]

    expect(inCustomOrder(given).map((item) => item.title)).toEqual(['First', 'A', 'B', 'Older', 'Last'])
    expect(given[0].title).toBe('Last')
  })
})

describe('placing a task at an index of a list', () => {
  const list = [task('A', { position: 0 }), task('B', { position: 1 }), task('C', { position: 2 })]

  it('takes the midpoint of the neighbours it gets, counted without the task itself', () => {
    expect(placeAt(list, list[2], 1)).toBe(0.5)
    expect(placeAt(list, list[0], 2)).toBe(3)
    expect(placeAt(list, list[2], 0)).toBe(-1)
  })

  it('is nothing to do when the task would land where it already is', () => {
    expect(placeAt(list, list[1], 1)).toBeNull()
  })

  it('places a task coming from elsewhere among all of them', () => {
    expect(placeAt(list, task('New', { position: 7 }), 3)).toBe(3)
    expect(placeAt([], task('New', { position: 7 }), 0)).toBe(0)
  })
})

describe('moving a task by one place', () => {
  const list = [task('A'), task('B'), task('C')]

  it('gives the index it lands on', () => {
    expect(indexAfterMove(list, list[1], -1)).toBe(0)
    expect(indexAfterMove(list, list[1], 1)).toBe(2)
  })

  it('goes nowhere past either end, or for a task not in the list', () => {
    expect(indexAfterMove(list, list[0], -1)).toBeNull()
    expect(indexAfterMove(list, list[2], 1)).toBeNull()
    expect(indexAfterMove(list, task('Other'), 1)).toBeNull()
  })
})
