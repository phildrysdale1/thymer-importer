# thymer-importer

A plugin to import notes from other apps into **Thymer**, with a current focus on Obsidian vaults.

This plugin prioritises **schema discovery and data preservation** over perfect fidelity, aiming to get your notes usable in Thymer as safely and transparently as possible.

## Project Status
- Tested on three Obsidian vaults with varying naming conventions and frontmatter styles
- Actively under development
- Contributions and test reports are very welcome, especially:
  - Support for additional frontmatter schemas
  - Other Markdown-based note apps
  - Performance and reliability improvements

---

## Limitations & Warnings

This plugin is **functional but still experimental**. Please read this section carefully before importing important data.

### Supported Sources
- Obsidian vaults are currently the only source that imports *reliably*, including:
  - Automatic schema generation
  - Frontmatter → property mapping
  - Markdown body import
- Other Markdown-based backups *may* work, but:
  - Alternative frontmatter schemas have **not been tested**
  - Behaviour outside standard Obsidian conventions is undefined

### Markdown & Content Support
- Not all Markdown features can be represented in Thymer yet
  - Tables are not supported in Thymer and will be lost
  - Some advanced or non-standard Markdown may not paste cleanly
- Text files only
  - Attachments (images, PDFs, etc.) are not imported

### Properties & Frontmatter
- Thymer does not currently support list/array properties
  - Frontmatter arrays are converted to comma-separated text
- Frontmatter must appear at the very start of the file
  - Inline or mid-document frontmatter is ignored
- Only properties that appear in more than 5% of files are included in the generated schema
- If your frontmatter deviates significantly from standard Obsidian usage, manual code tweaks may be required

### Structure & Sync Behaviour
- Folder hierarchies are not preserved
  - All notes are imported into a single flat collection
- This is a manual, one-shot import
  - There is no continuous or live sync
- Re-importing updates existing notes, but:
  - The update process is currently temperamental
  - In rare cases, notes may be duplicated instead of updated

### Performance
- Importing is CPU-intensive
  - On older or lower-powered hardware, expect roughly ~1 minute per 100 files
  - Large vaults may take significant time and may temporarily freeze the UI

### Safety Warning
- The importer updates existing records in the target collection
- Always test in a dedicated test workspace or test collection first
- Only import into collections created specifically for this plugin

---

## What It Does

### Stage 1: Scan
- Scans your Obsidian vault
- Generates a note containing:
  - A suggested collection schema (JSON)
  - Property mapping details
  - Setup instructions
- You then create a Thymer collection using the generated JSON

### Stage 2: Import
- Imports all Markdown files
- Maps frontmatter fields to the collection’s properties
- Runs a second pass to convert Obsidian-style `[[wikilinks]]` into Thymer links  
  - Note: some links will note be created if you don't import the whole vault at once.

---

## Installation

1. In Thymer, go to **Settings → Plugins**
2. Click **“+ New Plugin”**
3. Name it **“Obsidian Import”**
4. Paste the contents of `plugin.js` from this repository into the **Custom Code** section, replacing all pre-existing code.
5. Save

---

## Usage

⚠️ **Known issue:**
On both step 1 and 3, when opening up your file manager to select the vault, it can occasionally throw an error and fail to do so. This is almost always resolved by trying a couple of times again. I'm trying to figure out what it is. 

### Step 1: Scan Your Vault

1. Run the command (Cmd/Ctrl+P): **“Scan Obsidian Vault”**
2. Enter a name for your vault (e.g. *Personal Notes*)
3. Select your Obsidian vault folder
4. Wait for the scan to complete

The plugin creates a note in your **Notes** collection (ensure you have a “Notes” collection) containing:
- A complete collection schema (JSON)
- Property mapping details
- Setup instructions

---

### Step 2: Create a Collection

1. Copy the JSON schema from the scan note
2. In Thymer, click **+** next to *Collections*
3. Click **“Edit as code”**
4. Paste the JSON schema into the code box under the **Configuration** tab
5. Save

---

### Step 3: Import Your Vault

1. Run the command: **“Import Obsidian Vault”**
2. Type the name of the collection you just created
3. Select your Obsidian vault folder
  - NOTE: As mentioned above the same bug might require you to do this a couple of times.
4. Confirm the import

Done! Your notes should now be available in Thymer.

---

## Field Mapping

The plugin automatically maps Obsidian frontmatter to Thymer fields.

Example:

```yaml
created: 2024-01-15          → created (datetime)
Object Type: Daily Note      → object_type (text)
walkDog: true               → walkmaia (text)
tags: [work, urgent]        → tags (text: "work, urgent")
```

---

## Re-importing

To update your vault:

1. Run **“Import Obsidian Vault”** again
2. Select the same collection
3. The plugin will attempt to update changed files and skip unchanged ones

⚠️ **Known issue:**  
Re-importing is still unreliable. In some cases, notes may be **duplicated instead of updated**. Until this is fixed, treat re-importing as experimental.
There is a bug with Thymer opening the file manager where occasionally it fails - I'm looking into that.

---

## Troubleshooting

### Empty notes after import?
- Open the browser console (F12) and check for errors
- Look for log entries such as:
  - `[Import] Processing "filename" - Markdown length: X chars`

### Fields showing `[object Object]`?
- The field type is set to `text` but should be `datetime`
- Re-scan your vault to generate a corrected schema
- Create a new collection using the updated schema
- If the issue persists, report a bug or submit a fix via PR

### Properties not mapping?
- Check the console for messages like:
  - `[Import] No match for "propertyName"`
- The plugin attempts multiple naming variations (camelCase, snake_case, etc.)
- Properties must appear in **more than 5% of files** to be included in the schema
