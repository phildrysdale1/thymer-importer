# Thymer Importer Plugin

A powerful import plugin for Thymer that brings your data from CSV, Obsidian, Logseq, Joplin, Tolaria and Notion exports into Thymer with a streamlined, intelligent workflow.

## Features

### 📊 CSV Import
- **Paste or upload** CSV files
- **Smart type detection** - automatically detects field types from your data
- **Type hints** - add a second row with type names to skip configuration
- **Auto-create collections** with proper schemas or import to existing ones

### 📝 Markdown Import (Obsidian & Logseq)
- **Bulk import** entire vaults in one operation
- **Frontmatter parsing** - extracts YAML properties automatically
- **Smart property detection** - analyzes your notes to recommend field types
- **Folder organization** - preserves folder structure as filterable properties
- **Wiki-link resolution** - converts `[[Note Name]]` to actual Thymer record references

### 🗂️ Tolaria & Notion Export Import
- **Tolaria vaults** - note types become collections, `[[wikilinks]]` and relation properties become record references
- **Notion exports** (Markdown & CSV) - each database becomes a collection, relations between databases are kept
- **Images** are uploaded and inserted into the notes
- **Import report** - what was created or updated, which links stayed text, what was skipped
- **Name-clash prompt** - asks before importing into a collection that already exists
- **Safe re-import** - running it again updates the same records instead of duplicating them

### 📅 Integrated Journal Import (New!)
- **Checkbox option** in the markdown import flow
- **Smart separation** - daily notes → Journal, regular notes → Collection
- **Auto-detection** - recognizes common journal folders (Daily Notes, Journal, etc.)
- **Date-aware** - detects date-formatted filenames automatically
- **Unified workflow** - import your entire vault in one operation

### 🔗 Fix Broken Wikilinks
- **Workspace-wide scan** for unresolved `[[wikilinks]]` and `((block-refs))`
- **Auto-fix** single matches, prompt for disambiguation on multiple matches
- **Safe processing** - excludes code blocks, preserves formatting

## Installation

1. In Thymer, create a new **App Plugin**
2. Copy the contents of `plugin.js`
3. Paste into the plugin editor
4. Save and enable

## Quick Start

### Import CSV

1. Run **Import Data (CSV or Markdown)** → Select **CSV Import**
2. Choose collection or create new
3. Paste CSV or upload file
4. Review/adjust property types → **Import**

**Pro tip:** Add a second row with type hints to skip configuration:
```csv
Name,Age,Status,Join Date
text,number,choice,datetime
Alice,30,Active,2024-01-15
```

### Import Markdown (Obsidian/Logseq)

1. Run **Import Data (CSV or Markdown)** → Select **Markdown Import**
2. Choose **Obsidian** or **Logseq**
3. Select collection or create new
4. Pick your vault folder
5. ✅ **Optional:** Check "Import daily notes to Journal"
   - Specify journal folder name (or leave blank to auto-detect)
   - Daily notes → Thymer Journal
   - Regular notes → Collection
6. **Import**

**What gets imported:**
- Frontmatter → Properties (with smart type detection)
- Markdown content → Formatted notes
- `[[Wikilinks]]` → Clickable record references
- Daily notes → Journal entries (if checkbox enabled)

### Import Tolaria

1. Run **Import Data (CSV or Markdown)** → Select **Markdown Import**
2. Choose **Tolaria**
3. Pick your vault folder (no collection to choose: the vault defines them)
4. **Import**

**What gets imported:**
- Notes with `type: Type` define **collections** (name from `sidebar label`, icon from `_icon`, body → description); every other note becomes a **record** in the collection of its `type:`. Types with no notes get no collection, and untyped notes go to "Notes".
- Frontmatter → properties: `status` / `kind` → choice, `url` → url, numbers → number, `YYYY-MM-DD` → date, the rest → text.
- Keys whose values are all `[[wikilinks]]` (e.g. `related_to`, `belongs_to`) → **record references**
- `[[note-name]]` / `[[note-name|label]]` in the text → clickable **record references**, matched by file name
- `![](attachments/…)` → uploaded **images**
- Skipped: `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` at the vault root, dot-folders (`.git`, `.claude`, …) and Tolaria UI state (`_organized`, `_favorite`, `_icon`, `visible`, `color`, …)
- Links to notes that don't exist stay as `[[text]]`

**Import report:** collections, records, links and images created, updated or failed; types without notes; untyped notes; skipped files; links left as text; errors; and warnings grouped by kind (the status says "Finished with warnings").

### Import Notion Export

1. In Notion, export with **Markdown & CSV** and **include subpages**, then unzip it
2. Run **Import Data (CSV or Markdown)** → Select **Markdown Import** → **Notion export**
3. Pick the unzipped folder. Several database exports can sit side by side in one folder; relations between them are resolved when they are imported together.
4. **Import**

**What gets imported:**
- Each **database** → a **collection**, each row → a **record** (properties from the CSV, text from the row's page). Column types are detected from the data: text, number, date (ranges included), URL, and single or multi-select.
- **Relation columns** (Notion page links) → **record references** to rows of any database in the export
- Standalone pages → a **Notion Pages** collection
- Images in pages → uploaded **images**; `<aside>` callouts → quotes; the repeated property list at the top of row pages is dropped
- Left as text and listed in the report: relations to pages outside the export, and columns that only name rows of another database
- Empty columns create no field (on a re-import they clear what an earlier import stored in the same column); inline `data:` images are skipped

**Import report:** counts, links left as text, relations to pages outside the export, missing images, rows without a page and pages without a row, errors, and warnings grouped by kind (the status says "Finished with warnings").

### If a collection already exists (Tolaria and Notion)

Before anything is written, the plugin compares the collections the import would use with the ones in your workspace. A collection with the same name that was **imported from this source before** (it has a `Source Path` field and a record from this import) is updated silently, which is what makes re-import work. Any other same-named collection (say, your own "Notes" or "Projects") is shown in the dialog, and you choose:

- **Import into separate collections** (default) - every collection of the import gets a prefix you can edit (`Tolaria · ` or `Notion · `), so the source stays together. Import again with the same prefix to update them.
- **Merge into existing collections** - records and new fields are added to the existing collections, and an existing record with the same title and no `Source Path` is overwritten.

### Fix Broken Wikilinks

1. Run **Fix broken [[wikilinks]]**
2. Plugin scans workspace for unresolved links
3. Auto-fixes single matches, prompts for multiple
4. Review summary

## Smart Features

**Auto-Detection:**
- Date fields (`created`, `modified`, `date`) → datetime
- Boolean values → choice fields
- Repeated values (2-10 unique) → dropdowns
- Numeric patterns → number fields
- Journal folders: "Daily Notes", "Journal", "Journals", "Dailies"

**Deduplication:**
- Updates existing records instead of creating duplicates
- Matches by title and source path

**Error Recovery:**
- Individual failures don't stop the import
- Detailed progress updates and error reporting

## Supported Formats

### Date Formats
- `YYYY-MM-DD` (ISO)
- `YYYYMMDD`
- `DD-MM-YYYY`
- `MM-DD-YYYY`
- `YYYY_MM_DD` (Logseq)

### Field Types
`text` • `number` • `datetime` • `checkbox` • `choice` • `url`

## Example Workflow

**Importing an Obsidian vault with daily notes:**

```
vault/
├── Daily Notes/
│   ├── 2024-01-15.md  → Thymer Journal (Jan 15)
│   └── 2024-01-16.md  → Thymer Journal (Jan 16)
├── Projects/
│   └── Project Alpha.md  → Collection
└── Ideas/
    └── Meeting Notes.md  → Collection
```

**Result:**
```
✅ Journal: 2 entries
✅ Collection: 2 imported, 0 updated
```

## Tips

- **CSV**: Use ISO date format (YYYY-MM-DD) for best results
- **Markdown**: Organize in folders - creates filterable folder field
- **Journal**: Leave folder name blank to auto-detect common patterns
- **Large imports**: Progress indicators show status; errors don't stop the process
- **Testing**: Try a small subset first to verify property types

## Troubleshooting

**"No markdown content imported"**
- Check files have content below frontmatter
- Verify files aren't corrupted

**"Journal plugin not found"**
- Enable the Journal feature in Thymer first

**"Wiki-links not resolving"**
- Target notes must exist in the collection
- Titles must match (case-insensitive)
- Use "Fix broken [[wikilinks]]" command after import

**Plugin appears as Collection Plugin**
- Delete completely and clear browser cache
- Create new **App Plugin** (not Collection Plugin)
- See [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

## Technical Details

- **Version:** 0.0.13
- **Type:** App Plugin
- **Dependencies:** None
- **Size:** ~6,300 lines
- **APIs Used:** Collection API (`createCollection`, `getConfiguration` / `saveConfiguration`), Data API (`getAllCollections`, `uploadBlob`), Record and Property API (including record-reference properties), Line Item API (`createLineItem`, `setSegments`, `setBlob`), `DateTime`, Journal API, native `insertFromMarkdown()`

## Development / Tests

The parsing and import logic can run outside Thymer. The tests need Node 20+ and no dependencies:

```bash
npm test
```

They load `plugin.js` with a stub `AppPlugin` and run it against an in-memory Thymer API, using small synthetic fixtures in `test/fixtures/`. See [test/README.md](test/README.md).

To also run the Tolaria and Notion sources over your own exports (the tests are skipped otherwise), point these at local folders. Real exports are never committed:

- `TOLARIA_VAULT` - a Tolaria vault folder
- `NOTION_EXPORT` - an unzipped Notion Markdown & CSV export
- `NOTION_EXPECT` - optional path to a JSON file of expected counts for `NOTION_EXPORT`

```bash
TOLARIA_VAULT=/path/to/vault NOTION_EXPORT=/path/to/export npm test
```

## Contributing

Found a bug? Have a feature request? PRs welcome!

Many more apps to migrate from - help greatly appreciated.

## Roadmap

Coming soon:
- Google Keep
- Apple Notes
- Amplenote
- Capacities
- Workflowy

## Acknowledgments

Thanks to the Thymer team for the incredible plugin API and the [Thymer Discord community](https://discord.gg/7JRKJdnQ)!

---

**Note:** This plugin respects your data. All imports happen locally in your browser. No data is sent to external servers.
