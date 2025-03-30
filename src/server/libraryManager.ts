import { randomUUID } from 'crypto';
import { Library, StoredQuery } from '../types';
import { ILibraryStorage } from './libraryStorage'; // Updated import path and interface name

export class LibraryManager {
    // Libraries are now primarily managed by the storage layer.
    // We might keep a cache, but for simplicity now, we'll fetch when needed.
    // private libraries: Library[] = []; // Removed in-memory cache for now
    private storage: ILibraryStorage; // Use the new interface

    constructor(storage: ILibraryStorage) { // Update constructor parameter type
        this.storage = storage;
    }

    /**
    /**
     * Optional: Pre-load or check storage status if needed during initialization.
     * For now, initialization might just involve ensuring the storage is ready.
     * The concept of a 'default' library creation might move elsewhere or be handled
     * by the storage implementation if the file doesn't exist.
     */
    async initialize(): Promise<void> {
        try {
            // Example: Check if storage is accessible or load initial cache if desired
            await this.storage.getAllLibraries(); // Example: Trigger initial load/check
            console.log('LibraryManager initialized. Storage connection verified.');
        } catch (error) {
            console.error('Failed to initialize LibraryManager or connect to storage:', error);
            // Depending on requirements, might throw or handle differently
            throw new Error(`Failed to initialize LibraryManager: ${error instanceof Error ? error.message : error}`);
        }
    }

     /**
     * Creates a new library using the storage layer.
     * @param name The name for the new library.
     * @param description Optional description.
     */
    async createLibrary(name: string, description?: string): Promise<Library> {
        // Delegate directly to storage
        return this.storage.addLibrary({ name, description });
    }

    // REMOVED: setCurrentLibrary, getCurrentLibraryName, getCurrentLibraryId
    // These are now concerns of the request/session layer, not the manager.

    /**
     * Returns all libraries by fetching from the storage layer.
     */
    async getLibraries(): Promise<Library[]> {
        // Delegate directly to storage
        return this.storage.getAllLibraries();
    }

     /**
     * Gets a specific library by ID from the storage layer.
     * @param id The ID of the library.
     */
    async getLibraryById(id: string): Promise<Library | null> {
        return this.storage.getLibraryById(id);
    }

    /**
     * Updates library metadata (name, description).
     * @param id The ID of the library to update.
     * @param data Object containing fields to update (e.g., { name: 'New Name' }).
     */
    async updateLibrary(id: string, data: Partial<Omit<Library, 'id' | 'queries'>>): Promise<Library | null> {
        return this.storage.updateLibrary(id, data);
    }


    // --- Query Management Methods (Delegating to Storage) ---

    /**
     * Adds a query to the specified library using the storage layer.
     * @param libraryId The ID of the target library.
     * @param queryData Data for the new query (name, description, query text, etc.).
     */
    async addQueryToLibrary(libraryId: string, queryData: Omit<StoredQuery, 'id' | 'createdAt' | 'updatedAt'>): Promise<StoredQuery> {
        // Delegate directly to storage
        return this.storage.addQuery(libraryId, queryData);
    }

    /**
     * Updates a query using the storage layer.
     * Note: The storage layer handles finding the query across libraries.
     * @param queryId The ID of the query to update.
     * @param updatedQueryData Object containing fields to update.
     */
    async updateQuery(queryId: string, updatedQueryData: Partial<Omit<StoredQuery, 'id' | 'libraryId'>>): Promise<StoredQuery | null> {
        // Delegate directly to storage
        return this.storage.updateQuery(queryId, updatedQueryData);
    }

    /**
     * Removes a query using the storage layer.
     * Note: The storage layer handles finding the query across libraries.
     * @param queryId The ID of the query to remove.
     * @returns True if the query was found and removed, false otherwise.
     */
    async removeQuery(queryId: string): Promise<boolean> {
        // Delegate directly to storage
        return this.storage.deleteQuery(queryId);
    }

    /**
     * Gets all queries for a specific library from the storage layer.
     * @param libraryId The ID of the library.
     */
    async getQueriesByLibrary(libraryId: string): Promise<StoredQuery[]> {
        return this.storage.getQueriesByLibraryId(libraryId);
    }

    /**
     * Gets a specific query by its ID from the storage layer.
     * @param queryId The ID of the query.
     */
    async getQueryById(queryId: string): Promise<StoredQuery | null> {
        return this.storage.getQueryById(queryId);
    }


    // --- Library Deletion (Delegating to Storage) ---

    /**
     * Deletes a library using the storage layer.
     * @param id The ID of the library to delete.
     * @returns True if the library was found and deleted, false otherwise.
     */
    async deleteLibrary(id: string): Promise<boolean> {
        // Delegate directly to storage
        return this.storage.deleteLibrary(id);
    }
}
