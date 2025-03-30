import { randomUUID } from 'crypto';
import { StoredQuery, VariableGroup, VariableRestrictions } from '../types';
import { IQueryStorage } from './queryStorage';
import { SparqlQueryParser } from '../lib/parser';

export class QueryManager {
    private queries: StoredQuery[] = [];
    private storage: IQueryStorage;
    private parser = new SparqlQueryParser(); // Reusable parser instance

    constructor(storage: IQueryStorage) {
        this.storage = storage;
    }

    /**
     * Loads initial queries from storage into the in-memory cache.
     * Should be called once during application startup.
     */
    async initialize(): Promise<void> {
        try {
            this.queries = await this.storage.loadQueries();
            console.log(`QueryManager initialized with ${this.queries.length} queries.`);
        } catch (error) {
            console.error('Failed to initialize QueryManager:', error);
            // Depending on requirements, might want to throw or start with empty
            this.queries = [];
        }
    }

    /**
     * Retrieves all queries from the in-memory cache.
     */
    getAllQueries(): StoredQuery[] {
        // Return a shallow copy to prevent external modification of the cache
        return [...this.queries];
    }

    /**
     * Finds a query by its ID in the in-memory cache.
     * @param id The ID of the query to find.
     */
    getQueryById(id: string): StoredQuery | undefined {
        return this.queries.find(q => q.id === id);
    }

    /**
     * Creates a new query, detects its variables, adds it to the cache, and persists the changes.
     * @param data Object containing name, description (optional), and query string.
     */
    async createQuery(data: { name: string; description?: string; query: string }): Promise<StoredQuery> {
        const { name, description, query } = data;
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

        // Update cache first
        this.queries.push(newQuery);

        // Then persist
        try {
            await this.storage.saveQueries(this.queries);
            return newQuery;
        } catch (error) {
            // Rollback cache change on persistence failure
            this.queries = this.queries.filter(q => q.id !== id);
            console.error(`Failed to save new query ${id}:`, error);
            throw new Error(`Failed to save query: ${error instanceof Error ? error.message : error}`);
        }
    }

    /**
     * Updates an existing query, detects variables, updates the cache, and persists changes.
     * @param id The ID of the query to update.
     * @param data Object containing name, description (optional), and query string.
     */
    async updateQuery(id: string, data: { name: string; description?: string; query: string }): Promise<StoredQuery | null> {
        const { name, description, query } = data;
        const existingQueryIndex = this.queries.findIndex(q => q.id === id);

        if (existingQueryIndex === -1) {
            return null; // Query not found
        }

        const originalQuery = this.queries[existingQueryIndex];
        const detectedVariables = this.detectQueryVariables(query, name, originalQuery.variables);

        const updatedQuery: StoredQuery = {
            ...originalQuery, // Keep original createdAt
            name,
            description,
            query,
            variables: detectedVariables,
            updatedAt: new Date(),
        };

        // Create a new array for the updated state
        const updatedQueries = [...this.queries];
        updatedQueries[existingQueryIndex] = updatedQuery;

        // Try to persist first
        try {
            await this.storage.saveQueries(updatedQueries);
            // If successful, update the in-memory cache
            this.queries = updatedQueries;
            return updatedQuery;
        } catch (error) {
            console.error(`Failed to save updated query ${id}:`, error);
            // Don't update cache if persistence failed
            throw new Error(`Failed to update query: ${error instanceof Error ? error.message : error}`);
        }
    }

    /**
     * Deletes a query from the cache and persists the changes.
     * @param id The ID of the query to delete.
     */
    async deleteQuery(id: string): Promise<boolean> {
        const initialLength = this.queries.length;
        const updatedQueries = this.queries.filter(q => q.id !== id);

        if (updatedQueries.length === initialLength) {
            return false; // Query not found
        }

        // Try to persist first
        try {
            await this.storage.saveQueries(updatedQueries);
            // If successful, update the in-memory cache
            this.queries = updatedQueries;
            return true;
        } catch (error) {
            console.error(`Failed to save after deleting query ${id}:`, error);
            // Don't update cache if persistence failed
            throw new Error(`Failed to delete query: ${error instanceof Error ? error.message : error}`);
        }
    }

    /**
     * Helper to generate a short unique ID.
     */
    private generateId(): string {
        return randomUUID().substring(0, 8);
    }

    /**
     * Helper to detect variables in a SPARQL query string.
     * @param query The SPARQL query string.
     * @param queryName For logging purposes.
     * @param fallbackVariables Variables to return if detection fails.
     */
    private detectQueryVariables(query: string, queryName: string, fallbackVariables: VariableGroup[] = []): VariableGroup[] {
        try {
            const variableGroups = this.parser.detectVariables(query);
            return variableGroups.map(group => {
                const vars: { [variableName: string]: VariableRestrictions } = {};
                group.forEach(varName => {
                    vars[varName] = { type: ['uri', 'literal'] }; // Default restrictions
                });
                return { vars };
            });
        } catch (error) {
            console.error(`Error detecting variables for query "${queryName}":`, error);
            // Return fallback (empty or existing) if detection fails
            return fallbackVariables;
        }
    }
}
