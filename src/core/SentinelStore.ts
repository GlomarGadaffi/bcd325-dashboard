import { Serial } from './SerialMonitor';
import type { EDACSEvent, PatchEvent, SiteEvent, GrantEvent, P25Event, RawLogEntry, LeaderboardEntry, SessionStats } from '../types';
import { DB } from './AgencyDB';

// Consecutive GLG packets closer than this are one transmission, not a new one
const P25_TX_GAP_MS = 2000;

export interface PatchState {
    members: string[];
    lastSeen: number;
    hits: number;
    isActive: boolean;
}

export interface P25CardState {
    name: string;
    agency: string;
    hits: number;
    lastSeen: number;
    isNew: boolean;
}

export class SentinelStore {
    private version = 0;
    private listeners: Set<() => void> = new Set();
    private grantSeq = 0;
    private rawSeq = 0;

    // State
    public siteId: string = 'AWAITING C-CH';
    public patches: Map<string, PatchState> = new Map();
    public grants: GrantEvent[] = [];
    public p25Cards: Map<string, P25CardState> = new Map();
    public lcnMap: Map<string, string> = new Map(); // LCN Hex -> VC Hex
    
    // Analytics
    public tgHits: Map<string, number[]> = new Map(); // SLERS hits for leaderboard
    public rawLog: RawLogEntry[] = [];
    public clock = Date.now();
    public stats: SessionStats = {
        sessionStart: Date.now(),
        patches: 0,
        grants: 0,
        p25Total: 0
    };
    
    // Persistent Hit Counters
    public persistentSlers: Record<string, number> = {};
    public persistentPatches: Record<string, number> = {};
    public persistentP25: Record<string, number> = {};
    
    // Timers
    private tickInt: number | null = null;
    private saveTimeout: number | null = null;
    
    // Unsubscriptions
    private unsubs: (() => void)[] = [];

    // P25 Holding
    public p25HoldingTG: string | null = null;
    public lcdState: 'SCANNING' | '>>> SKIP' | 'AUDIO HOLD' = 'SCANNING';
    public lcdData = { tgid: '---', name: 'System Standby', agency: '--' };

    constructor() {
        this.loadPersistentData();
        this.start();
    }

    public subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    public getSnapshot = () => {
        return this.version;
    }

    private emitChange() {
        this.version++;
        this.listeners.forEach(l => l());
    }

    private loadPersistentData() {
        try {
            const s = localStorage.getItem('sentinel_slers');
            const p = localStorage.getItem('sentinel_p25');
            const pt = localStorage.getItem('sentinel_patches');
            if (s) this.persistentSlers = JSON.parse(s);
            if (pt) this.persistentPatches = JSON.parse(pt);
            if (p) this.persistentP25 = JSON.parse(p);
            
            // Recalculate p25 total hits from persistence
            this.stats.p25Total = Object.values(this.persistentP25).reduce((a, b) => a + b, 0);
        } catch (e) {
            console.error("Failed to load persistence", e);
        }
    }

    private scheduleSave() {
        if (!this.saveTimeout) {
            this.saveTimeout = window.setTimeout(() => {
                localStorage.setItem('sentinel_slers', JSON.stringify(this.persistentSlers));
                localStorage.setItem('sentinel_patches', JSON.stringify(this.persistentPatches));
                localStorage.setItem('sentinel_p25', JSON.stringify(this.persistentP25));
                this.saveTimeout = null;
            }, 5000);
        }
    }

    private trackSlersHit(id: string) {
        // Ephemeral
        if (!this.tgHits.has(id)) {
            this.tgHits.set(id, []);
        }
        this.tgHits.get(id)!.push(Date.now());
        
        // Persistent
        this.persistentSlers[id] = (this.persistentSlers[id] || 0) + 1;
        this.scheduleSave();
    }

    private trackPatchHit(id: string) {
        this.persistentPatches[id] = (this.persistentPatches[id] || 0) + 1;
        this.scheduleSave();
    }

    private trackP25Hit(id: string): number {
        this.persistentP25[id] = (this.persistentP25[id] || 0) + 1;
        this.stats.p25Total++;
        this.scheduleSave();
        return this.persistentP25[id];
    }

    public start() {
        this.unsubs.push(Serial.onEDACS(this.handleEDACS));
        this.unsubs.push(Serial.onP25(this.handleP25));
        this.unsubs.push(Serial.onRawLine(this.handleRawLine));
        
        this.tickInt = window.setInterval(this.tick, 1000);
    }

    public stop() {
        this.unsubs.forEach(fn => fn());
        this.unsubs = [];
        if (this.tickInt) clearInterval(this.tickInt);
    }

    private handleEDACS = (e: EDACSEvent) => {
        if (e.type === 'SITE') {
            this.siteId = (e as SiteEvent).siteId;
            this.emitChange();
        }
        else if (e.type === 'PATCH') {
            const pe = e as PatchEvent;
            const existing = this.patches.get(pe.patchId);

            this.trackPatchHit(pe.patchId);
            const memDec = pe.memberId;
            this.trackSlersHit("M:" + memDec);

            if (existing) {
                if (!existing.members.includes(pe.memberId)) existing.members.push(pe.memberId);
                existing.hits++;
                existing.lastSeen = e.timestamp;
                existing.isActive = true;
            } else {
                this.patches.set(pe.patchId, {
                    members: [pe.memberId],
                    hits: 1,
                    lastSeen: e.timestamp,
                    isActive: true
                });
                this.stats.patches++;
            }
            this.emitChange();
        }
        else if (e.type === 'GRANT') {
            const ge = e as GrantEvent;
            if (ge.talkgroupId) this.trackSlersHit(ge.talkgroupId);
            else if (ge.unitId) this.trackSlersHit("U:" + ge.unitId);

            // Populate Auto-Discovered LCN Map
            if (ge.logicalChannel && ge.voiceChannel) {
                this.lcnMap.set(ge.logicalChannel, ge.voiceChannel);
            }

            ge.id = ++this.grantSeq;
            this.grants = [ge, ...this.grants.slice(0, 199)];
            this.stats.grants++;
            this.emitChange();
        }
    }

    private handleP25 = (e: P25Event) => {
        if (this.p25HoldingTG && this.p25HoldingTG !== e.tgid) return;
        
        if (this.p25HoldingTG && this.p25HoldingTG === e.tgid) {
            this.lcdState = 'AUDIO HOLD';
            this.lcdData = { tgid: e.tgid, name: DB[e.tgid]?.n || e.channelName, agency: DB[e.tgid]?.a || 'UNK' };
        } else {
            this.lcdState = '>>> SKIP';
            this.lcdData = { tgid: e.tgid, name: DB[e.tgid]?.n || e.channelName, agency: DB[e.tgid]?.a || 'UNK' };
            Serial.queueCmd("KEY,S,P");
        }

        const existing = this.p25Cards.get(e.tgid);
        const newTx = !existing || e.timestamp - existing.lastSeen > P25_TX_GAP_MS;
        const total = newTx ? this.trackP25Hit(e.tgid) : (this.persistentP25[e.tgid] ?? 0);
        if (existing) {
            if (newTx) existing.hits++;
            existing.lastSeen = e.timestamp;
        } else {
            this.p25Cards.set(e.tgid, {
                name: DB[e.tgid]?.n || e.channelName || 'Unknown TG',
                agency: DB[e.tgid]?.a || 'P25',
                hits: 1, // session hits
                lastSeen: e.timestamp,
                isNew: total === 1 && !DB[e.tgid]
            });
        }
        this.emitChange();
    }

    private handleRawLine = (line: string) => {
        const entry = { line, timestamp: Date.now(), id: ++this.rawSeq };
        this.rawLog = [...this.rawLog.slice(-199), entry];
        this.emitChange();
    }

    private tick = () => {
        const now = Date.now();

        // Prune patches (>30s), remove TX flash (>2s)
        for (const [id, p] of this.patches.entries()) {
            if (now - p.lastSeen > 30000) {
                this.patches.delete(id);
            } else if (p.isActive && now - p.lastSeen > 2000) {
                p.isActive = false;
            }
        }

        // Prune P25 Cards (>5m)
        for (const [id, c] of this.p25Cards.entries()) {
            if (now - c.lastSeen > 300000 && this.p25HoldingTG !== id) {
                this.p25Cards.delete(id);
            }
        }

        // Reset LCD state if skipping
        if (this.lcdState === '>>> SKIP' && !this.p25HoldingTG) {
            this.lcdState = 'SCANNING';
            this.lcdData = { tgid: '---', name: 'System Standby', agency: '--' };
        }

        this.pruneTgHits(now);
        this.clock = now;

        // We emit change on every tick to update relative timestamps automatically across the UI
        this.emitChange();
    }

    private pruneTgHits(now: number) {
        // Timestamps are appended in order, so expired hits form a prefix
        const cutoff = now - 3600000;
        for (const [key, timestamps] of this.tgHits.entries()) {
            const keep = timestamps.findIndex(t => t > cutoff);
            const drop = keep === -1 ? timestamps.length : keep;
            if (drop > 0) timestamps.splice(0, drop);
            if (timestamps.length === 0) this.tgHits.delete(key);
        }
    }

    public toggleP25Hold(tgid: string) {
        if (this.p25HoldingTG === tgid) {
            this.p25HoldingTG = null;
            Serial.queueCmd("KEY,S,P");
            this.lcdState = 'SCANNING';
            this.lcdData = { tgid: '---', name: 'System Standby', agency: '--' };
        } else {
            this.p25HoldingTG = tgid;
            Serial.queueCmd("KEY,H,P");
            const card = this.p25Cards.get(tgid);
            if (card) {
                this.lcdState = 'AUDIO HOLD';
                this.lcdData = { tgid, name: card.name, agency: card.agency };
            }
        }
        this.emitChange();
    }

    public getLeaderboardRows = (): LeaderboardEntry[] => {
        const now = Date.now();
        const rows: LeaderboardEntry[] = [];
        this.pruneTgHits(now);

        for (const [key, timestamps] of this.tgHits.entries()) {
            const h60 = timestamps.length;
            const h5 = timestamps.filter(t => now - t < 300000).length;
            let name: string, agency: string;
            if (key.startsWith('U:')) { name = 'Unit ' + key.slice(2); agency = 'UNIT'; }
            else if (key.startsWith('M:')) { name = 'Member ' + key.slice(2); agency = 'MEM'; }
            else { const info = DB[key] || { a: 'UNK', n: 'Unknown ID' }; name = info.n; agency = info.a; }
            rows.push({ id: key, name, agency, h5, h60 });
        }
        
        return rows.sort((a, b) => b.h5 - a.h5 || b.h60 - a.h60);
    }

    public wipeDB() {
        localStorage.removeItem('sentinel_slers');
        localStorage.removeItem('sentinel_patches');
        localStorage.removeItem('sentinel_p25');
        this.persistentSlers = {};
        this.persistentPatches = {};
        this.persistentP25 = {};
        this.stats.p25Total = 0;
        this.emitChange();
    }

    public exportJSON() {
        const data = {
            stats: this.stats,
            patches: Array.from(this.patches.entries()),
            leaderboard: this.getLeaderboardRows().slice(0, 20),
            grants: this.grants,
            persistentSlers: this.persistentSlers,
            persistentPatches: this.persistentPatches,
            persistentP25: this.persistentP25
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        this.downloadBlob(blob, `bearsentinel_export_${Date.now()}.json`);
    }

    public exportCSV() {
        const rows = ["timestamp,tgid,name,agency,grantType,lcn,vc"];
        for (const g of this.grants) {
            const tgid = g.talkgroupId || g.unitId || 'UNK';
            const info = g.talkgroupId
                ? (DB[g.talkgroupId] || { n: 'Unknown', a: 'UNK' })
                : g.unitId ? { n: `Unit ${g.unitId}`, a: 'UNIT' } : { n: 'Unknown', a: 'UNK' };
            rows.push(`${new Date(g.timestamp).toISOString()},${tgid},"${info.n}",${info.a},${g.grantType},${g.logicalChannel || ''},${g.voiceChannel || ''}`);
        }
        const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
        this.downloadBlob(blob, `bearsentinel_grants_${Date.now()}.csv`);
    }

    private downloadBlob(blob: Blob, filename: string) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
