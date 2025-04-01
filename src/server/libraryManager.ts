import { randomUUID } from 'crypto';
import { Library, StoredQuery, VariableGroup } from '../types'; // Import VariableGroup if needed for variable detection later
import { ILibraryStorage } from './libraryStorage'; // Updated import path and interface name
import { SparqlQueryParser } from '../lib/parser'; // Import the parser

export class LibraryManager {
    // Libraries are now primarily managed by the storage layer.
    // We might keep a cache, but for simplicity now, we'll fetch when needed.
    private storage: ILibraryStorage; // Use the new interface
    private parser: SparqlQueryParser; // Add parser instance

    constructor(storage: ILibraryStorage) { // Update constructor parameter type
        this.storage = storage;
        this.parser = new SparqlQueryParser(); // Instantiate the parser
    }

    /**
     * Optional: Pre-load or check storage status if needed during initialization.
     */
    async initialize(): Promise<void> {
        try {
            await this.storage.getAllLibraries(); // Example: Trigger initial load/check
            console.log('LibraryManager initialized. Storage connection verified.');
        } catch (error) {
            console.error('Failed to initialize LibraryManager or connect to storage:', error);
            throw new Error(`Failed to initialize LibraryManager: ${error instanceof Error ? error.message : error}`);
        }
    }

     /**
     * Creates a new library using the storage layer.
     */
    async createLibrary(name: string, description?: string): Promise<Library> {
        return this.storage.addLibrary({ name, description });
    }

    /**
     * Returns all libraries by fetching from the storage layer.
     */
    async getLibraries(): Promise<Library[]> {
        return this.storage.getAllLibraries();
    }

     /**
     * Gets a specific library by ID from the storage layer.
     */
    async getLibraryById(id: string): Promise<Library | null> {
        return this.storage.getLibraryById(id);
    }

    /**
     * Updates library metadata (name, description).
     */
    async updateLibrary(id: string, data: Partial<Omit<Library, 'id' | 'queries'>>): Promise<Library | null> {
        return this.storage.updateLibrary(id, data);
    }


    // --- Query Management Methods (Delegating to Storage) ---

    /**
     * Adds a query to the specified library, detecting outputs automatically.
     * @param libraryId The ID of the target library.
     * @param queryData Data for the new query (name, description, query text).
     */
    async addQueryToLibrary(libraryId: string, queryData: Omit<StoredQuery, 'id' | 'createdAt' | 'updatedAt' | 'variables' | 'outputs'>): Promise<StoredQuery> {
        let detectedOutputs: string[] = [];
        // let detectedVariables: VariableGroup[] = []; // For future variable detection refinement

        try {
            // detectedVariables = this.parser.detectVariables(queryData.query);
            detectedOutputs = this.parser.detectQueryOutputs(queryData.query);
        } catch (parseError) {
            console.error(`Failed to parse query during add: ${queryData.query}`, parseError);
            throw new Error(`Invalid SPARQL query provided: ${parseError instanceof Error ? parseError.message : parseError}`);
        }

        // Construct the full query object including detected outputs
        const fullQueryData: Omit<StoredQuery, 'id' | 'createdAt' | 'updatedAt'> = {
            ...queryData,
            // variables: detectedVariables,
            outputs: detectedOutputs
        };

        // Delegate to storage with the complete data
        return this.storage.addQuery(libraryId, fullQueryData);
    }

    /**
     * Updates a query. If the query text is updated, outputs are re-detected.
     * @param queryId The ID of the query to update.
     * @param updatedQueryData Object containing fields to update.
     */
    async updateQuery(queryId: string, updatedQueryData: Partial<Omit<StoredQuery, 'id' | 'libraryId' | 'createdAt' | 'updatedAt'>>): Promise<StoredQuery | null> {
        // Create a mutable copy to potentially add detected fields
        const dataToUpdate: Partial<StoredQuery> = { ...updatedQueryData };

        // If the query string itself is being updated, re-detect outputs
        if (dataToUpdate.query) {
            try {
                // dataToUpdate.variables = this.parser.detectVariables(dataToUpdate.query); // For future variable detection
                dataToUpdate.outputs = this.parser.detectQueryOutputs(dataToUpdate.query);
            } catch (parseError) {
                console.error(`Failed to parse query during update: ${dataToUpdate.query}`, parseError);
                throw new Error(`Invalid SPARQL query provided for update: ${parseError instanceof Error ? parseError.message : parseError}`);
            }
        }
        // Note: If 'query' is not in updatedQueryData, 'outputs' will not be recalculated.
        // If 'outputs' is explicitly provided in updatedQueryData, it will overwrite any detected value.

        // Delegate to storage with potentially updated outputs
        // The storage layer needs to handle Partial<StoredQuery> correctly
        return this.storage.updateQuery(queryId, dataToUpdate);
    }

    /**
     * Removes a query using the storage layer.
     */
    async removeQuery(queryId: string): Promise<boolean> {
        return this.storage.deleteQuery(queryId);
    }

    /**
     * Gets all queries for a specific library from the storage layer.
     */
    async getQueriesByLibrary(libraryId: string): Promise<StoredQuery[]> {
        return this.storage.getQueriesByLibraryId(libraryId);
    }

    /**
     * Gets a specific query by its ID from the storage layer.
     */
    async getQueryById(queryId: string): Promise<StoredQuery | null> {
        return this.storage.getQueryById(queryId);
    }


    // --- Library Deletion (Delegating to Storage) ---

    /**
     * Deletes a library using the storage layer.
     */
    async deleteLibrary(id: string): Promise<boolean> {
        return this.storage.deleteLibrary(id);
    }
}
