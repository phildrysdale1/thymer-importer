// applyImportPlan() against the in-memory Thymer fake. All data here is synthetic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newPlugin } from './lib/load-plugin.mjs';
import { FakeThymer, FakeDateTime } from './lib/fake-thymer.mjs';

const fast = { sleep: async () => {} };
const PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

function setup(thymerOpts) {
    const thymer = new FakeThymer(thymerOpts);
    const plugin = newPlugin({ DateTime: FakeDateTime });
    plugin.data = thymer.data;
    return { thymer, plugin };
}

/**
 * Synthetic plan: Projects (choice, url, number, datetime, single self-reference, many reference to Notes)
 * and Notes (many reference back to Projects). Exercises forward + backward links, an unresolved link,
 * a multi-value reference and an asset.
 */
function samplePlan(plugin, { extra } = {}) {
    const plan = plugin.createImportPlan('synthetic');
    plan.collections.push(
        {
            key: 'projects', name: 'Projects', icon: 'ti-folder', description: 'Synthetic projects',
            fields: [
                { id: 'status', label: 'Status', type: 'choice', choices: ['Active', 'Done'] },
                { id: 'url', label: 'URL', type: 'url' },
                { id: 'effort', label: 'Effort', type: 'number' },
                { id: 'due', label: 'Due', type: 'datetime' },
                { id: 'belongs_to', label: 'Belongs to', type: 'record', target: 'projects' },
                { id: 'related_to', label: 'Related to', type: 'record', many: true, target: 'notes' }
            ]
        },
        {
            key: 'notes', name: 'Notes', icon: 'ti-note', description: 'Synthetic notes',
            fields: [{ id: 'related_to', label: 'Related to', type: 'record', many: true, target: 'projects' }]
        }
    );

    const p1 = { key: 'p1', collection: 'projects', title: 'Alpha Project', sourcePath: 'projects/alpha-project.md', values: { status: 'Active', url: 'https://example.invalid/a', effort: 3, due: '2026-01-15' } };
    const p2 = { key: 'p2', collection: 'projects', title: 'Beta Project', sourcePath: 'projects/beta-project.md', values: { status: 'Done' } };
    const n1 = { key: 'n1', collection: 'notes', title: 'Meeting Notes', sourcePath: 'notes/meeting-notes.md', values: {} };
    const n2 = { key: 'n2', collection: 'notes', title: 'Ideas', sourcePath: 'notes/ideas.md', values: {} };
    plan.records.push(p1, p2, n1, n2);

    // forward link (project -> note), unresolved link, and an asset
    const fwd = plugin.planBodyLink(plan, 'p1', { ref: 'meeting-notes' });
    const ghost = plugin.planBodyLink(plan, 'p1', { ref: 'ghost-page' }, { raw: '[[ghost-page]]' });
    const img = plugin.planAsset(plan, 'p1', { sourcePath: 'attachments/diagram.png', name: 'diagram.png', raw: '![](attachments/diagram.png)', readBytes: async () => PNG });
    p1.body = `# Overview\nSee ${fwd} and ${ghost}.\n${img}\nTail line`;

    // backward link (note -> project), with a custom label
    const back = plugin.planBodyLink(plan, 'n1', { ref: 'alpha-project' }, { label: 'Alpha' });
    n1.body = `Back to ${back} here.`;

    // reference properties: many (two resolved + one unresolved + a duplicate), single, and note -> project
    plugin.planPropertyLink(plan, 'p1', 'related_to', { ref: 'meeting-notes' });
    plugin.planPropertyLink(plan, 'p1', 'related_to', { ref: 'ideas' });
    plugin.planPropertyLink(plan, 'p1', 'related_to', { ref: 'meeting-notes' });
    plugin.planPropertyLink(plan, 'p1', 'related_to', { ref: 'no-such-note' });
    plugin.planPropertyLink(plan, 'p2', 'belongs_to', { ref: 'alpha-project' });
    plugin.planPropertyLink(plan, 'n2', 'related_to', { ref: 'beta-project' });
    p1.body ||= '';
    n2.body = '';
    p2.body = '- first\n- second';
    if (extra) extra(plan);
    return plan;
}

const refs = (item) => item.segments.filter(s => s.type === 'ref');
const lineWith = (dump, rec, needle) => dump.find(r => r.title === rec).items.find(i => i.text.includes(needle));

test('creates a new collection with icon, description, typed fields, choices and record targets', async () => {
    const { thymer, plugin } = setup();
    const report = await plugin.applyImportPlan(samplePlan(plugin), fast);

    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.warnings, []);
    assert.equal(report.counts.collectionsCreated, 2);
    assert.equal(report.counts.collectionsUpdated, 0);

    const projects = thymer.collection('Projects');
    const notes = thymer.collection('Notes');
    const cfg = projects.getConfiguration();
    assert.equal(cfg.icon, 'ti-folder');
    assert.equal(cfg.description, 'Synthetic projects');
    assert.deepEqual(cfg.fields.map(f => f.id), ['source_path', 'status', 'url', 'effort', 'due', 'belongs_to', 'related_to']);

    const byId = Object.fromEntries(cfg.fields.map(f => [f.id, f]));
    assert.equal(byId.source_path.read_only, true);
    assert.deepEqual(byId.status.choices.map(c => c.label), ['Active', 'Done']);
    assert.ok(byId.status.choices.every(c => c.active === true && typeof c.color === 'string'));
    assert.equal(byId.url.type, 'url');
    assert.equal(byId.belongs_to.type, 'record');
    assert.equal(byId.belongs_to.many, false);
    assert.equal(byId.belongs_to.filter_colguid, projects.getGuid(), 'self reference filters on its own collection');
    assert.equal(byId.related_to.many, true);
    assert.equal(byId.related_to.filter_colguid, notes.getGuid(), 'reference to a collection created in the same run');
    assert.equal(notes.getConfiguration().fields.find(f => f.id === 'related_to').filter_colguid, projects.getGuid());

    const alpha = thymer.recordByTitle('Projects', 'Alpha Project');
    assert.equal(alpha.text('source_path'), 'projects/alpha-project.md');
    assert.equal(alpha.text('url'), 'https://example.invalid/a');
    assert.equal(alpha.number('effort'), 3);
    assert.equal(alpha.prop('status').choiceLabel(), 'Active');
    assert.equal(alpha.prop('due').values()[0].d, '20260115');
    assert.equal(report.counts.recordsCreated, 4);
});

test('choice options are collected from record values when the plan does not declare them', async () => {
    const { thymer, plugin } = setup();
    const plan = plugin.createImportPlan('t');
    plan.collections.push({ key: 'c', name: 'C', icon: 'ti-x', description: '', fields: [{ id: 'kind', label: 'Kind', type: 'choice' }, { id: 'tags', label: 'Tags', type: 'choice', many: true }] });
    plan.records.push(
        { key: 'a', collection: 'c', title: 'A', sourcePath: 'a.md', values: { kind: 'Red', tags: ['x', 'y'] }, body: '' },
        { key: 'b', collection: 'c', title: 'B', sourcePath: 'b.md', values: { kind: 'blue', tags: ['y', 'z'] }, body: '' }
    );
    const report = await plugin.applyImportPlan(plan, fast);
    assert.deepEqual(report.errors, []);
    const cfg = thymer.collection('C').getConfiguration();
    assert.deepEqual(cfg.fields.find(f => f.id === 'kind').choices.map(c => c.label), ['Red', 'blue']);
    assert.deepEqual(cfg.fields.find(f => f.id === 'tags').choices.map(c => c.label), ['x', 'y', 'z']);
    assert.deepEqual(thymer.recordByTitle('C', 'A').prop('tags').selectedChoiceLabels(), ['x', 'y']);
    assert.equal(report.warnings.length, 0);
});

test('re-import dedupes by source_path: updates in place, no duplicate records, bodies or fields', async () => {
    const { thymer, plugin } = setup();
    await plugin.applyImportPlan(samplePlan(plugin), fast);
    const before = Array.from(thymer.records.keys());
    const bodyBefore = (await thymer.dump('Projects')).map(r => r.items.length);

    const plan2 = samplePlan(plugin);
    plan2.records[0].values.status = 'Done';
    plan2.records[0].values.effort = 5;
    plan2.collections[0].fields.push({ id: 'owner', label: 'Owner', type: 'text' });
    plan2.records[0].values.owner = 'me';
    const report = await plugin.applyImportPlan(plan2, fast);

    assert.deepEqual(report.errors, []);
    assert.equal(report.counts.recordsCreated, 0);
    assert.equal(report.counts.recordsUpdated, 4);
    assert.equal(report.counts.collectionsCreated, 0);
    assert.equal(report.counts.collectionsUpdated, 2);
    assert.deepEqual(Array.from(thymer.records.keys()), before, 'same record guids, none added');
    assert.equal(thymer.collections.length, 2);

    assert.deepEqual((await thymer.dump('Projects')).map(r => r.items.length), bodyBefore, 'bodies replaced, not appended');
    const alpha = thymer.recordByTitle('Projects', 'Alpha Project');
    assert.equal(alpha.prop('status').choiceLabel(), 'Done');
    assert.equal(alpha.number('effort'), 5);
    assert.equal(alpha.text('owner'), 'me');

    const cfg = thymer.collection('Projects').getConfiguration();
    assert.equal(cfg.fields.filter(f => f.id === 'status').length, 1);
    assert.deepEqual(cfg.fields.map(f => f.id).slice(-1), ['owner'], 'new field appended to existing collection');

    // links survive the second run (re-resolved, not doubled)
    const dump = await thymer.dump('Projects');
    assert.equal(refs(lineWith(dump, 'Alpha Project', 'See')).length, 1);
    assert.equal(thymer.recordByTitle('Projects', 'Alpha Project').linkedRecords('related_to').length, 2);
});

test('re-import adopts an existing record with the same title and no source_path, once', async () => {
    const { thymer, plugin } = setup();
    const mk = (sourcePath, n) => {
        const plan = plugin.createImportPlan('t');
        plan.collections.push({ key: 'c', name: 'C', icon: 'ti-x', description: '', fields: [] });
        for (let i = 0; i < n; i++) plan.records.push({ key: `k${i}`, collection: 'c', title: 'Same', sourcePath: sourcePath(i), values: {}, body: '' });
        return plan;
    };
    await plugin.applyImportPlan(mk(() => '', 1), fast);
    const guid = thymer.recordByTitle('C', 'Same').guid;

    const report = await plugin.applyImportPlan(mk(i => `dir${i}/same.md`, 2), fast);
    assert.equal(report.counts.recordsUpdated, 1, 'first same-titled file adopts the path-less record');
    assert.equal(report.counts.recordsCreated, 1, 'second same-titled file is a different record');
    assert.equal(thymer.recordByTitle('C', 'Same').guid, guid);
    assert.equal(thymer.records.size, 2);
});

test('existing: "skip" leaves records that are already imported alone but still binds them for links', async () => {
    const { thymer, plugin } = setup();
    await plugin.applyImportPlan(samplePlan(plugin), fast);
    const plan2 = samplePlan(plugin);
    plan2.records[0].values.effort = 99;
    const report = await plugin.applyImportPlan(plan2, { ...fast, existing: 'skip' });
    assert.equal(report.counts.recordsSkipped, 4);
    assert.equal(report.counts.recordsUpdated, 0);
    assert.equal(thymer.recordByTitle('Projects', 'Alpha Project').number('effort'), 3);
});

test('forward and backward body links become ref segments with the documented { guid } shape', async () => {
    const { thymer, plugin } = setup();
    const report = await plugin.applyImportPlan(samplePlan(plugin), fast);
    const dump = await thymer.dump('Projects');
    const notesDump = await thymer.dump('Notes');
    const alpha = thymer.recordByTitle('Projects', 'Alpha Project');
    const meeting = thymer.recordByTitle('Notes', 'Meeting Notes');

    const forward = lineWith(dump, 'Alpha Project', 'See');
    assert.equal(refs(forward).length, 1);
    assert.deepEqual(refs(forward)[0].text, { guid: meeting.guid });
    assert.equal(forward.text.includes('⟦'), false, 'no placeholder left behind');

    const backward = lineWith(notesDump, 'Meeting Notes', 'Back to');
    assert.deepEqual(refs(backward)[0].text, { guid: alpha.guid, title: 'Alpha' });
    assert.deepEqual(backward.segments.map(s => s.type), ['text', 'ref', 'text']);
    assert.equal(backward.segments[0].text, 'Back to ');
    assert.equal(backward.segments[2].text, ' here.');

    assert.equal(report.counts.linksResolved, 7, '9 links, 2 unresolved');
    assert.equal(thymer.rejected.length, 0);
});

test('an unresolved link keeps its original text and is reported, without failing the import', async () => {
    const { thymer, plugin } = setup();
    const report = await plugin.applyImportPlan(samplePlan(plugin), fast);

    assert.deepEqual(report.errors, []);
    const dump = await thymer.dump('Projects');
    const line = lineWith(dump, 'Alpha Project', 'See');
    assert.match(line.text, /\[\[ghost-page\]\]/);
    assert.equal(refs(line).length, 1, 'the resolvable link next to it is still linked');

    assert.equal(report.counts.linksUnresolved, 2);
    const byRef = Object.fromEntries(report.unresolvedLinks.map(u => [u.ref, u]));
    assert.equal(byRef['ghost-page'].where, 'body');
    assert.equal(byRef['ghost-page'].reason, 'not-found');
    assert.equal(byRef['ghost-page'].fromTitle, 'Alpha Project');
    assert.equal(byRef['no-such-note'].where, 'property');
    assert.equal(byRef['no-such-note'].field, 'related_to');
});

test('ambiguous targets stay text and are reported with their candidates', async () => {
    const { thymer, plugin } = setup();
    const plan = plugin.createImportPlan('t');
    plan.collections.push({ key: 'a', name: 'A', icon: 'ti-x', description: '', fields: [] }, { key: 'b', name: 'B', icon: 'ti-x', description: '', fields: [] });
    plan.records.push(
        { key: 'a1', collection: 'a', title: 'Dup', sourcePath: 'a/dup.md', values: {}, body: '' },
        { key: 'b1', collection: 'b', title: 'Dup', sourcePath: 'b/dup.md', values: {}, body: '' },
        { key: 'a2', collection: 'a', title: 'Source', sourcePath: 'a/source.md', values: {}, body: '' },
        { key: 'c1', collection: 'a', title: 'Other', sourcePath: 'other.md', values: {}, body: '' }
    );
    plan.records[2].body = `x ${plugin.planBodyLink(plan, 'a2', { ref: 'dup' }, { raw: '[[dup]]' })}`; // same collection as a1 -> resolves
    plan.records[3].body = `y ${plugin.planBodyLink(plan, 'c1', { ref: 'dup' }, { raw: '[[dup]]' })}`;  // collection a again
    plan.records.push({ key: 'z', collection: 'b', title: 'Z', sourcePath: 'z.md', values: {}, body: '' });
    plan.records[4].body = `z ${plugin.planBodyLink(plan, 'z', { ref: 'nothing' })}`;
    const report = await plugin.applyImportPlan(plan, fast);
    assert.deepEqual(report.errors, []);
    assert.equal(refs(lineWith(await thymer.dump('A'), 'Source', 'x')).length, 1, 'same-collection candidate wins the tie-break');
    assert.equal(report.unresolvedLinks.length, 1);
    assert.equal(report.unresolvedLinks[0].reason, 'not-found');
});

test('multi-value reference property: ordered, de-duplicated, unresolved values dropped and reported', async () => {
    const { thymer, plugin } = setup();
    const report = await plugin.applyImportPlan(samplePlan(plugin), fast);
    const alpha = thymer.recordByTitle('Projects', 'Alpha Project');
    const meeting = thymer.recordByTitle('Notes', 'Meeting Notes');
    const ideas = thymer.recordByTitle('Notes', 'Ideas');

    assert.equal(alpha.prop('related_to').isMultiValue(), true);
    assert.deepEqual(alpha.prop('related_to').values(), [meeting.guid, ideas.guid]);
    assert.deepEqual(alpha.linkedRecords('related_to').map(r => r.getName()), ['Meeting Notes', 'Ideas']);

    // single-value reference, and a many-field on the other collection
    assert.equal(thymer.recordByTitle('Projects', 'Beta Project').linkedRecord('belongs_to').guid, alpha.guid);
    assert.deepEqual(ideas.prop('related_to').values(), [thymer.recordByTitle('Projects', 'Beta Project').guid]);
    assert.equal(report.warnings.length, 0);
});

test('a single-value field given several links keeps the first and warns', async () => {
    const { thymer, plugin } = setup();
    const report = await plugin.applyImportPlan(samplePlan(plugin, {
        extra: (plan) => {
            plugin.planPropertyLink(plan, 'p2', 'belongs_to', { ref: 'beta-project' });
        }
    }), fast);
    assert.equal(thymer.recordByTitle('Projects', 'Beta Project').linkedRecord('belongs_to').getName(), 'Alpha Project');
    assert.deepEqual(report.warnings.map(w => w.code), ['extra-values-dropped']);
});

test('assets: uploaded once, image line item inserted after the referencing line, placeholder removed', async () => {
    const { thymer, plugin } = setup();
    const report = await plugin.applyImportPlan(samplePlan(plugin), fast);
    assert.deepEqual(report.errors, []);
    assert.equal(report.counts.assetsUploaded, 1);
    assert.equal(report.counts.assetsFailed, 0);
    assert.equal(thymer.blobs.size, 1);

    const blob = Array.from(thymer.blobs.values())[0];
    assert.equal(blob.fileName, 'diagram.png');
    assert.equal(blob.contentType, 'image/png');
    assert.deepEqual(new Uint8Array(await blob.download()), PNG);

    const items = (await thymer.dump('Projects')).find(r => r.title === 'Alpha Project').items;
    assert.deepEqual(items.map(i => i.type), ['heading', 'text', 'image', 'text'], 'placeholder line replaced by the image, order preserved');
    assert.equal(items[2].props.fileguid, blob.guid);
    assert.equal(items[2].props.filename, 'diagram.png');
    assert.equal(items.some(i => i.text.includes('⟦')), false);
    assert.equal(items[3].text, 'Tail line');
});

test('an asset used by two records is uploaded once and attached twice; non-images become file items', async () => {
    const { thymer, plugin } = setup();
    const plan = plugin.createImportPlan('t');
    plan.collections.push({ key: 'c', name: 'C', icon: 'ti-x', description: '', fields: [] });
    plan.records.push(
        { key: 'a', collection: 'c', title: 'A', sourcePath: 'a.md', values: {} },
        { key: 'b', collection: 'c', title: 'B', sourcePath: 'b.md', values: {} }
    );
    let reads = 0;
    const readBytes = async () => { reads++; return PNG; };
    plan.records[0].body = `one\n${plugin.planAsset(plan, 'a', { sourcePath: 'img/shared.png', readBytes })}\n${plugin.planAsset(plan, 'a', { sourcePath: 'docs/spec.pdf', readBytes })}`;
    plan.records[1].body = plugin.planAsset(plan, 'b', { sourcePath: 'img/shared.png', readBytes });
    const report = await plugin.applyImportPlan(plan, fast);
    assert.deepEqual(report.errors, []);
    assert.equal(report.counts.assetsUploaded, 3);
    assert.equal(thymer.blobs.size, 2);
    assert.equal(reads, 2);
    const a = (await thymer.dump('C')).find(r => r.title === 'A').items;
    assert.deepEqual(a.map(i => i.type), ['text', 'image', 'file']);
});

test('a failed upload leaves the original reference text and is reported; the rest of the record is intact', async () => {
    const { thymer, plugin } = setup();
    thymer.failUploadNames.add('diagram.png');
    const report = await plugin.applyImportPlan(samplePlan(plugin), fast);
    assert.equal(report.counts.assetsFailed, 1);
    assert.equal(report.counts.assetsUploaded, 0);
    assert.ok(report.errors.some(e => e.pass === 4 && e.asset === 'A1' && /uploadBlob returned null/.test(e.message)));
    const items = (await thymer.dump('Projects')).find(r => r.title === 'Alpha Project').items;
    assert.equal(items.find(i => i.text.includes('![](attachments/diagram.png)')).type, 'text');
    assert.equal(items.some(i => i.text.includes('⟦')), false);
    assert.equal(report.counts.linksResolved, 7, 'links are unaffected by asset failure');
});

test('an asset with no readBytes falls back to opts.readAsset, then to an error', async () => {
    const { thymer, plugin } = setup();
    const plan = plugin.createImportPlan('t');
    plan.collections.push({ key: 'c', name: 'C', icon: 'ti-x', description: '', fields: [] });
    plan.records.push({ key: 'a', collection: 'c', title: 'A', sourcePath: 'a.md', values: {} });
    plan.records[0].body = `${plugin.planAsset(plan, 'a', { sourcePath: 'x.png' })}`;
    let report = await plugin.applyImportPlan(plan, { ...fast, readAsset: async (asset) => { assert.equal(asset.sourcePath, 'x.png'); return PNG; } });
    assert.equal(report.counts.assetsUploaded, 1);

    const second = setup();
    report = await second.plugin.applyImportPlan(plan, fast);
    assert.equal(report.counts.assetsFailed, 1);
    assert.match(report.errors[0].message, /no readBytes/);
});

test('per-record failures do not stop the import; links to a failed record are reported', async () => {
    const { thymer, plugin } = setup();
    thymer.failCreateTitles.add('Meeting Notes');
    const report = await plugin.applyImportPlan(samplePlan(plugin), fast);

    assert.equal(report.counts.recordsFailed, 1);
    assert.equal(report.counts.recordsCreated, 3);
    assert.ok(report.errors.some(e => e.record === 'n1' && /createRecord returned null/.test(e.message)));

    const reasons = report.unresolvedLinks.map(u => `${u.ref}:${u.reason}`).sort();
    assert.ok(reasons.includes('meeting-notes:target-not-imported'));
    // the surviving records are fully imported
    const alpha = thymer.recordByTitle('Projects', 'Alpha Project');
    assert.deepEqual(alpha.linkedRecords('related_to').map(r => r.getName()), ['Ideas']);
    assert.match(lineWith(await thymer.dump('Projects'), 'Alpha Project', 'See').text, /meeting-notes/);
    assert.equal(report.counts.assetsUploaded, 1);
});

test('a record whose collection could not be created fails individually', async () => {
    const { thymer, plugin } = setup();
    const original = thymer.data.createCollection;
    let n = 0;
    thymer.data.createCollection = async () => (++n === 2 ? null : original());
    const report = await plugin.applyImportPlan(samplePlan(plugin), fast);
    assert.equal(report.counts.collectionsCreated, 1);
    assert.equal(report.counts.recordsCreated, 2);
    assert.equal(report.counts.recordsFailed, 2);
    assert.ok(report.errors.some(e => e.collection === 'notes'));
});

test('record creation works when getRecord() cannot see new records and getAllRecords() lags', async () => {
    const { thymer, plugin } = setup({ recordLag: 2, getRecordWorks: false });
    const report = await plugin.applyImportPlan(samplePlan(plugin), fast);
    assert.deepEqual(report.errors, []);
    assert.equal(report.counts.recordsCreated, 4);
});

test('line items are always read without expanding references (never touches other records)', async () => {
    const { thymer, plugin } = setup();
    await plugin.applyImportPlan(samplePlan(plugin), fast);
    await plugin.applyImportPlan(samplePlan(plugin), fast);
    assert.equal(thymer.expandingGetLineItems, 0);
});

test('journal entries go to the journal collection and are never overwritten on re-import', async () => {
    const { thymer, plugin } = setup();
    const journal = thymer.addJournal();
    const plan = plugin.createImportPlan('t');
    plan.journal.push({ date: '2026-03-01', markdown: '# Day one\nHello' }, { date: '2026-03-02', markdown: 'Day two' });
    let report = await plugin.applyImportPlan(plan, fast);
    assert.deepEqual(report.errors, []);
    assert.equal(report.counts.journalCreated, 2);
    const page = await journal.getJournalRecord(thymer.users[0], FakeDateTime.dateOnly(2026, 2, 1));
    assert.deepEqual((await page.getLineItems(false)).map(i => i.type), ['heading', 'text']);

    report = await plugin.applyImportPlan(plan, fast);
    assert.equal(report.counts.journalCreated, 0);
    assert.equal(report.counts.journalSkipped, 2);
    assert.equal((await page.getLineItems(false)).length, 2);

    const none = setup();
    report = await none.plugin.applyImportPlan(plan, fast);
    assert.equal(report.warnings.some(w => w.code === 'no-journal'), true);
});

test('onProgress reports the passes in order, and a throwing callback does not stop the import', async () => {
    const { plugin } = setup();
    const passes = [];
    const report = await plugin.applyImportPlan(samplePlan(plugin), {
        ...fast,
        onProgress: (p) => { passes.push(p.pass); throw new Error('ui exploded'); }
    });
    assert.deepEqual(report.errors, []);
    assert.deepEqual([...new Set(passes)], [1, 2, 3, 4]);
    assert.deepEqual([...passes].sort(), passes, 'passes never go backwards');
});

test('the plan is serializable and its placeholders are deterministic', async () => {
    const { plugin } = setup();
    const plan = samplePlan(plugin);
    const json = JSON.parse(JSON.stringify(plan));
    assert.equal(typeof plan.assets[0].readBytes, 'function');
    assert.equal('readBytes' in json.assets[0], false, 'accessors are dropped, everything else survives');
    assert.deepEqual(json.assets[0], { id: 'A1', record: 'p1', sourcePath: 'attachments/diagram.png', name: 'diagram.png', raw: '![](attachments/diagram.png)' });
    assert.deepEqual(json.links.map(l => l.id), ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9']);
    assert.deepEqual(json.links[0], { id: 'L1', from: 'p1', where: 'body', target: { ref: 'meeting-notes' } });
    assert.deepEqual(json.links[3], { id: 'L4', from: 'p1', where: 'property', field: 'related_to', target: { ref: 'meeting-notes' } });
    assert.equal(json.records[0].body.split('\n')[1], 'See ⟦link:L1⟧ and ⟦link:L2⟧.');
    // no undefined-valued keys sneak in, so deepEqual-style snapshots are stable
    assert.deepEqual(plan.links[0], json.links[0]);
});

test('validateImportPlan reports structural problems without throwing', async () => {
    const { plugin } = setup();
    const plan = plugin.createImportPlan('t');
    plan.collections.push({ key: 'c', name: 'C', fields: [{ id: 'r', label: 'R', type: 'record', target: 'missing' }, { id: 'plain', label: 'P', type: 'text' }] });
    plan.records.push(
        { key: 'a', collection: 'c', title: 'A', sourcePath: 'a.md', values: { undeclared: 1 } },
        { key: 'a', collection: 'c', title: 'A2', sourcePath: 'a2.md', values: {} },
        { key: 'o', collection: 'nope', title: 'O', sourcePath: 'o.md', values: {} }
    );
    plugin.planBodyLink(plan, 'ghost-record', 'x');
    plugin.planPropertyLink(plan, 'a', 'plain', 'x');
    plan.assets.push({ id: 'A1', record: 'nobody', sourcePath: 'x' });
    const codes = plugin.validateImportPlan(plan).map(p => p.code).sort();
    assert.deepEqual(codes, ['asset-for-unknown-record', 'duplicate-record', 'link-field-not-record', 'link-from-unknown-record', 'unknown-collection', 'unknown-field', 'unknown-target-collection'].sort());
    assert.deepEqual(plugin.validateImportPlan(null).map(p => p.code), ['bad-plan']);
    await assert.rejects(() => plugin.applyImportPlan({}), TypeError);
    // an invalid plan still imports what it can
    const { thymer, plugin: p2 } = setup();
    const report = await p2.applyImportPlan(plan, fast);
    assert.ok(report.warnings.length >= 7);
    assert.equal(report.counts.recordsFailed, 1);
    assert.ok(thymer.recordByTitle('C', 'A'));
});
