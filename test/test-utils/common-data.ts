import { createStoredQuery, CreateStoredQueryInput } from '../../src/lib/factories'; // Import factory and input type

// --- Common Test Data ---
// Define common query data accessible to multiple test files
export const commonInput: CreateStoredQueryInput = {
    name: 'Common Query Name',
    description: 'Common Desc',
    query: 'SELECT ?s WHERE { ?s a <urn:type:CommonThing> }',
    libraryId: 'urn:test-library:common' // Added libraryId for testing
};
export const commonExistingQuery = createStoredQuery(commonInput);
export const commonQueryId = commonExistingQuery['@id'];

// Throw an error during test setup if the factory fails unexpectedly
if (!commonQueryId) {
    throw new Error("Test setup failed: Factory did not generate a common ID in common-data.ts.");
}

export const commonEncodedQueryId = encodeURIComponent(commonQueryId);
