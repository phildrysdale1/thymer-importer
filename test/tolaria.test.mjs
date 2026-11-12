// Tolaria source: parseTolariaVault() over the synthetic fixture (test/fixtures/tolaria), then
// applyImportPlan() against the in-memory Thymer fake. All content here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPlugin } from './lib/load-plugin.mjs';
import { dirHandle } from './lib/fs-handle.mjs';
import { FakeThymer, FakeDateTime } from './lib/fake-thymer.mjs';

const FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/tolaria');
const fast = { sleep: async () => {} };

const plugin = () => newPlugin({ DateTime: FakeDateTime });

/** A webkitdirectory-style { kind: 'filelist' } for `dir`, as if the user had picked a folder called `pickedAs`. */
function fileList(dir, pickedAs, extra = []) {
    const files = [];
    const walk = (abs, rel) => {
        for (const name of readdirSync(abs).sort()) {
            const full = path.join(abs, name);
            if (statSync(full).isDirectory()) walk(full, `${rel}/${name}`);
            else files.push(makeFile(full, `${rel}/${name}`));
        }
    };
    const makeFile = (full, rel) => {
        const file = new File([readFileSync(full)], path.basename(full));
        Object.defineProperty(file, 'webkitRelativePath', { value: rel });
        return file;
    };
    walk(dir, pickedAs);
    for (const [rel, text] of extra) {
        const file = new File([text], path.basename(rel));
        Object.defineProperty(file, 'webkitRelativePath', { value: rel });
        files.push(file);
    }
    return { kind: 'filelist', files };
}

const byKey = (items) => Object.fromEntries(items.map(i => [i.key || i.id, i]));

// ---- parsing -------------------------------------------------------------------------------------

test('fixture plan: collections come from used types only, with name, icon, description and itemName', async () => {
    const plan = await plugin().parseTolariaVault(dirHandle(FIXTURE));
    assert.equal(plan.source, 'tolaria');
    assert.deepEqual(plugin().validateImportPlan(plan), []);

    assert.deepEqual(plan.collections.map(c => [c.key, c.name, c.icon, c.itemName]), [
        ['projects', 'Projects', 'ti-rocket', 'Project'],
        ['topics', 'Topics', 'ti-refresh', 'Topic'],              // _icon arrows-clockwise is Phosphor-only -> Tabler alias
        ['notes', 'Notes', 'ti-notebook', 'Note']                  // synthesized for the untyped note
    ]);
    const cols = byKey(plan.collections);
    assert.equal(cols.projects.description, 'Projects are time-bound efforts. They have a beginning and an end. See topic.');
    assert.equal(cols.topics.description, 'Topics are areas of interest.');
    assert.equal(plan.parseReport.unusedTypes.length, 1);
    assert.deepEqual(plan.parseReport.unusedTypes, ['Person']);
    assert.ok(!plan.collections.some(c => c.name === 'People'), 'unused type makes no collection');
    assert.ok(!plan.records.some(r => /^(project|topic|person|type)$/i.test(r.title)), 'type definitions are not records');
});

test('fixture plan: fields, merged case variants, choice/url/number/datetime, relation targets', async () => {
    const plan = await plugin().parseTolariaVault(dirHandle(FIXTURE));
    const fields = (key) => byKey(plan.collections.find(c => c.key === key).fields);
    const p = fields('projects');
    assert.deepEqual(Object.keys(p), ['status', 'related_to', 'belongs_to', 'cadence', 'effort', 'due', 'url']);
    assert.equal(p.status.type, 'choice');                 // `status` + `Status` merged
    assert.equal(p.status.label, 'Status');
    assert.equal(p.url.type, 'url');
    assert.equal(p.cadence.type, 'text');
    assert.equal(p.effort.type, 'number');
    assert.equal(p.due.type, 'datetime');
    assert.deepEqual([p.related_to.type, p.related_to.many, p.related_to.target], ['record', true, 'topics'], 'every resolved link lands in Topics');
    assert.deepEqual([p.belongs_to.type, p.belongs_to.many, p.belongs_to.target], ['record', true, undefined], 'links land in two collections -> no target');
    assert.equal(p.belongs_to.label, 'Belongs To');

    const t = fields('topics');
    assert.deepEqual([t.kind.type, t.kind.many], ['choice', true]);
    assert.equal(t.url.type, 'url');
    assert.deepEqual(plan.parseReport.mergedKeys, { status: ['Status', 'status'], url: ['URL', 'url'] });

    const records = byKey(plan.records);
    assert.deepEqual(records['beta-project.md'].values, { status: 'Paused', url: 'https://example.invalid/beta' }, 'first spelling wins when one note has both');
    assert.deepEqual(records['alpha-project.md'].values, { status: 'Active', cadence: 'Weekly', effort: 3, due: '2026-03-01' });
    assert.deepEqual(records['home-lab.md'].values.kind, ['Hardware', 'Hobby']);
    assert.deepEqual(records['recipes.md'].values.kind, ['Food'], 'a one-item YAML list stays multi-value');
    for (const r of plan.records) assert.ok(!Object.keys(r.values).some(k => k.startsWith('_') || k === 'visible' || k === 'color' || k === 'type'), r.key);
    assert.equal(plan.parseReport.droppedKeys._organized, 1);
    assert.equal(plan.parseReport.droppedKeys.visible, 1);
    assert.equal(plan.parseReport.droppedKeys.color, 1);
});

test('fixture plan: skips agent docs, dotfolders and attachments/; reports untyped notes', async () => {
    const plan = await plugin().parseTolariaVault(dirHandle(FIXTURE));
    assert.deepEqual(plan.records.map(r => r.key).sort(), ['alpha-project.md', 'beta-project.md', 'home-lab.md', 'loose-note.md', 'recipes.md']);
    assert.deepEqual(plan.parseReport.skipped, [
        { path: 'AGENTS.md', reason: 'agent-doc', type: 'Note' },
        { path: 'attachments/not-a-note.md', reason: 'attachments' }
    ]);
    assert.deepEqual(plan.parseReport.vault.ignoredFolders, ['.claude', '.tolaria-rename-txn']);
    assert.deepEqual(plan.parseReport.untypedNotes, ['loose-note.md']);
    assert.equal(plan.records.find(r => r.key === 'loose-note.md').collection, 'notes');
    assert.equal(plan.records.find(r => r.key === 'loose-note.md').title, 'Loose Note', 'no H1: title from the filename');
    assert.ok(!plan.links.some(l => l.target.ref === 'tolaria'), 'links inside skipped files are never planned');
});

test('fixture plan: titles come from the H1 and the H1 is stripped; sourcePath is vault-relative', async () => {
    const plan = await plugin().parseTolariaVault(dirHandle(FIXTURE));
    const alpha = plan.records.find(r => r.key === 'alpha-project.md');
    assert.equal(alpha.title, 'Alpha Project');
    assert.equal(alpha.sourcePath, 'alpha-project.md');
    assert.ok(!alpha.body.startsWith('#'));
    assert.ok(alpha.body.startsWith('Runs on the '));
    assert.equal(plan.records.find(r => r.key === 'home-lab.md').title, 'Home Lab');
});

test('fixture plan: wikilinks and images become planned links/assets; code spans and fences are untouched', async () => {
    const plan = await plugin().parseTolariaVault(dirHandle(FIXTURE));
    const alpha = plan.records.find(r => r.key === 'alpha-project.md');
    const link = (id) => plan.links.find(l => l.id === id);
    const body = plan.links.filter(l => l.from === alpha.key && l.where === 'body');
    assert.deepEqual(body.map(l => [l.target.ref, l.label, l.raw]), [
        ['home-lab', undefined, '[[home-lab]]'],
        ['home-lab', 'the lab', '[[home-lab|the lab]]'],
        ['Home-Lab#setup', 'setup', '[[Home-Lab#setup|setup]]'],
        ['ghost-page', undefined, '[[ghost-page]]'],
        ['person', undefined, '[[person]]']
    ]);
    for (const l of body) assert.ok(alpha.body.includes(`⟦link:${l.id}⟧`), l.id);
    assert.ok(alpha.body.includes('`[[home-lab]]`'), 'inline code kept');
    assert.ok(alpha.body.includes('``![x](attachments/diagram.png)``'), 'double-backtick span kept');
    assert.ok(alpha.body.includes('```md\n[[home-lab]]\n![fenced](attachments/diagram.png)\n```'), 'fenced block kept');
    assert.ok(alpha.body.includes('![gone](attachments/missing.png)'), 'missing image left as written');
    assert.ok(alpha.body.includes('![web](https://example.invalid/x.png)'), 'external image left as written');
    assert.equal(link('L1').where, 'property');

    assert.deepEqual(plan.assets.map(a => [a.record, a.sourcePath, a.name]), [
        ['alpha-project.md', 'attachments/diagram.png', 'diagram.png'],
        ['alpha-project.md', 'attachments/diagram.png', 'diagram.png']
    ]);
    assert.equal(plan.assets[1].raw, '![again](attachments/diagram.png "title")');
    assert.deepEqual(plan.parseReport.missingAssets, [{ record: 'alpha-project.md', ref: 'attachments/missing.png' }]);
    assert.deepEqual(plan.parseReport.unreferencedAttachments, ['attachments/unused.png']);
    assert.equal(plan.parseReport.linksToTypeDefinitions, 1);
    const bytes = await plan.assets[0].readBytes();
    assert.equal(new Uint8Array(bytes)[1], 80, 'readBytes returns the PNG');
});

test('the plan is JSON-serializable', async () => {
    const plan = await plugin().parseTolariaVault(dirHandle(FIXTURE));
    const copy = JSON.parse(JSON.stringify(plan));
    assert.equal(copy.records.length, plan.records.length);
    assert.equal(copy.assets[0].readBytes, undefined);
});

test('a file list from the webkitdirectory fallback gives the same plan as a directory handle', async () => {
    const a = await plugin().parseTolariaVault(dirHandle(FIXTURE));
    const list = fileList(FIXTURE, 'Vault', [['Vault/.git/config', '[core]'], ['Vault/.git/objects/x.md', '---\ntype: Topic\n---\n# Nope']]);
    const b = await plugin().parseTolariaVault(list);
    const strip = (p) => JSON.parse(JSON.stringify({ ...p, parseReport: { ...p.parseReport, vault: undefined } }));
    assert.deepEqual(strip(b), strip(a));
    assert.deepEqual(b.parseReport.vault.ignoredFolders, ['.claude', '.git', '.tolaria-rename-txn']);
});

test('picking the parent folder (vault + Settings) imports only the vault', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'tolaria-parent-'));
    try {
        cpSync(FIXTURE, path.join(tmp, 'Vault'), { recursive: true });
        mkdirSync(path.join(tmp, 'Settings'));
        writeFileSync(path.join(tmp, 'Settings', 'app.json'), '{}');
        writeFileSync(path.join(tmp, 'Settings', 'readme.txt'), 'not a note');
        const viaHandle = await plugin().parseTolariaVault(dirHandle(tmp));
        assert.equal(viaHandle.records.length, 5);
        assert.equal(viaHandle.parseReport.vault.root, 'Vault');
        assert.ok(viaHandle.parseReport.vault.ignoredFolders.includes('Settings'));
        assert.equal(viaHandle.records[0].sourcePath, 'alpha-project.md', 'paths are relative to the vault, not the picked parent');
        assert.equal(viaHandle.assets.length, 2);

        const viaList = await plugin().parseTolariaVault(fileList(tmp, 'Parent'));
        assert.equal(viaList.records.length, 5);
        assert.equal(viaList.parseReport.vault.root, 'Vault');
        assert.ok(viaList.parseReport.vault.ignoredFolders.includes('Settings'));
        assert.deepEqual(viaList.records.map(r => r.sourcePath), viaHandle.records.map(r => r.sourcePath));
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
});

test('a note whose type has no definition gets a collection named after the type', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'tolaria-undef-'));
    try {
        writeFileSync(path.join(tmp, 'a.md'), '---\ntype: Recipe\n---\n# Pasta\n');
        writeFileSync(path.join(tmp, 'b.md'), '---\ntype: Recipe\n---\n# Soup\n');
        const plan = await plugin().parseTolariaVault(dirHandle(tmp));
        assert.deepEqual(plan.collections.map(c => c.name), ['Recipes']);
        assert.deepEqual(plan.parseReport.undefinedTypes, ['Recipe']);
        assert.match(plan.parseReport.warnings[0], /No Tolaria type definitions/);
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
});

test('untyped notes join the "Notes" collection when a Note type already exists', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'tolaria-notes-'));
    try {
        writeFileSync(path.join(tmp, 'note.md'), '---\ntype: Type\n_sidebar_label: Notes\n_icon: file-text\n---\n# Note\n\nDurable notes.\n');
        writeFileSync(path.join(tmp, 'a.md'), '---\ntype: Note\n---\n# Typed\n');
        writeFileSync(path.join(tmp, 'b.md'), '# Untyped\n');
        const plan = await plugin().parseTolariaVault(dirHandle(tmp));
        assert.deepEqual(plan.collections.map(c => [c.name, c.icon]), [['Notes', 'ti-file-text']]);
        assert.deepEqual(plan.records.map(r => r.collection), ['notes', 'notes']);
        assert.deepEqual(plan.parseReport.untypedNotes, ['b.md']);
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
});

// ---- helpers ---------------------------------------------------------------------------------------

test('frontmatter parser: scalars, quotes, lists, inline lists, nulls, comments, CRLF and BOM', () => {
    const p = plugin();
    const parse = (s) => p._tolariaParseNote(s);
    const r = parse('﻿---\r\ntype: Project\r\n"quoted key": \'it\'\'s\'\r\nsidebar label: Projects # comment\r\nrelated_to: "[[a|b]]"\r\nlist:\r\n  - "[[x]]"\r\n  - plain\r\nflow: [one, "two, 2", \'three\']\r\n_list_properties_display: null\r\nempty:\r\nurl: https://example.invalid/a:b\r\nnested:\r\n  child: 1\r\n---\r\n# T\r\nbody');
    assert.deepEqual(r.frontmatter, {
        type: 'Project', 'quoted key': "it's", 'sidebar label': 'Projects', related_to: '[[a|b]]',
        list: ['[[x]]', 'plain'], flow: ['one', 'two, 2', 'three'], _list_properties_display: null, empty: null,
        url: 'https://example.invalid/a:b', nested: null
    });
    assert.equal(r.body, '# T\nbody');
    assert.deepEqual(parse('---\n---\nhi').frontmatter, {});
    assert.equal(parse('no frontmatter').hasFrontmatter, false);
    assert.equal(parse('---\ntype: A\nnever closed').hasFrontmatter, false);
});

test('title split: first H1 wins, only an opening H1 is stripped, fences are skipped', () => {
    const p = plugin();
    assert.deepEqual(p._tolariaSplitTitle('\n# Hello #\n\nText'), { title: 'Hello', body: 'Text' });
    assert.deepEqual(p._tolariaSplitTitle('Intro\n\n# Later\nText'), { title: 'Later', body: 'Intro\n\n# Later\nText' });
    assert.deepEqual(p._tolariaSplitTitle('```\n# not a title\n```\n'), { title: '', body: '```\n# not a title\n```' });
    assert.deepEqual(p._tolariaSplitTitle('## Sub only'), { title: '', body: '## Sub only' });
});

test('icons: Tolaria names map to Tabler, unknown names fall back, a probe overrides', () => {
    const p = plugin();
    assert.deepEqual(p._tolariaIcon('rocket'), { icon: 'ti-rocket', fallback: false });
    assert.deepEqual(p._tolariaIcon('calendar-blank'), { icon: 'ti-calendar', fallback: false });
    assert.deepEqual(p._tolariaIcon('Arrows-Clockwise'), { icon: 'ti-refresh', fallback: false });
    assert.deepEqual(p._tolariaIcon(''), { icon: 'ti-notebook', fallback: false });
    assert.deepEqual(p._tolariaIcon('not a name!'), { icon: 'ti-notebook', fallback: true });
    const known = new Set(['ti-rocket', 'ti-calendar']);
    const exists = (n) => known.has(n);
    assert.deepEqual(p._tolariaIcon('rocket', exists), { icon: 'ti-rocket', fallback: false });
    assert.deepEqual(p._tolariaIcon('calendar-blank', exists), { icon: 'ti-calendar', fallback: false });
    assert.deepEqual(p._tolariaIcon('made-up-icon', exists), { icon: 'ti-notebook', fallback: true });
});

test('collection names are pluralized when there is no sidebar label', () => {
    const p = plugin();
    assert.deepEqual(['Project', 'Category', 'Box', 'Day'].map(w => p._tolariaPluralize(w)), ['Projects', 'Categories', 'Boxes', 'Days']);
});

// ---- applying the plan -------------------------------------------------------------------------------

async function importFixture() {
    const thymer = new FakeThymer();
    const p = plugin();
    p.data = thymer.data;
    const plan = await p.parseTolariaVault(dirHandle(FIXTURE));
    const report = await p.applyImportPlan(plan, fast);
    return { thymer, p, plan, report };
}

test('applyImportPlan on the fixture: collections, records, properties and relations land in the fake', async () => {
    const { thymer, report } = await importFixture();
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.warnings, []);
    assert.equal(report.counts.collectionsCreated, 3);
    assert.equal(report.counts.recordsCreated, 5);
    assert.equal(report.counts.recordsFailed, 0);
    assert.deepEqual(thymer.collections.map(c => c.getName()), ['Projects', 'Topics', 'Notes']);

    const projects = thymer.collection('Projects');
    const topics = thymer.collection('Topics');
    const cfg = Object.fromEntries(projects.getConfiguration().fields.map(f => [f.id, f]));
    assert.equal(projects.getConfiguration().icon, 'ti-rocket');
    assert.equal(cfg.related_to.filter_colguid, topics.getGuid());
    assert.equal(cfg.belongs_to.filter_colguid, undefined);
    assert.deepEqual(cfg.status.choices.map(c => c.label), ['Active', 'Paused']);

    const alpha = thymer.recordByTitle('Projects', 'Alpha Project');
    const beta = thymer.recordByTitle('Projects', 'Beta Project');
    const lab = thymer.recordByTitle('Topics', 'Home Lab');
    const recipes = thymer.recordByTitle('Topics', 'Recipes');
    assert.equal(alpha.text('source_path'), 'alpha-project.md');
    assert.equal(alpha.prop('status').choiceLabel(), 'Active');
    assert.equal(alpha.number('effort'), 3);
    assert.deepEqual(alpha.linkedRecords('related_to').map(r => r.guid), [lab.guid]);
    assert.deepEqual(alpha.linkedRecords('belongs_to').map(r => r.guid), [beta.guid]);
    assert.deepEqual(beta.linkedRecords('related_to').map(r => r.guid), [lab.guid, recipes.guid], 'the dangling target is dropped, the rest keep their order');
    assert.deepEqual(beta.linkedRecords('belongs_to').map(r => r.guid), [lab.guid]);
    assert.equal(beta.prop('status').choiceLabel(), 'Paused');
    assert.deepEqual(lab.prop('kind').selectedChoiceLabels(), ['Hardware', 'Hobby']);
});

test('applyImportPlan on the fixture: body links become refs, dangling ones stay text and are reported', async () => {
    const { thymer, report } = await importFixture();
    const dump = await thymer.dump('Projects');
    const alpha = dump.find(r => r.title === 'Alpha Project');
    const lab = thymer.recordByTitle('Topics', 'Home Lab');

    const first = alpha.items.find(i => i.text.includes('Runs on the'));
    const refs = first.segments.filter(s => s.type === 'ref');
    assert.equal(refs.length, 3);
    assert.ok(refs.every(s => s.text.guid === lab.guid));
    assert.deepEqual(refs.map(s => s.text.title), [undefined, 'the lab', 'setup']);

    const dangling = alpha.items.find(i => i.text.includes('A dangling link'));
    assert.ok(dangling.text.includes('[[ghost-page]]'), 'unresolved wikilink keeps its text');
    assert.ok(dangling.text.includes('[[person]]'), 'link to a type definition keeps its text');
    assert.ok(alpha.items.some(i => i.text.includes('`[[home-lab]]`') || i.text.includes('[[home-lab]]')), 'code occurrences untouched');
    assert.ok(alpha.items.some(i => i.text.includes('![fenced](attachments/diagram.png)')));

    assert.equal(report.counts.linksUnresolved, 3);
    assert.deepEqual(report.unresolvedLinks.map(u => [u.fromTitle, u.ref, u.reason]).sort(), [
        ['Alpha Project', 'ghost-page', 'not-found'],
        ['Alpha Project', 'person', 'not-found'],
        ['Beta Project', 'missing-target', 'not-found']
    ]);
});

test('applyImportPlan on the fixture: images are uploaded once and inserted after their line', async () => {
    const { thymer, report } = await importFixture();
    assert.equal(report.counts.assetsUploaded, 2);
    assert.equal(report.counts.assetsFailed, 0);
    assert.equal(thymer.blobs.size, 1, 'the same file is uploaded once');
    const alpha = (await thymer.dump('Projects')).find(r => r.title === 'Alpha Project');
    const images = alpha.items.filter(i => i.type === 'image');
    assert.equal(images.length, 2);
    assert.ok(!alpha.items.some(i => i.text.includes('⟦')), 'no placeholder survives');
    // Thymer's insertFromMarkdown has no image syntax, so a missing or external image is a plain link (no stray "!")
    assert.ok(alpha.items.some(i => i.text.includes('[gone](attachments/missing.png)') && !i.text.includes('![gone]')), 'missing image becomes a link');
    assert.ok(alpha.items.some(i => i.text.includes('[web](https://example.invalid/x.png)') && !i.text.includes('![web]')), 'external image becomes a link');
});

test('re-import is idempotent through source_path', async () => {
    const { thymer, p, plan, report } = await importFixture();
    const guidsBefore = Array.from(thymer.records.keys()).sort();
    const dumpBefore = await thymer.dump('Projects');

    const again = await p.applyImportPlan(await p.parseTolariaVault(dirHandle(FIXTURE)), fast);
    assert.deepEqual(again.errors, []);
    assert.equal(again.counts.collectionsCreated, 0);
    assert.equal(again.counts.collectionsUpdated, 3);
    assert.equal(again.counts.recordsCreated, 0);
    assert.equal(again.counts.recordsUpdated, plan.records.length);
    assert.deepEqual(Array.from(thymer.records.keys()).sort(), guidsBefore, 'no duplicate records');
    assert.equal(thymer.collections.length, 3, 'no duplicate collections');
    assert.equal(again.counts.linksUnresolved, report.counts.linksUnresolved);

    const dumpAfter = await thymer.dump('Projects');
    const shape = (dump) => dump.map(r => [r.title, r.items.map(i => `${i.type}:${i.text}`)]);
    assert.deepEqual(shape(dumpAfter), shape(dumpBefore), 'bodies are rebuilt, not doubled');
    const alpha = thymer.recordByTitle('Projects', 'Alpha Project');
    assert.equal(alpha.linkedRecords('related_to').length, 1);
    assert.equal(alpha.prop('status').choiceLabel(), 'Active');
});

test('an import with only dangling targets still succeeds', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'tolaria-dangling-'));
    try {
        writeFileSync(path.join(tmp, 'a.md'), '---\ntype: Topic\nrelated_to: "[[nowhere]]"\n---\n# A\n\nSee [[also-nowhere]].\n');
        const thymer = new FakeThymer();
        const p = plugin();
        p.data = thymer.data;
        const plan = await p.parseTolariaVault(dirHandle(tmp));
        const report = await p.applyImportPlan(plan, fast);
        assert.deepEqual(report.errors, []);
        assert.equal(report.counts.recordsCreated, 1);
        assert.deepEqual(report.unresolvedLinks.map(u => u.ref).sort(), ['also-nowhere', 'nowhere']);
        assert.deepEqual(plan.collections[0].fields.find(f => f.id === 'related_to').target, undefined);
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
});

// ---- dialog glue ---------------------------------------------------------------------------------------

/** Just enough DOM for performTolariaImport / renderTolariaReport (no jsdom in this repo). */
function fakeDom() {
    const el = (tag = 'div') => {
        const node = { tag, style: {}, children: [], disabled: false, _text: '' };
        node.appendChild = (c) => { node.children.push(c); return c; };
        Object.defineProperty(node, 'textContent', { get: () => node._text, set: (v) => { node._text = v; node.children = []; } });
        return node;
    };
    const status = el(); const importBtn = el('button'); const cancelBtn = el('button');
    const dialog = { querySelector: (sel) => ({ '#md-status': status, '#md-import-btn': importBtn, '#md-cancel-btn': cancelBtn })[sel] };
    const all = (n) => [n._text, ...n.children.flatMap(all)].filter(Boolean);
    return { el, status, importBtn, cancelBtn, dialog, text: () => all(status).join('\n'), createElement: el };
}

test('performTolariaImport: parses, applies and renders counts, unresolved links and skipped files', async () => {
    const dom = fakeDom();
    globalThis.document = { createElement: dom.createElement, body: dom.el() };
    try {
        const thymer = new FakeThymer();
        const p = plugin();
        p.data = thymer.data;
        p.isDarkMode = () => false;
        const origApply = p.applyImportPlan.bind(p);
        p.applyImportPlan = (plan, opts) => origApply(plan, { ...opts, ...fast });
        await p.performTolariaImport(dom.dialog, {}, dirHandle(FIXTURE));
        const text = dom.text();
        assert.match(text, /Import finished with problems|Import complete/);
        assert.match(text, /Collections: 3 created, 0 updated/);
        assert.match(text, /Records: 5 created, 0 updated/);
        assert.match(text, /Links: \d+ resolved, 3 unresolved/);
        assert.match(text, /Images: 2 uploaded/);
        assert.match(text, /Types with no notes \(no collection created\): Person/);
        assert.match(text, /Untyped notes \(put in "Notes"\): loose-note\.md/);
        assert.match(text, /Skipped: AGENTS\.md/);
        assert.match(text, /Alpha Project: \[\[ghost-page\]\] \(not-found\)/);
        assert.match(text, /Alpha Project: \[\[person\]\] \(type definition, not a note\)/);
        assert.equal(dom.importBtn.textContent, 'Imported');
        assert.equal(dom.cancelBtn.textContent, 'Close');
    } finally {
        delete globalThis.document;
    }
});

test('performTolariaImport: an empty folder is reported, not imported', async () => {
    const dom = fakeDom();
    globalThis.document = { createElement: dom.createElement, body: dom.el() };
    const tmp = mkdtempSync(path.join(tmpdir(), 'tolaria-empty-'));
    try {
        const p = plugin();
        p.data = new FakeThymer().data;
        p.isDarkMode = () => false;
        await p.performTolariaImport(dom.dialog, {}, dirHandle(tmp));
        assert.match(dom.status.textContent, /No Tolaria notes found/);
        assert.equal(dom.importBtn.disabled, false);
        assert.equal(dom.importBtn.textContent, 'Import');
    } finally {
        delete globalThis.document;
        rmSync(tmp, { recursive: true, force: true });
    }
});
