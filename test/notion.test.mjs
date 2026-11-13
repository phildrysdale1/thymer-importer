// Notion export source: parseNotionExport() on the synthetic fixture, plus applyImportPlan() on the fake Thymer.
// The fixture (test/fixtures/notion) is made up; it mirrors the structure of a real "Markdown & CSV" export.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPlugin } from './lib/load-plugin.mjs';
import { dirHandle } from './lib/fs-handle.mjs';
import { FakeThymer, FakeDateTime } from './lib/fake-thymer.mjs';

const FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/notion');
const fast = { sleep: async () => {} };
const plugin = newPlugin({ DateTime: FakeDateTime });

// ids made up by test/fixtures/notion (md5 of a label)
const ID = {
    recipes: '628e6796eba8d9bcde3d42f4e530c178', ingredients: 'ce42f3611bc9e713502602c38f7a0fc9',
    Pancakes: 'aba8e0580e9ead206618a2b0cf1f7645', Waffles: '5102d5e92d1c5a0094c1c4ad7f725aad',
    Flour: '34ed21acfd45b8e069ad582906e8c710', Eggs: 'af89f6101d60d2eae82d3133e9321a91',
    missing: 'f74d01e83a5195444ac591267082e2f5'
};

const parsed = await plugin.parseNotionExport(dirHandle(FIXTURE));
const rec = (title) => parsed.records.find(r => r.title === title);
const col = (name) => parsed.collections.find(c => c.name === name);
const fieldSummary = (c) => c.fields.map(f => [f.id, f.type, f.many ? 'many' : '', f.target ? f.target.replace(/^notion-db:/, '').slice(0, 4) : '', f.clearOnly ? 'clear-only' : ''].filter(Boolean).join(':'));

/** A pickFolder() "filelist" result for the fixture, as the webkitdirectory fallback produces it. */
function fixtureFileList() {
    const files = [];
    const walk = (dir, rel) => {
        for (const name of readdirSync(dir).sort()) {
            const abs = path.join(dir, name);
            if (statSync(abs).isDirectory()) { walk(abs, `${rel}/${name}`); continue; }
            files.push({
                name, webkitRelativePath: `${rel}/${name}`,
                text: async () => readFileSync(abs, 'utf8'),
                arrayBuffer: async () => { const b = readFileSync(abs); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
            });
        }
    };
    walk(FIXTURE, 'notion');
    return { kind: 'filelist', files };
}

test('collections: one per database (separate ExportBlocks), names without ids, plus Notion Pages', () => {
    assert.deepEqual(parsed.collections.map(c => c.name), ['Ingredients', 'Recipes', 'Notion Pages']);
    assert.deepEqual(parsed.collections.map(c => c.icon), ['ti-database', 'ti-database', 'ti-file-text']);
    assert.deepEqual(plugin.validateImportPlan(parsed), []);
    assert.equal(parsed.source, 'notion');
    assert.equal(parsed.records.length, 12);
});

test('column types: BOM stripped, multi-select -> choice many, dates, Yes/No choice, url, number, _all-only column', () => {
    assert.deepEqual(fieldSummary(col('Recipes')), [
        'cuisine:choice', 'tags:choice:many', 'made_on:datetime', 'rating:number', 'source:url',
        'ingredients:record:many:ce42', 'ingredients_text:text', 'pairs_with:choice', 'vegetarian:choice'
    ]);
    // used_in_text: nothing is left over in this export, so the companion is only declared to clear an earlier import's text
    assert.deepEqual(fieldSummary(col('Ingredients')), ['category:choice', 'used_in:record:many:628e', 'used_in_text:text:clear-only']);
    for (const c of parsed.collections) for (const f of c.fields) assert.ok(!/﻿/.test(f.label), 'no BOM in a field label');
    assert.equal(col('Recipes').fields[0].label, 'Cuisine', 'title column (Name) is the record title, not a field');
    // vegetarian exists only in Recipes_all.csv, and comes after the view's columns
    assert.ok(parsed.parseReport.databases.find(d => d.name === 'Recipes').csv.columnsOnlyInAll.includes('Vegetarian'));
});

test('values keep the source spelling (dates, multi-select, numbers); the engine converts them by the persisted field', () => {
    assert.equal(rec('Pancakes').values.made_on, 'March 3, 2024');
    assert.equal(rec('Waffles').values.made_on, 'April 1, 2024 3:30 PM');
    assert.equal(rec('Untitled').values.made_on, 'May 9, 2024 → May 10, 2024');
    const recipes = parsed.parseReport.databases.find(d => d.name === 'Recipes');
    assert.equal(recipes.dateRangesKept, 1);
    assert.equal(recipes.dateRangesTruncated, 0);
    assert.equal(rec('Pancakes').values.tags, 'Breakfast, Sweet');
    assert.equal(rec('Waffles').values.tags, 'Breakfast');
    assert.equal(rec('Pancakes').values.rating, '4', 'a string: only a persisted number field turns it into a number');
    assert.equal(rec('Pancakes').values.vegetarian, 'Yes');
    assert.equal(rec('Soup').values.vegetarian, 'No');
    assert.equal(rec('Ratatouille').values.made_on, undefined, 'empty cells are not set');
    assert.equal(rec('Pancakes').values.source, 'https://example.invalid/pancakes');
});

test('rows and pages are paired by title; leftovers are reported, not dropped', () => {
    const d = parsed.parseReport.databases.find(x => x.name === 'Recipes');
    assert.equal(d.rows, 6);
    assert.equal(d.pages, 6);
    assert.equal(d.matched, 5);
    assert.deepEqual(d.rowsWithoutPage, ['Tea']);
    assert.deepEqual(d.pagesWithoutRow.map(p => p.title), ['Draft Smoothie']);

    assert.ok(rec('Soup'), 'CSV name with a trailing space matches page "Soup"');
    assert.match(rec('Soup').sourcePath, /Recipes\/Soup 551dac1f[0-9a-f]+\.md$/);
    assert.equal(rec('Untitled').body, 'Scribbled idea.', 'empty CSV name pairs with the "Untitled" page');
    assert.equal(rec('Untitled').values.cuisine, 'American');

    assert.equal(rec('Tea').body, '');
    assert.match(rec('Tea').sourcePath, /_ExportBlock-[^/]+\/Recipes\/Tea$/);
    assert.equal(rec('Tea').values.tags, 'Breakfast, Drinks');

    // the page with no CSV row is a record in the same collection; with nothing to strip against, its text is kept whole
    assert.equal(rec('Draft Smoothie').collection, col('Recipes').key);
    assert.deepEqual(rec('Draft Smoothie').values, {});
    assert.match(rec('Draft Smoothie').body, /^Cuisine: Nowhere\nRating: 9\n\nA page the CSV view does not list\.$/);
});

test('titles lose the id suffix; source_path keeps the full relative path; ids become aliases', () => {
    const p = rec('Pancakes');
    assert.equal(p.sourcePath, `7a1f0c52-0000-4000-8000-00000000000a_ExportBlock-5b3c9e10-0000-4000-8000-00000000000a/Recipes/Pancakes ${ID.Pancakes}.md`);
    assert.equal(p.key, `notion:${ID.Pancakes}`);
    assert.deepEqual(p.aliases, [{ kind: 'notion_id', value: ID.Pancakes }]);
    assert.equal(rec('Kitchen Notes').collection, 'notion-pages');
    assert.equal(rec('Kitchen Notes').sourcePath, `Kitchen Notes 38268d4928c3ce98797e3d8f9883ca7e.md`);
});

test('relations: Notion URLs (several per cell, ?pvs=21) become property links by id; unresolved ones are kept as text and reported', () => {
    const links = (title, field) => parsed.links.filter(l => l.where === 'property' && l.from === rec(title).key && l.field === field);
    assert.deepEqual(links('Pancakes', 'ingredients').map(l => l.target), [
        { ref: ID.Flour, kind: 'notion_id' }, { ref: ID.Eggs, kind: 'notion_id' }
    ]);
    assert.deepEqual(links('Waffles', 'ingredients').map(l => l.target.ref), [ID.Eggs]);
    assert.deepEqual(links('Ratatouille', 'ingredients').map(l => l.target.ref), [ID.Flour]);
    assert.deepEqual(links('Flour', 'used_in').map(l => l.target.ref), [ID.Pancakes, 'ca3ebfebb0e4fc8c640eb0638c3881dc']);
    assert.equal(rec('Pancakes').values.ingredients, undefined, 'record fields are filled by links only');

    // the page outside the export: reported, and the URL is kept in the companion text field
    assert.deepEqual(parsed.parseReport.relations.unresolved, [{ collection: 'Recipes', record: 'Ratatouille', column: 'Ingredients', id: ID.missing }]);
    assert.equal(rec('Ratatouille').values.ingredients_text, `https://www.notion.so/Saffron-${ID.missing}`);
    // plain text in a relation column is not auto-linked either
    assert.equal(rec('Soup').values.ingredients_text, 'Flour, Eggs');
    assert.equal(links('Soup', 'ingredients').length, 0);

    const rc = parsed.parseReport.relations.columns.find(c => c.collection === 'Recipes');
    assert.equal(rc.resolved, 4);
    assert.equal(rc.textLeftOver, 2);
});

test('text columns that exactly name rows of one other database are reported as link-by-title candidates, not linked', () => {
    const c = parsed.parseReport.linkByTitleCandidates;
    assert.equal(c.length, 1);
    assert.equal(c[0].collection, 'Recipes');
    assert.equal(c[0].column, 'Pairs With');
    assert.equal(c[0].targetName, 'Ingredients');
    assert.equal(c[0].matched, 6);
    assert.equal(c[0].total, 6);
    assert.equal(col('Recipes').fields.find(f => f.id === 'pairs_with').type, 'choice');
    assert.equal(rec('Pancakes').values.pairs_with, 'Milk');
});

test('options.linkByTitle turns a candidate column into a record field linked by exact title', async () => {
    const plan = await plugin.parseNotionExport(dirHandle(FIXTURE), { linkByTitle: ['Recipes.Pairs With'] });
    const f = plan.collections.find(c => c.name === 'Recipes').fields.find(x => x.id === 'pairs_with');
    assert.equal(f.type, 'record');
    assert.equal(f.target, `notion-db:${ID.ingredients}`);
    const pancakes = plan.records.find(r => r.title === 'Pancakes');
    const link = plan.links.find(l => l.from === pancakes.key && l.field === 'pairs_with');
    assert.equal(link.target.kind, 'key');
    assert.equal(link.target.ref, plan.records.find(r => r.title === 'Milk').key);
    assert.equal(pancakes.values.pairs_with, undefined);
    assert.deepEqual(plan.parseReport.linkByTitleCandidates, []);
    assert.deepEqual(plugin.validateImportPlan(plan), []);
});

test('row page bodies: the property block is stripped, a body line that only looks like one is kept', () => {
    assert.ok(!/Cuisine:|Ingredients:|Tags:/.test(rec('Pancakes').body));
    assert.equal(rec('Waffles').body, 'Crisp outside.');
    assert.equal(rec('Ratatouille').body, 'Note: this body line looks like a property but is not a column.');
    assert.equal(rec('Soup').body, '', 'a page that is only a property block has an empty body');
    assert.ok(!rec('Pancakes').body.startsWith('# '), 'the H1 is the title, not body text');
});

test('body links: relative .md and Notion URLs in the export become links; external and outside-export links stay', () => {
    const body = rec('Pancakes').body;
    const bodyLinks = parsed.links.filter(l => l.where === 'body' && l.from === rec('Pancakes').key);
    assert.deepEqual(bodyLinks.map(l => [l.target.ref, l.target.kind, l.label]), [
        [ID.Waffles, 'notion_id', 'Waffles'],
        [ID.Flour, 'notion_id', 'flour']
    ]);
    for (const l of bodyLinks) assert.ok(body.includes(`⟦link:${l.id}⟧`));
    assert.ok(body.includes('[the web](https://example.invalid/more)'), 'external link untouched');
    assert.ok(body.includes(`[someone](https://www.notion.so/Someone-${ID.missing})`), 'page outside the export stays a plain link');
    assert.deepEqual(parsed.parseReport.bodyLinks.outsideExport, [{ from: 'Pancakes', id: ID.missing }]);

    const notes = parsed.links.find(l => l.from === rec('Kitchen Notes').key);
    assert.equal(notes.target.ref, ID.Pancakes, 'relative path with an ExportBlock folder resolves by id');
});

test('images become assets resolved relative to the page; inline data: images are dropped', async () => {
    const [asset] = parsed.assets;
    assert.equal(parsed.assets.length, 1);
    assert.equal(asset.record, rec('Pancakes').key);
    assert.match(asset.sourcePath, /Recipes\/Pancakes\/photo\.png$/);
    assert.equal(asset.name, 'photo.png');
    assert.equal(asset.raw, '![](Pancakes/photo.png)');
    assert.ok(rec('Pancakes').body.includes(`⟦asset:${asset.id}⟧`));
    const bytes = new Uint8Array(await asset.readBytes());
    assert.deepEqual(Array.from(bytes.slice(0, 4)), [137, 80, 78, 71]);
    assert.ok(!/data:image/.test(rec('Pancakes').body));
    assert.equal(parsed.parseReport.assets.dataUrisDropped, 1);
    assert.ok(!/\n\n\n/.test(rec('Pancakes').body), 'dropping the data: image leaves no blank run');
});

test('<aside> callouts become blockquotes, separated from the paragraph that follows', () => {
    assert.equal(rec('Kitchen Notes').body, [
        '*Written by nobody*', '',
        '> 💡 **Keep knives sharp.**', '> And tidy.', '> - one', '> - two', '',
        'Text right after the callout.', '',
        '> Inline callout', '',
        'See ' + `⟦link:${parsed.links.find(l => l.from === rec('Kitchen Notes').key).id}⟧` + '.'
    ].join('\n'));
    assert.equal(parsed.parseReport.html.asides, 2);
    assert.deepEqual(parsed.parseReport.html.otherTags, {});
});

test('plan snapshot: the key parts of the ImportPlan', () => {
    const slim = {
        collections: parsed.collections.map(c => ({ name: c.name, icon: c.icon, fields: fieldSummary(c) })),
        records: parsed.records.map(r => `${r.collection === 'notion-pages' ? 'pages' : r.collection.replace(/^notion-db:/, '').slice(0, 4)}/${r.title}`),
        links: parsed.links.map(l => `${l.where}:${l.field || ''}`).reduce((a, k) => ({ ...a, [k]: (a[k] || 0) + 1 }), {}),
        assets: parsed.assets.length
    };
    assert.deepEqual(slim, {
        collections: [
            { name: 'Ingredients', icon: 'ti-database', fields: ['category:choice', 'used_in:record:many:628e', 'used_in_text:text:clear-only'] },
            { name: 'Recipes', icon: 'ti-database', fields: fieldSummary(col('Recipes')) },
            { name: 'Notion Pages', icon: 'ti-file-text', fields: [] }
        ],
        records: [
            'ce42/Flour', 'ce42/Eggs', 'ce42/Milk', 'ce42/Sugar',
            '628e/Pancakes', '628e/Waffles', '628e/Ratatouille', '628e/Soup', '628e/Untitled', '628e/Tea', '628e/Draft Smoothie',
            'pages/Kitchen Notes'
        ],
        links: { 'property:used_in': 3, 'property:ingredients': 4, 'body:': 3 },
        assets: 1
    });
    JSON.stringify(parsed); // plain data (readBytes is a function and is simply omitted)
});

test('a pickFolder() file list gives the same plan as a directory handle', async () => {
    const viaList = await plugin.parseNotionExport(fixtureFileList());
    const strip = (plan) => JSON.parse(JSON.stringify(plan));
    assert.deepEqual(strip(viaList), strip(parsed));
    assert.equal((await viaList.assets[0].readBytes()).byteLength, (await parsed.assets[0].readBytes()).byteLength);
});

test('a database whose rows folder is spelled differently from its csv (sanitised characters) still finds its pages', () => {
    const id = '0'.repeat(31) + '1';
    const texts = new Map([
        [`Q&A ${id}.csv`, '\uFEFFName,Votes\nHow,3\nWhy,5\nWho,3'],
        [`Q_A/How ${'1'.repeat(32)}.md`, '# How\n\nVotes: 3\n\nLike this.'],
        [`Q_A/Why ${'2'.repeat(32)}.md`, '# Why\n\nVotes: 5\n']
    ]);
    const plan = plugin._notionBuildPlan({ files: new Map(), texts }, {});
    const d = plan.parseReport.databases[0];
    assert.deepEqual([d.rows, d.pages, d.matched, d.rowsWithoutPage], [3, 2, 2, ['Who']]);
    assert.equal(plan.records.find(r => r.title === 'How').body, 'Like this.');
    assert.equal(plan.parseReport.standalonePages, 0);
});

test('not a folder: a clear error', async () => {
    await assert.rejects(() => plugin.parseNotionExport(null), /directory handle/);
});

test('summary for the dialog lists counts, unresolved relations, candidates and notes', async () => {
    const summary = plugin._notionSummarize(parsed, { counts: { recordsCreated: 12, linksResolved: 10, linksUnresolved: 0 }, unresolvedLinks: [], errors: [], warnings: [] });
    const titles = summary.sections.map(s => s.title);
    assert.ok(titles.some(t => t.startsWith('Relations to pages outside this export (')));
    assert.ok(titles.some(t => t.startsWith('Columns that name rows of another database')));
    assert.ok(titles.some(t => t.startsWith('Rows without a page')));
    assert.ok(titles.some(t => t.startsWith('Pages without a CSV row')));
    assert.ok(summary.counts[1].startsWith('Records: 12 created'));
    const colors = { info: '#0', warning: '#0', error: '#0', text: '#0', textSecondary: '#0' };
    assert.match(plugin._notionReportHtml({ counts: ['a<b'], sections: [{ title: 'T', tone: 'error', items: ['<script>'] }] }, colors), /a&lt;b[\s\S]*&lt;script&gt;/);
});

// ---- applyImportPlan on the fake ------------------------------------------------

function applySetup() {
    const thymer = new FakeThymer();
    const p = newPlugin({ DateTime: FakeDateTime });
    p.data = thymer.data;
    return { thymer, p };
}

test('applyImportPlan: collections, typed properties, relations, body links and the image', async () => {
    const { thymer, p } = applySetup();
    const plan = await p.parseNotionExport(dirHandle(FIXTURE));
    const report = await p.applyImportPlan(plan, fast);

    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.warnings, []);
    assert.equal(report.counts.collectionsCreated, 3);
    assert.equal(report.counts.recordsCreated, 12);
    assert.equal(report.counts.assetsUploaded, 1);
    assert.equal(report.counts.linksUnresolved, 0);
    assert.equal(report.counts.linksResolved, 10);

    const cfg = thymer.collection('Recipes').getConfiguration();
    const byId = Object.fromEntries(cfg.fields.map(f => [f.id, f]));
    assert.equal(byId.ingredients.type, 'record');
    assert.equal(byId.ingredients.many, true);
    assert.equal(byId.ingredients.filter_colguid, thymer.collection('Ingredients').getGuid());
    assert.equal(byId.tags.many, true);
    assert.deepEqual(byId.tags.choices.map(c => c.label), ['Breakfast', 'Sweet', 'Dinner', 'Vegetarian', 'Drinks']);
    assert.deepEqual(byId.vegetarian.choices.map(c => c.label), ['Yes', 'No']);

    const pancakes = thymer.recordByTitle('Recipes', 'Pancakes');
    assert.deepEqual(pancakes.linkedRecords('ingredients').map(r => r.getName()), ['Flour', 'Eggs']);
    assert.equal(pancakes.number('rating'), 4);
    assert.equal(pancakes.prop('made_on').values()[0].d, '20240303');
    assert.deepEqual(pancakes.prop('tags').selectedChoiceLabels(), ['Breakfast', 'Sweet']);
    assert.equal(pancakes.text('source_path'), plan.records.find(r => r.title === 'Pancakes').sourcePath);
    assert.deepEqual(thymer.recordByTitle('Recipes', 'Ratatouille').linkedRecords('ingredients').map(r => r.getName()), ['Flour']);
    assert.equal(thymer.recordByTitle('Recipes', 'Ratatouille').text('ingredients_text'), `https://www.notion.so/Saffron-${ID.missing}`);
    assert.deepEqual(thymer.recordByTitle('Ingredients', 'Flour').linkedRecords('used_in').map(r => r.getName()), ['Pancakes', 'Ratatouille']);

    const dump = await thymer.dump('Recipes');
    const items = dump.find(r => r.title === 'Pancakes').items;
    const refTitles = items.flatMap(i => i.segments.filter(s => s.type === 'ref')).map(s => s.text.title);
    assert.deepEqual(refTitles, ['Waffles', 'flour']);
    assert.equal(items.filter(i => i.type === 'image').length, 1);
    assert.ok(!items.some(i => /⟦/.test(i.text)), 'no placeholders left behind');

    const kitchen = (await thymer.dump('Notion Pages'))[0].items;
    assert.ok(kitchen.some(i => i.segments.some(s => s.type === 'ref')), 'link from a standalone page to a database row');
});

test('applyImportPlan twice: the second run updates in place', async () => {
    const { thymer, p } = applySetup();
    await p.applyImportPlan(await p.parseNotionExport(dirHandle(FIXTURE)), fast);
    const guids = Array.from(thymer.records.keys());
    const report = await p.applyImportPlan(await p.parseNotionExport(dirHandle(FIXTURE)), fast);
    assert.deepEqual(report.errors, []);
    assert.equal(report.counts.recordsCreated, 0);
    assert.equal(report.counts.recordsUpdated, 12);
    assert.deepEqual(Array.from(thymer.records.keys()), guids);
    assert.equal(thymer.collections.length, 3);
});

// ---- the dialog path (stub DOM: only what the Notion branch touches) ------------

test('dialog: picking "Notion export" skips the collection choice, imports, and shows the report', async () => {
    const { thymer, p } = applySetup();
    const el = (props = {}) => ({ style: {}, textContent: '', innerHTML: '', value: '', disabled: false, checked: false, insertAdjacentElement(where, e) { this.inserted = e; }, ...props });
    const els = {
        '#md-collection-select': el({ value: '' }),       // nothing selected: would be an error for the other sources
        '#md-source-select': el({ value: 'notion' }),
        '#md-status': el(), '#md-import-btn': el({ textContent: 'Import' }), '#md-cancel-btn': el({ textContent: 'Cancel' }),
        '#new-collection-name': el(), '#import-journals-checkbox': el(), '#journal-folder-input': el()
    };
    const dialog = { querySelector: (sel) => els[sel] || null };
    const realTimeout = globalThis.setTimeout;
    globalThis.document = { body: { classList: { contains: () => false }, dataset: {} }, createElement: () => el() };
    globalThis.window = { getComputedStyle: () => ({ backgroundColor: '' }) };
    globalThis.setTimeout = (fn, ms, ...args) => realTimeout(fn, 0, ...args);
    try {
        await p.performMarkdownImport(dialog, {}, dirHandle(FIXTURE));
    } finally {
        globalThis.setTimeout = realTimeout;
        delete globalThis.document;
        delete globalThis.window;
    }
    assert.match(els['#md-status'].textContent, /^Complete! 3 collection\(s\), 12 record\(s\)$/);
    assert.equal(els['#md-import-btn'].disabled, false);
    assert.equal(els['#md-cancel-btn'].textContent, 'Close');
    assert.equal(thymer.collections.length, 3);
    assert.ok(els['#md-status'].inserted, 'report container added under the status line');
    assert.match(els['#md-status'].inserted.innerHTML, /Records: 12 created/);
    assert.match(els['#md-status'].inserted.innerHTML, /Pairs With/);
});

// ---- the real export (never committed; set NOTION_EXPORT to an unzipped export folder) ----

test('real export: plan counts and summary', { skip: !process.env.NOTION_EXPORT && 'NOTION_EXPORT is not set' }, async () => {
    const plan = await plugin.parseNotionExport(dirHandle(process.env.NOTION_EXPORT));
    const r = plan.parseReport;
    const dbs = Object.fromEntries(r.databases.map(d => [d.name, d]));

    assert.deepEqual(plugin.validateImportPlan(plan), []);
    const expectedRecords = r.databases.reduce((n, d) => n + d.rows + d.pagesWithoutRow.length, 0) + r.standalonePages;
    assert.equal(plan.records.length, expectedRecords, 'every row, orphan page and standalone page is a record');
    for (const d of r.databases) assert.equal(d.matched + d.rowsWithoutPage.length, d.rows, `${d.name}: every row is paired or reported`);

    const summary = {
        collections: plan.collections.map(c => `${c.name} (${c.fields.length} fields)`),
        records: plan.records.length,
        databases: r.databases.map(d => ({ name: d.name, csvRows: d.rows, pages: d.pages, matched: d.matched, rowsWithoutPage: d.rowsWithoutPage.length, pagesWithoutRow: d.pagesWithoutRow.length, emptyColumns: d.emptyColumns, columns: d.columns.map(c => `${c.header}:${c.type}${c.many ? '*' : ''}`) })),
        standalonePages: r.standalonePages,
        propertyLinks: plan.links.filter(l => l.where === 'property').length,
        bodyLinks: plan.links.filter(l => l.where === 'body').length,
        unresolvedRelationIds: r.relations.unresolved.length,
        relationColumns: r.relations.columns,
        linkByTitleCandidates: r.linkByTitleCandidates.map(c => `${c.collection}.${c.column} -> ${c.targetName}: ${c.matched}/${c.total}${c.ofLeftOverText ? ' (of the text cells)' : ''}`),
        assets: { planned: plan.assets.length, missing: r.assets.missing.length, dataUrisDropped: r.assets.dataUrisDropped },
        html: r.html
    };
    console.log(`\nNotion export plan summary:\n${JSON.stringify(summary, null, 2)}`);

    // Exact counts for a particular export live outside the repo: NOTION_EXPECT=<json file>
    //   { "records": n, "assets": n, "propertyLinks": n, "standalonePages": n, "unresolvedRelationIds": n,
    //     "databases": { "<name>": { "rows": n, "pages": n } } }
    if (process.env.NOTION_EXPECT) {
        const want = JSON.parse(readFileSync(process.env.NOTION_EXPECT, 'utf8'));
        const got = { records: plan.records.length, assets: plan.assets.length, propertyLinks: summary.propertyLinks, standalonePages: r.standalonePages, unresolvedRelationIds: summary.unresolvedRelationIds };
        for (const k of Object.keys(got)) if (k in want) assert.equal(got[k], want[k], k);
        for (const [name, w] of Object.entries(want.databases || {})) {
            assert.ok(dbs[name], `database ${name}`);
            assert.deepEqual({ rows: dbs[name].rows, pages: dbs[name].pages }, w, name);
        }
    }
});
