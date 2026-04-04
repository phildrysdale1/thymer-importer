# Thymer Importer Plugin

A powerful import plugin for Thymer that brings your data from CSV, Obsidian, Logseq and Joplin into Thymer with a streamlined, intelligent workflow.

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

- **Version:** 0.0.7
- **Type:** App Plugin
- **Dependencies:** None
- **Size:** ~3,300 lines
- **APIs Used:** Collection API, Data API, Journal API, native `insertFromMarkdown()`

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
