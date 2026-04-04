# Changelog — Thymer Importer

Tracks **`plugin.js`** / **`plugin.json`** behavior. Current release: **v0.0.12** (see **`VERSION`** in **`plugin.js`**).

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
