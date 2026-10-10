import { describe, expect, it } from 'vitest'
import {
  errorMessage,
  isGlgLine,
  isPlainKey,
  isTypingTarget,
  lastRawLines,
  wipeArmed,
  wipeCounts,
} from './overlayModel'

describe('isGlgLine', () => {
  it('matches the GLG status reply, including the idle form', () => {
    expect(isGlgLine('GLG,12301,FM,0,0,ACSO,Dispatch,Dispatch 1,1,0,001,001,293')).toBe(true)
    expect(isGlgLine('GLG,,,,,,,,,,')).toBe(true)
  })

  it('does not match other lines or words that start with GLG', () => {
    expect(isGlgLine('GLGX,1')).toBe(false)
    expect(isGlgLine('TG-1F4 CH-0A1 VC-0B2 CNM')).toBe(false)
    expect(isGlgLine('<b>GLG,1</b>')).toBe(false)
    expect(isGlgLine('')).toBe(false)
  })
})

describe('lastRawLines', () => {
  it('keeps the newest 200 lines in arrival order', () => {
    const lines = Array.from({ length: 250 }, (_, i) => i)
    const kept = lastRawLines(lines)
    expect(kept).toHaveLength(200)
    expect(kept[0]).toBe(50)
    expect(kept[199]).toBe(249)
  })

  it('returns short logs whole', () => {
    expect(lastRawLines(['a', 'b'])).toEqual(['a', 'b'])
  })
})

describe('isPlainKey', () => {
  it('rejects chords and accepts shift', () => {
    expect(isPlainKey({ ctrlKey: false, metaKey: false, altKey: false })).toBe(true)
    expect(isPlainKey({ ctrlKey: true, metaKey: false, altKey: false })).toBe(false)
    expect(isPlainKey({ ctrlKey: false, metaKey: true, altKey: false })).toBe(false)
    expect(isPlainKey({ ctrlKey: false, metaKey: false, altKey: true })).toBe(false)
  })
})

describe('isTypingTarget', () => {
  it('is true for text fields', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true)
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true)
    expect(isTypingTarget(document.createElement('select'))).toBe(true)
  })

  it('is true inside editable content', () => {
    const wrapper = document.createElement('div')
    wrapper.setAttribute('contenteditable', 'true')
    const child = document.createElement('span')
    wrapper.append(child)
    expect(isTypingTarget(child)).toBe(true)
  })

  it('is false for buttons, plain content, and no target', () => {
    expect(isTypingTarget(document.createElement('button'))).toBe(false)
    expect(isTypingTarget(document.createElement('div'))).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})

describe('wipeArmed', () => {
  it('needs the exact word WIPE', () => {
    expect(wipeArmed('WIPE')).toBe(true)
    expect(wipeArmed('wipe')).toBe(false)
    expect(wipeArmed('WIPE ')).toBe(false)
    expect(wipeArmed('WIP')).toBe(false)
    expect(wipeArmed('')).toBe(false)
  })
})

describe('wipeCounts', () => {
  it('counts persistent keys as totals and session rows apart', () => {
    const counts = wipeCounts({
      persistentSlers: { '500': 4, 'U:00A1': 2, 'M:0A0C': 1 },
      persistentPatches: { '3F1': 2 },
      persistentP25: { '312': 5, '401': 1 },
      grants: [{}, {}, {}],
      patches: [{}],
      p25Cards: [{}, {}],
    })
    expect(counts).toEqual({
      totals: { leaderboard: 3, patches: 1, p25: 2 },
      session: { grants: 3, patches: 1, p25Cards: 2 },
    })
  })
})

describe('errorMessage', () => {
  it('uses the message of an Error', () => {
    expect(errorMessage(new Error('Quota exceeded'))).toBe('Quota exceeded')
  })

  it('falls back for anything else', () => {
    expect(errorMessage('boom')).toBe('Unknown error')
    expect(errorMessage(new Error(''))).toBe('Unknown error')
  })
})
