// Regression tests for the six findings of the automated review of upstream PR #3.
// Every test here failed before its fix. Fixtures are synthetic (test/fixtures/notion-id-folders).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPlugin } from './lib/load-plugin.mjs';
import { dirHandle } from './lib/fs-handle.mjs';
import { FakeThymer, FakeDateTime } from './lib/fake-thymer.mjs';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fast = { sleep: async () => {} };
const plugin = newPlugin({ DateTime: FakeDateTime });

// ---------------------------------------------------------------------------------------------
// Finding 1 (P1): a Notion rows folder named with the database id ("Tasks <id>/" next to "Tasks <id>.csv")
// ---------------------------------------------------------------------------------------------

const TASKS_ID = '35033016139844f5dc950ed83f95f548';
const WRITE_ID = 'b8d14f4f3ebc709057423aa5891dfcc0';

/** Builds the parse input of a tiny export from { path: text }; assets are not needed. */
function inMemory(entries) {
    return { files: new Map(), texts: new Map(Object.entries(entries)) };
}

const TASKS_CSV = 'Name,Status\nWrite report,Open\nShip release,Done\n';
const page = (title, body = 'Body.') => `# ${title}\n\nStatus: Open\n\n${body}\n`;

test('finding 1: a rows folder named with the database id is claimed (fixture)', async () => {
    const plan = await plugin.parseNotionExport(dirHandle(path.join(FIXTURES, 'notion-id-folders')));
    assert.deepEqual(plan.collections.map(c => c.name), ['Tasks'], 'no "Notion Pages" collection: every page belongs to a row');
    const write = plan.records.find(r => r.title === 'Write report');
    assert.ok(write.sourcePath.endsWith(`Tasks ${TASKS_ID}/Write report ${WRITE_ID}.md`), write.sourcePath);
    assert.match(write.body, /Draft the quarterly summary\./);
    assert.doesNotMatch(write.body, /Status: Open/, 'the property block is stripped');
    const db = plan.parseReport.databases[0];
    assert.equal(db.matched, 2);
    assert.deepEqual(db.pagesWithoutRow, []);
    assert.equal(plan.parseReport.standalonePages, 0);
});

test('finding 1: the full csv stem wins over a plain-name folder; id-only and sanitised-name folders are claimed too', async () => {
    const stem = `Tasks ${TASKS_ID}`;
    const base = 'x_ExportBlock-1';
    const claimedTitles = (plan) => plan.records.filter(r => r.collection === 'notion-db:' + TASKS_ID).map(r => r.sourcePath);

    // full stem first, even when a plain "Tasks/" folder with other pages sits beside it
    let plan = plugin._notionBuildPlan(inMemory({
        [`${base}/${stem}.csv`]: TASKS_CSV,
        [`${base}/${stem}/Write report aaaa1111aaaa1111aaaa1111aaaa1111.md`]: page('Write report', 'From the id folder.'),
        [`${base}/Tasks/Ship release bbbb2222bbbb2222bbbb2222bbbb2222.md`]: page('Ship release', 'From the plain folder.')
    }));
    assert.match(plan.records.find(r => r.title === 'Write report').body, /From the id folder\./);
    assert.equal(plan.records.find(r => r.title === 'Write report').sourcePath.includes(`${stem}/`), true);
    const plainPage = plan.records.find(r => r.sourcePath.includes('/Tasks/Ship release ') && r.sourcePath.endsWith('.md'));
    assert.equal(plainPage.collection, 'notion-pages', 'the plain folder is not a rows folder when the id folder exists');

    // the id folder was renamed, but it still ends with the database id
    plan = plugin._notionBuildPlan(inMemory({
        [`${base}/${stem}.csv`]: TASKS_CSV,
        [`${base}/Old Tasks ${TASKS_ID}/Write report aaaa1111aaaa1111aaaa1111aaaa1111.md`]: page('Write report'),
        [`${base}/Old Tasks ${TASKS_ID}/Ship release bbbb2222bbbb2222bbbb2222bbbb2222.md`]: page('Ship release')
    }));
    assert.equal(claimedTitles(plan).length, 2);
    assert.ok(plan.records.every(r => r.collection === 'notion-db:' + TASKS_ID));

    // name with the id stripped (the form the existing fixtures use)
    plan = plugin._notionBuildPlan(inMemory({
        [`${base}/${stem}.csv`]: TASKS_CSV,
        [`${base}/Tasks/Write report aaaa1111aaaa1111aaaa1111aaaa1111.md`]: page('Write report'),
        [`${base}/Tasks/Ship release bbbb2222bbbb2222bbbb2222bbbb2222.md`]: page('Ship release')
    }));
    assert.equal(plan.parseReport.databases[0].matched, 2);

    // Notion sanitised a character in the folder name differently from the csv's
    plan = plugin._notionBuildPlan(inMemory({
        [`${base}/Tasks: 2024 ${TASKS_ID}.csv`]: TASKS_CSV,
        [`${base}/Tasks 2024/Write report aaaa1111aaaa1111aaaa1111aaaa1111.md`]: page('Write report'),
        [`${base}/Tasks 2024/Ship release bbbb2222bbbb2222bbbb2222bbbb2222.md`]: page('Ship release')
    }));
    assert.equal(plan.parseReport.databases[0].matched, 2);
});

test('finding 1: re-importing the id-folder export updates the same records', async () => {
    const plan = await plugin.parseNotionExport(dirHandle(path.join(FIXTURES, 'notion-id-folders')));
    const thymer = new FakeThymer();
    plugin.data = thymer.data;
    await plugin.applyImportPlan(plan, fast);
    const second = await plugin.applyImportPlan(plan, fast);
    assert.equal(second.counts.recordsCreated, 0);
    assert.equal(second.counts.recordsUpdated, plan.records.length);
    assert.equal(thymer.collection('Notion Pages'), null);
});

// ---------------------------------------------------------------------------------------------
// Finding 2 (P1): CSV rows without a page that share a title must not share a dedupe path
// ---------------------------------------------------------------------------------------------

test('finding 2: page-less rows with the same title get distinct, stable, id-free source paths', async () => {
    const plan = await plugin.parseNotionExport(dirHandle(path.join(FIXTURES, 'notion-id-folders')));
    const pageless = plan.records.filter(r => !r.sourcePath.endsWith('.md'));
    const paths = pageless.map(r => r.sourcePath.split('/').slice(-2).join('/'));
    assert.deepEqual(paths, ['Tasks/Call plumber', 'Tasks/Call plumber#2', 'Tasks/Untitled', 'Tasks/Untitled#2'],
        'first occurrence keeps the old path (existing imports still dedupe), later ones get #n in csv order');
    assert.equal(new Set(plan.records.map(r => r.sourcePath.toLowerCase())).size, plan.records.length, 'every record has its own source path');
    assert.ok(pageless.every(r => !r.sourcePath.includes(TASKS_ID)), 'paths stay id-free');
    // both rows keep their own values
    assert.deepEqual(pageless.slice(0, 2).map(r => r.values.status), ['Open', 'Done']);
});

test('finding 2: the paths do not move when unrelated rows or pages are added to a later export', () => {
    const stem = 'e_ExportBlock-1/Tasks ' + TASKS_ID;
    const rows = 'Name,Status\nCall plumber,Open\nCall plumber,Done\n';
    const before = plugin._notionBuildPlan(inMemory({ [`${stem}.csv`]: rows }));
    const after = plugin._notionBuildPlan(inMemory({
        [`${stem}.csv`]: 'Name,Status\nWrite report,Open\n' + rows.split('\n').slice(1).join('\n'),
        [`${stem}/Write report aaaa1111aaaa1111aaaa1111aaaa1111.md`]: page('Write report')
    }));
    const plumber = (plan) => plan.records.filter(r => r.title === 'Call plumber').map(r => r.sourcePath);
    assert.deepEqual(plumber(after), plumber(before));
});

test('finding 2: the report names the colliding titles', async () => {
    const plan = await plugin.parseNotionExport(dirHandle(path.join(FIXTURES, 'notion-id-folders')));
    const db = plan.parseReport.databases[0];
    assert.deepEqual(db.duplicateRowsWithoutPage.map(d => [d.title, d.count]), [['Call plumber', 2], ['Untitled', 2]]);
    const summary = plugin._notionSummarize(plan, { counts: {}, errors: [], warnings: [], unresolvedLinks: [] });
    const section = summary.sections.find(s => /share a title/i.test(s.title));
    assert.ok(section, 'the summary has a section for it');
    assert.ok(section.items.some(i => i.includes('Call plumber') && i.includes('#2')), section.items.join(' | '));
});

test('finding 2: both rows become records, and re-import neither duplicates nor merges them', async () => {
    const plan = await plugin.parseNotionExport(dirHandle(path.join(FIXTURES, 'notion-id-folders')));
    const thymer = new FakeThymer();
    plugin.data = thymer.data;
    const first = await plugin.applyImportPlan(plan, fast);
    assert.equal(first.counts.recordsCreated, 6);
    const records = await thymer.collection('Tasks').getAllRecords();
    assert.equal(records.length, 6);
    assert.deepEqual(records.filter(r => r.getName() === 'Call plumber').map(r => r.prop('status').choiceLabel()).sort(), ['Done', 'Open']);
    const second = await plugin.applyImportPlan(plan, fast);
    assert.equal(second.counts.recordsCreated, 0);
    assert.equal((await thymer.collection('Tasks').getAllRecords()).length, 6);
});

// ---------------------------------------------------------------------------------------------
// Finding 5 (P2): Tolaria field ids must not collide ("cost ($)" and "cost (%)" both slugify to "cost")
// ---------------------------------------------------------------------------------------------

/** A webkitdirectory-style file list from { 'vault/note.md': text }. */
function memoryVault(entries) {
    const files = Object.entries(entries).map(([rel, text]) => {
        const file = new File([text], rel.split('/').pop());
        Object.defineProperty(file, 'webkitRelativePath', { value: rel });
        return file;
    });
    return { kind: 'filelist', files };
}
const note = (frontmatter, title) => `---\n${frontmatter}\n---\n# ${title}\n\nText.\n`;

test('finding 5: distinct keys that slugify alike get distinct field ids and keep their own values', async () => {
    const plan = await plugin.parseTolariaVault(memoryVault({
        'vault/a.md': note('cost ($): 10\nStatus: open', 'A'),
        'vault/b.md': note('cost (%): 5\nstatus: closed', 'B')
    }));
    const fields = plan.collections[0].fields;
    assert.deepEqual(fields.map(f => f.id).sort(), ['cost', 'cost_2', 'status'], 'two cost fields; Status/status still share one');
    const idOf = (label) => fields.find(f => f.label === label).id;
    const a = plan.records.find(r => r.title === 'A');
    const b = plan.records.find(r => r.title === 'B');
    assert.equal(a.values[idOf('Cost ($)')], '10', 'source spelling (round 3): a string, the engine converts it by the persisted field');
    assert.equal(b.values[idOf('Cost (%)')], '5');
    assert.equal(a.values[idOf('Cost (%)')], undefined);
    assert.equal(Object.keys(a.values).length, 2);
    assert.deepEqual(plugin.validateImportPlan(plan), []);
});

test('finding 5: ids are allocated in sorted key order, so they do not depend on which note comes first', async () => {
    const one = await plugin.parseTolariaVault(memoryVault({
        'vault/a.md': note('cost ($): 10', 'First'),
        'vault/b.md': note('cost (%): 5', 'Second')
    }));
    const two = await plugin.parseTolariaVault(memoryVault({
        'vault/a.md': note('cost (%): 5', 'Second'),
        'vault/b.md': note('cost ($): 10', 'First')
    }));
    const map = (plan) => Object.fromEntries(plan.collections[0].fields.map(f => [f.label, f.id]));
    assert.deepEqual(map(one), map(two));
    assert.deepEqual(map(one), { 'Cost ($)': 'cost', 'Cost (%)': 'cost_2' });   // "cost ($)" sorts before "cost (%)"
});

test('finding 5: a key that slugifies to an already allocated "name_2" does not take it over', async () => {
    const plan = await plugin.parseTolariaVault(memoryVault({
        'vault/a.md': note('cost ($): 1\ncost (%): 2\ncost_2: 3', 'A')
    }));
    const ids = plan.collections[0].fields.map(f => f.id);
    assert.equal(new Set(ids).size, 3, ids.join(','));
    const a = plan.records[0];
    assert.deepEqual(Object.values(a.values).sort(), ['1', '2', '3']);
});

test('finding 5 (Notion): column ids were already collision-free, including the "(text)" companion', async () => {
    const stem = `e_ExportBlock-1/Gear ${TASKS_ID}`;
    const plan = plugin._notionBuildPlan(inMemory({
        [`${stem}.csv`]: 'Name,Cost ($),Cost (%),Cost\nDrill,10,5,high\n'
    }));
    const ids = plan.collections[0].fields.map(f => f.id);
    assert.deepEqual(ids, ['cost', 'cost_2', 'cost_3']);
    const drill = plan.records[0];
    assert.deepEqual(drill.values, { cost: '10', cost_2: '5', cost_3: 'high' });
});

// ---------------------------------------------------------------------------------------------
// Findings 3, 4 and 6: the engine on re-import
// ---------------------------------------------------------------------------------------------

function engine() {
    const thymer = new FakeThymer();
    const p = newPlugin({ DateTime: FakeDateTime });
    p.data = thymer.data;
    return { thymer, p };
}

/** A one-collection plan. fields: [{ id, label, type, many? }]; records: [{ key, title, sourcePath, values }]. */
function simplePlan(p, { fields, records, name = 'Things' }) {
    const plan = p.createImportPlan('synthetic');
    plan.collections.push({ key: 'things', name, icon: 'ti-box', description: 'Synthetic', fields });
    for (const r of records) plan.records.push({ collection: 'things', body: '', values: {}, ...r });
    return plan;
}
const choiceLabels = (thymer, name, fieldId) => thymer.collection(name).config.fields.find(f => f.id === fieldId).choices.map(c => c.label);

// ---- Finding 4 --------------------------------------------------------------------------------

test('finding 4: a persisted choice field gets new options even when the fresh inference is text', async () => {
    const { thymer, p } = engine();
    const first = simplePlan(p, {
        fields: [{ id: 'status', label: 'Status', type: 'choice' }],
        records: [{ key: 'a', title: 'A', sourcePath: 'a.md', values: { status: 'open' } }]
    });
    await p.applyImportPlan(first, fast);
    assert.deepEqual(choiceLabels(thymer, 'Things', 'status'), ['open']);

    // the next export has more values, and the column is now inferred as text
    const second = simplePlan(p, {
        fields: [{ id: 'status', label: 'Status', type: 'text' }],
        records: [
            { key: 'a', title: 'A', sourcePath: 'a.md', values: { status: 'archived' } },
            { key: 'b', title: 'B', sourcePath: 'b.md', values: { status: 'Open' } }
        ]
    });
    const report = await p.applyImportPlan(second, fast);
    assert.deepEqual(report.warnings.filter(w => w.code === 'property-not-set'), [], 'no value dropped');
    assert.equal(thymer.collection('Things').config.fields.find(f => f.id === 'status').type, 'choice', 'never retyped');
    assert.deepEqual(choiceLabels(thymer, 'Things', 'status'), ['open', 'archived'], 'new option added; "Open" matches "open" case-insensitively');
    assert.equal(thymer.recordByTitle('Things', 'A').prop('status').choiceLabel(), 'archived');
    assert.equal(thymer.recordByTitle('Things', 'B').prop('status').choiceLabel(), 'open');
});

test('finding 4: the same for a multi-value choice field', async () => {
    const { thymer, p } = engine();
    await p.applyImportPlan(simplePlan(p, {
        fields: [{ id: 'tags', label: 'Tags', type: 'choice', many: true }],
        records: [{ key: 'a', title: 'A', sourcePath: 'a.md', values: { tags: ['x', 'y'] } }]
    }), fast);
    const report = await p.applyImportPlan(simplePlan(p, {
        fields: [{ id: 'tags', label: 'Tags', type: 'text', many: true }],
        records: [{ key: 'a', title: 'A', sourcePath: 'a.md', values: { tags: ['y', 'z'] } }]
    }), fast);
    assert.deepEqual(report.warnings.filter(w => w.code === 'property-not-set'), []);
    assert.deepEqual(choiceLabels(thymer, 'Things', 'tags'), ['x', 'y', 'z']);
    assert.deepEqual(thymer.recordByTitle('Things', 'A').prop('tags').selectedChoiceLabels(), ['y', 'z']);
});

test('finding 4: a persisted text field is left alone when the fresh inference says choice', async () => {
    const { thymer, p } = engine();
    await p.applyImportPlan(simplePlan(p, {
        fields: [{ id: 'status', label: 'Status', type: 'text' }],
        records: [{ key: 'a', title: 'A', sourcePath: 'a.md', values: { status: 'open' } }]
    }), fast);
    await p.applyImportPlan(simplePlan(p, {
        fields: [{ id: 'status', label: 'Status', type: 'choice' }],
        records: [{ key: 'a', title: 'A', sourcePath: 'a.md', values: { status: 'closed' } }]
    }), fast);
    const field = thymer.collection('Things').config.fields.find(f => f.id === 'status');
    assert.equal(field.type, 'text');
    assert.equal(thymer.recordByTitle('Things', 'A').text('status'), 'closed');
});

// ---- Finding 3 --------------------------------------------------------------------------------

const thingRecords = async (thymer) => (await thymer.collection('Things').getAllRecords());

test('finding 3: a changed title with the same source_path updates the record instead of duplicating it', async () => {
    const { thymer, p } = engine();
    const fields = [{ id: 'note', label: 'Note', type: 'text' }];
    await p.applyImportPlan(simplePlan(p, { fields, records: [{ key: 'a', title: 'Old Title', sourcePath: 'notes/a.md', values: { note: 'one' }, body: 'First body' }] }), fast);
    const [original] = await thingRecords(thymer);

    const report = await p.applyImportPlan(simplePlan(p, { fields, records: [{ key: 'a', title: 'New Title', sourcePath: 'notes/a.md', values: { note: 'two' }, body: 'Second body' }] }), fast);
    const all = await thingRecords(thymer);
    assert.equal(all.length, 1, 'no duplicate');
    assert.equal(all[0].guid, original.guid);
    assert.equal(report.counts.recordsCreated, 0);
    assert.equal(report.counts.recordsUpdated, 1);
    assert.equal(all[0].text('note'), 'two', 'the update was applied');
    assert.equal((await all[0].getLineItems(false)).map(i => i.text).join('|'), 'Second body');
});

test('finding 3: a changed title is renamed through the built-in title property, and counted', async () => {
    const { thymer, p } = engine();
    const fields = [];
    await p.applyImportPlan(simplePlan(p, { fields, records: [{ key: 'a', title: 'Old Title', sourcePath: 'notes/a.md' }, { key: 'b', title: 'Same', sourcePath: 'notes/b.md' }] }), fast);
    const [guid] = (await thingRecords(thymer)).map(r => r.guid);
    // reads right after a write are stale in Thymer, so the rename must not be verified (or otherwise depend on) getName()
    thymer.staleReads = true;
    const report = await p.applyImportPlan(simplePlan(p, { fields, records: [{ key: 'a', title: 'New Title', sourcePath: 'notes/a.md' }, { key: 'b', title: 'Same', sourcePath: 'notes/b.md' }] }), fast);
    thymer.settle();
    const all = await thingRecords(thymer);
    assert.deepEqual(all.map(r => r.getName()).sort(), ['New Title', 'Same']);
    assert.equal(all.find(r => r.getName() === 'New Title').guid, guid, 'same record, not a duplicate');
    assert.equal(report.counts.recordsRenamed, 1, 'only the changed title');
    assert.deepEqual(report.warnings.filter(w => /title/.test(w.code)), []);
    // nothing changed: nothing renamed
    const again = await p.applyImportPlan(simplePlan(p, { fields, records: [{ key: 'a', title: 'New Title', sourcePath: 'notes/a.md' }] }), fast);
    assert.equal(again.counts.recordsRenamed, 0);
});

test('finding 3: the title property is looked up as "Title", then "title"; without one the change is a warning', async () => {
    for (const [titleProps, renamed] of [[['title'], true], [[], false]]) {
        const { thymer, p } = engine();
        thymer.titleProps = titleProps;
        await p.applyImportPlan(simplePlan(p, { fields: [], records: [{ key: 'a', title: 'Old', sourcePath: 'a.md' }] }), fast);
        const report = await p.applyImportPlan(simplePlan(p, { fields: [], records: [{ key: 'a', title: 'New', sourcePath: 'a.md' }] }), fast);
        assert.equal(report.counts.recordsRenamed, renamed ? 1 : 0, JSON.stringify(titleProps));
        assert.equal((await thingRecords(thymer)).length, 1, 'never a duplicate');
        assert.equal((await thingRecords(thymer))[0].getName(), renamed ? 'New' : 'Old');
        assert.equal(report.warnings.some(w => w.code === 'title-not-renamed'), !renamed);
        assert.equal(report.counts.recordsUpdated, 1);
    }
});

test('finding 3: a collection with a field of its own called "Title" is not renamed through the lookup', async () => {
    const { thymer, p } = engine();
    const fields = [{ id: 'title', label: 'Title', type: 'text' }];
    await p.applyImportPlan(simplePlan(p, { fields, records: [{ key: 'a', title: 'Old', sourcePath: 'a.md', values: { title: 'mine' } }] }), fast);
    const report = await p.applyImportPlan(simplePlan(p, { fields, records: [{ key: 'a', title: 'New', sourcePath: 'a.md', values: { title: 'mine' } }] }), fast);
    assert.equal(report.counts.recordsRenamed, 0);
    assert.equal(report.warnings.filter(w => w.code === 'title-not-renamed').length, 1);
    assert.equal((await thingRecords(thymer))[0].getName(), 'Old');
    assert.equal((await thingRecords(thymer))[0].text('title'), 'mine');
});

test('finding 3: a rename that throws is a warning, and the update still goes through', async () => {
    const { thymer, p } = engine();
    await p.applyImportPlan(simplePlan(p, { fields: [{ id: 'note', label: 'Note', type: 'text' }], records: [{ key: 'a', title: 'Old', sourcePath: 'a.md' }] }), fast);
    (await thingRecords(thymer))[0]._setTitle = () => { throw new Error('read only'); };
    const report = await p.applyImportPlan(simplePlan(p, { fields: [{ id: 'note', label: 'Note', type: 'text' }], records: [{ key: 'a', title: 'New', sourcePath: 'a.md', values: { note: 'x' } }] }), fast);
    assert.equal(report.counts.recordsRenamed, 0);
    assert.match(report.warnings.find(w => w.code === 'title-not-renamed').message, /read only/);
    assert.equal((await thingRecords(thymer))[0].text('note'), 'x');
});

test('finding 3: paths are matched trimmed and case-folded', async () => {
    const { thymer, p } = engine();
    await p.applyImportPlan(simplePlan(p, { fields: [], records: [{ key: 'a', title: 'A', sourcePath: 'Notes/A.md' }] }), fast);
    const report = await p.applyImportPlan(simplePlan(p, { fields: [], records: [{ key: 'a', title: 'A', sourcePath: ' notes/a.md ' }] }), fast);
    assert.equal(report.counts.recordsCreated, 0);
    assert.equal((await thingRecords(thymer)).length, 1);
});

test('finding 3: a record with no source_path is still adopted by title, once; a path-backed record is never taken by title', async () => {
    const { thymer, p } = engine();
    const fields = [];
    await p.applyImportPlan(simplePlan(p, { fields, records: [{ key: 'x', title: 'Same', sourcePath: 'x.md' }] }), fast);
    const things = thymer.collection('Things');
    const manualGuid = things.createRecord('Manual');   // made by hand: no source_path
    const manual = thymer.records.get(manualGuid);

    const report = await p.applyImportPlan(simplePlan(p, { fields, records: [
        { key: 'm', title: 'Manual', sourcePath: 'm.md' },
        { key: 'y', title: 'Same', sourcePath: 'y.md' }      // same title as x.md, different file: its own record
    ] }), fast);
    assert.equal(report.counts.recordsCreated, 1, 'only "Same" (y.md) is new');
    assert.equal(manual.text('source_path'), 'm.md', 'adopted: source_path now set');
    assert.equal((await thingRecords(thymer)).length, 3);

    // and the adopted record is now matched by path, even if its title changes later
    const third = await p.applyImportPlan(simplePlan(p, { fields, records: [{ key: 'm', title: 'Manual renamed', sourcePath: 'm.md' }] }), fast);
    assert.equal(third.counts.recordsCreated, 0);
    assert.equal((await thingRecords(thymer)).length, 3);
});

// ---- Finding 6 --------------------------------------------------------------------------------

const CLEAR_FIELDS = [
    { id: 'note', label: 'Note', type: 'text' },
    { id: 'rating', label: 'Rating', type: 'number' },
    { id: 'status', label: 'Status', type: 'choice' },
    { id: 'tags', label: 'Tags', type: 'choice', many: true },
    { id: 'due', label: 'Due', type: 'datetime' },
    { id: 'rel', label: 'Related', type: 'record', many: true, target: 'things' }
];
const FULL = { note: 'hello', rating: 4, status: 'open', tags: ['a', 'b'], due: '2026-03-01' };

/** Imports a full record "A" (and a second record "B" it relates to), then returns the pieces. */
async function importedWithValues() {
    const { thymer, p } = engine();
    const plan = simplePlan(p, { fields: CLEAR_FIELDS, records: [
        { key: 'a', title: 'A', sourcePath: 'a.md', values: { ...FULL } },
        { key: 'b', title: 'B', sourcePath: 'b.md', values: { note: 'keep me' } }
    ] });
    p.planPropertyLink(plan, 'a', 'rel', { ref: 'b', kind: 'key' });
    const first = await p.applyImportPlan(plan, fast);
    assert.equal(first.counts.valuesCleared, 0, 'nothing is cleared on create');
    return { thymer, p };
}
const propsOf = (thymer, title) => Object.fromEntries(CLEAR_FIELDS.map(f => [f.id, thymer.recordByTitle('Things', title).prop(f.id).count()]));

test('finding 6: values that are gone from the source are cleared on re-import, and counted', async () => {
    const { thymer, p } = await importedWithValues();
    assert.deepEqual(propsOf(thymer, 'A'), { note: 1, rating: 1, status: 1, tags: 2, due: 1, rel: 1 });

    // the same fields are declared, but record A no longer has any value, nor a relation
    const report = await p.applyImportPlan(simplePlan(p, { fields: CLEAR_FIELDS, records: [
        { key: 'a', title: 'A', sourcePath: 'a.md', values: {} },
        { key: 'b', title: 'B', sourcePath: 'b.md', values: { note: 'keep me' } }
    ] }), fast);
    assert.deepEqual(propsOf(thymer, 'A'), { note: 0, rating: 0, status: 0, tags: 0, due: 0, rel: 0 });
    assert.equal(report.counts.valuesCleared, 6, 'one per property that had a value');
    assert.deepEqual(report.warnings.filter(w => w.code === 'property-not-cleared'), []);
    assert.equal(thymer.recordByTitle('Things', 'B').text('note'), 'keep me', 'B still has its value');
});

test('finding 6: values that are still present are kept; empty strings and empty arrays count as absent', async () => {
    const { thymer, p } = await importedWithValues();
    const plan = simplePlan(p, { fields: CLEAR_FIELDS, records: [
        { key: 'a', title: 'A', sourcePath: 'a.md', values: { note: 'changed', rating: null, status: '', tags: [] } },
        { key: 'b', title: 'B', sourcePath: 'b.md', values: { note: 'keep me' } }
    ] });
    p.planPropertyLink(plan, 'a', 'rel', { ref: 'b', kind: 'key' });   // the relation is still in the source
    const report = await p.applyImportPlan(plan, fast);
    const a = thymer.recordByTitle('Things', 'A');
    assert.equal(a.text('note'), 'changed');
    assert.equal(a.prop('rel').count(), 1, 'a planned relation is not cleared');
    assert.deepEqual(['rating', 'status', 'tags', 'due'].map(id => a.prop(id).count()), [0, 0, 0, 0]);
    assert.equal(report.counts.valuesCleared, 3 + 1, 'rating, status, tags and due were absent');
});

test('finding 6: only fields the plan declares for that collection are touched (user fields, source_path, read-only fields are not)', async () => {
    const { thymer, p } = await importedWithValues();
    const things = thymer.collection('Things');
    // a field the user added in Thymer, with a value on A
    things.config.fields.push({ id: 'mine', label: 'Mine', type: 'text', icon: 'ti-x', many: false, read_only: false, active: true });
    thymer.recordByTitle('Things', 'A').prop('mine').set('user data');
    // a declared field that is read-only in the persisted collection
    things.config.fields.find(f => f.id === 'note').read_only = true;

    const report = await p.applyImportPlan(simplePlan(p, { fields: CLEAR_FIELDS, records: [
        { key: 'a', title: 'A', sourcePath: 'a.md', values: {} },
        { key: 'b', title: 'B', sourcePath: 'b.md', values: {} }
    ] }), fast);
    const a = thymer.recordByTitle('Things', 'A');
    assert.equal(a.text('mine'), 'user data', 'undeclared field untouched');
    assert.equal(a.text('source_path'), 'a.md', 'source_path untouched');
    assert.equal(a.text('note'), 'hello', 'read-only persisted field untouched');
    assert.equal(thymer.recordByTitle('Things', 'B').text('note'), 'keep me');
    assert.equal(a.prop('rating').count(), 0, 'declared, writable fields are cleared');
    assert.ok(report.counts.valuesCleared >= 5);
});

test('finding 6: a field that exists only in another collection of the plan is not cleared here', async () => {
    const { thymer, p } = engine();
    const plan = p.createImportPlan('synthetic');
    plan.collections.push(
        { key: 'things', name: 'Things', icon: 'ti-box', description: '', fields: [{ id: 'note', label: 'Note', type: 'text' }] },
        { key: 'others', name: 'Others', icon: 'ti-box', description: '', fields: [{ id: 'extra', label: 'Extra', type: 'text' }] }
    );
    plan.records.push({ key: 'a', collection: 'things', title: 'A', sourcePath: 'a.md', values: { note: 'n' }, body: '' });
    await p.applyImportPlan(plan, fast);
    // someone adds "extra" to Things by hand and fills it
    thymer.collection('Things').config.fields.push({ id: 'extra', label: 'Extra', type: 'text', icon: 'ti-x', many: false, read_only: false, active: true });
    thymer.recordByTitle('Things', 'A').prop('extra').set('by hand');
    const plan2 = p.createImportPlan('synthetic');
    plan2.collections.push(...plan.collections);
    plan2.records.push({ key: 'a', collection: 'things', title: 'A', sourcePath: 'a.md', values: {}, body: '' });
    await p.applyImportPlan(plan2, fast);
    assert.equal(thymer.recordByTitle('Things', 'A').text('extra'), 'by hand');
    assert.equal(thymer.recordByTitle('Things', 'A').prop('note').count(), 0);
});

test('finding 6: a property is cleared with exactly one set() call, no read-back and no fallback', () => {
    const { p } = engine();
    const spy = (multi) => {
        const calls = [];
        return {
            calls,
            isMultiValue: () => multi,
            set: (v) => calls.push(['set', v]),
            count: () => { calls.push(['count']); return 2; }, values: () => { calls.push(['values']); return ['x']; },
            removeValueAt: () => calls.push(['removeValueAt']), removeValue: () => calls.push(['removeValue'])
        };
    };
    const many = spy(true);
    p._planClearProperty(many);
    assert.deepEqual(many.calls, [['set', []]]);
    const one = spy(false);
    p._planClearProperty(one);
    assert.deepEqual(one.calls, [['set', null]]);
});

test('finding 6: clearing under stale reads (Thymer reads right after a write return the old values) leaves nothing behind', async () => {
    const { thymer, p } = await importedWithValues();
    thymer.staleReads = true;
    const report = await p.applyImportPlan(simplePlan(p, { fields: CLEAR_FIELDS, records: [
        { key: 'a', title: 'A', sourcePath: 'a.md', values: {} }, { key: 'b', title: 'B', sourcePath: 'b.md', values: { note: 'keep me' } }
    ] }), fast);
    thymer.settle();   // what storage holds now
    assert.deepEqual(propsOf(thymer, 'A'), { note: 0, rating: 0, status: 0, tags: 0, due: 0, rel: 0 }, 'including the multi-value tags');
    assert.equal(report.counts.valuesCleared, 6);
    assert.deepEqual(report.warnings.filter(w => w.code === 'property-not-cleared'), [], 'no false failure from a stale read');
    // one write per cleared property on A, and none that rewrote an old value
    const a = thymer.recordByTitle('Things', 'A').guid;
    const writes = thymer.writeLog.filter(w => w.record === a && CLEAR_FIELDS.some(f => f.id === w.field)).slice(-6);
    assert.ok(writes.every(w => w.value.length === 0), JSON.stringify(writes));
});

test('finding 6: a property that is already empty is not written again, and is not counted', async () => {
    const { thymer, p } = await importedWithValues();
    const plan = () => simplePlan(p, { fields: CLEAR_FIELDS, records: [
        { key: 'a', title: 'A', sourcePath: 'a.md', values: {} }, { key: 'b', title: 'B', sourcePath: 'b.md', values: { note: 'keep me' } }
    ] });
    await p.applyImportPlan(plan(), fast);
    thymer.settle();
    thymer.writeLog.length = 0;
    const second = await p.applyImportPlan(plan(), fast);
    assert.equal(second.counts.valuesCleared, 0);
    const bGuid = thymer.recordByTitle('Things', 'B').guid;
    assert.deepEqual(thymer.writeLog.filter(w => w.field !== 'source_path' && !(w.record === bGuid && w.field === 'note')), [], 'no write to an empty declared field');
});

test('finding 6: a set() that throws is a warning and is not counted', async () => {
    const { thymer, p } = await importedWithValues();
    const a = thymer.recordByTitle('Things', 'A');
    const real = a.prop.bind(a);
    a.prop = (name) => { const prop = real(name); if (name === 'rating') prop.set = () => { throw new Error('boom'); }; return prop; };
    const report = await p.applyImportPlan(simplePlan(p, { fields: CLEAR_FIELDS, records: [
        { key: 'a', title: 'A', sourcePath: 'a.md', values: {} }, { key: 'b', title: 'B', sourcePath: 'b.md', values: { note: 'keep me' } }
    ] }), fast);
    assert.equal(report.counts.valuesCleared, 5);
    assert.match(report.warnings.find(w => w.code === 'property-not-cleared').message, /rating.*boom/);
});

test('finding 6: existing: "skip" never clears', async () => {
    const { thymer, p } = await importedWithValues();
    const report = await p.applyImportPlan(simplePlan(p, { fields: CLEAR_FIELDS, records: [
        { key: 'a', title: 'A', sourcePath: 'a.md', values: {} }, { key: 'b', title: 'B', sourcePath: 'b.md', values: {} }
    ] }), { ...fast, existing: 'skip' });
    assert.equal(report.counts.valuesCleared, 0);
    assert.equal(thymer.recordByTitle('Things', 'A').text('note'), 'hello');
});

test('finding 6 (Notion): an emptied csv cell is cleared on re-import', async () => {
    const stem = `e_ExportBlock-1/Gear ${TASKS_ID}`;
    const plan1 = plugin._notionBuildPlan(inMemory({ [`${stem}.csv`]: 'Name,Status,Rating\nDrill,Open,5\nSaw,Done,3\n' }));
    const plan2 = plugin._notionBuildPlan(inMemory({ [`${stem}.csv`]: 'Name,Status,Rating\nDrill,,5\nSaw,Done,\n' }));
    const thymer = new FakeThymer();
    plugin.data = thymer.data;
    await plugin.applyImportPlan(plan1, fast);
    const report = await plugin.applyImportPlan(plan2, fast);
    assert.equal(thymer.recordByTitle('Gear', 'Drill').prop('status').count(), 0);
    assert.equal(thymer.recordByTitle('Gear', 'Drill').number('rating'), 5);
    assert.equal(thymer.recordByTitle('Gear', 'Saw').prop('rating').count(), 0);
    assert.equal(thymer.recordByTitle('Gear', 'Saw').text('status'), 'Done');
    assert.equal(report.counts.valuesCleared, 2);
    assert.equal(plugin._notionSummarize(plan2, report).counts.some(l => /Values cleared.*: 2$/.test(l)), true, 'the report line');
});

test('finding 6 (Tolaria): a frontmatter key removed from a note is cleared on re-import', async () => {
    const v1 = memoryVault({ 'vault/a.md': note('cadence: weekly\nurl: https://example.invalid/a', 'A'), 'vault/b.md': note('cadence: daily', 'B') });
    const v2 = memoryVault({ 'vault/a.md': note('url: https://example.invalid/a', 'A'), 'vault/b.md': note('cadence: daily', 'B') });
    const thymer = new FakeThymer();
    plugin.data = thymer.data;
    await plugin.applyImportPlan(await plugin.parseTolariaVault(v1), fast);
    const report = await plugin.applyImportPlan(await plugin.parseTolariaVault(v2), fast);
    assert.equal(thymer.recordByTitle('Notes', 'A').prop('cadence').count(), 0);
    assert.equal(thymer.recordByTitle('Notes', 'B').text('cadence'), 'daily');
    assert.equal(thymer.recordByTitle('Notes', 'A').text('url'), 'https://example.invalid/a');
    assert.equal(report.counts.valuesCleared, 1);
});
