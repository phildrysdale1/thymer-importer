// Regressions found by running the importer inside real Thymer (CST machine, UTC-6):
//   1. date-only values landed on the previous evening     2. stray "!" before links for images that were not imported
//   3. empty quote items for blank lines inside Notion <aside> callouts
// All content is synthetic. TZ is set west of UTC before any Date is made, so an implementation that goes through
// prop.setFromDate(new Date('2026-03-01')) fails here the way it did in Thymer (Feb 28 18:00).
process.env.TZ = 'America/Chicago';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPlugin } from './lib/load-plugin.mjs';
import { dirHandle } from './lib/fs-handle.mjs';
import { FakeThymer, FakeDateTime } from './lib/fake-thymer.mjs';

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fast = { sleep: async () => {} };

function setup() {
    const thymer = new FakeThymer();
    const plugin = newPlugin({ DateTime: FakeDateTime });
    plugin.data = thymer.data;
    return { thymer, plugin };
}

// ---- 1. dates ---------------------------------------------------------------------------------

function dateStrings(plugin, ...strings) {
    return strings.map(s => plugin._planDateValue(s));
}

test('plan date strings: date-only -> dateOnly, local time -> dateAndTime, A/B -> range, junk -> null', () => {
    const { plugin } = setup();
    const [dateOnly, withTime, withSeconds, spaced, range, mixed, bad1, bad2, bad3, bad4] = dateStrings(plugin,
        '2026-03-01', '2024-04-01T15:30', '2024-04-01T15:30:45', '2024-04-01 09:05', '2024-05-09/2024-05-10',
        '2024-04-01T15:00/2024-04-02', '2026-02-30', '2026-03-01T25:00', 'March 1', '2026-03-01/2026-03-02/2026-03-03');
    assert.deepEqual(dateOnly, { d: '20260301' });
    assert.deepEqual(withTime, { d: '20240401', t: '153000' });
    assert.deepEqual(withSeconds, { d: '20240401', t: '153045' });
    assert.deepEqual(spaced, { d: '20240401', t: '090500' });
    assert.deepEqual(range, { d: '20240509', r: { d: '20240510' } });
    assert.deepEqual(mixed, { d: '20240401', t: '150000', r: { d: '20240402' } });
    assert.deepEqual([bad1, bad2, bad3, bad4], [null, null, null, null]);
});

function datePlan(plugin, values) {
    const plan = plugin.createImportPlan('synthetic');
    plan.collections.push({ key: 'c', name: 'Dates', icon: 'ti-calendar', fields: [
        { id: 'due', label: 'Due', type: 'datetime' },
        { id: 'span', label: 'Span', type: 'datetime' },
        { id: 'multi', label: 'Multi', type: 'datetime', many: true },
        { id: 'note', label: 'Note', type: 'text' }
    ] });
    plan.records.push({ key: 'r', collection: 'c', title: 'Row', sourcePath: 'row.md', values });
    return plan;
}

test('applyImportPlan sets datetime fields with DateTime.dateOnly / dateAndTime, never setFromDate', async () => {
    const { thymer, plugin } = setup();
    const report = await plugin.applyImportPlan(datePlan(plugin, { due: '2026-03-01', span: '2024-05-09/2024-05-10' }), fast);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.warnings, []);
    const row = thymer.recordByTitle('Dates', 'Row');
    assert.deepEqual(row.prop('due').values(), [{ d: '20260301' }], 'date only: no time component, no day shift');
    assert.deepEqual(row.prop('span').values(), [{ d: '20240509', r: { d: '20240510' } }]);
});

test('a timed value keeps its local wall-clock time; date-only vs timed is distinguishable', async () => {
    const { thymer, plugin } = setup();
    await plugin.applyImportPlan(datePlan(plugin, { due: '2024-04-01T15:30', span: '2024-04-01' }), fast);
    const row = thymer.recordByTitle('Dates', 'Row');
    assert.deepEqual(row.prop('due').values(), [{ d: '20240401', t: '153000' }]);
    assert.equal(row.prop('span').values()[0].t, undefined);
});

test('many-valued datetime fields take an array of DateTimeValues; a single-value field refuses several', async () => {
    const { thymer, plugin } = setup();
    const report = await plugin.applyImportPlan(datePlan(plugin, { multi: ['2026-03-01', '2026-03-02T08:00'], due: ['2026-03-01', '2026-03-02'] }), fast);
    const row = thymer.recordByTitle('Dates', 'Row');
    assert.deepEqual(row.prop('multi').values(), [{ d: '20260301' }, { d: '20260302', t: '080000' }]);
    assert.equal(row.prop('due').values().length, 0);
    assert.deepEqual(report.warnings.map(w => w.field), ['due']);
});

test('a datetime string this engine cannot parse falls back to the generic setter instead of being dropped', async () => {
    const { thymer, plugin } = setup();
    const report = await plugin.applyImportPlan(datePlan(plugin, { due: '2026-03-01T10:00:00Z' }), fast);
    assert.deepEqual(report.errors, []);
    const v = thymer.recordByTitle('Dates', 'Row').prop('due').values()[0];
    assert.equal(v.fromDate, true, 'went through the existing setFieldValue path');
    assert.equal(new Date('2026-03-01').getDate(), 28, 'sanity: TZ is west of UTC, so a UTC-midnight Date is the previous evening');
});

test('Tolaria fixture: `due: 2026-03-01` is stored as the date 20260301, no time, not Feb 28', async () => {
    const { thymer, plugin } = setup();
    const report = await plugin.applyImportPlan(await plugin.parseTolariaVault(dirHandle(path.join(fixtures, 'tolaria'))), fast);
    assert.deepEqual(report.errors, []);
    const due = thymer.recordByTitle('Projects', 'Alpha Project').prop('due').values();
    assert.deepEqual(due, [{ d: '20260301' }]);
});

test('Notion fixture: date-only, timed and ranged `Made On` values', async () => {
    const { thymer, plugin } = setup();
    const report = await plugin.applyImportPlan(await plugin.parseNotionExport(dirHandle(path.join(fixtures, 'notion'))), fast);
    assert.deepEqual(report.errors, []);
    const made = (title) => thymer.recordByTitle('Recipes', title).prop('made_on').values();
    assert.deepEqual(made('Pancakes'), [{ d: '20240303' }]);
    assert.deepEqual(made('Waffles'), [{ d: '20240401', t: '153000' }]);
    assert.deepEqual(made('Untitled'), [{ d: '20240509', r: { d: '20240510' } }]);
});

test('Notion: a range whose end does not parse keeps the start only and is reported', () => {
    const { plugin } = setup();
    assert.deepEqual(plugin._notionDateCell('May 9, 2024 → May 10, 2024'), { value: '2024-05-09/2024-05-10', range: true, kept: true });
    assert.deepEqual(plugin._notionDateCell('May 9, 2024 → soon'), { value: '2024-05-09', range: true, kept: false });
    assert.deepEqual(plugin._notionDateCell('May 9, 2024'), { value: '2024-05-09', range: false, kept: false });
    assert.equal(plugin._notionDateCell('later'), null);
});

// ---- 2. stray images --------------------------------------------------------------------------

test('images that were not imported become plain links; alt, then file name, is the link text', () => {
    const { plugin } = setup();
    const r = (s) => plugin._planRewriteStrayImages(s);
    assert.equal(r('![gone](attachments/missing.png)'), '[gone](attachments/missing.png)');
    assert.equal(r('![web](https://example.invalid/x.png)'), '[web](https://example.invalid/x.png)');
    assert.equal(r('![](attachments/My%20Photo.png)'), '[My Photo.png](attachments/My%20Photo.png)');
    assert.equal(r('![  ](https://example.invalid/a/b/c.jpg?w=2#x)'), '[c.jpg](https://example.invalid/a/b/c.jpg?w=2#x)');
    assert.equal(r('a ![one](x.png "t") and ![two](<y z.png>) end'), 'a [one](x.png "t") and [two](<y z.png>) end');
    assert.equal(r('a [link](x.png) stays, so does text ! [x]'), 'a [link](x.png) stays, so does text ! [x]');
    assert.equal(r('no images here'), 'no images here');
});

test('asset placeholders are not touched', () => {
    const { plugin } = setup();
    assert.equal(plugin._planRewriteStrayImages('before ⟦asset:A1⟧ after'), 'before ⟦asset:A1⟧ after');
    assert.equal(plugin._planRewriteStrayImages('![alt](⟦asset:A1⟧)'), '![alt](⟦asset:A1⟧)');
});

test('fenced blocks and inline code (single and double backtick) stay literal', () => {
    const { plugin } = setup();
    const r = (s) => plugin._planRewriteStrayImages(s);
    const md = [
        'real ![a](a.png)', '```', '![fenced](f.png)', '```', '~~~md', '![tilde](t.png)', '~~~',
        '````', '```', '![nested](n.png)', '````',
        'span `![x](y.png)` and ``![x](attachments/diagram.png)`` and ![b](b.png)',
        '```js inline```? ![c](c.png)'
    ].join('\n');
    assert.equal(r(md), [
        'real [a](a.png)', '```', '![fenced](f.png)', '```', '~~~md', '![tilde](t.png)', '~~~',
        '````', '```', '![nested](n.png)', '````',
        'span `![x](y.png)` and ``![x](attachments/diagram.png)`` and [b](b.png)',
        '```js inline```? [c](c.png)'
    ].join('\n'));
});

test('applyImportPlan: a missing and an external image leave a link, no "!" text; the uploaded one is still an image', async () => {
    const { thymer, plugin } = setup();
    const plan = plugin.createImportPlan('synthetic');
    plan.collections.push({ key: 'c', name: 'Pages', icon: 'ti-file', fields: [] });
    const rec = { key: 'r', collection: 'c', title: 'Imgs', sourcePath: 'imgs.md', values: {} };
    plan.records.push(rec);
    const img = plugin.planAsset(plan, 'r', { sourcePath: 'a/ok.png', name: 'ok.png', raw: '![ok](a/ok.png)', readBytes: async () => new Uint8Array([1, 2, 3]) });
    rec.body = [img, 'Gone: ![gone](attachments/missing.png)', 'Web: ![web](https://example.invalid/x.png)', '```', '![code](c.png)', '```'].join('\n');
    plan.journal.push({ date: '2026-03-01', markdown: 'Day ![j](https://example.invalid/j.png)' });
    thymer.addJournal();
    const report = await plugin.applyImportPlan(plan, fast);
    assert.deepEqual(report.errors, []);
    const items = (await thymer.dump('Pages'))[0].items;
    assert.equal(items.filter(i => i.type === 'image').length, 1);
    const text = items.map(i => i.text).join('\n');
    assert.ok(text.includes('Gone: [gone](attachments/missing.png)'), text);
    assert.ok(text.includes('Web: [web](https://example.invalid/x.png)'), text);
    assert.ok(text.includes('![code](c.png)'), 'fenced content is untouched');
    assert.ok(!/Gone: !/.test(text));
    const page = await thymer.collections.find(c => c.isJournalPlugin()).getJournalRecord(thymer.users[0], FakeDateTime.dateOnly(2026, 2, 1));
    assert.equal((await page.getLineItems(false))[0].text, 'Day [j](https://example.invalid/j.png)');
});

test('the Tolaria fixture: only the missing and external images are rewritten, the code span is literal', async () => {
    const { plugin } = setup();
    const plan = await plugin.parseTolariaVault(dirHandle(path.join(fixtures, 'tolaria')));
    const body = plan.records.find(r => r.title === 'Alpha Project').body;
    const out = plugin._planRewriteStrayImages(body);
    assert.ok(out.includes('[gone](attachments/missing.png)'));
    assert.ok(out.includes('[web](https://example.invalid/x.png)'));
    assert.ok(out.includes('``![x](attachments/diagram.png)``'));
    assert.ok(out.includes('![fenced](attachments/diagram.png)'));
    assert.ok(!/(^|[^`])!\[[^\]]*\]\(/m.test(out.replace(/```[\s\S]*?```/g, '').replace(/`+[^`]*`+/g, '')), 'no image syntax left outside code');
});

// ---- 3. Notion callouts -----------------------------------------------------------------------

function convert(plugin, text) {
    const ctx = { diag: { html: { asides: 0, otherTags: {} }, assets: { dataUrisDropped: 0 } } };
    return plugin._notionConvertBody(ctx, { key: 'k', title: 't', dir: '' }, text.split('\n'));
}

test('callouts: blank lines inside an <aside> produce no empty quote lines', () => {
    const { plugin } = setup();
    const out = convert(plugin, ['<aside>', '💡 First.', '', 'Second.', '', '', '- one', '- two', '', '</aside>', 'After.'].join('\n'));
    assert.equal(out, ['> 💡 First.', '> Second.', '> - one', '> - two', '', 'After.'].join('\n'));
    assert.ok(!out.split('\n').some(l => l.trim() === '>'));
});

test('callouts: nested asides and an inline aside are also free of empty quote lines', () => {
    const { plugin } = setup();
    assert.equal(convert(plugin, ['<aside>', 'outer', '', '<aside>', 'inner', '', '</aside>', '', 'more', '</aside>'].join('\n')),
        ['> outer', '> > inner', '> more'].join('\n'));
    assert.equal(convert(plugin, '<aside>one line</aside>'), '> one line');
});

test('callouts: blank lines in a code fence inside the callout are kept (the fence must stay one block)', () => {
    const { plugin } = setup();
    assert.equal(convert(plugin, ['<aside>', '```', 'a', '', 'b', '```', '</aside>'].join('\n')), ['> ```', '> a', '>', '> b', '> ```'].join('\n'));
});

test('other blockquotes are left exactly as they were', () => {
    const { plugin } = setup();
    const md = ['> quoted', '>', '> still quoted', '', 'plain', '', '> another'].join('\n');
    assert.equal(convert(plugin, md), md);
});
