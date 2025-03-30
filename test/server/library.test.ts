import { request } from 'undici';
import * as fs from 'fs';
import { config } from '../../src/server/config';

const API_URL = 'http://localhost:3000';

interface LibrarySummary {
  id: string;
  name: string;
}

interface CreateLibraryResponse extends LibrarySummary {}

interface GetCurrentLibraryResponse {
  currentLibraryId: string | null;
}

describe('Library Routes Tests', () => {
  let mainTestLibraryId: string; // ID for the library used across multiple tests initially

  beforeAll(() => {
    // Use a temporary copy for test isolation
    fs.copyFileSync('test/server/empty-libraries.json', 'test/server/test-libraries.json.copy');
    config.queriesFilePath = 'test/server/test-libraries.json.copy';
    // Ensure the server is likely using this config if restarted, though direct API interaction is preferred
  });

  it('should create a library', async () => {
    const libraryName = 'library-for-testing';
    const createLibraryResponse = await request(API_URL + '/libraries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: libraryName }),
    });

    expect(createLibraryResponse.statusCode).toBe(201);
    const createLibraryData = await createLibraryResponse.body.json() as CreateLibraryResponse;
    expect(createLibraryData).toHaveProperty('id');
    expect(createLibraryData.name).toBe(libraryName);
    mainTestLibraryId = createLibraryData.id; // Store for potential cleanup or cross-test use (though isolation is better)
  });

  it('should not create a library with invalid data (missing name)', async () => {
    const createLibraryResponse = await request(API_URL + '/libraries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}), // Missing name
    });
    expect(createLibraryResponse.statusCode).toBe(400);
  });

  // TODO: Add test for creating duplicate library name (expect 409 or 500 depending on implementation)
  // it('should not create a library with a duplicate name', async () => { ... });

  it('should not set current library with invalid data (missing id)', async () => {
    const setLibraryResponse = await request(API_URL + '/libraries/current', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}), // Missing id
    });
    expect(setLibraryResponse.statusCode).toBe(400);
  });

  it('should not set current library with a non-existent id', async () => {
    const setLibraryResponse = await request(API_URL + '/libraries/current', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'non-existent-id' }),
    });
    // Expect 400 because the manager throws "not found", which the route maps to 400
    expect(setLibraryResponse.statusCode).toBe(400);
  });


  it('should get all libraries and include the created one', async () => {
    // Ensure the first test created the library
    if (!mainTestLibraryId) throw new Error("mainTestLibraryId not set from previous test");

    const getLibrariesResponse = await request(API_URL + '/libraries', {
      method: 'GET',
    });

    expect(getLibrariesResponse.statusCode).toBe(200);
    const getLibrariesData = await getLibrariesResponse.body.json() as LibrarySummary[];
    expect(Array.isArray(getLibrariesData)).toBe(true);
    // Verify the main test library is present
    expect(getLibrariesData.some(lib => lib.id === mainTestLibraryId && lib.name === 'library-for-testing')).toBe(true);
  });

  it('should set and get the current library', async () => {
    // --- Test Setup: Create a dedicated library for this test ---
    const testLibName = `set-get-test-${Date.now()}`;
    let testLibId = '';
    try {
      const createResponse = await request(API_URL + '/libraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: testLibName }),
      });
      expect(createResponse.statusCode).toBe(201);
      const createData = await createResponse.body.json() as CreateLibraryResponse;
      testLibId = createData.id;

      // --- Action 1: Set the library as current ---
      const setLibraryResponse = await request(API_URL + '/libraries/current', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: testLibId }),
      });
      expect(setLibraryResponse.statusCode).toBe(204); // Verify setting worked

      // --- Action 2: Get the current library ---
      const getCurrentLibraryResponse = await request(API_URL + '/libraries/current', {
        method: 'GET',
      });
      expect(getCurrentLibraryResponse.statusCode).toBe(200);
      const getCurrentLibraryData = await getCurrentLibraryResponse.body.json() as GetCurrentLibraryResponse;

      // --- Assertion: Verify the correct library ID is returned ---
      expect(getCurrentLibraryData.currentLibraryId).toBe(testLibId);

    } finally {
      // --- Test Cleanup: Delete the dedicated library ---
      if (testLibId) {
        await request(API_URL + `/libraries/${testLibId}`, { method: 'DELETE' });
      }
    }
  });

  it('should get null when no library is set as current', async () => {
    // Strategy: Create temp lib, set current, delete it, check current is null
    const tempLibName = `temp-lib-${Date.now()}`;
    let tempLibId = '';

    try {
      // 1. Create temporary library
      const createResponse = await request(API_URL + '/libraries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: tempLibName }),
      });
      expect(createResponse.statusCode).toBe(201);
      tempLibId = (await createResponse.body.json() as CreateLibraryResponse).id;

      // 2. Set it as current
      const setResponse = await request(API_URL + '/libraries/current', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: tempLibId }),
      });
      expect(setResponse.statusCode).toBe(204);

      // 3. Delete it (this should trigger the manager to reset current library to null)
      const deleteResponse = await request(API_URL + `/libraries/${tempLibId}`, {
          method: 'DELETE',
      });
      expect(deleteResponse.statusCode).toBe(204);
      tempLibId = ''; // Mark as deleted for cleanup

      // 4. Check current library is now null
      const getCurrentLibraryResponse = await request(API_URL + '/libraries/current', {
        method: 'GET',
      });
      expect(getCurrentLibraryResponse.statusCode).toBe(200);
      const getCurrentLibraryData = await getCurrentLibraryResponse.body.json() as GetCurrentLibraryResponse;
      expect(getCurrentLibraryData.currentLibraryId).toBe(null); // Expect null after deleting the current

    } finally {
        // Cleanup just in case delete failed mid-test
        if (tempLibId) {
            await request(API_URL + `/libraries/${tempLibId}`, { method: 'DELETE' });
        }
    }
  });

  it('should return 404 when deleting a non-existent library', async () => {
    const deleteLibraryResponse = await request(API_URL + `/libraries/invalid-id-does-not-exist`, {
      method: 'DELETE',
    });
    expect(deleteLibraryResponse.statusCode).toBe(404);
  });

  afterAll(async () => {
    // Cleanup the main library created in the first test
    if (mainTestLibraryId) {
      const deleteLibraryResponse = await request(API_URL + `/libraries/${mainTestLibraryId}`, {
        method: 'DELETE',
      });
      // Expect 204 or 404 (if already deleted by another test's cleanup)
      expect([204, 404]).toContain(deleteLibraryResponse.statusCode);
    }
    // Optional: Clean up the temporary file
    try {
        fs.unlinkSync('test/server/test-libraries.json.copy');
    } catch (err) {
        // Ignore errors (e.g., file not found)
    }
  });
});
