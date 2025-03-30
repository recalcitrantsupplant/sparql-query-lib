import { randomUUID } from 'crypto';
import { StoredQuery, VariableGroup, VariableRestrictions, Library } from '../types';
// No longer need IQueryStorage here
import { SparqlQueryParser } from '../lib/parser';
import { LibraryManager } from './libraryManager';

export class QueryManager {
    private libraryManager: LibraryManager;
    // Removed storage reference
    private parser = new SparqlQueryParser(); // Reusable parser instance

    // Constructor now only accepts LibraryManager
    constructor(libraryManager: LibraryManager) {
        this.libraryManager = libraryManager;
        // Removed storage assignment
    }

    /**
     * Finds a query by its ID within a specific library using LibraryManager's data.
     * @param libraryId The ID of the library containing the query.
     * @param queryId The ID of the query to find.
     */
    getQueryById(libraryId: string, queryId: string): StoredQuery | undefined {
        // Get libraries directly from the manager
        const library = this.libraryManager.getLibraries().find(lib => lib.id === libraryId);
        if (!library) {
            console.warn(`Library with ID ${libraryId} not found when getting query ${queryId}`);
            return undefined;
        }
        return library.queries.find(q => q.id === queryId);
    }

    /**
     * Prepares a new query object and delegates its addition and persistence to LibraryManager.
     * @param libraryId The ID of the library to add the query to.
     * @param data Object containing name, description (optional), and query string.
     * @returns The newly created StoredQuery object (after successful persistence via LibraryManager).
     */
    async createQuery(libraryId: string, data: { name: string; description?: string; query: string }): Promise<StoredQuery> {
        const { name, description, query } = data;

        // Check if library exists (optional, LibraryManager will throw anyway)
        // const libraryExists = this.libraryManager.getLibraries().some(lib => lib.id === libraryId);
        // if (!libraryExists) {
        //     throw new Error(`Library with ID ${libraryId} not found.`);
        // }

        const id = this.generateId();
        const now = new Date();
        const detectedVariables = this.detectQueryVariables(query, name);

        const newQuery: StoredQuery = {
            id,
            name,
            description,
            query,
            variables: detectedVariables,
            createdAt: now,
            updatedAt: now,
        };

        // Delegate addition and persistence to LibraryManager
        await this.libraryManager.addQueryToLibrary(libraryId, newQuery);

        // Return the created query object
        return newQuery;
    }

    /**
     * Prepares an updated query object and delegates its update and persistence to LibraryManager.
     * @param libraryId The ID of the library containing the query.
     * @param queryId The ID of the query to update.
     * @param data Object containing name, description (optional), and query string.
     * @returns The updated StoredQuery object (after successful persistence via LibraryManager).
     */
    async updateQuery(libraryId: string, queryId: string, data: { name: string; description?: string; query: string }): Promise<StoredQuery> {
        const { name, description, query } = data;

        // Find the existing query data first to preserve createdAt etc.
        const existingQuery = this.getQueryById(libraryId, queryId);
        if (!existingQuery) {
             throw new Error(`Query with ID ${queryId} not found in library ${libraryId} for update.`);
        }

        // TODO: Improve variable restriction preservation (future task)
        const detectedVariables = this.detectQueryVariables(query, name, existingQuery.variables);

        const updatedQueryData: StoredQuery = {
            ...existingQuery, // Keep original createdAt, id
            name,
            description,
            query,
            variables: detectedVariables,
            updatedAt: new Date(),
        };

        // Delegate update and persistence to LibraryManager
        await this.libraryManager.updateQueryInLibrary(libraryId, queryId, updatedQueryData);

        // Return the updated query data
        return updatedQueryData;
    }

    /**
     * Delegates query deletion and persistence to LibraryManager.
     * @param libraryId The ID of the library containing the query.
     * @param queryId The ID of the query to delete.
     * @returns True if the query was found and deletion persisted, false otherwise.
     */
    async deleteQuery(libraryId: string, queryId: string): Promise<boolean> {
        // Delegate deletion and persistence to LibraryManager
        return await this.libraryManager.removeQueryFromLibrary(libraryId, queryId);
    }

    /**
     * Helper to generate a short unique ID.
     */
    private generateId(): string {
        // Query IDs should be unique at least within a library. Global uniqueness is safer.
        return randomUUID().substring(0, 8);
    }

    /**
     * Helper to detect variables in a SPARQL query string.
     * Preserves existing variable definitions if detection fails.
     * @param query The SPARQL query string.
     * @param queryName For logging purposes.
     * @param existingVariables Optional existing variables to merge/preserve.
     */
    private detectQueryVariables(query: string, queryName: string, existingVariables: VariableGroup[] = []): VariableGroup[] {
        try {
            const detectedVariableNames = this.parser.detectVariables(query); // Assuming this returns string[][]

            // Basic implementation: Overwrites existing.
            // TODO: Implement merging logic to preserve restrictions (future task)
            return detectedVariableNames.map(group => {
                const vars: { [variableName: string]: VariableRestrictions } = {};
                group.forEach(varName => {
                    // Check if varName exists in existingVariables and reuse restrictions?
                    // For now, just use default
                    const existingGroup = existingVariables.find(eg => eg.vars[varName]);
                    vars[varName] = existingGroup?.vars[varName] || { type: ['uri', 'literal'] }; // Basic preservation attempt
                });
                return { vars };
            });

        } catch (error) {
            console.error(`Error detecting variables for query "${queryName}":`, error);
            // Return existing variables as fallback if detection fails
            return existingVariables;
        }
    }
}
