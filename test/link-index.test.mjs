import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlugin } from './lib/load-plugin.mjs';

const { LinkIndex } = loadPlugin();

const NOTION_A = '0123456789abcdef0123456789abcdef';
const NOTION_B = 'fedcba9876543210fedcba9876543210';

test('slug alias: [[home-lab]] resolves to home-lab.md, case-folded', () => {
    const idx = new LinkIndex();
    idx.addRecord({ key: 'r1', collection: 'projects', sourcePath: 'projects/home-lab.md', title: 'Home Lab' });
    const hit = idx.resolve('home-lab');
    assert.equal(hit.status, 'resolved');
    assert.equal(hit.key, 'r1');
    assert.equal(hit.via, 'slug');
    assert.equal(idx.resolve('HOME-Lab').key, 'r1');
});

test('title alias is case-folded and whitespace-collapsed', () => {
    const idx = new LinkIndex();
    idx.addRecord({ key: 'r1', sourcePath: 'x.md', title: 'Home   Lab' });
    const hit = idx.resolve('  home lab ');
    assert.equal(hit.status, 'resolved');
    assert.equal(hit.via, 'title');
});

test('unresolved links are reported, never thrown', () => {
    const idx = new LinkIndex();
    idx.addRecord({ key: 'r1', sourcePath: 'a.md', title: 'A' });
    assert.deepEqual(idx.resolve('no-such-person'), { status: 'unresolved', ref: 'no-such-person', reason: 'not-found' });
    assert.equal(idx.resolve('').status, 'unresolved');
    assert.equal(idx.resolve('').reason, 'empty');
    assert.equal(idx.resolve(null).status, 'unresolved');
    assert.equal(idx.resolve(undefined, { fromKey: 'nope' }).status, 'unresolved');
    assert.equal(idx.resolve({ ref: 'a', kind: 'bogus' }).status, 'unresolved');
});

test('notion ids: from filename, dashed uuid, and inside a url-encoded link', () => {
    const idx = new LinkIndex();
    idx.addRecord({ key: 'p', sourcePath: `Projects ${NOTION_A}/Roadmap ${NOTION_B}.md`, title: 'Roadmap' });
    assert.equal(idx.resolve(NOTION_B).via, 'notion_id');
    assert.equal(idx.resolve(NOTION_B.toUpperCase()).key, 'p');
    const dashed = NOTION_B.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
    assert.equal(idx.resolve(dashed).key, 'p');
    assert.equal(idx.resolve(`Roadmap%20${NOTION_B}.md`).key, 'p');
    // the parent folder's id belongs to the parent, not to this record
    assert.equal(idx.resolve(NOTION_A).status, 'unresolved');
});

test('path links: relative to the linking record, url-encoded, with fragments', () => {
    const idx = new LinkIndex();
    idx.addRecord({ key: 'from', sourcePath: 'a/b/page.md', title: 'Page' });
    idx.addRecord({ key: 'other', sourcePath: 'a/c/other page.md', title: 'Other' });
    idx.addRecord({ key: 'root', sourcePath: 'root.md', title: 'Root' });
    const rel = idx.resolve({ ref: '../c/other%20page.md#section', kind: 'path' }, { fromKey: 'from' });
    assert.equal(rel.key, 'other');
    assert.equal(rel.via, 'path');
    assert.equal(idx.resolve({ ref: 'root.md', kind: 'path' }, { fromKey: 'from' }).key, 'root');
    assert.equal(idx.resolve({ ref: 'a/c/other page', kind: 'path' }).key, 'other');
});

test('ambiguous aliases report candidates; same-collection tie-break resolves them', () => {
    const idx = new LinkIndex();
    idx.addRecord({ key: 'n1', collection: 'notes', sourcePath: 'notes/todo.md', title: 'Todo' });
    idx.addRecord({ key: 'p1', collection: 'projects', sourcePath: 'projects/todo.md', title: 'Todo' });
    idx.addRecord({ key: 'p2', collection: 'projects', sourcePath: 'projects/other.md', title: 'Other' });
    idx.addRecord({ key: 'x', collection: 'misc', sourcePath: 'misc/x.md', title: 'X' });

    const amb = idx.resolve('todo', { fromKey: 'x' });
    assert.equal(amb.status, 'ambiguous');
    assert.deepEqual(amb.candidates.sort(), ['n1', 'p1']);

    assert.equal(idx.resolve('todo', { fromKey: 'p2' }).key, 'p1');
    assert.equal(idx.resolve('todo', { fromKey: 'p2' }).status, 'resolved');
});

test('explicit alias kinds and kind restriction', () => {
    const idx = new LinkIndex();
    idx.addRecord({ key: 'r', sourcePath: 'r.md', title: 'R', aliases: [{ kind: 'title', value: 'Alt Name' }, { kind: 'notion_id', value: NOTION_A }] });
    assert.equal(idx.resolve('alt name').key, 'r');
    assert.equal(idx.resolve({ ref: NOTION_A, kind: 'notion_id' }).key, 'r');
    assert.equal(idx.resolve({ ref: 'alt name', kind: 'slug' }).status, 'unresolved');
});

test('bind() maps a key to a guid; resolve reports guid null until then', () => {
    const idx = new LinkIndex();
    idx.addRecord({ key: 'r', sourcePath: 'r.md', title: 'R' });
    assert.equal(idx.resolve('r').guid, null);
    idx.bind('r', 'guid-1');
    assert.equal(idx.resolve('r').guid, 'guid-1');
    assert.equal(idx.guidOf('r'), 'guid-1');
});

test('resolveMany splits resolved and unresolved', () => {
    const idx = new LinkIndex();
    idx.addRecord({ key: 'a', sourcePath: 'a.md', title: 'A' });
    const { resolved, unresolved } = idx.resolveMany([
        { id: 'L1', from: 'a', target: { ref: 'a' } },
        { id: 'L2', from: 'a', target: { ref: 'missing' } }
    ]);
    assert.deepEqual(resolved.map(r => r.link.id), ['L1']);
    assert.deepEqual(unresolved.map(r => r.link.id), ['L2']);
});

test('addRecord requires a key; fromPlan indexes every plan record', () => {
    const idx = new LinkIndex();
    assert.throws(() => idx.addRecord({ title: 'x' }), /key is required/);
    const built = LinkIndex.fromPlan({ records: [{ key: 'k1', collection: 'c', title: 'One', sourcePath: 'one.md' }] });
    assert.equal(built.resolve('one').key, 'k1');
    assert.deepEqual(built.keys(), ['k1']);
});
