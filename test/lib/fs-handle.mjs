// Minimal File System Access API stand-in (FileSystemDirectoryHandle / FileSystemFileHandle)
// backed by a real directory, so scanners written against showDirectoryPicker() run in Node.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

class FileLike {
    constructor(abs, relPath) {
        this.name = path.basename(abs);
        this.webkitRelativePath = relPath;
        this._abs = abs;
        this.size = statSync(abs).size;
        this.lastModified = statSync(abs).mtimeMs;
    }
    async text() { return readFileSync(this._abs, 'utf8'); }
    async arrayBuffer() { const b = readFileSync(this._abs); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
}

class FileHandle {
    constructor(abs, rel) { this.kind = 'file'; this.name = path.basename(abs); this._abs = abs; this._rel = rel; }
    async getFile() { return new FileLike(this._abs, this._rel); }
}

export class DirHandle {
    constructor(abs, rel = path.basename(abs)) { this.kind = 'directory'; this.name = path.basename(abs); this._abs = abs; this._rel = rel; }
    async *values() {
        for (const name of readdirSync(this._abs).sort()) {
            const abs = path.join(this._abs, name);
            const rel = `${this._rel}/${name}`;
            yield statSync(abs).isDirectory() ? new DirHandle(abs, rel) : new FileHandle(abs, rel);
        }
    }
    async *entries() { for await (const h of this.values()) yield [h.name, h]; }
    async getDirectoryHandle(name) { return new DirHandle(path.join(this._abs, name), `${this._rel}/${name}`); }
    async getFileHandle(name) { return new FileHandle(path.join(this._abs, name), `${this._rel}/${name}`); }
}

export const dirHandle = (abs) => new DirHandle(path.resolve(abs));
