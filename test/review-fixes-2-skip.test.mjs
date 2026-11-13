// Regression tests for finding 6 of the second review round of upstream PR #3: with existing: 'skip', skipped records must not be
// written in the link or asset passes, and stay link targets for new records. Fixtures are synthetic.
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
const names = (records) => records.map(r => r.getName());

// ---------------------------------------------------------------------------------------------
// Finding 6: existing: 'skip' must not write in the link or asset passes, and skipped records stay link targets
// ---------------------------------------------------------------------------------------------

test('finding 6: a skipped record gets no new image, keeps its relations and body, and can still be linked to', async () => {
    const { thymer, p } = engine();
    const build = (changed) => {
        const plan = p.createImportPlan('synthetic');
        plan.collections.push({ key: 'c', name: 'Things', icon: 'ti-box', description: '', fields: [{ id: 'rel', label: 'Rel', type: 'record', many: true, target: 'c' }] });
        const rec = (key, title, extra = {}) => { const r = { key, collection: 'c', title, sourcePath: `${key}.md`, values: {}, body: '', ...extra }; plan.records.push(r); return r; };
        const a = rec('a', 'A');
        rec('b', 'B');
        rec('c', 'C');
        a.body = `${p.planAsset(plan, 'a', { sourcePath: 'img.png', name: 'img.png', raw: '![x](img.png)', readBytes: async () => new Uint8Array([1, 2, 3]) })}\nSee ${p.planBodyLink(plan, 'a', { ref: changed ? 'c' : 'b', kind: 'key' }, { label: 'there' })}`;
        p.planPropertyLink(plan, 'a', 'rel', { ref: changed ? 'c' : 'b', kind: 'key' });
        if (changed) {
            const n = rec('n', 'N');
            p.planPropertyLink(plan, 'n', 'rel', { ref: 'a', kind: 'key' });
            n.body = `Links to ${p.planBodyLink(plan, 'n', { ref: 'a', kind: 'key' }, { label: 'A' })}`;
        }
        return plan;
    };
    await p.applyImportPlan(build(false), fast);
    const a = thymer.recordByTitle('Things', 'A');
    const itemsBefore = (await a.getLineItems(false)).map(i => [i.type, i.text, JSON.stringify(i.segments)]);
    assert.equal(itemsBefore.filter(i => i[0] === 'image').length, 1);
    assert.deepEqual(names(a.linkedRecords('rel')), ['B']);

    const report = await p.applyImportPlan(build(true), { ...fast, existing: 'skip' });
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.warnings, [], 'no placeholder-not-found for a body that was not rewritten');
    assert.equal(report.counts.recordsSkipped, 3);
    assert.equal(report.counts.recordsCreated, 1);
    assert.equal(report.counts.assetsUploaded, 0, 'no second image for the skipped record');
    assert.deepEqual((await a.getLineItems(false)).map(i => [i.type, i.text, JSON.stringify(i.segments)]), itemsBefore, 'body untouched');
    assert.deepEqual(names(a.linkedRecords('rel')), ['B'], 'relation untouched');
    // the new record links to the skipped one, in its property and in its body
    const n = thymer.recordByTitle('Things', 'N');
    assert.deepEqual(names(n.linkedRecords('rel')), ['A']);
    const ref = (await n.getLineItems(false)).flatMap(i => i.segments).find(s => s.type === 'ref');
    assert.equal(ref.text.guid, a.guid);
    assert.equal(report.counts.linksResolved, 2, 'only the new record\'s links are resolved');
    assert.deepEqual(report.unresolvedLinks, []);
});

