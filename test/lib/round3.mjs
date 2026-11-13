// Shared helpers for the round-3 regression tests (review-fixes-3*.test.mjs). Synthetic data only.
import { newPlugin } from './load-plugin.mjs';
import { FakeThymer, FakeDateTime } from './fake-thymer.mjs';

export const fast = { sleep: async () => {} };

export function engine({ stale = true } = {}) {
    const thymer = new FakeThymer();
    thymer.staleReads = stale;
    const p = newPlugin({ DateTime: FakeDateTime });
    p.data = thymer.data;
    p.isDarkMode = () => false;
    p.getThemeColors = () => new Proxy({}, { get: () => '#000' });
    return { thymer, p };
}

/** A webkitdirectory-style file list from { 'vault/note.md': text }. */
export function memoryFiles(entries) {
    const files = Object.entries(entries).map(([rel, text]) => {
        const file = new File([text], rel.split('/').pop());
        Object.defineProperty(file, 'webkitRelativePath', { value: rel });
        return file;
    });
    return { kind: 'filelist', files };
}
export const note = (frontmatter, title) => `---\n${frontmatter}\n---\n# ${title}\n\nText.\n`;
export const inMemory = (entries) => ({ files: new Map(), texts: new Map(Object.entries(entries)) });

export const DB_ID = '35033016139844f5dc950ed83f95f548';   // made-up Notion ids
export const STEM = `e_ExportBlock-1/Gear ${DB_ID}`;
export const notionPlan = (p, text) => p._notionBuildPlan(inMemory({ [`${STEM}.csv`]: text }));

export const fieldsOf = (thymer, name) => thymer.collection(name).config.fields;
export const fieldIds = (thymer, name) => fieldsOf(thymer, name).map(f => f.id);
export const labelOf = (thymer, name, id) => fieldsOf(thymer, name).find(f => f.id === id).label;
export const typeOf = (thymer, name, id) => fieldsOf(thymer, name).find(f => f.id === id).type;

/** Imports csv text into the fake in one go (settled), then returns the report of the next run when called again. */
export async function runNotion(ctx, text) {
    const plan = notionPlan(ctx.p, text);
    const report = await ctx.p.applyImportPlan(plan, fast);
    ctx.thymer.settle();
    return { plan, report };
}
export async function runTolaria(ctx, files) {
    const plan = await ctx.p.parseTolariaVault(memoryFiles(files));
    const report = await ctx.p.applyImportPlan(plan, fast);
    ctx.thymer.settle();
    return { plan, report };
}


/** Just enough DOM for renderTolariaReport / performTolariaImport / performNotionImport. */
export function fakeDom() {
    const make = (tag = 'div') => {
        const node = { tag, style: {}, children: [], parent: null, disabled: false, _text: '', _html: '', id: '' };
        node.appendChild = (c) => { c.parent = node; node.children.push(c); return c; };
        node.insertAdjacentElement = (where, c) => { const siblings = node.parent.children; c.parent = node.parent; siblings.splice(siblings.indexOf(node) + 1, 0, c); return c; };
        Object.defineProperty(node, 'textContent', { get: () => node._text, set: (v) => { node._text = String(v); node.children = []; } });
        Object.defineProperty(node, 'innerHTML', { get: () => node._html, set: (v) => { node._html = String(v); node.children = []; } });
        node.querySelector = (sel) => find(node, sel.replace(/^#/, ''));
        return node;
    };
    const find = (root, id) => { for (const c of root.children) { if (c.id === id) return c; const hit = find(c, id); if (hit) return hit; } return null; };
    const dialog = make();
    const status = dialog.appendChild(Object.assign(make(), { id: 'md-status' }));
    const importBtn = dialog.appendChild(Object.assign(make('button'), { id: 'md-import-btn' }));
    const cancelBtn = dialog.appendChild(Object.assign(make('button'), { id: 'md-cancel-btn' }));
    const text = (n) => [n._text, n._html, ...n.children.flatMap(text)].filter(Boolean);
    return { dialog, status, importBtn, cancelBtn, find: (id) => find(dialog, id), document: { createElement: make, body: make('body') }, all: () => text(dialog).join('\n'), statusText: () => text(status).join('\n') };
}

