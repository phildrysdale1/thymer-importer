// Regression tests for the second round of the automated review of upstream PR #3: findings 1, 3, 4 and 5 (the persisted
// collection is authoritative on re-import), plus the persisted-schema matrix. Findings 2 and 6 are in
// review-fixes-2-pageid.test.mjs and review-fixes-2-skip.test.mjs. Every test failed before its fix (run with
// PLUGIN_JS=<older plugin.js> to check), except the ones titled "guard", which pass either way and only pin behaviour.
// Fixtures are synthetic. TZ is set west of UTC before any Date is made, so an implementation that sends date text
// through prop.setFromDate() fails here the way it did in Thymer.
process.env.TZ = 'America/Chicago';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPlugin } from './lib/load-plugin.mjs';
import { dirHandle } from './lib/fs-handle.mjs';
import { FakeThymer, FakeDateTime } from './lib/fake-thymer.mjs';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fast = { sleep: async () => {} };

function engine({ stale = false } = {}) {
    const thymer = new FakeThymer();
    thymer.staleReads = stale;
    const p = newPlugin({ DateTime: FakeDateTime });
    p.data = thymer.data;
    return { thymer, p };
}

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
const inMemory = (entries) => ({ files: new Map(), texts: new Map(Object.entries(entries)) });
const notionPage = (title, body = 'Body.') => `# ${title}\n\nStatus: Open\n\n${body}\n`;

const DB_ID = '35033016139844f5dc950ed83f95f548';   // made-up Notion ids
const S_ID = 'bbbb2222bbbb2222bbbb2222bbbb2222';

const fieldsOf = (thymer, name) => thymer.collection(name).config.fields;
const fieldIds = (thymer, name) => fieldsOf(thymer, name).map(f => f.id);
const labelOf = (thymer, name, id) => fieldsOf(thymer, name).find(f => f.id === id).label;
const names = (records) => records.map(r => r.getName());

// ---------------------------------------------------------------------------------------------
// Finding 1: Tolaria field ids must stay with the field they were given (cost / cost_2 shift when a colliding key
// appears in a later snapshot). The persisted collection decides; Notion columns get the same treatment.
// ---------------------------------------------------------------------------------------------

test('finding 1: a colliding key that first appears in a later snapshot does not take over the existing field', async () => {
    const { thymer, p } = engine();
    const first = await p.parseTolariaVault(memoryVault({ 'vault/a.md': note('cost (%): 5', 'A') }));
    assert.deepEqual(first.collections[0].fields.map(f => [f.id, f.label]), [['cost', 'Cost (%)']]);
    await p.applyImportPlan(first, fast);

    // a later snapshot adds "cost ($)", which sorts first and so is assigned "cost" by the parser
    const second = await p.parseTolariaVault(memoryVault({ 'vault/a.md': note('cost (%): 5', 'A'), 'vault/b.md': note('cost ($): 10', 'B') }));
    assert.deepEqual(second.collections[0].fields.map(f => [f.id, f.label]).sort(), [['cost', 'Cost ($)'], ['cost_2', 'Cost (%)']], 'sanity: the parser alone shifts the ids');
    const before = JSON.stringify(second);
    thymer.staleReads = true;
    const report = await p.applyImportPlan(second, fast);
    thymer.settle();

    assert.equal(JSON.stringify(second), before, 'the caller\'s plan is not mutated');
    assert.deepEqual(fieldIds(thymer, 'Notes'), ['source_path', 'cost', 'cost_2']);
    assert.equal(labelOf(thymer, 'Notes', 'cost'), 'Cost (%)', 'the existing field keeps its id');
    assert.equal(labelOf(thymer, 'Notes', 'cost_2'), 'Cost ($)');
    const a = thymer.recordByTitle('Notes', 'A');
    const b = thymer.recordByTitle('Notes', 'B');
    assert.deepEqual([a.number('cost'), a.prop('cost_2').count()], [5, 0], 'the percentage was not overwritten');
    assert.deepEqual([b.number('cost_2'), b.prop('cost').count()], [10, 0]);
    assert.deepEqual(report.warnings, []);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.remappedFields.map(r => [r.from, r.to]).sort(), [['cost', 'cost_2'], ['cost_2', 'cost']]);
    assert.equal(report.counts.fieldsRemapped, 2);

    // and a third import of the same snapshot changes nothing
    const third = await p.applyImportPlan(await p.parseTolariaVault(memoryVault({ 'vault/a.md': note('cost (%): 5', 'A'), 'vault/b.md': note('cost ($): 10', 'B') })), fast);
    assert.deepEqual(fieldIds(thymer, 'Notes'), ['source_path', 'cost', 'cost_2']);
    assert.equal(third.counts.recordsCreated, 0);
    assert.deepEqual(third.warnings, []);
});

test('finding 1: a new field gets an id that no field of the collection already uses', async () => {
    const { thymer, p } = engine();
    await p.applyImportPlan(await p.parseTolariaVault(memoryVault({ 'vault/a.md': note('cost (%): 5', 'A') })), fast);
    // someone added a field of their own with the id the new key would be allocated next
    thymer.collection('Notes').config.fields.push({ id: 'cost_2', label: 'Mine', type: 'text', icon: 'ti-x', many: false, read_only: false, active: true });
    thymer.recordByTitle('Notes', 'A').prop('cost_2').set('user data');
    await p.applyImportPlan(await p.parseTolariaVault(memoryVault({ 'vault/a.md': note('cost (%): 5', 'A'), 'vault/b.md': note('cost ($): 10', 'B') })), fast);
    assert.deepEqual(fieldIds(thymer, 'Notes'), ['source_path', 'cost', 'cost_2', 'cost_3']);
    assert.equal(labelOf(thymer, 'Notes', 'cost_3'), 'Cost ($)');
    assert.equal(thymer.recordByTitle('Notes', 'A').text('cost_2'), 'user data', 'the user\'s field is untouched');
    assert.equal(thymer.recordByTitle('Notes', 'A').number('cost'), 5);
    assert.equal(thymer.recordByTitle('Notes', 'B').number('cost_3'), 10);
});

test('finding 1: relation fields follow the same mapping (property links are rewritten with the ids)', async () => {
    const { thymer, p } = engine();
    const rel = (key, target) => note(`${key}: "[[${target}]]"`, key.toUpperCase());
    await p.applyImportPlan(await p.parseTolariaVault(memoryVault({ 'vault/a.md': note('link (%): "[[b]]"', 'A'), 'vault/b.md': note('x: 1', 'B') })), fast);
    thymer.staleReads = true;
    const report = await p.applyImportPlan(await p.parseTolariaVault(memoryVault({
        'vault/a.md': note('link (%): "[[b]]"', 'A'), 'vault/b.md': note('x: 1', 'B'), 'vault/c.md': note('link ($): "[[a]]"', 'C')
    })), fast);
    thymer.settle();
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.warnings, []);
    assert.equal(labelOf(thymer, 'Notes', 'link'), 'Link (%)');
    assert.deepEqual(names(thymer.recordByTitle('Notes', 'A').linkedRecords('link')), ['B'], 'A keeps its relation in the same field');
    assert.deepEqual(names(thymer.recordByTitle('Notes', 'C').linkedRecords('link_2')), ['A']);
    assert.equal(thymer.recordByTitle('Notes', 'C').prop('link').count(), 0);
});

test('guard, finding 1: key case variants still share one field, and the persisted label matches case-insensitively', async () => {
    const { thymer, p } = engine();
    await p.applyImportPlan(await p.parseTolariaVault(memoryVault({ 'vault/a.md': note('Cadence: weekly', 'A') })), fast);
    const report = await p.applyImportPlan(await p.parseTolariaVault(memoryVault({ 'vault/a.md': note('Cadence: weekly', 'A'), 'vault/b.md': note('cadence: daily', 'B') })), fast);
    assert.deepEqual(fieldIds(thymer, 'Notes'), ['source_path', 'cadence']);
    assert.equal(thymer.recordByTitle('Notes', 'B').text('cadence'), 'daily');
    assert.deepEqual(report.remappedFields || [], [], 'guard: nothing is remapped');
});

test('guard, finding 1: source_path is never claimed, even by a key that is labelled "Source Path"', async () => {
    const { thymer, p } = engine();
    const vault = memoryVault({ 'vault/a.md': note('source path: mine', 'A') });
    await p.applyImportPlan(await p.parseTolariaVault(vault), fast);
    const report = await p.applyImportPlan(await p.parseTolariaVault(vault), fast);
    assert.deepEqual(fieldIds(thymer, 'Notes'), ['source_path', 'source_path_value']);
    assert.equal(thymer.recordByTitle('Notes', 'A').text('source_path'), 'a.md');
    assert.equal(thymer.recordByTitle('Notes', 'A').text('source_path_value'), 'mine');
    assert.deepEqual(report.remappedFields || [], [], 'guard: nothing is remapped');
});

test('finding 1: a field whose label was edited in Thymer is not silently overwritten by a different key\'s values', async () => {
    const { thymer, p } = engine();
    await p.applyImportPlan(await p.parseTolariaVault(memoryVault({ 'vault/a.md': note('cost (%): 5', 'A') })), fast);
    thymer.collection('Notes').config.fields.find(f => f.id === 'cost').label = 'Percent';   // renamed by the user
    // the next vault has "cost ($)" only, which the parser calls "cost"
    await p.applyImportPlan(await p.parseTolariaVault(memoryVault({ 'vault/b.md': note('cost ($): 10', 'B') })), fast);
    assert.equal(thymer.recordByTitle('Notes', 'A').number('cost'), 5, 'the renamed field keeps its data');
    assert.deepEqual(fieldIds(thymer, 'Notes'), ['source_path', 'cost', 'cost_2']);
    assert.equal(thymer.recordByTitle('Notes', 'B').number('cost_2'), 10);
});

test('finding 1 (Notion): a column that collides by slug keeps its field when another one appears before it', async () => {
    const { thymer, p } = engine();
    const stem = 'e_ExportBlock-1/Gear 35033016139844f5dc950ed83f95f548';
    await p.applyImportPlan(p._notionBuildPlan(inMemory({ [`${stem}.csv`]: 'Name,Cost (%)\nDrill,5\n' })), fast);
    const second = p._notionBuildPlan(inMemory({ [`${stem}.csv`]: 'Name,Cost ($),Cost (%)\nDrill,10,5\nSaw,20,8\n' }));
    assert.deepEqual(second.collections[0].fields.map(f => [f.id, f.label]), [['cost', 'Cost ($)'], ['cost_2', 'Cost (%)']], 'sanity: the parser shifts the ids');
    thymer.staleReads = true;
    const report = await p.applyImportPlan(second, fast);
    thymer.settle();
    assert.deepEqual(report.warnings, []);
    assert.equal(labelOf(thymer, 'Gear', 'cost'), 'Cost (%)');
    const drill = thymer.recordByTitle('Gear', 'Drill');
    assert.deepEqual([drill.number('cost'), drill.number('cost_2')], [5, 10]);
    assert.deepEqual([thymer.recordByTitle('Gear', 'Saw').number('cost'), thymer.recordByTitle('Gear', 'Saw').number('cost_2')], [8, 20]);
});

// ---------------------------------------------------------------------------------------------
// The persisted schema decides what a value becomes (findings 3, 4 and 5 of this round, and the rest of the matrix)
// ---------------------------------------------------------------------------------------------

test('finding 3: date-only values stay date-only when a later snapshot adds a timed value (field inferred as text)', async () => {
    const { thymer, p } = engine();
    const v1 = await p.parseTolariaVault(memoryVault({ 'vault/a.md': note('due: 2026-03-01', 'A') }));
    assert.equal(v1.collections[0].fields[0].type, 'datetime');
    await p.applyImportPlan(v1, fast);
    const v2 = await p.parseTolariaVault(memoryVault({ 'vault/a.md': note('due: 2026-03-01', 'A'), 'vault/b.md': note('due: 2026-03-02T12:00:00', 'B') }));
    assert.equal(v2.collections[0].fields[0].type, 'text', 'sanity: fresh inference says text');
    thymer.staleReads = true;
    const report = await p.applyImportPlan(v2, fast);
    thymer.settle();
    assert.deepEqual(report.warnings, []);
    assert.equal(fieldsOf(thymer, 'Notes').find(f => f.id === 'due').type, 'datetime', 'never retyped');
    assert.deepEqual(thymer.recordByTitle('Notes', 'A').prop('due').values(), [{ d: '20260301' }], 'not Feb 28 18:00');
    assert.deepEqual(thymer.recordByTitle('Notes', 'B').prop('due').values(), [{ d: '20260302', t: '120000' }]);
    assert.ok(thymer.writeLog.every(w => !(w.value || []).some(v => v && v.fromDate)), 'setFromDate was never used');
});

test('finding 4: a relation that was a url field (target outside the export) keeps the source URL when the target is imported later', async () => {
    const { thymer, p } = engine();
    const CAP = 'cccc3333cccc3333cccc3333cccc3333';
    const url = `https://www.notion.so/Cap-${CAP}`;
    const boards = `e_ExportBlock-1/Boards ${DB_ID}`;
    const caps = `e_ExportBlock-2/Caps ${S_ID}`;
    const v1 = p._notionBuildPlan(inMemory({ [`${boards}.csv`]: `Name,Caps\nBoardy,${url}\n` }));
    assert.equal(v1.collections[0].fields[0].type, 'url', 'sanity: first import is a url field');
    await p.applyImportPlan(v1, fast);

    const v2 = p._notionBuildPlan(inMemory({
        [`${boards}.csv`]: `Name,Caps\nBoardy,${url}\n`,
        [`${caps}.csv`]: 'Name\nCap\n',
        [`${caps}/Cap ${CAP}.md`]: notionPage('Cap')
    }));
    assert.equal(v2.collections.find(c => c.name === 'Boards').fields[0].type, 'record', 'sanity: fresh inference is a record field now');
    thymer.staleReads = true;
    const report = await p.applyImportPlan(v2, fast);
    thymer.settle();
    const boardy = thymer.recordByTitle('Boards', 'Boardy');
    assert.equal(fieldsOf(thymer, 'Boards').find(f => f.id === 'caps').type, 'url', 'never retyped');
    assert.deepEqual(boardy.prop('caps').values(), [url], 'the source URL, not an opaque GUID');
    assert.ok(![...thymer.records.keys()].some(g => boardy.prop('caps').values().includes(g)));
    assert.deepEqual(report.warnings, []);
});

test('finding 5: a multi-choice column whose inference turns to text keeps tokenising (no "Red, Blue" option)', async () => {
    const { thymer, p } = engine();
    const stem = `e_ExportBlock-1/Items ${DB_ID}`;
    const v1 = p._notionBuildPlan(inMemory({ [`${stem}.csv`]: 'Name,Tags\nOne,"Red, Blue"\nTwo,"Red, Blue"\n' }));
    assert.deepEqual([v1.collections[0].fields[0].type, v1.collections[0].fields[0].many], ['choice', true]);
    await p.applyImportPlan(v1, fast);
    const v2 = p._notionBuildPlan(inMemory({ [`${stem}.csv`]: 'Name,Tags\nOne,"Red, Blue"\nTwo,"Red, Blue"\nThree,Green\nFour,Yellow\nFive,Orange\n' }));
    assert.equal(v2.collections[0].fields[0].type, 'text', 'sanity: fresh inference is text');
    thymer.staleReads = true;
    const report = await p.applyImportPlan(v2, fast);
    thymer.settle();
    const tags = fieldsOf(thymer, 'Items').find(f => f.id === 'tags');
    assert.deepEqual([tags.type, tags.many], ['choice', true]);
    assert.deepEqual(tags.choices.map(c => c.label), ['Red', 'Blue', 'Green', 'Yellow', 'Orange'], 'no composite option');
    assert.deepEqual(thymer.recordByTitle('Items', 'One').prop('tags').selectedChoiceLabels(), ['Red', 'Blue'], 'separate selections are kept');
    assert.deepEqual(thymer.recordByTitle('Items', 'Three').prop('tags').selectedChoiceLabels(), ['Green']);
    assert.deepEqual(report.warnings, []);
});

test('source_path is written as plain text, even when the path itself looks like a date', async () => {
    const { thymer, p } = engine();
    const plan = p.createImportPlan('synthetic');
    plan.collections.push({ key: 'c', name: 'Things', icon: 'ti-box', description: '', fields: [] });
    plan.records.push({ key: 'a', collection: 'c', title: 'A', sourcePath: '2026-03-01', values: {}, body: '' });
    const report = await p.applyImportPlan(plan, fast);
    assert.deepEqual(report.warnings, []);
    assert.equal(thymer.recordByTitle('Things', 'A').text('source_path'), '2026-03-01');
});

// ---- the matrix: every persisted type x every kind of fresh value ----------------------------------

const URL_A = 'https://example.invalid/a';
const URL_B = 'https://example.invalid/b';
const URL_T = 'https://example.invalid/t';
const URL_U = 'https://example.invalid/u';

// What a parser can hand the engine for one field of one record: the fresh type of the column, and the value or links.
const FRESH = {
    text1: { type: 'text', many: false, value: 'hello', strings: ['hello'] },
    textM: { type: 'text', many: true, value: ['hello', 'world'], strings: ['hello', 'world'] },
    url1: { type: 'url', many: false, value: URL_A, strings: [URL_A] },
    urlM: { type: 'url', many: true, value: [URL_A, URL_B], strings: [URL_A, URL_B] },
    num: { type: 'number', many: false, value: 42, strings: ['42'], number: 42 },
    numText: { type: 'text', many: false, value: '42', strings: ['42'], number: 42 },
    date: { type: 'datetime', many: false, value: '2026-03-01', strings: ['2026-03-01'], date: { d: '20260301' } },
    dateTimed: { type: 'datetime', many: false, value: '2026-03-02T12:00', strings: ['2026-03-02T12:00'], date: { d: '20260302', t: '120000' } },
    textDateOnly: { type: 'text', many: false, value: '2026-03-01', strings: ['2026-03-01'], date: { d: '20260301' } },
    textDateTimed: { type: 'text', many: false, value: '2026-03-02T12:00:00', strings: ['2026-03-02T12:00:00'], date: { d: '20260302', t: '120000' } },
    choice1: { type: 'choice', many: false, value: 'Open', strings: ['Open'] },
    choiceM: { type: 'choice', many: true, value: ['Red', 'Blue'], strings: ['Red', 'Blue'] },
    textTokens: { type: 'text', many: false, value: 'Red, Blue', strings: ['Red, Blue'], tokens: ['Red', 'Blue'] },
    rec1: { type: 'record', many: false, links: [URL_T], strings: [URL_T], records: ['T'] },
    recM: { type: 'record', many: true, links: [URL_T, URL_U], strings: [URL_T, URL_U], records: ['T', 'U'] }
};
const SEED = { text: 'seed', url: 'https://seed.invalid', number: 7, choice: 'Seed', datetime: '2026-01-01' };
const PERSISTED = ['text', 'url', 'number', 'choice', 'datetime', 'record'];

function matrixPlan(p, { type, many, seed, fresh }) {
    const plan = p.createImportPlan('synthetic');
    const field = { id: 'f', label: 'F', type, many };
    if (type === 'record') field.target = 'c';
    plan.collections.push({ key: 'c', name: 'Matrix', icon: 'ti-box', description: '', fields: [field] });
    for (const [key, title] of [['a', 'A'], ['t', 'T'], ['u', 'U'], ['t0', 'T0']]) plan.records.push({ key, collection: 'c', title, sourcePath: `${key}.md`, values: {}, body: '' });
    const a = plan.records[0];
    if (seed) { if (type === 'record') p.planPropertyLink(plan, 'a', 'f', { ref: 't0', kind: 'key' }); else a.values.f = many ? [seed] : seed; }
    if (fresh) {
        if (fresh.links) fresh.links.forEach((raw, i) => p.planPropertyLink(plan, 'a', 'f', { ref: i === 0 ? 't' : 'u', kind: 'key' }, { raw }));
        else a.values.f = fresh.value;
    }
    return plan;
}

/** The expectation for one cell: { stored } (what the field holds afterwards) or { warn } (left unchanged, with a warning). */
function expectation(persisted, many, name) {
    const f = FRESH[name];
    const join = (list) => (many ? list : [list.join(', ')]);
    switch (persisted) {
        case 'text': case 'url':
            return { stored: join(f.strings) };
        case 'choice':
            return { stored: many ? (f.tokens || f.strings) : [f.strings.join(', ')] };
        case 'number':
            return f.number === undefined ? { warn: true } : { stored: [f.number] };
        case 'datetime':
            return f.date ? { stored: [f.date] } : { warn: true };
        case 'record':
            return f.records ? { stored: many ? f.records : [f.records[0]], extraDropped: !many && f.records.length > 1 } : { warn: true };
        default:
            throw new Error(persisted);
    }
}

function readBack(prop, type) {
    switch (type) {
        case 'number': return prop.numbers();
        case 'choice': return prop.selectedChoiceLabels();
        case 'datetime': return prop.values();
        case 'record': return prop.linkedRecords().map(r => r.getName());
        default: return prop.texts();
    }
}

/** Runs one cell of the matrix: persisted type x fresh sample. Throws (assert) on the first thing that is wrong. */
async function matrixCell(persisted, many, name) {
    const fresh = FRESH[name];
    const where = `${persisted}${many ? '/many' : ''} <- ${name}`;
    const { thymer, p } = engine();
    await p.applyImportPlan(matrixPlan(p, { type: persisted, many, seed: persisted === 'record' ? true : SEED[persisted] }), fast);
    const a = thymer.recordByTitle('Matrix', 'A');
    const seeded = readBack(a.prop('f'), persisted);
    assert.equal(seeded.length, 1, `${where}: seeded`);
    const optionsBefore = persisted === 'choice' ? fieldsOf(thymer, 'Matrix').find(f => f.id === 'f').choices.map(c => c.label) : null;

    thymer.staleReads = true;
    const plan2 = matrixPlan(p, { type: fresh.type, many: fresh.many, fresh });
    const report = await p.applyImportPlan(plan2, fast);
    thymer.settle();

    assert.deepEqual(report.errors, [], where);
    const field = fieldsOf(thymer, 'Matrix').find(f => f.id === 'f');
    assert.deepEqual([field.type, field.many === true], [persisted, many], `${where}: never retyped`);
    assert.deepEqual(fieldIds(thymer, 'Matrix'), ['source_path', 'f'], `${where}: no extra field`);
    if (persisted === 'choice') {
        assert.deepEqual(field.choices.slice(0, optionsBefore.length).map(c => c.label), optionsBefore, `${where}: options only grow`);
        assert.ok(!many || field.choices.every(c => !c.label.includes(', ')), `${where}: no composite option in a multi-value field`);
    }

    const stored = readBack(a.prop('f'), persisted);
    const fieldWarnings = report.warnings.filter(w => w.field === 'f');
    const expected = expectation(persisted, many, name);
    if (expected.warn) {
        assert.ok(fieldWarnings.some(w => w.code === 'property-not-set'), `${where}: a warning, not a silent drop`);
        assert.deepEqual(stored, seeded, `${where}: left unchanged`);
    } else {
        assert.deepEqual(stored, expected.stored, where);
        assert.deepEqual(fieldWarnings.map(w => w.code), expected.extraDropped ? ['extra-values-dropped'] : [], where);
    }
    if (persisted !== 'record') {
        const guids = new Set(thymer.records.keys());
        assert.ok(!a.prop('f').values().some(v => guids.has(v)), `${where}: a record GUID in a ${persisted} field`);
    }
    assert.ok(thymer.writeLog.every(w => !(w.value || []).some(v => v && v.fromDate)), `${where}: setFromDate`);

    // a second run of the same plan is a no-op: same stored value, same warnings
    const again = await p.applyImportPlan(plan2, fast);
    thymer.settle();
    assert.deepEqual(readBack(a.prop('f'), persisted), stored, `${where}: idempotent`);
    assert.deepEqual(again.warnings.map(w => [w.code, w.field]), report.warnings.map(w => [w.code, w.field]), `${where}: same warnings`);
    assert.equal(again.counts.valuesCleared, 0, where);
}

// One test per persisted type; every cell of its row is checked and ALL the wrong ones are listed.
for (const persisted of PERSISTED) {
    for (const many of [false, true]) {
        test(`matrix: persisted ${persisted}${many ? ' (many)' : ''} x every fresh type`, async () => {
            const problems = [];
            for (const name of Object.keys(FRESH)) {
                try { await matrixCell(persisted, many, name); } catch (error) { problems.push(String(error && error.message || error).split('\n')[0]); }
            }
            assert.deepEqual(problems, []);
        });
    }
}

test('finding 3 (Notion): dates written the way Notion writes them are parsed when the column turns to text, and the rest is a warning', async () => {
    const { thymer, p } = engine();
    const stem = `e_ExportBlock-1/Plans ${DB_ID}`;
    const v1 = p._notionBuildPlan(inMemory({ [`${stem}.csv`]: 'Name,Due\nOne,"August 30, 2021"\nTwo,"March 1, 2026"\n' }));
    assert.equal(v1.collections[0].fields[0].type, 'datetime');
    await p.applyImportPlan(v1, fast);
    const v2 = p._notionBuildPlan(inMemory({ [`${stem}.csv`]: 'Name,Due\nOne,"August 30, 2021"\nTwo,"March 1, 2026 3:30 PM"\nThree,next week\n' }));
    assert.equal(v2.collections[0].fields[0].type, 'text', 'sanity: fresh inference says text');
    thymer.staleReads = true;
    const report = await p.applyImportPlan(v2, fast);
    thymer.settle();
    assert.deepEqual(thymer.recordByTitle('Plans', 'One').prop('due').values(), [{ d: '20210830' }]);
    assert.deepEqual(thymer.recordByTitle('Plans', 'Two').prop('due').values(), [{ d: '20260301', t: '153000' }]);
    assert.equal(thymer.recordByTitle('Plans', 'Three').prop('due').count(), 0, 'not a date: left empty');
    assert.deepEqual(report.warnings.map(w => [w.code, w.field, w.record.endsWith(':row:3')]), [['property-not-set', 'due', true]], 'one warning, for the row that is not a date');
});

test('a persisted field of a type an import does not write (user, file, ...) is a warning, never a write; hashtag takes text', async () => {
    const { thymer, p } = engine();
    const plan = p.createImportPlan('synthetic');
    plan.collections.push({ key: 'c', name: 'Odd', icon: 'ti-box', description: '', fields: [
        { id: 'who', label: 'Who', type: 'user' }, { id: 'tag', label: 'Tag', type: 'hashtag', many: true }, { id: 'note', label: 'Note', type: 'text' }
    ] });
    plan.records.push({ key: 'a', collection: 'c', title: 'A', sourcePath: 'a.md', values: { who: 'someone', tag: ['x', 'y'], note: 'n' }, body: '' });
    const report = await p.applyImportPlan(plan, fast);
    assert.deepEqual(report.warnings.map(w => w.field), ['who']);
    assert.match(report.warnings[0].message, /type "user"/);
    const a = thymer.recordByTitle('Odd', 'A');
    assert.deepEqual([a.prop('who').count(), a.prop('tag').texts(), a.text('note')], [0, ['x', 'y'], 'n']);
});

test('guard, matrix: a number text that is not a plain number, and a one-value field handed several values, are warnings that leave the value', async () => {
    const { thymer, p } = engine();
    const plan = (type, many, value) => {
        const pl = p.createImportPlan('synthetic');
        pl.collections.push({ key: 'c', name: 'M2', icon: 'ti-box', description: '', fields: [{ id: 'n', label: 'N', type: 'number', many }, { id: 'd', label: 'D', type: 'datetime', many }] });
        pl.records.push({ key: 'a', collection: 'c', title: 'A', sourcePath: 'a.md', values: value, body: '' });
        return pl;
    };
    await p.applyImportPlan(plan('number', false, { n: 7, d: '2026-01-01' }), fast);
    const report = await p.applyImportPlan(plan('number', false, { n: '1,234', d: ['2026-02-01', '2026-02-02'] }), fast);
    const a = thymer.recordByTitle('M2', 'A');
    assert.deepEqual([a.prop('n').numbers(), a.prop('d').values()], [[7], [{ d: '20260101' }]]);
    assert.deepEqual(report.warnings.map(w => w.field).sort(), ['d', 'n']);
});

// ---------------------------------------------------------------------------------------------
// Re-import of the committed (synthetic) fixtures with stale reads: nothing created, cleared, renamed, remapped or warned
// ---------------------------------------------------------------------------------------------

test('guard: re-import with stale reads is a no-op for the Tolaria and Notion fixtures', async () => {
    for (const [source, parse] of [['tolaria', 'parseTolariaVault'], ['notion', 'parseNotionExport']]) {
        const { thymer, p } = engine();
        await p.applyImportPlan(await p[parse](dirHandle(path.join(FIXTURES, source))), fast);
        const snapshot = () => thymer.collections.map(c => ({ name: c.getName(), fields: c.getConfiguration().fields.map(f => [f.id, f.label, f.type, f.many === true]) }));
        const paths = () => [...thymer.records.values()].map(r => r.text('source_path')).sort();
        const [beforeFields, beforePaths] = [snapshot(), paths()];
        thymer.staleReads = true;
        const report = await p.applyImportPlan(await p[parse](dirHandle(path.join(FIXTURES, source))), fast);
        thymer.settle();
        assert.equal(report.counts.recordsCreated, 0, source);
        assert.equal(report.counts.valuesCleared, 0, source);
        assert.equal(report.counts.recordsRenamed, 0, source);
        assert.deepEqual(report.remappedFields || [], [], source);
        assert.deepEqual(report.warnings, [], source);
        assert.deepEqual(report.errors, [], source);
        assert.deepEqual(snapshot(), beforeFields, source);
        assert.deepEqual(paths(), beforePaths, source);
    }
});

// ---------------------------------------------------------------------------------------------
// The real exports (never committed; skipped unless the env vars are set): a second import, with Thymer's stale reads,
// creates, clears, renames, remaps and warns about nothing, and leaves collections, field ids and source paths as they were.
// Only counts are checked; nothing from the exports is printed.
// ---------------------------------------------------------------------------------------------

for (const [label, envVar, parse] of [['Tolaria vault', 'TOLARIA_VAULT', 'parseTolariaVault'], ['Notion export', 'NOTION_EXPORT', 'parseNotionExport']]) {
    test(`guard: real ${label}: re-import with stale reads changes nothing`, { skip: !process.env[envVar] && `${envVar} is not set` }, async () => {
        const { thymer, p } = engine();
        const first = await p.applyImportPlan(await p[parse](dirHandle(process.env[envVar])), fast);
        assert.deepEqual(first.errors, []);
        assert.deepEqual(first.warnings, []);
        const shape = () => thymer.collections.map(c => ({ name: c.getName(), fields: c.getConfiguration().fields.map(f => [f.id, f.label, f.type, f.many === true]) }));
        const paths = () => [...thymer.records.values()].map(r => r.text('source_path')).sort();
        const [fieldsBefore, pathsBefore, total] = [shape(), paths(), thymer.records.size];

        thymer.staleReads = true;
        const again = await p.applyImportPlan(await p[parse](dirHandle(process.env[envVar])), fast);
        thymer.settle();
        assert.equal(again.counts.recordsCreated, 0);
        assert.equal(again.counts.valuesCleared, 0);
        assert.equal(again.counts.recordsRenamed, 0);
        assert.deepEqual(again.remappedFields || [], []);
        assert.deepEqual(again.warnings, []);
        assert.deepEqual(again.errors, []);
        assert.equal(again.counts.recordsUpdated, total);
        assert.deepEqual(shape(), fieldsBefore, 'collections and field ids are identical');
        assert.deepEqual(paths(), pathsBefore, 'source_paths are identical');
        assert.equal(thymer.records.size, total, 'no duplicates');
    });
}
