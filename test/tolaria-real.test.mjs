// Parses a real Tolaria vault and applies the plan to the fake. Skipped unless TOLARIA_VAULT is set:
//   TOLARIA_VAULT="/path/to/vault" npm test
// It reads the vault and never writes to it or copies anything out of it; only counts are printed.
// The expected numbers describe the maintainer's own vault as of 2026-11-10 and will need updating
// when that vault changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newPlugin } from './lib/load-plugin.mjs';
import { dirHandle } from './lib/fs-handle.mjs';
import { FakeThymer, FakeDateTime } from './lib/fake-thymer.mjs';

const VAULT = process.env.TOLARIA_VAULT;

test('real vault: plan counts and import into the fake', { skip: VAULT ? false : 'TOLARIA_VAULT is not set' }, async () => {
    const plugin = newPlugin({ DateTime: FakeDateTime });
    const thymer = new FakeThymer();
    plugin.data = thymer.data;

    const plan = await plugin.parseTolariaVault(dirHandle(VAULT));
    assert.deepEqual(plugin.validateImportPlan(plan), []);
    const report = await plugin.applyImportPlan(plan, { sleep: async () => {} });

    const perCollection = Object.fromEntries(plan.collections.map(c => [c.name, plan.records.filter(r => r.collection === c.key).length]));
    const bodyLinks = plan.links.filter(l => l.where === 'body').length;
    const propLinks = plan.links.filter(l => l.where === 'property').length;
    const p = plan.parseReport;
    const summary = {
        collections: perCollection,
        records: plan.records.length,
        links: { planned: plan.links.length, body: bodyLinks, property: propLinks, resolved: report.counts.linksResolved, unresolved: report.counts.linksUnresolved },
        unresolvedRefs: report.unresolvedLinks.map(u => u.ref).sort(),
        assets: { planned: plan.assets.length, uploaded: report.counts.assetsUploaded, distinctFiles: new Set(plan.assets.map(a => a.sourcePath)).size, unreferencedInVault: p.unreferencedAttachments.length },
        unusedTypes: p.unusedTypes,
        untyped: p.untypedNotes,
        skipped: p.skipped.map(s => s.path),
        ignoredFolders: p.vault.ignoredFolders,
        droppedKeys: p.droppedKeys,
        mergedKeys: p.mergedKeys,
        iconFallbacks: p.iconFallbacks,
        errors: report.errors.length
    };
    console.log(`[tolaria real vault] ${JSON.stringify(summary, null, 2)}`);

    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.warnings, []);
    assert.deepEqual(perCollection, { Operations: 2, Projects: 7, Topics: 4, Notes: 3 });
    assert.equal(plan.collections.length, 4);
    assert.equal(plan.records.length, 16);
    assert.equal(report.counts.collectionsCreated, 4);
    assert.equal(report.counts.recordsCreated, 16);
    assert.equal(report.counts.recordsFailed, 0);
    assert.equal(plan.links.length, 26);
    assert.equal(bodyLinks, 15);
    assert.equal(propLinks, 11);
    assert.equal(report.counts.linksResolved, 17);
    assert.equal(report.counts.linksUnresolved, 9);
    // 9 unresolved: README's 8 links to type documents (not records) plus 1 dangling target in an imported note.
    // Dangling targets inside skipped agent docs or code fences are not planned at all.
    const typeSlugs = new Set(p.typeDefinitions.map(d => d.slug.toLowerCase()));
    const toTypeDocs = report.unresolvedLinks.filter(u => typeSlugs.has(u.ref.toLowerCase()));
    assert.equal(toTypeDocs.length, 8);
    assert.equal(p.linksToTypeDefinitions, 8);
    assert.equal(report.unresolvedLinks.length - toTypeDocs.length, 1);
    assert.equal(plan.assets.length, 4);
    assert.equal(report.counts.assetsUploaded, 4);
    assert.equal(report.counts.assetsFailed, 0);
    assert.deepEqual(p.unusedTypes.sort(), ['Event', 'Person', 'Responsibility', 'Task']);
    assert.deepEqual(p.untypedNotes, []);
    assert.deepEqual(p.skipped.map(s => s.path).sort(), ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']);
    assert.ok(!plan.records.some(r => r.sourcePath.startsWith('.') || r.sourcePath.startsWith('attachments/')));
});
