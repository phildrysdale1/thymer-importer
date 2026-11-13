// A seeded property test for re-import: random "export A, then export B" pairs (headers / keys that read alike, case variants,
// zero-padded codes, long ids, impossible dates, ranges, lists, blanks, emptied columns) imported into the fake with Thymer's
// stale reads. After B is imported over A, for every non-empty value of B:
//   - it is stored in the field that carries that column's / key's label (or a warning was reported for that record),
//     as the source's text unless the persisted field is a number / date / choice;
//   - a field that no column of B stands for is exactly as A left it (no silent overwrite);
//   - a cell that is empty in B is empty in Thymer (cleared), when its column is the only one reading that way;
// and importing the same export again changes nothing: no new record, field or value, same warnings.
// The data are made up; the seeds are fixed so a failure reproduces. (Found, while writing it: a column "status" taking the field
// of "Status" when both existed, and look-alike Tolaria keys taking over each other's field.)
process.env.TZ = 'America/Chicago';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engine, fast, memoryFiles } from './lib/round3.mjs';

const prng = (seed) => { let s = seed >>> 0; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; return { rnd, pick: (a) => a[Math.floor(rnd() * a.length)] }; };
const ci = (x) => x.toLowerCase();
const loose = (x) => ci(x).replace(/[\s_-]+/g, ' ');
const snapshot = (thymer) => JSON.stringify([...thymer.records.values()].map(r => [r._title, [...r._values.entries()]]));
const recordsOf = (thymer, name) => new Map([...thymer.records.values()].filter(r => r._collection === thymer.collection(name)).map(r => [r._title, new Map([...r._values.entries()].map(([k, v]) => [k, JSON.stringify(v)]))]));

// ---- Notion ----------------------------------------------------------------------------------------------

const N_HEADERS = ['Code', 'Home_URL', 'Home-URL', 'Home URL', 'Status', 'status', 'Weight', 'Due', 'Tags', 'Size (cm)', 'Size (in)', 'Notes'];
const N_POOL = {
    num: ['1', '2.5', '007', '000123', '10', '1.50', '12345678901234567890', '-3'],
    date: ['March 1, 2026', 'March 2, 2026', '2026-03-03', 'April 1, 2026 3:30 PM', 'February 30, 2026', 'May 9, 2026 → May 10, 2026', 'soon'],
    choice: ['Red', 'Blue', 'Red, Blue', 'Red, Red', 'Green', 'Blue, Green'],
    url: ['https://example.invalid/a', 'https://example.invalid/b'],
    text: ['hello', 'World', 'AB123', 'x, y']
};
function notionExport(g) {
    const cols = N_HEADERS.filter(() => g.rnd() < 0.45);
    if (!cols.length) cols.push(g.pick(N_HEADERS));
    const kind = Object.fromEntries(cols.map(h => [h, g.pick(['num', 'date', 'choice', 'url', 'text', 'mixed', 'empty'])]));
    const rows = ['Drill', 'Saw', 'Hammer', 'Plane'].filter(() => g.rnd() < 0.8).map(title => ({
        title,
        cells: Object.fromEntries(cols.map(h => {
            const k = kind[h] === 'mixed' ? g.pick(['num', 'date', 'choice', 'url', 'text']) : kind[h];
            return [h, kind[h] === 'empty' || g.rnd() < 0.15 ? '' : g.pick(N_POOL[k])];
        }))
    }));
    if (!rows.length) rows.push({ title: 'Drill', cells: Object.fromEntries(cols.map(h => [h, 'hello'])) });
    const q = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const text = ['Name', ...cols].map(q).join(',') + '\n' + rows.map(r => [r.title, ...cols.map(h => r.cells[h])].map(q).join(',')).join('\n') + '\n';
    return { cols, rows, text };
}

test('property: Notion export B over export A (stale reads): nothing is dropped or overwritten silently, and a repeat changes nothing', async () => {
    const g = prng(20261112);
    const stem = 'e_ExportBlock-1/Gear 35033016139844f5dc950ed83f95f548';
    const plan = (p, text) => p._notionBuildPlan({ files: new Map(), texts: new Map([[`${stem}.csv`, text]]) });
    for (let i = 0; i < 150; i++) {
        const { thymer, p } = engine();
        const a = notionExport(g);
        const b = notionExport(g);
        const at = `case ${i}\nA:\n${a.text}\nB:\n${b.text}`;
        await p.applyImportPlan(plan(p, a.text), fast); thymer.settle();
        const again = await p.applyImportPlan(plan(p, a.text), fast); thymer.settle();
        assert.deepEqual([again.counts.recordsCreated, again.counts.valuesCleared, again.counts.recordsRenamed, again.warnings.length, again.errors.length], [0, 0, 0, 0, 0], `A over A changed something\n${at}`);

        const afterA = recordsOf(thymer, 'Gear');
        const fieldsA = thymer.collection('Gear').config.fields.map(f => ({ id: f.id, label: f.label }));
        const planB = plan(p, b.text);
        const report = await p.applyImportPlan(planB, fast); thymer.settle();
        assert.deepEqual(report.errors, [], at);
        const fields = thymer.collection('Gear').config.fields.filter(f => f.active !== false && f.id !== 'source_path');
        const warnedRecords = new Set(report.warnings.filter(w => w.record).map(w => planB.records.find(r => r.key === w.record).title));

        for (const row of b.rows) {
            const record = thymer.recordByTitle('Gear', row.title);
            assert.ok(record, `record ${row.title} missing\n${at}`);
            for (const h of b.cols) {
                const cell = row.cells[h];
                const sameWay = b.cols.filter(x => loose(x) === loose(h)).length === 1;
                let own = fields.filter(f => ci(f.label) === ci(h));
                if (own.length === 0) own = fields.filter(f => loose(f.label) === loose(h));
                if (own.length > 1) own = own.filter(f => f.label === h);
                if (!cell && own.length === 0) continue;   // an empty column (or a blank cell of one) needs no field
                assert.equal(own.length, 1, `no single field for column "${h}"\n${at}`);
                const values = record.prop(own[0].id).values();
                if (cell) {
                    if (values.length === 0) assert.ok(warnedRecords.has(row.title), `"${cell}" for ${row.title}.${h} was dropped without a warning\n${at}`);
                    else if (['text', 'url'].includes(own[0].type) && !warnedRecords.has(row.title)) assert.equal(values.join(', '), cell, `${row.title}.${h} was rewritten\n${at}`);
                    else if (own[0].type === 'number' && !warnedRecords.has(row.title)) assert.equal(values[0], Number(cell), `${row.title}.${h}\n${at}`);
                } else if (afterA.has(row.title) && sameWay && fieldsA.some(f => ci(f.label) === ci(h))) {
                    assert.equal(values.length, 0, `${row.title}.${h} was emptied in B but kept its old value\n${at}`);
                }
            }
        }
        for (const f of fieldsA) {
            if (f.id === 'source_path' || b.cols.some(h => loose(h) === loose(f.label))) continue;
            for (const [title, values] of afterA) {
                const record = thymer.recordByTitle('Gear', title);
                assert.equal(JSON.stringify(record._values.get(f.id) || []), values.get(f.id) || '[]', `${title}.${f.label} changed though no column of B stands for it\n${at}`);
            }
        }
        const fieldCount = thymer.collection('Gear').config.fields.length;
        const snap = snapshot(thymer);
        const repeat = await p.applyImportPlan(plan(p, b.text), fast); thymer.settle();
        assert.deepEqual([repeat.counts.recordsCreated, repeat.counts.valuesCleared, repeat.counts.recordsRenamed], [0, 0, 0], `B over B changed something\n${at}`);
        assert.equal(thymer.collection('Gear').config.fields.length, fieldCount, `B over B added a field\n${at}`);
        assert.equal(snapshot(thymer), snap, `B over B changed a value\n${at}`);
        assert.equal(repeat.warnings.length, report.warnings.length, `B over B warns differently\n${at}`);
    }
});

// ---- Tolaria ---------------------------------------------------------------------------------------------

const T_KEYS = ['cost ($)', 'cost (%)', 'cost x', 'Cost_x', 'status', 'Status', 'due', 'code', 'size', 'Home URL', 'home_url', 'owner'];
const T_POOL = { num: ['1', '2.5', '007', '1.50', '12345678901234567890'], date: ['2026-03-01', '2026-03-02', '2026-02-30', '2026-03-02T12:00:00'], text: ['open', 'closed', 'AB123', 'x'], blank: [''] };
function tolariaVault(g) {
    const keys = T_KEYS.filter(() => g.rnd() < 0.4);
    if (!keys.length) keys.push(g.pick(T_KEYS));
    const kind = Object.fromEntries(keys.map(k => [k, g.pick(['num', 'date', 'text', 'mixed', 'blank'])]));
    const notes = ['A', 'B', 'C'].filter(() => g.rnd() < 0.85).map(title => ({
        title,
        values: Object.fromEntries(keys.filter(() => g.rnd() < 0.8).map(k => [k, g.pick(T_POOL[kind[k] === 'mixed' ? g.pick(['num', 'date', 'text']) : kind[k]])]))
    }));
    if (!notes.length) notes.push({ title: 'A', values: {} });
    const files = Object.fromEntries(notes.map(n => [`v/${n.title.toLowerCase()}.md`, `---\n${Object.entries(n.values).map(([k, v]) => `${k}: ${k === 'owner' && v ? `[${v}, extra]` : v}`).join('\n')}\n---\n# ${n.title}\n\nText.\n`]));
    return { notes, files };
}

test('property: Tolaria vault B over vault A (stale reads): nothing is dropped or overwritten silently, and a repeat changes nothing', async () => {
    const g = prng(11122026);
    for (let i = 0; i < 150; i++) {
        const { thymer, p } = engine();
        const a = tolariaVault(g);
        const b = tolariaVault(g);
        const at = `case ${i}\nA: ${JSON.stringify(a.files)}\nB: ${JSON.stringify(b.files)}`;
        const run = async (v) => { const plan = await p.parseTolariaVault(memoryFiles(v.files)); const report = await p.applyImportPlan(plan, fast); thymer.settle(); return { plan, report }; };
        await run(a);
        const again = await run(a);
        assert.deepEqual([again.report.counts.recordsCreated, again.report.counts.valuesCleared, again.report.counts.recordsRenamed, again.report.warnings.length, again.report.errors.length], [0, 0, 0, 0, 0], `A over A changed something\n${at}`);
        const afterA = recordsOf(thymer, 'Notes');
        const fieldsA = thymer.collection('Notes').config.fields.map(f => ({ id: f.id, label: f.label }));
        const { plan: planB, report } = await run(b);
        assert.deepEqual(report.errors, [], at);
        const fields = thymer.collection('Notes').config.fields.filter(f => f.active !== false && f.id !== 'source_path');
        const planFields = planB.collections[0].fields;
        for (const n of b.notes) {
            const record = thymer.recordByTitle('Notes', n.title);
            assert.ok(record, `record ${n.title} missing\n${at}`);
            const warned = report.warnings.some(w => w.record && planB.records.find(x => x.key === w.record).title === n.title);
            const planRecord = planB.records.find(r => r.title === n.title);
            const seen = new Set();
            for (const [key, value] of Object.entries(n.values)) {
                if (!value || seen.has(ci(key))) continue;
                seen.add(ci(key));
                const holder = planFields.find(f => !f.clearOnly && planRecord.values[f.id] === value);
                if (!holder) continue;
                let own = fields.filter(f => ci(f.label) === ci(holder.label));
                if (!own.length) own = fields.filter(f => loose(f.label) === loose(holder.label));
                if (own.length > 1) own = own.filter(f => f.label === holder.label);
                assert.equal(own.length, 1, `no single field for key "${key}"\n${at}`);
                const values = record.prop(own[0].id).values();
                if (values.length === 0) assert.ok(warned, `"${value}" for ${n.title}.${key} was dropped without a warning\n${at}`);
                else if (own[0].type === 'text' && !warned) assert.equal(values.join(', '), value, `${n.title}.${key} was rewritten\n${at}`);
            }
        }
        for (const f of fieldsA) {
            if (f.id === 'source_path' || planFields.some(pf => loose(pf.label) === loose(f.label))) continue;
            for (const [title, values] of afterA) {
                assert.equal(JSON.stringify(thymer.recordByTitle('Notes', title)._values.get(f.id) || []), values.get(f.id) || '[]', `${title}.${f.label} changed though no key of B stands for it\n${at}`);
            }
        }
        const fieldCount = thymer.collection('Notes').config.fields.length;
        const snap = snapshot(thymer);
        const repeat = await run(b);
        assert.deepEqual([repeat.report.counts.recordsCreated, repeat.report.counts.valuesCleared], [0, 0], `B over B changed something\n${at}`);
        assert.equal(thymer.collection('Notes').config.fields.length, fieldCount, `B over B added a field\n${at}`);
        assert.equal(snapshot(thymer), snap, `B over B changed a value\n${at}`);
    }
});
