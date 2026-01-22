# Thymer Importer Plugin

An import plugin that brings your data into Thymer from multiple sources with a streamlined interface.
Currently supports CSV & Markdown (specifically trained on Obsidian). 
Coming soon: Amplenote, Capacities, Logseq & Workflowy

## Features

### 📊 CSV Import
- **Paste or Upload**: Import CSV data by pasting directly or uploading a file
- **Smart Type Detection**: Automatically detects field types from your data
- **Type Hints Support**: Add a second row with type names (`text`, `number`, `choice`, etc.) to skip configuration
- **Auto-Create Collections**: Creates new collections with proper schemas or imports to existing ones
- **Choice Field Detection**: Automatically identifies and configures dropdown fields with all unique values

### 📝 Markdown Import (Obsidian Compatible)
- **Bulk Import**: Import entire vaults of markdown files in one operation
- **Frontmatter Parsing**: Extracts YAML frontmatter as properties
- **Smart Property Detection**: Analyzes your notes to detect field types automatically
- **Folder Organization**: Preserves folder structure as a choice field
- **Wiki-Link Resolution**: Converts `[[Note Name]]` syntax to actual Thymer record references
- **Obsidian Syntax Support**: Handles callouts, highlights, and other Obsidian-specific markdown

### 🎯 One-Click Experience
- No more two-stage imports
- No typing collection names - use dropdowns
- Visual folder selection
- Real-time progress updates
- Comprehensive error handling

## Current Limitations
- **Only pasting CSV content works on Firefox presently. If you want to import a file/directory you will have to use a Chromium based browser.**
  - I have identified the problem for this but have run out of Claude credit and don't have the skill to fix it without AI. If anyone wants to modify the code to use standard file input with the webkitdirectory attribute and submit a PR, that would be most welcome. 

## Installation

1. In Thymer, create a new **Global Plugin**
2. Copy the contents of `unified-import-plugin.js`
3. Paste into the plugin editor
4. Save and enable the plugin

## Usage

### CSV Import

1. Run the **Import Data** command from the command palette
2. Select **CSV Import**
3. Choose to create a new collection or select an existing one
4. Paste CSV data or upload a CSV file
5. Review and adjust property types
6. Click **Import**

#### CSV Type Hints (Optional)

To skip the property configuration dialog, add type hints as the second row of your CSV:

```csv
Name,Age,Status,Join Date
text,number,choice,datetime
Alice,30,Active,2024-01-15
Bob,25,Pending,2024-02-20
```

Supported types: `text`, `number`, `datetime`, `checkbox`, `choice`, `url`

### Markdown Import

1. Run the **Import Data** command from the command palette
2. Select **Markdown Import**
3. Choose to create a new collection or select an existing one
4. Click to select your markdown folder (e.g., Obsidian vault)
5. Review detected properties and adjust types as needed
6. Click **Import**

The plugin will:
- Scan all `.md` files
- Analyze frontmatter to detect properties
- Create the collection with detected schema
- Import all markdown content
- Resolve wiki-links to actual record references

#### Example Markdown File

```markdown
---
created: 2024-01-15
status: Active
tags: [important, work]
---

# Meeting Notes

Discussion about [[Project Alpha]] with the team.

## Action Items
- [ ] Review the proposal
- [ ] Schedule follow-up

> [!note] Remember
> This is important context
```

This will create a record with:
- **Properties**: `created` (datetime), `status` (choice), `tags` (text)
- **Title**: "Meeting Notes"
- **Content**: All markdown formatted properly
- **Links**: `[[Project Alpha]]` becomes a clickable reference

## Property Type Detection

The plugin intelligently detects field types:

| Data Pattern | Detected Type | Notes |
|-------------|---------------|-------|
| `2024-01-15` | `datetime` | ISO date format |
| `true`/`false` | `choice` | Boolean as dropdown |
| `42` | `number` | Numeric values |
| Repeated values (2-10 unique) | `choice` | Automatic dropdown |
| Everything else | `text` | Default fallback |

Common frontmatter fields like `created`, `modified`, `date` are automatically recognized as datetime fields.

## Features in Detail

### Dark/Light Mode Support
The plugin automatically adapts to Thymer's theme, providing a consistent experience in both dark and light modes.

### Deduplication
Both CSV and Markdown imports check for existing records by title and update them instead of creating duplicates.

### Batch Processing
Large imports are processed in batches with progress indicators to prevent UI freezing.

### Error Recovery
Individual file/row errors don't stop the entire import - the plugin continues and reports what succeeded and what failed.

### Wiki-Link Resolution (Markdown)
The plugin uses Thymer's segments API to convert wiki-links:
- `[[Note Name]]` → Searches for a record with that title
- If found → Creates a clickable record reference
- If not found → Keeps as plain text

## Collection Schema

### Created Collections Include:
- **Fields**: All detected properties with appropriate types
- **Views**: 
  - Table view for all records
  - Board view (if folder field exists)
- **Icons**: Appropriate Tabler icons for each field type
- **Sorting**: Sensible defaults based on field types

## Tips & Best Practices

### For CSV Import
- Include headers in the first row
- Add type hints in the second row to save time
- Keep choice fields under 50 unique values
- Use ISO date format (YYYY-MM-DD) for dates

### For Markdown Import
- Organize files in folders - the plugin creates a folder field automatically
- Use consistent frontmatter across your notes
- Common field names (`created`, `modified`, `tags`) are auto-detected
- Test with a small subset first to verify property types

### Performance
- CSV: Handles thousands of rows smoothly
- Markdown: Processes 500+ notes efficiently
- Progress indicators show status for large imports

## Troubleshooting

### "No markdown content imported"
- Check that your files have content below the frontmatter
- Look for console logs showing character counts
- Verify files are valid markdown (not corrupted)

### "Collection disappeared after creation"
- Wait a moment - there's a small sync delay
- Check the Collections sidebar
- Try refreshing Thymer

### "Wiki-links not resolving"
- Ensure target notes exist in the collection
- Check that note titles match exactly (case-insensitive)
- Wiki-links are resolved in Phase 3 (final step)

### "Property types are wrong"
- You can adjust them in the configuration dialog
- For CSV: Use type hints in row 2
- For Markdown: Common date fields are auto-detected

## Technical Details

- **Version**: 1.0.0
- **Type**: Global Plugin (AppPlugin)
- **Dependencies**: None (self-contained)
- **Storage**: Uses Thymer's native file system APIs
- **API**: Uses Thymer's Collection API and Data API

## Contributing

Found a bug or have a feature request? Please open an issue!
Even better, PLEASE get involved and improve the plugin. There are lots more apps people will want to migrate from so any help would be greatly appreciated. PRs very welcome.

## Acknowledgments

Special thanks to the Thymer team for the incredible plugin API and all the Thymer community on [Discord](https://discord.gg/7JRKJdnQ)
