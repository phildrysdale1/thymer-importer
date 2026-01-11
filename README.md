# thymer-importer
A plugin to import notes from other apps into Thymer

## !Present Limitations and Warnings!

- Currently, the plugin can only import Obsidian vaults relatively reliably into Thymer with automatic schema generation, frontmatter mapping and pasting of markdown content.
  - Not every markdown convention can be pasted into Thymer, and some, like tables, don't even exist yet in Thymer
  - Thymer doesn't support lists in properties, yet, so arrays are converted to comma-separated text for now.
  - Text files only (no attachments)
  - No folder hierarchy (flattened to single collection)
  - Manual re-import (no continuous sync)
- In my experience on my crappy old laptop, this really eats up the CPU and takes around a minute per 100 files or so
- It has only been tested on three test vaults with different naming conventions and frontmatter use
  - So there is a good chance you might need to tweak code to get it to recognise anything you do differently with frontmatter than the standard Obsidian approach.
  - It will not recognise frontmatter in the text at this point.
    
I'd recommend doing this in a test workspace until you are happy with what it imports, the plugin will update current files so be sure to only import into the collection you have created!
I'm looking for more people to test and contribute changes, especially to expand this to support other schemas and file formats.

## What It Does

Stage 1. **Scan** 
- Scans your Obsidian vault
- Generates a note with the results of the scan and a .json code with a property for each frontmatter item.
- The user then creates a collection for the imported files using the generated .json code
Stage 2. **Import**
- Imports all markdown files, mapping their frontmatter to the collection's properties
- Runs through the files a second time to link up all ```[[wikileaks style]]``` using Thymer's linking convention. // THIS IS VERY HIT AND MISS AT THIS STAGE
  
## Installation

1. In Thymer, go to **Settings → Plugins**
2. Click **"+ New Plugin"**
3. Name it "Obsidian Import"
4. Paste the contents of `plugin.js` from this repository into the code editor
5. Save

## Usage

### Step 1: Scan Your Vault

1. Run command (Cmd/Ctrl+P): **"Scan Obsidian Vault"**
2. Enter a name for your vault (e.g., "Personal Notes")
3. Select your Obsidian vault folder
4. Wait for the scan to complete

The plugin creates a note in your **Notes** collection with: (ensure you have a "Notes" collection)
- Complete collection schema (JSON)
- Property mapping details
- Setup instructions

### Step 2: Create Collection

1. Copy the JSON schema from the scan note
2. In Thymer, click **+** next to "Collections"
3. Click **"Edit as code"**
4. Paste the JSON schema in the code box under the "Configuration" tab
5. Save

### Step 3: Import Your Vault

1. Run command: **"Import Obsidian Vault"**
2. Type the name of the collection you just created
3. Select your Obsidian vault folder
4. Confirm import

Done! Your notes are now in Thymer.

## Field Mapping

The plugin automatically maps Obsidian frontmatter to Thymer fields:

```yaml
created: 2024-01-15          → created (datetime)
Object Type: Daily Note      → object_type (text)
walkDog: true               → walkmaia (text)
tags: [work, urgent]         → tags (text: "work, urgent")
```

Scans for common date fields (`created`, `modified`, `updated`) are automatically set to datetime type.

## Re-importing

To update your vault:

1. Run **"Import Obsidian Vault"** again
2. Select the same collection
3. The plugin will update changed files and skip unchanged ones

## Troubleshooting

**Empty notes after import?**
- Check browser console (F12) for errors
- Look for `[Import] Processing "filename" - Markdown length: X chars`

**Fields showing `[object Object]`?**
- The field type is `text` but should be `datetime`
- Re-scan your vault to get a corrected schema
- Create a new collection with the corrected schema
- If it doesn't work, report a bug or squish it yourself and submit a PR.

**Properties not mapping?**
- Check console for `[Import] No match for "propertyName"`
- The plugin tries multiple variations (camelCase, snake_case, etc.)
- Property must appear in >5% of files to be included in schema

**Scan creates empty note?**
- Check console for `[Scan] Generated report (X characters)`
- Notes collection might not have a text field

## Limitations

- Browser-only (Chrome, Edge, Brave)
- Text files only (no attachments)
- No folder hierarchy (flattened to single collection)
- Manual re-import (no continuous sync)
