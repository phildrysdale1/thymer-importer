# Tests

Run with `npm test` (Node 20+, no dependencies).

- `lib/load-plugin.mjs`: evaluates `plugin.js` with a stub `AppPlugin` so methods can be called outside Thymer.
- `lib/fake-thymer.mjs`: an in-memory Thymer data API (collections, records, properties, line items, blobs) whose signatures follow the SDK's `types.d.ts`. It backs the `applyImportPlan()` tests. It is strict about the things the types pin down (e.g. `ref` segments must be `{ guid }`, a record property needs an existing GUID, items with children can't be deleted) but it is **not** Thymer: its `insertFromMarkdown` only splits lines into text/heading/list/task items.
- `lib/fs-handle.mjs`: a File System Access API stand-in (`dirHandle(path)`) backed by a real folder, for code written against `showDirectoryPicker()`.

## Test files

- `smoke.test.mjs`: plugin loads, CSV parsing.
- `link-index.test.mjs`: `LinkIndex` alias resolution (path, slug, Notion id, title, ambiguity).
- `engine.test.mjs`: `applyImportPlan()` against the fake (collections, dedupe, links, unresolved links, multi-value references, assets, journal, failure isolation).
- `live-fixes.test.mjs`: regressions found in real Thymer: date-only values stored a day early (runs with `TZ=America/Chicago`), stray `!` before links for images that were not imported, empty quote items from blank lines in Notion `<aside>` callouts.
- `name-clash.test.mjs`: the name-clash check for Tolaria and Notion (a clash is detected, a previous import is not one, the prefix reaches every collection, re-import with a prefix is idempotent, merge keeps the old behaviour) and the dialog panel, on the fake.
- `review-fixes.test.mjs`: regressions for the review of the upstream PR (Notion id-suffixed rows folders and page-less rows with the same title, Tolaria field-id collisions, re-import by `source_path` alone, choice options on re-import, clearing values that are gone from the source). Fixture: `fixtures/notion-id-folders`.
- `tolaria.test.mjs`: `parseTolariaVault()` over `fixtures/tolaria` (plan snapshots, directory-handle and file-list input, parent-folder pick, idempotent re-import on the fake, dialog glue with a DOM stub).
- `tolaria-real.test.mjs`: the same parser + `applyImportPlan()` over a real vault; skipped unless `TOLARIA_VAULT` is set. Prints a count summary only.
- `notion.test.mjs`: `parseNotionExport()` on `fixtures/notion` (plan snapshot, relations, link-by-title candidates, bodies/links/assets/callouts, directory handle vs file list), `applyImportPlan()` on the fake, the dialog's Notion branch with a stub DOM, and the real-export test (skipped unless `NOTION_EXPORT` is set; set `NOTION_EXPECT` to a JSON file outside the repo for exact counts).

## Fixtures

- `fixtures/<source>/`: small **synthetic** fixtures, committed. They mirror the real export structure but contain made-up content.
  - `fixtures/notion/`: two databases in separate `ExportBlock` folders (Recipes, Ingredients) with a relation each way, a BOM, `.csv` and `_all.csv` (the view hides one column), a date, a date range, a multi-select, row pages with property blocks, an image, a `data:` image, a page with no CSV row, a CSV row with no page, an untitled row, a relation to a page that is not in the export, text that names rows of another database, and a standalone page with `<aside>` callouts. Ids are made up (md5 of a label).
  - `fixtures/notion-id-folders/`: one database whose rows folder is named with the id (`Tasks <id>/`), plus csv rows without a page, two of them with the same title and two untitled.
- Real exports are **never committed**. Tests that use them read a path from an env var and skip when it's unset:
  - `TOLARIA_VAULT`: a Tolaria vault folder
  - `NOTION_EXPORT`: an unzipped Notion "Markdown & CSV" export folder
- `fixtures/private/` is gitignored for local copies or symlinks.
