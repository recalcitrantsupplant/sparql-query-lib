import Fastify, { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import { registerLibraryRoutes } from '../../src/server/libraries';
import { LibraryManager } from '../../src/server/libraryManager';
// Updated storage imports
import { FileSystemLibraryStorage, ILibraryStorage } from '../../src/server/libraryStorage';
import { Library } from '../../src/types'; // Import Library type

// Define interfaces used in tests
interface LibrarySummary {
  id: string;
  name: string;
  description?: string; // Add description if it's part of the summary
}

interface CreateLibraryResponse extends LibrarySummary {}

// REMOVED: GetCurrentLibraryResponse interface

// Path for the temporary test storage file
const TEST_STORAGE_PATH = path.join(__dirname, 'test-libraries-inject.json');
const EMPTY_STORAGE_PATH = path.join(__dirname, 'empty-libraries.json'); // Source for clean state

// Helper function to build the Fastify app for testing
async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify();

  // Use a temporary copy for test isolation
  fs.copyFileSync(EMPTY_STORAGE_PATH, TEST_STORAGE_PATH);

  // --- Create test-specific storage instance ---
  // Use the new interface and implementation
  const storage: ILibraryStorage = new FileSystemLibraryStorage(TEST_STORAGE_PATH);
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

  it('should create a library with name and description', async () => {
    const libraryName = 'library-for-inject-testing';
    const libraryDesc = 'A test description';
    const response = await app.inject({
      method: 'POST',
      url: '/libraries',
      payload: { name: libraryName, description: libraryDesc }, // Add description
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body) as CreateLibraryResponse;
    expect(body).toHaveProperty('id');
    expect(typeof body.id).toBe('string');
    expect(body.name).toBe(libraryName);
    expect(body.description).toBe(libraryDesc); // Verify description
  });

   it('should create a library with only a name', async () => {
    const libraryName = 'library-name-only';
    const response = await app.inject({
      method: 'POST',
      url: '/libraries',
      payload: { name: libraryName },
    });
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body) as CreateLibraryResponse;
    expect(body.name).toBe(libraryName);
    expect(body.description).toBeUndefined(); // Expect description to be undefined
  });


  it('should not create a library with invalid data (missing name)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/libraries',
      payload: {}, // Missing name
    });
    expect(response.statusCode).toBe(400);
  });

  it('should not create a library with a duplicate name', async () => {
    const libraryName = 'duplicate-lib-test';
    // Create it once
    await app.inject({ method: 'POST', url: '/libraries', payload: { name: libraryName } });
    // Try to create it again
    const response = await app.inject({ method: 'POST', url: '/libraries', payload: { name: libraryName } });
    // Expect conflict or internal server error depending on how manager handles it
    expect([409, 500]).toContain(response.statusCode);
    // Optionally check error message if status code is 500
    if (response.statusCode === 500) {
        const body = JSON.parse(response.body);
        expect(body.error).toMatch(/already exists/i);
    }
  });

  // REMOVED tests for PUT /libraries/current and GET /libraries/current

  it('should get all libraries and include the created one', async () => {
    // First, create a library to ensure there's one to find
    const libraryName = 'find-me-library';
    const libraryDesc = 'Description for find-me';
    const createResponse = await app.inject({
      method: 'POST',
      url: '/libraries',
      payload: { name: libraryName, description: libraryDesc },
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
    // Removed temporary debug logs
    // Verify the created library is present
    expect(libraries.some(lib => lib.id === createdLib.id && lib.name === libraryName && lib.description === libraryDesc)).toBe(true);
  });

  // REMOVED test 'should set and get the current library'
  // REMOVED test 'should get null when no library is set as current'

  it('should delete a library', async () => {
     // 1. Create temporary library
    const tempLibName = `delete-lib-inject-${Date.now()}`;
    const createResponse = await app.inject({
        method: 'POST',
        url: '/libraries',
        payload: { name: tempLibName },
    });
    expect(createResponse.statusCode).toBe(201);
    const tempLib = JSON.parse(createResponse.body) as CreateLibraryResponse;

    // 2. Delete it
    const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/libraries/${tempLib.id}`,
    });
    expect(deleteResponse.statusCode).toBe(204); // Expect success no content

    // 3. Verify it's gone from the list
     const getResponse = await app.inject({ method: 'GET', url: '/libraries' });
     const libraries = JSON.parse(getResponse.body) as LibrarySummary[];
     expect(libraries.some(lib => lib.id === tempLib.id)).toBe(false);
  });


  it('should return 404 when deleting a non-existent library', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/libraries/invalid-id-does-not-exist',
    });
    expect(response.statusCode).toBe(404);
  });

});
