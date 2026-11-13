// Regression tests for the third round of the automated review of upstream PR #3: findings 1-3 (finding 4 is in
// review-fixes-3-warnings.test.mjs, the self-review in review-fixes-3-selfreview.test.mjs):
//   1  field labels are matched as written first, then ignoring case; separator-insensitive only when unambiguous on both sides
//   2  the plan keeps the SOURCE spelling of numbers / dates / choices; the persisted writer converts
//   3  a column that is empty everywhere (Notion) or a key that is blank everywhere (Tolaria) clears old values on re-import
// Every test failed before its fix (run with PLUGIN_JS=<older plugin.js> to check), except the ones titled "guard",
// which pass either way and only pin behaviour. Fixtures are synthetic; TZ is set west of UTC so a date written through
// setFromDate() would be a day early.
process.env.TZ = 'America/Chicago';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engine, fast, memoryFiles, note, inMemory, DB_ID, STEM, fieldsOf, fieldIds, labelOf, typeOf, runNotion, runTolaria } from './lib/round3.mjs';

// ---------------------------------------------------------------------------------------------
// Finding 1: label matching
// ---------------------------------------------------------------------------------------------

test('finding 1: "Home-URL" inserted before an imported "Home_URL" is a new field, not a takeover of the old one', async () => {
    const ctx = engine();
    await runNotion(ctx, 'Name,Home_URL\nDrill,https://example.invalid/old\n');
    assert.deepEqual(fieldIds(ctx.thymer, 'Gear'), ['source_path', 'home_url']);
    const { plan, report } = await runNotion(ctx, 'Name,Home-URL,Home_URL\nDrill,https://example.invalid/new,https://example.invalid/old\n');
    assert.deepEqual(plan.collections[0].fields.map(f => [f.id, f.label]), [['home_url', 'Home-URL'], ['home_url_2', 'Home_URL']], 'sanity: the parser gives the new column the old id');

    assert.equal(labelOf(ctx.thymer, 'Gear', 'home_url'), 'Home_URL', 'the existing field keeps its id and label');
    assert.deepEqual(fieldIds(ctx.thymer, 'Gear'), ['source_path', 'home_url', 'home_url_2']);
    assert.equal(labelOf(ctx.thymer, 'Gear', 'home_url_2'), 'Home-URL');
    const drill = ctx.thymer.recordByTitle('Gear', 'Drill');
    assert.deepEqual(drill.prop('home_url').values(), ['https://example.invalid/old'], 'Home_URL was not overwritten by the new column');
    assert.deepEqual(drill.prop('home_url_2').values(), ['https://example.invalid/new']);
    assert.deepEqual(report.warnings, []);
    assert.deepEqual(report.errors, []);

    // and the same export again changes nothing
    const again = await runNotion(ctx, 'Name,Home-URL,Home_URL\nDrill,https://example.invalid/new,https://example.invalid/old\n');
    assert.deepEqual(fieldIds(ctx.thymer, 'Gear'), ['source_path', 'home_url', 'home_url_2']);
    assert.equal(again.report.counts.recordsCreated, 0);
    assert.deepEqual(again.report.warnings, []);
});

test('finding 1: an exact label (case-insensitive) is matched before any separator-insensitive comparison', async () => {
    const ctx = engine();
    await runNotion(ctx, 'Name,Home-URL,Home_URL\nDrill,https://example.invalid/dash,https://example.invalid/under\n');
    assert.deepEqual(fieldIds(ctx.thymer, 'Gear'), ['source_path', 'home_url', 'home_url_2']);
    // the next export has only "home_url" (a case variant of Home_URL): it is the field labelled Home_URL, not Home-URL
    const { report } = await runNotion(ctx, 'Name,home_url\nDrill,https://example.invalid/changed\n');
    const drill = ctx.thymer.recordByTitle('Gear', 'Drill');
    assert.deepEqual(drill.prop('home_url_2').values(), ['https://example.invalid/changed']);
    assert.deepEqual(drill.prop('home_url').values(), ['https://example.invalid/dash'], 'the Home-URL field is not touched');
    assert.deepEqual(fieldIds(ctx.thymer, 'Gear'), ['source_path', 'home_url', 'home_url_2'], 'no new field');
    assert.deepEqual(report.warnings, []);
});

test('guard, finding 1: a lone separator variant of an existing label still matches it (unambiguous on both sides)', async () => {
    const ctx = engine();
    await runNotion(ctx, 'Name,Home_URL\nDrill,https://example.invalid/old\n');
    const { report } = await runNotion(ctx, 'Name,Home URL\nDrill,https://example.invalid/new\n');
    assert.deepEqual(fieldIds(ctx.thymer, 'Gear'), ['source_path', 'home_url'], 'no second field');
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Drill').prop('home_url').values(), ['https://example.invalid/new']);
    assert.deepEqual(report.warnings, []);
});

test('finding 1: when the persisted collection has two fields that read alike, a lone variant claims neither', async () => {
    const ctx = engine();
    await runNotion(ctx, 'Name,Home_URL,Home URL\nDrill,https://example.invalid/under,https://example.invalid/space\n');
    assert.deepEqual(fieldIds(ctx.thymer, 'Gear'), ['source_path', 'home_url', 'home_url_2']);
    const { report } = await runNotion(ctx, 'Name,Home-URL\nDrill,https://example.invalid/dash\n');
    const drill = ctx.thymer.recordByTitle('Gear', 'Drill');
    assert.deepEqual(drill.prop('home_url').values(), ['https://example.invalid/under'], 'neither existing field is overwritten');
    assert.deepEqual(drill.prop('home_url_2').values(), ['https://example.invalid/space']);
    assert.equal(fieldIds(ctx.thymer, 'Gear').length, 4, 'the Home-URL column got a field of its own');
    assert.deepEqual(report.warnings, []);
});

/** Runs the reconciliation alone: plan fields [id, label] against persisted fields [id, label] -> the ids the plan fields end up with. */
function reconcile(planFields, persistedFields) {
    const { p } = engine();
    const def = { key: 'c', name: 'C', fields: planFields.map(([id, label, extra]) => ({ id, label, type: 'text', ...(extra || {}) })) };
    const plan = { version: 1, collections: [def], records: [], links: [], assets: [], journal: [] };
    const ctx = { plan, report: { remappedFields: [], counts: { fieldsRemapped: 0 } } };
    const entry = { def, api: { getConfiguration: () => ({ fields: [{ id: 'source_path', label: 'Source Path', type: 'text' }, ...persistedFields.map(([id, label]) => ({ id, label, type: 'text', active: true }))] }) } };
    p._planReconcileFieldIds(ctx, entry);
    return entry.def.fields.map(f => f.id);
}

test('finding 1: reconciliation table (exact, case, separators, ambiguity on either side, ties)', () => {
    // exact label wins over a separator twin; the twin becomes a new field (keeping its own id: nothing uses it)
    assert.deepEqual(reconcile([['a', 'Home-URL'], ['b', 'Home_URL']], [['home_url', 'Home_URL']]), ['a', 'home_url']);
    // ...and gets a free id when its own is the existing field's
    assert.deepEqual(reconcile([['home_url', 'Home-URL'], ['home_url_2', 'Home_URL']], [['home_url', 'Home_URL']]), ['home_url_2', 'home_url']);
    // case only
    assert.deepEqual(reconcile([['x', 'STATUS']], [['status', 'Status']]), ['status']);
    // one on each side that differs only by separators: matched
    assert.deepEqual(reconcile([['x', 'Home-URL']], [['home_url', 'Home_URL']]), ['home_url']);
    assert.deepEqual(reconcile([['x', 'home   url']], [['home_url', 'Home_URL']]), ['home_url']);
    // two plan fields read alike, one persisted: ambiguous, both are new
    assert.deepEqual(reconcile([['a', 'Home-URL'], ['b', 'Home url']], [['home_url', 'Home_URL']]), ['a', 'b']);
    // one plan field, two persisted that read alike: ambiguous, new
    assert.deepEqual(reconcile([['a', 'Home-URL']], [['home_url', 'Home_URL'], ['home_url_2', 'Home URL']]), ['a']);
    // different words are never merged
    assert.deepEqual(reconcile([['a', 'Home URLs']], [['home_url', 'Home_URL']]), ['a']);
    // an exact tie between two persisted fields is not broken by position: only the same id decides
    assert.deepEqual(reconcile([['cost', 'Cost']], [['p1', 'Cost'], ['p2', 'Cost']]), ['cost']);
    assert.deepEqual(reconcile([['p2', 'Cost']], [['p1', 'Cost'], ['p2', 'Cost']]), ['p2']);
    // source_path is never claimed
    assert.deepEqual(reconcile([['sp', 'Source Path']], []), ['sp']);
});

test('guard, finding 1: Tolaria case variants (Status / status) still merge into one field and stay on the persisted one', async () => {
    const ctx = engine();
    await runTolaria(ctx, { 'v/a.md': note('Status: open', 'A') });
    const { report, plan } = await runTolaria(ctx, { 'v/a.md': note('status: open', 'A'), 'v/b.md': note('Status: closed', 'B') });
    assert.deepEqual(plan.collections[0].fields.map(f => f.id), ['status']);
    assert.deepEqual(fieldIds(ctx.thymer, 'Notes'), ['source_path', 'status']);
    assert.deepEqual(ctx.thymer.recordByTitle('Notes', 'B').prop('status').selectedChoiceLabels(), ['closed']);
    assert.deepEqual(report.warnings, []);
    assert.equal(report.counts.fieldsRemapped, 0);
});

// ---------------------------------------------------------------------------------------------
// Finding 2: the plan keeps the source spelling; the persisted writer converts
// ---------------------------------------------------------------------------------------------

test('finding 2 (Notion): a text column that re-infers as number keeps the spelling of its values (1.50 stays 1.50)', async () => {
    const ctx = engine();
    await runNotion(ctx, 'Name,Weight\nDrill,1.50\nSaw,heavy\n');
    assert.equal(typeOf(ctx.thymer, 'Gear', 'weight'), 'text');
    const { plan, report } = await runNotion(ctx, 'Name,Weight\nDrill,1.50\nSaw,2.0\n');
    assert.equal(plan.collections[0].fields[0].type, 'number', 'sanity: fresh inference is number');
    assert.deepEqual(plan.records.map(r => r.values.weight), ['1.50', '2.0'], 'the plan keeps the strings');
    assert.equal(typeOf(ctx.thymer, 'Gear', 'weight'), 'text', 'never retyped');
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Drill').prop('weight').values(), ['1.50'], 'the unchanged value is not rewritten as 1.5');
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Saw').prop('weight').values(), ['2.0']);
    assert.deepEqual(report.warnings, []);
});

test('finding 2 (Notion): a text column of codes with leading zeros keeps them, whatever the next export looks like', async () => {
    const ctx = engine();
    await runNotion(ctx, 'Name,Code\nDrill,000123\nSaw,AB123\n');
    const { plan, report } = await runNotion(ctx, 'Name,Code\nDrill,000123\nSaw,000456\n');
    assert.equal(plan.collections[0].fields[0].type, 'text', 'a value with a leading zero is a code, not a number');
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Drill').prop('code').values(), ['000123']);
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Saw').prop('code').values(), ['000456']);
    assert.deepEqual(report.warnings, []);
    // a first import creates a text field for them too
    const fresh = engine();
    await runNotion(fresh, 'Name,Code\nDrill,000123\nSaw,000456\n');
    assert.equal(typeOf(fresh.thymer, 'Gear', 'code'), 'text');
    assert.deepEqual(fresh.thymer.recordByTitle('Gear', 'Drill').prop('code').values(), ['000123']);
});

test('finding 2 (Notion): a first import that creates a number field still stores numbers', async () => {
    const ctx = engine();
    const { plan, report } = await runNotion(ctx, 'Name,Weight\nDrill,2.5\nSaw,7\n');
    assert.equal(typeOf(ctx.thymer, 'Gear', 'weight'), 'number');
    assert.deepEqual(plan.records.map(r => r.values.weight), ['2.5', '7'], 'the plan has the source text');
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Drill').prop('weight').values(), [2.5]);
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Saw').prop('weight').values(), [7]);
    assert.deepEqual(report.warnings, []);
    // and a persisted number field rejects what is not a number, leaving the old value
    const next = await runNotion(ctx, 'Name,Weight\nDrill,heavy\nSaw,7\n');
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Drill').prop('weight').values(), [2.5]);
    assert.deepEqual(next.report.warnings.map(w => w.code), ['property-not-set']);
});

test('finding 2 (Tolaria): a text key that re-infers as number keeps its spelling; a first import stores numbers', async () => {
    const ctx = engine();
    await runTolaria(ctx, { 'v/a.md': note('size: 1.50', 'A'), 'v/b.md': note('size: big', 'B') });
    assert.equal(typeOf(ctx.thymer, 'Notes', 'size'), 'text');
    const { plan, report } = await runTolaria(ctx, { 'v/a.md': note('size: 1.50', 'A'), 'v/b.md': note('size: 2.0', 'B') });
    assert.equal(plan.collections[0].fields[0].type, 'number', 'sanity: fresh inference is number');
    assert.equal(plan.records.find(r => r.title === 'A').values.size, '1.50', 'the plan keeps the string, not Number(...)');
    assert.deepEqual(ctx.thymer.recordByTitle('Notes', 'A').prop('size').values(), ['1.50']);
    assert.deepEqual(ctx.thymer.recordByTitle('Notes', 'B').prop('size').values(), ['2.0']);
    assert.deepEqual(report.warnings, []);

    const fresh = engine();
    await runTolaria(fresh, { 'v/a.md': note('effort: 3', 'A') });
    assert.equal(typeOf(fresh.thymer, 'Notes', 'effort'), 'number');
    assert.deepEqual(fresh.thymer.recordByTitle('Notes', 'A').prop('effort').values(), [3]);
});

test('finding 2 (Tolaria): a key of codes with leading zeros is text, so the zeros survive every export', async () => {
    const ctx = engine();
    await runTolaria(ctx, { 'v/a.md': note('code: 000123', 'A'), 'v/b.md': note('code: AB123', 'B') });
    const { plan, report } = await runTolaria(ctx, { 'v/a.md': note('code: 000123', 'A'), 'v/b.md': note('code: 000456', 'B') });
    assert.equal(plan.collections[0].fields[0].type, 'text');
    assert.deepEqual(ctx.thymer.recordByTitle('Notes', 'A').prop('code').values(), ['000123']);
    assert.deepEqual(ctx.thymer.recordByTitle('Notes', 'B').prop('code').values(), ['000456']);
    assert.deepEqual(report.warnings, []);
    const fresh = engine();
    await runTolaria(fresh, { 'v/a.md': note('code: 0042', 'A') });
    assert.equal(typeOf(fresh.thymer, 'Notes', 'code'), 'text', 'never a number field that would store 42');
    assert.deepEqual(fresh.thymer.recordByTitle('Notes', 'A').prop('code').values(), ['0042']);
});

test('finding 2 audit (Notion dates): a text column that re-infers as date keeps the text as written', async () => {
    const ctx = engine();
    await runNotion(ctx, 'Name,Due\nDrill,"March 1, 2026"\nSaw,soon\n');
    assert.equal(typeOf(ctx.thymer, 'Gear', 'due'), 'text');
    const { plan, report } = await runNotion(ctx, 'Name,Due\nDrill,"March 1, 2026"\nSaw,"March 2, 2026"\n');
    assert.equal(plan.collections[0].fields[0].type, 'datetime', 'sanity: fresh inference is datetime');
    assert.deepEqual(plan.records.map(r => r.values.due), ['March 1, 2026', 'March 2, 2026']);
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Drill').prop('due').values(), ['March 1, 2026'], 'not rewritten as 2026-03-01');
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Saw').prop('due').values(), ['March 2, 2026']);
    assert.deepEqual(report.warnings, []);
});

test('guard, finding 2 audit (Notion dates): a first import still stores real dates, ranges, and the start of a range whose end is not understood', async () => {
    const ctx = engine();
    const { plan, report } = await runNotion(ctx, 'Name,Due\nA,"March 1, 2026"\nB,"April 1, 2026 3:30 PM"\nC,"May 9, 2026 → May 10, 2026"\nD,"June 1, 2026 → whenever"\n');
    assert.equal(plan.parseReport.databases[0].dateRangesTruncated, 1);
    assert.equal(typeOf(ctx.thymer, 'Gear', 'due'), 'datetime');
    const v = (t) => ctx.thymer.recordByTitle('Gear', t).prop('due').values();
    assert.deepEqual(v('A'), [{ d: '20260301' }], 'date-only, not Feb 28 18:00');
    assert.deepEqual(v('B'), [{ d: '20260401', t: '153000' }]);
    assert.deepEqual(v('C'), [{ d: '20260509', r: { d: '20260510' } }]);
    assert.deepEqual(v('D'), [{ d: '20260601' }], 'the start, as the parser reports it');
    assert.deepEqual(report.warnings, []);
    // and it is stable on a re-import
    const again = await runNotion(ctx, 'Name,Due\nA,"March 1, 2026"\nB,"April 1, 2026 3:30 PM"\nC,"May 9, 2026 → May 10, 2026"\nD,"June 1, 2026 → whenever"\n');
    assert.deepEqual(v('D'), [{ d: '20260601' }]);
    assert.deepEqual(again.report.warnings, []);
});

test('finding 2 audit (Notion choices): a text column that re-infers as multi-choice keeps the cell as written', async () => {
    const ctx = engine();
    await runNotion(ctx, 'Name,Tags\nA,"Red, Red"\nB,x1\nC,x2\n');
    assert.equal(typeOf(ctx.thymer, 'Gear', 'tags'), 'text');
    const { plan, report } = await runNotion(ctx, 'Name,Tags\nA,"Red, Red"\nB,"Red, Red"\nC,"Blue, Blue"\n');
    assert.deepEqual([plan.collections[0].fields[0].type, plan.collections[0].fields[0].many], ['choice', true], 'sanity: fresh inference is a multi-choice');
    assert.equal(plan.records[0].values.tags, 'Red, Red', 'the plan keeps the cell, not the de-duplicated tokens');
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'A').prop('tags').values(), ['Red, Red']);
    assert.deepEqual(report.warnings, []);
});

test('guard, finding 2 audit (Notion choices): a first import still creates the options and stores separate selections', async () => {
    const ctx = engine();
    const { report } = await runNotion(ctx, 'Name,Tags\nA,"Red, Blue"\nB,"Red, Blue"\nC,Red\n');
    const tags = fieldsOf(ctx.thymer, 'Gear').find(f => f.id === 'tags');
    assert.deepEqual([tags.type, tags.many, tags.choices.map(c => c.label)], ['choice', true, ['Red', 'Blue']]);
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'A').prop('tags').selectedChoiceLabels(), ['Red', 'Blue']);
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'C').prop('tags').selectedChoiceLabels(), ['Red']);
    assert.deepEqual(report.warnings, []);
});

// ---------------------------------------------------------------------------------------------
// Finding 3: empty columns / blank keys clear old values
// ---------------------------------------------------------------------------------------------

test('finding 3 (Notion): a column whose last value was emptied clears the values an earlier import stored', async () => {
    const ctx = engine();
    await runNotion(ctx, 'Name,Status\nDrill,Open\nSaw,Done\n');
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Drill').prop('status').values(), ['Open']);
    const { plan, report } = await runNotion(ctx, 'Name,Status\nDrill,\nSaw,\n');
    assert.deepEqual(plan.collections[0].fields.map(f => [f.id, f.label, !!f.clearOnly]), [['status', 'Status', true], ['status_text', 'Status (text)', true]],
        'the empty column is declared, clear-only (with the companion a relation column would have had)');
    assert.equal(report.counts.valuesCleared, 2);
    assert.equal(ctx.thymer.recordByTitle('Gear', 'Drill').prop('status').count(), 0);
    assert.equal(ctx.thymer.recordByTitle('Gear', 'Saw').prop('status').count(), 0);
    assert.deepEqual(fieldIds(ctx.thymer, 'Gear'), ['source_path', 'status'], 'the field itself stays');
    assert.deepEqual(report.warnings, []);
    assert.deepEqual(report.errors, []);
});

test('finding 3 (Notion): an empty column creates no field on a first import and clears nothing', async () => {
    const ctx = engine();
    const { plan, report } = await runNotion(ctx, 'Name,Status,Size\nDrill,,Big\nSaw,,Small\n');
    assert.deepEqual(plan.collections[0].fields.map(f => [f.id, !!f.clearOnly]), [['size', false], ['status', true], ['status_text', true]]);
    assert.deepEqual(fieldIds(ctx.thymer, 'Gear'), ['source_path', 'size'], 'no field for the empty column');
    assert.equal(report.counts.valuesCleared, 0);
    assert.deepEqual(report.warnings, []);
    assert.deepEqual(plan.parseReport.databases[0].emptyColumns, ['Status'], 'still reported as empty');
    // re-import: still nothing to clear, still no field
    const again = await runNotion(ctx, 'Name,Status,Size\nDrill,,Big\nSaw,,Small\n');
    assert.deepEqual(fieldIds(ctx.thymer, 'Gear'), ['source_path', 'size']);
    assert.equal(again.report.counts.valuesCleared, 0);
    assert.deepEqual(again.report.warnings, []);
});

test('finding 3 (Notion): only the emptied column is cleared; other columns and fields added by hand keep their values', async () => {
    const ctx = engine();
    await runNotion(ctx, 'Name,Status,Mood\nDrill,Open,Happy\n');
    ctx.thymer.collection('Gear').config.fields.push({ id: 'mine', label: 'Mine', type: 'text', icon: 'ti-x', many: false, read_only: false, active: true });
    ctx.thymer.recordByTitle('Gear', 'Drill').prop('mine').set('my own note');
    ctx.thymer.settle();
    const { report } = await runNotion(ctx, 'Name,Status,Mood\nDrill,Open,\n');
    const drill = ctx.thymer.recordByTitle('Gear', 'Drill');
    assert.equal(drill.prop('mood').count(), 0, 'Mood was emptied');
    assert.deepEqual(drill.prop('status').values(), ['Open']);
    assert.equal(drill.text('mine'), 'my own note');
    assert.equal(report.counts.valuesCleared, 1);
});

test('guard, finding 3 (Notion): a clear-only column matches an existing field by its exact label only', async () => {
    const ctx = engine();
    await runNotion(ctx, 'Name,Home_URL\nDrill,https://example.invalid/a\n');
    // "Home-URL" is empty everywhere: it is a different label than Home_URL, so it must not wipe Home_URL
    const { report } = await runNotion(ctx, 'Name,Home-URL\nDrill,\n');
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Drill').prop('home_url').values(), ['https://example.invalid/a']);
    assert.equal(report.counts.valuesCleared, 0);
    assert.deepEqual(fieldIds(ctx.thymer, 'Gear'), ['source_path', 'home_url']);
});

test('guard, finding 3 (Notion): a column that is gone from the CSV altogether is left alone (documented)', async () => {
    const ctx = engine();
    await runNotion(ctx, 'Name,Status,Mood\nDrill,Open,Happy\n');
    const { report } = await runNotion(ctx, 'Name,Status\nDrill,Open\n');
    assert.deepEqual(ctx.thymer.recordByTitle('Gear', 'Drill').prop('mood').values().length, 1, 'removing a header is not the same as emptying it');
    assert.equal(report.counts.valuesCleared, 0);
});

test('finding 3 (Notion): a relation\'s "(text)" companion is cleared when nothing is left over any more', async () => {
    const ctx = engine();
    const A = 'aaaa1111aaaa1111aaaa1111aaaa1111';
    const B = 'bbbb2222bbbb2222bbbb2222bbbb2222';
    const Z = 'cccc3333cccc3333cccc3333cccc3333';
    const boards = `e_ExportBlock-1/Boards ${DB_ID}`;
    const caps = `e_ExportBlock-2/Caps 99933016139844f5dc950ed83f95f548`;
    const page = (t) => `# ${t}\n\nBody.\n`;
    const url = (t, id) => `https://www.notion.so/${t}-${id}`;
    const base = { [`${caps}.csv`]: 'Name\nOne\nTwo\n', [`${caps}/One ${A}.md`]: page('One'), [`${caps}/Two ${B}.md`]: page('Two') };
    const v1 = ctx.p._notionBuildPlan(inMemory({ ...base, [`${boards}.csv`]: `Name,Caps\nBoardy,"${url('One', A)}, ${url('Gone', Z)}"\n` }));
    assert.deepEqual(v1.collections.find(c => c.name === 'Boards').fields.map(f => f.id), ['caps', 'caps_text']);
    await ctx.p.applyImportPlan(v1, fast);
    ctx.thymer.settle();
    assert.deepEqual(ctx.thymer.recordByTitle('Boards', 'Boardy').prop('caps_text').values(), [url('Gone', Z)], 'sanity: the unresolved target is kept as text');

    const v2 = ctx.p._notionBuildPlan(inMemory({ ...base, [`${boards}.csv`]: `Name,Caps\nBoardy,"${url('One', A)}, ${url('Two', B)}"\n` }));
    assert.deepEqual(v2.collections.find(c => c.name === 'Boards').fields.map(f => [f.id, !!f.clearOnly]), [['caps', false], ['caps_text', true]]);
    const report = await ctx.p.applyImportPlan(v2, fast);
    ctx.thymer.settle();
    const boardy = ctx.thymer.recordByTitle('Boards', 'Boardy');
    assert.equal(boardy.prop('caps_text').count(), 0, 'the stale leftover text is gone');
    assert.deepEqual(boardy.linkedRecords('caps').map(r => r.getName()).sort(), ['One', 'Two']);
    assert.equal(report.counts.valuesCleared, 1);
    assert.deepEqual(report.warnings, []);
});

test('finding 3 (Tolaria): a key that is blank in every note clears an earlier value; it creates no field on a first import', async () => {
    const ctx = engine();
    await runTolaria(ctx, { 'v/a.md': note('due: 2026-03-01\nowner: Pat', 'A'), 'v/b.md': note('due: 2026-04-01\nowner: Sam', 'B') });
    assert.equal(ctx.thymer.recordByTitle('Notes', 'A').prop('due').count(), 1);
    const { plan, report } = await runTolaria(ctx, { 'v/a.md': note('due:\nowner: Pat', 'A'), 'v/b.md': note('due: null\nowner: Sam', 'B') });
    assert.deepEqual(plan.collections[0].fields.map(f => [f.id, !!f.clearOnly]), [['owner', false], ['due', true]]);
    assert.equal(ctx.thymer.recordByTitle('Notes', 'A').prop('due').count(), 0);
    assert.equal(ctx.thymer.recordByTitle('Notes', 'B').prop('due').count(), 0);
    assert.equal(ctx.thymer.recordByTitle('Notes', 'A').text('owner'), 'Pat');
    assert.equal(report.counts.valuesCleared, 2);
    assert.deepEqual(report.warnings, []);

    const fresh = engine();
    const first = await runTolaria(fresh, { 'v/a.md': note('due:\nowner: Pat', 'A') });
    assert.deepEqual(fieldIds(fresh.thymer, 'Notes'), ['source_path', 'owner'], 'no field for a key that never had a value');
    assert.equal(first.report.counts.valuesCleared, 0);
});

test('finding 3 (Tolaria): the ids of real fields do not move because of a blank-only key', async () => {
    const { p } = engine();
    const plan = await p.parseTolariaVault(memoryFiles({ 'v/a.md': note('cost ($):\ncost (%): 5', 'A') }));
    assert.deepEqual(plan.collections[0].fields.map(f => [f.id, f.label, !!f.clearOnly]), [['cost', 'Cost (%)', false], ['cost_2', 'Cost ($)', true]]);
});

test('guard, finding 3 (Tolaria): a key removed from every note is left alone (documented): only a blank value clears', async () => {
    const ctx = engine();
    await runTolaria(ctx, { 'v/a.md': note('due: 2026-03-01\nowner: Pat', 'A') });
    const { report } = await runTolaria(ctx, { 'v/a.md': note('owner: Pat', 'A') });
    assert.equal(ctx.thymer.recordByTitle('Notes', 'A').prop('due').count(), 1, 'the old value stays');
    assert.equal(report.counts.valuesCleared, 0);
});

