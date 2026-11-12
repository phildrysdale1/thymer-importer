// Regression test for the Markdown import dialog's source switching. Tolaria and Notion
// were added in parallel branches, each with its own `change` handler, and the merge left
// a duplicate `const sourceSelect` and two handlers overriding each other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newPlugin } from './lib/load-plugin.mjs';

/** Fake DOM: every element declared with id="…" in innerHTML becomes queryable by '#id'. */
function fakeDocument() {
    const make = (id = null) => {
        const listeners = {};
        const el = {
            id, style: {}, value: '', checked: false, disabled: false, textContent: '', children: [],
            addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
            fire: (type) => (listeners[type] || []).forEach((fn) => fn({ target: el })),
            appendChild: (c) => { el.children.push(c); return c; },
            removeChild: () => {},
            querySelector: (sel) => byId.get(sel.replace(/^#/, '')) || null,
            querySelectorAll: () => [],
            set innerHTML(html) {
                for (const m of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"[^>]*>/g)) {
                    const child = make(m[2]);
                    const tag = m[0];
                    const display = /display:\s*none/.test(tag) ? 'none' : '';
                    child.style.display = display;
                    if (m[1] === 'select') {
                        const first = html.slice(m.index).match(/<option value="([^"]*)"/);
                        child.value = first ? first[1] : '';
                    }
                    byId.set(m[2], child);
                }
            },
            get innerHTML() { return ''; },
        };
        return el;
    };
    const byId = new Map();
    return { createElement: () => make(), body: make('body'), byId };
}

test('Markdown dialog: Tolaria and Notion hide the collection and journal pickers, others show them', () => {
    const doc = fakeDocument();
    globalThis.document = doc;
    try {
        const p = newPlugin();
        p.getThemeColors = () => new Proxy({}, { get: () => '#000' });
        p.loadCollections = () => {};
        p.showMarkdownImportDialog();

        const source = doc.byId.get('md-source-select');
        const collection = doc.byId.get('md-collection-container');
        const journal = doc.byId.get('md-journal-container');
        const hint = doc.byId.get('md-notion-hint');
        assert.ok(source && collection && journal && hint, 'dialog ids present');

        const pick = (v) => { source.value = v; source.fire('change'); };

        pick('tolaria');
        assert.equal(collection.style.display, 'none');
        assert.equal(journal.style.display, 'none');
        assert.equal(hint.style.display, 'none');

        pick('notion');
        assert.equal(collection.style.display, 'none');
        assert.equal(journal.style.display, 'none');
        assert.equal(hint.style.display, 'block');

        pick('obsidian');
        assert.equal(collection.style.display, 'block');
        assert.equal(journal.style.display, 'block');
        assert.equal(hint.style.display, 'none');
    } finally {
        delete globalThis.document;
    }
});

test('Markdown dialog: Tolaria/Notion use the input folder picker, never showDirectoryPicker', async () => {
    const doc = fakeDocument();
    globalThis.document = doc;
    globalThis.window = { showDirectoryPicker: () => { throw new Error('showDirectoryPicker must not be called'); } };
    try {
        const p = newPlugin();
        p.getThemeColors = () => new Proxy({}, { get: () => '#000' });
        p.loadCollections = () => {};
        let inputPicks = 0;
        p.pickFolderViaInput = async () => { inputPicks++; return { kind: 'filelist', files: [{ name: 'a.md', webkitRelativePath: 'Vault/a.md' }] }; };
        p.showMarkdownImportDialog();

        const source = doc.byId.get('md-source-select');
        const button = doc.byId.get('select-folder-btn');
        const info = doc.byId.get('folder-info');
        for (const v of ['tolaria', 'notion']) {
            source.value = v; source.fire('change');
            info.textContent = '';
            await button.onclick();
            assert.match(info.textContent, /Folder selected \(1 file/);
        }
        assert.equal(inputPicks, 2);
    } finally {
        delete globalThis.document;
        delete globalThis.window;
    }
});
