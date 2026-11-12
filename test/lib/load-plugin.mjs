// Loads plugin.js outside Thymer so its parsing logic can be unit-tested.
// plugin.js is a classic script that declares `class Plugin extends AppPlugin`,
// so we evaluate it with a stub AppPlugin in scope and hand back the class.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export class AppPluginStub {
    constructor() {
        this.calls = [];
        const record = (name) => (...args) => { this.calls.push({ name, args }); return undefined; };
        this.ui = new Proxy({}, { get: (_, k) => record(`ui.${String(k)}`) });
        this.data = new Proxy({}, { get: (_, k) => record(`data.${String(k)}`) });
        this.getConfiguration = () => ({ custom: {} });
    }
}

// `globals` are extra free identifiers plugin.js expects from Thymer (e.g. DateTime).
export function loadPlugin(globals = {}) {
    const src = readFileSync(path.join(root, 'plugin.js'), 'utf8');
    const names = Object.keys(globals);
    const factory = new Function('AppPlugin', ...names, `${src}\n;return { Plugin, VERSION, LinkIndex };`);
    return factory(AppPluginStub, ...names.map(n => globals[n]));
}

export function newPlugin(globals = {}) {
    const { Plugin } = loadPlugin(globals);
    return new Plugin();
}
