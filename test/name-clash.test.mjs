// Name-clash check for the Tolaria and Notion sources: an existing same-named collection is only merged
// into silently when it is a previous import of the same source; otherwise the user picks separate
// (prefixed) collections or a merge. Runs on the in-memory Thymer fake with the synthetic fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPlugin } from './lib/load-plugin.mjs';
import { dirHandle } from './lib/fs-handle.mjs';
import { FakeThymer, FakeDateTime } from './lib/fake-thymer.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const TOLARIA = path.join(here, 'fixtures/tolaria');
const NOTION = path.join(here, 'fixtures/notion');
const fast = { sleep: async () => {} };

function setup() {
    const thymer = new FakeThymer();
    const p = newPlugin({ DateTime: FakeDateTime });
    p.data = thymer.data;
    p.isDarkMode = () => false;
    p.getThemeColors = () => new Proxy({}, { get: () => '#000' });
    const origApply = p.applyImportPlan.bind(p);
    p.applyImportPlan = (plan, opts) => origApply(plan, { ...opts, ...fast });
    return { thymer, p };
}

/** A collection the user made themselves: a name, optionally a Source Path field and some records. */
async function userCollection(thymer, name, { sourcePathField = false, records = [] } = {}) {
    const c = await thymer.data.createCollection();
    const conf = c.getConfiguration();
    conf.name = name;
    conf.fields = sourcePathField ? [{ id: 'source_path', label: 'Source Path', type: 'text', icon: 'ti-link', many: false, read_only: true, active: true }] : [];
    await c.saveConfiguration(conf);
    for (const [title, srcPath] of records) {
        const rec = thymer.records.get(c.createRecord(title));
        if (srcPath) rec.prop('source_path').set(srcPath);
    }
    return c;
}

const names = (thymer) => thymer.collections.map(c => c.getName()).sort();
const sources = {
    tolaria: { dir: TOLARIA, parse: (p) => p.parseTolariaVault(dirHandle(TOLARIA)), prefix: 'Tolaria · ', label: 'Tolaria' },
    notion: { dir: NOTION, parse: (p) => p.parseNotionExport(dirHandle(NOTION)), prefix: 'Notion · ', label: 'Notion' }
};

for (const [sourceName, src] of Object.entries(sources)) {
    test(`${sourceName}: a same-named collection that is not a previous import is a clash`, async () => {
        const { thymer, p } = setup();
        const plan = await src.parse(p);
        const [first, second, third] = plan.collections;

        // no Source Path field at all
        await userCollection(thymer, first.name.toUpperCase());   // names match trimmed and case-folded
        // has the field, but its records come from somewhere else
        await userCollection(thymer, ` ${second.name} `, { sourcePathField: true, records: [['Other', 'other/place.md']] });
        // an empty collection with the field
        if (third) await userCollection(thymer, third.name, { sourcePathField: true });
        // a journal collection is never a target
        thymer.addJournal();

        const clashes = await p.findCollectionClashes(plan);
        assert.deepEqual(clashes.map(c => c.key), plan.collections.slice(0, third ? 3 : 2).map(c => c.key));
        assert.equal(clashes[0].reason, 'no-source-path-field');
        assert.equal(clashes[1].reason, 'no-matching-records');
        if (third) assert.equal(clashes[2].reason, 'no-matching-records');
        assert.equal(clashes[0].existingName, first.name.toUpperCase());
        assert.ok(clashes.every(c => typeof c.guid === 'string'));
    });

    test(`${sourceName}: collections from a previous import are not a clash`, async () => {
        const { thymer, p } = setup();
        const first = await p.applyImportPlan(await src.parse(p));
        assert.deepEqual(first.errors, []);
        assert.deepEqual(await p.findCollectionClashes(await src.parse(p)), []);

        // the resolver lets it through untouched and does not ask
        const plan = await src.parse(p);
        let asked = 0;
        const result = await p._resolveNameClashes({}, plan, { label: src.label, prefix: src.prefix, prompt: async () => { asked++; return null; } });
        assert.equal(result, plan);
        assert.equal(asked, 0);
        assert.equal(thymer.collections.length, plan.collections.length);
    });

    test(`${sourceName}: one source_path match is enough, and it has to be in the same-named collection`, async () => {
        const { thymer, p } = setup();
        const plan = await src.parse(p);
        const target = plan.collections[0];
        const rec = plan.records.find(r => r.collection === target.key);
        const other = plan.records.find(r => r.collection !== target.key);

        // matching path, different case and padding: matches (same normalisation as the dedupe key)
        await userCollection(thymer, target.name, { sourcePathField: true, records: [['Unrelated', 'x.md'], ['Whatever', `  ${rec.sourcePath.toUpperCase()} `]] });
        assert.deepEqual(await p.findCollectionClashes(plan), []);

        // a path that belongs to a record planned for another collection does not count
        const { thymer: t2, p: p2 } = setup();
        const plan2 = await src.parse(p2);
        const target2 = plan2.collections[0];
        const other2 = plan2.records.find(r => r.collection !== target2.key);
        await userCollection(t2, target2.name, { sourcePathField: true, records: [['Whatever', other2.sourcePath]] });
        assert.deepEqual((await p2.findCollectionClashes(plan2)).map(c => c.key), [target2.key]);
        assert.ok(other);
    });

    test(`${sourceName}: "separate" prefixes every planned collection, and the clashing collection is left alone`, async () => {
        const { thymer, p } = setup();
        const plan = await src.parse(p);
        const mine = await userCollection(thymer, plan.collections[0].name, { records: [['Mine', null]] });
        const before = JSON.stringify(mine.getConfiguration());

        const prefixed = p.prefixImportPlan(plan, src.prefix);
        assert.deepEqual(prefixed.collections.map(c => c.name), plan.collections.map(c => `${src.prefix}${c.name}`));
        assert.deepEqual(prefixed.collections.map(c => c.key), plan.collections.map(c => c.key), 'keys are untouched');
        assert.deepEqual(prefixed.records, plan.records);
        assert.equal(plan.collections[0].name.startsWith(src.prefix), false, 'the original plan is not mutated');

        const report = await p.applyImportPlan(prefixed);
        assert.deepEqual(report.errors, []);
        assert.equal(report.counts.collectionsCreated, plan.collections.length);
        assert.equal(report.counts.recordsCreated, plan.records.length);
        assert.deepEqual(names(thymer), [plan.collections[0].name, ...plan.collections.map(c => `${src.prefix}${c.name}`)].sort());
        assert.equal(JSON.stringify(mine.getConfiguration()), before, 'the existing collection keeps its fields');
        assert.deepEqual((await mine.getAllRecords()).map(r => r.getName()), ['Mine']);
    });

    test(`${sourceName}: re-importing with the same prefix updates in place`, async () => {
        const { thymer, p } = setup();
        const mine = await userCollection(thymer, (await src.parse(p)).collections[0].name);
        const asked = [];
        const prompt = async (state) => { asked.push(state.clashes.map(c => c.existingName)); return { mode: 'separate', prefix: src.prefix }; };

        const run = async () => {
            const plan = await p._resolveNameClashes({}, await src.parse(p), { label: src.label, prefix: src.prefix, prompt });
            assert.ok(plan.collections.every(c => c.name.startsWith(src.prefix)));
            return p.applyImportPlan(plan);
        };
        const first = await run();
        const guids = Array.from(thymer.records.keys()).sort();
        const second = await run();

        assert.deepEqual(first.errors, []);
        assert.deepEqual(second.errors, []);
        assert.equal(asked.length, 2, 'the user collection still clashes, so the prompt appears each time');
        assert.equal(second.counts.collectionsCreated, 0);
        assert.equal(second.counts.recordsCreated, 0);
        assert.equal(second.counts.recordsUpdated, first.counts.recordsCreated);
        assert.deepEqual(Array.from(thymer.records.keys()).sort(), guids, 'no duplicate records');
        assert.equal(thymer.collections.length, first.counts.collectionsCreated + 1, 'no duplicate collections');
        assert.deepEqual((await mine.getAllRecords()), [], 'nothing leaked into the user collection');
    });

    test(`${sourceName}: "merge" keeps the current behaviour`, async () => {
        // Same workspace twice: once through the clash check choosing merge, once straight into applyImportPlan.
        const viaCheck = setup();
        const direct = setup();
        for (const { thymer, p } of [viaCheck, direct]) {
            await userCollection(thymer, (await src.parse(p)).collections[0].name, { records: [['Mine', null]] });
        }
        const plan = await src.parse(viaCheck.p);
        const chosen = await viaCheck.p._resolveNameClashes({}, plan, { label: src.label, prefix: src.prefix, prompt: async () => ({ mode: 'merge' }) });
        assert.equal(chosen, plan, 'merge applies the plan as parsed');

        const a = await viaCheck.p.applyImportPlan(chosen);
        const b = await direct.p.applyImportPlan(await src.parse(direct.p));
        assert.deepEqual(a.counts, b.counts);
        assert.deepEqual(names(viaCheck.thymer), names(direct.thymer));
        assert.equal(a.counts.collectionsCreated, plan.collections.length - 1, 'the existing collection is reused, not duplicated');
        const merged = viaCheck.thymer.collection(plan.collections[0].name);
        assert.ok((await merged.getAllRecords()).some(r => r.getName() === 'Mine'), 'existing records stay');
        assert.ok(merged.getConfiguration().fields.some(f => f.id === 'source_path'), 'fields are added to the existing collection');
    });
}

test('no clash: the prompt is not shown and the plan is returned as is', async () => {
    const { thymer, p } = setup();
    await userCollection(thymer, 'Something unrelated');
    const plan = await sources.tolaria.parse(p);
    const result = await p._resolveNameClashes({}, plan, { label: 'Tolaria', prefix: 'Tolaria · ', prompt: async () => { throw new Error('must not ask'); } });
    assert.equal(result, plan);
});

test('backing out writes nothing', async () => {
    const { thymer, p } = setup();
    const plan = await sources.tolaria.parse(p);
    await userCollection(thymer, plan.collections[0].name);
    const result = await p._resolveNameClashes({}, plan, { label: 'Tolaria', prefix: 'Tolaria · ', prompt: async () => null });
    assert.equal(result, null);
    assert.equal(thymer.records.size, 0);
    assert.equal(thymer.collections.length, 1);
});

test('a prefix that clashes with another collection asks again, with the prefixed names', async () => {
    const { thymer, p } = setup();
    const plan = await sources.tolaria.parse(p);
    await userCollection(thymer, plan.collections[0].name);
    await userCollection(thymer, `Tolaria · ${plan.collections[1].name}`);
    const seen = [];
    const replies = [{ mode: 'separate', prefix: 'Tolaria · ' }, { mode: 'separate', prefix: 'Vault · ' }];
    const result = await p._resolveNameClashes({}, plan, {
        label: 'Tolaria', prefix: 'Tolaria · ',
        prompt: async (state) => { seen.push({ clashes: state.clashes.map(c => c.name), prefix: state.prefix }); return replies.shift(); }
    });
    assert.deepEqual(seen, [
        { clashes: [plan.collections[0].name], prefix: 'Tolaria · ' },
        { clashes: [`Tolaria · ${plan.collections[1].name}`], prefix: 'Tolaria · ' }
    ]);
    assert.deepEqual(result.collections.map(c => c.name), plan.collections.map(c => `Vault · ${c.name}`));
});

// ---- the dialog panel ----------------------------------------------------------------------------------

/** Small DOM: elements that keep their children, ids and handlers, and can be found by id. */
function miniDom() {
    const make = (tag) => {
        const el = { tag, style: {}, children: [], parent: null, disabled: false, _text: '', id: '' };
        el.appendChild = (c) => { c.parent = el; el.children.push(c); return c; };
        el.insertAdjacentElement = (where, c) => {
            assert.equal(where, 'afterend');
            const siblings = el.parent.children;
            c.parent = el.parent;
            siblings.splice(siblings.indexOf(el) + 1, 0, c);
            return c;
        };
        Object.defineProperty(el, 'textContent', { get: () => el._text, set: (v) => { el._text = String(v); el.children = []; } });
        Object.defineProperty(el, 'innerHTML', { get: () => '', set: () => { el.children = []; } });
        el.querySelector = (sel) => find(el, sel.replace(/^#/, ''));
        return el;
    };
    const find = (root, id) => {
        for (const c of root.children) {
            if (c.id === id) return c;
            const hit = find(c, id);
            if (hit) return hit;
        }
        return null;
    };
    const dialog = make('div');
    const status = dialog.appendChild(Object.assign(make('div'), { id: 'md-status' }));
    const importBtn = dialog.appendChild(Object.assign(make('button'), { id: 'md-import-btn', textContent: 'Import' }));
    const cancelBtn = dialog.appendChild(Object.assign(make('button'), { id: 'md-cancel-btn', textContent: 'Cancel' }));
    const text = (n) => [n._text, ...n.children.flatMap(text)].filter(Boolean).join('\n');
    return { make, dialog, status, importBtn, cancelBtn, find: (id) => find(dialog, id), text, document: { createElement: make, body: make('body') } };
}

async function until(fn) {
    for (let i = 0; i < 200; i++) {
        const v = fn();
        if (v) return v;
        await new Promise(r => setImmediate(r));
    }
    throw new Error('timed out');
}

test('dialog panel: lists clashes, defaults to separate with an editable prefix, and Continue returns it', async () => {
    const dom = miniDom();
    globalThis.document = dom.document;
    try {
        const { thymer, p } = setup();
        const plan = await sources.tolaria.parse(p);
        await userCollection(thymer, plan.collections[0].name);

        const pending = p._resolveNameClashes(dom.dialog, plan, { label: 'Tolaria', prefix: 'Tolaria · ' });
        const box = await until(() => dom.find('md-clash-container'));
        await until(() => box.children.length);
        assert.match(dom.text(box), new RegExp(`"${plan.collections[0].name}": has no Source Path field`));
        assert.equal(dom.find('md-clash-separate').checked, true, 'separate is the default');
        assert.equal(dom.find('md-clash-merge').checked, false);
        assert.equal(dom.find('md-clash-prefix').value, 'Tolaria · ');
        assert.match(dom.find('md-clash-preview').textContent, new RegExp(`Tolaria · ${plan.collections[0].name}`));
        assert.equal(dom.importBtn.disabled, true, 'Import waits for the choice');

        // an empty prefix is refused
        const prefix = dom.find('md-clash-prefix');
        prefix.value = '   ';
        prefix.oninput();
        dom.find('md-clash-continue').onclick();
        assert.match(dom.find('md-clash-problem').textContent, /Enter a prefix/);

        prefix.value = 'Vault · ';
        prefix.oninput();
        assert.match(dom.find('md-clash-preview').textContent, /Vault · /);
        dom.find('md-clash-continue').onclick();
        const result = await pending;
        assert.deepEqual(result.collections.map(c => c.name), plan.collections.map(c => `Vault · ${c.name}`));
        assert.equal(box.style.display, 'none');
        assert.equal(thymer.records.size, 0, 'nothing is written by the check');
    } finally {
        delete globalThis.document;
    }
});

test('dialog panel: choosing merge returns the original plan; "Do not import" returns null', async () => {
    const dom = miniDom();
    globalThis.document = dom.document;
    try {
        const { thymer, p } = setup();
        const plan = await sources.tolaria.parse(p);
        await userCollection(thymer, plan.collections[0].name);

        let pending = p._resolveNameClashes(dom.dialog, plan, { label: 'Tolaria', prefix: 'Tolaria · ' });
        await until(() => dom.find('md-clash-merge'));
        const merge = dom.find('md-clash-merge');
        merge.checked = true;
        dom.find('md-clash-separate').checked = false;
        merge.onchange();
        assert.equal(dom.find('md-clash-prefix').disabled, true);
        dom.find('md-clash-continue').onclick();
        assert.equal(await pending, plan);

        pending = p._resolveNameClashes(dom.dialog, plan, { label: 'Tolaria', prefix: 'Tolaria · ' });
        await until(() => dom.find('md-clash-back'));
        dom.find('md-clash-back').onclick();
        assert.equal(await pending, null);
    } finally {
        delete globalThis.document;
    }
});

for (const [sourceName, perform] of [['tolaria', 'performTolariaImport'], ['notion', 'performNotionImport']]) {
    test(`${perform}: clash panel runs before anything is written, and the prefix reaches the collections`, async () => {
        const dom = miniDom();
        globalThis.document = dom.document;
        try {
            const { thymer, p } = setup();
            const src = sources[sourceName];
            const plan = await src.parse(p);
            await userCollection(thymer, plan.collections[0].name);

            const done = p[perform](dom.dialog, {}, dirHandle(src.dir));
            await until(() => dom.find('md-clash-continue') && dom.find('md-clash-continue').onclick);
            assert.equal(thymer.records.size, 0, 'nothing written while the panel is open');
            assert.equal(thymer.collections.length, 1);
            assert.equal(dom.find('md-clash-prefix').value, src.prefix);
            dom.find('md-clash-continue').onclick();
            await done;

            assert.equal(dom.cancelBtn.textContent, 'Close');
            assert.deepEqual(names(thymer), [plan.collections[0].name, ...plan.collections.map(c => `${src.prefix}${c.name}`)].sort());
            assert.equal((await thymer.collection(plan.collections[0].name).getAllRecords()).length, 0);
        } finally {
            delete globalThis.document;
        }
    });

    test(`${perform}: "Do not import" leaves the workspace alone and re-enables Import`, async () => {
        const dom = miniDom();
        globalThis.document = dom.document;
        try {
            const { thymer, p } = setup();
            const src = sources[sourceName];
            await userCollection(thymer, (await src.parse(p)).collections[0].name);
            const done = p[perform](dom.dialog, {}, dirHandle(src.dir));
            await until(() => dom.find('md-clash-back') && dom.find('md-clash-back').onclick);
            dom.find('md-clash-back').onclick();
            await done;
            assert.equal(thymer.records.size, 0);
            assert.equal(thymer.collections.length, 1);
            assert.equal(dom.importBtn.disabled, false);
            assert.equal(dom.importBtn.textContent, 'Import');
            assert.match(dom.status.textContent, /Nothing was changed/);
        } finally {
            delete globalThis.document;
        }
    });
}
