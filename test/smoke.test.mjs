import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlugin, newPlugin } from './lib/load-plugin.mjs';

test('plugin.js loads outside Thymer', () => {
    const { Plugin, VERSION } = loadPlugin();
    assert.equal(typeof Plugin, 'function');
    assert.match(VERSION, /^v\d+\.\d+\.\d+$/);
});

test('parseCSV handles quoted commas', () => {
    const p = newPlugin();
    const { headers, rows } = p.parseCSV('Name,Layout\nXD75,"60%, Ortho"\n');
    assert.deepEqual(headers, ['Name', 'Layout']);
    assert.deepEqual(rows[0], ['XD75', '60%, Ortho']);
});
