// Regression tests for finding 2 of the second review round of upstream PR #3: a Notion page that was renamed in the export
// keeps its 32-hex page id, and its record must follow it. Every test here failed before the fix (run with
// PLUGIN_JS=<older plugin.js> to check), except the one titled "guard". Fixtures are synthetic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newPlugin } from './lib/load-plugin.mjs';
import { FakeThymer, FakeDateTime } from './lib/fake-thymer.mjs';

const fast = { sleep: async () => {} };

function engine() {
    const thymer = new FakeThymer();
    const p = newPlugin({ DateTime: FakeDateTime });
    p.data = thymer.data;
    return { thymer, p };
}
const inMemory = (entries) => ({ files: new Map(), texts: new Map(Object.entries(entries)) });
const notionPage = (title, body = 'Body.') => `# ${title}\n\nStatus: Open\n\n${body}\n`;
const names = (records) => records.map(r => r.getName());

// ---------------------------------------------------------------------------------------------
// Finding 2: a Notion page that was renamed keeps its page id, and the record follows it
// ---------------------------------------------------------------------------------------------

const DB_ID = '35033016139844f5dc950ed83f95f548';
const W_ID = 'aaaa1111aaaa1111aaaa1111aaaa1111';
const S_ID = 'bbbb2222bbbb2222bbbb2222bbbb2222';
const STEM = `e_ExportBlock-1/Tasks ${DB_ID}`;
const tasksExport = (writeTitle, { sibling = true } = {}) => inMemory({
    [`${STEM}.csv`]: `Name,Status\n${writeTitle},Open\n${sibling ? 'Ship release,Done\n' : ''}`,
    [`${STEM}/${writeTitle} ${W_ID}.md`]: notionPage(writeTitle),
    ...(sibling ? { [`${STEM}/Ship release ${S_ID}.md`]: notionPage('Ship release') } : {})
});

test('finding 2: a renamed page updates its record (new path, new title) instead of creating a duplicate', async () => {
    const { thymer, p } = engine();
    await p.applyImportPlan(p._notionBuildPlan(tasksExport('Write report')), fast);
    const original = thymer.recordByTitle('Tasks', 'Write report');
    thymer.staleReads = true;
    const report = await p.applyImportPlan(p._notionBuildPlan(tasksExport('Write quarterly report')), fast);
    thymer.settle();
    const all = await thymer.collection('Tasks').getAllRecords();
    assert.equal(all.length, 2, 'no third record');
    assert.deepEqual(names(all).sort(), ['Ship release', 'Write quarterly report']);
    const renamed = all.find(r => r.getName() === 'Write quarterly report');
    assert.equal(renamed.guid, original.guid, 'the same record');
    assert.equal(renamed.text('source_path'), `${STEM}/Write quarterly report ${W_ID}.md`, 'source_path follows the page');
    assert.equal(report.counts.recordsCreated, 0);
    assert.equal(report.counts.recordsUpdated, 2);
    assert.equal(report.counts.recordsRenamed, 1);
    assert.deepEqual(report.warnings, []);
});

test('finding 2: the name-clash check recognises a previous import by page id, with or without an unchanged sibling', async () => {
    for (const sibling of [true, false]) {
        const { thymer, p } = engine();
        await p.applyImportPlan(p._notionBuildPlan(tasksExport('Write report', { sibling })), fast);
        const renamedPlan = p._notionBuildPlan(tasksExport('Write quarterly report', { sibling }));
        assert.deepEqual(await p.findCollectionClashes(renamedPlan), [], `previous import (sibling: ${sibling})`);
        // a different export of the same name is still a clash
        const other = p._notionBuildPlan(inMemory({
            [`${STEM}.csv`]: 'Name,Status\nSomething else,Open\n',
            [`${STEM}/Something else cccc3333cccc3333cccc3333cccc3333.md`]: notionPage('Something else')
        }));
        assert.deepEqual((await p.findCollectionClashes(other)).map(c => c.reason), ['no-matching-records']);
        assert.ok(thymer);
    }
});

test('guard, finding 2: a page id never matches a record of a different page, and page-less rows still match by path', async () => {
    const { thymer, p } = engine();
    const files = { [`${STEM}.csv`]: 'Name,Status\nWrite report,Open\nNo page,Done\n', [`${STEM}/Write report ${W_ID}.md`]: notionPage('Write report') };
    await p.applyImportPlan(p._notionBuildPlan(inMemory(files)), fast);
    // the page is replaced by one with another id (a different page that happens to share the title)
    const swapped = { [`${STEM}.csv`]: files[`${STEM}.csv`], [`${STEM}/Write report ${S_ID}.md`]: notionPage('Write report') };
    const report = await p.applyImportPlan(p._notionBuildPlan(inMemory(swapped)), fast);
    assert.equal(report.counts.recordsCreated, 1, 'a different page is a different record');
    assert.equal(report.counts.recordsUpdated, 1, 'the page-less row is matched by its path');
    assert.equal((await thymer.collection('Tasks').getAllRecords()).length, 3);
});

test('finding 2: with existing: "skip" a renamed page is skipped, not duplicated', async () => {
    const { thymer, p } = engine();
    await p.applyImportPlan(p._notionBuildPlan(tasksExport('Write report')), fast);
    const report = await p.applyImportPlan(p._notionBuildPlan(tasksExport('Write quarterly report')), { ...fast, existing: 'skip' });
    assert.equal(report.counts.recordsCreated, 0);
    assert.equal(report.counts.recordsSkipped, 2);
    assert.equal((await thymer.collection('Tasks').getAllRecords()).length, 2);
    assert.equal(thymer.recordByTitle('Tasks', 'Write report').text('source_path'), `${STEM}/Write report ${W_ID}.md`, 'untouched');
});

