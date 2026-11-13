// Regression tests for the third round of the automated review of upstream PR #3, finding 4: warnings are shown in the
// Tolaria and Notion reports, grouped by code, and the completion status says "Finished with warnings".
// Every test failed before its fix (run with PLUGIN_JS=<older plugin.js> to check), except the ones titled "guard".
process.env.TZ = 'America/Chicago';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engine, fast, memoryFiles, note, STEM, runNotion, runTolaria, fakeDom } from './lib/round3.mjs';

test('finding 4 (Tolaria): a rejected value is listed under its code, and the status says "Finished with warnings"', async () => {
    const ctx = engine();
    const typed = (fm, title) => note(`type: Task\n${fm}`, title);
    const typeDoc = { 'v/task.md': '---\ntype: Type\n---\n# Task\n' };
    await runTolaria(ctx, { ...typeDoc, 'v/a.md': typed('effort: 5', 'Alpha'), 'v/b.md': typed('effort: 2', 'Beta') });
    const dom = fakeDom();
    globalThis.document = dom.document;
    try {
        const origApply = ctx.p.applyImportPlan.bind(ctx.p);
        ctx.p.applyImportPlan = (plan, opts) => origApply(plan, { ...opts, ...fast });
        await ctx.p.performTolariaImport(dom.dialog, {}, memoryFiles({ ...typeDoc, 'v/a.md': typed('effort: soon', 'Alpha'), 'v/b.md': typed('effort: 2', 'Beta') }));
        const text = dom.statusText();
        assert.match(text, /^Finished with warnings/);
        assert.doesNotMatch(text, /Import complete/);
        assert.match(text, /Warnings \(1\)/);
        assert.match(text, /property-not-set \(1\)/);
        assert.match(text, /Alpha: effort: "soon" is not a number/, 'the example names the record by its title');
        assert.deepEqual(ctx.thymer.recordByTitle('Tasks', 'Alpha').prop('effort').values(), [5], 'the old value was kept, as the warning says');
    } finally {
        delete globalThis.document;
    }
});

test('finding 4 (Tolaria): no warnings says "Import complete"; problems take precedence over warnings', () => {
    const { p } = engine();
    const render = (report) => {
        const dom = fakeDom();
        globalThis.document = dom.document;
        try {
            const counts = { collectionsCreated: 0, collectionsUpdated: 0, recordsCreated: 0, recordsUpdated: 0, linksResolved: 0, linksUnresolved: 0, assetsUploaded: 0, recordsFailed: 0 };
            p.renderTolariaReport(dom.status, { records: [], parseReport: {} }, { counts, errors: [], warnings: [], unresolvedLinks: [], ...report });
            return dom.statusText();
        } finally {
            delete globalThis.document;
        }
    };
    assert.match(render({}), /^Import complete/);
    assert.match(render({ warnings: [{ code: 'x', message: 'm' }] }), /^Finished with warnings/);
    assert.match(render({ warnings: [{ code: 'x', message: 'm' }], errors: [{ pass: 2, message: 'boom' }] }), /^Finished with problems[\s\S]*Errors:[\s\S]*Warnings \(1\)/);
});

test('finding 4: warnings are grouped by code, most frequent first, with counts and the first examples', () => {
    const { p } = engine();
    const plan = { records: [{ key: 'r1', title: 'One' }, { key: 'r2', title: 'Two' }], parseReport: { warnings: ['parse note A', 'parse note B'] } };
    const warnings = [
        { code: 'fields-not-persisted', message: 'fields missing after save: x', collection: 'gear' },
        ...[1, 2, 3, 4, 5].map(i => ({ code: 'property-not-set', message: `f${i}: bad; left unchanged`, record: i % 2 ? 'r1' : 'r2' })),
        { code: 'title-not-renamed', message: 'no title property', record: 'unknown-key' }
    ];
    const { groups, total } = p._importWarnings(plan, { warnings }, { maxExamples: 3 });
    assert.equal(total, 9);
    assert.deepEqual(groups.map(g => [g.code, g.count]), [['property-not-set', 5], ['reading', 2], ['fields-not-persisted', 1], ['title-not-renamed', 1]]);
    assert.deepEqual(groups[0].examples, ['One: f1: bad; left unchanged', 'Two: f2: bad; left unchanged', 'One: f3: bad; left unchanged']);
    assert.equal(groups[0].more, 2);
    assert.equal(groups[2].examples[0], 'gear: fields missing after save: x');
    assert.equal(groups[3].examples[0], 'unknown-key: no title property');
    assert.equal(p._importWarnings({ records: [] }, { warnings: [] }).total, 0);
});

test('finding 4 (Notion): the summary lists warnings by code, and the dialog status says "Finished with warnings"', async () => {
    const ctx = engine();
    await runNotion(ctx, 'Name,Weight\nDrill,2\nSaw,3\n');
    const dom = fakeDom();
    globalThis.document = dom.document;
    try {
        const origApply = ctx.p.applyImportPlan.bind(ctx.p);
        ctx.p.applyImportPlan = (plan, opts) => origApply(plan, { ...opts, ...fast });
        const files = memoryFiles({ [`export/${STEM}.csv`]: 'Name,Weight\nDrill,heavy\nSaw,3\n' });
        await ctx.p.performNotionImport(dom.dialog, {}, files);
        const status = dom.statusText();
        assert.match(status, /^Finished with warnings/);
        assert.match(status, /1 warning\(s\)/);
        const html = dom.find('md-notion-report')._html;
        assert.match(html, /Warnings: property-not-set \(1\)/);
        assert.match(html, /Drill: weight: &quot;heavy&quot; is not a number/);
    } finally {
        delete globalThis.document;
    }
    const summary = ctx.p._notionSummarize({ collections: [], records: [], parseReport: { warnings: ['read note'] } }, { counts: {}, errors: [], unresolvedLinks: [], warnings: [{ code: 'a', message: 'm1' }, { code: 'a', message: 'm2' }, { code: 'a', message: 'm3' }, { code: 'a', message: 'm4' }] });
    const a = summary.sections.find(s => s.title === 'Warnings: a (4)');
    assert.deepEqual(a.items, ['m1', 'm2', 'm3', '…and 1 more']);
    assert.ok(summary.sections.some(s => s.title === 'Warnings: reading (1)'));
    assert.equal(summary.warnings, 5);
});

test('guard, finding 4 (Notion): no warnings is "Complete!"', async () => {
    const ctx = engine();
    const dom = fakeDom();
    globalThis.document = dom.document;
    try {
        const origApply = ctx.p.applyImportPlan.bind(ctx.p);
        ctx.p.applyImportPlan = (plan, opts) => origApply(plan, { ...opts, ...fast });
        await ctx.p.performNotionImport(dom.dialog, {}, memoryFiles({ [`export/${STEM}.csv`]: 'Name,Weight\nDrill,2\n' }));
        assert.match(dom.statusText(), /^Complete!/);
    } finally {
        delete globalThis.document;
    }
});
