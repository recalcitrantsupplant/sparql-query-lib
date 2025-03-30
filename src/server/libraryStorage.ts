import * as fs from 'fs/promises';
import path from 'path'; // Keep path for resolving file location
import { Library, StoredQuery, VariableRestrictions } from '../types';
import { SparqlQueryParser } from '../lib/parser';
import { randomUUID } from 'crypto'; // Needed for generating IDs if adding items

// Define the interface for library and query storage operations
export interface ILibraryStorage {
    // Library operations
    getAllLibraries(): Promise<Library[]>;
    getLibraryById(id: string): Promise<Library | null>;
    addLibrary(libraryData: Omit<Library, 'id' | 'queries'>): Promise<Library>; // Input data, return full Library
    updateLibrary(id: string, libraryData: Partial<Omit<Library, 'id' | 'queries'>>): Promise<Library | null>; // Update specific fields
    deleteLibrary(id: string): Promise<boolean>; // Return true if deleted

    // Query operations
    getQueriesByLibraryId(libraryId: string): Promise<StoredQuery[]>;
    getQueryById(queryId: string): Promise<StoredQuery | null>; // Search across all libraries
    addQuery(libraryId: string, queryData: Omit<StoredQuery, 'id' | 'createdAt' | 'updatedAt'>): Promise<StoredQuery>; // Input data, return full StoredQuery
    updateQuery(queryId: string, queryData: Partial<Omit<StoredQuery, 'id' | 'libraryId'>>): Promise<StoredQuery | null>; // Update specific fields
    deleteQuery(queryId: string): Promise<boolean>; // Return true if deleted
}

/**
 * Filesystem-based implementation of ILibraryStorage using a single JSON file.
 * Note: This implementation loads and saves the entire dataset for most operations,
 * which is inefficient for large datasets but maintains the original persistence approach
 * while adhering to the new granular interface.
 */
export class FileSystemLibraryStorage implements ILibraryStorage {
    private filePath: string;
    private parser: SparqlQueryParser; // Parser for variable detection

    constructor(filePath: string) {
        this.filePath = filePath;
        this.parser = new SparqlQueryParser();
        console.log(`FileSystemLibraryStorage initialized with file path: ${this.filePath}`);
    }

    // --- Private Helper Methods ---

    private async loadAll(): Promise<Library[]> {
        try {
            const data = await fs.readFile(this.filePath, 'utf8');
            let libraries: Library[] = JSON.parse(data, (key, value) => {
                 // Reviver function to parse date strings back into Date objects
                 if ((key === 'createdAt' || key === 'updatedAt') && typeof value === 'string') {
                    const date = new Date(value);
                    if (!isNaN(date.getTime())) {
                        return date;
                    }
                }
                return value;
            });
            // Removed log

            // Ensure variables are present (moved from old loadQueries)
            for (const library of libraries) {
                for (const query of library.queries) {
                    this.ensureQueryVariables(query); // Use helper
                }
            }
            return libraries;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                console.warn(`${this.filePath} not found. Returning empty library list.`);
                return [];
            }
            console.error(`Error reading or parsing ${this.filePath}:`, error);
            if (error instanceof SyntaxError) {
                console.error(`Invalid JSON in ${this.filePath}. Returning empty list.`);
                return [];
            }
            throw error; // Re-throw other errors
        }
    }

    private async saveAll(libraries: Library[]): Promise<void> {
        const backupFilePath = `${this.filePath}.backup`;
        try {
             // Create a backup
            try {
                await fs.copyFile(this.filePath, backupFilePath);
            } catch (backupError: any) {
                if (backupError.code !== 'ENOENT') { // Ignore if original file doesn't exist yet
                    console.warn(`Could not create backup file: ${backupError.message}`);
                }
            }

            // Convert Date objects to ISO strings before stringifying
            const dataToSave = JSON.stringify(libraries, (key, value) => {
                if (value instanceof Date) {
                    return value.toISOString();
                }
                return value;
            }, 2); // Pretty print JSON

            await fs.writeFile(this.filePath, dataToSave, 'utf8');

            // Optionally remove backup after successful save
            try {
                await fs.unlink(backupFilePath);
            } catch (unlinkError: any) {
                 // Ignore if backup didn't exist or couldn't be removed
            }

        } catch (error) {
            console.error(`Error writing ${this.filePath}:`, error);
             // Attempt to restore from backup if save failed
            try {
                await fs.copyFile(backupFilePath, this.filePath);
                console.log(`Restored from backup ${backupFilePath}`);
            } catch (restoreError: any) {
                console.error(`Failed to restore from backup: ${restoreError.message}`);
            }
            throw error; // Re-throw to indicate save failed
        }
    }

     // Helper to parse and detect variables if missing
    private ensureQueryVariables(query: StoredQuery): void {
        if (!query.variables || query.variables.length === 0) {
            try {
                // We don't strictly need the parsedQuery result here, just detection
                this.parser.parseQuery(query.query);
                const detectedVariables = this.parser.detectVariables(query.query);
                query.variables = detectedVariables.map(group => {
                    const vars: { [variableName: string]: VariableRestrictions } = {};
                    group.forEach(name => {
                        vars[name] = { type: ['uri', 'literal'] }; // Default restrictions
                    });
                    return { vars };
                });
            } catch (error) {
                console.error(`Error parsing/detecting variables for query ${query.id} during load:`, error);
                query.variables = []; // Ensure it's an empty array on error
            }
        }
    }


    // --- ILibraryStorage Implementation ---

    async getAllLibraries(): Promise<Library[]> {
        // Load all and return (already includes variable parsing)
        return await this.loadAll();
    }

    async getLibraryById(id: string): Promise<Library | null> {
        const libraries = await this.loadAll();
        return libraries.find(lib => lib.id === id) || null;
    }

    async addLibrary(libraryData: Omit<Library, 'id' | 'queries'>): Promise<Library> {
        const libraries = await this.loadAll();
        if (libraries.some(lib => lib.name === libraryData.name)) {
            throw new Error(`Library with name "${libraryData.name}" already exists.`);
        }
        const newLibrary: Library = {
            ...libraryData,
            id: randomUUID().substring(0, 8),
            queries: [],
        };
        // Removed previous log
        libraries.push(newLibrary);
        await this.saveAll(libraries);
        return newLibrary;
    }

    async updateLibrary(id: string, libraryData: Partial<Omit<Library, 'id' | 'queries'>>): Promise<Library | null> {
        const libraries = await this.loadAll();
        const libraryIndex = libraries.findIndex(lib => lib.id === id);
        if (libraryIndex === -1) {
            return null;
        }
        // Check for name conflict if name is being changed
        if (libraryData.name && libraryData.name !== libraries[libraryIndex].name && libraries.some(lib => lib.name === libraryData.name && lib.id !== id)) {
             throw new Error(`Another library with name "${libraryData.name}" already exists.`);
        }

        // Update specified fields (excluding id and queries)
        libraries[libraryIndex] = { ...libraries[libraryIndex], ...libraryData };
        await this.saveAll(libraries);
        return libraries[libraryIndex];
    }

    async deleteLibrary(id: string): Promise<boolean> {
        let libraries = await this.loadAll();
        const initialLength = libraries.length;
        libraries = libraries.filter(lib => lib.id !== id);
        if (libraries.length < initialLength) {
            await this.saveAll(libraries);
            return true;
        }
        return false;
    }

    async getQueriesByLibraryId(libraryId: string): Promise<StoredQuery[]> {
        const library = await this.getLibraryById(libraryId);
        return library ? library.queries : [];
    }

    async getQueryById(queryId: string): Promise<StoredQuery | null> {
        const libraries = await this.loadAll();
        for (const library of libraries) {
            const query = library.queries.find(q => q.id === queryId);
            if (query) {
                return query;
            }
        }
        return null;
    }

    async addQuery(libraryId: string, queryData: Omit<StoredQuery, 'id' | 'createdAt' | 'updatedAt'>): Promise<StoredQuery> {
        const libraries = await this.loadAll();
        const libraryIndex = libraries.findIndex(lib => lib.id === libraryId);
        if (libraryIndex === -1) {
            throw new Error(`Library with ID "${libraryId}" not found.`);
        }

        const now = new Date();
        const newQuery: StoredQuery = {
            ...queryData,
            id: randomUUID().substring(0, 8),
            createdAt: now,
            updatedAt: now,
            variables: queryData.variables // Use provided variables or detect if needed
        };

        // Ensure variables are populated if not provided
        this.ensureQueryVariables(newQuery);

        libraries[libraryIndex].queries.push(newQuery);
        await this.saveAll(libraries);
        return newQuery;
    }

    async updateQuery(queryId: string, queryData: Partial<Omit<StoredQuery, 'id' | 'libraryId'>>): Promise<StoredQuery | null> {
        const libraries = await this.loadAll();
        let foundQuery: StoredQuery | null = null;
        let libraryIndex = -1;
        let queryIndex = -1;

        for (let i = 0; i < libraries.length; i++) {
            const qIndex = libraries[i].queries.findIndex(q => q.id === queryId);
            if (qIndex !== -1) {
                libraryIndex = i;
                queryIndex = qIndex;
                foundQuery = libraries[i].queries[qIndex];
                break;
            }
        }

        if (!foundQuery || libraryIndex === -1 || queryIndex === -1) {
            return null; // Query not found
        }

        // Update fields, set new updatedAt, potentially re-detect variables if query text changed
        const updatedQuery = {
            ...foundQuery,
            ...queryData,
            updatedAt: new Date(),
        };

        // If the query text changed, re-detect variables
        if (queryData.query && queryData.query !== foundQuery.query) {
             this.ensureQueryVariables(updatedQuery); // Re-run detection/parsing
        }


        libraries[libraryIndex].queries[queryIndex] = updatedQuery;
        await this.saveAll(libraries);
        return updatedQuery;
    }

    async deleteQuery(queryId: string): Promise<boolean> {
        const libraries = await this.loadAll();
        let queryDeleted = false;

        for (let i = 0; i < libraries.length; i++) {
            const initialQueryCount = libraries[i].queries.length;
            libraries[i].queries = libraries[i].queries.filter(q => q.id !== queryId);
            if (libraries[i].queries.length < initialQueryCount) {
                queryDeleted = true;
                break; // Assume query IDs are unique across libraries for now
            }
        }

        if (queryDeleted) {
            await this.saveAll(libraries);
            return true;
        }
        return false;
    }
}
