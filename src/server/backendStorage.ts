import * as fs from 'fs/promises';
import path from 'path';
import { Backend } from '../types'; // Assuming Backend type is defined correctly
import { randomUUID } from 'crypto';

// Interface for backend persistence operations
export interface IBackendStorage {
    getAllBackends(): Promise<Backend[]>;
    getBackendById(id: string): Promise<Backend | null>;
    addBackend(backendData: Omit<Backend, 'id'>): Promise<Backend>; // Input data, return full Backend
    updateBackend(id: string, backendData: Partial<Omit<Backend, 'id'>>): Promise<Backend | null>; // Update specific fields
    deleteBackend(id: string): Promise<boolean>; // Return true if deleted
}

/**
 * Filesystem-based implementation of IBackendStorage using a single JSON file.
 * Note: This implementation loads and saves the entire dataset for most operations,
 * similar to FileSystemLibraryStorage.
 */
export class FileSystemBackendStorage implements IBackendStorage {
    private filePath: string;

    // Store the 'currentBackend' ID in memory only, not persisted in the file
    private currentBackendId: string | null = null;

    constructor(filePath: string) {
        this.filePath = filePath;
        console.log(`FileSystemBackendStorage initialized with file path: ${this.filePath}`);
        // Load initial state to potentially set the initial currentBackendId
        this.loadAndSetInitialCurrent().catch(err => {
            console.error("Initial load failed for FileSystemBackendStorage:", err);
            // Proceed with empty state if load fails
        });
    }

    // --- Private Helper Methods ---

    // Loads the structure { currentBackend: string | null, backends: Backend[] }
    private async loadState(): Promise<{ currentBackend: string | null, backends: Backend[] }> {
        try {
            const data = await fs.readFile(this.filePath, 'utf8');
            const state = JSON.parse(data);
            // Basic validation
            if (!state || typeof state !== 'object' || !Array.isArray(state.backends)) {
                 console.warn(`Invalid format in ${this.filePath}. Returning default empty state.`);
                 return { currentBackend: null, backends: [] };
            }
             // Ensure currentBackend ID actually exists in the list
            if (state.currentBackend && !state.backends.some((b: Backend) => b.id === state.currentBackend)) {
                console.warn(`Persisted currentBackend ID "${state.currentBackend}" not found in backends list. Ignoring.`);
                state.currentBackend = null;
            }
            return state;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                console.warn(`${this.filePath} not found. Returning default empty state.`);
                return { currentBackend: null, backends: [] };
            }
            console.error(`Error reading or parsing ${this.filePath}:`, error);
            if (error instanceof SyntaxError) {
                console.error(`Invalid JSON in ${this.filePath}. Returning default empty state.`);
                return { currentBackend: null, backends: [] };
            }
            throw error;
        }
    }

     // Saves the structure { currentBackend: string | null, backends: Backend[] }
    private async saveState(backends: Backend[]): Promise<void> {
         // The 'currentBackendId' from memory is used here for saving,
         // but the interface methods below won't expose it directly.
         // This maintains compatibility with the old file structure for now.
        const stateToSave = {
            currentBackend: this.currentBackendId, // Use in-memory value
            backends: backends
        };
        const backupFilePath = `${this.filePath}.backup`;
        try {
            // Backup
            try {
                await fs.copyFile(this.filePath, backupFilePath);
            } catch (backupError: any) {
                if (backupError.code !== 'ENOENT') {
                    console.warn(`Could not create backend backup file: ${backupError.message}`);
                }
            }

            const dataToSave = JSON.stringify(stateToSave, null, 2);
            await fs.writeFile(this.filePath, dataToSave, 'utf8');

            // Remove backup
            try {
                await fs.unlink(backupFilePath);
            } catch (unlinkError: any) { /* Ignore */ }

        } catch (error) {
            console.error(`Error writing ${this.filePath}:`, error);
            // Restore backup
            try {
                await fs.copyFile(backupFilePath, this.filePath);
                console.log(`Restored backends from backup ${backupFilePath}`);
            } catch (restoreError: any) {
                console.error(`Failed to restore backends from backup: ${restoreError.message}`);
            }
            throw error;
        }
    }

    // Special method for initial load to set in-memory currentBackendId
    private async loadAndSetInitialCurrent(): Promise<void> {
        const state = await this.loadState();
        this.currentBackendId = state.currentBackend; // Initialize in-memory value
        console.log(`Initial current backend ID set to: ${this.currentBackendId}`);
    }


    // --- IBackendStorage Implementation ---

    async getAllBackends(): Promise<Backend[]> {
        const state = await this.loadState();
        return state.backends;
    }

    async getBackendById(id: string): Promise<Backend | null> {
        const backends = await this.getAllBackends();
        return backends.find(b => b.id === id) || null;
    }

    async addBackend(backendData: Omit<Backend, 'id'>): Promise<Backend> {
        const backends = await this.getAllBackends();
        // Optional: Check for duplicate names or endpoints if needed
        // if (backends.some(b => b.name === backendData.name)) {
        //     throw new Error(`Backend with name "${backendData.name}" already exists.`);
        // }
        const newBackend: Backend = {
            ...backendData,
            id: randomUUID().substring(0, 8),
        };
        backends.push(newBackend);
        await this.saveState(backends);
        return newBackend;
    }

    async updateBackend(id: string, backendData: Partial<Omit<Backend, 'id'>>): Promise<Backend | null> {
        const backends = await this.getAllBackends();
        const backendIndex = backends.findIndex(b => b.id === id);
        if (backendIndex === -1) {
            return null;
        }
        // Optional: Check for name conflicts if name is being changed
        // if (backendData.name && backendData.name !== backends[backendIndex].name && backends.some(b => b.name === backendData.name && b.id !== id)) {
        //      throw new Error(`Another backend with name "${backendData.name}" already exists.`);
        // }

        backends[backendIndex] = { ...backends[backendIndex], ...backendData };
        await this.saveState(backends);
        return backends[backendIndex];
    }

    async deleteBackend(id: string): Promise<boolean> {
        let backends = await this.getAllBackends();
        const initialLength = backends.length;
        backends = backends.filter(b => b.id !== id);
        if (backends.length < initialLength) {
            // If the deleted backend was the current one, clear the in-memory current ID
            if (this.currentBackendId === id) {
                this.currentBackendId = null;
            }
            await this.saveState(backends);
            return true;
        }
        return false;
    }

    // --- Methods for managing the non-persistent 'current' backend ID ---
    // These are NOT part of the IBackendStorage interface but are needed by
    // the FileSystem implementation to manage the in-memory state that
    // gets written back to the JSON for compatibility.

    /**
     * Gets the ID of the current backend (in-memory state).
     * Not part of IBackendStorage.
     */
    getCurrentBackendId(): string | null {
        return this.currentBackendId;
    }

    /**
     * Sets the ID of the current backend (in-memory state).
     * Persists the change immediately for compatibility with the old file structure.
     * Not part of IBackendStorage.
     * @param id The ID to set as current, or null to clear.
     */
    async setCurrentBackendId(id: string | null): Promise<void> {
        const backends = await this.getAllBackends(); // Load current backends
        if (id !== null && !backends.some(b => b.id === id)) {
            throw new Error(`Backend with ID "${id}" not found.`);
        }
        this.currentBackendId = id;
        await this.saveState(backends); // Save the updated state with the new current ID
        console.log(`In-memory current backend ID set to: ${this.currentBackendId}`);
    }
}
