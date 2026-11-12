# Changelog — Thymer Importer

Tracks **`plugin.js`** / **`plugin.json`** behavior. Current release: **v0.0.13** (see **`VERSION`** in **`plugin.js`**).

---

## v0.0.13 — Tolaria and Notion export sources, shared ImportPlan engine

### New sources

**Import Markdown** has two new sources, **Tolaria** and **Notion export**. Both build their own collections, so the collection picker and the journal option are hidden for them.

- **Tolaria** (a vault of `*.md` files with YAML frontmatter): notes with **`type: Type`** define collections (name from **`sidebar label`**, icon from **`_icon`**, body → description) and every other note becomes a record in the collection of its **`type:`**. Frontmatter keys whose values are all **`[[wikilinks]]`** become record-reference properties, **`[[slug]]`** links in the body become record references (matched by file name), and **`attachments/`** images are uploaded and inserted as images. Tolaria UI state (**`_*`**, **`visible`**, **`color`**), agent docs (**`AGENTS.md`**, **`CLAUDE.md`**, …) and dot-folders are skipped.
- **Notion export** (unzipped **Markdown & CSV** export, subpages included): each database becomes a collection, each row a record, and standalone pages go to a **Notion Pages** collection. Column types are detected from the CSV, relation columns (Notion page URLs) become record references resolved by page id across every database in the folder, and `<aside>` callouts become quotes. Title id suffixes are dropped.
- Both show an **import report** when done: collections and records created or updated, links resolved or left as text, images uploaded, and anything skipped or failed.
- Re-importing is safe: records are matched by **`source_path`** and updated in place.

### Shared ImportPlan engine

- A source parser is a pure function that returns an **ImportPlan** (collections, records, property values, links, assets). **`applyImportPlan()`** performs every Thymer write: collections (name, icon, description, fields), records, links, images, then journal entries.
- **`LinkIndex`** maps paths, file-name slugs, Notion page ids and titles to records, so links and relation properties are rewritten after every record exists.
- The existing CSV, Obsidian, Joplin, Logseq and journal flows do not use the engine and are unchanged.

### Date-only values on the new path

Date-only values (`2026-03-01`, Notion's `August 30, 2021`) are written with **`DateTime.dateOnly`**, so they no longer shift by the UTC offset; values with a time keep it, and Notion date ranges are imported as ranges.

### Folder picker for the new sources

In Thymer Desktop **`showDirectoryPicker()`** rejects with **`AbortError`** even after a folder was chosen, which looks like a cancel. Tolaria and Notion therefore use **`pickFolderViaInput()`** (`<input type="file" webkitdirectory>`), which works in Thymer Desktop and in browsers. The other sources still use **`pickFolder()`**.

### Name-clash warning

The importer finds target collections by name, so a workspace that already had a **Notes** or **Projects** collection would silently receive the import. Before writing anything, Tolaria and Notion now compare the planned collection names with the workspace:

- A same-named collection counts as **a previous import from this source** when it has a **`source_path`** field and one of its records has a **`source_path`** of a planned record. It is merged into silently, so re-import keeps working.
- Any other same-named collection is a **clash**. The dialog lists the clashes and asks:
  - **Import into separate collections** (default): every planned collection gets an editable prefix (**`Tolaria · `** / **`Notion · `**), so the source stays together. Importing again with the same prefix updates those collections.
  - **Merge into existing collections**: the previous behavior.
- No clash, no extra step.

### Review fixes

Fixes from the review of the pull request, all on the new sources and the shared engine (the existing CSV, Obsidian, Joplin, Logseq and journal flows are unchanged):

- **Notion, id-suffixed rows folder:** some exports name the rows folder after the whole csv file (**`Tasks <id>/`** next to **`Tasks <id>.csv`**). The folder is found by the full csv stem, then the name without the id, then a sibling folder carrying the database id, then the sanitised-name fallback, so row pages are claimed instead of landing in **Notion Pages** as empty rows.
- **Notion, rows without a page:** two csv rows with the same title and no page shared one **`source_path`**, and the second overwrote the first. The second, third, … get **`#2`**, **`#3`** after the title (in csv order); the first keeps its old path, so earlier imports still match. The report lists the affected titles.
- **Re-import matches by `source_path` alone:** a note whose title changed but whose file did not is updated, not duplicated. Records with no **`source_path`** are still adopted by title, once. If the title changed, the record is **renamed** through its built-in title property (**`record.prop('Title').set(...)`**, then **`'title'`**) and counted as **renamed** in the report; if that is not possible it is a **`title-not-renamed`** warning and the record keeps its old title.
- **Choices on re-import:** when the field that already exists in Thymer is a choice, new values are added as options even if this run infers a text column. Existing fields are never retyped.
- **Tolaria field ids:** keys that slugify alike (**`cost ($)`**, **`cost (%)`**) get distinct ids (**`cost`**, **`cost_2`**), allocated in sorted key order so a re-import maps to the same fields. Case variants (**`Status`** / **`status`**) still share one field.
- **Cleared values:** on an updated record, a field the plan declares for that collection is **cleared** when the source has no value for it any more (an emptied cell, a removed frontmatter key, a relation that is gone). Only declared fields are touched: fields you added in Thymer, **`source_path`**, built-in/system fields and read-only fields are left alone. A declared column that is missing from the export entirely also clears, because the plan declares it and the source is the truth; if you keep your own data in a field that a source also declares, it is replaced on re-import. Clearing is a single **`set([])`** (multi-value) or **`set(null)`** call per property; what needs clearing is read before the record is written, because Thymer's reads right after a write are stale. The number of cleared values is in the import report.

### Review fixes (round 2)

A second review found one bug in several shapes: between two imports the inferred shape of a column can change (a date column gets one text value, a relation column's targets move into the export, a multi-select gets more distinct values, a new key slugifies like an old one), and the writers trusted the new inference instead of the collection that already exists. **On re-import the collection in Thymer is authoritative.** Fixes, all on the new sources and the shared engine:

- **Fields are matched by label.** An existing collection's fields decide which field id each field of the export writes to: the same label (case-insensitive, ignoring runs of space, **`_`** and **`-`**) is the same field, whatever id this run would have allocated. This stops Tolaria / Notion ids shifting when a colliding key (**`cost ($)`** next to an existing **`cost (%)`**) or column first appears in a later export. A field with no counterpart is new and gets an id that nothing in the collection uses (**`cost_2`**, **`cost_3`**, …). **`source_path`** is never matched. If you rename a field's label in Thymer, the next import adds a new field instead of writing into the renamed one. The report lists remapped fields.
- **Every value is written by the persisted field.** Its type, single / many and options decide the write; fields are never retyped or removed. A value that cannot be written (text in a number field, a date that does not parse, a plain value for a record field) is a **`property-not-set`** warning and the old value stays.
  - **Dates** go through **`DateTime.dateOnly`** / **`dateAndTime`** only (also ISO instants such as **`2026-03-02T12:00:00Z`**, in local time, and Notion's **`March 1, 2026`** forms), never **`setFromDate`**, so a date-only value cannot slip to the evening before.
  - **Links in a field that is not a record field** (url, text, ...) write the link's source text (the URL or text from the export), never a GUID.
  - **Choices:** a multi-value field splits a text cell into tokens (comma + space, like the Notion multi-select parser) and adds missing options one by one, never a combined **`Red, Blue`** option; a single-value field takes the whole value as one option.
  - **Text / url** take the string form; several values for a one-value field are joined with **`, `**. **Numbers** must be numbers.
- **Notion: a renamed page is the same record.** A page's 32-hex id is in its file name (**`Title <id>.md`**) and survives a rename in Notion. Existing records are also looked up by that id, so the record is updated, its **`source_path`** follows the page and a changed title renames it, instead of a duplicate appearing. The name-clash prompt recognises a previous import by page id too. Rows without a page (no id) still match by path.
- **`existing: 'skip'`** now skips the link and image passes for skipped records too (no second image, no overwritten relations). Skipped records stay link targets for new ones.
- **`source_path`** is written as plain text, never through the date path.

### Tests

- **`npm test`** runs a Node test harness (Node 20+, no dependencies) that loads **`plugin.js`** with a stub **`AppPlugin`** and an in-memory Thymer API. Fixtures are synthetic. See **`test/README.md`**.
- Optional env vars run the parsers over real exports: **`TOLARIA_VAULT`**, **`NOTION_EXPORT`**, **`NOTION_EXPECT`**.

---

## v0.0.12 — `tag` / `tags` frontmatter → **hashtag** property

When **Create New Collection** runs during markdown import, analyzed frontmatter keys **`tag`** and **`tags`** (case-insensitive) now get Thymer type **`hashtag`** instead of **`text`**. If samples include YAML **lists**, **`many: true`**; otherwise **`many: false`**. Icon: **`ti-hash`** in **`getFieldIcon`**.

---

## v0.0.11 — Markdown folder picker (macOS / Safari / WebKit)

### Problem

Some environments do not expose a reliable **`showDirectoryPicker`**, or fail when options like **`startIn`** are used. The markdown import dialog previously called the API directly, so folder selection could appear to do nothing.

### Changes

- **Import Markdown → Select folder** uses **`pickFolder()`**, the same helper as **Import Daily Notes to Journal**.
- **Order of attempts:** **`showDirectoryPicker({ mode: 'read' })`** (no **`startIn`**). On failure other than user **abort**, falls back to **`<input type="file" webkitdirectory multiple>`** so users can still choose a directory tree (common on **Safari** / restricted embeds).
- **`scanVaultFiles`** accepts **`{ kind: 'filelist', files: File[] }`** from that fallback and builds **`path`**, **`name`**, **`topFolder`**, and **`handle`** from **`webkitRelativePath`** ( **`File`** is read via **`Blob.prototype.text`** in **`getFileFromHandle`**).
- **Logseq** imports still expect a real **`FileSystemDirectoryHandle`** over **`pages` / `journals`**. If only the file-list fallback is available, import shows an error and suggests another browser/source.
- **UI:** **`type="button"`** on the folder button; status line shows folder name for native picker, or file count when using the file chooser fallback.

---

## Notes: folder bucket vs releases

| Release | Folder-related behavior |
|--------|---------------------------|
| **v0.0.11** | Adds **file-list** scanning so **`file.topFolder`** is derived from **`webkitRelativePath`** when the native picker is unavailable. |
| **v0.0.8** | Joplin/multi-value changes affect **`setFieldValue`** for tags/dates; **`folder`** is still set as a plain string via **`setFieldValue(record, 'folder', file.topFolder)`**. |
| **v0.0.9 / v0.0.10** | Only **`prepareMarkdownForThymerImport`** (note body → **`insertFromMarkdown`**) is affected; not property writes. |

**YAML collision:** If frontmatter includes **`folder:`** (or similar), **`setFrontmatterField`** may map it to a property whose ids overlap **`folder`**. That runs **after** the importer sets **`source_path` / `folder` / `source`**, so YAML can overwrite the vault bucket. Rename the export field or adjust the collection schema if that happens.

---

## v0.0.10 — Optional hashtag-like escape for markdown import

### Plugin JSON (`custom`)

- **`markdown_import_hashtag_escape`** (boolean, default **`true`**): set to **`false`** to skip preprocessing so markdown is passed unchanged to **`insertFromMarkdown`** (no U+200C insertion).

```json
"custom": {
  "markdown_import_hashtag_escape": true
}
```

Omit the key or use **`true`** to keep v0.0.9 behavior.

---

## v0.0.9 — Hashtag-like tokens in imported markdown

- **`insertFromMarkdown`** has no SDK flag to disable hashtag detection; Thymer parses **`#…`** into hashtag segments.
- Before import, the plugin may insert **U+200C** after **`#`** when it looks like a **numeric** token or **6-digit hex color** ( **`issue #123`**, **`#aabbcc`** ). **`#word`** tags still import as hashtags.
- Skips fenced **` ``` `** blocks, inline **`` `code` ``**, and **ATX heading** lines.
- Applies everywhere **`prepareMarkdownForThymerImport`** runs (collection + journal markdown paths).

---

## v0.0.8 — Joplin (YAML) and multi-value imports

- **Import Markdown** includes **Joplin (YAML)**; **`source`** = **`joplin`** on records.
- Frontmatter: BOM strip, CRLF → **`\\n`** for **`---`** blocks.
- Arrays (e.g. **`tags:`**): multi-value via **`prop.set` / `setChoice`** when **`many: true`**; **`createMarkdownCollection`** can set **`many: true`** for YAML arrays.
- Datetimes: **`prop.setFromDate`** when possible; Joplin aliases **`updated` → `updated_at`**, **`created` → `created_at`**.
- Empty YAML arrays are skipped.

---

## v0.0.7 — Journal folder auto-detect

- Markdown import can auto-detect or name a folder for **daily notes** and send them to the **Thymer Journal** collection.

---

## v0.0.6 — Import daily notes to Journal

- Command palette: **“Import Daily Notes to Journal”**.

---

## v0.0.5 — Fix broken wiki links

- Command palette: **“Fix broken [[wikilinks]]”**.

---

## v0.0.4 — Unified importer

- **CSV** import with full UI.
- **Obsidian** markdown support.
- **Logseq** support.
- Unified import dialog and theme-aware styling.
