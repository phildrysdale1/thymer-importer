// In-memory stand-in for the subset of the Thymer Plugin SDK that applyImportPlan() uses.
// Signatures follow https://github.com/thymerapp/thymer-plugin-sdk/blob/main/types.d.ts
// (DataAPI, PluginCollectionAPI, PluginRecord, PluginProperty, PluginLineItem, PluginBlob).
//
// What it is: a strict-ish model of records, collections, properties, line items and blobs,
// so engine bugs (wrong ref shape, deleting a parent before its children, a ref to a GUID
// that does not exist, an array on a single-value property) fail in tests.
// What it is NOT: Thymer. insertFromMarkdown() only splits lines into text / heading / list /
// task items with a single text segment; it does not reproduce Thymer's markdown conversion.
// Anything Thymer-specific the types do not pin down is listed in the report and must be
// verified inside Thymer.

let counter = 0;
const nextGuid = (prefix) => `${prefix}${(++counter).toString(36).padStart(6, '0')}`;

const SEGMENT_TYPES = new Set(['text', 'bold', 'italic', 'code', 'link', 'icon', 'hashtag', 'mention', 'ref', 'linkobj', 'datetime']);

// DateTime (types.d.ts:518). The real DateTimeValue is opaque; this one is readable so tests can tell a
// date-only value ({ d }) from a timed one ({ d, t }) and see a range end ({ d, r: <end value> }).
export class FakeDateTime {
    constructor(parts) { this._p = parts; this._end = null; }
    static dateOnly(year, month0, day) {
        return new FakeDateTime({ y: year, m0: month0, d: day });
    }
    static dateAndTime(year, month0, day, hours, minutes, seconds) {
        return new FakeDateTime({ y: year, m0: month0, d: day, h: hours, mi: minutes, s: seconds });
    }
    setRangeEnd(end) { this._end = end; return this; }
    getRangeEnd() { return this._end; }
    getParts() { return { ...this._p }; }
    value() {
        const p = this._p;
        const pad = (n) => String(n).padStart(2, '0');
        const v = { d: `${p.y}${pad(p.m0 + 1)}${pad(p.d)}` };
        if (p.h !== undefined) v.t = `${pad(p.h)}${pad(p.mi)}${pad(p.s)}`;
        if (this._end) v.r = this._end.value();
        return v;
    }
}

export class FakeBlob {
    constructor(file, bytes) {
        this.guid = nextGuid('blob');
        this.fileName = file.name;
        this.contentType = file.type;
        this.fileSize = bytes.byteLength;
        this._bytes = bytes;
    }
    getCreatedAt() { return new Date(0); }
    async download() { return this._bytes; }
}

class FakeProperty {
    constructor(thymer, record, field) {
        this._thymer = thymer;
        this._record = record;
        this._field = field;
        this.name = field.label;
        this.guid = `${record.guid}:${field.id}`;
    }
    get _values() { return this._record._values.get(this._field.id) || []; }
    set _values(v) { this._record._values.set(this._field.id, v); }

    isMultiValue() { return this._field.many === true; }
    count() { return this._values.length; }
    values() { return this._values.slice(); }

    _coerce(v) {
        switch (this._field.type) {
            case 'record':
                if (typeof v !== 'string' || !this._thymer.records.has(v)) throw new Error(`record property ${this._field.id}: ${JSON.stringify(v)} is not an existing record guid`);
                return v;
            case 'choice': {
                const c = (this._field.choices || []).find(o => o.active !== false && (o.id === v || String(o.label).toLowerCase() === String(v).toLowerCase()));
                if (!c) throw new Error(`choice property ${this._field.id}: unknown choice ${JSON.stringify(v)}`);
                return c.id;
            }
            case 'number': {
                const n = typeof v === 'number' ? v : Number(v);
                if (Number.isNaN(n)) throw new Error(`number property ${this._field.id}: ${JSON.stringify(v)}`);
                return n;
            }
            case 'text': case 'url': case 'hashtag':
                return String(v);
            default:
                return v;
        }
    }

    set(v) {
        if (Array.isArray(v)) {
            if (!this.isMultiValue()) throw new Error(`${this._field.id} is single-value; cannot set an array`);
            this._values = v.map(x => this._coerce(x));
        } else {
            this._values = [this._coerce(v)];
        }
    }
    addValue(v) {
        if (!this.isMultiValue()) return this.set(v);
        this._values = [...this._values, this._coerce(v)];
    }
    setFromDate(date) {
        const dates = Array.isArray(date) ? date : [date];
        if (!this.isMultiValue() && dates.length > 1) throw new Error('single-value datetime');
        // A Date is an instant, shown in the local timezone with its time of day, which is how Thymer stores it
        // ("2026-03-01" parses as UTC midnight, so it lands on the previous evening west of UTC).
        // fromDate marks values that came through here.
        const pad = (n) => String(n).padStart(2, '0');
        this._values = dates.map(d => ({
            d: `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`,
            t: `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`,
            fromDate: true
        }));
    }
    setChoice(names) {
        if (this._field.type !== 'choice') return false;
        const list = Array.isArray(names) ? names : [names];
        if (!this.isMultiValue() && list.length > 1) return false;
        const ids = [];
        for (const n of list) {
            const c = (this._field.choices || []).find(o => o.active !== false && (o.id === n || String(o.label).toLowerCase() === String(n).toLowerCase()));
            if (!c) return false;
            ids.push(c.id);
        }
        this._values = ids;
        return true;
    }

    text() { const v = this._values[0]; return v === undefined || v === null ? null : String(v); }
    texts() { return this._values.map(String); }
    number() { const v = this._values[0]; return typeof v === 'number' ? v : null; }
    numbers() { return this._values.filter(v => typeof v === 'number'); }
    choice() { return this._field.type === 'choice' ? (this._values[0] ?? null) : null; }
    selectedChoices() { return this._field.type === 'choice' ? this._values.slice() : []; }
    choiceLabel() {
        const c = (this._field.choices || []).find(o => o.id === this.choice());
        return c ? c.label : null;
    }
    selectedChoiceLabels() {
        return this.selectedChoices().map(id => ((this._field.choices || []).find(o => o.id === id) || {}).label);
    }
    linkedRecords() {
        return this._field.type === 'record' ? this._values.map(g => this._thymer.records.get(g)).filter(Boolean) : [];
    }
    linkedRecord() { return this.linkedRecords()[0] || null; }
}

export class FakeLineItem {
    constructor(thymer, record, type, parent, segments, props) {
        this._thymer = thymer;
        this.guid = nextGuid('li');
        this.type = type;
        this.record = record;
        this.parent_guid = parent ? parent.guid : null;
        this.segments = segments ? segments.map(s => ({ ...s })) : [];
        this.props = props ? { ...props } : null;
        this._children = [];
        this._deleted = false;
    }
    get children() { return this._children; }
    async getChildren() { return this._children.slice(); }
    getRecord() { return this.record; }

    _validateSegments(segments) {
        for (const s of segments) {
            if (!s || !SEGMENT_TYPES.has(s.type)) return `unknown segment type ${s && s.type}`;
            if (s.type === 'ref') {
                if (!s.text || typeof s.text !== 'object' || typeof s.text.guid !== 'string') return 'ref segment text must be { guid }';
                if (!this._thymer.records.has(s.text.guid)) return `ref to unknown guid ${s.text.guid}`;
            } else if (s.type === 'linkobj') {
                if (!s.text || typeof s.text.link !== 'string') return 'linkobj text must be { link, title }';
            } else if (typeof s.text !== 'string') {
                return `${s.type} segment text must be a string`;
            }
        }
        return null;
    }
    async setSegments(segments) {
        if (this._deleted) return false;
        const problem = this._validateSegments(segments);
        if (problem) { this._thymer.rejected.push(problem); return false; }
        this.segments = segments.map(s => ({ ...s }));
        return true;
    }
    async setBlob(blob) {
        if (this.type !== 'image' && this.type !== 'file') return false;
        if (!blob || !this._thymer.blobs.has(blob.guid)) return false;
        this.props = { ...(this.props || {}), fileguid: blob.guid, filename: blob.fileName, filesize: blob.fileSize };
        return true;
    }
    async getBlob() { return this.props && this.props.fileguid ? (this._thymer.blobs.get(this.props.fileguid) || null) : null; }
    async delete() {
        if (this._deleted || this._children.length) return false; // SDK: rejected when the item has children
        const siblings = this._siblings();
        siblings.splice(siblings.indexOf(this), 1);
        this._deleted = true;
        return true;
    }
    _siblings() {
        return this.parent_guid ? this.record._itemsByGuid.get(this.parent_guid)._children : this.record._rootItems;
    }
    get text() { return this.segments.map(s => typeof s.text === 'string' ? s.text : '').join(''); }
}

export class FakeRecord {
    constructor(thymer, collection, title) {
        this._thymer = thymer;
        this._collection = collection;
        this.guid = nextGuid('rec');
        this._title = title;
        this._values = new Map();
        this._rootItems = [];
        this._itemsByGuid = new Map();
        this._visibleAfterReads = 0;
    }
    getName() { return this._title; }

    _field(name) {
        const fields = (this._collection.config.fields || []).filter(f => f.active !== false);
        return fields.find(f => f.id === name) || fields.find(f => f.label === name) || null;
    }
    prop(name) {
        const field = this._field(name);
        return field ? new FakeProperty(this._thymer, this, field) : null;
    }
    text(name) { const p = this.prop(name); return p ? p.text() : null; }
    texts(name) { const p = this.prop(name); return p ? p.texts() : []; }
    number(name) { const p = this.prop(name); return p ? p.number() : null; }
    choice(name) { const p = this.prop(name); return p ? p.choice() : null; }
    linkedRecord(name) { const p = this.prop(name); return p ? p.linkedRecord() : null; }
    linkedRecords(name) { const p = this.prop(name); return p ? p.linkedRecords() : []; }

    _flat(items = this._rootItems, out = []) {
        for (const i of items) { out.push(i); this._flat(i._children, out); }
        return out;
    }
    async getLineItems(expandReferences = true) {
        if (expandReferences !== false) this._thymer.expandingGetLineItems++;
        return this._flat();
    }

    async createLineItem(parentItem, afterItem, type, segments, properties) {
        const siblings = parentItem ? parentItem._children : this._rootItems;
        if (afterItem && afterItem.parent_guid !== (parentItem ? parentItem.guid : null)) return null;
        if (parentItem && ['image', 'file', 'hr'].includes(parentItem.type)) return null;
        const item = new FakeLineItem(this._thymer, this, type, parentItem, segments, properties);
        const at = afterItem ? siblings.indexOf(afterItem) + 1 : 0; // null afterItem: first child
        siblings.splice(at, 0, item);
        this._itemsByGuid.set(item.guid, item);
        return item;
    }

    async insertFromMarkdown(markdown, parentItem, afterItem) {
        let after = afterItem;
        for (const raw of String(markdown).split('\n')) {
            if (!raw.trim()) continue;
            let type = 'text';
            let text = raw.trim();
            let props = null;
            let m;
            if ((m = text.match(/^(#{1,6})\s+(.*)$/))) { type = 'heading'; text = m[2]; props = { hsize: m[1].length }; }
            else if ((m = text.match(/^[-*]\s+\[( |x)\]\s+(.*)$/i))) { type = 'task'; text = m[2]; }
            else if ((m = text.match(/^[-*]\s+(.*)$/))) { type = 'ulist'; text = m[1]; }
            else if ((m = text.match(/^\d+\.\s+(.*)$/))) { type = 'olist'; text = m[1]; }
            after = await this.createLineItem(parentItem, after, type, [{ type: 'text', text }], props);
            if (!after) return false;
        }
        return true;
    }
}

export class FakeCollection {
    constructor(thymer, { journal = false } = {}) {
        this._thymer = thymer;
        this.guid = nextGuid('col');
        this._journal = journal;
        this.config = {
            ver: 1, icon: 'ti-file', name: journal ? 'Journal' : 'Untitled', item_name: 'Page', description: '',
            show_sidebar_items: true, show_cmdpal_items: true, views: [], fields: [], page_field_ids: [],
            sidebar_record_sort_field_id: 'updated_at', sidebar_record_sort_dir: 'desc',
            managed: { fields: false, views: false, sidebar: false }, home: false
        };
        this._journalPages = new Map();
    }
    getGuid() { return this.guid; }
    getName() { return this.config.name; }
    getConfiguration() { return structuredClone(this.config); }
    getExistingCodeAndConfig() { return { code: '', css: '', json: this.getConfiguration() }; }
    async saveConfiguration(conf) {
        if (!conf || typeof conf.name !== 'string') return false;
        for (const f of conf.fields || []) {
            if (!f.id || !f.label || !f.type) return false;
            if (f.type === 'choice' && !(f.choices || []).every(c => c.id && c.label && c.color !== undefined && typeof c.active === 'boolean')) return false;
        }
        this.config = structuredClone(conf);
        return true;
    }
    isJournalPlugin() { return this._journal; }

    createRecord(recordName) {
        if (this._thymer.failCreateTitles.has(recordName)) return null;
        const rec = new FakeRecord(this._thymer, this, recordName);
        rec._visibleAfterReads = this._thymer.recordLag;
        this._thymer.records.set(rec.guid, rec);
        return rec.guid;
    }
    async getAllRecords() {
        const out = [];
        for (const r of this._thymer.records.values()) {
            if (r._collection !== this) continue;
            if (r._visibleAfterReads > 0) { r._visibleAfterReads--; continue; }
            out.push(r);
        }
        return out;
    }
    async getJournalRecord(user, date) {
        if (!this._journal) return null;
        const key = `${user.guid}:${date.value().d}`;
        if (!this._journalPages.has(key)) {
            const rec = new FakeRecord(this._thymer, this, date.value().d);
            this._thymer.records.set(rec.guid, rec);
            this._journalPages.set(key, rec);
        }
        return this._journalPages.get(key);
    }
}

export class FakeThymer {
    /**
     * recordLag: number of getAllRecords() reads before a new record shows up in them.
     * getRecordWorks: whether data.getRecord(guid) can see a just-created record.
     */
    constructor({ recordLag = 0, getRecordWorks = true } = {}) {
        this.recordLag = recordLag;
        this.getRecordWorks = getRecordWorks;
        this.collections = [];
        this.records = new Map();
        this.blobs = new Map();
        this.failCreateTitles = new Set();
        this.failUploadNames = new Set();
        this.rejected = [];               // reasons setSegments() refused a segment list
        this.expandingGetLineItems = 0;   // getLineItems() calls that did not pass false
        this.users = [{ guid: 'user1' }];
        this.data = this._makeData();
    }

    addJournal() {
        const c = new FakeCollection(this, { journal: true });
        this.collections.push(c);
        return c;
    }

    _makeData() {
        const t = this;
        return {
            getAllRecords() { return Array.from(t.records.values()); },
            createNewRecord() { return null; },
            getRecord(guid) {
                const r = t.records.get(guid);
                return r && t.getRecordWorks && r._visibleAfterReads === 0 ? r : null;
            },
            async getAllCollections() { return t.collections.slice(); },
            async createCollection() {
                const c = new FakeCollection(t);
                t.collections.push(c);
                return c;
            },
            getPluginByGuid(guid) { return t.collections.find(c => c.guid === guid) || null; },
            getActiveUsers() { return t.users; },
            async uploadBlob(file) {
                if (t.failUploadNames.has(file.name)) return null;
                const blob = new FakeBlob(file, await file.arrayBuffer());
                t.blobs.set(blob.guid, blob);
                return blob;
            }
        };
    }

    collection(name) { return this.collections.find(c => c.getName() === name) || null; }

    /** Records of a collection as plain data, for assertions. */
    async dump(collectionName) {
        const c = this.collection(collectionName);
        const out = [];
        for (const r of this.records.values()) {
            if (r._collection !== c) continue;
            out.push({
                guid: r.guid,
                title: r.getName(),
                items: r._flat().map(i => ({ type: i.type, text: i.text, segments: i.segments, parent: i.parent_guid, props: i.props }))
            });
        }
        return out;
    }
    recordByTitle(collectionName, title) {
        const c = this.collection(collectionName);
        return Array.from(this.records.values()).find(r => r._collection === c && r.getName() === title) || null;
    }
}
