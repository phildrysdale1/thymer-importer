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
