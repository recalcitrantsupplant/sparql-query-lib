import Fastify, { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import { registerQueryRoutes } from '../../src/server/query';
// Removed: import { QueryManager } from '../../src/server/queryManager';
import { LibraryManager } from '../../src/server/libraryManager';
// Updated imports for storage
import { FileSystemLibraryStorage, ILibraryStorage } from '../../src/server/libraryStorage';
import { StoredQuery, VariableGroup, Library } from '../../src/types'; // Import necessary types

// Define interfaces used in tests
interface QuerySummary {
  id: string;
  name: string;
  description?: string;
  query: string;
  variables?: string[]; // Assuming variables might be part of summary
}

interface ListQueriesResponse {
    data: QuerySummary[];
    metadata: {
        total: number;
        page: number;
        limit: number;
    };
}

// Paths for temporary test storage files
const TEST_QUERY_STORAGE_PATH = path.join(__dirname, 'test-queries-inject.json');
const TEST_LIB_STORAGE_PATH = path.join(__dirname, 'test-libraries-for-queries.json'); // Separate lib storage for query tests

// Paths for empty state files
const EMPTY_QUERIES_PATH = path.join(__dirname, 'empty-queries.json'); // Created earlier
const EMPTY_LIBS_PATH = path.join(__dirname, 'empty-libraries.json'); // From library tests

// --- Test Setup: Need a default library for most query operations ---
const DEFAULT_TEST_LIBRARY_NAME = 'query-test-lib';
let defaultTestLibraryId: string;
// --------------------------------------------------------------------

// Helper function to build the Fastify app for testing
// Removed QueryManager from return type
async function buildTestApp(): Promise<{ app: FastifyInstance, libraryManager: LibraryManager, defaultLibraryId: string }> {
  const app = Fastify({ logger: false });

  // Use temporary copies for test isolation
  // Note: We only need one storage file now as FileSystemLibraryStorage handles both
  fs.copyFileSync(EMPTY_LIBS_PATH, TEST_LIB_STORAGE_PATH);

  // --- Create test-specific storage instances ---
  // Use the new interface and implementation
  const libraryStorage: ILibraryStorage = new FileSystemLibraryStorage(TEST_LIB_STORAGE_PATH);
  // ---------------------------------------------

  // Instantiate Managers with test storage
  const libraryManager = new LibraryManager(libraryStorage);
  await libraryManager.initialize(); // Initialize manager (verifies storage)

  // Removed: QueryManager instantiation

  // --- Create a default library for tests ---
  // This needs to happen *after* manager initialization
  let createdDefaultLibrary: Library;
  try {
      createdDefaultLibrary = await libraryManager.createLibrary(DEFAULT_TEST_LIBRARY_NAME, 'Default library for query tests');
  } catch (error: any) {
      // Handle potential race condition or existing library if tests run concurrently/fail uncleanly
      if (error.message?.includes('already exists')) {
          console.warn(`Test library "${DEFAULT_TEST_LIBRARY_NAME}" already existed. Fetching it.`);
          const libs = await libraryManager.getLibraries();
          const existingLib = libs.find(l => l.name === DEFAULT_TEST_LIBRARY_NAME);
          if (!existingLib) throw new Error("Failed to create or find default test library.");
          createdDefaultLibrary = existingLib;
      } else {
          throw error; // Re-throw other errors
      }
  }
  const defaultLibraryId = createdDefaultLibrary.id;
  // -----------------------------------------

  // Decorate the app instance
  app.decorate('libraryManager', libraryManager); // Keep decoration if routes use it
  // Removed: app.decorate('queryManager', queryManager);

  // Register only the query routes
  await app.register(registerQueryRoutes);

  await app.ready(); // Ensure all plugins are loaded

  // Return the app instance and other relevant objects
  // Removed queryManager from return object
  return { app, libraryManager, defaultLibraryId };
}


describe('Query Routes Tests (Inject)', () => {
  let app: FastifyInstance;
  let libraryManager: LibraryManager; // To access manager directly if needed
  // defaultTestLibraryId is now created within buildTestApp

  beforeEach(async () => {
    // Build a fresh app instance and get managers/default ID for each test
    const buildResult = await buildTestApp();
    app = buildResult.app;
    libraryManager = buildResult.libraryManager; // Get manager instance
    defaultTestLibraryId = buildResult.defaultLibraryId; // Get the ID created in setup
  });

  afterEach(async () => {
    // Close the Fastify instance
    await app.close();
    // Clean up the temporary storage files
    try {
      // Only need to clean up the single library storage file now
      // fs.unlinkSync(TEST_QUERY_STORAGE_PATH); // Removed
      fs.unlinkSync(TEST_LIB_STORAGE_PATH);
    } catch (err) {
      // Ignore errors
    }
  });

  // --- Test cases ---

  it('should create a query in the specified library', async () => {
    // No need to set current library
    const queryName = 'testQueryCreate';
    const queryText = 'SELECT * WHERE { ?s ?p ?o } LIMIT 10';
    const response = await app.inject({
      method: 'POST',
      url: '/queries',
      payload: {
        libraryId: defaultTestLibraryId, // Pass library ID in payload
        name: queryName,
        query: queryText,
        description: 'A test query'
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body) as StoredQuery;
    expect(body).toHaveProperty('id');
    expect(typeof body.id).toBe('string');
    expect(body.name).toBe(queryName);
    expect(body.query).toBe(queryText);
    expect(body.description).toBe('A test query');
    // Cannot easily verify libraryId without fetching the library again
  });

  // REMOVED: 'should not create a query if no library is active' test case

  it('should list queries for the specified library', async () => {
    // No need to set current library
    // First, create a query in the target library
    const queryName = 'testQueryList';
    const queryText = 'SELECT ?s WHERE { ?s ?p ?o }';
    const createResponse = await app.inject({
      method: 'POST',
      url: '/queries',
      payload: { libraryId: defaultTestLibraryId, name: queryName, query: queryText }, // Specify library
    });
    expect(createResponse.statusCode).toBe(201);
    const createdQuery = JSON.parse(createResponse.body) as StoredQuery;

    // Then, list the queries for that library
    const listResponse = await app.inject({
      method: 'GET',
      url: `/queries?libraryId=${defaultTestLibraryId}`, // Pass libraryId as query param
    });

    expect(listResponse.statusCode).toBe(200);
    const body = JSON.parse(listResponse.body) as ListQueriesResponse;

    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('metadata');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.metadata.total).toBeGreaterThanOrEqual(1);

    expect(body.data.some(q => q.id === createdQuery.id && q.name === queryName && q.query === queryText)).toBe(true);
  });

  it('should return an empty data array when listing queries for a library with no queries', async () => {
    // No need to set current library
    // Create a new empty library for this test
    const emptyLib = await libraryManager.createLibrary('empty-test-lib');

    const listResponse = await app.inject({
      method: 'GET',
      url: `/queries?libraryId=${emptyLib.id}`, // Use the new empty library's ID
    });

    expect(listResponse.statusCode).toBe(200);
    const body = JSON.parse(listResponse.body) as ListQueriesResponse;
    expect(body.data).toEqual([]);
    expect(body.metadata.total).toBe(0);
  });


  it('should get a specific query by ID (assuming ID is globally unique)', async () => {
    // No need to set current library
    // First, create a query
    const queryName = 'testGetQuery';
    const queryText = 'SELECT DISTINCT ?p WHERE { ?s ?p ?o }';
    const createResponse = await app.inject({
      method: 'POST',
      url: '/queries',
      payload: { libraryId: defaultTestLibraryId, name: queryName, query: queryText }, // Specify library
    });
    expect(createResponse.statusCode).toBe(201);
    const createdQuery = JSON.parse(createResponse.body) as StoredQuery;

    // Then, get the query by its ID (route doesn't need libraryId if queryId is unique)
    const getResponse = await app.inject({
      method: 'GET',
      url: `/queries/${createdQuery.id}`,
    });

    expect(getResponse.statusCode).toBe(200);
    const body = JSON.parse(getResponse.body) as StoredQuery;
    expect(body.id).toBe(createdQuery.id);
    expect(body.name).toBe(queryName);
    expect(body.query).toBe(queryText);
  });

  it('should return 404 when getting a non-existent query ID', async () => {
    // No need to set current library
    const getResponse = await app.inject({
      method: 'GET',
      url: '/queries/non-existent-query-id',
    });
    expect(getResponse.statusCode).toBe(404);
  });


  it('should update a query (assuming ID is globally unique)', async () => {
    // No need to set current library
    // First, create a query
    const originalName = 'queryToUpdate';
    const originalQuery = 'SELECT * WHERE { ?s ?p ?o }';
    const createResponse = await app.inject({
      method: 'POST',
      url: '/queries',
      payload: { libraryId: defaultTestLibraryId, name: originalName, query: originalQuery }, // Specify library
    });
    expect(createResponse.statusCode).toBe(201);
    const createdQuery = JSON.parse(createResponse.body) as StoredQuery;

    // Then, update the query (route doesn't need libraryId if queryId is unique)
    const updatedName = 'queryWasUpdated';
    const updatedQueryText = 'PREFIX ex: <http://example.org/> SELECT (COUNT(?s) AS ?count) WHERE { ?s ex:p ?o }';
    const updatedDescription = 'Now with description';
    const updateResponse = await app.inject({
      method: 'PUT',
      url: `/queries/${createdQuery.id}`,
      payload: {
        // No libraryId needed in payload if queryId is unique and manager handles finding it
        name: updatedName,
        query: updatedQueryText,
        description: updatedDescription
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    const updatedBody = JSON.parse(updateResponse.body) as StoredQuery;
    expect(updatedBody.id).toBe(createdQuery.id);
    expect(updatedBody.name).toBe(updatedName);
    expect(updatedBody.query).toBe(updatedQueryText);
    expect(updatedBody.description).toBe(updatedDescription);

    // Optional: Verify update persists by getting again
    const getResponse = await app.inject({ method: 'GET', url: `/queries/${createdQuery.id}` });
    const getBody = JSON.parse(getResponse.body) as StoredQuery;
    expect(getBody.name).toBe(updatedName);
    expect(getBody.query).toBe(updatedQueryText);
   });

   it('should return 404 when trying to update a non-existent query', async () => { // Expect 404 if manager returns null
        // No need to set current library
        const updateResponse = await app.inject({
            method: 'PUT',
            url: '/queries/non-existent-for-update',
            payload: { name: 'update-fail', query: 'SELECT 1' },
        });
        // Assuming the route handler checks the result of manager.updateQuery
        // and returns 404 if it's null (query not found).
        expect(updateResponse.statusCode).toBe(404);
        // const body = JSON.parse(updateResponse.body);
        // expect(body.error).toMatch(/Query not found/); // Or similar
    });


  it('should delete a query (assuming ID is globally unique)', async () => {
    // No need to set current library
    // First, create a query
     const queryNameToDelete = 'deleteMeQuery';
    const createResponse = await app.inject({
      method: 'POST',
      url: '/queries',
      payload: { libraryId: defaultTestLibraryId, name: queryNameToDelete, query: 'SELECT 1' }, // Specify library
    });
    expect(createResponse.statusCode).toBe(201);
    const createdQuery = JSON.parse(createResponse.body) as StoredQuery;

    // Then, delete the query (route doesn't need libraryId if queryId is unique)
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/queries/${createdQuery.id}`,
    });

    expect(deleteResponse.statusCode).toBe(204);

    // Verify that the query is no longer found
    const getResponse = await app.inject({
      method: 'GET',
      url: `/queries/${createdQuery.id}`,
    });
    expect(getResponse.statusCode).toBe(404);

     // Verify it's not in the list for that library anymore
    const listResponse = await app.inject({ method: 'GET', url: `/queries?libraryId=${defaultTestLibraryId}` });
    const listBody = JSON.parse(listResponse.body) as ListQueriesResponse;
    expect(listBody.data.some(q => q.id === createdQuery.id)).toBe(false);
  });

  it('should return 404 when deleting a non-existent query', async () => {
    // No need to set current library
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: '/queries/non-existent-to-delete',
    });
    // Assuming route handler checks manager.deleteQuery result
    expect(deleteResponse.statusCode).toBe(404);
  });


  it('should list variables in a query (assuming ID is globally unique)', async () => {
    // No need to set current library
    // QueryManager extracts variables on create/update. Use valid SPARQL.
    const queryTextWithVars = `
      PREFIX schema: <http://schema.org/>
      PREFIX ex: <http://example.com/>
      SELECT ?name ?age
      WHERE {
      VALUES ?minAge { UNDEF }
      VALUES ?age { UNDEF }
      VALUES ?name { UNDEF }
        ?person a schema:Person ;
                schema:name ?name ;
                ex:age ?age .
        FILTER(?age > ?minAge)
      }
    `;
    const createResponse = await app.inject({
      method: 'POST',
      url: '/queries',
      payload: { libraryId: defaultTestLibraryId, name: 'queryWithVars', query: queryTextWithVars }, // Specify library
    });
    expect(createResponse.statusCode).toBe(201);
    const createdQuery = JSON.parse(createResponse.body) as StoredQuery;

    // Then, list the variables
    // Then, list the variables (route doesn't need libraryId if queryId is unique)
    const variablesResponse = await app.inject({
      method: 'GET',
      url: `/queries/${createdQuery.id}/variables`,
    });

    expect(variablesResponse.statusCode).toBe(200);
    const variablesData = JSON.parse(variablesResponse.body) as VariableGroup[]; // Correct type
    // QueryManager should extract these (case-sensitive)
    // Check that the received array contains objects with the expected variable names as keys in their 'vars' property
    const receivedVarNames = variablesData.flatMap(group => Object.keys(group.vars));
    expect(receivedVarNames).toEqual(expect.arrayContaining(['name', 'age', 'minAge']));
    expect(receivedVarNames.length).toBe(3); // Ensure no extras like 'person'
  });

  it('should return empty array for variables if query has none', async () => {
     // No need to set current library
     const queryTextNoVars = 'SELECT * WHERE { <ex:s> <ex:p> <ex:o> }';
    const createResponse = await app.inject({
      method: 'POST',
      url: '/queries',
      payload: { libraryId: defaultTestLibraryId, name: 'queryNoVars', query: queryTextNoVars }, // Specify library
    });
     expect(createResponse.statusCode).toBe(201);
    const createdQuery = JSON.parse(createResponse.body) as StoredQuery;

    // Get variables (route doesn't need libraryId if queryId is unique)
    const variablesResponse = await app.inject({
      method: 'GET',
      url: `/queries/${createdQuery.id}/variables`,
    });

    expect(variablesResponse.statusCode).toBe(200);
    const variablesData = JSON.parse(variablesResponse.body);
    expect(variablesData).toEqual([]);
  });

  it('should return 404 when listing variables for non-existent query', async () => {
     // No need to set current library
     const variablesResponse = await app.inject({
      method: 'GET',
      url: '/queries/non-existent-vars/variables',
    });
    expect(variablesResponse.statusCode).toBe(404);
  });


  // TODO: Test for execute query requires mocking 'executeQuery' or setting up a backend/storage for it
  it.todo('should execute a query with variables');
  /*
  it('should attempt to execute a query (mocked backend)', async () => {
    // First, create a query
    const createResponse = await app.inject({
      method: 'POST',
      url: '/queries',
      payload: { name: 'testExecQuery', query: 'SELECT ?s WHERE { ?s a ?type }' },
    });
    expect(createResponse.statusCode).toBe(201);
    const createdQuery = JSON.parse(createResponse.body) as StoredQuery;

    // Mock the backend state or executeQuery function if possible
    // For now, just test the route logic up to the point of calling executeQuery

    // Set a dummy backend (assuming backend setup is outside this test's scope)
    // This part is tricky without modifying the main code or using advanced mocking
    // backendState.currentBackend = 'dummy-backend-id';
    // backendState.backends.push({ id: 'dummy-backend-id', url: 'http://dummy.com/sparql', name: 'Dummy' });

    const executeResponse = await app.inject({
      method: 'POST',
      url: `/queries/${createdQuery.id}/execute`,
      payload: { type: '<http://example.org/Person>' }, // Example variables
    });

    // Without mocking, this will likely fail trying to reach a backend
    // Expect 500 if no backend is configured or executeQuery fails
    expect(executeResponse.statusCode).toBe(500); // Or 200 if mocking works
    // const executeData = JSON.parse(executeResponse.body);
    // expect(executeData).toHaveProperty('results'); // Or error property
  });
  */

});
