const VERSION = 'v0.0.3';
/**
 * Unified Import Plugin for Thymer
 * Supports CSV and Markdown (Obsidian) imports with UI
 */

class Plugin extends AppPlugin {

    async onLoad() {
        console.log('[Unified Import] Plugin loaded');
        
        this.ui.addCommandPaletteCommand({
            label: 'Import Data',
            icon: 'ti-file-import',
            onSelected: () => this.showImportTypeDialog()
        });
    }

    // =========================================================================
    // THEME & UI UTILITIES
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
                buttonBg: '#fff',
                buttonText: '#000',
                buttonBorder: '#ccc',
                primary: '#4a9eff',
                primaryHover: '#3a8eef',
                success: '#5cb85c',
                error: '#d9534f',
                warning: '#f0ad4e',
                info: '#5bc0de',
                tableHeader: '#f5f5f5',
                tableRow: '#fff',
                tableRowAlt: '#fafafa',
                tableBorder: '#ddd'
            };
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showToast(message, time) {
        this.ui.addToaster({
            title: message,
            dismissible: true,
            autoDestroyTime: time
        });
    }

    showStatus(statusDiv, message, type) {
        const colors = this.getThemeColors();
        statusDiv.style.display = 'block';
        statusDiv.textContent = message;
        statusDiv.style.padding = '12px';
        statusDiv.style.borderRadius = '4px';
        
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
            statusDiv.style.border = `1px solid ${colors.info}`;
            statusDiv.style.color = colors.info;
        }
    }

    // =========================================================================
    // IMPORT TYPE SELECTION
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
            padding: 24px;
            width: 90%;
            max-width: 500px;
            border: 1px solid ${colors.border};
        `;

        dialog.innerHTML = `
            <h2 style="margin: 0 0 16px 0; color: ${colors.text};">Import Data</h2>
            <p style="margin: 0 0 24px 0; color: ${colors.textSecondary};">Choose your import format:</p>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <button id="import-csv-btn" style="padding: 16px; border: 2px solid ${colors.primary}; background: ${colors.backgroundSecondary}; color: ${colors.text}; border-radius: 8px; cursor: pointer; text-align: left; font-size: 16px;">
                    <div style="font-weight: 600; margin-bottom: 4px;">📊 CSV Import</div>
                    <div style="font-size: 13px; color: ${colors.textSecondary};">Import structured data from CSV files</div>
                </button>
                <button id="import-markdown-btn" style="padding: 16px; border: 2px solid ${colors.primary}; background: ${colors.backgroundSecondary}; color: ${colors.text}; border-radius: 8px; cursor: pointer; text-align: left; font-size: 16px;">
                    <div style="font-weight: 600; margin-bottom: 4px;">📝 Markdown Import</div>
                    <div style="font-size: 13px; color: ${colors.textSecondary};">Import notes from Obsidian or other markdown files</div>
                </button>
            </div>
            <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 24px;">
                <button id="cancel-btn" style="padding: 8px 16px; border: 1px solid ${colors.buttonBorder}; background: ${colors.buttonBg}; color: ${colors.buttonText}; border-radius: 4px; cursor: pointer;">Cancel</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        dialog.querySelector('#import-csv-btn').onclick = () => {
            document.body.removeChild(overlay);
            this.showCSVImportDialog();
        };

        dialog.querySelector('#import-markdown-btn').onclick = () => {
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

    // =========================================================================
    // CSV IMPORT
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
            <div id="csv-status" style="margin-top: 16px; display: none;"></div>
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

    // =========================================================================
    // MARKDOWN IMPORT
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
                    Click to select markdown folder
                </button>
                <div id="folder-info" style="margin-top: 8px; font-size: 12px; color: ${colors.textSecondary};"></div>
            </div>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button id="md-cancel-btn" style="padding: 8px 16px; border: 1px solid ${colors.buttonBorder}; background: ${colors.buttonBg}; color: ${colors.buttonText}; border-radius: 4px; cursor: pointer;">Cancel</button>
                <button id="md-import-btn" style="padding: 8px 16px; border: none; background: ${colors.primary}; color: #fff; border-radius: 4px; cursor: pointer;" disabled>Import</button>
            </div>
            <div id="md-status" style="margin-top: 16px; display: none;"></div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        this.loadCollections(dialog, 'md-collection-select');

        const collectionSelect = dialog.querySelector('#md-collection-select');
        const newCollectionNameContainer = dialog.querySelector('#new-collection-name-container');
        const importBtn = dialog.querySelector('#md-import-btn');
        let selectedDirHandle = null;

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
                folderInfo.style.color = this.getThemeColors().success;
                
                this.updateImportButtonState(importBtn, collectionSelect, selectedDirHandle);
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('[MD Import] Error selecting folder:', error);
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

    async performMarkdownImport(dialog, overlay, dirHandle) {
        const select = dialog.querySelector('#md-collection-select');
        const statusDiv = dialog.querySelector('#md-status');
        const importBtn = dialog.querySelector('#md-import-btn');
        const newCollectionNameInput = dialog.querySelector('#new-collection-name');

        const collectionGuid = select.value;
        const isCreatingNew = collectionGuid === '__CREATE_NEW__';

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
            // Phase 1: Scan files and analyze frontmatter
            const scanResults = await this.scanVaultFiles(dirHandle);
            
            if (scanResults.files.length === 0) {
                this.showStatus(statusDiv, 'No .md files found', 'error');
                importBtn.disabled = false;
                importBtn.textContent = 'Import';
                return;
            }

            this.showStatus(statusDiv, `Analyzing ${scanResults.files.length} files...`, 'info');
            const analysis = await this.analyzeFrontmatter(scanResults.files);

            let collection;

            if (isCreatingNew) {
                // Show property configuration dialog
                const newName = newCollectionNameInput.value.trim();
                const propertyConfig = await this.showMarkdownPropertyConfigDialog(
                    scanResults.topFolders,
                    analysis.properties,
                    scanResults.files.slice(0, 3)
                );
                
                if (!propertyConfig) {
                    importBtn.disabled = false;
                    importBtn.textContent = 'Import';
                    statusDiv.style.display = 'none';
                    return;
                }

                this.showStatus(statusDiv, `Creating collection "${newName}"...`, 'info');
                collection = await this.createMarkdownCollection(newName, scanResults.topFolders, analysis.properties, propertyConfig);
                
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

            // Phase 2: Import all files with content
            this.showStatus(statusDiv, 'Importing files...', 'info');
            const importResult = await this.executeMarkdownImport(collection, scanResults.files);

            // Phase 3: Resolve wiki-links
            this.showStatus(statusDiv, 'Resolving wiki-links...', 'info');
            await this.resolveWikiLinksWithSegments(collection);

            this.showStatus(statusDiv, `Complete! Imported: ${importResult.imported}, Updated: ${importResult.updated}, Errors: ${importResult.errors}`, 'success');
            
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

    async showMarkdownPropertyConfigDialog(topFolders, properties, sampleFiles) {
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

            let propertyRows = '';

            // Add folder field if we have folders
            if (topFolders.length > 0) {
                propertyRows += `
                    <tr style="border-bottom: 1px solid ${colors.tableBorder}; background: ${colors.tableRowAlt};">
                        <td style="padding: 8px; color: ${colors.text};">
                            <strong>folder</strong>
                            <div style="font-size: 11px; color: ${colors.textSecondary}; margin-top: 4px;">Auto-detected: ${topFolders.slice(0, 3).join(', ')}${topFolders.length > 3 ? '...' : ''}</div>
                        </td>
                        <td style="padding: 8px;">
                            <select class="property-type" data-header="folder" data-is-folder="true" style="width: 100%; padding: 4px; border: 1px solid ${colors.inputBorder}; border-radius: 4px; background: ${colors.input}; color: ${colors.text};">
                                <option value="choice" selected>Choice (dropdown)</option>
                            </select>
                        </td>
                    </tr>
                `;
            }

            // Add frontmatter properties
            propertyRows += properties.filter(p => p.percentage >= 5).map((prop) => {
                const recommendedType = prop.recommendedType.type;
                
                return `
                    <tr style="border-bottom: 1px solid ${colors.tableBorder};">
                        <td style="padding: 8px; color: ${colors.text};">
                            <strong>${this.escapeHtml(prop.key)}</strong>
                            <div style="font-size: 11px; color: ${colors.textSecondary}; margin-top: 4px;">
                                Found in ${prop.percentage}% of files
                                ${prop.recommendedType.note ? ` • ${prop.recommendedType.note}` : ''}
                            </div>
                        </td>
                        <td style="padding: 8px;">
                            <select class="property-type" data-header="${this.escapeHtml(prop.key)}" style="width: 100%; padding: 4px; border: 1px solid ${colors.inputBorder}; border-radius: 4px; background: ${colors.input}; color: ${colors.text};">
                                <option value="text" ${recommendedType === 'text' ? 'selected' : ''}>Text</option>
                                <option value="number" ${recommendedType === 'number' ? 'selected' : ''}>Number</option>
                                <option value="datetime" ${recommendedType === 'datetime' ? 'selected' : ''}>Date/Time</option>
                                <option value="checkbox" ${recommendedType === 'checkbox' ? 'selected' : ''}>Checkbox</option>
                                <option value="choice" ${recommendedType === 'choice' ? 'selected' : ''}>Choice (dropdown)</option>
                                <option value="url" ${recommendedType === 'url' ? 'selected' : ''}>URL</option>
                            </select>
                        </td>
                    </tr>
                `;
            }).join('');

            dialog.innerHTML = `
                <h2 style="margin: 0 0 16px 0; color: ${colors.text};">Configure Properties</h2>
                <div style="margin-bottom: 16px; color: ${colors.textSecondary}; font-size: 14px;">
                    Review and adjust the detected properties:
                </div>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: ${colors.tableHeader};">
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid ${colors.tableBorder}; color: ${colors.text};">Property Name</th>
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid ${colors.tableBorder}; color: ${colors.text};">Type</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${propertyRows}
                    </tbody>
                </table>
                <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px;">
                    <button id="prop-cancel-btn" style="padding: 8px 16px; border: 1px solid ${colors.buttonBorder}; background: ${colors.buttonBg}; color: ${colors.buttonText}; border-radius: 4px; cursor: pointer;">Cancel</button>
                    <button id="prop-confirm-btn" style="padding: 8px 16px; border: none; background: ${colors.primary}; color: #fff; border-radius: 4px; cursor: pointer;">Create Collection</button>
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
                    config[header] = {
                        type: select.value,
                        isFolder: select.getAttribute('data-is-folder') === 'true'
                    };
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

    async createMarkdownCollection(collectionName, topFolders, properties, propertyConfig) {
        console.log('[MD Import] Creating collection:', collectionName);

        const newCollection = await this.data.createCollection();
        if (!newCollection) {
            throw new Error('Failed to create collection');
        }

        console.log('[MD Import] Collection created, GUID:', newCollection.getGuid());

        const config = newCollection.getConfiguration();
        const fields = [];

        // Add folder field if configured
        if (propertyConfig['folder'] && topFolders.length > 0) {
            const folderChoices = topFolders.map((folder, i) => ({
                id: this.slugify(folder) || `folder_${i}`,
                label: folder,
                color: String(i % 10),
                active: true
            })).filter(c => c.id);

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

        // Add frontmatter properties
        for (const prop of properties) {
            if (prop.percentage < 5) continue;
            
            const fieldConfig = propertyConfig[prop.key];
            if (!fieldConfig || fieldConfig.isFolder) continue;

            const fieldId = this.slugify(prop.key);
            if (!fieldId || fields.find(f => f.id === fieldId)) continue;

            const field = {
                id: fieldId,
                label: prop.key,
                type: fieldConfig.type,
                icon: this.getIconForType(fieldConfig.type),
                many: false,
                read_only: false,
                active: true
            };

            if (fieldConfig.type === 'choice' && prop.recommendedType.choices) {
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
                }
            }

            fields.push(field);
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

    async executeMarkdownImport(collection, files) {
        let imported = 0;
        let updated = 0;
        let errors = 0;

        console.log(`[MD Import] Processing ${files.length} files`);

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

                console.log(`[MD Import] File: ${file.name}, has markdown: ${!!markdown}, length: ${markdown ? markdown.length : 0}`);

                const existing = existingByTitle.get(file.name.toLowerCase());

                if (existing) {
                    // Update existing record
                    console.log(`[MD Import] Updating: ${file.name}`);
                    
                    this.setFieldValue(existing, 'folder', 'choice', file.topFolder);
                    for (const [key, value] of Object.entries(frontmatter)) {
                        if (value === null || value === undefined || value === '') continue;
                        this.setFrontmatterField(existing, key, value);
                    }
                    
                    // Insert markdown using self-contained function
                    if (markdown) {
                        const convertedMarkdown = this.convertMarkdown(markdown);
                        console.log(`[MD Import] Converting markdown: ${markdown.length} -> ${convertedMarkdown.length} chars`);
                        
                        // Clear existing text first
                        const textProp = existing.prop('text');
                        if (textProp) textProp.set('');
                        
                        // Use our self-contained insertMarkdown
                        const count = await this.insertMarkdown(convertedMarkdown, existing, null);
                        console.log(`[MD Import] ✓ Inserted ${count} items for ${file.name}`);
                    }
                    updated++;
                } else {
                    // Create new record
                    console.log(`[MD Import] Creating: ${file.name}`);
                    
                    const recordGuid = collection.createRecord(file.name);
                    if (!recordGuid) throw new Error('Failed to create record');

                    await new Promise(resolve => setTimeout(resolve, 50));
                    const records = await collection.getAllRecords();
                    const record = records.find(r => r.guid === recordGuid);
                    if (!record) throw new Error('Record not found');

                    this.setFieldValue(record, 'folder', 'choice', file.topFolder);
                    for (const [key, value] of Object.entries(frontmatter)) {
                        if (value === null || value === undefined || value === '') continue;
                        this.setFrontmatterField(record, key, value);
                    }

                    // Insert markdown using self-contained function
                    if (markdown) {
                        const convertedMarkdown = this.convertMarkdown(markdown);
                        console.log(`[MD Import] Converting markdown: ${markdown.length} -> ${convertedMarkdown.length} chars`);
                        
                        // Use our self-contained insertMarkdown
                        const count = await this.insertMarkdown(convertedMarkdown, record, null);
                        console.log(`[MD Import] ✓ Inserted ${count} items for ${file.name}`);
                    }
                    imported++;
                }

            } catch (error) {
                console.error(`[MD Import] Error on ${file.name}:`, error);
                errors++;
            }
        }

        return { imported, updated, errors };
    }

    // =========================================================================
    // SHARED UTILITIES
    // =========================================================================

    async loadCollections(dialog, selectId) {
        try {
            const collections = await this.data.getAllCollections();
            const select = dialog.querySelector(`#${selectId}`);
            
            // Filter out system collections
            const userCollections = collections.filter(c => {
                const name = c.getName();
                return name !== 'Sync Hub' && name !== 'Journal';
            });
            
            userCollections.forEach(collection => {
                const option = document.createElement('option');
                option.value = collection.getGuid();
                option.textContent = collection.getName();
                select.appendChild(option);
            });
        } catch (error) {
            console.error('[Import] Error loading collections:', error);
        }
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    slugify(text) {
        if (!text) return '';
        return String(text)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '');
    }

    getIconForType(fieldType) {
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

    normalizeFieldName(name) {
        return name.toLowerCase().replace(/[\s\-_]+/g, '').trim();
    }

    // =========================================================================
    // CSV-SPECIFIC UTILITIES
    // =========================================================================

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
                                <option value="choice" ${typeHint === 'choice' ? 'selected' : ''}>Choice (dropdown)</option>
                                <option value="url" ${typeHint === 'url' ? 'selected' : ''}>URL</option>
                            </select>
                        </td>
                    </tr>
                `;
            }).join('');

            dialog.innerHTML = `
                <h2 style="margin: 0 0 16px 0; color: ${colors.text};">Configure Properties</h2>
                <div style="margin-bottom: 16px; color: ${colors.textSecondary}; font-size: 14px;">
                    ${typeHints ? '✓ Type hints found in row 2. Review and adjust as needed.' : 'Select the type for each property:'}
                </div>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: ${colors.tableHeader};">
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid ${colors.tableBorder}; color: ${colors.text};">Property Name</th>
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid ${colors.tableBorder}; color: ${colors.text};">Type</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${propertyRows}
                    </tbody>
                </table>
                <div style="margin-top: 16px; padding: 12px; background: ${this.isDarkMode() ? '#2d3d4d' : '#e3f2fd'}; border: 1px solid ${colors.primary}; border-radius: 4px; font-size: 13px; color: ${colors.text};">
                    <strong>💡 Tip:</strong> Add a second row with type names (text, number, choice, etc.) to your CSV to skip this step next time.
                </div>
                <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px;">
                    <button id="prop-cancel-btn" style="padding: 8px 16px; border: 1px solid ${colors.buttonBorder}; background: ${colors.buttonBg}; color: ${colors.buttonText}; border-radius: 4px; cursor: pointer;">Cancel</button>
                    <button id="prop-confirm-btn" style="padding: 8px 16px; border: none; background: ${colors.primary}; color: #fff; border-radius: 4px; cursor: pointer;">Create Collection</button>
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

    isTypeHintRow(row) {
        const validTypes = ['text', 'number', 'datetime', 'date', 'checkbox', 'choice', 'url', 'email', 'phone'];
        const typeCount = row.filter(val => validTypes.includes(val.toLowerCase().trim())).length;
        return typeCount >= row.length / 2;
    }

    reconstructCSV(headers, rows) {
        const csvRows = [headers, ...rows];
        return csvRows.map(row => 
            row.map(cell => {
                if (cell.includes(',') || cell.includes('\n') || cell.includes('"')) {
                    return `"${cell.replace(/"/g, '""')}"`;
                }
                return cell;
            }).join(',')
        ).join('\n');
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

            choiceOptions[header] = uniqueValues.map((value, idx) => ({
                id: this.normalizeFieldName(value) || `choice_${idx}`,
                label: value,
                color: String((idx % 12) + 1),
                active: true
            }));

            console.log(`[CSV Import] Found ${uniqueValues.length} unique values for choice field "${header}":`, uniqueValues);
        });

        return choiceOptions;
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
                icon: this.getIconForType(fieldType),
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
        config.icon = 'ti-database';
        config.item_name = 'Item';
        config.description = 'Imported from CSV';
        config.fields = fields;
        config.page_field_ids = fields.map(f => f.id);
        config.sidebar_record_sort_field_id = fields[0]?.id || 'title';
        config.sidebar_record_sort_dir = 'desc';
        config.show_sidebar_items = true;
        config.show_cmdpal_items = true;
        
        config.views = [
            {
                id: 'table',
                label: 'Table',
                description: 'Table view',
                type: 'table',
                icon: 'ti-table',
                shown: true,
                read_only: false,
                sort_field_id: fields[0]?.id || null,
                sort_dir: 'asc',
                group_by_field_id: null,
                field_ids: fields.map(f => f.id),
                query: '',
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

        return freshCollection;
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
                        this.updateRecord(existingRecord, rowObject, mapping);
                        updated++;
                    } else {
                        const record = await this.createRecord(collection, title, rowObject, mapping);
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

    async createRecord(collection, title, rowObject, mapping) {
        const recordGuid = collection.createRecord(title);
        if (!recordGuid) return null;

        await new Promise(resolve => setTimeout(resolve, 50));
        const records = await collection.getAllRecords();
        const record = records.find(r => r.guid === recordGuid);

        if (!record) return null;

        this.updateRecord(record, rowObject, mapping);
        return record;
    }

    updateRecord(record, rowObject, mapping) {
        for (const [csvHeader, value] of Object.entries(rowObject)) {
            const fieldMapping = mapping[csvHeader];
            if (!fieldMapping || !fieldMapping.matched) continue;

            const { fieldId, fieldType } = fieldMapping;
            
            try {
                this.setFieldValue(record, fieldId, fieldType, value);
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
    // MARKDOWN-SPECIFIC UTILITIES
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

    setFrontmatterField(record, frontmatterKey, value) {
        const transformedValue = this.transformValue(value);
        const variations = this.getFieldVariations(frontmatterKey);
        
        for (const fieldId of variations) {
            // Try to find the field in the collection config
            const prop = record.prop(fieldId);
            if (!prop) continue;
            
            // Determine field type from the property
            let fieldType = 'text'; // default
            
            // Try to infer type from the property object
            // This is a workaround since we don't have direct access to field config here
            if (typeof prop.setChoice === 'function') {
                fieldType = 'choice';
            }
            
            if (this.setFieldValue(record, fieldId, fieldType, transformedValue)) {
                console.log(`[MD Import] Matched "${frontmatterKey}" → "${fieldId}"`);
                return true;
            }
        }
        
        console.log(`[MD Import] No match for "${frontmatterKey}"`);
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

    setFieldValue(record, fieldId, fieldType, value) {
        try {
            const prop = record.prop(fieldId);
            if (!prop) return false;

            if (value === null || value === undefined || value === '') return false;

            // DateTime fields
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
                        // Fall through
                    }
                }
            }

            // Choice fields
            if (fieldType === 'choice' && typeof prop.setChoice === 'function') {
                try {
                    if (prop.setChoice(String(value).trim())) {
                        return true;
                    }
                } catch (e) {
                    // Fall through
                }
            }

            // Number fields
            if (fieldType === 'number') {
                const num = this.coerceNumber(value);
                if (num !== null) {
                    prop.set(num);
                    return true;
                }
            }

            // Checkbox fields
            if (fieldType === 'checkbox') {
                prop.set(this.coerceBoolean(value));
                return true;
            }

            // Default: set as-is
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

    // =========================================================================
    // MARKDOWN INSERTION (Self-contained - copied from SyncHub)
    // =========================================================================

    /**
     * Insert markdown into a record.
     * Self-contained version - doesn't depend on window.syncHub
     */
    async insertMarkdown(markdown, targetRecord, afterItem = null) {
        if (!targetRecord) {
            console.error('[Import] insertMarkdown: No target record provided');
            return 0;
        }

        const record = targetRecord;
        let promise = Promise.resolve(afterItem);
        let rendered = 0;
        let inCode = false, codeLang = '', codeLines = [];
        let isFirstBlock = true;
        const BLANK_LINE_BEFORE_HEADINGS = true;

        for (const line of markdown.split('\n')) {
            // Code fence
            const fenceMatch = line.match(/^(\s*)```(.*)$/);
            if (fenceMatch) {
                if (inCode) {
                    const lang = codeLang, code = [...codeLines];
                    promise = promise.then(async (last) => {
                        const block = await record.createLineItem(null, last, 'block');
                        if (!block) return last;
                        try { 
                            if (block.setHighlightLanguage) {
                                block.setHighlightLanguage(this.normalizeLanguage(lang)); 
                            }
                        } catch(e) {}
                        block.setSegments([]);
                        let prev = null;
                        for (const cl of code) {
                            const li = await record.createLineItem(block, prev, 'text');
                            if (li) { 
                                li.setSegments([{type:'text', text:cl}]); 
                                prev = li; 
                            }
                        }
                        rendered++;
                        return block;
                    });
                    isFirstBlock = false;
                    inCode = false; 
                    codeLang = ''; 
                    codeLines = [];
                } else {
                    inCode = true;
                    codeLang = fenceMatch[2].trim();
                }
                continue;
            }

            if (inCode) { 
                codeLines.push(line); 
                continue; 
            }
            
            if (!line.trim()) continue;

            const parsed = this.parseLine(line);
            if (!parsed) continue;

            const { type, segments, level } = parsed;
            const isHeading = type === 'heading';
            const needsBlankLine = BLANK_LINE_BEFORE_HEADINGS && isHeading && !isFirstBlock;

            promise = promise.then(async (last) => {
                let insertAfter = last;

                // Add blank line before headings (except first block)
                if (needsBlankLine) {
                    const blank = await record.createLineItem(null, insertAfter, 'text');
                    if (blank) {
                        blank.setSegments([]);
                        insertAfter = blank;
                    }
                }

                const item = await record.createLineItem(null, insertAfter, type);
                if (!item) return last;

                // Set heading size for h2-h6
                if (isHeading && level > 1) {
                    try { 
                        if (item.setHeadingSize) {
                            item.setHeadingSize(level); 
                        }
                    } catch(e) {}
                }

                item.setSegments(segments);
                rendered++;
                return item;
            });

            isFirstBlock = false;
        }

        await promise;
        console.log(`[Import] Inserted ${rendered} line items`);
        return rendered;
    }

    /**
     * Parse a single line of markdown into type + segments
     */
    parseLine(line) {
        if (!line.trim()) return null;

        // Horizontal rule
        if (/^(\*\s*\*\s*\*|\-\s*\-\s*\-|_\s*_\s*_)[\s\*\-_]*$/.test(line.trim())) {
            return { type: 'br', segments: [] };
        }

        // Headings
        const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (hMatch) {
            return {
                type: 'heading',
                level: hMatch[1].length,
                segments: this.parseInlineFormatting(hMatch[2])
            };
        }

        // Task list
        const taskMatch = line.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.+)$/);
        if (taskMatch) {
            return { 
                type: 'task', 
                segments: this.parseInlineFormatting(taskMatch[3]) 
            };
        }

        // Unordered list
        const ulMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
        if (ulMatch) {
            return { 
                type: 'ulist', 
                segments: this.parseInlineFormatting(ulMatch[2]) 
            };
        }

        // Ordered list
        const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
        if (olMatch) {
            return { 
                type: 'olist', 
                segments: this.parseInlineFormatting(olMatch[2]) 
            };
        }

        // Quote
        if (line.startsWith('> ')) {
            return { 
                type: 'quote', 
                segments: this.parseInlineFormatting(line.slice(2)) 
            };
        }

        // Regular text
        return { 
            type: 'text', 
            segments: this.parseInlineFormatting(line) 
        };
    }

    /**
     * Parse inline formatting (bold, italic, code, links, wiki-links)
     */
    parseInlineFormatting(text) {
        const segments = [];
        const patterns = [
            { regex: /`([^`]+)`/, type: 'code' },
            { regex: /\[\[([^\]]+)\]\]/, type: 'wikilink' },  // Wiki-links (will be resolved later)
            { regex: /\[([^\]]+)\]\(([^)]+)\)/, type: 'link' },
            { regex: /\*\*([^*]+)\*\*/, type: 'bold' },
            { regex: /__([^_]+)__/, type: 'bold' },
            { regex: /\*([^*]+)\*/, type: 'italic' },
            { regex: /(?:^|[^a-zA-Z])_([^_]+)_(?:$|[^a-zA-Z])/, type: 'italic' },
        ];

        let remaining = text;

        while (remaining.length > 0) {
            let earliestMatch = null;
            let earliestIndex = remaining.length;
            let matchedPattern = null;

            for (const pattern of patterns) {
                const match = remaining.match(pattern.regex);
                if (match && match.index < earliestIndex) {
                    earliestMatch = match;
                    earliestIndex = match.index;
                    matchedPattern = pattern;
                }
            }

            if (earliestMatch && matchedPattern) {
                if (earliestIndex > 0) {
                    segments.push({ 
                        type: 'text', 
                        text: remaining.slice(0, earliestIndex) 
                    });
                }

                if (matchedPattern.type === 'link') {
                    // Links become plain text
                    segments.push({ 
                        type: 'text', 
                        text: earliestMatch[1] 
                    });
                } else if (matchedPattern.type === 'wikilink') {
                    // Keep wiki-links as text for now (will be resolved in phase 3)
                    segments.push({ 
                        type: 'text', 
                        text: `[[${earliestMatch[1]}]]` 
                    });
                } else {
                    segments.push({ 
                        type: matchedPattern.type, 
                        text: earliestMatch[1] 
                    });
                }

                remaining = remaining.slice(earliestIndex + earliestMatch[0].length);
            } else {
                segments.push({ type: 'text', text: remaining });
                break;
            }
        }

        return segments.length ? segments : [{ type: 'text', text }];
    }

    /**
     * Normalize code language names
     */
    normalizeLanguage(lang) {
        if (!lang) return 'plaintext';
        const lower = lang.toLowerCase();
        const LANGUAGE_ALIASES = {
            'js': 'javascript', 
            'ts': 'typescript', 
            'py': 'python',
            'rb': 'ruby', 
            'sh': 'bash', 
            'yml': 'yaml', 
            'c++': 'cpp',
            'c#': 'csharp', 
            'cs': 'csharp', 
            'golang': 'go', 
            'rs': 'rust',
            'kt': 'kotlin', 
            'md': 'markdown', 
            'html': 'xml', 
            'htm': 'xml'
        };
        return LANGUAGE_ALIASES[lower] || lower;
    }

    async resolveWikiLinksWithSegments(collection) {
        const records = await collection.getAllRecords();
        const nameToRecord = new Map();
        
        console.log('[WikiLinks] Building name→record lookup map...');
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
                    const lineItem = lineItems[i];
                    const segments = lineItem.segments || null;
                    
                    if (!segments || segments.length === 0) {
                        continue;
                    }
                    
                    let hasWikiLinks = false;
                    for (const segment of segments) {
                        if (segment.type === 'text' && segment.text && segment.text.includes('[[')) {
                            hasWikiLinks = true;
                            break;
                        }
                    }
                    
                    if (!hasWikiLinks) continue;
                    
                    const newSegments = [];
                    
                    for (const segment of segments) {
                        if (segment.type === 'text' && segment.text && segment.text.includes('[[')) {
                            const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
                            let lastIndex = 0;
                            let match;
                            
                            while ((match = wikiLinkRegex.exec(segment.text)) !== null) {
                                linksFound++;
                                const noteName = match[1].trim();
                                const targetRecord = nameToRecord.get(noteName.toLowerCase());
                                
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
                    }
                    
                    await lineItem.setSegments(newSegments);
                }
                
            } catch (error) {
                console.error(`[WikiLinks] Error processing ${record.getName()}:`, error);
            }
        }
        
        console.log(`[WikiLinks] Complete: Found ${linksFound} links, resolved ${linksResolved}`);
    }
}
