import * as fs from 'fs/promises';
// No longer need path here unless used elsewhere
import { StoredQuery, VariableRestrictions, Library } from '../types';
import { SparqlQueryParser } from '../lib/parser';
// No longer need config here
// REMOVE: const QUERIES_PATH = config.queriesFilePath;

/**
 * Interface for query persistence operations.
 */
export interface IQueryStorage {
    /**
     * Loads all queries from the persistent storage.
     * Also handles parsing and detecting variables if missing.
     */
    loadQueries(): Promise<Library[]>;

    /**
     * Saves the complete list of queries to persistent storage.
     * @param libraries The array of libraries to save.
     */
    saveQueries(libraries: Library[]): Promise<void>;
}

/**
 * Filesystem-based implementation of IQueryStorage.
 */
export class FileSystemQueryStorage implements IQueryStorage {
    private filePath: string; // Store the path

    constructor(filePath: string) { // Accept path in constructor
        this.filePath = filePath;
    }

    async loadQueries(): Promise<Library[]> {
        try {
            const data = await fs.readFile(this.filePath, 'utf8'); // Use instance path
            let libraries: Library[] = JSON.parse(data);

            // Ensure variables are present (same logic as before)
            for (const library of libraries) {
                for (const query of library.queries) {
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
            }
            return libraries;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                console.warn(`${this.filePath} not found. Starting with empty query list.`); // Use instance path in log
                return []; // Return empty array if file doesn't exist
            }
            console.error(`Error reading ${this.filePath}:`, error); // Use instance path in log
            if (error instanceof SyntaxError) {
                console.error(`Invalid JSON in ${this.filePath}. Returning empty list to prevent data loss on next write.`); // Use instance path in log
                // It's safer to return empty than potentially overwrite good data with bad parse results
                // The next save operation should ideally use the last known good state or fail gracefully.
                // For simplicity here, we return empty, but a more robust solution might be needed.
                return [];
            }
            throw error; // Re-throw other errors
        }
    }

    async saveQueries(libraries: Library[]): Promise<void> {
        try {
            await fs.writeFile(this.filePath, JSON.stringify(libraries, null, 2), 'utf8'); // Use instance path
        } catch (error) {
            console.error(`Error writing ${this.filePath}:`, error); // Use instance path in log
            // Depending on requirements, might want to throw to signal failure
            throw error; // Re-throw to indicate save failed
        }
    }
}
