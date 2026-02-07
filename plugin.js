const VERSION = 'v0.0.7';
/**
 * Unified Import Plugin for Thymer
 * Supports CSV, Obsidian Markdown, and Logseq imports with UI
 * 
 * v0.0.7 - Added an option to autodetect (or select folder) for journal entries in import and automatically import them into your Thymer Journal collection
 * v0.0.6 - Added "Import Daily Notes to Journal" command
 * v0.0.5 - Added "Fix broken [[wikilinks]]" command
 * v0.0.4 - Merged version combining:
 * - CSV import with full UI (from v0.0.3)
 * - Obsidian markdown support (from v0.0.3)  
 * - Logseq support (from v0.0.2 fork)
 * - Unified import dialog and theme support
 */

class Plugin extends AppPlugin {

    onLoad() {
        try {
            console.log('[Unified Import] Plugin loaded - version', VERSION);
            
            this.ui.addCommandPaletteCommand({
                label: 'Import Data (CSV or Markdown)',
                icon: 'ti-file-import',
                onSelected: () => this.showImportTypeDialog()
            });

            this.ui.addCommandPaletteCommand({
                label: 'Import Daily Notes to Journal',
                icon: 'ti-calendar',
                onSelected: () => this.importDailyNotesToJournal()
            });

            this.ui.addCommandPaletteCommand({
                label: 'Fix broken [[wikilinks]]',
                icon: 'ti-link',
                onSelected: () => this.fixBrokenWikiLinks()
            });
        } catch (error) {
            console.error('[Unified Import] Error in onLoad:', error);
        }
    }

    // =========================================================================
    // IMPORT DAILY NOTES TO JOURNAL
    // =========================================================================

    async importDailyNotesToJournal() {
        try {
            console.log('[Journal Import] Starting daily notes import...');
            
            // Find the journal collection using getAllCollections() then isJournalPlugin()
            const collections = await this.data.getAllCollections();
            const journalCollection = collections.find(c => c.isJournalPlugin());
            
            if (!journalCollection) {
                this.showToast('Journal not found. Please enable the Journal feature first.', 5000);
                console.error('[Journal Import] No collection with isJournalPlugin() found');
                return;
            }

            console.log('[Journal Import] Found journal collection');

            // Show source selection dialog
            const source = await this.showJournalSourceDialog();
            if (!source) return;

            console.log('[Journal Import] Selected source:', source);

            // Show folder picker
            const dirHandle = await this.pickFolder();
            if (!dirHandle) return;

            this.showToast('Scanning for daily notes...', 3000);

            // Scan for daily notes based on source
            const dailyNotes = source === 'logseq'
                ? await this.scanLogseqDailyNotes(dirHandle)
                : await this.scanObsidianDailyNotes(dirHandle);

            if (dailyNotes.length === 0) {
                this.showToast('No daily notes found', 3000);
                return;
            }

            console.log(`[Journal Import] Found ${dailyNotes.length} daily notes`);

            // Show confirmation
            const confirmed = confirm(
                `Found ${dailyNotes.length} daily notes.\n\n` +
                `Import to Thymer Journal?\n\n` +
                `Note: Existing journal entries for the same dates will be updated.`
            );
            
            if (!confirmed) return;

            // Import the daily notes
            await this.importDailyNotes(journalCollection, dailyNotes, source);

        } catch (error) {
            console.error('[Journal Import] Error:', error);
            this.showToast(`Error importing daily notes: ${error.message}`, 5000);
        }
    }

    async showJournalSourceDialog() {
        const colors = this.getThemeColors();
        
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            `;

            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background: ${colors.background};
                color: ${colors.text};
                border-radius: 8px;
                padding: 32px;
                width: 90%;
                max-width: 500px;
                border: 1px solid ${colors.border};
            `;

            dialog.innerHTML = `
                <h2 style="margin: 0 0 24px 0; color: ${colors.text}; text-align: center;">Import Daily Notes</h2>
                <p style="margin: 0 0 24px 0; color: ${colors.textSecondary}; text-align: center;">
                    Select the source of your daily notes
                </p>
                <div style="display: flex; flex-direction: column; gap: 16px;">
                    <button id="obsidian-btn" style="
                        padding: 20px;
                        background: ${colors.backgroundSecondary};
                        color: ${colors.text};
                        border: 2px solid ${colors.border};
                        border-radius: 8px;
                        font-size: 16px;
                        cursor: pointer;
                        text-align: left;
                        transition: all 0.2s;
                    ">
                        <div style="font-weight: 600; margin-bottom: 4px;">📝 Obsidian Daily Notes</div>
                        <div style="font-size: 13px; color: ${colors.textSecondary};">
                            Import from Obsidian daily notes folder
                        </div>
                    </button>
                    <button id="logseq-btn" style="
                        padding: 20px;
                        background: ${colors.backgroundSecondary};
                        color: ${colors.text};
                        border: 2px solid ${colors.border};
                        border-radius: 8px;
                        font-size: 16px;
                        cursor: pointer;
                        text-align: left;
                        transition: all 0.2s;
                    ">
                        <div style="font-weight: 600; margin-bottom: 4px;">📓 Logseq Journals</div>
                        <div style="font-size: 13px; color: ${colors.textSecondary};">
                            Import from Logseq journals folder
                        </div>
                    </button>
                </div>
                <div style="margin-top: 24px; text-align: center;">
                    <button id="cancel-btn" style="
                        padding: 10px 24px;
                        background: transparent;
                        color: ${colors.text};
                        border: 1px solid ${colors.border};
                        border-radius: 6px;
                        cursor: pointer;
                    ">Cancel</button>
                </div>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            const addHoverEffects = (btn) => {
                btn.onmouseenter = () => {
                    btn.style.borderColor = colors.primary;
                    btn.style.transform = 'translateY(-2px)';
                };
                btn.onmouseleave = () => {
                    btn.style.borderColor = colors.border;
                    btn.style.transform = 'translateY(0)';
                };
            };

            addHoverEffects(dialog.querySelector('#obsidian-btn'));
            addHoverEffects(dialog.querySelector('#logseq-btn'));

            dialog.querySelector('#obsidian-btn').onclick = () => {
                document.body.removeChild(overlay);
                resolve('obsidian');
            };

            dialog.querySelector('#logseq-btn').onclick = () => {
                document.body.removeChild(overlay);
                resolve('logseq');
            };

            dialog.querySelector('#cancel-btn').onclick = () => {
                document.body.removeChild(overlay);
                resolve(null);
            };

            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    document.body.removeChild(overlay);
                    resolve(null);
                }
            };
        });
    }

    async pickFolder() {
        try {
            if (window.showDirectoryPicker) {
                return await window.showDirectoryPicker({
                    mode: 'read',
                    startIn: 'documents'
                });
            }

            // Fallback for browsers without File System Access API
            const input = document.createElement('input');
            input.type = 'file';
            input.webkitdirectory = true;
            input.multiple = true;
            input.style.display = 'none';
            document.body.appendChild(input);

            return await new Promise((resolve) => {
                input.addEventListener('change', () => {
                    const files = Array.from(input.files || []);
                    document.body.removeChild(input);
                    if (files.length === 0) {
                        resolve(null);
                    } else {
                        resolve({ kind: 'filelist', files });
                    }
                }, { once: true });
                input.click();
            });
        } catch (error) {
            if (error.name === 'AbortError') return null;
            throw error;
        }
    }

    async scanObsidianDailyNotes(dirHandle) {
        const dailyNotes = [];
        
        if (dirHandle && dirHandle.kind === 'filelist') {
            // Handle file list from fallback
            for (const file of dirHandle.files) {
                const relPath = file.webkitRelativePath || file.name;
                if (!relPath.endsWith('.md')) continue;

                const filename = file.name.replace(/\.md$/, '');
                const date = this.parseObsidianDateFromFilename(filename);
                
                if (date) {
                    dailyNotes.push({
                        handle: file,
                        path: relPath,
                        filename: filename,
                        date: date
                    });
                }
            }
        } else {
            // Handle directory picker
            await this.scanObsidianDirectory(dirHandle, '', dailyNotes);
        }

        return dailyNotes.sort((a, b) => a.date.localeCompare(b.date));
    }

    async scanObsidianDirectory(dirHandle, path, dailyNotes) {
        for await (const entry of dirHandle.values()) {
            const fullPath = path ? `${path}/${entry.name}` : entry.name;

            if (entry.kind === 'directory') {
                if (entry.name.startsWith('.') || entry.name === 'node_modules') {
                    continue;
                }
                await this.scanObsidianDirectory(entry, fullPath, dailyNotes);
            } else if (entry.kind === 'file' && entry.name.endsWith('.md')) {
                const filename = entry.name.replace(/\.md$/, '');
                const date = this.parseObsidianDateFromFilename(filename);
                
                if (date) {
                    dailyNotes.push({
                        handle: entry,
                        path: fullPath,
                        filename: filename,
                        date: date
                    });
                }
            }
        }
    }

    parseObsidianDateFromFilename(filename) {
        // Common Obsidian daily note formats:
        // YYYY-MM-DD (most common)
        // YYYYMMDD
        // DD-MM-YYYY
        // MM-DD-YYYY
        
        // Try YYYY-MM-DD format
        let match = filename.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (match) {
            return `${match[1]}-${match[2]}-${match[3]}`;
        }
        
        // Try YYYYMMDD format
        match = filename.match(/^(\d{4})(\d{2})(\d{2})$/);
        if (match) {
            return `${match[1]}-${match[2]}-${match[3]}`;
        }
        
        // Try DD-MM-YYYY format
        match = filename.match(/^(\d{2})-(\d{2})-(\d{4})$/);
        if (match) {
            return `${match[3]}-${match[2]}-${match[1]}`;
        }
        
        // Try MM-DD-YYYY format
        match = filename.match(/^(\d{2})-(\d{2})-(\d{4})$/);
        if (match) {
            // Ambiguous - could be DD-MM or MM-DD
            // Default to MM-DD (US format) if day > 12
            const first = parseInt(match[1]);
            const second = parseInt(match[2]);
            if (first > 12) {
                // Must be DD-MM
                return `${match[3]}-${match[2]}-${match[1]}`;
            }
            // Assume MM-DD
            return `${match[3]}-${match[1]}-${match[2]}`;
        }
        
        return null;
    }

    async scanLogseqDailyNotes(dirHandle) {
        const dailyNotes = [];
        
        if (dirHandle && dirHandle.kind === 'filelist') {
            // Handle file list from fallback
            for (const file of dirHandle.files) {
                const relPath = file.webkitRelativePath || file.name;
                if (!relPath.endsWith('.md')) continue;

                // Check if in journals folder
                const parts = relPath.split('/');
                if (parts.length === 0) continue;
                
                const topFolder = parts[0];
                if (topFolder !== 'journals') continue;

                const filename = file.name.replace(/\.md$/, '');
                const date = this.parseLogseqDateFromFilename(filename);
                
                if (date) {
                    dailyNotes.push({
                        handle: file,
                        path: relPath,
                        filename: filename,
                        date: date
                    });
                }
            }
        } else {
            // Handle directory picker - look for journals folder
            for await (const entry of dirHandle.values()) {
                if (entry.kind === 'directory' && entry.name === 'journals') {
                    await this.scanLogseqJournalsDirectory(entry, dailyNotes);
                    break;
                }
            }
        }

        return dailyNotes.sort((a, b) => a.date.localeCompare(b.date));
    }

    async scanLogseqJournalsDirectory(dirHandle, dailyNotes) {
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file' && entry.name.endsWith('.md')) {
                const filename = entry.name.replace(/\.md$/, '');
                const date = this.parseLogseqDateFromFilename(filename);
                
                if (date) {
                    dailyNotes.push({
                        handle: entry,
                        path: `journals/${entry.name}`,
                        filename: filename,
                        date: date
                    });
                }
            }
        }
    }

    parseLogseqDateFromFilename(filename) {
        // Logseq format: YYYY_MM_DD
        const match = filename.match(/^(\d{4})_(\d{2})_(\d{2})$/);
        if (match) {
            return `${match[1]}-${match[2]}-${match[3]}`;
        }
        
        return null;
    }

    async importDailyNotes(journalPlugin, dailyNotes, source) {
        let imported = 0;
        let updated = 0;
        let errors = 0;

        console.log(`[Journal Import] Importing ${dailyNotes.length} daily notes`);
        this.showToast(`Importing ${dailyNotes.length} daily notes...`, 3000);

        for (let i = 0; i < dailyNotes.length; i++) {
            const note = dailyNotes[i];

            try {
                if (i % 5 === 0) {
                    this.showToast(`Importing ${i + 1}/${dailyNotes.length}`, 500);
                }

                console.log(`[Journal Import] Processing: ${note.filename} (${note.date})`);

                // Read the file content
                const fileHandle = await this.getFileFromHandle(note.handle);
                const content = await fileHandle.text();

                // Parse the markdown
                const parsed = source === 'logseq'
                    ? this.parseLogseqFile(content)
                    : this.parseMarkdownFile(content);

                // Parse the date into components
                const [year, month, day] = note.date.split('-').map(n => parseInt(n));

                // Get the current user
                const users = this.data.getActiveUsers();
                const currentUser = users[0]; // Get the first active user (current user)
                
                if (!currentUser) {
                    console.error(`[Journal Import] No active user found`);
                    errors++;
                    continue;
                }

                // Create a DateTime object for the date (date-only, no time component)
                // month is 0-indexed in JavaScript Date
                const dateTime = DateTime.dateOnly(year, month - 1, day);

                // Get or create journal record for this date
                const journalRecord = await journalPlugin.getJournalRecord(currentUser, dateTime);
                
                if (!journalRecord) {
                    console.error(`[Journal Import] Failed to get/create journal record for ${note.date}`);
                    errors++;
                    continue;
                }

                // Important: Wait for the record to be fully initialized
                await new Promise(resolve => setTimeout(resolve, 500));

                // Check if this is a new record or existing
                const lineItems = await journalRecord.getLineItems();
                const isNew = !lineItems || lineItems.length === 0;

                if (isNew) {
                    console.log(`[Journal Import] Creating new journal entry for ${note.date}`);
                    imported++;
                } else {
                    console.log(`[Journal Import] Updating existing journal entry for ${note.date}`);
                    updated++;
                }

                // Insert the markdown content using the native API
                if (parsed.markdown) {
                    console.log(`[Journal Import] Inserting ${parsed.markdown.length} characters of markdown`);
                    
                    try {
                        // Use the native insertFromMarkdown method
                        const success = await journalRecord.insertFromMarkdown(
                            parsed.markdown,
                            null,  // parentItem: null = use record as parent
                            null   // afterItem: null = insert as first child
                        );
                        
                        if (success) {
                            console.log(`[Journal Import] ✓ Successfully imported ${note.filename}`);
                        } else {
                            console.error(`[Journal Import] insertFromMarkdown returned false for ${note.filename}`);
                            errors++;
                        }
                    } catch (error) {
                        console.error(`[Journal Import] insertFromMarkdown failed for ${note.filename}:`, error);
                        errors++;
                    }
                } else {
                    console.log(`[Journal Import] No markdown content for ${note.filename}`);
                }

            } catch (error) {
                console.error(`[Journal Import] Error processing ${note.filename}:`, error);
                errors++;
            }
        }

        this.showToast(
            `Journal import complete!\n` +
            `New entries: ${imported}\n` +
            `Updated: ${updated}\n` +
            `Errors: ${errors}`,
            8000
        );

        console.log(`[Journal Import] Complete: ${imported} imported, ${updated} updated, ${errors} errors`);
    }

    // =========================================================================
    // FIX BROKEN WIKILINKS COMMAND
    // =========================================================================

    async fixBrokenWikiLinks() {
        try {
            console.log('[Fix Links] Starting wikilink repair scan...');
            this.showToast('Scanning workspace for broken wikilinks...', 3000);

            // Get all collections
            const collections = await this.data.getAllCollections();
            
            // Build a workspace-wide name→record map
            const nameToRecords = new Map(); // name → array of {record, collection}
            const guidToRecord = new Map();   // guid → {record, collection}
            
            console.log('[Fix Links] Building workspace lookup map...');
            for (const collection of collections) {
                const records = await collection.getAllRecords();
                for (const record of records) {
                    const name = record.getName();
                    if (name) {
                        const key = name.toLowerCase();
                        if (!nameToRecords.has(key)) {
                            nameToRecords.set(key, []);
                        }
                        nameToRecords.get(key).push({ record, collection });
                        guidToRecord.set(record.guid, { record, collection });
                    }
                }
            }
            
            console.log(`[Fix Links] Found ${nameToRecords.size} unique record names across ${collections.length} collections`);

            // Scan all records for broken wikilinks
            let totalLineItems = 0;
            let lineItemsWithLinks = 0;
            let brokenLinksFound = 0;
            const fixableLinks = []; // {record, collection, lineItem, lineIndex, linkText, candidates}

            for (const collection of collections) {
                const records = await collection.getAllRecords();
                
                for (const record of records) {
                    const lineItems = await record.getLineItems();
                    if (!lineItems || lineItems.length === 0) continue;

                    for (let i = 0; i < lineItems.length; i++) {
                        const lineItem = lineItems[i];
                        totalLineItems++;
                        
                        const segments = lineItem.segments || [];
                        if (segments.length === 0) continue;

                        // Check if this line contains [[...]] or ((...)) in text segments
                        // Exclude code blocks and inline code
                        let hasUnresolvedLinks = false;
                        const unresolvedLinks = [];
                        
                        for (const segment of segments) {
                            // Skip code segments (inline code)
                            if (segment.type === 'code') continue;
                            
                            // Only check text segments
                            if (segment.type === 'text' && segment.text) {
                                // Look for [[...]] or ((...)) patterns
                                const linkRegex = /(\[\[([^\]]+)\]\]|\(\(([^\)]+)\)\))/g;
                                let match;
                                
                                while ((match = linkRegex.exec(segment.text)) !== null) {
                                    hasUnresolvedLinks = true;
                                    const linkText = match[2] || match[3];
                                    unresolvedLinks.push(linkText.trim());
                                }
                            }
                        }

                        if (hasUnresolvedLinks) {
                            lineItemsWithLinks++;
                            
                            // For each unresolved link, find potential matches
                            for (const linkText of unresolvedLinks) {
                                brokenLinksFound++;
                                const key = linkText.toLowerCase();
                                const candidates = nameToRecords.get(key) || [];
                                
                                if (candidates.length > 0) {
                                    fixableLinks.push({
                                        record,
                                        collection,
                                        lineItem,
                                        lineIndex: i,
                                        linkText,
                                        candidates
                                    });
                                }
                            }
                        }
                    }
                }
            }

            console.log(`[Fix Links] Scan complete: ${totalLineItems} line items, ${lineItemsWithLinks} with wikilinks, ${brokenLinksFound} broken links found`);

            if (fixableLinks.length === 0) {
                this.showToast('No fixable broken wikilinks found!', 5000);
                return;
            }

            // Process fixable links - show dialog for each with multiple candidates
            console.log(`[Fix Links] Processing ${fixableLinks.length} fixable links...`);
            await this.processFixableLinks(fixableLinks, nameToRecords);

        } catch (error) {
            console.error('[Fix Links] Error:', error);
            this.showToast(`Error fixing wikilinks: ${error.message}`, 5000);
        }
    }

    async processFixableLinks(fixableLinks, nameToRecords) {
        let fixed = 0;
        let skipped = 0;
        
        // Group by record to batch updates
        const linksByRecord = new Map();
        for (const link of fixableLinks) {
            const recordKey = `${link.collection.getGuid()}_${link.record.guid}`;
            if (!linksByRecord.has(recordKey)) {
                linksByRecord.set(recordKey, []);
            }
            linksByRecord.get(recordKey).push(link);
        }

        console.log(`[Fix Links] Processing ${linksByRecord.size} records with broken links...`);

        for (const [recordKey, links] of linksByRecord.entries()) {
            const record = links[0].record;
            const collection = links[0].collection;
            
            console.log(`[Fix Links] Processing record: ${record.getName()} with ${links.length} broken links`);

            // Build a map of line index to link fixes
            const fixesByLine = new Map();
            
            for (const link of links) {
                if (link.candidates.length === 1) {
                    // Single match - auto-fix
                    if (!fixesByLine.has(link.lineIndex)) {
                        fixesByLine.set(link.lineIndex, []);
                    }
                    fixesByLine.get(link.lineIndex).push({
                        linkText: link.linkText,
                        targetRecord: link.candidates[0].record
                    });
                    fixed++;
                } else {
                    // Multiple matches - ask user
                    const choice = await this.showLinkChoiceDialog(
                        link.linkText,
                        link.candidates,
                        record.getName()
                    );
                    
                    if (choice) {
                        if (!fixesByLine.has(link.lineIndex)) {
                            fixesByLine.set(link.lineIndex, []);
                        }
                        fixesByLine.get(link.lineIndex).push({
                            linkText: link.linkText,
                            targetRecord: choice.record
                        });
                        fixed++;
                    } else {
                        skipped++;
                    }
                }
            }

            // Apply all fixes for this record
            if (fixesByLine.size > 0) {
                await this.applyLinkFixes(record, fixesByLine);
            }
        }

        this.showToast(`Fixed ${fixed} wikilinks, skipped ${skipped}`, 5000);
    }

    async showLinkChoiceDialog(linkText, candidates, recordName) {
        const colors = this.getThemeColors();
        
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10001;
            `;

            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background: ${colors.background};
                color: ${colors.text};
                border: 1px solid ${colors.border};
                border-radius: 8px;
                padding: 24px;
                width: 90%;
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
            `;

            const candidateOptions = candidates.map((c, idx) => {
                const collectionName = c.collection.getName();
                return `
                    <div style="
                        padding: 12px;
                        margin: 8px 0;
                        border: 2px solid ${colors.border};
                        border-radius: 6px;
                        cursor: pointer;
                        transition: all 0.2s;
                        background: ${colors.backgroundSecondary};
                    " class="link-option" data-index="${idx}">
                        <div style="font-weight: 600; margin-bottom: 4px;">${this.escapeHtml(c.record.getName())}</div>
                        <div style="font-size: 12px; color: ${colors.textSecondary};">Collection: ${this.escapeHtml(collectionName)}</div>
                    </div>
                `;
            }).join('');

            dialog.innerHTML = `
                <h2 style="margin: 0 0 16px 0; color: ${colors.text};">Choose Link Target</h2>
                <p style="margin: 0 0 16px 0; color: ${colors.textSecondary};">
                    Multiple records found for <strong>[[${this.escapeHtml(linkText)}]]</strong> in <em>${this.escapeHtml(recordName)}</em>
                </p>
                <div id="candidate-options">
                    ${candidateOptions}
                </div>
                <div style="margin-top: 24px; display: flex; gap: 8px; justify-content: flex-end;">
                    <button id="skip-btn" style="
                        padding: 8px 16px;
                        border: 1px solid ${colors.buttonBorder};
                        background: ${colors.buttonBg};
                        color: ${colors.buttonText};
                        border-radius: 4px;
                        cursor: pointer;
                    ">Skip</button>
                </div>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            // Add hover effects to options
            const options = dialog.querySelectorAll('.link-option');
            options.forEach(option => {
                option.addEventListener('mouseenter', () => {
                    option.style.borderColor = colors.primary;
                    option.style.transform = 'translateX(4px)';
                });
                option.addEventListener('mouseleave', () => {
                    option.style.borderColor = colors.border;
                    option.style.transform = 'translateX(0)';
                });
                option.addEventListener('click', () => {
                    const idx = parseInt(option.getAttribute('data-index'));
                    document.body.removeChild(overlay);
                    resolve(candidates[idx]);
                });
            });

            dialog.querySelector('#skip-btn').onclick = () => {
                document.body.removeChild(overlay);
                resolve(null);
            };

            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    document.body.removeChild(overlay);
                    resolve(null);
                }
            };
        });
    }

    async applyLinkFixes(record, fixesByLine) {
        const lineItems = await record.getLineItems();
        
        for (const [lineIndex, fixes] of fixesByLine.entries()) {
            const lineItem = lineItems[lineIndex];
            if (!lineItem) continue;

            const segments = lineItem.segments || [];
            if (segments.length === 0) continue;

            const newSegments = [];
            
            for (const segment of segments) {
                if (segment.type === 'text' && segment.text) {
                    // Replace [[linkText]] and ((linkText)) with refs
                    let lastIndex = 0;
                    
                    // Build a regex that matches any of the link texts
                    const linkTexts = fixes.map(f => f.linkText);
                    const escapedTexts = linkTexts.map(text => 
                        text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                    );
                    const pattern = `(\\[\\[(${escapedTexts.join('|')})\\]\\]|\\(\\((${escapedTexts.join('|')})\\)\\))`;
                    const linkRegex = new RegExp(pattern, 'g');
                    
                    let match;
                    while ((match = linkRegex.exec(segment.text)) !== null) {
                        const linkText = match[2] || match[3];
                        const fix = fixes.find(f => f.linkText === linkText);
                        
                        if (fix) {
                            // Add text before the link
                            if (match.index > lastIndex) {
                                newSegments.push({
                                    type: 'text',
                                    text: segment.text.substring(lastIndex, match.index)
                                });
                            }
                            
                            // Add ref segment
                            newSegments.push({
                                type: 'ref',
                                text: fix.targetRecord.guid
                            });
                            
                            lastIndex = match.index + match[0].length;
                        }
                    }
                    
                    // Add remaining text
                    if (lastIndex < segment.text.length) {
                        newSegments.push({
                            type: 'text',
                            text: segment.text.substring(lastIndex)
                        });
                    }
                } else {
                    // Keep non-text segments as-is
                    newSegments.push(segment);
                }
            }
            
            // Update the line item with fixed segments
            try {
                await lineItem.setSegments(newSegments);
                console.log(`[Fix Links] Updated line ${lineIndex} with ${fixes.length} fixes`);
            } catch (error) {
                console.error(`[Fix Links] Error updating line ${lineIndex}:`, error);
            }
        }
    }

    // =========================================================================
    // IMPORT TYPE SELECTION DIALOG
    // =========================================================================

    showImportTypeDialog() {
        const colors = this.getThemeColors();
        
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: ${colors.background};
            color: ${colors.text};
            border-radius: 8px;
            padding: 32px;
            width: 90%;
            max-width: 500px;
            border: 1px solid ${colors.border};
        `;

        dialog.innerHTML = `
            <h2 style="margin: 0 0 24px 0; color: ${colors.text}; text-align: center;">Import Data</h2>
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <button id="csv-import-btn" style="
                    padding: 20px;
                    background: ${colors.backgroundSecondary};
                    color: ${colors.text};
                    border: 2px solid ${colors.border};
                    border-radius: 8px;
                    font-size: 16px;
                    cursor: pointer;
                    text-align: left;
                    transition: all 0.2s;
                ">
                    <div style="font-weight: 600; margin-bottom: 4px;">📊 CSV Import</div>
                    <div style="font-size: 13px; color: ${colors.textSecondary};">
                        Import tabular data from CSV files or pasted text
                    </div>
                </button>
                <button id="markdown-import-btn" style="
                    padding: 20px;
                    background: ${colors.backgroundSecondary};
                    color: ${colors.text};
                    border: 2px solid ${colors.border};
                    border-radius: 8px;
                    font-size: 16px;
                    cursor: pointer;
                    text-align: left;
                    transition: all 0.2s;
                ">
                    <div style="font-weight: 600; margin-bottom: 4px;">📝 Markdown Import (Obsidian/Logseq)</div>
                    <div style="font-size: 13px; color: ${colors.textSecondary};">
                        Import from Obsidian or Logseq vaults
                    </div>
                </button>
            </div>
            <div style="margin-top: 24px; text-align: center;">
                <button id="cancel-btn" style="
                    padding: 10px 24px;
                    background: transparent;
                    color: ${colors.text};
                    border: 1px solid ${colors.border};
                    border-radius: 6px;
                    cursor: pointer;
                ">Cancel</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const addHoverEffects = (btn) => {
            btn.onmouseenter = () => {
                btn.style.borderColor = colors.primary;
                btn.style.transform = 'translateY(-2px)';
            };
            btn.onmouseleave = () => {
                btn.style.borderColor = colors.border;
                btn.style.transform = 'translateY(0)';
            };
        };

        addHoverEffects(dialog.querySelector('#csv-import-btn'));
        addHoverEffects(dialog.querySelector('#markdown-import-btn'));

        dialog.querySelector('#csv-import-btn').onclick = () => {
            document.body.removeChild(overlay);
            this.showCSVImportDialog();
        };

        dialog.querySelector('#markdown-import-btn').onclick = () => {
            document.body.removeChild(overlay);
            this.showMarkdownImportDialog();
        };

        dialog.querySelector('#cancel-btn').onclick = () => {
            document.body.removeChild(overlay);
        };

        overlay.onclick = (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        };
    }

    // ========================================================================
    // CSV IMPORT (Complete implementation)
    // =========================================================================

    showCSVImportDialog() {
        const colors = this.getThemeColors();
        
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: ${colors.background};
            color: ${colors.text};
            border-radius: 8px;
            padding: 24px;
            width: 90%;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            border: 1px solid ${colors.border};
        `;

        dialog.innerHTML = `
            <h2 style="margin: 0 0 16px 0; color: ${colors.text};">Import CSV</h2>
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: ${colors.text};">Select Collection:</label>
                <select id="csv-collection-select" style="width: 100%; padding: 8px; border: 1px solid ${colors.inputBorder}; border-radius: 4px; background: ${colors.input}; color: ${colors.text};">
                    <option value="">-- Select a collection --</option>
                    <option value="__CREATE_NEW__">✨ Create New Collection</option>
                </select>
            </div>
            <div id="new-collection-name-container" style="margin-bottom: 16px; display: none;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: ${colors.text};">New Collection Name:</label>
                <input 
                    type="text" 
                    id="new-collection-name" 
                    placeholder="e.g., Tasks, Contacts, Projects"
                    style="width: 100%; padding: 8px; border: 1px solid ${colors.inputBorder}; border-radius: 4px; background: ${colors.input}; color: ${colors.text};"
                >
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: ${colors.text};">CSV Source:</label>
                <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                    <label style="flex: 1; text-align: center; padding: 8px; border: 2px solid ${colors.primary}; background: ${colors.backgroundSecondary}; border-radius: 4px; cursor: pointer; color: ${colors.text};">
                        <input type="radio" name="csv-source" value="paste" checked style="margin-right: 4px;">
                        Paste CSV
                    </label>
                    <label style="flex: 1; text-align: center; padding: 8px; border: 2px solid ${colors.border}; background: ${colors.backgroundSecondary}; border-radius: 4px; cursor: pointer; color: ${colors.text};">
                        <input type="radio" name="csv-source" value="upload" style="margin-right: 4px;">
                        Upload File
                    </label>
                </div>
                <div id="csv-paste-container">
                    <textarea 
                        id="csv-data-input" 
                        placeholder="Paste your CSV here (first row should be headers)"
                        style="width: 100%; height: 200px; font-family: monospace; font-size: 12px; padding: 8px; border: 1px solid ${colors.inputBorder}; border-radius: 4px; background: ${colors.input}; color: ${colors.text};"
                    ></textarea>
                </div>
                <div id="csv-upload-container" style="display: none;">
                    <input 
                        type="file" 
                        id="csv-file-input" 
                        accept=".csv,text/csv"
                        style="width: 100%; padding: 8px; border: 1px solid ${colors.inputBorder}; border-radius: 4px; background: ${colors.input}; color: ${colors.text};"
                    >
                    <div id="file-preview" style="margin-top: 8px; font-size: 12px; color: ${colors.textSecondary};"></div>
                </div>
            </div>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button id="csv-cancel-btn" style="padding: 8px 16px; border: 1px solid ${colors.buttonBorder}; background: ${colors.buttonBg}; color: ${colors.buttonText}; border-radius: 4px; cursor: pointer;">Cancel</button>
                <button id="csv-import-btn" style="padding: 8px 16px; border: none; background: ${colors.primary}; color: #fff; border-radius: 4px; cursor: pointer;">Import</button>
            </div>
            <div id="csv-status" style="margin-top: 16px; padding: 12px; border-radius: 4px; display: none;"></div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        this.loadCollections(dialog, 'csv-collection-select');

        const collectionSelect = dialog.querySelector('#csv-collection-select');
        const newCollectionNameContainer = dialog.querySelector('#new-collection-name-container');
        collectionSelect.addEventListener('change', () => {
            if (collectionSelect.value === '__CREATE_NEW__') {
                newCollectionNameContainer.style.display = 'block';
            } else {
                newCollectionNameContainer.style.display = 'none';
            }
        });

        const pasteRadio = dialog.querySelector('input[value="paste"]');
        const uploadRadio = dialog.querySelector('input[value="upload"]');
        const pasteContainer = dialog.querySelector('#csv-paste-container');
        const uploadContainer = dialog.querySelector('#csv-upload-container');
        
        pasteRadio.addEventListener('change', () => {
            pasteContainer.style.display = 'block';
            uploadContainer.style.display = 'none';
            pasteRadio.parentElement.style.borderColor = colors.primary;
            uploadRadio.parentElement.style.borderColor = colors.border;
        });
        
        uploadRadio.addEventListener('change', () => {
            pasteContainer.style.display = 'none';
            uploadContainer.style.display = 'block';
            uploadRadio.parentElement.style.borderColor = colors.primary;
            pasteRadio.parentElement.style.borderColor = colors.border;
        });

        const fileInput = dialog.querySelector('#csv-file-input');
        const filePreview = dialog.querySelector('#file-preview');
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                filePreview.textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            } else {
                filePreview.textContent = '';
            }
        });

        dialog.querySelector('#csv-cancel-btn').onclick = () => {
            document.body.removeChild(overlay);
        };

        dialog.querySelector('#csv-import-btn').onclick = () => {
            this.performCSVImport(dialog, overlay);
        };

        overlay.onclick = (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        };
    }

    async performCSVImport(dialog, overlay) {
        const select = dialog.querySelector('#csv-collection-select');
        const textarea = dialog.querySelector('#csv-data-input');
        const fileInput = dialog.querySelector('#csv-file-input');
        const statusDiv = dialog.querySelector('#csv-status');
        const importBtn = dialog.querySelector('#csv-import-btn');
        const sourceRadio = dialog.querySelector('input[name="csv-source"]:checked');
        const newCollectionNameInput = dialog.querySelector('#new-collection-name');

        const collectionGuid = select.value;
        const isCreatingNew = collectionGuid === '__CREATE_NEW__';

        let csvData = '';
        if (sourceRadio.value === 'paste') {
            csvData = textarea.value.trim();
        } else {
            const file = fileInput.files[0];
            if (!file) {
                this.showStatus(statusDiv, 'Please select a CSV file', 'error');
                return;
            }
            try {
                csvData = await this.readFileAsText(file);
            } catch (error) {
                this.showStatus(statusDiv, `Error reading file: ${error.message}`, 'error');
                return;
            }
        }

        if (!csvData) {
            this.showStatus(statusDiv, 'Please provide CSV data', 'error');
            return;
        }

        if (!isCreatingNew && !collectionGuid) {
            this.showStatus(statusDiv, 'Please select a collection', 'error');
            return;
        }

        if (isCreatingNew) {
            const newName = newCollectionNameInput.value.trim();
            if (!newName) {
                this.showStatus(statusDiv, 'Please enter a name for the new collection', 'error');
                return;
            }
        }

        importBtn.disabled = true;
        importBtn.textContent = 'Importing...';
        this.showStatus(statusDiv, 'Importing...', 'info');

        try {
            let collection;

            if (isCreatingNew) {
                const parsed = this.parseCSV(csvData);
                const headers = parsed.headers;
                let dataRows = parsed.rows;
                let typeHints = null;

                if (dataRows.length > 0 && this.isTypeHintRow(dataRows[0])) {
                    typeHints = dataRows[0];
                    dataRows = dataRows.slice(1);
                    console.log('[CSV Import] Found type hints in row 2:', typeHints);
                }

                const newName = newCollectionNameInput.value.trim();
                const propertyConfig = await this.showPropertyConfigDialog(headers, typeHints, dataRows.slice(0, 5));
                
                if (!propertyConfig) {
                    importBtn.disabled = false;
                    importBtn.textContent = 'Import';
                    statusDiv.style.display = 'none';
                    return;
                }

                console.log('[CSV Import] Analyzing choice fields...');
                const choiceOptions = this.buildChoiceOptions(headers, dataRows, propertyConfig);
                console.log('[CSV Import] Choice options:', choiceOptions);

                this.showStatus(statusDiv, `Creating collection "${newName}"...`, 'info');
                collection = await this.createCollectionWithProperties(newName, headers, propertyConfig, choiceOptions);
                
                if (!collection) {
                    throw new Error('Failed to create collection');
                }

                this.showStatus(statusDiv, `Collection created! Importing data...`, 'info');
                csvData = this.reconstructCSV(headers, dataRows);
            } else {
                const collections = await this.data.getAllCollections();
                collection = collections.find(c => c.getGuid() === collectionGuid);
                if (!collection) {
                    throw new Error('Collection not found');
                }
            }

            const result = await this.importCSV(collection, csvData);
            
            this.showStatus(statusDiv, `Import complete! Created: ${result.created}, Updated: ${result.updated}, Skipped: ${result.skipped}`, 'success');
            
            setTimeout(() => {
                document.body.removeChild(overlay);
            }, 2000);

        } catch (error) {
            console.error('[CSV Import] Error:', error);
            this.showStatus(statusDiv, `Error: ${error.message}`, 'error');
            importBtn.disabled = false;
            importBtn.textContent = 'Import';
        }
    }

    async showPropertyConfigDialog(headers, typeHints, sampleRows) {
        const colors = this.getThemeColors();
        
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10001;
            `;

            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background: ${colors.background};
                color: ${colors.text};
                border: 1px solid ${colors.border};
                border-radius: 8px;
                padding: 24px;
                width: 90%;
                max-width: 800px;
                max-height: 80vh;
                overflow-y: auto;
            `;

            let propertyRows = headers.map((header, idx) => {
                const typeHint = typeHints ? typeHints[idx].toLowerCase().trim() : null;
                const sampleVals = sampleRows.map(row => row[idx]).filter(v => v).slice(0, 3);
                
                return `
                    <tr style="border-bottom: 1px solid ${colors.tableBorder};">
                        <td style="padding: 8px; color: ${colors.text};">
                            <strong>${this.escapeHtml(header)}</strong>
                            ${sampleVals.length > 0 ? `<div style="font-size: 11px; color: ${colors.textSecondary}; margin-top: 4px;">Examples: ${sampleVals.map(v => this.escapeHtml(v)).join(', ')}</div>` : ''}
                        </td>
                        <td style="padding: 8px;">
                            <select class="property-type" data-header="${this.escapeHtml(header)}" style="width: 100%; padding: 4px; border: 1px solid ${colors.inputBorder}; border-radius: 4px; background: ${colors.input}; color: ${colors.text};">
                                <option value="text" ${typeHint === 'text' ? 'selected' : ''}>Text</option>
                                <option value="number" ${typeHint === 'number' ? 'selected' : ''}>Number</option>
                                <option value="datetime" ${typeHint === 'datetime' || typeHint === 'date' ? 'selected' : ''}>Date/Time</option>
                                <option value="checkbox" ${typeHint === 'checkbox' ? 'selected' : ''}>Checkbox</option>
                                <option value="choice" ${typeHint === 'choice' ? 'selected' : ''}>Choice</option>
                                <option value="url" ${typeHint === 'url' ? 'selected' : ''}>URL</option>
                            </select>
                        </td>
                    </tr>
                `;
            }).join('');

            dialog.innerHTML = `
                <h2 style="margin: 0 0 16px 0; color: ${colors.text};">Configure Property Types</h2>
                <p style="margin: 0 0 16px 0; color: ${colors.textSecondary};">
                    Review the detected types for each CSV column. Change them if needed.
                </p>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: ${colors.backgroundSecondary};">
                                <th style="padding: 8px; text-align: left; color: ${colors.text}; border-bottom: 2px solid ${colors.border};">Property</th>
                                <th style="padding: 8px; text-align: left; color: ${colors.text}; border-bottom: 2px solid ${colors.border};">Type</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${propertyRows}
                        </tbody>
                    </table>
                </div>
                <div style="margin-top: 24px; display: flex; gap: 8px; justify-content: flex-end;">
                    <button id="prop-cancel-btn" style="padding: 8px 16px; border: 1px solid ${colors.buttonBorder}; background: ${colors.buttonBg}; color: ${colors.buttonText}; border-radius: 4px; cursor: pointer;">Cancel</button>
                    <button id="prop-confirm-btn" style="padding: 8px 16px; border: none; background: ${colors.primary}; color: #fff; border-radius: 4px; cursor: pointer;">Confirm</button>
                </div>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            dialog.querySelector('#prop-cancel-btn').onclick = () => {
                document.body.removeChild(overlay);
                resolve(null);
            };

            dialog.querySelector('#prop-confirm-btn').onclick = () => {
                const selects = dialog.querySelectorAll('.property-type');
                const config = {};
                selects.forEach(select => {
                    const header = select.getAttribute('data-header');
                    config[header] = select.value;
                });
                document.body.removeChild(overlay);
                resolve(config);
            };

            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    document.body.removeChild(overlay);
                    resolve(null);
                }
            };
        });
    }

    parseCSV(csvText) {
        const rows = [];
        let currentRow = [];
        let currentField = '';
        let inQuotes = false;

        for (let i = 0; i < csvText.length; i++) {
            const char = csvText[i];
            const nextChar = csvText[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    currentField += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                currentRow.push(currentField.trim());
                currentField = '';
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
                if (char === '\r' && nextChar === '\n') i++;
                if (currentField || currentRow.length > 0) {
                    currentRow.push(currentField.trim());
                    rows.push(currentRow);
                    currentRow = [];
                    currentField = '';
                }
            } else {
                currentField += char;
            }
        }

        if (currentField || currentRow.length > 0) {
            currentRow.push(currentField.trim());
            rows.push(currentRow);
        }

        if (rows.length < 2) {
            throw new Error('CSV must have at least a header row and one data row');
        }

        return {
            headers: rows[0],
            rows: rows.slice(1)
        };
    }

    rowToObject(headers, rowData) {
        const obj = {};
        for (let i = 0; i < headers.length; i++) {
            const value = rowData[i] || '';
            obj[headers[i]] = value === '' ? null : value;
        }
        return obj;
    }

    async importCSV(collection, csvData) {
        const { headers, rows } = this.parseCSV(csvData);
        
        const config = collection.getConfiguration();
        const mapping = this.buildFieldMapping(headers, config.fields);

        const existingRecords = await collection.getAllRecords();
        const existingByTitle = new Map();
        for (const record of existingRecords) {
            const title = record.getName();
            if (title) {
                existingByTitle.set(title.toLowerCase(), record);
            }
        }

        let created = 0;
        let updated = 0;
        let skipped = 0;

        const BATCH_SIZE = 50;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, Math.min(i + BATCH_SIZE, rows.length));

            for (const row of batch) {
                try {
                    const rowObject = this.rowToObject(headers, row);
                    
                    const titleField = mapping['title'] || mapping['name'] || Object.values(mapping).find(m => m.matched);
                    const title = titleField 
                        ? (rowObject[Object.keys(mapping).find(k => mapping[k] === titleField)] || 'Untitled')
                        : 'Untitled';

                    const existingRecord = existingByTitle.get(title.toLowerCase());

                    if (existingRecord) {
                        this.updateCSVRecord(existingRecord, rowObject, mapping);
                        updated++;
                    } else {
                        const record = await this.createCSVRecord(collection, title, rowObject, mapping);
                        if (record) {
                            created++;
                            existingByTitle.set(title.toLowerCase(), record);
                        } else {
                            skipped++;
                        }
                    }
                } catch (error) {
                    console.error('[CSV Import] Row error:', error);
                    skipped++;
                }
            }

            if (i + BATCH_SIZE < rows.length) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }

        return { created, updated, skipped };
    }

    async createCSVRecord(collection, title, rowObject, mapping) {
        const recordGuid = collection.createRecord(title);
        if (!recordGuid) return null;

        let record = null;
        for (let attempt = 0; attempt < 5; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 100 + (attempt * 50)));
            const records = await collection.getAllRecords();
            record = records.find(r => r.guid === recordGuid);
            if (record) break;
        }

        if (!record) return null;

        this.updateCSVRecord(record, rowObject, mapping);
        return record;
    }

    updateCSVRecord(record, rowObject, mapping) {
        for (const [csvHeader, value] of Object.entries(rowObject)) {
            const fieldMapping = mapping[csvHeader];
            if (!fieldMapping || !fieldMapping.matched) continue;

            const { fieldId, fieldType } = fieldMapping;
            
            try {
                const prop = record.prop(fieldId);
                if (!prop) continue;

                if (value === null || value === undefined || value === '') {
                    continue;
                }

                if (fieldType === 'datetime' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
                    try {
                        const dateOnly = value.match(/^\d{4}-\d{2}-\d{2}/)[0];
                        const [year, month, day] = dateOnly.split('-');
                        prop.set({ d: year + month + day });
                    } catch (e) {
                        prop.set(value);
                    }
                }
                else if (fieldType === 'number') {
                    const num = this.coerceNumber(value);
                    if (num !== null) {
                        prop.set(num);
                    }
                }
                else if (fieldType === 'checkbox') {
                    prop.set(this.coerceBoolean(value));
                }
                else if (fieldType === 'choice' && typeof prop.setChoice === 'function') {
                    prop.setChoice(String(value).trim());
                }
                else {
                    prop.set(value);
                }
            } catch (error) {
                console.warn(`[CSV Import] Failed to set field ${fieldId}:`, error);
            }
        }
    }

    buildFieldMapping(csvHeaders, collectionFields) {
        const mapping = {};
        
        for (const header of csvHeaders) {
            const normalized = this.normalizeFieldName(header);
            
            const matchedField = collectionFields.find(field => {
                const fieldIdNorm = this.normalizeFieldName(field.id);
                const fieldLabelNorm = this.normalizeFieldName(field.label || '');
                
                return fieldIdNorm === normalized || fieldLabelNorm === normalized;
            });

            if (matchedField) {
                mapping[header] = {
                    fieldId: matchedField.id,
                    fieldType: matchedField.type,
                    matched: true
                };
            } else {
                mapping[header] = { matched: false };
            }
        }

        return mapping;
    }

    async createCollectionWithProperties(collectionName, headers, propertyConfig, choiceOptions = {}) {
        console.log('[CSV Import] Creating collection:', collectionName);

        const newCollection = await this.data.createCollection();
        if (!newCollection) {
            throw new Error('Failed to create collection');
        }

        const config = newCollection.getConfiguration();
        const fields = headers.map((header, idx) => {
            const fieldType = propertyConfig[header] || 'text';
            const fieldId = this.normalizeFieldName(header) || `field_${idx}`;

            const field = {
                id: fieldId,
                label: header,
                type: fieldType,
                icon: this.getFieldIcon(fieldType),
                many: false,
                read_only: false,
                active: true
            };

            if (fieldType === 'choice' && choiceOptions[header]) {
                field.choices = choiceOptions[header];
            }

            return field;
        });

        config.name = collectionName;
        config.icon = 'ti-table';
        config.item_name = 'Row';
        config.description = 'Imported from CSV';
        config.fields = fields;
        config.page_field_ids = fields.map(f => f.id);
        config.sidebar_record_sort_field_id = fields[0]?.id || null;
        config.sidebar_record_sort_dir = 'asc';
        config.show_sidebar_items = true;
        config.show_cmdpal_items = true;
        
        config.views = [
            {
                id: 'table',
                label: 'All Rows',
                description: 'Table view',
                type: 'table',
                icon: '',
                shown: true,
                read_only: false,
                sort_field_id: fields[0]?.id || null,
                sort_dir: 'asc',
                group_by_field_id: null,
                field_ids: fields.map(f => f.id),
                opts: {}
            }
        ];

        const success = await newCollection.saveConfiguration(config);
        if (success === false) {
            throw new Error('Failed to save collection configuration');
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        const allCollections = await this.data.getAllCollections();
        const freshCollection = allCollections.find(c => c.getGuid() === newCollection.getGuid());
        
        if (!freshCollection) {
            throw new Error('Collection disappeared after creation');
        }

        const verifyConfig = freshCollection.getConfiguration();
        if (!verifyConfig.fields || verifyConfig.fields.length === 0) {
            throw new Error('Failed to create fields - configuration did not persist');
        }

        console.log('[CSV Import] Collection created with', verifyConfig.fields.length, 'fields');
        return freshCollection;
    }

    buildChoiceOptions(headers, rows, propertyConfig) {
        const choiceOptions = {};

        headers.forEach((header, colIndex) => {
            const fieldType = propertyConfig[header];
            
            if (fieldType !== 'choice') return;

            const values = rows
                .map(row => row[colIndex])
                .filter(val => val && val.trim())
                .map(val => val.trim());

            const uniqueValues = [...new Set(values)];

            if (uniqueValues.length > 50) {
                console.warn(`[CSV Import] Choice field "${header}" has ${uniqueValues.length} unique values - may be too many`);
            }

            choiceOptions[header] = uniqueValues.map((value, idx) => ({
                id: this.normalizeFieldName(value) || `choice_${idx}`,
                label: value,
                color: String((idx % 12) + 1),
                active: true
            }));

            console.log(`[CSV Import] Found ${uniqueValues.length} unique values for choice field "${header}"`);
        });

        return choiceOptions;
    }

    reconstructCSV(headers, dataRows) {
        const allRows = [headers, ...dataRows];
        return allRows.map(row => 
            row.map(cell => {
                if (cell.includes(',') || cell.includes('\n') || cell.includes('"')) {
                    return `"${cell.replace(/"/g, '""')}"`;
                }
                return cell;
            }).join(',')
        ).join('\n');
    }

    async readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }

    isTypeHintRow(row) {
        const validTypes = ['text', 'number', 'datetime', 'date', 'checkbox', 'choice', 'url'];
        let typeCount = 0;
        
        for (const cell of row) {
            const normalized = (cell || '').toLowerCase().trim();
            if (validTypes.includes(normalized)) {
                typeCount++;
            }
        }
        
        return typeCount >= row.length * 0.5;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    normalizeFieldName(name) {
        return name.toLowerCase().replace(/[\s\-_]+/g, '').trim();
    }

    coerceNumber(value) {
        if (typeof value === 'number') return value;
        if (typeof value !== 'string') return null;
        
        const trimmed = value.trim();
        if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
            const num = Number(trimmed);
            return isNaN(num) ? null : num;
        }
        return null;
    }

    coerceBoolean(value) {
        if (typeof value === 'boolean') return value;
        if (typeof value !== 'string') return false;
        
        const lower = value.toLowerCase().trim();
        if (lower === 'true' || lower === 'yes' || lower === '1') return true;
        if (lower === 'false' || lower === 'no' || lower === '0') return false;
        return false;
    }

    parseDate(value) {
        if (!value) return null;
        if (value instanceof Date) return value;
        
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date;
    }

    // =========================================================================
    // MARKDOWN IMPORT DIALOG
    // =========================================================================

    showMarkdownImportDialog() {
        const colors = this.getThemeColors();
        
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: ${colors.background};
            color: ${colors.text};
            border-radius: 8px;
            padding: 24px;
            width: 90%;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            border: 1px solid ${colors.border};
        `;

        dialog.innerHTML = `
            <h2 style="margin: 0 0 16px 0; color: ${colors.text};">Import Markdown Files</h2>
            
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: ${colors.text};">Source:</label>
                <select id="md-source-select" style="width: 100%; padding: 8px; border: 1px solid ${colors.inputBorder}; border-radius: 4px; background: ${colors.input}; color: ${colors.text};">
                    <option value="obsidian">Obsidian</option>
                    <option value="logseq">Logseq</option>
                </select>
            </div>

            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: ${colors.text};">Select Collection:</label>
                <select id="md-collection-select" style="width: 100%; padding: 8px; border: 1px solid ${colors.inputBorder}; border-radius: 4px; background: ${colors.input}; color: ${colors.text};">
                    <option value="">-- Select a collection --</option>
                    <option value="__CREATE_NEW__">✨ Create New Collection</option>
                </select>
            </div>
            
            <div id="new-collection-name-container" style="margin-bottom: 16px; display: none;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: ${colors.text};">New Collection Name:</label>
                <input 
                    type="text" 
                    id="new-collection-name" 
                    placeholder="e.g., Personal Notes, Knowledge Base"
                    style="width: 100%; padding: 8px; border: 1px solid ${colors.inputBorder}; border-radius: 4px; background: ${colors.input}; color: ${colors.text};"
                >
            </div>
            
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: ${colors.text};">Select Folder:</label>
                <button id="select-folder-btn" style="width: 100%; padding: 12px; border: 2px dashed ${colors.border}; background: ${colors.backgroundSecondary}; color: ${colors.text}; border-radius: 4px; cursor: pointer; text-align: center;">
                    📁 Click to select markdown folder
                </button>
                <div id="folder-info" style="margin-top: 8px; font-size: 12px; color: ${colors.textSecondary};"></div>
            </div>
            
            <div style="margin-bottom: 16px; padding: 16px; background: ${colors.backgroundSecondary}; border-radius: 6px; border: 1px solid ${colors.border};">
                <label style="display: flex; align-items: center; cursor: pointer; user-select: none;">
                    <input type="checkbox" id="import-journals-checkbox" style="margin-right: 8px; cursor: pointer;">
                    <span style="font-weight: 500; color: ${colors.text};">Import daily notes to Journal</span>
                </label>
                <div id="journal-folder-container" style="margin-top: 12px; display: none;">
                    <label style="display: block; margin-bottom: 6px; font-size: 13px; color: ${colors.textSecondary};">
                        Journal folder name (leave blank for auto-detect):
                    </label>
                    <input 
                        type="text" 
                        id="journal-folder-input" 
                        placeholder="e.g., Daily Notes, journals, Journal"
                        style="width: 100%; padding: 6px 8px; border: 1px solid ${colors.inputBorder}; border-radius: 4px; background: ${colors.input}; color: ${colors.text}; font-size: 13px;"
                    >
                    <div style="margin-top: 6px; font-size: 12px; color: ${colors.textSecondary};">
                        💡 Files in this folder will be imported to your Thymer Journal instead of the collection
                    </div>
                </div>
            </div>
            
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button id="md-cancel-btn" style="padding: 8px 16px; border: 1px solid ${colors.buttonBorder}; background: ${colors.buttonBg}; color: ${colors.buttonText}; border-radius: 4px; cursor: pointer;">Cancel</button>
                <button id="md-import-btn" style="padding: 8px 16px; border: none; background: ${colors.primary}; color: #fff; border-radius: 4px; cursor: pointer;" disabled>Import</button>
            </div>
            <div id="md-status" style="margin-top: 16px; padding: 12px; border-radius: 4px; display: none;"></div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        this.loadCollections(dialog, 'md-collection-select');

        const collectionSelect = dialog.querySelector('#md-collection-select');
        const newCollectionNameContainer = dialog.querySelector('#new-collection-name-container');
        const importBtn = dialog.querySelector('#md-import-btn');
        const journalCheckbox = dialog.querySelector('#import-journals-checkbox');
        const journalFolderContainer = dialog.querySelector('#journal-folder-container');
        let selectedDirHandle = null;

        // Toggle journal folder input visibility
        journalCheckbox.addEventListener('change', () => {
            journalFolderContainer.style.display = journalCheckbox.checked ? 'block' : 'none';
        });

        collectionSelect.addEventListener('change', () => {
            if (collectionSelect.value === '__CREATE_NEW__') {
                newCollectionNameContainer.style.display = 'block';
            } else {
                newCollectionNameContainer.style.display = 'none';
            }
            this.updateImportButtonState(importBtn, collectionSelect, selectedDirHandle);
        });

        dialog.querySelector('#select-folder-btn').onclick = async () => {
            try {
                selectedDirHandle = await window.showDirectoryPicker({
                    mode: 'read',
                    startIn: 'documents'
                });
                
                const folderInfo = dialog.querySelector('#folder-info');
                folderInfo.textContent = `✓ Selected: ${selectedDirHandle.name}`;
                folderInfo.style.color = colors.success;
                
                this.updateImportButtonState(importBtn, collectionSelect, selectedDirHandle);
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('[MD Import] Error selecting folder:', error);
                    const folderInfo = dialog.querySelector('#folder-info');
                    folderInfo.textContent = `Error: ${error.message}`;
                    folderInfo.style.color = colors.error;
                }
            }
        };

        dialog.querySelector('#md-cancel-btn').onclick = () => {
            document.body.removeChild(overlay);
        };

        dialog.querySelector('#md-import-btn').onclick = () => {
            this.performMarkdownImport(dialog, overlay, selectedDirHandle);
        };

        overlay.onclick = (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        };
    }

    updateImportButtonState(importBtn, collectionSelect, selectedDirHandle) {
        const hasFolder = selectedDirHandle !== null;
        const hasCollection = collectionSelect.value !== '';
        
        if (hasFolder && hasCollection) {
            importBtn.disabled = false;
        } else {
            importBtn.disabled = true;
        }
    }

    async loadCollections(dialog, selectId) {
        const select = dialog.querySelector(`#${selectId}`);
        const collections = await this.data.getAllCollections();
        
        collections.forEach(collection => {
            const option = document.createElement('option');
            option.value = collection.getGuid();
            option.textContent = collection.getName();
            select.appendChild(option);
        });
    }

    async performMarkdownImport(dialog, overlay, dirHandle) {
        const select = dialog.querySelector('#md-collection-select');
        const sourceSelect = dialog.querySelector('#md-source-select');
        const statusDiv = dialog.querySelector('#md-status');
        const importBtn = dialog.querySelector('#md-import-btn');
        const newCollectionNameInput = dialog.querySelector('#new-collection-name');
        const journalCheckbox = dialog.querySelector('#import-journals-checkbox');
        const journalFolderInput = dialog.querySelector('#journal-folder-input');

        const collectionGuid = select.value;
        const source = sourceSelect.value;
        const isCreatingNew = collectionGuid === '__CREATE_NEW__';
        const importToJournal = journalCheckbox.checked;
        const journalFolderName = journalFolderInput.value.trim();

        if (isCreatingNew) {
            const newName = newCollectionNameInput.value.trim();
            if (!newName) {
                this.showStatus(statusDiv, 'Please enter a name for the new collection', 'error');
                return;
            }
        }

        importBtn.disabled = true;
        importBtn.textContent = 'Scanning...';
        this.showStatus(statusDiv, 'Scanning files...', 'info');

        try {
            const scanResults = source === 'logseq' 
                ? await this.scanLogseqFiles(dirHandle)
                : await this.scanVaultFiles(dirHandle);
            
            if (scanResults.files.length === 0) {
                this.showStatus(statusDiv, 'No .md files found', 'error');
                importBtn.disabled = false;
                importBtn.textContent = 'Import';
                return;
            }

            // Separate journal files from regular files if journal import is enabled
            let journalFiles = [];
            let regularFiles = scanResults.files;
            
            if (importToJournal) {
                const { journal, regular } = await this.separateJournalFiles(
                    scanResults.files, 
                    source, 
                    journalFolderName
                );
                journalFiles = journal;
                regularFiles = regular;
                
                console.log(`[MD Import] Separated: ${journalFiles.length} journal files, ${regularFiles.length} regular files`);
            }

            // Import journal files first if any
            if (journalFiles.length > 0) {
                this.showStatus(statusDiv, `Importing ${journalFiles.length} journal entries...`, 'info');
                
                const collections = await this.data.getAllCollections();
                const journalCollection = collections.find(c => c.isJournalPlugin());
                
                if (!journalCollection) {
                    this.showStatus(statusDiv, 'Journal not enabled. Enable Journal to import daily notes.', 'error');
                    importBtn.disabled = false;
                    importBtn.textContent = 'Import';
                    return;
                }
                
                await this.importDailyNotesFromFiles(journalCollection, journalFiles, source, statusDiv);
            }

            // Import regular files to collection
            let importResult = { imported: 0, updated: 0, errors: 0 };
            
            if (regularFiles.length > 0) {
                this.showStatus(statusDiv, `Analyzing ${regularFiles.length} files...`, 'info');
                
                const analysis = source === 'logseq'
                    ? await this.analyzeLogseqProperties(regularFiles)
                    : await this.analyzeFrontmatter(regularFiles);

                let collection;

                if (isCreatingNew) {
                    const newName = newCollectionNameInput.value.trim();
                    this.showStatus(statusDiv, `Creating collection "${newName}"...`, 'info');
                    
                    // Remove journal folder from topFolders if it exists
                    let topFolders = scanResults.topFolders;
                    if (importToJournal && journalFolderName) {
                        topFolders = topFolders.filter(f => 
                            f.toLowerCase() !== journalFolderName.toLowerCase()
                        );
                    }
                    
                    collection = await this.createMarkdownCollection(newName, topFolders, analysis.properties, {});
                    
                    if (!collection) {
                        throw new Error('Failed to create collection');
                    }
                } else {
                    const collections = await this.data.getAllCollections();
                    collection = collections.find(c => c.getGuid() === collectionGuid);
                    if (!collection) {
                        throw new Error('Collection not found');
                    }
                }

                this.showStatus(statusDiv, 'Importing files...', 'info');
                importResult = await this.executeImport(collection, regularFiles, source, statusDiv);

                this.showStatus(statusDiv, 'Resolving links...', 'info');
                await this.resolveWikiLinksWithSegments(collection, source, statusDiv);
            }

            // Show final summary
            const summary = [];
            if (journalFiles.length > 0) {
                summary.push(`Journal: ${journalFiles.length} entries`);
            }
            if (regularFiles.length > 0) {
                summary.push(`Collection: ${importResult.imported} imported, ${importResult.updated} updated`);
            }
            
            this.showStatus(statusDiv, `Complete! ${summary.join(' | ')}`, 'success');
            
            setTimeout(() => {
                document.body.removeChild(overlay);
            }, 2000);

        } catch (error) {
            console.error('[MD Import] Error:', error);
            this.showStatus(statusDiv, `Error: ${error.message}`, 'error');
            importBtn.disabled = false;
            importBtn.textContent = 'Import';
        }
    }

    async separateJournalFiles(files, source, journalFolderName) {
        const journal = [];
        const regular = [];
        
        // Auto-detect common journal folder names if not specified
        const commonJournalFolders = ['daily notes', 'journal', 'journals', 'dailies', 'daily'];
        const folderToCheck = journalFolderName.toLowerCase() || null;
        
        for (const file of files) {
            let isJournal = false;
            
            // Check if file is in the specified journal folder
            if (folderToCheck) {
                const pathLower = file.path.toLowerCase();
                isJournal = pathLower.includes(`/${folderToCheck}/`) || 
                           pathLower.startsWith(`${folderToCheck}/`) ||
                           file.topFolder.toLowerCase() === folderToCheck;
            } else {
                // Auto-detect based on common folder names
                const pathLower = file.path.toLowerCase();
                isJournal = commonJournalFolders.some(folder => 
                    pathLower.includes(`/${folder}/`) || 
                    pathLower.startsWith(`${folder}/`) ||
                    file.topFolder.toLowerCase() === folder
                );
            }
            
            // Also check if filename is date-formatted (even outside journal folder)
            if (!isJournal) {
                const hasDateFormat = source === 'logseq' 
                    ? this.parseLogseqDateFromFilename(file.name)
                    : this.parseObsidianDateFromFilename(file.name);
                
                if (hasDateFormat && !folderToCheck) {
                    isJournal = true;
                }
            }
            
            if (isJournal) {
                journal.push(file);
            } else {
                regular.push(file);
            }
        }
        
        return { journal, regular };
    }

    async importDailyNotesFromFiles(journalCollection, files, source, statusDiv) {
        let imported = 0;
        let updated = 0;
        let errors = 0;

        console.log(`[Journal Import] Importing ${files.length} journal files`);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            try {
                if (i % 5 === 0) {
                    this.showStatus(statusDiv, `Importing journal ${i + 1}/${files.length}`, 'info');
                }

                console.log(`[Journal Import] Processing: ${file.name}`);

                // Parse date from filename
                const dateStr = source === 'logseq'
                    ? this.parseLogseqDateFromFilename(file.name)
                    : this.parseObsidianDateFromFilename(file.name);
                
                if (!dateStr) {
                    console.error(`[Journal Import] Could not parse date from filename: ${file.name}`);
                    errors++;
                    continue;
                }

                // Read the file content
                const fileHandle = await this.getFileFromHandle(file.handle);
                const content = await fileHandle.text();

                // Parse the markdown
                const parsed = source === 'logseq'
                    ? this.parseLogseqFile(content)
                    : this.parseMarkdownFile(content);

                // Parse date components
                const [year, month, day] = dateStr.split('-').map(n => parseInt(n));

                // Get current user
                const users = this.data.getActiveUsers();
                const currentUser = users[0];
                
                if (!currentUser) {
                    console.error(`[Journal Import] No active user found`);
                    errors++;
                    continue;
                }

                // Create DateTime object (month is 0-indexed)
                const dateTime = DateTime.dateOnly(year, month - 1, day);

                // Get or create journal record
                const journalRecord = await journalCollection.getJournalRecord(currentUser, dateTime);
                
                if (!journalRecord) {
                    console.error(`[Journal Import] Failed to get/create journal record for ${dateStr}`);
                    errors++;
                    continue;
                }

                // Wait for record to be ready
                await new Promise(resolve => setTimeout(resolve, 500));

                // Check if new or existing
                const lineItems = await journalRecord.getLineItems();
                const isNew = !lineItems || lineItems.length === 0;

                if (isNew) {
                    imported++;
                } else {
                    updated++;
                }

                // Insert markdown content
                if (parsed.markdown) {
                    const success = await journalRecord.insertFromMarkdown(
                        parsed.markdown,
                        null,
                        null
                    );
                    
                    if (!success) {
                        console.error(`[Journal Import] insertFromMarkdown returned false for ${file.name}`);
                        errors++;
                    }
                }

            } catch (error) {
                console.error(`[Journal Import] Error processing ${file.name}:`, error);
                errors++;
            }
        }

        console.log(`[Journal Import] Complete: ${imported} imported, ${updated} updated, ${errors} errors`);
    }


    async createMarkdownCollection(collectionName, topFolders, properties, propertyConfig) {
        console.log('[MD Import] Creating collection:', collectionName);

        const newCollection = await this.data.createCollection();
        if (!newCollection) {
            throw new Error('Failed to create collection');
        }

        const config = newCollection.getConfiguration();
        const fields = [];

        if (topFolders.length > 0) {
            const folderChoices = topFolders.map((folder, i) => ({
                id: this.slugify(folder) || `folder_${i}`,
                label: folder,
                color: String(i % 10),
                active: true
            }));

            fields.push({
                id: 'folder',
                label: 'Folder',
                type: 'choice',
                icon: 'ti-folder',
                many: false,
                read_only: false,
                active: true,
                choices: folderChoices
            });
        }

        fields.push({
            id: 'source_path',
            label: 'Source Path',
            type: 'text',
            icon: 'ti-link',
            many: false,
            read_only: true,
            active: true
        });

        for (const prop of properties) {
            const fieldId = this.slugify(prop.key);
            if (!fieldId || fields.find(f => f.id === fieldId)) continue;

            fields.push({
                id: fieldId,
                label: prop.key,
                type: prop.recommendedType?.type || 'text',
                icon: this.getFieldIcon(prop.recommendedType?.type || 'text'),
                many: false,
                read_only: false,
                active: true
            });
        }

        config.name = collectionName;
        config.icon = 'ti-notebook';
        config.item_name = 'Note';
        config.description = 'Imported from Markdown';
        config.fields = fields;
        config.page_field_ids = fields.map(f => f.id);
        config.sidebar_record_sort_field_id = fields[0]?.id || 'title';
        config.sidebar_record_sort_dir = 'desc';
        config.show_sidebar_items = true;
        config.show_cmdpal_items = true;
        
        config.views = [
            {
                id: 'table',
                label: 'All Notes',
                description: 'Table view',
                type: 'table',
                icon: '',
                shown: true,
                read_only: false,
                sort_field_id: fields[0]?.id || null,
                sort_dir: 'asc',
                group_by_field_id: null,
                field_ids: fields.map(f => f.id).slice(0, 8),
                opts: {}
            }
        ];

        if (fields.find(f => f.id === 'folder')) {
            config.views.push({
                id: 'board',
                label: 'By Folder',
                description: 'Board view',
                type: 'board',
                icon: '',
                shown: true,
                read_only: false,
                sort_field_id: fields[0]?.id || null,
                sort_dir: 'asc',
                group_by_field_id: 'folder',
                field_ids: fields.map(f => f.id).slice(0, 6),
                opts: {}
            });
        }

        const success = await newCollection.saveConfiguration(config);
        if (success === false) {
            throw new Error('Failed to save collection configuration');
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        const allCollections = await this.data.getAllCollections();
        const freshCollection = allCollections.find(c => c.getGuid() === newCollection.getGuid());
        
        if (!freshCollection) {
            throw new Error('Collection disappeared after creation');
        }

        const verifyConfig = freshCollection.getConfiguration();
        if (!verifyConfig.fields || verifyConfig.fields.length === 0) {
            throw new Error('Failed to create fields - configuration did not persist');
        }

        console.log('[MD Import] Collection created with', verifyConfig.fields.length, 'fields');
        return freshCollection;
    }

    getFieldIcon(fieldType) {
        const iconMap = {
            'text': 'ti-abc',
            'number': 'ti-123',
            'datetime': 'ti-clock',
            'checkbox': 'ti-checkbox',
            'choice': 'ti-tag',
            'url': 'ti-link'
        };
        return iconMap[fieldType] || 'ti-abc';
    }

    // =========================================================================
    // THEME UTILITIES
    // =========================================================================

    isDarkMode() {
        const body = document.body;
        
        if (body.classList.contains('dark') || body.classList.contains('dark-mode')) {
            return true;
        }
        
        if (body.dataset.theme === 'dark') {
            return true;
        }
        
        const bgColor = window.getComputedStyle(body).backgroundColor;
        if (bgColor) {
            const rgb = bgColor.match(/\d+/g);
            if (rgb && rgb.length >= 3) {
                const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
                return luminance < 0.5;
            }
        }
        
        return false;
    }

    getThemeColors() {
        const isDark = this.isDarkMode();
        
        if (isDark) {
            return {
                background: '#1e1e1e',
                backgroundSecondary: '#2d2d2d',
                border: '#3d3d3d',
                text: '#e0e0e0',
                textSecondary: '#a0a0a0',
                input: '#2d2d2d',
                inputBorder: '#3d3d3d',
                buttonBg: '#fff',
                buttonText: '#000',
                buttonBorder: '#3d3d3d',
                primary: '#4a9eff',
                primaryHover: '#3a8eef',
                success: '#5cb85c',
                error: '#d9534f',
                warning: '#f0ad4e',
                info: '#5bc0de',
                tableHeader: '#2d2d2d',
                tableRow: '#1e1e1e',
                tableRowAlt: '#252525',
                tableBorder: '#3d3d3d'
            };
        } else {
            return {
                background: '#fff',
                backgroundSecondary: '#f5f5f5',
                border: '#ccc',
                text: '#000',
                textSecondary: '#666',
                input: '#fff',
                inputBorder: '#ccc',
                buttonBg: '#000',
                buttonText: '#fff',
                buttonBorder: '#000',
                primary: '#007bff',
                primaryHover: '#0056b3',
                success: '#28a745',
                error: '#dc3545',
                warning: '#ffc107',
                info: '#17a2b8',
                tableHeader: '#f5f5f5',
                tableRow: '#fff',
                tableRowAlt: '#f9f9f9',
                tableBorder: '#ddd'
            };
        }
    }

    // =========================================================================
    // VAULT SCANNING & ANALYSIS (for Obsidian/Logseq)
    // =========================================================================

    async scanVaultFiles(dirHandle) {
        const files = [];
        const topFolders = new Set();

        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'directory' && !entry.name.startsWith('.')) {
                topFolders.add(entry.name);
            }
        }

        await this.scanDirectory(dirHandle, '', files, null);

        return { 
            files, 
            topFolders: Array.from(topFolders).sort() 
        };
    }

    async scanLogseqFiles(dirHandle) {
        const files = [];
        const allowedTop = new Set(['pages', 'journals']);
        const presentTop = new Set();

        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'directory' && allowedTop.has(entry.name)) {
                presentTop.add(entry.name);
                await this.scanLogseqDirectory(entry, entry.name, files, entry.name);
            }
        }

        return {
            files,
            topFolders: Array.from(presentTop).sort()
        };
    }

    async scanLogseqDirectory(dirHandle, path, files, topFolder) {
        for await (const entry of dirHandle.values()) {
            const fullPath = path ? `${path}/${entry.name}` : entry.name;

            if (entry.kind === 'directory') {
                if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '.obsidian') {
                    continue;
                }
                await this.scanLogseqDirectory(entry, fullPath, files, topFolder);
            } else if (entry.kind === 'file' && entry.name.endsWith('.md')) {
                files.push({
                    handle: entry,
                    path: fullPath,
                    name: entry.name.replace(/\.md$/, ''),
                    topFolder: topFolder || 'pages'
                });
            }
        }
    }

    async scanDirectory(dirHandle, path, files, topFolder) {
        for await (const entry of dirHandle.values()) {
            const fullPath = path ? `${path}/${entry.name}` : entry.name;

            if (entry.kind === 'directory') {
                if (entry.name.startsWith('.') || 
                    entry.name === 'node_modules' ||
                    entry.name === '.obsidian' ||
                    entry.name === '.trash') {
                    continue;
                }
                await this.scanDirectory(entry, fullPath, files, topFolder || entry.name);

            } else if (entry.kind === 'file' && entry.name.endsWith('.md')) {
                files.push({
                    handle: entry,
                    path: fullPath,
                    name: entry.name.replace(/\.md$/, ''),
                    topFolder: topFolder || 'Root'
                });
            }
        }
    }

    async analyzeFrontmatter(files) {
        const propertyStats = new Map();
        let filesWithFrontmatter = 0;
        const sampleSize = Math.min(files.length, 500);
        const step = Math.ceil(files.length / sampleSize);

        for (let i = 0; i < files.length; i += step) {
            const file = files[i];
            try {
                const fileHandle = await this.getFileFromHandle(file.handle);
                const content = await fileHandle.text();
                const { frontmatter } = this.parseMarkdownFile(content);

                if (Object.keys(frontmatter).length > 0) {
                    filesWithFrontmatter++;

                    for (const [key, value] of Object.entries(frontmatter)) {
                        if (!propertyStats.has(key)) {
                            propertyStats.set(key, {
                                count: 0,
                                types: new Set(),
                                samples: []
                            });
                        }

                        const stat = propertyStats.get(key);
                        stat.count++;
                        stat.types.add(this.inferType(value));
                        
                        if (stat.samples.length < 5) {
                            stat.samples.push(value);
                        }
                    }
                }
            } catch (error) {
                console.error(`Error analyzing ${file.name}:`, error);
            }
        }

        const properties = Array.from(propertyStats.entries())
            .map(([key, stat]) => ({
                key,
                count: stat.count,
                percentage: Math.round((stat.count / filesWithFrontmatter) * 100),
                recommendedType: this.recommendFieldType(stat.types, stat.samples)
            }))
            .sort((a, b) => b.count - a.count);

        return {
            totalFiles: files.length,
            filesWithFrontmatter,
            properties
        };
    }

    async analyzeLogseqProperties(files) {
        const propertyStats = new Map();
        let filesWithProps = 0;
        const sampleSize = Math.min(files.length, 500);
        const step = Math.ceil(files.length / sampleSize);

        for (let i = 0; i < files.length; i += step) {
            const file = files[i];
            try {
                const fileHandle = await this.getFileFromHandle(file.handle);
                const content = await fileHandle.text();
                const { frontmatter } = this.parseLogseqFile(content);

                if (Object.keys(frontmatter).length > 0) {
                    filesWithProps++;

                    for (const [key, value] of Object.entries(frontmatter)) {
                        if (!propertyStats.has(key)) {
                            propertyStats.set(key, {
                                count: 0,
                                types: new Set(),
                                samples: []
                            });
                        }

                        const stat = propertyStats.get(key);
                        stat.count++;
                        stat.types.add(this.inferType(value));
                        
                        if (stat.samples.length < 5) {
                            stat.samples.push(value);
                        }
                    }
                }
            } catch (error) {
                console.error(`[Logseq Scan] Error analyzing ${file.name}:`, error);
            }
        }

        const properties = Array.from(propertyStats.entries())
            .map(([key, stat]) => ({
                key,
                count: stat.count,
                percentage: filesWithProps === 0 ? 0 : Math.round((stat.count / filesWithProps) * 100),
                recommendedType: this.recommendFieldType(stat.types, stat.samples)
            }))
            .sort((a, b) => b.count - a.count);

        return {
            totalFiles: files.length,
            filesWithFrontmatter: filesWithProps,
            properties
        };
    }

    inferType(value) {
        if (Array.isArray(value)) return 'array';
        if (value === null || value === undefined) return 'null';
        if (typeof value === 'boolean') return 'boolean';
        if (typeof value === 'number') return 'number';
        if (typeof value === 'string') {
            if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
            if (/^\d+$/.test(value)) return 'number_string';
            return 'string';
        }
        return 'unknown';
    }

    recommendFieldType(types, samples) {
        const typeArray = Array.from(types);
        
        if (typeArray.includes('array')) {
            return { type: 'text', note: 'Arrays → comma-separated' };
        }
        
        if (typeArray.includes('date')) {
            return { type: 'datetime', note: 'Date field' };
        }
        
        if (typeArray.includes('string')) {
            const dateCount = samples.filter(s => 
                typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s)
            ).length;
            
            if (dateCount > samples.length * 0.5) {
                return { type: 'datetime', note: 'Date field (from samples)' };
            }
        }
        
        if (typeArray.every(t => t === 'number' || t === 'number_string')) {
            return { type: 'number', note: 'Numeric' };
        }
        
        if (typeArray.includes('boolean')) {
            return { 
                type: 'choice', 
                note: 'Boolean as choice',
                choices: ['true', 'false']
            };
        }
        
        if (typeArray.includes('string')) {
            const distinctValues = new Set(
                samples
                    .filter(s => typeof s === 'string' && s && s.trim())
                    .map(s => s.trim())
            );
            
            if (distinctValues.size >= 2 && distinctValues.size <= 10 && samples.length >= 5) {
                return { 
                    type: 'choice', 
                    note: `${distinctValues.size} options`,
                    choices: Array.from(distinctValues)
                };
            }
        }
        
        return { type: 'text', note: 'Text field' };
    }

    parseMarkdownFile(content) {
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (frontmatterMatch) {
            return { 
                frontmatter: this.parseYAML(frontmatterMatch[1]), 
                markdown: frontmatterMatch[2].trim() 
            };
        }
        return { frontmatter: {}, markdown: content.trim() };
    }

    parseLogseqFile(content) {
        const lines = content.split(/\r?\n/);
        const frontmatter = {};
        const blockIds = new Set();
        const bodyLines = [];

        for (const rawLine of lines) {
            const line = rawLine.replace(/\r$/, '');
            const propMatch = line.match(/^(\s*)(?:[-*]\s*)?([A-Za-z0-9_\-\/]+)::\s*(.*)$/);

            if (propMatch) {
                const indent = propMatch[1].length;
                const key = propMatch[2].trim();
                const rawValue = propMatch[3].trim();
                const parsedValue = this.parseLogseqValue(rawValue);

                if (indent <= 1 && frontmatter[key] === undefined) {
                    frontmatter[key] = parsedValue;
                }

                if (key.toLowerCase() === 'id' && rawValue) {
                    const idValue = rawValue.split(/\s+/)[0].trim();
                    if (idValue) blockIds.add(idValue);
                }
            }

            bodyLines.push(line);
        }

        // Return raw markdown - let the native insertFromMarkdown handle conversions
        const markdown = bodyLines.join('\n');
        return { frontmatter, markdown, blockIds: Array.from(blockIds) };
    }

    parseLogseqValue(value) {
        if (value === 'true') return true;
        if (value === 'false') return false;

        if (value.startsWith('[') && value.endsWith(']')) {
            return value
                .slice(1, -1)
                .split(',')
                .map(v => v.trim())
                .filter(v => v);
        }

        return value;
    }

    async getFileFromHandle(handle) {
        if (!handle) throw new Error('Missing file handle');
        if (typeof handle.getFile === 'function') {
            return await handle.getFile();
        }
        if (typeof handle.text === 'function') {
            return handle;
        }
        throw new Error('Unsupported file handle type');
    }

    parseYAML(yaml) {
        const result = {};
        const lines = yaml.split('\n');
        let currentKey = null;
        let currentArray = null;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith('-')) {
                if (currentKey && currentArray) {
                    const item = trimmed.slice(1).trim();
                    if (item) currentArray.push(item);
                }
                continue;
            }

            const colonIndex = line.indexOf(':');
            if (colonIndex === -1) continue;

            if (currentKey && currentArray) {
                result[currentKey] = currentArray;
                currentArray = null;
            }

            const key = line.slice(0, colonIndex).trim();
            let value = line.slice(colonIndex + 1).trim();

            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }

            if (!value) {
                currentKey = key;
                currentArray = [];
                continue;
            }

            if (value.startsWith('[') && value.endsWith(']')) {
                value = value.slice(1, -1).split(',').map(s => s.trim()).filter(s => s);
            } else if (value.startsWith('-')) {
                value = [value.slice(1).trim()];
            } else if (value === 'true') {
                value = true;
            } else if (value === 'false') {
                value = false;
            }

            result[key] = value;
            currentKey = null;
        }

        if (currentKey && currentArray) {
            result[currentKey] = currentArray;
        }

        return result;
    }

    // =========================================================================
    // IMPORT EXECUTION (Markdown)
    // =========================================================================

    async executeImport(collection, files, source = 'obsidian', statusDiv = null) {
        let imported = 0;
        let updated = 0;
        let errors = 0;
        this.blockIdToRecord = new Map();

        console.log(`[Import] Processing ${files.length} files`);

        const existingRecords = await collection.getAllRecords();
        const existingByKey = new Map();
        
        for (const record of existingRecords) {
            const name = record.getName();

            const pathValue = typeof record.text === 'function' 
                ? (record.text('source_path') || record.text('path') || '')
                : '';
            const dedupKey = this.makeDedupKey(pathValue, name);
            if (dedupKey.trim() !== '||') {
                existingByKey.set(dedupKey, record);
            }
        }

        if (statusDiv) {
            this.showStatus(statusDiv, 'Phase 1: Creating records with content...', 'info');
        } else {
            this.showToast('Phase 1: Creating records with content...', 2000);
        }

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            try {
                if (i % 10 === 0) {
                    if (statusDiv) {
                        this.showStatus(statusDiv, `Creating ${i + 1}/${files.length}`, 'info');
                    } else {
                        this.showToast(`Creating ${i + 1}/${files.length}`, 500);
                    }
                }

                const fileHandle = await this.getFileFromHandle(file.handle);
                const content = await fileHandle.text();
                const parsed = source === 'logseq'
                    ? this.parseLogseqFile(content)
                    : this.parseMarkdownFile(content);

                const recordTitle = parsed.frontmatter.title || parsed.frontmatter.Title || file.name;
                const dedupKey = this.makeDedupKey(file.path, recordTitle);
                const fallbackKey = this.makeDedupKey('', recordTitle);
                const existing = existingByKey.get(dedupKey) || existingByKey.get(fallbackKey);

                if (existing) {
                    this.setFieldValue(existing, 'source_path', file.path);
                    this.setFieldValue(existing, 'folder', file.topFolder);
                    this.setFieldValue(existing, 'source', source);
                    for (const [key, value] of Object.entries(parsed.frontmatter)) {
                        if (value === null || value === undefined || value === '') continue;
                        this.setFrontmatterField(existing, key, value);
                    }
                    if (source === 'logseq') {
                        this.rememberBlockIds(parsed.blockIds, existing);
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                    if (parsed.markdown) {
                        try {
                            const textProp = existing.prop('text');
                            if (textProp) textProp.set('');
                            
                            // Use native insertFromMarkdown
                            const success = await existing.insertFromMarkdown(parsed.markdown, null, null);
                            if (!success) {
                                console.error(`[Import] insertFromMarkdown returned false for ${existing.getName()}`);
                            }
                        } catch (error) {
                            console.error(`[Import] insertFromMarkdown failed for ${existing.getName()}:`, error);
                        }
                    }
                    updated++;

                    existingByKey.set(dedupKey, existing);
                    existingByKey.set(fallbackKey, existing);
                } else {
                    const recordGuid = collection.createRecord(recordTitle);
                    if (!recordGuid) throw new Error('Failed to create record');

                    let record = null;
                    for (let attempt = 0; attempt < 5; attempt++) {
                        await new Promise(resolve => setTimeout(resolve, 100 + (attempt * 50)));
                        const records = await collection.getAllRecords();
                        record = records.find(r => r.guid === recordGuid);
                        if (record) break;
                    }
                    
                    if (!record) {
                        console.error(`[Import] Failed to find record after creation: ${recordTitle} (${recordGuid})`);
                        throw new Error('Record not found after 5 attempts');
                    }

                    await new Promise(resolve => setTimeout(resolve, 300));

                    this.setFieldValue(record, 'source_path', file.path);
                    this.setFieldValue(record, 'folder', file.topFolder);
                    this.setFieldValue(record, 'source', source);
                    for (const [key, value] of Object.entries(parsed.frontmatter)) {
                        if (value === null || value === undefined || value === '') continue;
                        this.setFrontmatterField(record, key, value);
                    }
                    if (source === 'logseq') {
                        this.rememberBlockIds(parsed.blockIds, record);
                    }

                    if (parsed.markdown) {
                        try {
                            // Use native insertFromMarkdown
                            const success = await record.insertFromMarkdown(parsed.markdown, null, null);
                            if (!success) {
                                console.error(`[Import] insertFromMarkdown returned false for ${file.name}`);
                            }
                        } catch (error) {
                            console.error(`[Import] insertFromMarkdown failed for ${file.name}:`, error);
                        }
                    }

                    existingByKey.set(dedupKey, record);
                    existingByKey.set(fallbackKey, record);
                    imported++;
                }

            } catch (error) {
                console.error(`[Import] Error on ${file.name}:`, error);
                errors++;
            }
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (statusDiv) {
            this.showStatus(statusDiv, 'Phase 2: Resolving wiki-links...', 'info');
        } else {
            this.showToast('Phase 2: Resolving wiki-links...', 2000);
        }
        await this.resolveWikiLinksWithSegments(collection, source, statusDiv);

        if (statusDiv) {
            this.showStatus(statusDiv, `Done! Imported: ${imported} | Updated: ${updated} | Errors: ${errors}`, 'success');
        } else {
            this.showToast(`Done! Imported: ${imported} | Updated: ${updated} | Errors: ${errors}`, 10000);
        }
        
        return { imported, updated, errors };
    }

    async resolveWikiLinksWithSegments(collection, source = 'obsidian', statusDiv = null) {
        const records = await collection.getAllRecords();
        const nameToRecord = new Map();
        const blockIdToRecord = this.blockIdToRecord || new Map();
        
        for (const record of records) {
            const name = record.getName();
            if (name) {
                nameToRecord.set(name.toLowerCase(), record);
            }
        }
        
        let linksFound = 0;
        let linksResolved = 0;
        
        for (const record of records) {
            try {
                const lineItems = await record.getLineItems();
                
                if (!lineItems || lineItems.length === 0) {
                    continue;
                }
                
                for (let i = 0; i < lineItems.length; i++) {
                    try {
                        const lineItem = lineItems[i];
                        
                        const segments = lineItem.segments || null;
                        
                        if (!segments || segments.length === 0) {
                            continue;
                        }
                        
                        if (source === 'logseq') {
                            const lineText = segments
                                .map(seg => (seg.type === 'text' && typeof seg.text === 'string') ? seg.text : '')
                                .join('');

                            if (/^\s*[-*]?\s*\[x\]\s+/i.test(lineText)) {
                                await this.setTaskStatus(lineItem, 8);
                            } else if (/^\s*[-*]?\s*\[\s\]\s+/.test(lineText)) {
                                await this.setTaskStatus(lineItem, 0);
                            }
                        }

                        let hasLinks = false;
                        for (const segment of segments) {
                            if (segment.type === 'text' && segment.text && (segment.text.includes('[[') || segment.text.includes('(('))) {
                                hasLinks = true;
                                break;
                            }
                        }
                        
                        if (!hasLinks) continue;
                        
                        const newSegments = [];
                        
                        for (const segment of segments) {
                            if (segment.type === 'text' && segment.text && (segment.text.includes('[[') || segment.text.includes('(('))) {
                                const linkRegex = /(\[\[([^\]]+)\]\]|\(\(([^\)]+)\)\))/g;
                                let lastIndex = 0;
                                let match;
                                let matched = false;
                                
                                while ((match = linkRegex.exec(segment.text)) !== null) {
                                    matched = true;
                                    linksFound++;

                                    const pageName = match[2] ? match[2].trim() : null;
                                    const blockId = match[3] ? match[3].trim() : null;

                                    let targetRecord = null;
                                    if (blockId) {
                                        targetRecord = blockIdToRecord.get(blockId.toLowerCase()) || null;
                                    }
                                    if (!targetRecord && pageName) {
                                        targetRecord = nameToRecord.get(pageName.toLowerCase()) || null;
                                    }
                                    
                                    if (match.index > lastIndex) {
                                        const textBefore = segment.text.substring(lastIndex, match.index);
                                        newSegments.push({
                                            type: 'text',
                                            text: textBefore
                                        });
                                    }
                                    
                                    if (targetRecord) {
                                        newSegments.push({
                                            type: 'ref',
                                            text: targetRecord.guid
                                        });
                                        linksResolved++;
                                    } else {
                                        newSegments.push({
                                            type: 'text',
                                            text: match[0]
                                        });
                                    }
                                    
                                    lastIndex = match.index + match[0].length;
                                }
                                
                                if (matched) {
                                    if (lastIndex < segment.text.length) {
                                        const textAfter = segment.text.substring(lastIndex);
                                        newSegments.push({
                                            type: 'text',
                                            text: textAfter
                                        });
                                    }
                                } else {
                                    newSegments.push(segment);
                                }
                            } else {
                                newSegments.push(segment);
                            }
                        }
                        
                        await lineItem.setSegments(newSegments);
                        
                    } catch (lineError) {
                        console.error(`[WikiLinks] Error processing line ${i}:`, lineError);
                    }
                }
                
            } catch (error) {
                console.error(`[WikiLinks] Error processing ${record.getName()}:`, error);
            }
        }
        
        this.showToast(`Found ${linksFound} wiki/block links, resolved ${linksResolved}`, 5000);
    }

    makeDedupKey(path, title) {
        const safePath = (path || '').trim().toLowerCase();
        const safeTitle = (title || '').trim().toLowerCase();
        return `${safePath}||${safeTitle}`;
    }

    rememberBlockIds(blockIds, record) {
        if (!blockIds || !Array.isArray(blockIds)) return;
        if (!this.blockIdToRecord) this.blockIdToRecord = new Map();

        for (const id of blockIds) {
            const key = (id || '').trim().toLowerCase();
            if (!key) continue;
            if (!this.blockIdToRecord.has(key)) {
                this.blockIdToRecord.set(key, record);
            }
        }
    }

    async setTaskStatus(lineItem, doneValue) {
        if (!lineItem || typeof lineItem.setMetaProperties !== 'function') return false;
        try {
            const result = lineItem.setMetaProperties({ done: doneValue });
            if (result && typeof result.then === 'function') {
                await result;
            }
            return true;
        } catch (error) {
            console.error('[Tasks] Failed to set task status', error);
            return false;
        }
    }

    setFrontmatterField(record, frontmatterKey, value) {
        const transformedValue = this.transformValue(value);
        const variations = this.getFieldVariations(frontmatterKey);
        
        for (const fieldId of variations) {
            if (this.setFieldValue(record, fieldId, transformedValue)) {
                return true;
            }
        }
        
        return false;
    }

    getFieldVariations(key) {
        const variations = [];
        
        variations.push(this.slugify(key));
        variations.push(key);
        variations.push(key.toLowerCase());
        variations.push(key.toLowerCase().replace(/\s+/g, '_'));
        variations.push(key.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase());
        
        return [...new Set(variations)];
    }

    setFieldValue(record, fieldId, value) {
        try {
            const prop = record.prop(fieldId);
            if (!prop) return false;

            if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
                try {
                    const dateOnly = value.match(/^\d{4}-\d{2}-\d{2}/)[0];
                    const [year, month, day] = dateOnly.split('-');
                    
                    prop.set({
                        d: year + month + day
                    });
                    return true;
                } catch (e) {
                    try {
                        prop.set(value);
                        return true;
                    } catch (e2) {
                    }
                }
            }

            if (typeof value === 'string' && typeof prop.setChoice === 'function') {
                try {
                    if (prop.setChoice(value)) {
                        return true;
                    }
                } catch (e) {
                }
            }

            prop.set(value);
            return true;

        } catch (e) {
            return false;
        }
    }

    transformValue(value) {
        if (value === null || value === undefined) return value;
        
        if (typeof value === 'boolean') {
            return value ? 'true' : 'false';
        }
        
        if (Array.isArray(value)) {
            return value.filter(v => v !== null && v !== undefined && v !== '').join(', ');
        }

        return value;
    }

    showToast(message, time) {
        this.ui.addToaster({
            title: message,
            dismissible: true,
            autoDestroyTime: time
        });
    }

    showStatus(statusDiv, message, type = 'info') {
        const colors = this.getThemeColors();
        statusDiv.style.display = 'block';
        statusDiv.textContent = message;
        statusDiv.style.padding = '12px';
        statusDiv.style.borderRadius = '4px';
        statusDiv.style.marginTop = '16px';
        
        const typeColors = {
            info: colors.info,
            success: colors.success,
            error: colors.error,
            warning: colors.warning
        };
        
        if (type === 'error') {
            statusDiv.style.background = this.isDarkMode() ? '#3d1f1f' : '#fee';
            statusDiv.style.border = `1px solid ${colors.error}`;
            statusDiv.style.color = colors.error;
        } else if (type === 'success') {
            statusDiv.style.background = this.isDarkMode() ? '#1f3d1f' : '#efe';
            statusDiv.style.border = `1px solid ${colors.success}`;
            statusDiv.style.color = colors.success;
        } else {
            statusDiv.style.background = this.isDarkMode() ? '#1f2d3d' : '#eef';
            statusDiv.style.border = `1px solid ${typeColors[type] || colors.info}`;
            statusDiv.style.color = typeColors[type] || colors.text;
        }
    }

    slugify(text) {
        if (!text) return '';
        return String(text)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '');
    }
}
