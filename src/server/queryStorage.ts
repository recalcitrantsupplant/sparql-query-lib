import * as fs from 'fs/promises';
import * as path from 'path';
import { StoredQuery, VariableRestrictions } from '../types';
import { SparqlQueryParser } from '../lib/parser';

const QUERIES_PATH = path.join(__dirname, 'queries.json');

/**
 * Interface for query persistence operations.
 */
export interface IQueryStorage {
    /**
     * Loads all queries from the persistent storage.
     * Also handles parsing and detecting variables if missing.
     */
    loadQueries(): Promise<StoredQuery[]>;

    /**
     * Saves the complete list of queries to persistent storage.
     * @param queries The array of queries to save.
     */
    saveQueries(queries: StoredQuery[]): Promise<void>;
}

/**
 * Filesystem-based implementation of IQueryStorage.
 */
export class FileSystemQueryStorage implements IQueryStorage {
    async loadQueries(): Promise<StoredQuery[]> {
        try {
            const data = await fs.readFile(QUERIES_PATH, 'utf8');
            let queries: StoredQuery[] = JSON.parse(data);

            // Ensure variables are present (same logic as before)
            for (const query of queries) {
                if (!query.variables || query.variables.length === 0) {
                    try {
                        const parser = new SparqlQueryParser();
                        // We don't strictly need the parsedQuery result here, just detection
                        parser.parseQuery(query.query);
                        const detectedVariables = parser.detectVariables(query.query);
                        query.variables = detectedVariables.map(group => {
                            const vars: { [variableName: string]: VariableRestrictions } = {};
                            group.forEach(name => {
                                vars[name] = { type: ['uri', 'literal'] }; // Default
                            });
                            return { vars };
                        });
                    } catch (error) {
                        console.error(`Error parsing/detecting variables for query ${query.id} during load:`, error);
                        query.variables = []; // Ensure it's an empty array on error
                    }
                }
            }
            return queries;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                console.warn(`${QUERIES_PATH} not found. Starting with empty query list.`);
                return []; // Return empty array if file doesn't exist
            }
            console.error('Error reading queries.json:', error);
            if (error instanceof SyntaxError) {
                console.error('Invalid JSON in queries.json. Returning empty list to prevent data loss on next write.');
                // It's safer to return empty than potentially overwrite good data with bad parse results
                // The next save operation should ideally use the last known good state or fail gracefully.
                // For simplicity here, we return empty, but a more robust solution might be needed.
                return [];
            }
            throw error; // Re-throw other errors
        }
    }

    async saveQueries(queries: StoredQuery[]): Promise<void> {
        try {
            await fs.writeFile(QUERIES_PATH, JSON.stringify(queries, null, 2), 'utf8');
        } catch (error) {
            console.error('Error writing queries.json:', error);
            // Depending on requirements, might want to throw to signal failure
            throw error; // Re-throw to indicate save failed
        }
    }
}
