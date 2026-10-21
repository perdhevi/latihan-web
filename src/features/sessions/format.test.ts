import { describe, expect, it } from 'vitest'
import { formatDelta, formatNumber, formatSet } from './format'

describe('formatting a comparison', () => {
  it('shows a missing value as "—", and a real 0 as 0', () => {
    expect(formatDelta(null)).toBe('—')
    expect(formatDelta(undefined, 'kg')).toBe('—')
    expect(formatDelta(0, 'kg')).toBe('0 kg')
    expect(formatNumber(null)).toBe('—')
    expect(formatNumber(0)).toBe('0')
    expect(formatSet(null)).toBe('—')
  })

  it('signs differences with + and a true minus', () => {
    expect(formatDelta(1)).toBe('+1')
    expect(formatDelta(-2.5, 'kg')).toBe('−2.5 kg')
    expect(formatSet({ repetitions: 6, weight_kg: 62.5 })).toBe('6 × 62.5 kg')
  })
})
