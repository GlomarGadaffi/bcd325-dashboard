import { ScannerDecoder } from './Decoder';
import type { EDACSEvent, P25Event } from '../types';

interface SerialPortLike {
    readable: ReadableStream<BufferSource> | null;
    writable: WritableStream<Uint8Array> | null;
    open(options: { baudRate: number }): Promise<void>;
    close(): Promise<void>;
}

export class SerialMonitor {
    port: SerialPortLike | null = null;
    reader: ReadableStreamDefaultReader<string> | null = null;
    writer: WritableStreamDefaultWriter<string> | null = null;
    connected = false;
    lastConnectError: unknown = null;
    buffer = "";
    isBusy = false;
    cmdQueue: string[] = [];
    pollInt: number | null = null;
    private inFlight: string | null = null;
    private busyTimer: number | null = null;

    private edacsListeners: ((e: EDACSEvent) => void)[] = [];
    private p25Listeners: ((e: P25Event) => void)[] = [];
    private rawListeners: ((line: string) => void)[] = [];
    private statusListeners: ((connected: boolean) => void)[] = [];

    onEDACS(cb: (e: EDACSEvent) => void) { 
        this.edacsListeners.push(cb); 
        return () => { this.edacsListeners = this.edacsListeners.filter(l => l !== cb); };
    }
    
    onP25(cb: (e: P25Event) => void) { 
        this.p25Listeners.push(cb); 
        return () => { this.p25Listeners = this.p25Listeners.filter(l => l !== cb); };
    }

    onRawLine(cb: (line: string) => void) {
        this.rawListeners.push(cb);
        return () => { this.rawListeners = this.rawListeners.filter(l => l !== cb); };
    }
    
    onStatusChange(cb: (status: boolean) => void) { 
        this.statusListeners.push(cb); 
        return () => { this.statusListeners = this.statusListeners.filter(l => l !== cb); };
    }

    async connect() {
        this.cmdQueue = [];
        this.releaseBusy();
        this.lastConnectError = null;
        try {
            this.port = await (navigator as Navigator & { serial: { requestPort(): Promise<SerialPortLike> } }).serial.requestPort();
            await this.port.open({ baudRate: 115200 });
            
            const textEncoder = new TextEncoderStream();
            textEncoder.readable.pipeTo(this.port.writable!);
            this.writer = textEncoder.writable.getWriter();
            
            this.connected = true;
            this.notifyStatus();
            this.readLoop();
            this.startPolling();
        } catch(e) {
            console.error("Connect failed:", e);
            this.lastConnectError = e;
            this.disconnect();
        }
    }

    async disconnect() {
        this.connected = false;
        this.stopPolling();
        this.cmdQueue = [];
        this.releaseBusy();
        this.notifyStatus();

        try {
            if (this.reader) await this.reader.cancel();
            if (this.writer) { this.writer.releaseLock(); this.writer = null; }
            if (this.port) { await this.port.close(); this.port = null; }
        } catch {
            // Port may already be closed or unplugged; state is reset regardless
        }
    }

    private notifyStatus() {
        this.statusListeners.forEach(cb => cb(this.connected));
    }

    async readLoop() {
        const textDecoder = new TextDecoderStream();
        this.port!.readable!.pipeTo(textDecoder.writable);
        this.reader = textDecoder.readable.getReader();

        try {
            while (true) {
                const { value, done } = await this.reader.read();
                if (done) break;
                if (value) this.ingest(value);
            }
        } catch(e) { 
            console.error("Read error:", e); 
        } finally {
            this.disconnect();
        }
    }

    ingest(chunk: string) {
        this.buffer += chunk;
        const lines = this.buffer.split(/[\r\n]+/);
        this.buffer = lines.pop() || "";

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            this.rawListeners.forEach(cb => cb(trimmed));
            this.route(trimmed);
        }
    }

    route(line: string) {
        if (line.startsWith("GLG")) {
            const p25Event = ScannerDecoder.parseP25(line);
            if (p25Event) {
                this.p25Listeners.forEach(cb => cb(p25Event));
            }
        } else if (ScannerDecoder.isEDACSLine(line)) {
            const edacsEvent = ScannerDecoder.parseEDACS(line);
            if (edacsEvent) {
                this.edacsListeners.forEach(cb => cb(edacsEvent));
            }
        }
        if (this.isBusy && this.isReplyTo(line)) {
            this.releaseBusy();
        }
    }

    private isReplyTo(line: string): boolean {
        if (/^(ERR|NG|FER|ORER)/.test(line)) return true;
        if (this.inFlight === "GLG") return line.startsWith("GLG");
        if (this.inFlight?.startsWith("KEY,")) return line.startsWith("KEY,") || line === "OK";
        return false;
    }

    queueCmd(cmd: string) {
        if (!this.connected) return;
        if (cmd === "GLG" && this.cmdQueue[this.cmdQueue.length - 1] === "GLG") return;
        this.cmdQueue.push(cmd);
        this.processQueue();
    }

    async processQueue() {
        if (this.isBusy || this.cmdQueue.length === 0 || !this.writer) return;
        this.isBusy = true;
        const cmd = this.cmdQueue.shift();
        if (cmd) {
            this.inFlight = cmd;
            this.busyTimer = window.setTimeout(() => this.releaseBusy(), 1000);
            try {
                await this.writer.write(cmd + "\r");
            } catch {
                this.releaseBusy();
            }
        }
    }

    private releaseBusy() {
        if (this.busyTimer !== null) window.clearTimeout(this.busyTimer);
        this.busyTimer = null;
        this.isBusy = false;
        this.inFlight = null;
        this.processQueue();
    }

    startPolling() {
        this.pollInt = window.setInterval(() => this.queueCmd("GLG"), 150);
    }

    stopPolling() {
        if (this.pollInt) clearInterval(this.pollInt);
    }
}

export const Serial = new SerialMonitor();
