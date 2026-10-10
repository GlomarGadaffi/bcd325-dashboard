import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Fixture provenance.
// DOC lines follow the reply formats documented in protocol.txt: the GLG status
// reply (<COMMAND GLG>, including the idle form "GLG,,,,,,,,,,"), the OK and KEY,OK
// acknowledgements, and the ERR, NG, FER and ORER error replies. The field values
// are invented; the layout is the documented one.
// SYN lines are synthetic. protocol.txt documents none of the hyphenated EDACS line
// tokens (SIT-, PAT-, MEM-, TG-, U-, CH-, VC-, LCN-) or the CNM, CIP, CIV and CPT
// grant markers, so their shape comes from the regexes in src/core/Decoder.ts.
const FIXTURE: readonly string[] = [
  'GLG,,,,,,,,,,', // DOC idle reply
  'OK', // DOC key acknowledgement
  'KEY,OK', // DOC key acknowledgement
  'ERR', // DOC error reply
  'NG', // DOC error reply
  'FER', // DOC framing error
  'ORER', // DOC overrun error
  'SIT-01F4', // SYN site, siteId 01F4
  'PAT-3F1 MEM-0A0C', // SYN patch 3F1, member 2572
  'PAT-3F2 MEM-0B0D', // SYN patch 3F2, member 2829
  'PAT-3F1 MEM-0A0D', // SYN patch 3F1 again, new member 2573
  'TG-1F4 CH-0A1 VC-0B2 CNM', // SYN TG grant, talkgroup 500
  'TG-1F5 LCN-0A2 VC-0B3 CNM', // SYN TG grant, talkgroup 501, LCN form
  'TG-1F4 CH-0A1 VC-0B2 CNM', // SYN TG grant, talkgroup 500 again
  'TG-1F6 CH-0A1 VC-0B2 CPT', // SYN CPT grant, talkgroup 502
  'U-00A1B2 CH-0A3 VC-0B4 CIP', // SYN unit call
  'U-00C3D4 CH-0A4 VC-0B5 CIV', // SYN unit call
  'LCN-0A5 VC-0B6', // SYN channel-only line, not a grant
  'GLG,12301,FM,0,0,ACSO,Dispatch,Dispatch 1,1,0,001,001,293', // DOC P25 call, TGID in documented field 1, known to DB
  'GLG,12301,FM,0,0,ACSO,Dispatch,Dispatch 1,1,0,001,001,293', // DOC same transmission, within 2 s
  'GLG,48213,FM,0,0,STATE,FIELD,TAC 3,1,0,002,004,293', // DOC P25 call, TGID not in DB
  'GLG,2057,FM,0,0,GPD,Dispatch,Dispatch A,0,0,001,002,293', // DOC P25 call, squelch closed
  'GLG,,,,,,,,,,', // DOC idle reply
]

const FIXTURE_CHUNK = FIXTURE.join('\r\n') + '\r\n'
const P25_CALL = 'GLG,12301,FM,0,0,ACSO,Dispatch,Dispatch 1,1,0,001,001,293\r\n'

// SYN: talkgroup grants used to push past the 200-grant cap.
function manyGrants(count: number): string {
  const lines = Array.from({ length: count }, (_, i) =>
    `TG-${(0x300 + i).toString(16).toUpperCase()} CH-0B1 VC-0C2 CNM`,
  )
  return lines.join('\r\n') + '\r\n'
}

// Each test gets fresh store and Serial singletons: the modules are re-evaluated
// after the fake clock is installed, so the store's setInterval is faked too.
async function loadFresh() {
  vi.resetModules()
  const adapter = await import('./adapter.svelte.ts')
  const { Serial } = await import('../../core/SerialMonitor')
  return { adapter, Serial, store: adapter.coreStore }
}

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ now: new Date('2026-10-10T12:00:00Z') })
})

afterEach(() => {
  vi.useRealTimers()
  Reflect.deleteProperty(URL, 'createObjectURL')
  Reflect.deleteProperty(URL, 'revokeObjectURL')
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('adapter snapshot', () => {
  it('reflects the fixture after one tick', async () => {
    const { adapter, Serial, store } = await loadFresh()
    Serial.ingest(FIXTURE_CHUNK)
    vi.advanceTimersByTime(1000)
    const snap = adapter.getSnapshot()

    expect(snap.siteId).toBe('01F4')
    expect(snap.rawLog).toHaveLength(FIXTURE.length)
    expect(snap.lastRawAt).toBe(snap.rawLog[snap.rawLog.length - 1].timestamp)
    expect(snap.grants).toHaveLength(store.stats.grants)
    expect(snap.grants[0].id).toBe(store.stats.grants)
    expect(snap.patches.map((p) => p.id)).toEqual(['3F1', '3F2'])
    expect(snap.patches[0].members).toEqual(['2572', '2573'])
    expect(snap.p25Cards.map((c) => c.tgid).sort()).toEqual(['12301', '2057', '48213'])
    expect(snap.leaderboard).toEqual(store.getLeaderboardRows())
    expect(snap.lcnMap).toEqual([
      ['0A1', '0B2'],
      ['0A2', '0B3'],
      ['0A3', '0B4'],
      ['0A4', '0B5'],
    ])
  })

  it('holds the snapshot until the next one-second tick', async () => {
    const { adapter, Serial } = await loadFresh()
    const before = adapter.getSnapshot()

    Serial.ingest(FIXTURE_CHUNK)
    expect(adapter.getSnapshot()).toBe(before)

    vi.advanceTimersByTime(999)
    expect(adapter.getSnapshot()).toBe(before)

    vi.advanceTimersByTime(1)
    expect(adapter.getSnapshot()).not.toBe(before)
  })

  it('changes at most once per second while lines keep arriving', async () => {
    const { adapter, Serial } = await loadFresh()
    const start = Date.now()
    const changeTimes: number[] = []
    let last = adapter.getSnapshot()

    // Six seconds in 100 ms steps, with one P25 line every 300 ms.
    for (let step = 0; step < 60; step++) {
      if (step % 3 === 0) Serial.ingest(P25_CALL)
      vi.advanceTimersByTime(100)
      const current = adapter.getSnapshot()
      if (current !== last) {
        changeTimes.push(Date.now() - start)
        last = current
      }
    }

    expect(changeTimes.length).toBeGreaterThanOrEqual(5)
    expect(changeTimes.length).toBeLessThanOrEqual(6)
    for (let i = 1; i < changeTimes.length; i++) {
      expect(changeTimes[i] - changeTimes[i - 1]).toBeGreaterThanOrEqual(1000)
    }
  })

  it('keeps the newest 200 grants and tracks the store count', async () => {
    const { adapter, Serial, store } = await loadFresh()
    Serial.ingest(FIXTURE_CHUNK)
    Serial.ingest(manyGrants(205))
    vi.advanceTimersByTime(1000)
    const snap = adapter.getSnapshot()

    expect(store.stats.grants).toBe(6 + 205)
    expect(snap.grants).toHaveLength(Math.min(store.stats.grants, 200))
    expect(snap.grants).toHaveLength(200)
    expect(snap.grants[0].id).toBe(store.stats.grants)
    expect(snap.grants[199].id).toBe(store.stats.grants - 199)
  })

  it('matches the store for patch, talkgroup and persistent counts', async () => {
    const { adapter, Serial, store } = await loadFresh()
    Serial.ingest(FIXTURE_CHUNK)
    vi.advanceTimersByTime(1000)
    const snap = adapter.getSnapshot()

    expect(snap.patches).toHaveLength(store.patches.size)
    expect(snap.patches).toHaveLength(2)
    expect(snap.stats.patches).toBe(store.stats.patches)
    expect(snap.stats.patches).toBe(2)
    expect(snap.p25Cards).toHaveLength(store.p25Cards.size)
    expect(snap.p25Cards).toHaveLength(3)
    expect(snap.leaderboard).toHaveLength(Math.min(20, store.tgHits.size))
    expect(snap.leaderboard).toHaveLength(8) // talkgroups 500 to 502, two units, three members
    expect(snap.persistentSlers).toEqual(store.persistentSlers)
    expect(snap.persistentPatches).toEqual(store.persistentPatches)
    expect(snap.persistentP25).toEqual(store.persistentP25)
    expect(snap.persistentP25).not.toBe(store.persistentP25)
    expect(snap.stats.p25Total).toBe(store.stats.p25Total)
  })

  it('reaches the snapshot on the next tick after toggleP25Hold', async () => {
    const { adapter, Serial } = await loadFresh()
    Serial.ingest(FIXTURE_CHUNK)
    vi.advanceTimersByTime(1000)

    adapter.toggleP25Hold('12301')
    expect(adapter.getSnapshot().p25HoldingTG).toBeNull()

    vi.advanceTimersByTime(1000)
    expect(adapter.getSnapshot().p25HoldingTG).toBe('12301')
    expect(adapter.getSnapshot().lcdState).toBe('AUDIO HOLD')
  })

  it('setSnapshot replaces the snapshot', async () => {
    const { adapter } = await loadFresh()
    const injected = { ...adapter.getSnapshot(), siteId: 'TEST01' }
    adapter.setSnapshot(injected)
    expect(adapter.getSnapshot()).toBe(injected)
  })

  it('a pinned snapshot survives the rebuild until resumeLive', async () => {
    const { adapter, store } = await loadFresh()
    const injected = { ...adapter.getSnapshot(), siteId: 'PINNED' }
    adapter.setSnapshot(injected)
    store.siteId = 'LIVE01'
    ;(store as unknown as { emitChange(): void }).emitChange()
    vi.advanceTimersByTime(5000)
    expect(adapter.getSnapshot().siteId).toBe('PINNED')

    adapter.resumeLive()
    vi.advanceTimersByTime(1000)
    expect(adapter.getSnapshot().siteId).toBe('LIVE01')
  })

  it('connected follows Serial status notifications', async () => {
    const { adapter, Serial } = await loadFresh()
    expect(adapter.getSnapshot().connected).toBe(false)

    // notifyStatus is private. Setting connected and calling it is what
    // connect() does on success, without needing navigator.serial.
    Serial.connected = true
    const core = Serial as unknown as { notifyStatus(): void }
    core.notifyStatus()
    vi.advanceTimersByTime(1000)
    expect(adapter.getSnapshot().connected).toBe(true)

    // disconnect() notifies false synchronously before its first await.
    Serial.disconnect()
    vi.advanceTimersByTime(1000)
    expect(adapter.getSnapshot().connected).toBe(false)
  })
})

describe('exportCSV', () => {
  it('writes the header row first and one row per grant', async () => {
    const { adapter, Serial } = await loadFresh()
    Serial.ingest(FIXTURE_CHUNK)
    vi.advanceTimersByTime(1000)

    const blobs: Blob[] = []
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn((blob: Blob) => {
        blobs.push(blob)
        return 'blob:bearsentinel-test'
      }),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    adapter.exportCSV()
    expect(blobs).toHaveLength(1)

    // FileReader schedules its load callback with timers, which the fake clock
    // would hold forever. The CSV is already built, so real timers are safe here.
    vi.useRealTimers()
    const lines = (await readBlobText(blobs[0])).split('\n')
    expect(lines[0]).toBe('timestamp,tgid,name,agency,grantType,lcn,vc')
    expect(lines).toHaveLength(adapter.getSnapshot().grants.length + 1)
  })
})
