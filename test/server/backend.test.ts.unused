import Fastify, { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import { registerBackendRoutes } from '../../src/server/backend'; // Only import routes
// Import storage and types
import { FileSystemBackendStorage, IBackendStorage } from '../../src/server/backendStorage';
import { Backend } from '../../src/types'; // Removed BackendState

// Paths for temporary test storage files
const TEST_BACKEND_STORAGE_PATH = path.join(__dirname, 'test-backends-inject.json');
const EMPTY_BACKENDS_PATH = path.join(__dirname, 'empty-backends.json'); // Source for clean state

// Helper function to build the Fastify app for testing
async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false }); // Disable logger for cleaner test output

  // Use temporary copy for test isolation
  fs.copyFileSync(EMPTY_BACKENDS_PATH, TEST_BACKEND_STORAGE_PATH);

  // --- Create test-specific storage instance ---
  const backendStorage: IBackendStorage = new FileSystemBackendStorage(TEST_BACKEND_STORAGE_PATH);
  // No need to manipulate global state anymore
  // ---------------------------------------------

  // Decorate the app instance with the storage
  app.decorate('backendStorage', backendStorage);

  // Register only the backend routes
  await app.register(registerBackendRoutes);

  await app.ready(); // Ensure all plugins are loaded

  return app;
}

describe('Backend Routes Tests (Inject)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // Build a fresh app instance for each test
    app = await buildTestApp();
  });

  afterEach(async () => {
    // Close the Fastify instance
    await app.close();
    // Clean up the temporary storage file
    try {
      fs.unlinkSync(TEST_BACKEND_STORAGE_PATH);
    } catch (err) {
      // Ignore errors
    }
    // No need to reset global state
  });

  it('should add a backend and return it (excluding credentials)', async () => {
    const backendName = 'wikidata-test';
    const backendEndpoint = 'https://query.wikidata.org/sparql';
    const response = await app.inject({
      method: 'POST',
      url: '/backends', // Corrected URL
      payload: {
        name: backendName,
        endpoint: backendEndpoint
      }
    });

    expect(response.statusCode).toBe(201); // Expect 201 Created
    const body = JSON.parse(response.payload) as Partial<Backend>; // Use Partial for safety
    expect(body).toHaveProperty('id');
    expect(typeof body.id).toBe('string');
    expect(body.name).toBe(backendName);
    expect(body.endpoint).toBe(backendEndpoint);
    expect(body).not.toHaveProperty('username'); // Ensure credentials aren't returned
    expect(body).not.toHaveProperty('password');

    // Verification via API is preferred over checking internal state
  });

   it('should list backends (excluding credentials)', async () => {
    // First, add a backend
    const backendName = 'dbpedia-test';
    const backendEndpoint = 'https://dbpedia.org/sparql';
    const addResponse = await app.inject({
      method: 'POST',
      url: '/backends',
      payload: {
        name: backendName,
        endpoint: backendEndpoint,
        username: 'user', // Add credentials to test filtering
        password: 'pass'
      }
    });
    expect(addResponse.statusCode).toBe(201); // Should be 201
    const addedBackend = JSON.parse(addResponse.payload) as Backend;
    const id = addedBackend.id; // Get ID from response

     // Then, list the backends
    const listResponse = await app.inject({
      method: 'GET',
      url: '/backends', // Corrected URL
    });

    expect(listResponse.statusCode).toBe(200);
    const backends = JSON.parse(listResponse.payload) as Partial<Backend>[]; // Use Partial as credentials are removed
    expect(Array.isArray(backends)).toBe(true);
    const listedBackend = backends.find(b => b.id === id);
    expect(listedBackend).toBeDefined();
    expect(listedBackend).toEqual(
      expect.objectContaining({
        id: id,
        name: backendName,
        endpoint: backendEndpoint
      })
    );
    // Ensure credentials are NOT present
    expect(listedBackend).not.toHaveProperty('username');
    expect(listedBackend).not.toHaveProperty('password');
  });

  it('should get a specific backend by ID (excluding credentials)', async () => {
    // First, add a backend
    const backendName = 'specific-test';
    const backendEndpoint = 'https://specific.example.com/sparql';
    const addResponse = await app.inject({
      method: 'POST',
      url: '/backends',
      payload: { name: backendName, endpoint: backendEndpoint, username: 'test', password: 'pwd' }
    });
    expect(addResponse.statusCode).toBe(201); // Corrected expectation to 201 Created
    const { id } = JSON.parse(addResponse.payload);

    // Then, get the backend by ID
    const getResponse = await app.inject({
      method: 'GET',
      url: `/backends/${id}`, // Corrected URL
    });

    expect(getResponse.statusCode).toBe(200);
    const backend = JSON.parse(getResponse.payload) as Partial<Backend>;
    expect(backend.id).toBe(id);
    expect(backend.name).toBe(backendName);
    expect(backend.endpoint).toBe(backendEndpoint);
    expect(backend).not.toHaveProperty('username');
    expect(backend).not.toHaveProperty('password');
  });

  it('should return 404 when getting a non-existent backend ID', async () => {
    const getResponse = await app.inject({
      method: 'GET',
      url: '/backends/non-existent-backend-id',
    });
    expect(getResponse.statusCode).toBe(404);
  });

  // REMOVED tests for PUT /backends/current and GET /backends/current

  it('should update a backend', async () => {
     // First, add a backend
    const backendName = 'update-test';
    const backendEndpoint = 'https://update.example.com/sparql';
    const addResponse = await app.inject({
      method: 'POST',
      url: '/backends',
      payload: { name: backendName, endpoint: backendEndpoint }
    });
    expect(addResponse.statusCode).toBe(201);
    const addedBackend = JSON.parse(addResponse.payload) as Backend;
    const id = addedBackend.id;

    // Then, update it
    const updatedName = 'updated-name';
    const updatedDesc = 'Now has description';
    const updateResponse = await app.inject({
        method: 'PUT',
        url: `/backends/${id}`,
        payload: { name: updatedName, description: updatedDesc } // Partial update
    });
    expect(updateResponse.statusCode).toBe(200);
    const updatedBody = JSON.parse(updateResponse.payload) as Partial<Backend>;
    expect(updatedBody.id).toBe(id);
    expect(updatedBody.name).toBe(updatedName);
    expect(updatedBody.description).toBe(updatedDesc);
    expect(updatedBody.endpoint).toBe(backendEndpoint); // Endpoint should remain unchanged

    // Verify by getting again
    const getResponse = await app.inject({ method: 'GET', url: `/backends/${id}` });
    const getBody = JSON.parse(getResponse.payload) as Partial<Backend>;
    expect(getBody.name).toBe(updatedName);
    expect(getBody.description).toBe(updatedDesc);
  });

   it('should return 404 when updating a non-existent backend', async () => {
    const updateResponse = await app.inject({
        method: 'PUT',
        url: '/backends/non-existent-update-id',
        payload: { name: 'wont-work' }
    });
    expect(updateResponse.statusCode).toBe(404);
  });


  it('should delete a backend', async () => {
    // First, add a backend
    const backendName = 'delete-test';
    const backendEndpoint = 'https://delete.example.com/sparql';
    const addResponse = await app.inject({
      method: 'POST',
      url: '/backends',
      payload: { name: backendName, endpoint: backendEndpoint }
    });
    expect(addResponse.statusCode).toBe(201); // Should be 201
    const addedBackend = JSON.parse(addResponse.payload) as Backend;
    const id = addedBackend.id; // Get ID from response

     // Then, delete the backend
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/backends/${id}`,
    });

    expect(deleteResponse.statusCode).toBe(204); // Expect 204 No Content

    // Verify that the backend is no longer in the list
    const listResponse = await app.inject({
      method: 'GET',
      url: '/backends',
    });
    expect(listResponse.statusCode).toBe(200);
    const backends = JSON.parse(listResponse.payload) as Backend[];
    expect(backends.find(b => b.id === id)).toBeUndefined();

    // No need to verify internal state
  });

  it('should return 404 when deleting a non-existent backend', async () => {
    // Attempt to delete an ID that doesn't exist
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/backends/non-existent-delete-id`,
    });

    // The refactored route returns 404 if deleteBackend returns false
    expect(deleteResponse.statusCode).toBe(404);
   });
});
