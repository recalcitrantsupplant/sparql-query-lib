import { randomUUID } from 'crypto';
import { Library, StoredQuery } from '../types'; // Import StoredQuery
import { IQueryStorage } from './queryStorage';

export class LibraryManager {
    private libraries: Library[] = [];
    private currentLibrary: string | null = 'default'; // Allow null, initialize with default name
    private storage: IQueryStorage;

    constructor(storage: IQueryStorage) {
        this.storage = storage;
    }

    /**
     * Loads libraries from storage. Should be called before other methods.
     */
    async initialize(): Promise<void> {
        try {
            this.libraries = await this.storage.loadQueries();
            // Ensure there's at least a default library if storage is empty
            if (this.libraries.length === 0) {
                console.log('No libraries found in storage, creating default library.');
                const defaultLib: Library = { id: 'default-id', name: 'default', queries: [] };
                this.libraries.push(defaultLib);
                // Optionally save the newly created default library immediately
                // await this.storage.saveQueries(this.libraries);
            } else {
                 // Set current library to the first one loaded if not default
                 this.currentLibrary = this.libraries[0].name;
            }
            console.log(`LibraryManager initialized. Current library: ${this.currentLibrary}`);
        } catch (error) {
            console.error('Failed to initialize LibraryManager:', error);
            // Start with an empty array or a default one if loading fails
            this.libraries = [{ id: 'default-id', name: 'default', queries: [] }];
            this.currentLibrary = 'default'; // Keep initializing with 'default' name
            // Rethrow or handle as appropriate for the application
            // throw new Error(`Failed to initialize libraries: ${error instanceof Error ? error.message : error}`);
        }
    }

    /**
     * Creates a new library and persists the changes.
     * Updates in-memory state only on successful persistence.
     * @param name The name for the new library.
     */
    async createLibrary(name: string): Promise<Library> {
        if (this.libraries.find(lib => lib.name === name)) {
            throw new Error(`Library "${name}" already exists`);
        }

        const id = randomUUID().substring(0, 8);
        const newLibrary: Library = {
            id,
            name,
            queries: []
        };

        // Create temporary state for saving
        const librariesToSave = [...this.libraries, newLibrary];

        try {
            await this.storage.saveQueries(librariesToSave);
            // If successful, update the actual in-memory cache
            this.libraries.push(newLibrary);
            return newLibrary;
        } catch (error) {
            console.error(`Failed to save new library ${name}:`, error);
            // Rollback is implicit as we didn't modify this.libraries yet
            throw new Error(`Failed to save library: ${error instanceof Error ? error.message : error}`);
        }
    }

    /**
     * Sets the active library by its ID.
     * @param id The ID of the library to set as current.
     */
    async setCurrentLibrary(id: string): Promise<void> {
        const library = this.libraries.find(lib => lib.id === id);
        if (!library) {
            throw new Error(`Library with id "${id}" not found`);
        }
        this.currentLibrary = library.name;
        console.log(`Current library set to: ${this.currentLibrary}`);
    }

    /**
     * Gets the name of the currently active library.
     */
    getCurrentLibraryName(): string | null {
        // Ensure libraries are loaded.
        if (!this.libraries || this.libraries.length === 0) {
             console.warn('Attempted to get current library name before initialization or when no libraries exist.');
            return null;
        }
        // Check if the currentLibrary name (if not null) still exists
        if (this.currentLibrary && !this.libraries.some(lib => lib.name === this.currentLibrary)) {
            // If the current library was deleted or became invalid, reset to the first available name or null
            this.currentLibrary = this.libraries.length > 0 ? this.libraries[0].name : null;
            console.warn(`Current library "${this.currentLibrary}" was invalid, reset.`);
        }
        // Return the current name (which could be null)
        return this.currentLibrary;
    }

     /**
     * Gets the ID of the currently active library.
     */
    getCurrentLibraryId(): string | null {
        const currentName = this.getCurrentLibraryName();
        if (!currentName) return null;
        const library = this.libraries.find(lib => lib.name === currentName);
        return library ? library.id : null;
    }


    /**
     * Returns the currently loaded libraries.
     * Ensures the manager is initialized.
     */
    getLibraries(): Library[] {
        // Ensure libraries are loaded. Initialize guarantees `this.libraries` is an array.
        if (!this.libraries) {
             // This case should ideally not happen if initialize is always called.
            console.error('Attempted to get libraries before initialization or after load failure.');
            throw new Error('LibraryManager not initialized or failed to load libraries.');
        }
        // Return direct reference. Consumers should not modify directly.
        return this.libraries;
    }

    // --- Query Management Methods (Handles Persistence) ---

    /**
     * Adds a query to the specified library and persists all libraries.
     * Updates in-memory state only on successful persistence.
     * @param libraryId The ID of the target library.
     * @param query The StoredQuery object to add.
     */
    async addQueryToLibrary(libraryId: string, query: StoredQuery): Promise<void> {
        const libraryIndex = this.libraries.findIndex(lib => lib.id === libraryId);
        if (libraryIndex === -1) {
            throw new Error(`Library with ID ${libraryId} not found.`);
        }

        // Create temporary state for saving (deep copy to avoid partial updates on error)
        const librariesToSave = JSON.parse(JSON.stringify(this.libraries));
        librariesToSave[libraryIndex].queries.push(query);

        try {
            await this.storage.saveQueries(librariesToSave);
            // If successful, update the actual in-memory cache
            this.libraries[libraryIndex].queries.push(query);
        } catch (error) {
            console.error(`Failed to save query ${query.id} to library ${libraryId}:`, error);
            throw new Error(`Failed to add query to library: ${error instanceof Error ? error.message : error}`);
        }
    }

    /**
     * Updates a query within the specified library and persists all libraries.
     * Updates in-memory state only on successful persistence.
     * @param libraryId The ID of the target library.
     * @param queryId The ID of the query to update.
     * @param updatedQueryData The complete updated StoredQuery object.
     */
    async updateQueryInLibrary(libraryId: string, queryId: string, updatedQueryData: StoredQuery): Promise<void> {
        const libraryIndex = this.libraries.findIndex(lib => lib.id === libraryId);
        if (libraryIndex === -1) {
            throw new Error(`Library with ID ${libraryId} not found.`);
        }

        const queryIndex = this.libraries[libraryIndex].queries.findIndex(q => q.id === queryId);
        if (queryIndex === -1) {
            throw new Error(`Query with ID ${queryId} not found in library ${libraryId}.`);
        }

        // Create temporary state for saving (deep copy)
        const librariesToSave = JSON.parse(JSON.stringify(this.libraries));
        librariesToSave[libraryIndex].queries[queryIndex] = updatedQueryData;

        try {
            await this.storage.saveQueries(librariesToSave);
            // If successful, update the actual in-memory cache
            this.libraries[libraryIndex].queries[queryIndex] = updatedQueryData;
        } catch (error) {
            console.error(`Failed to save updated query ${queryId} in library ${libraryId}:`, error);
            throw new Error(`Failed to update query in library: ${error instanceof Error ? error.message : error}`);
        }
    }

    /**
     * Removes a query from the specified library and persists all libraries.
     * Updates in-memory state only on successful persistence.
     * @param libraryId The ID of the target library.
     * @param queryId The ID of the query to remove.
     * @returns True if the query was found and removal persisted, false otherwise.
     */
    async removeQueryFromLibrary(libraryId: string, queryId: string): Promise<boolean> {
        const libraryIndex = this.libraries.findIndex(lib => lib.id === libraryId);
        if (libraryIndex === -1) {
            console.warn(`Library with ID ${libraryId} not found when removing query ${queryId}`);
            return false; // Library not found
        }

        const queryIndex = this.libraries[libraryIndex].queries.findIndex(q => q.id === queryId);
        if (queryIndex === -1) {
            return false; // Query not found in the specified library
        }

        // Create temporary state for saving (deep copy)
        const librariesToSave = JSON.parse(JSON.stringify(this.libraries));
        librariesToSave[libraryIndex].queries = librariesToSave[libraryIndex].queries.filter((q: StoredQuery) => q.id !== queryId);

        try {
            await this.storage.saveQueries(librariesToSave);
            // If successful, update the actual in-memory cache
            this.libraries[libraryIndex].queries = this.libraries[libraryIndex].queries.filter(q => q.id !== queryId);
            return true;
        } catch (error) {
            console.error(`Failed to save deletion for query ${queryId} in library ${libraryId}:`, error);
            throw new Error(`Failed to remove query from library: ${error instanceof Error ? error.message : error}`);
        }
    }

    // --- Library Management Methods (Handles Persistence) ---

    /**
     * Deletes a library and persists the changes.
     * Updates in-memory state only on successful persistence.
     * @param id The ID of the library to delete.
     * @returns True if the library was found and deletion persisted, false otherwise.
     */
    async deleteLibrary(id: string): Promise<boolean> {
        const libraryIndex = this.libraries.findIndex(lib => lib.id === id);
        if (libraryIndex === -1) {
            return false; // Library not found
        }
        const libraryToDelete = this.libraries[libraryIndex]; // Get reference before filtering

        // Create temporary state for saving
        const librariesToSave = this.libraries.filter(lib => lib.id !== id);

        try {
            await this.storage.saveQueries(librariesToSave);
            // If successful, update the actual in-memory cache
            this.libraries = librariesToSave;
            // Reset currentLibrary if the deleted one was active
            if (this.currentLibrary === libraryToDelete.name) {
                 this.currentLibrary = null; // Set current library name to null
                 console.log(`Current library reset to: null`);
            }
            return true;
        } catch (error) {
            console.error(`Failed to save after deleting library ${id}:`, error);
            throw new Error(`Failed to delete library: ${error instanceof Error ? error.message : error}`);
        }
    }
}
