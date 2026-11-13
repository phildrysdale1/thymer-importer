// Regression tests for the self-review that followed the third review round: every re-import path was checked for silent
// data loss or silent overwrite when a source changes between exports. Each "finding" below was reproduced first and fails
// on the code before its fix (run with PLUGIN_JS=<older plugin.js> to check); tests titled "guard" pass either way and
// pin behaviour; tests titled "left alone" pin a documented limit (readme-changelog.md, "Review fixes (round 3)").
// Synthetic fixtures only.
process.env.TZ = 'America/Chicago';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engine, fast, memoryFiles, note, inMemory, DB_ID, STEM, fieldIds, labelOf, typeOf, runNotion, runTolaria, fakeDom } from './lib/round3.mjs';

/** Runs the reconciliation alone: plan fields [id, label, extra?] against persisted fields [id, label, extra?] -> the ids the plan fields end up with. */
function reconcile(planFields, persistedFields) {
    const { p } = engine();
    const def = { key: 'c', name: 'C', fields: planFields.map(([id, label, extra]) => ({ id, label, type: 'text', ...(extra || {}) })) };
    const plan = { version: 1, collections: [def], records: [], links: [], assets: [], journal: [] };
    const ctx = { plan, report: { remappedFields: [], counts: { fieldsRemapped: 0 } } };
    const entry = { def, api: { getConfiguration: () => ({ fields: [{ id: 'source_path', label: 'Source Path', type: 'text' }, ...persistedFields.map(([id, label, extra]) => ({ id, label, type: 'text', active: true, ...(extra || {}) }))] }) } };
    p._planReconcileFieldIds(ctx, entry);
    return entry.def.fields.map(f => f.id);
}

// ---- reconciliation ------------------------------------------------------------------------------------

test('finding S1: a label written exactly as a persisted field is matched before one that only differs in case', async () => {
    const ctx = engine();
    await runNotion(ctx, 'Name,Status,status\nDrill,Open,mine\nSaw,Closed,yours\n');
    assert.deepEqual(fieldIds(ctx.thymer, 'Gear'), ['source_path', 'status', 'status_2']);
    // the next export has only "status": it is the field labelled "status", not the one labelled "Status"
    const { report } = await runNotion(ctx, 'Name,status\nDrill,new1\nSaw,new2\n');
    const drill = ctx.thymer.recordByTitle('Gear', 'Drill');
    assert.deepEqual(drill.prop('status').values(), ['Open'], 'the Status field is untouched');
    assert.deepEqual(drill.prop('status_2').values(), ['new1']);
    assert.deepEqual(report.warnings, []);
    assert.equal(fieldIds(ctx.thymer, 'Gear').length, 3, 'no new field');
});

test('finding S1: reconciliation table, steps in order (as written, then case-insensitive, then separators)', () => {
    assert.deepEqual(reconcile([['status', 'status']], [['status', 'Status'], ['status_2', 'status']]), ['status_2'], 'as written beats the same id');
    assert.deepEqual(reconcile([['status', 'Status']], [['status', 'Status'], ['status_2', 'status']]), ['status']);
    assert.deepEqual(reconcile([['x', 'STATUS']], [['status', 'Status'], ['status_2', 'Other']]), ['status'], 'case-insensitive when only one reads alike');
    assert.deepEqual(reconcile([['x', 'STATUS']], [['status', 'Status'], ['status_2', 'status']]), ['x'], 'two persisted fields read alike and none is written alike: a tie, so new');
});

test('finding S2: a column called "Created" is not matched to the read-only built-in created_at (its values would be dropped)', async () => {
    const ctx = engine();
    await runNotion(ctx, 'Name,Size\nDrill,Big\n');
    ctx.thymer.collection('Gear').config.fields.push({ id: 'created_at', label: 'Created', type: 'datetime', icon: 'ti-x', many: false, read_only: true, active: true });
    const { report } = await runNotion(ctx, 'Name,Size,Created\nDrill,Big,"March 1, 2026"\n');
    assert.deepEqual(fieldIds(ctx.thymer, 'Gear'), ['source_path', 'size', 'created_at', 'created'], 'the column got a field of its own');
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Drill').prop('created').values(), [{ d: '20260301' }]);
    assert.equal(ctx.thymer.recordByTitle('Gear', 'Drill').prop('created_at').count(), 0, 'the built-in field is not written');
    assert.deepEqual(report.warnings, []);
    // table: read-only and system fields are never candidates, a plain writable field with the same label is
    assert.deepEqual(reconcile([['created', 'Created']], [['created_at', 'Created', { read_only: true }]]), ['created']);
    assert.deepEqual(reconcile([['made', 'Updated']], [['updated_at', 'Updated']]), ['made'], 'built-in ids too, even when not flagged read-only');
    assert.deepEqual(reconcile([['made', 'Made']], [['made_on', 'Made']]), ['made_on']);
});

test('finding S3: a field archived in Thymer is not written to, not brought back, and the warning says why', async () => {
    const ctx = engine();
    await runNotion(ctx, 'Name,Size\nDrill,Big\n');
    ctx.thymer.collection('Gear').config.fields.find(f => f.id === 'size').active = false;
    const { report } = await runNotion(ctx, 'Name,Size\nDrill,Huge\n');
    assert.deepEqual(report.warnings.map(w => [w.code, w.field]), [['property-not-set', 'size']]);
    assert.match(report.warnings[0].message, /archived in Thymer/);
    assert.deepEqual(fieldIds(ctx.thymer, 'Gear'), ['source_path', 'size'], 'no second field');
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Drill')._values.get('size'), ['Big'], 'the archived data is untouched');
});

test('finding S4: Tolaria keys that read alike keep their own labels, so a third one cannot shift ids onto the wrong field', async () => {
    const { p } = engine();
    const plan = await p.parseTolariaVault(memoryFiles({ 'v/a.md': note('cost x: 1\nCost_x: 2\nStatus: open', 'A') }));
    assert.deepEqual(plan.collections[0].fields.map(f => f.label).sort(), ['Cost_x', 'Status', 'cost x'], 'the colliding pair keeps its spelling; ordinary keys are unchanged');

    const ctx = engine();
    await runTolaria(ctx, { 'v/a.md': note('cost x: one\nCost_x: two', 'A') });
    const stored = (title) => Object.fromEntries([...ctx.thymer.recordByTitle('Notes', title)._values.entries()].filter(([k, v]) => k !== 'source_path' && v.length).map(([k, v]) => [labelOf(ctx.thymer, 'Notes', k), v[0]]));
    assert.deepEqual(stored('A'), { 'cost x': 'one', 'Cost_x': 'two' });
    // "cost-x" sorts between the two, so the parser now allocates cost_x_2 to it and cost_x_3 to Cost_x: with one shared label
    // ("Cost X") the persisted cost_x_2 would have been taken over by the new key
    const { report } = await runTolaria(ctx, { 'v/a.md': note('cost x: one\nCost_x: two\ncost-x: three', 'A') });
    assert.deepEqual(stored('A'), { 'cost x': 'one', 'Cost_x': 'two', 'cost-x': 'three' }, 'every key kept its own field and its own value');
    assert.deepEqual(report.warnings, []);
    assert.equal(fieldIds(ctx.thymer, 'Notes').length, 4);
});

// ---- value shaping on the way in --------------------------------------------------------------------------

test('finding S5: a number column is a number only when no digit is lost: leading zeros and 16+ digit ids stay text', async () => {
    const ctx = engine();
    const { plan } = await runNotion(ctx, 'Name,Code,Id,Qty,Neg,Frac,Zero\nDrill,007,12345678901234567,1,-3,0.5,0\nSaw,008,12345678901234568,2,4,1.25,0\n');
    const types = Object.fromEntries(plan.collections[0].fields.map(f => [f.id, f.type]));
    assert.deepEqual(types, { code: 'text', id: 'text', qty: 'number', neg: 'number', frac: 'number', zero: 'number' });
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Drill').prop('code').values(), ['007']);
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Drill').prop('id').values(), ['12345678901234567']);
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Drill').prop('frac').values(), [0.5]);
    // Tolaria has the same rule
    const { p } = engine();
    const t = await p.parseTolariaVault(memoryFiles({ 'v/a.md': note('code: 007\nbig: 12345678901234567\nqty: 4', 'A') }));
    assert.deepEqual(Object.fromEntries(t.collections[0].fields.map(f => [f.id, f.type])), { code: 'text', big: 'text', qty: 'number' });
});

test('finding S5: a persisted number field refuses a value with more digits than it keeps, and keeps the old number', async () => {
    const ctx = engine();
    await runNotion(ctx, 'Name,Qty\nDrill,5\nSaw,6\n');
    assert.equal(typeOf(ctx.thymer, 'Gear', 'qty'), 'number');
    const { report } = await runNotion(ctx, 'Name,Qty\nDrill,12345678901234567\nSaw,123456789012345\n');
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Drill').prop('qty').values(), [5], 'not rounded to 12345678901234568');
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Saw').prop('qty').values(), [123456789012345], '15 digits are exact');
    assert.deepEqual(report.warnings.map(w => w.code), ['property-not-set']);
    assert.match(report.warnings[0].message, /more digits than a number field keeps exactly/);
});

test('finding S6: a date that is not on the calendar makes a text column, not a date column that drops its values', async () => {
    const ctx = engine();
    const { plan, report } = await runNotion(ctx, 'Name,Due\nDrill,"February 30, 2026"\nSaw,"March 1, 2026"\n');
    assert.equal(plan.collections[0].fields[0].type, 'text');
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Drill').prop('due').values(), ['February 30, 2026']);
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Saw').prop('due').values(), ['March 1, 2026']);
    assert.deepEqual(report.warnings, []);
    // Tolaria: the same, and a real date key is still a date
    const t = engine();
    const tolaria = await runTolaria(t, { 'v/a.md': note('due: 2026-13-45\nwhen: 2026-03-01', 'A') });
    assert.deepEqual(Object.fromEntries(tolaria.plan.collections[0].fields.map(f => [f.id, f.type])), { due: 'text', when: 'datetime' });
    assert.deepEqual(t.thymer.recordByTitle('Notes', 'A').prop('due').values(), ['2026-13-45']);
    assert.deepEqual(t.thymer.recordByTitle('Notes', 'A').prop('when').values(), [{ d: '20260301' }]);
    assert.deepEqual(tolaria.report.warnings, []);
    // times: 25:00 is not a time
    const bad = engine();
    const b = await runNotion(bad, 'Name,At\nDrill,"March 1, 2026 25:00"\n');
    assert.equal(b.plan.collections[0].fields[0].type, 'text');
});

// ---- clearing -----------------------------------------------------------------------------------------------

test('finding S7: a relation column that is empty everywhere also clears the "(text)" companion it had', async () => {
    const ctx = engine();
    const A = 'aaaa1111aaaa1111aaaa1111aaaa1111';
    const Z = 'cccc3333cccc3333cccc3333cccc3333';
    const boards = `e_ExportBlock-1/Boards ${DB_ID}`;
    const caps = 'e_ExportBlock-2/Caps 99933016139844f5dc950ed83f95f548';
    const url = (t, id) => `https://www.notion.so/${t}-${id}`;
    const base = { [`${caps}.csv`]: 'Name\nOne\n', [`${caps}/One ${A}.md`]: '# One\n\nBody.\n' };
    await ctx.p.applyImportPlan(ctx.p._notionBuildPlan(inMemory({ ...base, [`${boards}.csv`]: `Name,Caps\nBoardy,"${url('One', A)}, ${url('Gone', Z)}"\n` })), fast);
    ctx.thymer.settle();
    const boardy = ctx.thymer.recordByTitle('Boards', 'Boardy');
    assert.equal(boardy.linkedRecords('caps').length, 1);
    assert.equal(boardy.prop('caps_text').count(), 1);
    const report = await ctx.p.applyImportPlan(ctx.p._notionBuildPlan(inMemory({ ...base, [`${boards}.csv`]: 'Name,Caps\nBoardy,\n' })), fast);
    ctx.thymer.settle();
    assert.equal(boardy.linkedRecords('caps').length, 0, 'the relation is cleared');
    assert.equal(boardy.prop('caps_text').count(), 0, 'and so is its companion text');
    assert.equal(report.counts.valuesCleared, 2);
    assert.deepEqual(report.warnings, []);
});

test('guard, finding S8: clearing never touches a field of a type an import does not write (a file, image or user field)', async () => {
    const ctx = engine();
    await runNotion(ctx, 'Name,Photo\nDrill,x\n');
    const cfg = ctx.thymer.collection('Gear').config;
    cfg.fields.find(f => f.id === 'photo').type = 'file';   // the user changed the field's type in Thymer
    ctx.thymer.recordByTitle('Gear', 'Drill').prop('photo')._values = ['blob-guid'];
    const { report } = await runNotion(ctx, 'Name,Photo\nDrill,\n');
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Drill')._values.get('photo'), ['blob-guid']);
    assert.equal(report.counts.valuesCleared, 0);
});

// ---- plan problems that used to be silent --------------------------------------------------------------------

test('finding S9: two records whose source paths differ only by case are reported (the second would overwrite the first)', async () => {
    const ctx = engine();
    const plan = await ctx.p.parseTolariaVault(memoryFiles({ 'v/Alpha.md': note('status: a', 'One'), 'v/alpha.md': note('status: b', 'Two') }));
    const problems = ctx.p.validateImportPlan(plan);
    assert.deepEqual(problems.map(x => x.code), ['duplicate-source-path']);
    assert.match(problems[0].message, /Alpha\.md|alpha\.md/);
    const report = await ctx.p.applyImportPlan(plan, fast);
    assert.deepEqual(report.warnings.map(w => w.code), ['duplicate-source-path']);
    // different collections are fine
    const other = ctx.p.createImportPlan('x');
    other.collections.push({ key: 'a', name: 'A', fields: [] }, { key: 'b', name: 'B', fields: [] });
    other.records.push({ key: '1', collection: 'a', title: 'T', sourcePath: 'p.md', values: {}, body: '' }, { key: '2', collection: 'b', title: 'T', sourcePath: 'P.md', values: {}, body: '' });
    assert.deepEqual(ctx.p.validateImportPlan(other), []);
});

test('finding S10: a note that has "Status" and "status" says so (only the first is kept), and the dialog flags it', async () => {
    const ctx = engine();
    const typeDoc = { 'v/task.md': '---\ntype: Type\n---\n# Task\n' };
    const files = { ...typeDoc, 'v/a.md': note('type: Task\nStatus: open\nstatus: closed', 'Alpha') };
    const plan = await ctx.p.parseTolariaVault(memoryFiles(files));
    assert.equal(plan.parseReport.warnings.length, 1);
    assert.match(plan.parseReport.warnings[0], /a\.md: the key "status" is a second spelling/);
    const dom = fakeDom();
    globalThis.document = dom.document;
    try {
        const origApply = ctx.p.applyImportPlan.bind(ctx.p);
        ctx.p.applyImportPlan = (pl, opts) => origApply(pl, { ...opts, ...fast });
        await ctx.p.performTolariaImport(dom.dialog, {}, memoryFiles(files));
        assert.match(dom.statusText(), /^Finished with warnings[\s\S]*reading \(1\)/);
    } finally {
        delete globalThis.document;
    }
});

// ---- left alone: documented limits (what a source cannot tell us) --------------------------------------------

test('left alone: a Notion column renamed in the export is a new column (the old field keeps its old values)', async () => {
    const ctx = engine();
    await runNotion(ctx, 'Name,Status\nDrill,Open\n');
    const { report } = await runNotion(ctx, 'Name,State\nDrill,Open\n');
    assert.deepEqual(fieldIds(ctx.thymer, 'Gear'), ['source_path', 'status', 'state']);
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Drill').prop('status').values(), ['Open'], 'nothing is deleted');
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Drill').prop('state').values(), ['Open']);
    assert.deepEqual(report.warnings, []);
});

test('left alone: a row that is gone from the export stays in Thymer (an import never deletes records)', async () => {
    const ctx = engine();
    await runNotion(ctx, 'Name,Size\nDrill,Big\nSaw,Small\n');
    const { report } = await runNotion(ctx, 'Name,Size\nDrill,Big\n');
    assert.ok(ctx.thymer.recordByTitle('Gear', 'Saw'));
    assert.equal(report.counts.recordsCreated, 0);
});

test('left alone: a Tolaria note that moves to another path is a new record (a vault has no stable ids)', async () => {
    const ctx = engine();
    const anchor = { 'v/anchor.md': note('status: open', 'Anchor') };
    await runTolaria(ctx, { ...anchor, 'v/a.md': note('status: open', 'Alpha') });
    const { report } = await runTolaria(ctx, { ...anchor, 'v/sub/a.md': note('status: open', 'Alpha') });
    assert.equal(report.counts.recordsCreated, 1);
    assert.equal((await ctx.thymer.collection('Notes').getAllRecords()).length, 3, 'the old Alpha stays');
});

test('left alone: a choice option archived in Thymer is not brought back; values that need it are warned about each time', async () => {
    const ctx = engine();
    await runNotion(ctx, 'Name,Tag\nA,Red\nB,Red\nC,Blue\nD,Blue\n');
    const tag = ctx.thymer.collection('Gear').config.fields.find(f => f.id === 'tag');
    assert.equal(tag.type, 'choice');
    tag.choices.find(c => c.label === 'Blue').active = false;
    const { report } = await runNotion(ctx, 'Name,Tag\nA,Red\nB,Red\nC,Blue\nD,Blue\n');
    assert.equal(report.warnings.length, 2);
    assert.match(report.warnings[0].message, /no option "Blue"/);
});

test('left alone: a property you edited in Thymer is replaced by the source on re-import (the source is the truth)', async () => {
    const ctx = engine();
    await runNotion(ctx, 'Name,Size\nDrill,Big\n');
    ctx.thymer.recordByTitle('Gear', 'Drill').prop('size').set('my edit');
    ctx.thymer.settle();
    await runNotion(ctx, 'Name,Size\nDrill,Big\n');
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Drill').prop('size').values(), ['Big']);
});

test('left alone: rows without a page that share a title are matched by their order in the csv', async () => {
    const ctx = engine();
    await runNotion(ctx, 'Name,Size\nUntitled,1\nUntitled,2\n');
    const { plan } = await runNotion(ctx, 'Name,Size\nUntitled,2\nUntitled,1\n');
    assert.deepEqual(plan.records.map(r => r.sourcePath.split('/').pop()), ['Untitled', 'Untitled#2']);
    // the first csv row of each export is "Untitled": its values replace the first record's
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Untitled').prop('size').values(), [2]);
});
