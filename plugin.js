const VERSION = 'v0.0.1';
/**
 * Obsidian Import Plugin for Thymer
 * 
 * COMMAND 1: Scan Obsidian Vault - Analyzes frontmatter and generates collection schema
 * COMMAND 2: Import Obsidian Vault - Imports markdown files to collection
 */

class Plugin extends AppPlugin {

    async onLoad() {
        this.scanCommand = this.ui.addCommandPaletteCommand({
            label: 'Scan Obsidian Vault',
            icon: 'search',
            onSelected: () => this.scanVault()
        });

        this.importCommand = this.ui.addCommandPaletteCommand({
            label: 'Import Obsidian Vault',
            icon: 'download',
            onSelected: () => this.importVault()
        });
    }

    onUnload() {
        if (this.scanCommand) this.scanCommand.remove();
        if (this.importCommand) this.importCommand.remove();
    }

    // =========================================================================
    // SCAN COMMAND
    // =========================================================================

    async scanVault() {
        try {
            const vaultName = prompt('Enter vault name (e.g., "Personal Notes"):');
            if (!vaultName) return;

            const dirHandle = await this.pickFolder();
            if (!dirHandle) return;

            this.showToast('Scanning vault...', 3000);
            const scanResults = await this.scanVaultFiles(dirHandle);

            if (scanResults.files.length === 0) {
                this.showToast('No .md files found', 3000);
                return;
            }

            this.showToast(`Analyzing ${scanResults.files.length} files...`, 5000);
            const analysis = await this.analyzeFrontmatter(scanResults.files);
            
            await this.createScanNote(vaultName, scanResults, analysis);
            this.showToast('Scan complete! Check Notes collection', 5000);

        } catch (error) {
            console.error('[Scan] Error:', error);
            this.showToast(`Scan failed: ${error.message}`, 5000);
        }
    }

    async pickFolder() {
        try {
            return await window.showDirectoryPicker({
                mode: 'read',
                startIn: 'documents'
            });
        } catch (error) {
            if (error.name === 'AbortError') return null;
            throw error;
        }
    }

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
                const fileHandle = await file.handle.getFile();
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
        
        // Check if samples contain date-like strings
        if (typeArray.includes('string')) {
            const dateCount = samples.filter(s => 
                typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s)
            ).length;
            
            // If more than 50% of samples look like dates, treat as datetime
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

    async createScanNote(vaultName, scanResults, analysis) {
        const collections = await this.data.getAllCollections();
        const notesCollection = collections.find(c => c.getName() === 'Notes');
        
        if (!notesCollection) {
            throw new Error('Notes collection not found');
        }

        const schema = this.generateSchema(vaultName, scanResults.topFolders, analysis.properties);
        const schemaJson = JSON.stringify(schema, null, 2);
        const noteContent = this.generateReport(vaultName, scanResults, analysis, schemaJson);

        const recordGuid = notesCollection.createRecord(`Obsidian Scan: ${vaultName}`);
        if (!recordGuid) throw new Error('Failed to create note');

        await new Promise(resolve => setTimeout(resolve, 200));
        const records = await notesCollection.getAllRecords();
        const record = records.find(r => r.guid === recordGuid);
        if (!record) throw new Error('Record not found');

        if (window.syncHub && window.syncHub.insertMarkdown) {
            try {
                await window.syncHub.insertMarkdown(noteContent, record, null);
                console.log('[Scan] Markdown inserted successfully');
            } catch (error) {
                console.error('[Scan] insertMarkdown failed:', error);
                const textProp = record.prop('text');
                if (textProp) {
                    textProp.set(noteContent);
                    console.log('[Scan] Used text property fallback');
                }
            }
        } else {
            const textProp = record.prop('text');
            if (textProp) {
                textProp.set(noteContent);
                console.log('[Scan] Used text property (no syncHub)');
            } else {
                console.error('[Scan] No text property available!');
            }
        }

        return record;
    }

    generateSchema(vaultName, topFolders, properties) {
        console.log('[Schema] Generating collection schema');
        
        const fields = [];
        const prefix = this.slugify(vaultName).toUpperCase().slice(0, 6) || 'VAULT';

        if (topFolders.length > 0) {
            const folderChoices = topFolders
                .map((folder, i) => {
                    const id = this.slugify(folder);
                    if (!id) return null;
                    return {
                        id: id,
                        label: folder,
                        color: String(i % 10),
                        active: true
                    };
                })
                .filter(c => c !== null);

            if (folderChoices.length > 0) {
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
        }

        for (const prop of properties) {
            if (prop.percentage < 5) continue;

            const fieldId = this.slugify(prop.key);
            if (!fieldId) continue;

            // Force common date field names to be datetime type
            const commonDateFields = ['created', 'modified', 'updated', 'created_at', 'modified_at', 'updated_at', 'date', 'created_date', 'modified_date'];
            const isCommonDateField = commonDateFields.includes(fieldId) || commonDateFields.includes(prop.key.toLowerCase());
            
            let fieldType = prop.recommendedType.type;
            if (isCommonDateField && (fieldType === 'text' || fieldType === 'choice')) {
                fieldType = 'datetime';
                console.log(`[Schema] Forcing "${prop.key}" to datetime type (common date field)`);
            }

            const field = {
                id: fieldId,
                label: prop.key,
                type: fieldType,
                icon: this.getIcon(fieldType),
                many: false,
                read_only: false,
                active: true
            };

            if (fieldType === 'choice' && prop.recommendedType.choices) {
                const choices = prop.recommendedType.choices
                    .map((c, i) => {
                        const choiceId = this.slugify(String(c));
                        if (!choiceId) return null;
                        return {
                            id: choiceId,
                            label: String(c).trim(),
                            color: String(i % 10),
                            active: true
                        };
                    })
                    .filter(c => c !== null);
                
                if (choices.length >= 2) {
                    field.choices = choices;
                } else {
                    field.type = 'text';
                    delete field.choices;
                }
            }

            fields.push(field);
        }

        const views = [];
        const fieldIds = fields.map(f => f.id);

        views.push({
            id: `V${prefix}001`,
            shown: true,
            icon: '',
            label: 'All Notes',
            description: '',
            type: 'table',
            read_only: false,
            field_ids: fieldIds.slice(0, 8),
            group_by_field_id: null,
            sort_dir: 'asc',
            sort_field_id: 'title',
            opts: {}
        });

        if (fieldIds.includes('folder')) {
            views.push({
                id: `V${prefix}002`,
                shown: true,
                icon: '',
                label: 'By Folder',
                description: '',
                type: 'board',
                read_only: false,
                field_ids: fieldIds.slice(0, 6),
                group_by_field_id: 'folder',
                sort_dir: 'asc',
                sort_field_id: 'title',
                opts: {}
            });
        }

        const schema = {
            ver: 1,
            version: '1.0.0',
            name: vaultName,
            icon: 'ti-notebook',
            home: false,
            item_name: 'Note',
            description: `Imported from Obsidian`,
            page_field_ids: ['title', fieldIds[0] || 'folder'],
            show_sidebar_items: true,
            show_cmdpal_items: true,
            sidebar_record_sort_dir: 'asc',
            sidebar_record_sort_field_id: 'title',
            managed: {
                fields: false,
                views: false,
                sidebar: false
            },
            custom: {},
            fields: fields,
            views: views
        };

        this.validateSchema(schema);
        console.log(`[Schema] Valid schema with ${fields.length} fields, ${views.length} views`);
        return schema;
    }

    slugify(text) {
        if (!text) return '';
        return String(text)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '');
    }

    getIcon(type) {
        const icons = {
            'text': 'ti-abc',
            'choice': 'ti-tag',
            'datetime': 'ti-clock',
            'number': 'ti-123',
            'url': 'ti-link'
        };
        return icons[type] || 'ti-abc';
    }

    validateSchema(schema) {
        if (schema.ver !== 1) throw new Error('ver must be 1');
        if (!schema.name) throw new Error('name required');
        if (!schema.item_name) throw new Error('item_name required');
        if (!schema.icon || !schema.icon.startsWith('ti-')) throw new Error('icon must start with ti-');
        if (!Array.isArray(schema.fields)) throw new Error('fields must be array');
        if (!Array.isArray(schema.views)) throw new Error('views must be array');
        if (!Array.isArray(schema.page_field_ids)) throw new Error('page_field_ids must be array');

        const fieldIds = new Set();
        for (const field of schema.fields) {
            if (!field.id) throw new Error('field missing id');
            if (fieldIds.has(field.id)) throw new Error(`duplicate field id: ${field.id}`);
            fieldIds.add(field.id);
            if (!field.label) throw new Error(`field ${field.id} missing label`);
            if (!field.type) throw new Error(`field ${field.id} missing type`);
            if (field.many === undefined) throw new Error(`field ${field.id} missing many`);
            if (field.read_only === undefined) throw new Error(`field ${field.id} missing read_only`);
            if (field.active === undefined) throw new Error(`field ${field.id} missing active`);
            
            if (field.type === 'choice') {
                if (!Array.isArray(field.choices) || field.choices.length === 0) {
                    throw new Error(`choice field ${field.id} missing choices`);
                }
                for (const choice of field.choices) {
                    if (!choice.id) throw new Error(`choice in ${field.id} missing id`);
                    if (!choice.label) throw new Error(`choice ${choice.id} missing label`);
                    if (typeof choice.color !== 'string') throw new Error(`choice ${choice.id} color must be string`);
                    if (choice.active === undefined) throw new Error(`choice ${choice.id} missing active`);
                }
            }
        }

        const viewIds = new Set();
        for (const view of schema.views) {
            if (!view.id) throw new Error('view missing id');
            if (viewIds.has(view.id)) throw new Error(`duplicate view id: ${view.id}`);
            viewIds.add(view.id);
            if (!view.label) throw new Error(`view ${view.id} missing label`);
            if (!view.type) throw new Error(`view ${view.id} missing type`);
            if (view.shown === undefined) throw new Error(`view ${view.id} missing shown`);
            if (view.read_only === undefined) throw new Error(`view ${view.id} missing read_only`);
            if (!Array.isArray(view.field_ids)) throw new Error(`view ${view.id} field_ids must be array`);
            if (view.icon === undefined) throw new Error(`view ${view.id} missing icon`);
            if (view.description === undefined) throw new Error(`view ${view.id} missing description`);
            if (!view.opts) throw new Error(`view ${view.id} missing opts`);
        }
    }

    generateReport(vaultName, scanResults, analysis, schemaJson) {
        const { totalFiles, filesWithFrontmatter, properties } = analysis;
        
        let report = `# Obsidian Scan: ${vaultName}\n\n`;
        report += `**Files:** ${totalFiles} | **With frontmatter:** ${filesWithFrontmatter}\n\n`;
        
        report += `## Collection Schema\n\n`;
        report += `Copy this JSON to create the collection:\n\n`;
        report += `\`\`\`json\n${schemaJson}\n\`\`\`\n\n`;
        
        report += `## Properties Found\n\n`;
        for (const prop of properties.slice(0, 20)) {
            const fieldId = this.slugify(prop.key);
            report += `- **${prop.key}** → \`${fieldId}\` (${prop.percentage}%, ${prop.recommendedType.type})\n`;
        }
        
        report += `\n## Next Steps\n\n`;
        report += `1. Click + next to Collections in Thymer\n`;
        report += `2. Click "Edit as code"\n`;
        report += `3. Copy the JSON schema above\n`;
        report += `4. Paste into the code editor\n`;
        report += `5. Save the collection\n`;
        report += `6. Run "Import Obsidian Vault" command\n`;
        
        console.log(`[Scan] Generated report (${report.length} characters)`);
        console.log('[Scan] First 200 chars:', report.substring(0, 200));
        
        return report;
    }

    // =========================================================================
    // IMPORT COMMAND
    // =========================================================================

    async importVault() {
        try {
            const collection = await this.chooseCollection();
            if (!collection) return;

            const dirHandle = await this.pickFolder();
            if (!dirHandle) return;

            this.showToast('Scanning files...', 3000);
            const scanResults = await this.scanVaultFiles(dirHandle);

            if (scanResults.files.length === 0) {
                this.showToast('No files found', 3000);
                return;
            }

            const confirmed = confirm(
                `Import ${scanResults.files.length} files to ${collection.getName()}?`
            );
            if (!confirmed) return;

            await this.executeImport(collection, scanResults.files);

        } catch (error) {
            console.error('[Import] Error:', error);
            this.showToast(`Import failed: ${error.message}`, 5000);
        }
    }

    async chooseCollection() {
        const collections = await this.data.getAllCollections();
        const userCollections = collections.filter(c => {
            const name = c.getName();
            return name !== 'Sync Hub' && name !== 'Journal';
        });

        if (userCollections.length === 0) {
            throw new Error('No collections found');
        }

        const names = userCollections.map(c => c.getName()).join('\n');
        const chosen = prompt(`Select collection:\n\n${names}\n\nEnter name:`);
        if (!chosen) return null;

        const collection = userCollections.find(c => 
            c.getName().toLowerCase() === chosen.toLowerCase()
        );

        if (!collection) {
            throw new Error(`Collection "${chosen}" not found`);
        }

        return collection;
    }

    async executeImport(collection, files) {
        let imported = 0;
        let updated = 0;
        let errors = 0;

        const existingRecords = await collection.getAllRecords();
        const existingByTitle = new Map();
        
        for (const record of existingRecords) {
            const name = record.getName();
            if (name) {
                existingByTitle.set(name.toLowerCase(), record);
            }
        }

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            try {
                if (i % 10 === 0) {
                    this.showToast(`Importing ${i + 1}/${files.length}`, 500);
                }

                const fileHandle = await file.handle.getFile();
                const content = await fileHandle.text();
                const { frontmatter, markdown } = this.parseMarkdownFile(content);

                console.log(`[Import] Processing "${file.name}" - Markdown length: ${markdown ? markdown.length : 0} chars`);

                const existing = existingByTitle.get(file.name.toLowerCase());

                if (existing) {
                    await this.updateRecord(existing, frontmatter, markdown, file.topFolder);
                    updated++;
                } else {
                    await this.createRecord(collection, file.name, frontmatter, markdown, file.topFolder);
                    imported++;
                }

            } catch (error) {
                console.error(`[Import] Error on ${file.name}:`, error);
                errors++;
            }
        }

        this.showToast(`Done! Imported: ${imported} | Updated: ${updated} | Errors: ${errors}`, 10000);
    }

    async createRecord(collection, title, frontmatter, markdown, topFolder) {
        const recordGuid = collection.createRecord(title);
        if (!recordGuid) throw new Error('Failed to create record');

        await new Promise(resolve => setTimeout(resolve, 50));
        const records = await collection.getAllRecords();
        const record = records.find(r => r.guid === recordGuid);
        if (!record) throw new Error('Record not found');

        this.setFieldValue(record, 'folder', topFolder);

        for (const [key, value] of Object.entries(frontmatter)) {
            if (value === null || value === undefined || value === '') continue;
            this.setFrontmatterField(record, key, value);
        }

        if (markdown) {
            const convertedMarkdown = this.convertMarkdown(markdown);
            
            if (window.syncHub && window.syncHub.insertMarkdown) {
                try {
                    await window.syncHub.insertMarkdown(convertedMarkdown, record, null);
                } catch (error) {
                    console.error(`[Import] insertMarkdown failed for ${title}:`, error);
                    const textProp = record.prop('text');
                    if (textProp) {
                        textProp.set(convertedMarkdown);
                    }
                }
            } else {
                const textProp = record.prop('text');
                if (textProp) {
                    textProp.set(convertedMarkdown);
                }
            }
        }

        return record;
    }

    async updateRecord(record, frontmatter, markdown, topFolder) {
        this.setFieldValue(record, 'folder', topFolder);

        for (const [key, value] of Object.entries(frontmatter)) {
            if (value === null || value === undefined || value === '') continue;
            this.setFrontmatterField(record, key, value);
        }

        if (markdown) {
            const convertedMarkdown = this.convertMarkdown(markdown);
            
            if (window.syncHub && window.syncHub.insertMarkdown) {
                try {
                    const textProp = record.prop('text');
                    if (textProp) {
                        textProp.set('');
                    }
                    
                    await window.syncHub.insertMarkdown(convertedMarkdown, record, null);
                } catch (error) {
                    console.error(`[Import] insertMarkdown failed for ${record.getName()}:`, error);
                    const textProp = record.prop('text');
                    if (textProp) {
                        textProp.set(convertedMarkdown);
                    }
                }
            } else {
                const textProp = record.prop('text');
                if (textProp) {
                    textProp.set('');
                    textProp.set(convertedMarkdown);
                }
            }
        }

        return record;
    }

    setFrontmatterField(record, frontmatterKey, value) {
        const transformedValue = this.transformValue(value);
        const variations = this.getFieldVariations(frontmatterKey);
        
        for (const fieldId of variations) {
            if (this.setFieldValue(record, fieldId, transformedValue)) {
                console.log(`[Import] Matched "${frontmatterKey}" → "${fieldId}"`);
                return true;
            }
        }
        
        console.log(`[Import] No match for "${frontmatterKey}"`);
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

            // DateTime fields - date only (no time)
            if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
                try {
                    const dateOnly = value.match(/^\d{4}-\d{2}-\d{2}/)[0];
                    const [year, month, day] = dateOnly.split('-');
                    
                    // Try to set date-only value (YYYYMMDD format)
                    prop.set({
                        d: year + month + day
                    });
                    return true;
                } catch (e) {
                    // If date object fails, try setting the string directly
                    try {
                        prop.set(value);
                        return true;
                    } catch (e2) {
                        // Fall through to other methods
                    }
                }
            }

            // Choice fields
            if (typeof value === 'string' && typeof prop.setChoice === 'function') {
                try {
                    if (prop.setChoice(value)) {
                        return true;
                    }
                } catch (e) {
                    // Fall through
                }
            }

            // Default
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

    convertMarkdown(markdown) {
        let converted = markdown;

        converted = converted.replace(/^>\s*\[!(\w+)\]\s*(.*)$/gm, (match, type, title) => {
            return `> **${type}${title ? ': ' + title : ''}**`;
        });

        converted = converted.replace(/==([^=]+)==/g, '**$1**');
        converted = converted.replace(/%%[^%]*%%/g, '');
        converted = converted.replace(/!\[\[([^\]]+)\]\]/g, '![Attachment: $1]');

        return converted;
    }

    showToast(message, time) {
        this.ui.addToaster({
            title: message,
            dismissible: true,
            autoDestroyTime: time
        });
    }
}
