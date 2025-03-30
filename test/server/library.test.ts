import Fastify, { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import { registerLibraryRoutes } from '../../src/server/libraries';
import { LibraryManager } from '../../src/server/libraryManager';
import { FileSystemQueryStorage, IQueryStorage } from '../../src/server/queryStorage'; // Import IQueryStorage
// No longer need config here
// Define interfaces used in tests (copied from library.test.ts for clarity)
interface LibrarySummary {
  id: string;
  name: string;
}

interface CreateLibraryResponse extends LibrarySummary {}

interface GetCurrentLibraryResponse {
  currentLibraryId: string | null;
}

// Path for the temporary test storage file
const TEST_STORAGE_PATH = path.join(__dirname, 'test-libraries-inject.json');
const EMPTY_STORAGE_PATH = path.join(__dirname, 'empty-libraries.json'); // Source for clean state

// Helper function to build the Fastify app for testing
async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify();

  // Use a temporary copy for test isolation
  fs.copyFileSync(EMPTY_STORAGE_PATH, TEST_STORAGE_PATH);

  // --- Create test-specific storage instance ---
  const storage: IQueryStorage = new FileSystemQueryStorage(TEST_STORAGE_PATH);
  // ---------------------------------------------

  // Instantiate LibraryManager with the test storage
  const libraryManager = new LibraryManager(storage);
  await libraryManager.initialize(); // Initialize the manager

  // Decorate the app instance
  app.decorate('libraryManager', libraryManager);

  // Register only the library routes
  await app.register(registerLibraryRoutes);

  // Optional: Add error handlers if needed, similar to src/index.ts if relevant for these routes

  await app.ready(); // Ensure all plugins are loaded

  return app;
}


describe('Library Routes Tests (Inject)', () => {
  let app: FastifyInstance;
  // No longer need originalQueriesPath

  beforeEach(async () => {
    // Build a fresh app instance for each test
    app = await buildTestApp();
  });

  afterEach(async () => {
    // Close the Fastify instance
    await app.close();
    // Clean up the temporary storage file
    try {
      fs.unlinkSync(TEST_STORAGE_PATH);
    } catch (err) {
      // Ignore errors (e.g., file not found)
    }
  });

  // --- Test cases will go here ---

  it('should create a library', async () => {
    const libraryName = 'library-for-inject-testing';
    const response = await app.inject({
      method: 'POST',
      url: '/libraries',
      payload: { name: libraryName },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body) as CreateLibraryResponse;
    expect(body).toHaveProperty('id');
    expect(typeof body.id).toBe('string');
    expect(body.name).toBe(libraryName);
  });

  it('should not create a library with invalid data (missing name)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/libraries',
      payload: {}, // Missing name
    });
    expect(response.statusCode).toBe(400);
  });

  // TODO: Add test for creating duplicate library name (expect 409 or 500 depending on implementation)
  // it('should not create a library with a duplicate name', async () => { ... });

  it('should not set current library with invalid data (missing id)', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/libraries/current',
      payload: {}, // Missing id
    });
    expect(response.statusCode).toBe(400);
  });

  it('should not set current library with a non-existent id', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/libraries/current',
      payload: { id: 'non-existent-id' },
    });
    // Expect 400 because the manager throws "not found", which the route maps to 400
    expect(response.statusCode).toBe(400);
  });

  it('should get all libraries and include the created one', async () => {
    // First, create a library to ensure there's one to find
    const libraryName = 'find-me-library';
    const createResponse = await app.inject({
      method: 'POST',
      url: '/libraries',
      payload: { name: libraryName },
    });
    expect(createResponse.statusCode).toBe(201);
    const createdLib = JSON.parse(createResponse.body) as CreateLibraryResponse;

    // Now, get all libraries
    const getResponse = await app.inject({
      method: 'GET',
      url: '/libraries',
    });

    expect(getResponse.statusCode).toBe(200);
    const libraries = JSON.parse(getResponse.body) as LibrarySummary[];
    expect(Array.isArray(libraries)).toBe(true);
    // Verify the created library is present
    expect(libraries.some(lib => lib.id === createdLib.id && lib.name === libraryName)).toBe(true);
  });

  it('should set and get the current library', async () => {
    // --- Test Setup: Create a dedicated library for this test ---
    const testLibName = `set-get-test-inject-${Date.now()}`;
    const createResponse = await app.inject({
      method: 'POST',
      url: '/libraries',
      payload: { name: testLibName },
    });
    expect(createResponse.statusCode).toBe(201);
    const testLib = JSON.parse(createResponse.body) as CreateLibraryResponse;

    // --- Action 1: Set the library as current ---
    const setResponse = await app.inject({
        method: 'PUT',
        url: '/libraries/current',
        payload: { id: testLib.id },
    });
    expect(setResponse.statusCode).toBe(204); // Verify setting worked

    // --- Action 2: Get the current library ---
    const getResponse = await app.inject({
      method: 'GET',
      url: '/libraries/current',
    });
    expect(getResponse.statusCode).toBe(200);
    const getCurrentData = JSON.parse(getResponse.body) as GetCurrentLibraryResponse;

    // --- Assertion: Verify the correct library ID is returned ---
    expect(getCurrentData.currentLibraryId).toBe(testLib.id);

    // Note: Cleanup of the created library happens automatically via afterEach's file deletion
  });

  it('should get null when no library is set as current', async () => {
    // Strategy: Create temp lib, set current, delete it, check current is null

    // 1. Create temporary library
    const tempLibName = `temp-lib-inject-${Date.now()}`;
    const createResponse = await app.inject({
        method: 'POST',
        url: '/libraries',
        payload: { name: tempLibName },
    });
    expect(createResponse.statusCode).toBe(201);
    const tempLib = JSON.parse(createResponse.body) as CreateLibraryResponse;

    // 2. Set it as current
    const setResponse = await app.inject({
        method: 'PUT',
        url: '/libraries/current',
        payload: { id: tempLib.id },
    });
    expect(setResponse.statusCode).toBe(204);

    // 3. Delete it (this should trigger the manager to reset current library to null)
    const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/libraries/${tempLib.id}`,
    });
    expect(deleteResponse.statusCode).toBe(204);

    // 4. Check current library is now null
    const getResponse = await app.inject({
      method: 'GET',
      url: '/libraries/current',
    });
    expect(getResponse.statusCode).toBe(200);
    const getCurrentData = JSON.parse(getResponse.body) as GetCurrentLibraryResponse;
    expect(getCurrentData.currentLibraryId).toBe(null); // Expect null after deleting the current
  });

  it('should return 404 when deleting a non-existent library', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/libraries/invalid-id-does-not-exist',
    });
    expect(response.statusCode).toBe(404);
  });

});
